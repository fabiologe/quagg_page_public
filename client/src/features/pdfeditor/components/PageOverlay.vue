<template>
  <div class="pdfed-overlay">
    <CommentPin
      v-for="(n, i) in notizen"
      :key="n.id"
      :notiz="n"
      :nummer="i + 1"
      :zoom="zoom"
    />
    <CommentPopover
      v-if="offeneNotiz"
      :notiz="offeneNotiz"
      :zoom="zoom"
      :breite-pt="breitePt"
    />
    <SelectionBox
      v-if="hatAuswahl"
      :index="index"
      :zoom="zoom"
      :breite-pt="breitePt"
      :hoehe-pt="hoehePt"
    />
    <MeasureHandles
      v-if="hatMessungen"
      :index="index"
      :zoom="zoom"
    />
    <!-- Textfelder: Treffer-Flächen zum Öffnen/Verschieben (nur im
         Textfeld-Werkzeug aktiv) + der Editor des offenen Felds -->
    <button
      v-for="t in textboxTreffer"
      :key="t.id"
      class="pdfed-textbox-treffer"
      :class="{ 'ist-aktiv': textfeldWerkzeugAktiv }"
      :style="t.stil"
      :title="'Textfeld bearbeiten/verschieben'"
      @pointerdown.stop="starteTextboxZug(t.annot, $event)"
      @pointermove="bewegeTextboxZug"
      @pointerup="beendeTextboxZug"
      @pointercancel="brichTextboxZug"
    ></button>
    <TextboxEditor
      v-if="offenesTextfeld"
      :annot="offenesTextfeld"
      :zoom="zoom"
    />
    <LinealOverlay
      v-if="toolStore.lineal?.page === index"
      :index="index"
      :zoom="zoom"
      :breite-pt="breitePt"
      :hoehe-pt="hoehePt"
    />
    <!-- Laufende Messung: Punkte + gestrichelte Verbindung -->
    <svg
      v-if="laufendeMessung"
      class="pdfed-messung-vorschau"
      :viewBox="`0 0 ${breitePt} ${hoehePt}`"
      preserveAspectRatio="none"
    >
      <polyline
        :points="laufendeMessung.points.map(p => p.join(',')).join(' ')"
        fill="none"
        stroke="#b91c1c"
        stroke-width="0.8"
        stroke-dasharray="3 2.5"
      />
      <circle
        v-for="(p, i) in laufendeMessung.points"
        :key="i"
        :cx="p[0]"
        :cy="p[1]"
        r="1.8"
        fill="#b91c1c"
      />
    </svg>
  </div>
</template>

<script setup>
/**
 * PageOverlay — die HTML-Schicht einer Seite: Kommentar-Pins, Popover,
 * Lasso-Auswahl. Der Container lässt Zeiger durch (pointer-events: none),
 * nur die interaktiven Kinder fangen sie (Muster IfcAnnotationOverlay).
 */
import { computed } from 'vue';
import CommentPin from './CommentPin.vue';
import CommentPopover from './CommentPopover.vue';
import SelectionBox from './SelectionBox.vue';
import MeasureHandles from './MeasureHandles.vue';
import TextboxEditor from './TextboxEditor.vue';
import LinealOverlay from './LinealOverlay.vue';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useToolStore } from '../stores/useToolStore';
import { textboxMasse } from '../services/TextboxMasse';

const props = defineProps({
  index:    { type: Number, required: true },
  zoom:     { type: Number, required: true },   // CSS-px je Seitenpunkt
  breitePt: { type: Number, required: true },
  hoehePt:  { type: Number, required: true },
});

const annotStore = useAnnotStore();

const notizen = computed(() =>
  (annotStore.proSeite.get(props.index) ?? [])
    .filter(a => a.type === 'note')
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0)));

const offeneNotiz = computed(() =>
  notizen.value.find(n => n.id === annotStore.offeneNotizId) ?? null);

const hatAuswahl = computed(() => annotStore.auswahl?.page === props.index);

const toolStore = useToolStore();

const hatMessungen = computed(() =>
  (annotStore.proSeite.get(props.index) ?? []).some(a => a.type === 'measure'));

const laufendeMessung = computed(() =>
  toolStore.messungInArbeit?.page === props.index ? toolStore.messungInArbeit : null);

// ── Textfelder ───────────────────────────────────────────────────────────────

const textfeldWerkzeugAktiv = computed(() => toolStore.aktivesWerkzeug === 'textfeld');

const offenesTextfeld = computed(() =>
  (annotStore.proSeite.get(props.index) ?? [])
    .find(a => a.type === 'textbox' && a.id === annotStore.offenesTextfeldId) ?? null);

const textboxTreffer = computed(() =>
  (annotStore.proSeite.get(props.index) ?? [])
    .filter(a => a.type === 'textbox' && a.id !== annotStore.offenesTextfeldId)
    .map((a) => {
      const masse = textboxMasse(a);
      return {
        id: a.id, annot: a,
        stil: {
          left: a.x * props.zoom + 'px',
          top: a.y * props.zoom + 'px',
          width: masse.breite * props.zoom + 'px',
          height: masse.hoehe * props.zoom + 'px',
        },
      };
    }));

let textboxZug = null;   // { annot, pointerId, startX, startY, bewegt, el }

function starteTextboxZug(annot, ev) {
  if (ev.button === 2) return;
  textboxZug = { annot, pointerId: ev.pointerId, startX: ev.clientX, startY: ev.clientY, bewegt: false, el: ev.currentTarget };
  ev.currentTarget.setPointerCapture(ev.pointerId);
}

function bewegeTextboxZug(ev) {
  if (!textboxZug || textboxZug.pointerId !== ev.pointerId) return;
  const dx = ev.clientX - textboxZug.startX, dy = ev.clientY - textboxZug.startY;
  if (Math.hypot(dx, dy) > 5) textboxZug.bewegt = true;
  if (textboxZug.bewegt) {
    textboxZug.el.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}

function beendeTextboxZug(ev) {
  if (!textboxZug || textboxZug.pointerId !== ev.pointerId) return;
  const { annot, startX, startY, bewegt, el } = textboxZug;
  textboxZug = null;
  el.style.transform = '';
  if (bewegt) {
    annotStore.aktualisiere([{
      id: annot.id,
      patch: {
        x: annot.x + (ev.clientX - startX) / props.zoom,
        y: annot.y + (ev.clientY - startY) / props.zoom,
      },
    }]);
  } else {
    annotStore.offenesTextfeldId = annot.id;
  }
}

function brichTextboxZug(ev) {
  if (!textboxZug || textboxZug.pointerId !== ev.pointerId) return;
  textboxZug.el.style.transform = '';
  textboxZug = null;
}
</script>

<style scoped>
.pdfed-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.pdfed-messung-vorschau {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.pdfed-textbox-treffer {
  position: absolute;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 2px;
  pointer-events: none;
  touch-action: none;
  cursor: move;
}
.pdfed-textbox-treffer.ist-aktiv {
  pointer-events: auto;
  outline: 1px dashed var(--pdf-rand-stark);
}
.pdfed-textbox-treffer.ist-aktiv:hover {
  outline-color: var(--pdf-akzent);
}
</style>
