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
import { ref, computed } from 'vue';
import { useScreenProjection } from '../composables/useScreenProjection.js';

const props = defineProps({
  annotations:     { type: Array,    default: () => [] }, // [{id, position, text, color, labelOffset, idx}]
  projectToScreen: { type: Function, default: null },     // (worldPos[3]) => {x, y}|null
  canvasEl:        { type: HTMLElement, default: null },
  getCamera:       { type: Function, default: null },
});

const emit = defineEmits(['offset-changed']);

const _draggingId = ref(null);
let _dragStartOff = null;
let _dragStartMouse = null;

// Sprint U/AP-U4: Reprojektion nur bei bewegter Kamera oder geänderter
// Canvas-Größe — vorher lief hier eine blinde 60-Hz-Schleife, auch im Stillstand.
const { tick: _tick, groesse } = useScreenProjection({
  getCamera: () => props.getCamera?.() ?? null,
  getCanvas: () => props.canvasEl ?? null,
});
const canvasSize = computed(() => ({ w: groesse.value.w, h: groesse.value.h }));

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
  background: color-mix(in srgb, var(--cde-text-invert) 97%, transparent);
  border: 2px solid var(--cde-issue);
  border-radius: 8px;
  padding: 0.35rem 0.55rem 0.35rem 0.4rem;
  box-shadow: var(--cde-shadow-float);
  font-size: 0.72rem;
  color: var(--cde-hinweis-text);
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
  color: var(--cde-text-invert); font-weight: 700; font-size: 0.62rem;
  flex-shrink: 0;
}
.ann-bubble-text {
  line-height: 1.3;
  overflow: hidden; text-overflow: ellipsis;
  white-space: pre-wrap;
  max-width: 180px;
}
</style>
