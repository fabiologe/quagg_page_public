<template>
  <section class="f3d-verweil">
    <article v-for="e in entries" :key="e.runId" class="f3d-card">
      <header class="f3d-card-head">
        <h3>{{ e.runId }}</h3>
        <span v-if="e.bewertung" class="f3d-ampel" :class="e.bewertung.cls">
          {{ e.bewertung.text }}
        </span>
      </header>

      <p v-if="e.error" class="f3d-error">{{ e.error }}</p>
      <template v-else>
        <dl class="f3d-stats">
          <div class="f3d-stat">
            <dt>Rechnerische Verweilzeit τ = V/Q
              <KennwertHilfe groesse="verweilzeit" :wert="e.tau" /></dt>
            <dd>{{ fmt(e.tau) }} s</dd>
          </div>
          <div class="f3d-stat">
            <dt>t₁₀ (erste 10 %)</dt>
            <dd>{{ e.t10 == null ? 'nicht erreicht' : `${fmt(e.t10)} s` }}</dd>
          </div>
          <div class="f3d-stat">
            <dt>t₅₀ (Median)</dt>
            <dd>{{ e.t50 == null ? 'nicht erreicht' : `${fmt(e.t50)} s` }}</dd>
          </div>
          <div class="f3d-stat">
            <dt>t₉₀</dt>
            <dd>{{ e.t90 == null ? 'nicht erreicht' : `${fmt(e.t90)} s` }}</dd>
          </div>
          <div class="f3d-stat">
            <dt>Kurzschluss-Kennzahl t₁₀/τ
              <KennwertHilfe groesse="verweilzeit" /></dt>
            <dd :class="e.kurz == null ? '' : (e.kurz < e.schwellen.schlecht ? 'bad' : e.kurz < e.schwellen.gut ? 'warn' : 'good')">
              {{ e.kurz == null ? '–' : fmt(e.kurz) }}
            </dd>
          </div>
          <div class="f3d-stat">
            <dt>Erster Durchbruch</dt>
            <dd>{{ e.tAn == null ? 'nicht erreicht' : `${fmt(e.tAn)} s` }}</dd>
          </div>
        </dl>

        <p class="f3d-muted f3d-small">{{ e.bewertung.hinweis }}</p>

        <UPlotChart :title="`Durchbruchskurve ${e.runId}`" :series="e.charts"
                    ylabel="Markierungsstoff (–)" :height="240"
                    sync-key="f3d-verweil" />

        <p class="f3d-muted f3d-small">
          Ab t = 0 tritt markiertes Wasser mit dem Zufluss ein. Die Kurve zeigt
          seinen Anteil am Ablauf: Sie steigt, sobald das erste frische Wasser
          ankommt, und erreicht 1, wenn das gesamte Altwasser verdrängt ist.
          Weit vor τ ansteigend heißt Kurzschluss, ein langer flacher Schwanz
          heißt schlecht durchströmte Ecken.
        </p>
      </template>
    </article>

    <p v-if="!entries.length" class="f3d-muted">Keinen Lauf gewählt.</p>
    <p v-if="entries.length && entries.every((e) => e.leer)" class="f3d-muted">
      Für diese Läufe wurde kein Markierungsstoff mitgerechnet — in der Phase
      „Simulation“ die Verweilzeit einschalten und neu rechnen.
    </p>
  </section>
</template>

<script setup>
// Verweilzeit eines Beckens aus der Durchbruchskurve eines mitgerechneten
// Markierungsstoffs.
//
// Für ein Regenbecken ist das die eigentliche Frage: Wie lange bleibt das
// Wasser? Läuft ein Teil direkt vom Zulauf zum Ablauf durch (Kurzschluss)?
// Wie groß ist das Volumen, das praktisch nie durchströmt wird? Die
// Hydraulik allein beantwortet das nicht — man sieht schnelle und langsame
// Bereiche, aber nicht, wie sie zusammenwirken.
import { ref, watchEffect } from 'vue'
import { usePostStore, SERIES_COLORS } from '../../stores/usePostStore'
import { fmt } from '../../utils/labels'
import { flood3dApi } from '../../services/api'
import { kurzschlussSchwellen } from '../../utils/grenzwerte'
import KennwertHilfe from './KennwertHilfe.vue'
import UPlotChart from './UPlotChart.vue'

const store = usePostStore()
const entries = ref([])

// Erster Zeitpunkt, an dem die Kurve den Anteil f überschreitet
function zeitBei(t, v, f) {
  for (let i = 0; i < v.length; i++) {
    if (v[i] >= f) {
      if (i === 0) return t[0]
      // linear zwischen den Stützstellen, damit t50 nicht auf das
      // Ausgabeintervall gerundet wird
      const d = v[i] - v[i - 1]
      const anteil = d > 1e-12 ? (f - v[i - 1]) / d : 0
      return t[i - 1] + (t[i] - t[i - 1]) * anteil
    }
  }
  return null
}

async function laden() {
  const out = []
  for (const runId of store.selectedRunIds) {
    try {
      const reihen = (await flood3dApi.series(runId, 'tracer')).series ?? []
      if (!reihen.length) {
        out.push({ runId, leer: true, error: '',
          bewertung: { cls: '', text: '', hinweis: '' },
          charts: [] })
        continue
      }
      const bal = await store.ensureBalance(runId)
      // Schwellen aus dem FALL-Kriterium (kurzschluss.limit_min), sonst
      // Vorbelegung — eine Quelle statt Panel-Literale (Audit U15)
      const result = await store.ensureResult(runId).catch(() => null)
      const schwellen = kurzschlussSchwellen(result)
      const vol = bal.volume ?? { t: [], v: [] }

      const caseId = runId.replace(/_r\d+$/, '')
      let zu = 0
      try {
        const spec = await flood3dApi.getCase(caseId)
        for (const b of spec.boundaries ?? []) {
          if (b.type === 'inflow_constant') zu += b.q ?? 0
        }
      } catch { /* alter Lauf ohne Fall */ }

      // τ = V/Q mit dem mittleren Wasservolumen des Laufs
      const volMittel = vol.v?.length
        ? vol.v.reduce((a, x) => a + x, 0) / vol.v.length : 0
      const tau = zu > 0 ? volMittel / zu : null

      const haupt = reihen[0]
      const t = haupt.t
      const v = haupt.v
      const tAn = zeitBei(t, v, 0.01)
      const t10 = zeitBei(t, v, 0.1)
      const t50 = zeitBei(t, v, 0.5)
      const t90 = zeitBei(t, v, 0.9)
      const kurz = t10 != null && tau ? t10 / tau : null

      const charts = reihen.map((s, i) => ({
        label: `Ablauf ${s.location_id}`, color: SERIES_COLORS[i % 5],
        t: s.t, v: s.v,
      }))
      if (tau) {
        charts.push({ label: 'τ = V/Q', color: '#e66767', dash: [5, 4],
          width: 1, t: [tau, tau], v: [0, 1] })
      }

      let bewertung
      if (v[v.length - 1] < 0.85) {
        bewertung = { cls: 'warn', text: 'Kurve nicht ausgelaufen',
          hinweis: `Am Ende sind erst ${(v[v.length - 1] * 100).toFixed(0)} % `
            + 'markiertes Wasser am Ablauf. Für belastbare Kennwerte sollte '
            + 'die Kurve über 0,9 laufen — das dauert erfahrungsgemäß zwei '
            + 'bis drei rechnerische Verweilzeiten.' }
      } else if (kurz != null && kurz < schwellen.schlecht) {
        bewertung = { cls: 'bad', text: 'Kurzschlussströmung',
          hinweis: `Die ersten 10 % erreichen den Ablauf schon nach `
            + `${(kurz * 100).toFixed(0)} % der rechnerischen Verweilzeit. Ein `
            + 'Teil des Zuflusses läuft praktisch direkt durch; für die '
            + 'Absetzwirkung zählt dieser Anteil nicht mit. Abhilfe: '
            + 'Tauchwand, Umlenkung oder Zulauf verlegen.' }
      } else if (kurz != null && kurz < schwellen.gut) {
        bewertung = { cls: 'warn', text: 'teilweise Kurzschluss',
          hinweis: 'Ein Teil des Wassers nimmt eine deutlich kürzere Bahn '
            + 'als die mittlere. Vertretbar, aber verbesserbar.' }
      } else {
        bewertung = { cls: 'good', text: 'gleichmäßig durchströmt',
          hinweis: 'Der Zufluss verteilt sich gut über das Becken — die '
            + 'nutzbare Verweilzeit kommt der rechnerischen nahe.' }
      }

      out.push({ runId, tau, t10, t50, t90, tAn, kurz, charts, bewertung,
        schwellen, leer: false })
    } catch (e) {
      out.push({ runId, error: e.message, leer: false, charts: [],
        bewertung: { cls: '', text: '', hinweis: '' } })
    }
  }
  entries.value = out
}

watchEffect(laden)
</script>

<style scoped>
.f3d-verweil {
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
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
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
.f3d-stat dd.bad { color: var(--f3d-bad); }
</style>
