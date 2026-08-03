<template>
  <div class="chart-container">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'vue-chartjs'

// Zeit als LinearScale, nicht als CategoryScale: das Rechenfenster kann
// mehrere tausend Schritte haben – als Kategorien wäre die Achse unlesbar
// und das Zeichnen unnötig langsam.
ChartJS.register(LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = defineProps({
  /** Ganglinie: { t: h, Q: m³/s (gesamt), Qd: m³/s (Direktabfluss) } */
  hydrograph: { type: Array, default: () => [] },
  /** Niederschlagshöhe je Zeitschritt in mm */
  rainDepths: { type: Array, default: () => [] },
  /** Zeitschritt in h – nötig, um aus den Höhen Intensitäten zu machen */
  dt: { type: Number, default: 0 },
  /** Drosselabfluss in m³/s; wird als waagrechte Linie eingeblendet */
  qAllowed: { type: Number, default: 0 }
})

const tMax = computed(() => {
  const hg = props.hydrograph
  return hg.length ? hg[hg.length - 1].t : 0
})

/** Palette und Typografie folgen dem Datenblatt-Theme der Ansicht. */
const C = {
  hydro: '#0d6e7d',
  hydroFill: 'rgba(13, 110, 125, 0.11)',
  throttle: '#b06d1f',
  rain: '#6b8ba8',
  rainFill: 'rgba(107, 139, 168, 0.30)',
  ink: '#0f1b2a',
  ink3: '#64788f',
  ink4: '#94a6b8',
  rule: '#dde5ec'
}
const MONO = "ui-monospace, 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace"

const de = (v, d) => Number(v).toLocaleString('de-DE', {
  minimumFractionDigits: d, maximumFractionDigits: d
})

/**
 * Achsenbeschriftung mit so vielen Nachkommastellen, wie der Achsenschritt
 * braucht – eine feste Stellenzahl liefert je nach Größenordnung entweder
 * zehnmal "0,02" oder unnötige Nullen.
 */
const tickDe = (value, index, ticks) => {
  const step = ticks.length > 1
    ? Math.abs(ticks[1].value - ticks[0].value)
    : Math.abs(value)
  const d = step > 0 ? Math.min(4, Math.max(0, Math.ceil(-Math.log10(step)))) : 0
  return de(value, d)
}

const chartData = computed(() => {
  const datasets = []

  datasets.push({
    label: 'Abfluss Q',
    backgroundColor: C.hydroFill,
    borderColor: C.hydro,
    borderWidth: 1.8,
    data: props.hydrograph.map(p => ({ x: p.t, y: p.Q })),
    fill: true,
    pointRadius: 0,
    yAxisID: 'y',
    order: 3
  })

  if (props.qAllowed > 0 && tMax.value > 0) {
    datasets.push({
      label: 'Drosselabfluss',
      borderColor: C.throttle,
      borderWidth: 1.4,
      borderDash: [5, 4],
      data: [{ x: 0, y: props.qAllowed }, { x: tMax.value, y: props.qAllowed }],
      fill: false,
      pointRadius: 0,
      yAxisID: 'y',
      order: 2
    })
  }

  if (props.rainDepths.length && props.dt > 0) {
    // Höhe je Schritt [mm] -> Intensität [mm/h]; als Treppenkurve, die von
    // oben herunterhängt (y1 ist umgekehrt, Füllung zur Nulllinie = oben)
    const rain = []
    for (let i = 0; i < props.rainDepths.length; i++) {
      rain.push({ x: i * props.dt, y: props.rainDepths[i] / props.dt })
    }
    rain.push({ x: props.rainDepths.length * props.dt, y: 0 })

    datasets.push({
      label: 'Niederschlag',
      borderColor: C.rain,
      backgroundColor: C.rainFill,
      borderWidth: 1,
      data: rain,
      stepped: 'before',
      fill: 'origin',
      pointRadius: 0,
      yAxisID: 'y1',
      order: 1
    })
  }

  return { datasets }
})

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  parsing: false,
  normalized: true,
  interaction: { mode: 'nearest', axis: 'x', intersect: false },
  layout: { padding: { top: 4, right: 2 } },
  plugins: {
    legend: {
      position: 'top',
      align: 'end',
      labels: {
        boxWidth: 10,
        boxHeight: 2,
        usePointStyle: false,
        padding: 14,
        color: C.ink3,
        font: { size: 11 }
      }
    },
    title: { display: false },
    tooltip: {
      backgroundColor: C.ink,
      titleColor: '#fff',
      bodyColor: '#e6edf4',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      cornerRadius: 3,
      padding: 9,
      displayColors: false,
      titleFont: { family: MONO, size: 11 },
      bodyFont: { family: MONO, size: 11.5 },
      callbacks: {
        title: (items) => `t = ${de(items[0].parsed.x, 2)} h`,
        label: (ctx) => {
          const unit = ctx.dataset.yAxisID === 'y1' ? 'mm/h' : 'm³/s'
          return `${ctx.dataset.label}  ${de(ctx.parsed.y, 3)} ${unit}`
        }
      }
    }
  },
  scales: {
    x: {
      type: 'linear',
      title: { display: true, text: 'Zeit t  [h]', color: C.ink4, font: { size: 10.5 } },
      min: 0,
      max: tMax.value || undefined,
      grid: { color: C.rule, drawTicks: false },
      border: { color: C.rule },
      ticks: {
        maxTicksLimit: 10,
        color: C.ink4,
        font: { family: MONO, size: 10 },
        padding: 6,
        callback: tickDe
      }
    },
    y: {
      type: 'linear',
      position: 'left',
      title: { display: true, text: 'Abfluss Q  [m³/s]', color: C.ink4, font: { size: 10.5 } },
      min: 0,
      grid: { color: C.rule, drawTicks: false },
      border: { color: C.rule },
      ticks: {
        maxTicksLimit: 7,
        color: C.ink4,
        font: { family: MONO, size: 10 },
        padding: 6,
        callback: tickDe
      }
    },
    y1: {
      type: 'linear',
      position: 'right',
      reverse: true,          // Regen hängt von oben herunter
      min: 0,
      title: { display: true, text: 'Niederschlag  [mm/h]', color: C.ink4, font: { size: 10.5 } },
      grid: { drawOnChartArea: false, drawTicks: false },
      border: { color: C.rule },
      ticks: {
        color: C.ink4,
        font: { family: MONO, size: 10 },
        padding: 6,
        callback: tickDe
      },
      // dem Regen nur das obere Drittel überlassen, damit die Ganglinie Platz behält
      afterDataLimits: (axis) => { axis.max = axis.max * 3 }
    }
  }
}))
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
