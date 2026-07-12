<template>
  <div class="net-panel" v-if="hasData" :style="panelStyle">
    <div class="panel-header" :style="headerStyle" @mousedown="startDrag">
      <div class="title"><span class="icon"><SvIcon name="Schacht.png" :size="14" color="currentColor" /></span> Kanalnetz</div>
      <div class="header-actions">
        <button class="reset-btn" @click.stop="resetZoom" title="Ansicht zurücksetzen">⟲</button>
        <button class="close-btn" @click.stop="collapsed = !collapsed" :title="collapsed ? 'Aufklappen' : 'Einklappen'">
          {{ collapsed ? '▸' : '▾' }}
        </button>
      </div>
    </div>

    <template v-if="!collapsed">
      <!-- Auswahl: System-Bilanz oder einzelnes Element -->
      <div class="net-controls" @mousedown.stop>
        <button class="net-tab" :class="{ active: selection === SYSTEM }" @click="selection = SYSTEM">
          System
        </button>
        <select class="net-select" :value="selection === SYSTEM ? '' : selection" @change="onSelect">
          <option value="" disabled>Element wählen…</option>
          <optgroup label="Schächte" v-if="nodeSeries.length">
            <option v-for="n in nodeSeries" :key="n.id" :value="n.id">
              {{ n.label }} ({{ typeLabel(n.type) }}){{ n.surcharged ? ' ⚠' : '' }}
            </option>
          </optgroup>
          <optgroup label="Haltungen" v-if="linkSeries.length">
            <option v-for="l in linkSeries" :key="l.id" :value="l.id">
              {{ l.label }} ({{ typeLabel(l.type) }})
            </option>
          </optgroup>
        </select>
      </div>

      <!-- Kennzahlen -->
      <div class="net-kpis" @mousedown.stop>
        <template v-if="selection === SYSTEM">
          <span class="kpi"><b>Volumen</b> {{ fmt(curSys('storedVolume'), 1) }} m³</span>
          <span class="kpi"><b>max</b> {{ fmt(system?.storedMax, 1) }} m³</span>
          <span class="kpi" v-if="budget"><b>1D→2D</b> {{ fmt(budget.to2d, 1) }} m³</span>
          <span class="kpi" v-if="budget"><b>2D→1D</b> {{ fmt(budget.to1d, 1) }} m³</span>
          <span class="kpi" v-if="budget" :class="{ 'kpi-warn': Math.abs(budget.debt) > 0.5 }">
            <b>Schuld</b> {{ fmt(budget.debt, 3) }} m³
          </span>
          <span class="kpi" v-if="massError != null" :class="{ 'kpi-warn': massError > 1 }">
            <b>2D-Fehler</b> {{ fmt(massError, 2) }} m³
          </span>
        </template>
        <template v-else-if="activeNode">
          <span class="kpi"><b>Wasserstand</b> {{ fmt(curVal(activeNode, 'depth'), 2) }} m</span>
          <span class="kpi"><b>max</b> {{ fmt(activeNode.depthMax, 2) }} m</span>
          <span class="kpi"><b>Deckel</b> {{ fmt(activeNode.maxDepth, 2) }} m</span>
          <span class="kpi kpi-warn" v-if="curVal(activeNode, 'flooding') > 0.0001">
            ⤴ Überstau {{ fmt(curVal(activeNode, 'flooding'), 3) }} m³/s
          </span>
        </template>
        <template v-else-if="activeLink">
          <span class="kpi"><b>Q</b> {{ fmt(curVal(activeLink, 'flow'), 3) }} m³/s</span>
          <span class="kpi"><b>Qmax</b> {{ fmt(activeLink.Qmax, 3) }} m³/s</span>
          <span class="kpi"><b>v</b> {{ fmt(curVal(activeLink, 'velocity'), 2) }} m/s</span>
          <span class="kpi" :class="{ 'kpi-warn': curVal(activeLink, 'capacity') >= 0.999 }">
            <b>Auslastung</b> {{ fmt(curVal(activeLink, 'capacity') * 100, 0) }} %
          </span>
        </template>
      </div>

      <div class="panel-body">
        <div class="chart-container"><canvas ref="chartCanvas"></canvas></div>
      </div>
    </template>
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
import { useNetworkStore } from '../../stores/useNetworkStore.js';
import { timeIndexAt } from '../../composables/viewer/useNetworkResults.js';

Chart.register(LineElement, PointElement, LineController, LinearScale, Filler, Tooltip, Legend, zoomPlugin);

const props = defineProps({
  nodeSeries: { type: Array, default: () => [] },   // aus useNetworkResults
  linkSeries: { type: Array, default: () => [] },
  system: { type: Object, default: null },
  budget: { type: Object, default: null },          // couplingBudget {to2d,to1d,debt,nodes}
  massReport: { type: Object, default: null },      // 2D-Massenbilanz (maxError)
  currentFrame: { type: Number, default: 0 },
  saveInterval: { type: Number, default: 0 },       // Sekunden je 2D-Frame
});

const SYSTEM = '__system__';
const collapsed = ref(false);
const selection = ref(SYSTEM);
const chartCanvas = ref(null);
const chartInstance = shallowRef(null);
const net = useNetworkStore();

const hasData = computed(() =>
  props.nodeSeries.length > 0 || props.linkSeries.length > 0);

const activeNode = computed(() => props.nodeSeries.find(n => n.id === selection.value) || null);
const activeLink = computed(() => props.linkSeries.find(l => l.id === selection.value) || null);
const massError = computed(() => props.massReport?.maxError ?? null);

const TYPE_LABELS = {
  junction: 'Schacht', outfall: 'Auslass', storage: 'Becken', divider: 'Verteiler',
  conduit: 'Haltung', pump: 'Pumpe', orifice: 'Drossel', weir: 'Wehr', outlet: 'Auslauf',
};
const typeLabel = (t) => TYPE_LABELS[t] ?? t;
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d));

function onSelect(e) {
  const id = e.target.value;
  if (!id) return;
  selection.value = id;
  net.select(id);   // Element auch im 3D-Netz hervorheben
}

// ── Zeit-Sync: 2D-Frame → Index in der 1D-Zeitachse ────────────────────────
const simTime = computed(() =>
  props.saveInterval > 0 ? props.currentFrame * props.saveInterval : props.currentFrame);
const times = computed(() =>
  activeNode.value?.times ?? activeLink.value?.times ?? props.system?.times ?? []);
const currentIdx = computed(() => timeIndexAt(times.value, simTime.value));

const curVal = (s, key) => s?.[key]?.[currentIdx.value] ?? 0;
const curSys = (key) => props.system?.[key]?.[currentIdx.value] ?? 0;

// ── Dragging (Muster WeirResultsPanel) ──────────────────────────────────────
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let startMousePos = { x: 0, y: 0 };
let startPanelPos = { x: 0, y: 0 };

function startDrag(e) {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'button' || tag === 'select' || tag === 'option') return;
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

const ACCENT = '#38bdf8';
const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
}));
const headerStyle = computed(() => ({ cursor: isDragging.value ? 'grabbing' : 'grab' }));

// Plugin: vertikale Linie am aktuellen Frame (liest chart.$cursorX)
const cursorPlugin = {
  id: 'netFrameCursor',
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
  position.value.x = Math.max(24, window.innerWidth - 590);
  position.value.y = 70;
  initChart();
  updateChartData();
});
onUnmounted(() => { if (chartInstance.value) chartInstance.value.destroy(); });

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
        legend: { display: true, position: 'top', labels: { color: '#e0e0e0', font: { size: 10 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: 'rgba(20,20,40,0.9)', titleColor: '#e0e0e0', bodyColor: '#e0e0e0',
          borderColor: 'rgba(56,189,248,0.3)', borderWidth: 1,
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
          title: { display: true, text: 'Zeit (s)', color: '#90a4ae' },
          ticks: { color: '#90a4ae', maxTicksLimit: 8 },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
        yL: {
          type: 'linear', position: 'left', beginAtZero: true,
          title: { display: true, text: '', color: ACCENT },
          ticks: { color: ACCENT }, grid: { color: 'rgba(255,255,255,0.08)' },
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

const ds = (label, axis, data, color, unit, extra = {}) => ({
  label, yAxisID: axis, data, borderColor: color, borderWidth: 1.8,
  pointRadius: 0, pointHoverRadius: 4, tension: 0.12, $unit: unit, ...extra,
});

function buildDatasets() {
  const t = times.value;
  const pts = (arr) => t.map((x, i) => ({ x, y: arr?.[i] ?? null }));
  if (selection.value === SYSTEM && props.system) {
    const s = props.system;
    return {
      yL: 'Volumen (m³)', yR: 'Q (m³/s)',
      datasets: [
        ds('Volumen im Netz', 'yL', pts(s.storedVolume), ACCENT, ' m³',
          { backgroundColor: 'rgba(56,189,248,0.22)', fill: 'start', order: 3 }),
        ds('Zufluss', 'yR', pts(s.inflow), '#66bb6a', ' m³/s', { order: 2 }),
        ds('Auslass', 'yR', pts(s.outflow), '#ffb74d', ' m³/s', { order: 1 }),
        ds('Überstau', 'yR', pts(s.flooding), '#ef5350', ' m³/s', { order: 0 }),
      ],
    };
  }
  const n = activeNode.value;
  if (n) {
    return {
      yL: 'Wasserstand (m)', yR: 'Q (m³/s)',
      datasets: [
        ds('Wasserstand', 'yL', pts(n.depth), ACCENT, ' m',
          { backgroundColor: 'rgba(56,189,248,0.22)', fill: 'start', order: 3 }),
        ds('Deckel', 'yL', n.maxDepth > 0 ? t.map(x => ({ x, y: n.maxDepth })) : [], '#ef5350', ' m',
          { borderDash: [2, 2], order: 2 }),
        ds('Zufluss', 'yR', pts(n.totalInflow), '#66bb6a', ' m³/s', { order: 1 }),
        ds('Überstau', 'yR', pts(n.flooding), '#ef5350', ' m³/s', { order: 0 }),
      ],
    };
  }
  const l = activeLink.value;
  if (l) {
    return {
      yL: 'Q (m³/s)', yR: 'h (m) / v (m/s)',
      datasets: [
        ds('Durchfluss Q', 'yL', pts(l.flow), ACCENT, ' m³/s',
          { backgroundColor: 'rgba(56,189,248,0.22)', fill: 'start', order: 3 }),
        ds('Fließtiefe', 'yR', pts(l.depth), '#ffb74d', ' m', { order: 2 }),
        ds('Vollfüllung', 'yR', l.maxDepth > 0 ? t.map(x => ({ x, y: l.maxDepth })) : [], '#ef5350', ' m',
          { borderDash: [2, 2], order: 1 }),
        ds('Geschwindigkeit', 'yR', pts(l.velocity), '#ce93d8', ' m/s', { order: 0, borderDash: [5, 3] }),
      ],
    };
  }
  return { yL: '', yR: '', datasets: [] };
}

// Cursor läuft mit der KONTINUIERLICHEN Frame-Zeit (nicht auf Report-Steps gerastert),
// nur in die 1D-Zeitachse geklemmt — sonst springt die Linie beim Abspielen ruckweise.
function cursorX() {
  const t = times.value;
  if (!t.length) return null;
  return Math.min(Math.max(simTime.value, t[0]), t[t.length - 1]);
}

function updateChartData() {
  const chart = chartInstance.value;
  if (!chart) return;
  const { yL, yR, datasets } = buildDatasets();
  chart.data.datasets = datasets;
  chart.options.scales.yL.title.text = yL;
  chart.options.scales.yR.title.text = yR;
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

// Auswahl gültig halten, wenn Serien neu ankommen (Re-Hydration)
watch(() => [props.nodeSeries, props.linkSeries], () => {
  if (selection.value !== SYSTEM && !activeNode.value && !activeLink.value) selection.value = SYSTEM;
  updateChartData();
});
watch(selection, updateChartData);
watch(() => props.currentFrame, updateCursor);
// 3D-Pick → Panel folgt (Auswahl im Netz-Store, z. B. Klick auf Schacht im Viewer)
watch(() => net.selectedId, (id) => {
  if (!id || id === selection.value) return;
  if (props.nodeSeries.some(n => n.id === id) || props.linkSeries.some(l => l.id === id)) {
    selection.value = id;
  }
});
</script>

<style scoped>
.net-panel {
  position: absolute;
  width: 560px;
  max-width: 92vw;
  background: rgba(20, 20, 40, 0.92);
  backdrop-filter: blur(16px);
  border-radius: 12px;
  border: 1px solid rgba(56, 189, 248, 0.3);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  z-index: 20;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}
.panel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 14px; background: rgba(56, 189, 248, 0.12);
  border-bottom: 1px solid rgba(56, 189, 248, 0.2);
}
.title { color: #e0e0e0; font-weight: 600; font-size: 0.92rem; display: flex; align-items: center; gap: 8px; }
.icon { font-size: 1.15rem; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.reset-btn {
  background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.4);
  color: #e0e0e0; font-size: 0.85rem; padding: 2px 8px; border-radius: 4px; cursor: pointer;
}
.reset-btn:hover { background: rgba(56, 189, 248, 0.4); }
.close-btn { background: none; border: none; color: #90a4ae; font-size: 1rem; cursor: pointer; padding: 0 4px; }
.close-btn:hover { color: #fff; }

.net-controls {
  display: flex; gap: 8px; align-items: center; padding: 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.net-tab {
  background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12);
  color: #b0bec5; font-size: 0.76rem; padding: 3px 12px; border-radius: 12px; cursor: pointer;
}
.net-tab.active { background: rgba(56, 189, 248, 0.25); border-color: rgba(56, 189, 248, 0.6); color: #fff; }
.net-select {
  flex: 1; min-width: 0; background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14); color: #e0e0e0;
  font-size: 0.78rem; padding: 3px 8px; border-radius: 6px;
}
.net-select optgroup, .net-select option { background: #16162a; color: #e0e0e0; }

.net-kpis {
  display: flex; flex-wrap: wrap; gap: 14px; padding: 7px 14px;
  background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.76rem; color: #cfd8dc;
}
.kpi b { color: #90a4ae; font-weight: 600; margin-right: 3px; }
.kpi-warn { color: #ff7043; font-weight: 600; }

.panel-body { padding: 14px; height: 230px; }
.chart-container { position: relative; width: 100%; height: 100%; }
</style>
