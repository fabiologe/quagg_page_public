<template>
  <div class="weir-panel" v-if="series.length" :class="{ collapsed }" :style="panelStyle">
    <div class="panel-header" :style="headerStyle" @mousedown="startDrag" @click="expandIfCollapsed">
      <div class="title">
        <span class="icon"><SvIcon name="Weir.png" :size="collapsed ? 20 : 14" color="currentColor" /></span>
        <span class="title-text" v-show="!collapsed">Wehr-Durchfluss</span>
      </div>
      <div class="header-actions" v-show="!collapsed">
        <button class="reset-btn" @click.stop="$emit('openChart', selectedId)"
                title="Ganglinie des Wehrs als eigenes Fenster">⧉</button>
        <button class="reset-btn" @click.stop="resetZoom" title="Ansicht zurücksetzen">⟲</button>
        <button class="close-btn" @click.stop="collapsed = !collapsed" :title="collapsed ? 'Aufklappen' : 'Einklappen'">
          {{ collapsed ? '▸' : '▾' }}
        </button>
      </div>
    </div>

    <!-- v-show statt v-if: v-if zerstört das Canvas beim Einklappen — Chart.js hängt
         dann am toten Element und das Diagramm bleibt nach dem Aufklappen leer. -->
    <div v-show="!collapsed" class="panel-content">
      <!-- Wehr-Auswahl -->
      <div class="weir-tabs" @mousedown.stop>
        <button
          v-for="w in series"
          :key="w.id"
          class="weir-tab"
          :class="{ active: w.id === selectedId }"
          :title="w.label"
          @click="selectedId = w.id"
        >
          {{ w.label }}
        </button>
      </div>

      <!-- Kennzahlen des aktiven Wehrs -->
      <div class="weir-kpis" v-if="active" @mousedown.stop>
        <span class="kpi"><b>Q</b> {{ fmt(currentQ, 2) }} m³/s</span>
        <span class="kpi"><b>Qmax</b> {{ fmt(active.Qmax, 2) }} m³/s</span>
        <span class="kpi" v-if="active.hc != null"><b>Krone</b> {{ fmt(active.hc, 2) }} m</span>
        <span class="kpi kpi-overtop" v-if="currentOvertop > 0.001">
          ⤴ Überströmt +{{ fmt(currentOvertop, 2) }} m
        </span>
        <span class="kpi" v-if="active.overtopFrames > 0">
          <SvEmoji emoji="⏱" :size="13" /> {{ overtopMinutes }} überströmt
        </span>
      </div>

      <div class="panel-body">
        <div class="chart-container"><canvas ref="chartCanvas"></canvas></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import SvIcon from '../common/SvIcon.vue';
import { ref, watch, onMounted, onUnmounted, shallowRef, computed } from 'vue';
import {
  Chart, LineElement, PointElement, LineController,
  LinearScale, Filler, Tooltip, Legend
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

Chart.register(LineElement, PointElement, LineController, LinearScale, Filler, Tooltip, Legend, zoomPlugin);

const props = defineProps({
  // [{ id, label, hc, frames[], times[], Q[], HW[], TW[], overtop[], Qmax, overtopFrames }]
  series: { type: Array, default: () => [] },
  currentFrame: { type: Number, default: 0 },
  saveInterval: { type: Number, default: 0 },
});
defineEmits(['openChart']); // ⧉: Ganglinie des gewählten Wehrs als eigenes Fenster

const collapsed = ref(false);
const selectedId = ref(props.series[0]?.id ?? null);
const chartCanvas = ref(null);
const chartInstance = shallowRef(null);

const active = computed(() =>
  props.series.find(w => w.id === selectedId.value) || props.series[0] || null
);

// Index des aktuellen Frames in der Zeitreihe des aktiven Wehrs
const currentIdx = computed(() => {
  const a = active.value;
  if (!a) return -1;
  const i = a.frames.indexOf(props.currentFrame);
  return i >= 0 ? i : a.frames.length - 1;
});
const currentQ = computed(() => active.value?.Q[currentIdx.value] ?? 0);
const currentOvertop = computed(() => active.value?.overtop[currentIdx.value] ?? 0);
const overtopMinutes = computed(() => {
  const a = active.value;
  if (!a || !props.saveInterval) return `${a?.overtopFrames ?? 0} Frames`;
  const min = (a.overtopFrames * props.saveInterval) / 60;
  return `${min.toFixed(min < 10 ? 1 : 0)} min`;
});

const fmt = (v, d = 2) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));

// Keep selection valid when the weir list changes (re-hydration)
watch(() => props.series, (s) => {
  if (!s.find(w => w.id === selectedId.value)) selectedId.value = s[0]?.id ?? null;
}, { deep: false });

// ── Dragging ────────────────────────────────────────────────────────────────
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
function expandIfCollapsed() { if (collapsed.value) collapsed.value = false; }

const ACCENT = '#a3e635';
const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}));
const headerStyle = computed(() => ({ cursor: isDragging.value ? 'grabbing' : 'grab' }));

// Plugin: vertikale Linie am aktuellen Frame (liest chart.$cursorX = Zeit/Frame-Wert)
const cursorPlugin = {
  id: 'frameCursor',
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

onMounted(() => {
  position.value.x = 24;
  position.value.y = Math.max(60, window.innerHeight - 430);
  initChart();
  updateChartData();
});
onUnmounted(() => { if (chartInstance.value) chartInstance.value.destroy(); });

function initChart() {
  if (!chartCanvas.value) return;
  const ctx = chartCanvas.value.getContext('2d');
  chartInstance.value = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Q (m³/s)', yAxisID: 'yQ', data: [],
          borderColor: ACCENT, backgroundColor: 'rgba(163,230,53,0.22)',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: 'start', tension: 0.15, order: 3,
        },
        {
          label: 'Oberwasser', yAxisID: 'yH', data: [],
          borderColor: '#ffb74d', borderWidth: 1.5, pointRadius: 0, tension: 0.1, order: 2, spanGaps: true,
        },
        {
          label: 'Unterwasser', yAxisID: 'yH', data: [],
          borderColor: '#90caf9', borderWidth: 1.5, pointRadius: 0, tension: 0.1, order: 1, spanGaps: true,
          borderDash: [5, 3],
        },
        {
          label: 'Krone', yAxisID: 'yH', data: [],
          borderColor: '#ef5350', borderWidth: 1.5, pointRadius: 0, order: 0, borderDash: [2, 2],
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#e6e6f0', font: { size: 10 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: 'rgba(27,27,40,0.94)', titleColor: '#e6e6f0', bodyColor: '#e6e6f0',
          borderColor: 'rgba(163,230,53,0.35)', borderWidth: 1,
          callbacks: {
            title: (c) => `t = ${c[0].parsed.x.toFixed(0)} ${timeUnit.value}`,
            label: (c) => {
              const u = c.dataset.yAxisID === 'yQ' ? ' m³/s' : ' m';
              return `${c.dataset.label}: ${c.parsed.y == null ? '–' : c.parsed.y.toFixed(2)}${u}`;
            },
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
          title: { display: true, text: `Zeit (${timeUnit.value})`, color: '#9a9ab5' },
          ticks: { color: '#9a9ab5', maxTicksLimit: 8 },
          grid: { color: 'rgba(139,92,246,0.1)' },
        },
        yQ: {
          type: 'linear', position: 'left', beginAtZero: true,
          title: { display: true, text: 'Q (m³/s)', color: ACCENT },
          ticks: { color: ACCENT }, grid: { color: 'rgba(255,255,255,0.08)' },
        },
        yH: {
          type: 'linear', position: 'right',
          title: { display: true, text: 'Höhe (m)', color: '#ffb74d' },
          ticks: { color: '#ffb74d' }, grid: { drawOnChartArea: false },
        },
      },
    },
    plugins: [cursorPlugin],
  });
}

const timeUnit = computed(() => (props.saveInterval > 0 ? 's' : 'Frame'));

function updateChartData() {
  const chart = chartInstance.value;
  const a = active.value;
  if (!chart || !a) return;
  const t = a.times;
  chart.data.datasets[0].data = t.map((x, i) => ({ x, y: a.Q[i] }));
  chart.data.datasets[1].data = t.map((x, i) => ({ x, y: a.HW[i] }));
  chart.data.datasets[2].data = t.map((x, i) => ({ x, y: a.TW[i] }));
  chart.data.datasets[3].data = a.hc != null ? t.map(x => ({ x, y: a.hc })) : [];
  chart.options.scales.x.title.text = `Zeit (${timeUnit.value})`;
  chart.$cursorX = t[currentIdx.value] ?? null;
  chart.update();
}

function updateCursor() {
  const chart = chartInstance.value, a = active.value;
  if (!chart || !a) return;
  chart.$cursorX = a.times[currentIdx.value] ?? null;
  chart.update('none');
}

const resetZoom = () => { if (chartInstance.value) chartInstance.value.resetZoom(); };

watch(() => props.series, updateChartData, { deep: true });
watch(selectedId, updateChartData);
watch(() => props.currentFrame, updateCursor);
// Nach dem Aufklappen war das Canvas display:none (Größe 0) — Chart neu einpassen.
watch(collapsed, (c) => { if (!c) requestAnimationFrame(() => chartInstance.value?.resize()); });
</script>

<style scoped>
.weir-panel {
  position: absolute;
  width: 540px;
  max-width: 92vw;
  background: var(--sv-surface);
  backdrop-filter: blur(16px);
  border-radius: var(--sv-radius);
  border: 1px solid var(--sv-border);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6), var(--sv-glow-violet);
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
  font-family: var(--sv-font);
  transition: width 0.15s ease;
}
/* Eingeklappt: schrumpft auf einen kleinen Icon-Button (~60% kleiner) — Klick öffnet wieder. */
.weir-panel.collapsed { width: auto; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); }
.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 14px; background: rgba(139, 92, 246, 0.12);
  border-bottom: 1px solid var(--sv-border);
}
.weir-panel.collapsed .panel-header {
  padding: 8px 10px; border-bottom: none; cursor: pointer;
}
.title { color: var(--sv-lime); font-weight: 600; font-size: 0.92rem; display: flex; align-items: center; gap: 8px; text-shadow: var(--sv-glow-lime); }
.icon { display: flex; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.reset-btn {
  background: rgba(139, 92, 246, 0.2); border: 1px solid var(--sv-border);
  color: var(--sv-text); font-size: 0.85rem; padding: 2px 8px; border-radius: 4px; cursor: pointer;
}
.reset-btn:hover { background: rgba(139, 92, 246, 0.4); }
.close-btn { background: none; border: none; color: var(--sv-text-dim); font-size: 1rem; cursor: pointer; padding: 0 4px; }
.close-btn:hover { color: var(--sv-lime); }

.panel-content { display: flex; flex-direction: column; overflow: hidden; }

.weir-tabs {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 14px;
  border-bottom: 1px solid rgba(139, 92, 246, 0.12);
}
.weir-tab {
  background: rgba(255, 255, 255, 0.05); border: 1px solid var(--sv-border);
  color: var(--sv-text-dim); font-size: 0.74rem; padding: 3px 10px; border-radius: 12px; cursor: pointer;
  max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--sv-font);
}
.weir-tab.active { background: rgba(139, 92, 246, 0.25); border-color: var(--sv-lime); color: var(--sv-lime); }

.weir-kpis {
  display: flex; flex-wrap: wrap; gap: 14px; padding: 7px 14px;
  background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(139, 92, 246, 0.12);
  font-size: 0.76rem; color: var(--sv-text);
}
.kpi b { color: var(--sv-text-dim); font-weight: 600; margin-right: 3px; }
.kpi-overtop { color: #ff7043; font-weight: 600; }

.panel-body { padding: 14px; height: 230px; }
.chart-container { position: relative; width: 100%; height: 100%; }
</style>
