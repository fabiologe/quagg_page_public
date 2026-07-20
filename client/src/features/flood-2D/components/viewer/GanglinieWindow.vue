<template>
  <div class="gl-window" :style="windowStyle">
    <div class="gl-header" :style="headerStyle" @mousedown="startDrag">
      <div class="gl-title">{{ win.title }}</div>
      <div class="gl-actions">
        <button class="gl-btn" @click.stop="resetZoom" title="Ansicht zurücksetzen">⟲</button>
        <button class="gl-close" @click.stop="$emit('close', win.key)" title="Schließen">✕</button>
      </div>
    </div>
    <div class="gl-body">
      <div class="gl-chart"><canvas ref="chartCanvas"></canvas></div>
    </div>
  </div>
</template>

<script setup>
// Ausklinkbares Ganglinien-Fenster (Result-Viewer): rendert eine ganglinienSpec.js-
// Beschreibung als Chart.js-Liniendiagramm — frei verschiebbar, mehrere parallel
// (eins je Element), Frame-Cursor läuft mit der Timeline.
import { ref, watch, onMounted, onUnmounted, shallowRef, computed } from 'vue';
import {
  Chart, LineElement, PointElement, LineController,
  LinearScale, Filler, Tooltip, Legend
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

Chart.register(LineElement, PointElement, LineController, LinearScale, Filler, Tooltip, Legend, zoomPlugin);

const props = defineProps({
  win: { type: Object, required: true },        // Spec aus ganglinienSpec.js
  index: { type: Number, default: 0 },          // Kaskaden-Versatz beim Öffnen
  currentFrame: { type: Number, default: 0 },
  saveInterval: { type: Number, default: 0 },   // Sekunden je 2D-Frame
});
defineEmits(['close']);

const chartCanvas = ref(null);
const chartInstance = shallowRef(null);

// ── Dragging (Muster der Ergebnis-Panels) ───────────────────────────────────
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let startMousePos = { x: 0, y: 0 };
let startPanelPos = { x: 0, y: 0 };

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
  position.value.x = startPanelPos.x + (e.clientX - startMousePos.x);
  position.value.y = Math.max(0, startPanelPos.y + (e.clientY - startMousePos.y));
}
function stopDrag() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
}

const windowStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  borderColor: `${props.win.accent}55`,
}));
const headerStyle = computed(() => ({ cursor: isDragging.value ? 'grabbing' : 'grab' }));

// ── Frame-Cursor: kontinuierliche Frame-Zeit, in die Zeitachse geklemmt ─────
function cursorX() {
  const t = props.win.times || [];
  if (!t.length) return null;
  const sim = props.saveInterval > 0 ? props.currentFrame * props.saveInterval : props.currentFrame;
  return Math.min(Math.max(sim, t[0]), t[t.length - 1]);
}

const cursorPlugin = {
  id: 'glFrameCursor',
  afterDatasetsDraw(chart) {
    const x = chart.$cursorX;
    if (x == null) return;
    const xS = chart.scales.x, area = chart.chartArea, ctx = chart.ctx;
    const xpx = xS.getPixelForValue(x);
    if (xpx < area.left || xpx > area.right) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(xpx, area.top); ctx.lineTo(xpx, area.bottom); ctx.stroke();
    ctx.restore();
  },
};

function toChartDatasets(spec) {
  return (spec.datasets || []).map((d, i) => ({
    label: d.label,
    yAxisID: d.axis,
    data: d.data,
    borderColor: d.color,
    borderWidth: 1.8,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.12,
    order: (spec.datasets.length - i),
    $unit: d.unit,
    ...(d.dash ? { borderDash: d.dash } : {}),
    ...(d.spanGaps ? { spanGaps: true } : {}),
    ...(d.fill ? { backgroundColor: `${d.color}38`, fill: 'start' } : {}),
  }));
}

function initChart() {
  if (!chartCanvas.value) return;
  const ctx = chartCanvas.value.getContext('2d');
  chartInstance.value = new Chart(ctx, {
    type: 'line',
    data: { datasets: [] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#e6e6f0', font: { size: 10 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: 'rgba(27,27,40,0.94)', titleColor: '#e6e6f0', bodyColor: '#e6e6f0',
          borderColor: `${props.win.accent}4d`, borderWidth: 1,
          callbacks: {
            title: (c) => `t = ${c[0].parsed.x.toFixed(0)} s`,
            label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? '–' : c.parsed.y.toFixed(3)}${c.dataset.$unit ?? ''}`,
          },
        },
        zoom: {
          pan: { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Zeit (s)', color: '#9a9ab5' },
          ticks: { color: '#9a9ab5', maxTicksLimit: 8 },
          grid: { color: 'rgba(139,92,246,0.1)' },
        },
        yL: {
          type: 'linear', position: 'left', beginAtZero: true,
          title: { display: true, text: '', color: props.win.accent },
          ticks: { color: props.win.accent }, grid: { color: 'rgba(255,255,255,0.08)' },
        },
        yR: {
          type: 'linear', position: 'right', beginAtZero: true,
          title: { display: true, text: '', color: '#ffb74d' },
          ticks: { color: '#ffb74d' }, grid: { drawOnChartArea: false },
        },
      },
    },
    plugins: [cursorPlugin],
  });
}

function updateChartData() {
  const chart = chartInstance.value;
  if (!chart) return;
  chart.data.datasets = toChartDatasets(props.win);
  chart.options.scales.yL.title.text = props.win.yL || '';
  chart.options.scales.yR.title.text = props.win.yR || '';
  chart.$cursorX = cursorX();
  chart.update();
}

function updateCursor() {
  const chart = chartInstance.value;
  if (!chart) return;
  chart.$cursorX = cursorX();
  chart.update('none');
}

const resetZoom = () => { if (chartInstance.value) chartInstance.value.resetZoom(); };

onMounted(() => {
  position.value.x = 24 + (props.index % 6) * 36;
  position.value.y = 90 + (props.index % 6) * 36;
  initChart();
  updateChartData();
});
onUnmounted(() => { if (chartInstance.value) chartInstance.value.destroy(); });

watch(() => props.win, updateChartData, { deep: true });  // Re-Hydration/Neuberechnung
watch(() => props.currentFrame, updateCursor);
</script>

<style scoped>
.gl-window {
  position: absolute;
  width: 480px;
  max-width: 90vw;
  background: var(--sv-surface);
  backdrop-filter: blur(16px);
  border-radius: var(--sv-radius);
  border: 1px solid var(--sv-border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), var(--sv-glow-violet);
  z-index: 25;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  font-family: var(--sv-font);
}
.gl-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px; background: rgba(139, 92, 246, 0.12);
  border-bottom: 1px solid var(--sv-border);
}
.gl-title {
  color: var(--sv-lime); font-weight: 600; font-size: 0.85rem;
  text-shadow: var(--sv-glow-lime);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gl-actions { display: flex; align-items: center; gap: 6px; }
.gl-btn {
  background: rgba(139, 92, 246, 0.2); border: 1px solid var(--sv-border);
  color: var(--sv-text); font-size: 0.8rem; padding: 2px 8px; border-radius: 4px; cursor: pointer;
}
.gl-btn:hover { background: rgba(139, 92, 246, 0.4); }
.gl-close { background: none; border: none; color: var(--sv-text-dim); font-size: 0.95rem; cursor: pointer; padding: 0 4px; }
.gl-close:hover { color: #ff5252; }

.gl-body { padding: 12px; height: 210px; }
.gl-chart { position: relative; width: 100%; height: 100%; }
</style>
