<template>
  <section class="f3d-timeseries">
    <p v-if="loading" class="f3d-muted">Zeitreihen werden geladen …</p>
    <template v-else>
      <div v-for="chart in charts" :key="chart.id" class="f3d-zeitblock">
        <UPlotChart :title="chart.title" :series="chart.series"
                    :ylabel="chart.ylabel" :height="260"
                    sync-key="f3d-zeit"
                    @cursor-time="(t) => (store.currentTime = t)">
          <template #kopf>
            <KennwertHilfe v-if="chart.hilfe" :groesse="chart.hilfe" />
          </template>
        </UPlotChart>
      </div>
      <p v-if="!charts.length" class="f3d-muted">
        Keine Zeitreihen für die ausgewählten Läufe.
      </p>
    </template>
  </section>
</template>

<script setup>
// Zeitreihenpanel (Spez. Kap. 8): Wasserstände, Durchflüsse und Kräfte der
// ausgewählten Läufe übereinandergelegt. Gemeinsamer Zeitcursor über
// cursor.sync; der Cursor schreibt zusätzlich store.currentTime, an dem
// später Grundriss/Schnitt/3D hängen. Grenzwerte aus den Nachweiskriterien
// werden als gestrichelte Linien eingezeichnet.
import { ref, watchEffect } from 'vue'
import { usePostStore, LIMIT_COLOR } from '../../stores/usePostStore'
import KennwertHilfe from './KennwertHilfe.vue'
import UPlotChart from './UPlotChart.vue'

const store = usePostStore()
const charts = ref([])
const loading = ref(false)

const GROUPS = [
  { id: 'level', quantity: 'level', component: '', title: 'Wasserspiegellage je Pegelpunkt', ylabel: 'Wasserspiegel in m', hilfe: 'level' },
  { id: 'discharge', quantity: 'discharge', component: '', title: 'Durchfluss je Querschnitt', ylabel: 'Durchfluss in m³/s', hilfe: 'discharge' },
  { id: 'energy', quantity: 'energy_head', component: '', title: 'Energiehöhe je Querschnitt', ylabel: 'Energiehöhe in m', hilfe: 'energy_head' },
  { id: 'cd', quantity: 'overfall_cd', component: '', title: 'Überfallbeiwert je Wehr', ylabel: 'C_d (–)', hilfe: 'overfall_cd' },
  { id: 'force', quantity: 'force', component: 'magnitude', title: 'Kraftbetrag je Bauteil', ylabel: 'Kraft in kN', scale: 1e-3, hilfe: 'force' },
  { id: 'moment', quantity: 'moment', component: 'magnitude', title: 'Momentbetrag je Bauteil', ylabel: 'Moment in kN·m', scale: 1e-3, hilfe: 'moment' },
  { id: 'tracer', quantity: 'tracer', component: '', title: 'Markierungsstoff am Ablauf', ylabel: 'Anteil (–)', hilfe: 'T' },
  { id: 'shear', quantity: 'bed_shear', component: 'max', title: 'Schubspannung je Bauwerk (max.)', ylabel: 'τ in N/m²', hilfe: 'bed_shear' },
]

function levelLimits(results) {
  // je Pegelpunkt der schärfste Grenzwert aus max_level-Targets
  const limits = new Map()
  for (const result of results) {
    for (const t of result?.targets ?? []) {
      if (t.kind === 'max_level' && t.limit_max != null) {
        const prev = limits.get(t.at ?? t.id)
        limits.set(t.at ?? t.id, prev == null ? t.limit_max : Math.min(prev, t.limit_max))
      }
    }
  }
  return limits
}

watchEffect(async () => {
  const ids = [...store.selectedRunIds]
  if (!ids.length) { charts.value = []; return }
  loading.value = true
  try {
    const results = await Promise.all(
      ids.map((id) => store.ensureResult(id).catch(() => null)))
    const built = []

    for (const g of GROUPS) {
      const series = []
      let tMin = Infinity
      let tMax = -Infinity
      for (const runId of ids) {
        const runSeries = await store.ensureSeries(runId, g.quantity, g.component)
          .catch(() => [])
        for (const s of runSeries) {
          if (!s.t.length) continue
          tMin = Math.min(tMin, s.t[0])
          tMax = Math.max(tMax, s.t[s.t.length - 1])
          series.push({
            label: ids.length > 1 ? `${s.location_id} · ${runId}` : s.location_id,
            t: s.t,
            v: g.scale ? s.v.map((x) => x * g.scale) : s.v,
            color: store.locationColor(s.location_id),
            dash: store.runDash(runId),
          })
        }
      }
      if (g.id === 'level' && series.length) {
        for (const [gauge, limit] of levelLimits(results)) {
          series.push({
            label: `Grenzwert ${gauge}`,
            t: [tMin, tMax],
            v: [limit, limit],
            color: LIMIT_COLOR,
            dash: [4, 4],
            width: 1,
          })
        }
      }
      if (series.length) built.push({ ...g, series })
    }
    charts.value = built
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.f3d-zeitblock { position: relative; }

.f3d-timeseries { display: flex; flex-direction: column; gap: 14px; }
</style>
