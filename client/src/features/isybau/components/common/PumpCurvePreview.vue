<template>
  <div class="pump-curve-preview">
    <h4 class="pcp-title">Pumpenkennlinie (Q–H)</h4>
    <div class="pcp-chart-container">
      <Line :data="chartData" :options="chartOptions" />
    </div>
    <div class="pcp-meta">
      <span>Auslegungspunkt: H = {{ curve.H_d.toFixed(2) }} m, Q = {{ (curve.Q_d * 1000).toFixed(1) }} l/s</span>
      <span v-if="curve.estimated" class="pcp-estimated">
        Förderleistung nicht angegeben — aus Leistung geschätzt.
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, LinearScale, LineController } from 'chart.js';
import { computePumpCurvePoints } from '../../utils/pumpCurve.js';

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, LinearScale, LineController);

const props = defineProps({
  node: {
    type: Object,
    required: true
  }
});

// computePumpCurvePoints() ist dieselbe Funktion, die SwmmBuilder.addCurves() für
// das tatsächlich geschriebene [CURVES]-PUMP3-Kennfeld nutzt (utils/pumpCurve.js) —
// diese Vorschau zeigt also exakt das, was der Solver bekommt, nicht eine
// separat gepflegte (und potenziell abweichende) Näherung.
const curve = computed(() => computePumpCurvePoints(props.node));

const chartData = computed(() => ({
  datasets: [{
    label: 'Q-H-Kennlinie',
    data: curve.value.points.map(p => ({ x: p.head, y: p.flow * 1000 })), // l/s für Lesbarkeit
    borderColor: '#2ecc71',
    backgroundColor: '#2ecc71',
    pointBackgroundColor: '#2ecc71',
    pointRadius: 4,
    tension: 0.15,
    fill: false
  }]
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `H = ${ctx.parsed.x.toFixed(2)} m, Q = ${ctx.parsed.y.toFixed(1)} l/s`
      }
    }
  },
  scales: {
    x: {
      type: 'linear',
      title: { display: true, text: 'Förderhöhe H (m)', color: '#8f8be1', font: { size: 10 } },
      ticks: { color: '#aeadd2', font: { size: 9 } },
      grid: { color: 'rgba(148, 139, 225, 0.15)' }
    },
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Förderleistung Q (l/s)', color: '#8f8be1', font: { size: 10 } },
      ticks: { color: '#aeadd2', font: { size: 9 } },
      grid: { color: 'rgba(148, 139, 225, 0.15)' }
    }
  }
};
</script>

<style scoped>
.pump-curve-preview {
  background: #040647;
  border: 1px solid #594491;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  margin-top: 0.5rem;
}
.pcp-title {
  margin: 0 0 0.5rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  color: #2ecc71;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.pcp-chart-container {
  height: 140px;
}
.pcp-meta {
  margin-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.72rem;
  color: #aeadd2;
}
.pcp-estimated {
  color: #e0a020;
}
</style>
