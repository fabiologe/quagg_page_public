<template>
  <div
    class="volume-panel"
    :style="panelStyle"
  >
    <div
      class="panel-header"
      :style="headerStyle"
      @mousedown="startDrag"
    >
      <span class="title" :style="{ color: polygon.color }"><SvEmoji emoji="🧊" :size="14" /> Volumen-Analyse</span>
      <button class="clear-btn" @click.stop="handleClear" title="Polygon löschen">Löschen</button>
    </div>

    <div class="panel-body">
      <div v-if="!polygon" class="loading-state">
        Berechne...
      </div>
      <div v-else class="stats-container">
        <div class="stat-row main-volume">
          <span class="label">Aktuelles Volumen (Frame {{ currentFrame }})</span>
          <span class="value">{{ polygon.formattedVolume }} <span class="unit">m³</span></span>
        </div>

        <div class="stat-grid">
          <div class="stat-mini">
            <span class="label">Max-Volumen</span>
            <span class="value-sm">{{ formattedMax }} <span class="unit">m³</span></span>
          </div>
          <div class="stat-mini">
            <span class="label">Konfidenz</span>
            <span class="value-sm" :style="{ color: confidenceColor }">{{ confidencePct }} %</span>
          </div>
        </div>

        <div class="stat-row error-margin">
          <span class="label">Fehlermarge</span>
          <span class="value-sm">± {{ polygon.formattedError }} <span class="unit">m³</span></span>
        </div>

        <!-- Volumen-Ganglinie -->
        <div v-if="hasSeries" class="spark-wrap">
          <span class="label">Verlauf über die Zeit</span>
          <canvas ref="sparkCanvas" class="spark"></canvas>
        </div>

        <!-- DGM-Toleranz (global, fließt ins Fehlermodell) -->
        <label class="tol-row" title="Angenommene Höhenungenauigkeit des Geländemodells">
          <span>DGM-Toleranz (m)</span>
          <input type="number" min="0" step="0.01" v-model.number="zTol" />
        </label>

        <div class="info-text">
          Fehler = Randzellen (±50 %) ⊕ DGM-Höhenfehler (√N, unabhängig)
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useAnalysisStore } from '@/features/flood-2D/stores/useAnalysisStore';

const props = defineProps({
  polygon: Object,
  currentFrame: { type: Number, default: 0 },
});

const emit = defineEmits(['clearRequested']);

const analysisStore = useAnalysisStore();

const fmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const formattedMax = computed(() => fmt.format(props.polygon?.maxVolume || 0));
const confidencePct = computed(() => Math.round((props.polygon?.confidenceScore ?? 1) * 100));
const confidenceColor = computed(() => {
  const c = props.polygon?.confidenceScore ?? 1;
  return c > 0.85 ? '#66bb6a' : c > 0.6 ? '#ffb74d' : '#ff5252';
});
const hasSeries = computed(() => (props.polygon?.series?.length || 0) > 1);

// DGM-Toleranz ist global im Analysis-Store (alle Panels + Live-Berechnung teilen sie).
const zTol = computed({
  get: () => analysisStore.zTolerance,
  set: (v) => analysisStore.setZTolerance(v),
});

function handleClear() {
  if (props.polygon) emit('clearRequested', props.polygon.id);
}

// --- Sparkline (Volumen-Ganglinie) ---
const sparkCanvas = ref(null);
function drawSpark() {
  const cv = sparkCanvas.value;
  if (!cv) return;
  const series = props.polygon?.series || [];
  const maxV = props.polygon?.maxVolume || 0;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (series.length < 2 || maxV <= 0) return;

  const n = series.length;
  const pad = 3;
  const xAt = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
  const yAt = (v) => H - pad - (v / maxV) * (H - 2 * pad);
  const color = props.polygon?.color || '#00e5ff';

  // Fläche
  ctx.beginPath();
  ctx.moveTo(xAt(0), H - pad);
  for (let i = 0; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i].volume));
  ctx.lineTo(xAt(n - 1), H - pad);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.18);
  ctx.fill();

  // Linie
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const px = xAt(i), py = yAt(series[i].volume);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Marker am aktuellen Frame
  let idx = series.findIndex(s => s.frame === props.currentFrame);
  if (idx < 0) idx = 0;
  const mx = xAt(idx), my = yAt(series[idx].volume);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mx, pad); ctx.lineTo(mx, H - pad); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, Math.PI * 2); ctx.fill();
}
watch(() => [props.polygon?.series, props.currentFrame, props.polygon?.maxVolume],
  () => nextTick(drawSpark), { deep: true });

// --- Dragging Logic ---
const position = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let startMousePos = { x: 0, y: 0 };
let startPanelPos = { x: 0, y: 0 };

onMounted(() => {
  // Spawn panels slightly offset so they don't perfectly overlap
  const offset = Math.floor(Math.random() * 40);
  position.value.x = 24 + offset;
  position.value.y = 80 + offset;
  nextTick(drawSpark);
});

function startDrag(e) {
  if (e.target.tagName.toLowerCase() === 'button' || e.target.tagName.toLowerCase() === 'input') return;

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

onUnmounted(() => {
  window.removeEventListener('mousemove', onDrag);
  window.removeEventListener('mouseup', stopDrag);
});

const panelStyle = computed(() => ({
  left: `${position.value.x}px`,
  top: `${position.value.y}px`,
  borderColor: hexToRgba(props.polygon?.color || '#00e5ff', 0.6),
  boxShadow: `0 8px 32px ${hexToRgba(props.polygon?.color || '#000000', 0.15)}`
}));

const headerStyle = computed(() => ({
  backgroundColor: hexToRgba(props.polygon?.color || '#00e5ff', 0.15),
  cursor: isDragging.value ? 'grabbing' : 'grab'
}));

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
</script>

<style scoped>
.volume-panel {
  position: absolute;
  width: 320px;
  background: var(--sv-surface);
  backdrop-filter: blur(16px);
  border-radius: var(--sv-radius);
  border: 1px solid var(--sv-border);
  box-shadow: var(--sv-glow-violet);
  z-index: 20;
  overflow: hidden;
  font-family: var(--sv-font);
  color: var(--sv-text);
  transition: box-shadow 0.2s, border-color 0.2s;
  user-select: none;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--sv-border);
}

.title {
  font-weight: 600;
  font-size: 0.95rem;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.clear-btn {
  background: rgba(255, 82, 82, 0.15);
  border: 1px solid rgba(255, 82, 82, 0.5);
  color: #ff5252;
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(255, 82, 82, 0.3);
  color: #fff;
}

.panel-body {
  padding: 16px;
}

.loading-state {
  text-align: center;
  color: var(--sv-text-dim);
  font-style: italic;
}

.stats-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-grid {
  display: flex;
  gap: 12px;
}
.stat-mini {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 0.72rem;
  color: var(--sv-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.value {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--sv-text);
  font-variant-numeric: tabular-nums;
}

.value-sm {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--sv-text);
  font-variant-numeric: tabular-nums;
}

.error-margin .value-sm {
  color: #ffb74d;
}

.unit {
  font-size: 0.8rem;
  font-weight: 400;
  color: var(--sv-text-dim);
}

.spark-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.spark {
  width: 100%;
  height: 48px;
  display: block;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.tol-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.74rem;
  color: var(--sv-text-dim);
}
.tol-row input {
  width: 80px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--sv-border);
  border-radius: 4px;
  color: var(--sv-text);
  padding: 3px 6px;
  font-size: 0.78rem;
  font-family: var(--sv-font);
  font-variant-numeric: tabular-nums;
}

.info-text {
  font-size: 0.68rem;
  color: var(--sv-text-dim);
  border-top: 1px solid var(--sv-border);
  padding-top: 8px;
}
</style>
