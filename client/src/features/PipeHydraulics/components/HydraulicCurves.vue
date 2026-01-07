<template>
  <div class="chart-panel">
    <div class="panel-header text-right">
       Hydraulische Kennlinien
    </div>
    <div class="chart-container">
       <Line :data="chartDataSwapped" :options="chartOptionsSwapped" />
    </div>
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
  Legend
} from 'chart.js'
import { Line } from 'vue-chartjs'
import { usePipeHydraulicsStore } from '../stores/usePipeHydraulicsStore'
import { useHydraulicMath } from '../composables/useHydraulicMath'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const store = usePipeHydraulicsStore()
const { calculateCurveData } = useHydraulicMath()

const curveData = computed(() => {
    const type = store.profileType
    const d = store.diameter
    const w = store.width
    const h = store.height
    // Ensure reactivity by just passing values that trigger update
    if (!type) return { ratios: [], q_rel: [], v_rel: [] }
    
    return calculateCurveData(type, (type === 'circular' ? d : w), h, 1, 1, 100)
})

const chartDataSwapped = computed(() => {
  const cd = curveData.value
  const labels = cd.ratios.map(r => (r * 100).toFixed(0) + '%')

  // Calculate coordinates for the "Red X" points
  // X-Axis value: Ratio (Q/Qfull or v/vfull)
  // Y-Axis value: Filling Height Ratio (h/H)
  // ChartJS 'Line' with indexAxis: 'y' expects labels parallel to Y.
  // But for putting a SINGLE point at exact coordinates in a Category/Line chart, 
  // it is tricky if we don't have a linear Y axis.
  // Wait, I set Y axis to 'LinearScale' implicitly? No, 'CategoryScale' is registered.
  // Actually, standard Line chart uses Category on one axis.
  // If I want precise positioning, better to use Scatter logic or ensure the Y axis is Linear.
  // Let's check chart options.
  // If I switch Y to linear, I don't need 'labels'. I can just use {x,y} points for the lines too.
  
  // Let's refactor datasets to use {x,y} to allow precise marking of the Red X
  const lineDataQ = cd.q_rel.map((val, i) => ({ x: val, y: cd.ratios[i] }))
  const lineDataV = cd.v_rel.map((val, i) => ({ x: val, y: cd.ratios[i] }))
  
  const currentRatio = (store.results?.fillingRatio) || 0
  const currentQRel = (store.results?.Q / store.results?.Q_full) || 0
  const currentVRel = (store.results?.v / store.results?.v_full) || 0
  
  const pointData = [
      { x: currentQRel, y: currentRatio },
      { x: currentVRel, y: currentRatio }
  ]

  return {
      datasets: [
        {
            label: 'Durchfluss Q/Qvoll',
            data: lineDataQ, 
            borderColor: '#3498db',
            backgroundColor: '#3498db',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 6,
            tension: 0.4,
            order: 2
        },
        {
            label: 'Geschwindigkeit v/vvoll',
            data: lineDataV,
            borderColor: '#95a5a6',
            backgroundColor: '#95a5a6',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            pointHoverRadius: 6,
            tension: 0.4,
            order: 2
        },
        {
            label: 'Aktueller Füllstand',
            data: pointData,
            borderColor: 'red',
            backgroundColor: 'red',
            pointStyle: 'crossRot', // The "X"
            pointRadius: 10,
            pointHoverRadius: 12,
            borderWidth: 3,
            showLine: false,
            order: 1 // Top layer
        }
      ]
  }
})

const chartOptionsSwapped = computed(() => {
    return {
        indexAxis: 'y', 
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'top', 
                align: 'end',
                labels: {
                    filter: (item) => item.text !== 'Aktueller Füllstand' // Hide the point from legend if desired
                }
            },
            tooltip: {
                mode: 'nearest',
                axis: 'y',
                intersect: false,
                callbacks: {
                    title: (items) => {
                         // With Linear Scale items[0].parsed.y is the value
                         return `Füllhöhe: ${(items[0].parsed.y * 100).toFixed(1)} %`
                    },
                    label: (item) => {
                        return `${item.dataset.label}: ${(item.parsed.x * 100).toFixed(1)} %`
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'linear',
                min: 0,
                max: 1.3, // Allow some space for super-elevation (egg/circle max flow > full)
                title: { display: true, text: 'Relativwert' },
                ticks: {
                    callback: (v) => (v*100).toFixed(0) + '%'
                }
            },
            y: {
                type: 'linear', // CHANGED to linear for precise scatter plotting
                min: 0,
                max: 1.05,
                title: { display: true, text: 'Füllhöhe h/D' },
                ticks: {
                    callback: (v) => (v*100).toFixed(0) + '%'
                }
            }
        }
    }
})
</script>

<style scoped>
.chart-panel {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  font-weight: 700;
  color: #2c3e50;
  text-transform: uppercase;
  font-size: 0.85rem;
  border-bottom: 2px solid #f1f1f1;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
}

.chart-container {
    flex: 1;
    min-height: 400px;
    position: relative;
}
</style>
