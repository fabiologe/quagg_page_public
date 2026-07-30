<template>
  <div class="f3d-chart">
    <div class="f3d-chart-head" v-if="title">
      <div class="f3d-chart-title">{{ title }}</div>
      <button class="f3d-chart-csv" title="Rohdaten als CSV herunterladen"
              @click="downloadCsv">CSV</button>
    </div>
    <div ref="host" class="f3d-chart-host"></div>
  </div>
</template>

<script setup>
// Generischer uPlot-Wrapper. Serien dürfen unterschiedliche native
// Zeitachsen haben (Spez. 4.2) — uPlot.join richtet sie mit Lücken aus,
// spanGaps zeichnet darüber. Der Zeitcursor ist über cursor.sync mit allen
// Diagrammen derselben Ansicht gekoppelt (Spez. Kap. 8, Zeitreihenpanel).
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

const props = defineProps({
  title: { type: String, default: '' },
  // [{ label, t:[...], v:[...], color, dash, width }]
  series: { type: Array, required: true },
  ylabel: { type: String, default: '' },
  syncKey: { type: String, default: 'f3d-zeit' },
  logY: { type: Boolean, default: false },
  height: { type: Number, default: 240 },
  xlabel: { type: String, default: 'Zeit in s' },
})

const emit = defineEmits(['cursor-time'])

const host = ref(null)
let plot = null
let resizeObs = null

const AXIS_STROKE = '#8b8a94'
const GRID_STROKE = 'rgba(255,255,255,0.07)'

function axis(extra = {}) {
  return {
    stroke: AXIS_STROKE,
    grid: { stroke: GRID_STROKE, width: 1 },
    ticks: { stroke: GRID_STROKE, width: 1 },
    font: '11px system-ui',
    ...extra,
  }
}

function build() {
  if (plot) { plot.destroy(); plot = null }
  const el = host.value
  if (!el || !props.series.length) return

  const tables = props.series.map((s) => [s.t, s.v])
  const data = uPlot.join(tables)

  const opts = {
    width: el.clientWidth || 600,
    height: props.height,
    scales: {
      x: { time: false },
      y: props.logY ? { distr: 3, log: 10 } : {},
    },
    axes: [
      axis({ label: props.xlabel, labelFont: '11px system-ui' }),
      axis({ label: props.ylabel, labelFont: '11px system-ui', size: 60 }),
    ],
    series: [
      { label: 't' },
      ...props.series.map((s) => ({
        label: s.label,
        stroke: s.color,
        width: s.width ?? 2,
        dash: s.dash?.length ? s.dash : undefined,
        spanGaps: true,
        points: { show: false },
      })),
    ],
    cursor: {
      sync: { key: props.syncKey },
      points: { size: 8 },
      drag: { x: true, y: false },
    },
    legend: { live: true },
    hooks: {
      setCursor: [(u) => {
        const i = u.cursor.idx
        if (i != null && u.data[0]) emit('cursor-time', u.data[0][i])
      }],
    },
  }
  plot = new uPlot(opts, data, el)
}

// Rohdaten-Export im Langformat (Reihe;t;Wert) — Zeitachsen dürfen je
// Reihe verschieden sein, darum kein breites Format
function downloadCsv() {
  const lines = ['reihe;zeit_s;wert']
  for (const s of props.series) {
    for (let i = 0; i < s.t.length; i++) {
      lines.push(`${String(s.label).replaceAll(';', ',')};${s.t[i]};${s.v[i]}`)
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(props.title || 'zeitreihen').replaceAll(/[^\wäöüß-]+/gi, '_')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

onMounted(() => {
  build()
  resizeObs = new ResizeObserver(() => {
    if (plot && host.value) {
      plot.setSize({ width: host.value.clientWidth, height: props.height })
    }
  })
  if (host.value) resizeObs.observe(host.value)
})

watch(() => props.series, build, { deep: false })

onBeforeUnmount(() => {
  resizeObs?.disconnect()
  plot?.destroy()
})
</script>

<style scoped>
.f3d-chart {
  background: var(--f3d-surface);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  padding: 10px 12px 4px;
}
.f3d-chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.f3d-chart-title {
  color: var(--f3d-text);
  font-size: 0.85rem;
  font-weight: 600;
}
.f3d-chart-csv {
  background: none;
  border: 1px solid var(--f3d-border);
  border-radius: 5px;
  color: var(--f3d-text-2);
  font-size: 0.68rem;
  padding: 2px 7px;
  cursor: pointer;
}
.f3d-chart-csv:hover { color: var(--f3d-text); border-color: var(--f3d-accent); }
.f3d-chart-host :deep(.u-legend) {
  color: var(--f3d-text-2);
  font-size: 11px;
}
.f3d-chart-host :deep(.u-legend .u-value) {
  color: var(--f3d-text);
}
</style>
