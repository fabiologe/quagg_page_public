<template>
  <div class="chart-container">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'vue-chartjs'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps({
  hydrograph: {
    type: Array,
    default: () => [] // { t: hours, Q: m3/s }
  },
  rainSeries: {
    type: Array,
    default: () => [] // { t: hours, intensity: mm/h } or similar
  },
  qMax: {
    type: Number,
    default: 0
  }
})

const chartData = computed(() => {
  const labels = props.hydrograph.map(p => p.t.toFixed(2))
  
  return {
    labels,
    datasets: [
      {
        label: 'Abfluss Q (m³/s)',
        backgroundColor: 'rgba(52, 152, 219, 0.2)',
        borderColor: '#3498db',
        data: props.hydrograph.map(p => p.Q),
        fill: true,
        yAxisID: 'y'
      },
      // Optional: Rain on secondary axis if needed
      // For now we focus on the wave
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  plugins: {
    legend: {
      position: 'top',
    },
    title: {
      display: true,
      text: 'Hochwasserwelle HQ100'
    },
    tooltip: {
      callbacks: {
        label: (context) => {
          return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}`
        }
      }
    }
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Zeit (h)'
      }
    },
    y: {
      type: 'linear',
      display: true,
      position: 'left',
      title: {
        display: true,
        text: 'Abfluss (m³/s)'
      },
      min: 0
    }
  }
}
</script>

<style scoped>
.chart-container {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
