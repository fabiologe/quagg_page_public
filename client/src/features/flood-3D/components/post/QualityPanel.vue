<template>
  <section class="f3d-quality">
    <!-- Kennzahlen je Lauf: beantwortet zuerst, ob der Lauf verwertbar ist -->
    <div class="f3d-quality-tiles">
      <article v-for="entry in entries" :key="entry.runId" class="f3d-card">
        <header class="f3d-card-head"><h3>{{ entry.runId }}</h3></header>
        <p v-if="entry.error" class="f3d-error">{{ entry.error }}</p>
        <dl v-else class="f3d-stats">
          <div v-for="stat in entry.stats" :key="stat.label" class="f3d-stat">
            <dt>
              {{ stat.label }}
              <KennwertHilfe v-if="stat.hilfe" :groesse="stat.hilfe"
                             :wert="stat.roh" />
            </dt>
            <dd :class="stat.cls">{{ stat.value }}</dd>
          </div>
        </dl>
        <!-- Befunde: Qualitätszahlen als lesbare Aussagen statt vergrabener
             Manifest-Werte (r007: y+ 81.201, Courant 2,24, 32 % Viz-Fehler
             — alles unsichtbar). Gleiche Optik wie die Fall-Prüfung. -->
        <ul v-if="entry.befunde?.length" class="f3d-findings">
          <li v-for="(b, i) in entry.befunde" :key="i"
              class="f3d-finding" :class="`sev-${b.severity}`">
            <span class="f3d-finding-icon">{{ b.severity === 'fehler' ? '✗'
              : b.severity === 'warnung' ? '⚠' : 'ⓘ' }}</span>
            {{ b.message }}
          </li>
        </ul>
      </article>
    </div>

    <UPlotChart v-for="chart in charts" :key="chart.id"
                :title="chart.title" :series="chart.series"
                :ylabel="chart.ylabel" :log-y="chart.logY" :height="220"
                sync-key="f3d-qualitaet" />
  </section>
</template>

<script setup>
// Qualitätsansicht (Spez. Kap. 8): Massenbilanz, Residuen, Courant-Zahl,
// Zeitschrittweite und Volumen. In den Diagrammen dieser Ansicht ist der
// Lauf die unterscheidende Größe und bekommt die Farbe; mean/max bzw.
// Feldnamen werden über das Strichmuster getrennt.
import { ref, watchEffect } from 'vue'
import { flood3dApi } from '../../services/api'
import { GRENZWERTE, VORBELEGUNG } from '../../utils/grenzwerte'
import { usePostStore, SERIES_COLORS } from '../../stores/usePostStore'
import { fmt } from '../../utils/labels'
import KennwertHilfe from './KennwertHilfe.vue'
import UPlotChart from './UPlotChart.vue'

const store = usePostStore()
const entries = ref([])
const charts = ref([])

function stats(quality, manifest = null) {
  const mb = quality.mass_balance_error_rel_max
  const res = quality.residual_p_rgh_final ?? quality.residual_p_rgh_initial
  return [
    {
      label: 'Massenbilanzfehler (rel., max.)',
      hilfe: 'massenbilanz', roh: mb,
      value: mb != null ? fmt(mb) : '–',
      cls: mb != null && mb > 0.01 ? 'bad' : 'good',
    },
    { label: 'Residuum p_rgh', value: res != null ? fmt(res) : '–', cls: '',
      hilfe: 'residual', roh: res },
    { label: 'Courant-Zahl (Mittel)', value: fmt(quality.courant_mean), cls: '',
      hilfe: 'courant', roh: quality.courant_mean },
    {
      label: 'Courant-Zahl (max.)',
      value: fmt(quality.courant_max),
      cls: quality.courant_max > 1 ? 'bad' : '',
      hilfe: 'courant', roh: quality.courant_max,
    },
    {
      label: 'checkMesh',
      value: quality.checkmesh_ok == null ? '–' : (quality.checkmesh_ok ? 'in Ordnung' : 'fehlgeschlagen'),
      cls: quality.checkmesh_ok === false ? 'bad' : '',
    },
    {
      // r007 hatte Schiefe 7,2 — stand im Manifest, war nirgends sichtbar
      label: 'Zellschiefe (max.)',
      value: manifest?.checkmesh?.max_skewness != null
        ? fmt(manifest.checkmesh.max_skewness) : '–',
      cls: manifest?.checkmesh?.max_skewness > GRENZWERTE.skewness_max ? 'bad' : '',
    },
    {
      label: 'Netz (Ränge · Methode)',
      value: manifest?.netz
        ? `${manifest.netz.ranks_mesh ?? '?'} · ${manifest.netz.methode ?? '?'}`
        : '–',
      cls: '',
    },
    {
      // Gültigkeit der (rauen) Wandfunktionen: y+ sollte grob 30…300 liegen
      label: 'y⁺ (min … max)',
      hilfe: 'y_plus', roh: quality.y_plus_range?.[1],
      value: quality.y_plus_range
        ? `${fmt(quality.y_plus_range[0])} … ${fmt(quality.y_plus_range[1])}`
        : '–',
      cls: quality.y_plus_range
        && quality.y_plus_range[1] > VORBELEGUNG.y_plus_max ? 'bad' : '',
    },
  ]
}

watchEffect(async () => {
  const ids = [...store.selectedRunIds]
  entries.value = await Promise.all(ids.map(async (runId) => {
    try {
      const result = await store.ensureResult(runId)
      const detail = await flood3dApi.runDetail(runId).catch(() => null)
      return { runId,
        stats: stats(result.quality ?? {}, detail?.manifest ?? null),
        befunde: detail?.manifest?.befunde ?? [] }
    } catch (e) {
      return { runId, error: e.message }
    }
  }))

  const defs = [
    { id: 'courant', title: 'Courant-Zahl', ylabel: 'Co', keys: ['courant_max', 'courant_mean'], dashes: [[], [6, 4]], labels: ['max', 'Mittel'] },
    { id: 'timestep', title: 'Zeitschrittweite', ylabel: 'Δt in s', keys: ['timestep'], dashes: [[]], labels: [''] },
    { id: 'volume', title: 'Wasservolumen im Modellgebiet', ylabel: 'V in m³', keys: ['volume'], dashes: [[]], labels: [''] },
    { id: 'continuity', title: 'Kumulierter Kontinuitätsfehler', ylabel: 'm³', keys: ['continuity'], dashes: [[]], labels: [''] },
  ]
  const built = []
  const balances = await Promise.all(
    ids.map((id) => store.ensureBalance(id).catch(() => null)))

  for (const def of defs) {
    const series = []
    ids.forEach((runId, runIdx) => {
      const bal = balances[runIdx]
      if (!bal) return
      def.keys.forEach((key, ki) => {
        const s = bal[key]
        if (!s?.t?.length) return
        const suffix = def.labels[ki] ? ` (${def.labels[ki]})` : ''
        series.push({
          label: (ids.length > 1 ? `${runId}` : def.title) + suffix,
          t: s.t,
          v: s.v,
          color: SERIES_COLORS[runIdx % SERIES_COLORS.length],
          dash: def.dashes[ki],
        })
      })
    })
    if (series.length) built.push({ ...def, series })
  }

  // Residuen logarithmisch, Feld = Farbe, Lauf = Strichmuster
  const resSeries = []
  ids.forEach((runId, runIdx) => {
    const bal = balances[runIdx]
    if (!bal?.residuals) return
    const fields = [...new Set(bal.residuals.map((r) => r.location_id))]
    for (const r of bal.residuals) {
      if (!r.t.length) continue
      resSeries.push({
        label: ids.length > 1 ? `${r.location_id} · ${runId}` : r.location_id,
        t: r.t,
        v: r.v,
        color: SERIES_COLORS[fields.indexOf(r.location_id) % SERIES_COLORS.length],
        dash: store.runDash(runId),
        width: 1.5,
      })
    }
  })
  if (resSeries.length) {
    built.push({ id: 'residuals', title: 'Residuen', ylabel: 'Residuum', logY: true, series: resSeries })
  }
  charts.value = built
})
</script>

<style scoped>
.f3d-quality { display: flex; flex-direction: column; gap: 14px; }
.f3d-quality-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 14px;
}
.f3d-stats { display: flex; flex-direction: column; gap: 6px; margin: 0; }
.f3d-stat { display: flex; justify-content: space-between; gap: 12px; }
.f3d-stat dt { color: var(--f3d-text-2); font-size: 0.8rem; }
.f3d-stat dd {
  margin: 0;
  color: var(--f3d-text);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
.f3d-stat dd.bad { color: var(--f3d-bad); }
.f3d-stat dd.good { color: var(--f3d-good); }
</style>
