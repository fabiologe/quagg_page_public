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
            <dd :class="Math.abs(e.dv) > 0.05 * Math.max(e.zu, 1e-9) ? 'warn' : 'good'">
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
import { flood3dApi } from '../../services/api'
import KennwertHilfe from './KennwertHilfe.vue'
import UPlotChart from './UPlotChart.vue'

const store = usePostStore()
const entries = ref([])

// Steigung einer Reihe über das letzte Stück ihrer Zeitachse
function steigung(t, v, anteil = 0.25) {
  if (!t || t.length < 3) return null
  const tEnde = t[t.length - 1]
  const tStart = tEnde - (tEnde - t[0]) * anteil
  const i0 = t.findIndex((x) => x >= tStart)
  const dt = tEnde - t[i0]
  if (!(dt > 0)) return null
  return (v[v.length - 1] - v[i0]) / dt
}

// Erster Zeitpunkt, ab dem sich der Ablauf über ein gleitendes Fenster um
// weniger als `toleranz` ändert — und danach nicht wieder ausbricht.
function beharrungAb(t, q, toleranz = 0.02) {
  if (!t || t.length < 10) return null
  const qEnde = q[q.length - 1]
  if (!(Math.abs(qEnde) > 1e-9)) return null
  const spaet = t[0] + (t[t.length - 1] - t[0]) * 0.9
  for (let i = 0; i < q.length; i++) {
    let stabil = true
    for (let j = i; j < q.length; j++) {
      if (Math.abs(q[j] - qEnde) / Math.abs(qEnde) > toleranz) { stabil = false; break }
    }
    // Ein Wert aus dem letzten Zehntel heißt nur, dass sich die Reihe kurz
    // vor Schluss nicht mehr ändert — das ist keine Beharrung, sondern
    // der Endpunkt selbst.
    if (stabil) return t[i] < spaet ? t[i] : null
  }
  return null
}

function zuflussAusSpec(spec) {
  let q = 0
  for (const b of spec?.boundaries ?? []) {
    if (b.type === 'inflow_constant') q += b.q ?? 0
  }
  return q
}

async function laden() {
  const ids = store.selectedRunIds
  const out = []
  for (const runId of ids) {
    try {
      const [bal, detail] = await Promise.all([
        store.ensureBalance(runId), flood3dApi.runDetail(runId)])
      const vol = bal.volume ?? { t: [], v: [] }
      if (!vol.t?.length) throw new Error('Der Lauf enthält keine Volumenreihe.')

      // Zufluss: gemessene Randflüsse, sonst die Vorgabe aus dem Fall
      const caseId = (detail?.manifest?.case_id) ?? runId.replace(/_r\d+$/, '')
      let spec = null
      try { spec = await flood3dApi.getCase(caseId) } catch { /* alter Lauf */ }
      const zuSpec = zuflussAusSpec(spec)

      let rand = []
      try {
        rand = (await flood3dApi.series(runId, 'discharge')).series ?? []
      } catch { /* keine Reihen */ }
      const patchIds = new Set((spec?.boundaries ?? []).map((b) => b.patch))
      const gemessen = rand.filter((s) => patchIds.has(s.location_id))
      const zuMess = gemessen.filter((s) => (spec.boundaries
        .find((b) => b.patch === s.location_id)?.type ?? '').startsWith('inflow'))
      const abMess = gemessen.filter((s) => (spec.boundaries
        .find((b) => b.patch === s.location_id)?.type ?? '').startsWith('outflow'))

      const dv = steigung(vol.t, vol.v) ?? 0
      const summe = (liste) => (liste.length
        ? liste.reduce((a, s) => a + Math.abs(s.v[s.v.length - 1]), 0) : null)
      const zu = summe(zuMess) ?? zuSpec
      const abGemessen = abMess.length > 0
      const ab = abGemessen ? summe(abMess) : Math.max(zu - dv, 0)

      // Reihen fürs Diagramm: Speicheränderung als gleitende Steigung
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

      const qAb = charts[1].v
      const tBeharrung = beharrungAb(vol.t, qAb)
      const dauer = vol.t[vol.t.length - 1]
      const volumen = vol.v[vol.v.length - 1]
      const austausch = volumen > 0 && zu > 0 ? (zu * dauer) / volumen : null

      const anteil = zu > 0 ? Math.abs(dv) / zu : 0
      let ampel
      if (anteil > 0.1) {
        ampel = { cls: 'bad', text: 'nicht eingeschwungen',
          hinweis: `Das Wasservolumen wächst am Ende noch mit ${fmt(dv)} m³/s, `
            + `also ${(anteil * 100).toFixed(0)} % des Zuflusses. Der Lauf zeigt `
            + 'den Füllvorgang, nicht den Betriebszustand — länger rechnen oder '
            + 'mit einem höheren Anfangswasserspiegel starten.' }
      } else if (anteil > 0.02) {
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
        tBeharrung, austausch })
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
