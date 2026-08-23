<template>
  <button
    class="pdfed-pin"
    :class="{ 'ist-erledigt': notiz.erledigt, 'ist-offen': istOffen }"
    :style="{
      left: notiz.x * zoom + 'px',
      top: notiz.y * zoom + 'px',
      background: notiz.farbe,
    }"
    :title="notiz.text || 'Kommentar'"
    @pointerdown.stop="starteZug"
    @pointermove="bewege"
    @pointerup="beende"
    @pointercancel="brich"
  >
    {{ nummer }}
  </button>
</template>

<script setup>
/**
 * CommentPin — nummerierter Kommentar-Anker auf der Seite. Tippen öffnet das
 * Popover, Ziehen versetzt den Pin (Commit als EIN Undo-Schritt am Zugende).
 */
import { computed } from 'vue';
import { useAnnotStore } from '../stores/useAnnotStore';

const props = defineProps({
  notiz:  { type: Object, required: true },
  nummer: { type: Number, required: true },
  zoom:   { type: Number, required: true },
});

const annotStore = useAnnotStore();
const istOffen = computed(() => annotStore.offeneNotizId === props.notiz.id);

let zug = null;   // { pointerId, startX, startY, bewegt }

function starteZug(ev) {
  if (ev.button === 2) return;
  zug = { pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, bewegt: false };
  ev.currentTarget.setPointerCapture(ev.pointerId);
}

function bewege(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  if (Math.hypot(ev.clientX - zug.startX, ev.clientY - zug.startY) > 5) zug.bewegt = true;
  if (zug.bewegt) {
    // Live nachführen — der Commit in den Store kommt erst am Zugende.
    ev.currentTarget.style.left = (props.notiz.x * props.zoom + (ev.clientX - zug.startX)) + 'px';
    ev.currentTarget.style.top = (props.notiz.y * props.zoom + (ev.clientY - zug.startY)) + 'px';
  }
}

function beende(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  const { bewegt, startX, startY } = zug;
  zug = null;
  if (bewegt) {
    const dxPt = (ev.clientX - startX) / props.zoom;
    const dyPt = (ev.clientY - startY) / props.zoom;
    annotStore.aktualisiere([{
      id: props.notiz.id,
      patch: { x: props.notiz.x + dxPt, y: props.notiz.y + dyPt },
    }]);
    ev.currentTarget.style.left = '';
    ev.currentTarget.style.top = '';
  } else {
    annotStore.offeneNotizId = istOffen.value ? null : props.notiz.id;
  }
}

function brich(ev) {
  if (!zug || zug.pointerId !== ev.pointerId) return;
  zug = null;
  ev.currentTarget.style.left = '';
  ev.currentTarget.style.top = '';
}
</script>

<style scoped>
.pdfed-pin {
  position: absolute;
  transform: translate(-50%, -50%);
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: var(--pdf-schatten);
  pointer-events: auto;
  touch-action: none;
}
.pdfed-pin.ist-offen {
  outline: 3px solid var(--pdf-akzent-weich);
}
.pdfed-pin.ist-erledigt {
  opacity: 0.45;
}
</style>
