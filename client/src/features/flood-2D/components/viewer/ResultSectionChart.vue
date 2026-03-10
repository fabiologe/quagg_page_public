<template>
  <div class="section-chart-panel" v-if="section && section.data && section.data.length > 0" :style="panelStyle">
    <div class="panel-header" :style="headerStyle" @mousedown="startDrag">
      <div class="title" :style="{ color: section.color }">
        <span class="icon">📏</span> Querschnitt (Frame {{ currentFrame }})
      </div>
      <div class="header-actions">
        <button class="reset-btn" @click.stop="resetZoom" title="Ansicht zurücksetzen">⟲ Reset Zoom</button>
        <button class="close-btn" @click.stop="handleClose" title="Schließen">&times;</button>
      </div>
    </div>
    
    <div class="panel-body">
      <div class="chart-container">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, shallowRef, computed } from 'vue';
import {
  Chart,
  LineElement,
  PointElement,
  LineController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register Chart.js components and plugins
Chart.register(
  LineElement,
  PointElement,
  LineController,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
  zoomPlugin
);

const props = defineProps({
  section: {
    type: Object,
    required: true
  },
  currentFrame: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['closeRequested']);

function handleClose() {
  if (props.section) emit('closeRequested', props.section.id);
}

const chartCanvas = ref(null);
const chartInstance = shallowRef(null);

// --- Dragging Logic ---
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let startMousePos = { x: 0, y: 0 };
let startPanelPos = { x: 0, y: 0 };

onMounted(() => {
  const offset = Math.floor(Math.random() * 40);
  position.value.x = 24 + offset;
  position.value.y = window.innerHeight - 350 - offset; // Bottom left area
  
  initChart();
  updateChartData();
});

function startDrag(e) {
  if (e.target.tagName.toLowerCase() === 'button') return;
  isDragging.value = true;
  startMousePos = { x: e.clientX, y: e.clientY };
  startPanelPos = { ...position.value };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', stopDrag);
}

function onDrag(e) {
  if (!isDragging.value) return;
  e.preventDefault();
  const dx = e.clientX - startMousePos.x;
  const dy = e.clientY - startMousePos.y;
  position.value.x = startPanelPos.x + dx;
  position.value.y = Math.max(0, startPanelPos.y + dy);
}

function stopDrag() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  borderColor: hexToRgba(props.section?.color || '#4fc3f7', 0.6),
  boxShadow: `0 10px 40px ${hexToRgba(props.section?.color || '#000000', 0.15)}`
}));

const headerStyle = computed(() => ({
  backgroundColor: hexToRgba(props.section?.color || '#4fc3f7', 0.15),
  cursor: isDragging.value ? 'grabbing' : 'grab'
}));

function hexToRgba(hex, alpha) {
  if(!hex) return '';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Initialize Chart
const initChart = () => {
  if (!chartCanvas.value) return;

  const ctx = chartCanvas.value.getContext('2d');
  
  chartInstance.value = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Wasserspiegel',
          data: [],
          borderColor: 'rgba(79, 195, 247, 0.8)',
          backgroundColor: 'rgba(79, 195, 247, 0.4)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: 1, // Füllt das Wasser nur exakt bis hinunter zum Gelände (Dataset 1)
          tension: 0.1,
          order: 2 // Höhere Nummer = rendering weiter hinten
        },
        {
          label: 'Gelände',
          data: [],
          borderColor: '#2d5f3f', // Dark Green outline
          backgroundColor: '#1e3f2a', // Rich forest green fill
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          fill: 'start', // Füllt bis ganz nach unten zum Rand des Charts
          tension: 0.1,
          order: 1 // Kleinere Nummer = rendering ganz vorne ÜBER dem Wasser
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0 // Disable animation for performance during playback
      },
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#e0e0e0',
            font: { size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 40, 0.9)',
          titleColor: '#e0e0e0',
          bodyColor: '#e0e0e0',
          borderColor: 'rgba(79, 195, 247, 0.3)',
          borderWidth: 1,
          callbacks: {
            title: (context) => `Distanz: ${context[0].label} m`,
            label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} m`
          }
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'xy', // allow panning in both directions
          },
          zoom: {
            wheel: {
              enabled: true, // enable zooming with mouse wheel
            },
            pinch: {
              enabled: true
            },
            mode: 'xy', // allow zooming in both directions
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Distanz (m)',
            color: '#90a4ae'
          },
          ticks: {
            color: '#90a4ae',
            maxTicksLimit: 10
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Höhe (m)',
            color: '#90a4ae'
          },
          ticks: {
            color: '#90a4ae'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        }
      }
    }
  });
};

// Update Chart Data
const updateChartData = () => {
  if (!chartInstance.value || !props.section || !props.section.data || props.section.data.length === 0) return;

  const distances = props.section.data.map(d => d.distance.toFixed(1));
  const terrainData = props.section.data.map(d => d.terrainZ);
  
  const waterData = props.section.data.map(d => {
    if (d.waterDepth > 0.001) {
       return d.wsp;
    }
    return d.terrainZ; // Hide inside terrain
  });

  // Calculate dynamic Y-axis min/max for better view
  const minTerrain = Math.min(...terrainData);
  const maxWsp = Math.max(...waterData);
  const span = maxWsp - minTerrain;
  
  // Add some padding
  chartInstance.value.options.scales.y.suggestedMin = minTerrain - (span * 0.1) - 0.5;
  chartInstance.value.options.scales.y.suggestedMax = maxWsp + (span * 0.1) + 0.5;

  chartInstance.value.data.labels = distances;
  chartInstance.value.data.datasets[0].data = waterData;
  chartInstance.value.data.datasets[1].data = terrainData;
  
  chartInstance.value.update();
};

const resetZoom = () => {
  if (chartInstance.value) {
    chartInstance.value.resetZoom();
  }
};

onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.destroy();
  }
});

// Watch for data changes (e.g., playback running)
watch(() => props.section.data, () => {
  updateChartData();
}, { deep: true });

</script>

<style scoped>
.section-chart-panel {
  position: absolute;
  width: 700px;
  max-width: 90vw;
  background: rgba(20, 20, 40, 0.92);
  backdrop-filter: blur(16px);
  border-radius: 12px;
  border: 1px solid rgba(79, 195, 247, 0.3);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: rgba(79, 195, 247, 0.1);
  border-bottom: 1px solid rgba(79, 195, 247, 0.2);
}

.title {
  color: #e0e0e0;
  font-weight: 600;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon {
  font-size: 1.2rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.reset-btn {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.4);
  color: #e0e0e0;
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  background: rgba(79, 195, 247, 0.4);
  color: #fff;
}

.close-btn {
  background: none;
  border: none;
  color: #90a4ae;
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
  padding: 0 4px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ff5252;
}

.panel-body {
  padding: 16px;
  height: 250px; /* Fixed height for the chart */
}

.chart-container {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
