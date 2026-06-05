<template>
  <div class="vel-control">
    <div class="vc-title">Geschwindigkeit (m/s) — Farbbereich</div>

    <!-- Histogramm + Handles -->
    <div ref="chartWrap" class="vc-chart" @pointerdown="onTrackPointerDown">
      <canvas ref="canvas"></canvas>
      <!-- abgedunkelte Bereiche außerhalb [min,max] -->
      <div class="vc-mask" :style="{ left: '0%', width: minPct + '%' }"></div>
      <div class="vc-mask" :style="{ left: maxPct + '%', width: (100 - maxPct) + '%' }"></div>
      <!-- Handles -->
      <div class="vc-handle" :style="{ left: minPct + '%' }" @pointerdown.stop="startDrag('min', $event)"></div>
      <div class="vc-handle" :style="{ left: maxPct + '%' }" @pointerdown.stop="startDrag('max', $event)"></div>
    </div>

    <!-- Achsenbeschriftung -->
    <div class="vc-axis">
      <span>0</span>
      <span>{{ (globalMax * 0.5).toFixed(1) }}</span>
      <span>{{ globalMax.toFixed(1) }}</span>
    </div>

    <!-- Numerische Eingaben -->
    <div class="vc-inputs">
      <label>min <input type="number" :min="0" :max="max" step="0.1" :value="min" @change="onNumMin" /></label>
      <label>max <input type="number" :min="min" :max="globalMax" step="0.1" :value="max" @change="onNumMax" /></label>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps({
  histogram: { type: Object, default: () => ({ counts: [], maxCount: 0 }) }, // {counts:number[], maxCount}
  globalMax: { type: Number, default: 1.0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1.0 },
});
const emit = defineEmits(['update:min', 'update:max']);

const canvas = ref(null);
const chartWrap = ref(null);

const span = computed(() => (props.globalMax > 0 ? props.globalMax : 1));
const minPct = computed(() => clampPct((props.min / span.value) * 100));
const maxPct = computed(() => clampPct((props.max / span.value) * 100));
function clampPct(v) { return Math.min(100, Math.max(0, v)); }

// --- Velocity-Colormap (identisch zum Wasser-Shader) ---
const C = [
  [10, 51, 179],   // blau  (0.04,0.20,0.70)
  [0, 191, 255],   // cyan  (0.00,0.75,1.00)
  [255, 230, 0],   // gelb  (1.00,0.90,0.00)
  [217, 13, 13],   // rot   (0.85,0.05,0.05)
];
function lerp(a, b, t) { return a + (b - a) * t; }
function colormap(t) {
  t = Math.min(1, Math.max(0, t));
  let a, b, f;
  if (t < 0.3333) { a = C[0]; b = C[1]; f = t / 0.3333; }
  else if (t < 0.6666) { a = C[1]; b = C[2]; f = (t - 0.3333) / 0.3333; }
  else { a = C[2]; b = C[3]; f = (t - 0.6666) / 0.3334; }
  return `rgb(${Math.round(lerp(a[0], b[0], f))},${Math.round(lerp(a[1], b[1], f))},${Math.round(lerp(a[2], b[2], f))})`;
}

function draw() {
  const cv = canvas.value;
  const wrap = chartWrap.value;
  if (!cv || !wrap) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  if (W === 0 || H === 0) return;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const counts = props.histogram?.counts || [];
  const n = counts.length;
  if (n === 0) return;
  const maxCount = props.histogram.maxCount || 1;
  const barW = W / n;
  const lo = props.min, hi = props.max;
  const denom = Math.max(hi - lo, 1e-4);

  for (let i = 0; i < n; i++) {
    const c = counts[i];
    if (c <= 0) continue;
    const h = (c / maxCount) * (H - 2);
    // Farbe = was dieser Bin-Wert mit aktuellem [min,max] bekäme
    const binCenter = ((i + 0.5) / n) * span.value;
    const t = (binCenter - lo) / denom;
    ctx.fillStyle = colormap(t);
    ctx.fillRect(i * barW, H - h, Math.max(1, barW - 0.5), h);
  }
}

// --- Drag-Logik ---
let dragTarget = null;
function valueFromEvent(e) {
  const wrap = chartWrap.value;
  if (!wrap) return 0;
  const rect = wrap.getBoundingClientRect();
  const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
  return (x / rect.width) * span.value;
}
function startDrag(which, e) {
  dragTarget = which;
  e.preventDefault();
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
}
function onDragMove(e) {
  if (!dragTarget) return;
  const v = valueFromEvent(e);
  if (dragTarget === 'min') emit('update:min', Math.min(v, props.max - 1e-3));
  else emit('update:max', Math.max(v, props.min + 1e-3));
}
function onDragEnd() {
  dragTarget = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
}
// Klick auf die Spur → näheren Handle dorthin ziehen
function onTrackPointerDown(e) {
  const v = valueFromEvent(e);
  const dMin = Math.abs(v - props.min);
  const dMax = Math.abs(v - props.max);
  if (dMin <= dMax) emit('update:min', Math.min(v, props.max - 1e-3));
  else emit('update:max', Math.max(v, props.min + 1e-3));
}

// --- Numerische Eingaben ---
function onNumMin(e) {
  const v = Math.max(0, Math.min(parseFloat(e.target.value) || 0, props.max - 1e-3));
  emit('update:min', v);
}
function onNumMax(e) {
  const v = Math.min(span.value, Math.max(parseFloat(e.target.value) || 0, props.min + 1e-3));
  emit('update:max', v);
}

watch(() => [props.histogram, props.min, props.max, props.globalMax], () => nextTick(draw), { deep: true });

let ro = null;
onMounted(() => {
  nextTick(draw);
  if (typeof ResizeObserver !== 'undefined' && chartWrap.value) {
    ro = new ResizeObserver(() => draw());
    ro.observe(chartWrap.value);
  }
});
onBeforeUnmount(() => {
  if (ro) ro.disconnect();
  onDragEnd();
});
</script>

<style scoped>
.vel-control {
  background: rgba(15, 15, 30, 0.9);
  backdrop-filter: blur(12px);
  border-radius: 10px;
  padding: 10px 12px 12px;
  width: 320px;
  border: 1px solid rgba(79, 195, 247, 0.18);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
  user-select: none;
}
.vc-title {
  font-size: 0.7rem;
  color: #90a4ae;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  text-align: center;
}
.vc-chart {
  position: relative;
  width: 100%;
  height: 76px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.07);
  overflow: hidden;
  cursor: crosshair;
}
.vc-chart canvas { display: block; }
.vc-mask {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.vc-handle {
  position: absolute;
  top: -2px;
  width: 10px;
  height: calc(100% + 4px);
  margin-left: -5px;
  cursor: ew-resize;
  background: transparent;
}
.vc-handle::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 0;
  width: 2px;
  height: 100%;
  background: #fff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}
.vc-handle::after {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 14px;
  border-radius: 3px;
  background: #4fc3f7;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.6);
}
.vc-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
  font-size: 0.62rem;
  color: #b0bec5;
  font-variant-numeric: tabular-nums;
}
.vc-inputs {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
}
.vc-inputs label {
  flex: 1;
  font-size: 0.68rem;
  color: #90a4ae;
  display: flex;
  align-items: center;
  gap: 5px;
}
.vc-inputs input {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: #e0e0e0;
  padding: 3px 5px;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}
</style>
