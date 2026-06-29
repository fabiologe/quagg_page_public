<template>
  <div class="section-chart-panel" v-if="section && section.data && section.data.length > 0" :style="panelStyle">
    <div class="panel-header" :style="headerStyle" @mousedown="startDrag">
      <div class="title" :style="{ color: section.color }">
        <span class="icon">📏</span> Querschnitt (Frame {{ currentFrame }})
      </div>
      <div class="header-actions">
        <button class="reset-btn" @click.stop="resetZoom" title="Ansicht zurücksetzen">⟲ Reset</button>
        <button class="close-btn" @click.stop="handleClose" title="Schließen">&times;</button>
      </div>
    </div>

    <!-- Steuerleiste: Relativ-Bezug + Glättung -->
    <div class="panel-controls" @mousedown.stop>
      <label class="ctrl-toggle" :title="'Höhen relativ zur tiefsten Sohle im Schnitt'">
        <input type="checkbox" v-model="relativeMode" />
        <span>Relativ</span>
      </label>
      <label class="ctrl-slider" title="Gleitender Mittelwert — glättet Spikes im Wasserspiegel/Gelände">
        <span>🪥 Glättung</span>
        <input type="range" min="0" max="8" step="1" v-model.number="smoothWindow" />
        <span class="ctrl-val">{{ smoothWindow === 0 ? 'aus' : smoothWindow }}</span>
      </label>
      <span v-if="section.structures && section.structures.length" class="ctrl-info">
        🏗️ {{ section.structures.length }} Bauwerk{{ section.structures.length === 1 ? '' : 'e' }}
      </span>
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
  Chart, LineElement, PointElement, LineController,
  LinearScale, Filler, Tooltip, Legend
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

Chart.register(LineElement, PointElement, LineController, LinearScale, Filler, Tooltip, Legend, zoomPlugin);

const props = defineProps({
  section: { type: Object, required: true },
  currentFrame: { type: Number, default: 0 },
});

const emit = defineEmits(['closeRequested']);
function handleClose() { if (props.section) emit('closeRequested', props.section.id); }

const chartCanvas = ref(null);
const chartInstance = shallowRef(null);

// Anzeige-Optionen (lokal je Panel)
const relativeMode = ref(false);   // Höhen relativ zur Sohle
const smoothWindow = ref(0);       // gleitender Mittelwert (0 = aus)

// ── Dragging ────────────────────────────────────────────────────────────────
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let startMousePos = { x: 0, y: 0 };
let startPanelPos = { x: 0, y: 0 };

onMounted(() => {
  const offset = Math.floor(Math.random() * 40);
  position.value.x = 24 + offset;
  position.value.y = window.innerHeight - 380 - offset;
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
  position.value.x = startPanelPos.x + (e.clientX - startMousePos.x);
  position.value.y = Math.max(0, startPanelPos.y + (e.clientY - startMousePos.y));
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
  boxShadow: `0 10px 40px ${hexToRgba(props.section?.color || '#000000', 0.15)}`,
}));
const headerStyle = computed(() => ({
  backgroundColor: hexToRgba(props.section?.color || '#4fc3f7', 0.15),
  cursor: isDragging.value ? 'grabbing' : 'grab',
}));
function hexToRgba(hex, alpha) {
  if (!hex) return '';
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Glättung: gleitender Mittelwert (zentriert, ignoriert null) ───────────────
function smooth(arr, win) {
  if (!win || win < 1) return arr;
  const n = arr.length, out = new Array(n), w = Math.floor(win);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -w; k <= w; k++) {
      const j = i + k;
      if (j >= 0 && j < n && arr[j] != null && isFinite(arr[j])) { s += arr[j]; c++; }
    }
    out[i] = c ? s / c : arr[i];
  }
  return out;
}

// Plugin: zeichnet gekreuzte Wehre/Brücken in Schnitt-Distanz (liest chart.$secMeta).
const structuresPlugin = {
  id: 'sectionStructures',
  afterDatasetsDraw(chart) {
    const meta = chart.$secMeta;
    if (!meta || !meta.structures?.length) return;
    const { structures, yOffset } = meta;
    const xS = chart.scales.x, yS = chart.scales.y, ctx = chart.ctx, area = chart.chartArea;
    ctx.save();
    for (const s of structures) {
      const xpx = xS.getPixelForValue(s.distance);
      if (xpx < area.left - 2 || xpx > area.right + 2) continue;

      if (s.kind === 'pier') {
        // Massiver Pfeiler: Gründung (floorZ, sonst Chart-Boden) bis Kopf (topZ),
        // über die reale Footprint-Breite d0..d1.
        let xL, xR;
        if (s.d0 != null && s.d1 != null && s.d1 - s.d0 > 1e-3) {
          xL = xS.getPixelForValue(s.d0); xR = xS.getPixelForValue(s.d1);
          if (xR - xL < 4) { const m = (xL + xR) / 2; xL = m - 2; xR = m + 2; }
        } else { xL = xpx - 4; xR = xpx + 4; }
        let yTop = yS.getPixelForValue((s.topZ ?? 0) - yOffset);
        let yBot = s.floorZ != null ? yS.getPixelForValue(s.floorZ - yOffset) : area.bottom;
        yTop = Math.max(area.top, Math.min(yTop, area.bottom));
        yBot = Math.max(area.top, Math.min(yBot, area.bottom));
        ctx.fillStyle = 'rgba(96,100,116,0.95)';
        ctx.fillRect(xL, yTop, xR - xL, Math.max(1, yBot - yTop));
        ctx.strokeStyle = 'rgba(60,64,78,0.95)'; ctx.lineWidth = 1;
        ctx.strokeRect(xL, yTop, xR - xL, Math.max(1, yBot - yTop));
      } else if (s.kind === 'weir') {
        const yc = yS.getPixelForValue((s.crest ?? 0) - yOffset);
        ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(xpx, area.bottom); ctx.lineTo(xpx, yc); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ff9800';
        ctx.beginPath(); ctx.moveTo(xpx - 5, yc); ctx.lineTo(xpx + 5, yc); ctx.lineTo(xpx, yc - 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffcc80'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`Wehr${s.crest != null ? ' ' + s.crest.toFixed(2) + 'm' : ''}`, xpx, yc - 13);
      } else if (s.kind === 'bridge') {
        const ySohle = yS.getPixelForValue((s.z_sohle ?? 0) - yOffset);
        const ySoffit = yS.getPixelForValue((s.soffit ?? 0) - yOffset);
        const yDeck = yS.getPixelForValue((s.deck ?? 0) - yOffset);
        // Reale Bauwerksbreite nutzen, falls Schnitt das Footprint-Polygon kreuzt
        // (Ein-/Austritt d0..d1); sonst feste Pixelbreite.
        let xL, xR;
        if (s.d0 != null && s.d1 != null && s.d1 - s.d0 > 1e-3) {
          xL = xS.getPixelForValue(s.d0); xR = xS.getPixelForValue(s.d1);
          if (xR - xL < 6) { const m = (xL + xR) / 2; xL = m - 3; xR = m + 3; } // Mindestbreite
        } else {
          xL = xpx - 7; xR = xpx + 7;
        }
        const w = xR - xL;
        // Deck (Soffit→Deck) massiv
        ctx.fillStyle = 'rgba(120,124,140,0.9)';
        ctx.fillRect(xL, yDeck, w, Math.max(1, ySoffit - yDeck));
        // Öffnung (Sohle→Soffit) als Rahmen
        ctx.strokeStyle = 'rgba(200,205,215,0.95)'; ctx.lineWidth = 1.5;
        ctx.strokeRect(xL, ySoffit, w, Math.max(1, ySohle - ySoffit));
        // Soffit (lichte Höhe) betonen
        ctx.strokeStyle = '#b0bec5'; ctx.beginPath();
        ctx.moveTo(xL - 3, ySoffit); ctx.lineTo(xR + 3, ySoffit); ctx.stroke();
        ctx.fillStyle = '#cfd8dc'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Brücke', (xL + xR) / 2, yDeck - 4);
      }
    }
    ctx.restore();
  },
};

const initChart = () => {
  if (!chartCanvas.value) return;
  const ctx = chartCanvas.value.getContext('2d');
  chartInstance.value = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Wasserspiegel', data: [],
          borderColor: 'rgba(79, 195, 247, 0.85)', backgroundColor: 'rgba(79, 195, 247, 0.40)',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: 1, tension: 0.1, order: 2,
          spanGaps: true,
        },
        {
          label: 'Gelände', data: [],
          borderColor: '#2d5f3f', backgroundColor: '#1e3f2a',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: 'start', tension: 0.1, order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { color: '#e0e0e0', font: { size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(20, 20, 40, 0.9)', titleColor: '#e0e0e0', bodyColor: '#e0e0e0',
          borderColor: 'rgba(79, 195, 247, 0.3)', borderWidth: 1,
          callbacks: {
            title: (c) => `Distanz: ${c[0].parsed.x.toFixed(1)} m`,
            label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(2)} m`,
          },
        },
        zoom: {
          pan: { enabled: true, mode: 'xy' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Distanz (m)', color: '#90a4ae' },
          ticks: { color: '#90a4ae', maxTicksLimit: 10 },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
        },
        y: {
          title: { display: true, text: 'Höhe (m)', color: '#90a4ae' },
          ticks: { color: '#90a4ae' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
        },
      },
    },
    plugins: [structuresPlugin],
  });
};

const updateChartData = () => {
  const chart = chartInstance.value;
  if (!chart || !props.section?.data?.length) return;
  const pts = props.section.data;

  const dist = pts.map(d => d.distance);
  const terrRaw = pts.map(d => d.terrainZ);
  const depthRaw = pts.map(d => (d.waterDepth > 0 ? d.waterDepth : 0));

  const terr = smooth(terrRaw, smoothWindow.value);
  const depth = smooth(depthRaw, smoothWindow.value);

  // Relativ-Bezug: tiefste (geglättete) Sohle = 0
  const yOffset = relativeMode.value ? Math.min(...terr) : 0;

  const terrainData = dist.map((x, i) => ({ x, y: terr[i] - yOffset }));
  const waterData = dist.map((x, i) => {
    const wl = depth[i] > 0.001 ? terr[i] + depth[i] : terr[i]; // trocken: auf Gelände
    return { x, y: wl - yOffset };
  });

  // Y-Bereich mit etwas Luft — Bauwerke MIT einbeziehen, sonst werden Wehr-Kronen
  // bzw. Brücken-Decks oben abgeschnitten (war in Relativ-Ansicht der „Bug").
  let yLo = Math.min(...terrainData.map(p => p.y));
  let yHi = Math.max(...waterData.map(p => p.y));
  for (const s of (props.section.structures || [])) {
    const vals = s.kind === 'weir' ? [s.crest]
      : s.kind === 'pier' ? [s.floorZ, s.topZ]
      : [s.z_sohle, s.soffit, s.deck];
    for (const v of vals) {
      if (v == null || !isFinite(v)) continue;
      const rv = v - yOffset;
      if (rv < yLo) yLo = rv;
      if (rv > yHi) yHi = rv;
    }
  }
  const span = Math.max(0.1, yHi - yLo);
  chart.options.scales.y.suggestedMin = yLo - span * 0.08 - 0.3;
  chart.options.scales.y.suggestedMax = yHi + span * 0.08 + 0.3;
  chart.options.scales.y.title.text = relativeMode.value ? 'Höhe ü. Sohle (m)' : 'Höhe (m)';

  chart.data.datasets[0].data = waterData;
  chart.data.datasets[1].data = terrainData;
  chart.$secMeta = { structures: props.section.structures || [], yOffset };
  chart.update();
};

const resetZoom = () => { if (chartInstance.value) chartInstance.value.resetZoom(); };

onUnmounted(() => { if (chartInstance.value) chartInstance.value.destroy(); });

watch(() => props.section.data, updateChartData, { deep: true });
watch([relativeMode, smoothWindow], updateChartData);
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

.title { color: #e0e0e0; font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; }
.icon { font-size: 1.2rem; }
.header-actions { display: flex; align-items: center; gap: 12px; }

.panel-controls {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 7px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.78rem;
  color: #b0bec5;
}
.ctrl-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.ctrl-toggle input { cursor: pointer; }
.ctrl-slider { display: flex; align-items: center; gap: 8px; }
.ctrl-slider input[type="range"] { width: 110px; cursor: pointer; }
.ctrl-val { min-width: 22px; text-align: right; font-variant-numeric: tabular-nums; color: #90a4ae; }
.ctrl-info { margin-left: auto; color: #cfd8dc; }

.reset-btn {
  background: rgba(79, 195, 247, 0.2);
  border: 1px solid rgba(79, 195, 247, 0.4);
  color: #e0e0e0; font-size: 0.8rem; padding: 4px 10px; border-radius: 4px; cursor: pointer; transition: all 0.2s;
}
.reset-btn:hover { background: rgba(79, 195, 247, 0.4); color: #fff; }
.close-btn {
  background: none; border: none; color: #90a4ae; font-size: 1.5rem; cursor: pointer; line-height: 1; padding: 0 4px; transition: color 0.2s;
}
.close-btn:hover { color: #ff5252; }

.panel-body { padding: 16px; height: 250px; }
.chart-container { position: relative; width: 100%; height: 100%; }
</style>
