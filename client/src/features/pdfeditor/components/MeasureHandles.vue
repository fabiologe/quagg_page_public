<template>
  <div class="pdfed-messgriffe">
    <template v-for="m in messungen" :key="m.id">
      <button
        v-for="(p, i) in m.points"
        :key="m.id + '-' + i"
        class="pdfed-messgriff"
        :style="griffStil(m, i, p)"
        title="Messpunkt verschieben"
        @pointerdown.stop="starteZug(m, i, $event)"
        @pointermove="bewege"
        @pointerup="beende"
        @pointercancel="brich"
      ></button>
    </template>
  </div>
</template>

<script setup>
/**
 * MeasureHandles — Nachfass-Griffe: jeder Messpunkt ist ein Ziel zum
 * Anfassen; der Commit (EIN Undo-Schritt) kommt am Zugende. Die Werte
 * rechnen sich live neu, weil sie nie eingefroren werden (MeasureMath).
 */
import { ref, computed } from 'vue';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useViewStore } from '../stores/useViewStore';
import { drehDelta } from '../services/AnsichtRotation';

const props = defineProps({
  index: { type: Number, required: true },
  zoom:  { type: Number, required: true },
});

const annotStore = useAnnotStore();
const viewStore = useViewStore();

/** Zieh-Delta vom Bildschirm in den Seitenraum (Ansichtsdrehung raus). */
function _dPt(ev) {
  return drehDelta(
    (ev.clientX - zug.startX) / props.zoom,
    (ev.clientY - zug.startY) / props.zoom,
    viewStore.drehung,
  );
}

const messungen = computed(() =>
  (annotStore.proSeite.get(props.index) ?? []).filter(a => a.type === 'measure'));

let zug = null;   // { messung, punktIndex, pointerId, startX, startY }
const delta = ref({ id: null, punktIndex: -1, dx: 0, dy: 0 });

function griffStil(m, i, p) {
  const bewegt = delta.value.id === m.id && delta.value.punktIndex === i;
  return {
    left: (p[0] + (bewegt ? delta.value.dx : 0)) * props.zoom + 'px',
    top: (p[1] + (bewegt ? delta.value.dy : 0)) * props.zoom + 'px',
  };
}

function starteZug(m, i, ev) {
  if (ev.button === 2) return;
  zug = { messung: m, punktIndex: i, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY };
  ev.currentTarget.setPointerCapture(ev.pointerId);
}

function bewege(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  const [dx, dy] = _dPt(ev);
  delta.value = { id: zug.messung.id, punktIndex: zug.punktIndex, dx, dy };
}

function beende(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  const { messung, punktIndex } = zug;
  const { dx, dy } = delta.value;
  zug = null;
  delta.value = { id: null, punktIndex: -1, dx: 0, dy: 0 };
  if (Math.hypot(dx, dy) * props.zoom > 2) {
    const points = messung.points.map((p, i) =>
      i === punktIndex ? [p[0] + dx, p[1] + dy] : p);
    annotStore.aktualisiere([{ id: messung.id, patch: { points } }]);
  }
}

function brich(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  zug = null;
  delta.value = { id: null, punktIndex: -1, dx: 0, dy: 0 };
}
</script>

<style scoped>
.pdfed-messgriffe {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.pdfed-messgriff {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid #b91c1c;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.65);
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}
.pdfed-messgriff:active { cursor: grabbing; }
</style>
