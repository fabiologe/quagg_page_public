<template>
  <!-- Full-canvas overlay layer: SVG for leader lines + absolute-positioned HTML bubbles -->
  <div class="ann-overlay" :style="{ pointerEvents: 'none' }">
    <!-- Leader lines (SVG so they can have arrows/curves later) -->
    <svg class="ann-leaders" :width="canvasSize.w" :height="canvasSize.h">
      <line
        v-for="b in projected"
        :key="'l-' + b.id"
        :x1="b.pin.x" :y1="b.pin.y"
        :x2="b.label.x + 16" :y2="b.label.y + 16"
        :stroke="b.color" stroke-width="1.5"
        stroke-dasharray="4 3"
        opacity="0.7"
      />
    </svg>

    <!-- HTML speech bubbles -->
    <div
      v-for="b in projected"
      :key="b.id"
      class="ann-bubble"
      :class="{ dragging: _draggingId === b.id }"
      :style="{
        left:  b.label.x + 'px',
        top:   b.label.y + 'px',
        borderColor: b.color,
      }"
      @mousedown.stop="onMouseDown($event, b)"
    >
      <span class="ann-bubble-idx" :style="{ background: b.color }">#{{ b.idx }}</span>
      <span class="ann-bubble-text">{{ b.text || '(ohne Text)' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  annotations:     { type: Array,    default: () => [] }, // [{id, position, text, color, labelOffset, idx}]
  projectToScreen: { type: Function, default: null },     // (worldPos[3]) => {x, y}|null
  canvasEl:        { type: HTMLElement, default: null },
});

const emit = defineEmits(['offset-changed']);

const canvasSize = ref({ w: 0, h: 0 });
const _tick      = ref(0); // increments every animation frame to force re-projection
let _rafId       = null;
let _resizeObs   = null;

const _draggingId = ref(null);
let _dragStartOff = null;
let _dragStartMouse = null;

// Re-project every animation frame so bubbles follow camera movements
function _loop() {
  _tick.value++;
  _rafId = requestAnimationFrame(_loop);
}

function _updateSize() {
  const el = props.canvasEl;
  if (!el) return;
  const r = el.getBoundingClientRect();
  canvasSize.value = { w: r.width, h: r.height };
}

onMounted(() => {
  _loop();
  _updateSize();
  if (props.canvasEl && typeof ResizeObserver !== 'undefined') {
    _resizeObs = new ResizeObserver(_updateSize);
    _resizeObs.observe(props.canvasEl);
  }
});

onBeforeUnmount(() => {
  if (_rafId) cancelAnimationFrame(_rafId);
  _resizeObs?.disconnect();
});

// For each annotation, compute pin pos in screen-space + label pos (pin + offset)
const projected = computed(() => {
  // Trigger reactivity on every frame
  // eslint-disable-next-line no-unused-vars
  const _ = _tick.value;

  if (!props.projectToScreen) return [];
  const out = [];
  for (const a of props.annotations) {
    const pin = props.projectToScreen(a.position);
    if (!pin) continue;
    const off = a.labelOffset ?? [40, -60];
    out.push({
      id:    a.id,
      idx:   a.idx,
      text:  a.text,
      color: a.color ?? '#e91e63',
      pin,
      label: { x: pin.x + off[0], y: pin.y + off[1] },
    });
  }
  return out;
});

function onMouseDown(e, b) {
  _draggingId.value   = b.id;
  _dragStartMouse     = { x: e.clientX, y: e.clientY };
  const ann = props.annotations.find(a => a.id === b.id);
  _dragStartOff = ann?.labelOffset ? [...ann.labelOffset] : [40, -60];

  // Listen on document so drag works even outside the overlay
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup',   onMouseUp);
}

function onMouseMove(e) {
  if (_draggingId.value == null || !_dragStartOff) return;
  const dx = e.clientX - _dragStartMouse.x;
  const dy = e.clientY - _dragStartMouse.y;
  const newOff = [_dragStartOff[0] + dx, _dragStartOff[1] + dy];
  emit('offset-changed', { id: _draggingId.value, offset: newOff });
}

function onMouseUp() {
  _draggingId.value = null;
  _dragStartOff     = null;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup',   onMouseUp);
}
</script>

<style scoped>
.ann-overlay {
  position: absolute; inset: 0;
  z-index: 22;
  pointer-events: none; /* container is pass-through; only bubbles are clickable */
  overflow: hidden;
}
.ann-leaders {
  position: absolute; inset: 0;
  pointer-events: none;
}
.ann-bubble {
  position: absolute;
  display: flex; align-items: center; gap: 0.4rem;
  background: rgba(255,255,255,0.97);
  border: 2px solid #e91e63;
  border-radius: 8px;
  padding: 0.35rem 0.55rem 0.35rem 0.4rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  font-size: 0.72rem;
  color: #1a1a1a;
  max-width: 220px;
  pointer-events: auto;
  cursor: grab;
  user-select: none;
  transition: transform 0.1s;
}
.ann-bubble:hover { transform: translateY(-1px); }
.ann-bubble.dragging { cursor: grabbing; transition: none; }

.ann-bubble-idx {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  border-radius: 50%;
  color: #fff; font-weight: 700; font-size: 0.62rem;
  flex-shrink: 0;
}
.ann-bubble-text {
  line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis;
  white-space: pre-wrap;
  max-width: 180px;
}
</style>
