<template>
  <section class="f3d-bilanz">
    <article v-for="e in entries" :key="e.runId" class="f3d-card">
      <header class="f3d-card-head">
        <h3>{{ e.runId }}</h3>
        <span class="f3d-ampel" :class="e.ampel.cls">{{ e.ampel.text }}</span>
      </header>

      <p v-if="e.error" class="f3d-error">{{ e.error }}</p>
      <template v-else>
        <dl class="f3d-stats">
          <div class="f3d-stat">
            <dt>Zufluss <KennwertHilfe groesse="discharge" :wert="e.zu" /></dt>
            <dd>{{ fmt(e.zu) }} m³/s</dd>
          </div>
          <div class="f3d-stat">
            <dt>Ablauf{{ e.abGemessen ? '' : ' (abgeleitet)' }}</dt>
            <dd>{{ fmt(e.ab) }} m³/s</dd>
          </div>
          <div class="f3d-stat">
            <dt>Speicheränderung
              <KennwertHilfe groesse="speicher" :wert="e.dv" /></dt>
            <dd :class="Math.abs(e.dv) > (e.swWarn ?? 0.02) * Math.max(e.zu, 1e-9) ? 'warn' : 'good'">
              {{ e.dv >= 0 ? '+' : '' }}{{ fmt(e.dv) }} m³/s
            </dd>
          </div>
          <div class="f3d-stat">
            <dt>Wasservolumen
              <KennwertHilfe groesse="volume" :wert="e.volumen" /></dt>
            <dd>{{ fmt(e.volumen) }} m³</dd>
          </div>
          <div class="f3d-stat">
            <dt>Beharrung erreicht bei</dt>
            <dd>{{ e.tBeharrung == null ? 'nicht erreicht' : `${fmt(e.tBeharrung)} s` }}</dd>
          </div>
          <div class="f3d-stat">
            <dt>Ausgetauschtes Volumen</dt>
            <dd>{{ e.austausch == null ? '–' : `${fmt(e.austausch)} ×` }}</dd>
          </div>
        </dl>

        <p class="f3d-muted f3d-small">{{ e.ampel.hinweis }}</p>

        <UPlotChart :title="`Wasserbilanz ${e.runId}`" :series="e.charts"
                    ylabel="m³/s" :height="240" sync-key="f3d-bilanz" />
      </template>
    </article>

    <p v-if="!entries.length" class="f3d-muted">Keinen Lauf gewählt.</p>
  </section>
</template>

<script setup>
// Wasserbilanz eines Laufs: Zufluss − Ablauf = Speicheränderung.
//
// Das ist die Frage, die vor jeder Auswertung steht: rechnet der Lauf noch
// am Auffüllen oder ist er eingeschwungen? Ein Lauf, dessen Wasservolumen
// noch mit mehreren m³/s wächst, zeigt keinen Betriebszustand — man
// bewertet dann den Füllvorgang und wundert sich über zu kleine
// Geschwindigkeiten.
//
// Die Speicheränderung kommt aus der Volumenreihe (die jeder Lauf hat).
// Der Ablauf wird gemessen, wenn der Lauf Randflüsse mitschreibt; ältere
// Läufe kennen die noch nicht, dort folgt er aus der Bilanz
// Ablauf = Zufluss − dV/dt und ist als „abgeleitet" gekennzeichnet.
import { ref, watchEffect } from 'vue'
import { usePostStore, SERIES_COLORS } from '../../stores/usePostStore'
import { fmt } from '../../utils/labels'
import { bilanzSchwellen } from '../../utils/grenzwerte'
import KennwertHilfe from './KennwertHilfe.vue'
import UPlotChart from './UPlotChart.vue'

const store = usePostStore()
const entries = ref([])

async function laden() {
  const ids = store.selectedRunIds
  const out = []
  for (const runId of ids) {
    try {
      const bal = await store.ensureBalance(runId)
      const vol = bal.volume ?? { t: [], v: [] }
      if (!vol.t?.length) throw new Error('Der Lauf enthält keine Volumenreihe.')

      // Die Zahlen kommen aus der Auswertung des Servers
      // (evaluate.kennwerte["bilanz"]) — dieselbe Definition wie das
      // Kriterium „massenbilanz". Bis 2026-09-23 rechnete das Panel sie
      // selbst (Zufluss = letzter Wert statt Mittel des End-Viertels) und
      // konnte dem Nachweis widersprechen (Fahrplan B3c).
      const result = await store.ensureResult(runId).catch(() => null)
      const kb = result?.kennwerte?.bilanz
      if (!kb) throw new Error('Die Auswertung enthält keine Wasserbilanz.')
      const zu = kb.zufluss ?? 0
      const dv = kb.speicheraenderung ?? 0
      const abGemessen = kb.ablauf_gemessen != null
      const ab = abGemessen ? kb.ablauf_gemessen : kb.ablauf_aus_bilanz
      const tBeharrung = kb.beharrung_ab ?? null
      const austausch = kb.austausch ?? null
      const volumen = vol.v[vol.v.length - 1]
      const anteil = kb.anteil ?? 0

      // Diagramm: Anzeige der Rohreihen (Speicheränderung als gleitende
      // Steigung über fünf Proben)
      const dvReihe = vol.t.map((_, i) => {
        const i0 = Math.max(0, i - 5)
        const dt = vol.t[i] - vol.t[i0]
        return dt > 0 ? (vol.v[i] - vol.v[i0]) / dt : 0
      })
      const charts = [
        { label: 'Zufluss', color: SERIES_COLORS[0],
          t: vol.t, v: vol.t.map(() => zu) },
        { label: abGemessen ? 'Ablauf (gemessen)' : 'Ablauf (aus der Bilanz)',
          color: SERIES_COLORS[1],
          t: vol.t, v: vol.t.map((_, i) => Math.max(zu - dvReihe[i], 0)) },
        { label: 'Speicheränderung', color: SERIES_COLORS[2],
          t: vol.t, v: dvReihe },
      ]

      // Schwellen aus dem massenbilanz-Kriterium des Falls, sonst
      // Vorbelegung — eine Quelle statt Panel-Literale (Audit U15)
      const sw = bilanzSchwellen(result)
      let ampel
      if (anteil > sw.schlecht) {
        ampel = { cls: 'bad', text: 'nicht eingeschwungen',
          hinweis: `Das Wasservolumen wächst am Ende noch mit ${fmt(dv)} m³/s, `
            + `also ${(anteil * 100).toFixed(0)} % des Zuflusses. Der Lauf zeigt `
            + 'den Füllvorgang, nicht den Betriebszustand — länger rechnen oder '
            + 'mit einem höheren Anfangswasserspiegel starten.' }
      } else if (anteil > sw.warn) {
        ampel = { cls: 'warn', text: 'fast eingeschwungen',
          hinweis: `Der Speicher ändert sich noch um ${(anteil * 100).toFixed(0)} % `
            + 'des Zuflusses. Für Durchfluss- und Pegelaussagen vertretbar, für '
            + 'Kräfte und Sohlschubspannung besser noch etwas weiterrechnen.' }
      } else {
        ampel = { cls: 'good', text: 'eingeschwungen',
          hinweis: 'Zufluss und Ablauf halten sich die Waage — die Auswertung '
            + 'beschreibt einen Beharrungszustand.' }
      }

      out.push({ runId, zu, ab, dv, volumen, abGemessen, charts, ampel,
        swWarn: sw.warn, tBeharrung, austausch })
    } catch (e) {
      out.push({ runId, error: e.message,
        ampel: { cls: '', text: '', hinweis: '' } })
    }
  }
  entries.value = out
}

watchEffect(laden)
</script>

<style scoped>
.f3d-bilanz {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  overflow: auto;
}
.f3d-ampel {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  border: 1px solid currentColor;
}
.f3d-ampel.good { color: var(--f3d-good); }
.f3d-ampel.warn { color: var(--f3d-warn); }
.f3d-ampel.bad { color: var(--f3d-bad); }
.f3d-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: 0.5rem 1rem;
  margin: 0.5rem 0;
}
.f3d-stat dt { font-size: 0.74rem; opacity: 0.75; }
.f3d-stat dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-size: 1.05rem;
}
.f3d-stat dd.good { color: var(--f3d-good); }
.f3d-stat dd.warn { color: var(--f3d-warn); }
</style>
