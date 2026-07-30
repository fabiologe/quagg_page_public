<template>
  <div class="dwf-pattern-preview">
    <h4 class="dpp-title">
      Stundenspitzen (Tagesgang)
      <small class="dpp-footnote">vereinfachte Näherungskurve, keine Norm-Tabelle</small>
    </h4>
    <div class="dpp-chart-container">
      <Line :data="chartData" :options="chartOptions" />
    </div>
    <div class="dpp-meta">
      <span v-if="hasFactor">
        Spitzenfaktor {{ tagesspitzenfaktor.toFixed(2) }} bei {{ peakHour }}h · Tagesmittel = 1.0 (gestrichelt)
      </span>
      <span v-else class="dpp-hint">
        Kein Tagesspitzenfaktor gesetzt — SWMM erhält einen konstanten Trockenwetterzufluss ohne Tagesgang.
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, LineController } from 'chart.js';
import { buildDwfPatternValues } from '../../utils/dwfPattern.js';

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, LineController);

const props = defineProps({
  tagesspitzenfaktor: {
    type: Number,
    default: null
  }
});

const hasFactor = computed(() => props.tagesspitzenfaktor != null && props.tagesspitzenfaktor > 1.0);

// buildDwfPatternValues() ist dieselbe Funktion, die SwmmBuilder.addDwfPatterns()
// für das tatsächlich geschriebene [PATTERNS]-HOURLY-Pattern nutzt (utils/dwfPattern.js)
// — diese Vorschau zeigt also exakt das, was der Solver bekommt, nicht eine
// separat gepflegte (und potenziell abweichende) Näherung.
const values = computed(() => buildDwfPatternValues(props.tagesspitzenfaktor));

const peakHour = computed(() => values.value.indexOf(Math.max(...values.value)));

const hourLabels = Array.from({ length: 24 }, (_, h) => `${h}h`);

const chartData = computed(() => ({
  labels: hourLabels,
  datasets: [
    {
      label: 'Stundenfaktor',
      data: values.value,
      borderColor: '#2ecc71',
      backgroundColor: '#2ecc71',
      pointRadius: 0,
      borderWidth: 2,
      tension: 0.3,
      fill: false
    },
    {
      label: 'Tagesmittel',
      data: hourLabels.map(() => 1),
      borderColor: '#8f8be1',
      borderDash: [4, 3],
      borderWidth: 1,
      pointRadius: 0,
      tension: 0,
      fill: false
    }
  ]
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => `Stunde ${ctx.label}: Faktor ${ctx.parsed.y.toFixed(2)}`
      }
    }
  },
  scales: {
    x: {
      title: { display: true, text: 'Stunde', color: '#8f8be1', font: { size: 10 } },
      ticks: { color: '#aeadd2', font: { size: 9 }, maxTicksLimit: 12 },
      grid: { color: 'rgba(148, 139, 225, 0.15)' }
    },
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Faktor', color: '#8f8be1', font: { size: 10 } },
      ticks: { color: '#aeadd2', font: { size: 9 } },
      grid: { color: 'rgba(148, 139, 225, 0.15)' }
    }
  }
};
</script>

<style scoped>
.dwf-pattern-preview {
  background: #040647;
  border: 1px solid #594491;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  margin-top: 0.5rem;
}
.dpp-title {
  margin: 0 0 0.5rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  color: #2ecc71;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.dpp-footnote {
  font-family: inherit;
  text-transform: none;
  letter-spacing: normal;
  font-size: 0.62rem;
  color: #8f8be1;
}
.dpp-chart-container {
  height: 140px;
}
.dpp-meta {
  margin-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.72rem;
  color: #aeadd2;
}
.dpp-hint {
  color: #e0a020;
}
</style>
