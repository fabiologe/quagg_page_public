<template>
  <div
    class="pdfed-popover"
    :style="position"
    @pointerdown.stop
  >
    <textarea
      ref="textEl"
      v-model="text"
      class="pdfed-popover-text"
      rows="4"
      placeholder="Kommentar eingeben"
      @blur="speichere"
    ></textarea>
    <div class="pdfed-popover-leiste">
      <button
        class="pdfed-btn pdfed-popover-btn"
        :class="{ 'ist-aktiv': notiz.erledigt }"
        :title="notiz.erledigt ? 'Als offen markieren' : 'Als erledigt markieren'"
        @click="schalteErledigt"
      >
        <PdfIcon name="ok" :size="16" />
      </button>
      <button class="pdfed-btn pdfed-popover-btn" title="Kommentar löschen" @click="loesche">
        <PdfIcon name="loeschen" :size="16" />
      </button>
      <span class="pdfed-popover-frei"></span>
      <button class="pdfed-btn pdfed-popover-btn" title="Schließen" @click="schliesse">
        <PdfIcon name="schliessen" :size="16" />
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * CommentPopover — Texteingabe zu einem Kommentar-Pin, direkt neben dem Pin.
 * Der Text wird beim Verlassen/Schließen als EIN Undo-Schritt committet
 * (nicht je Tastendruck — das würde den Verlauf fluten).
 */
import { ref, computed, watch, nextTick } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useViewStore } from '../stores/useViewStore';

const props = defineProps({
  notiz:    { type: Object, required: true },
  zoom:     { type: Number, required: true },
  breitePt: { type: Number, required: true },
});

const annotStore = useAnnotStore();
const viewStore = useViewStore();
const textEl = ref(null);
const text = ref(props.notiz.text ?? '');

watch(() => props.notiz.id, () => { text.value = props.notiz.text ?? ''; });
watch(() => annotStore.offeneNotizId, async (id) => {
  if (id === props.notiz.id) {
    await nextTick();
    textEl.value?.focus();
  }
}, { immediate: true });

const BREITE_PX = 240;

const position = computed(() => {
  // Rechts neben dem Pin; klappt nach links, wenn der Seitenrand naht.
  const pinX = props.notiz.x * props.zoom;
  const seitenBreite = props.breitePt * props.zoom;
  const links = pinX + BREITE_PX + 40 > seitenBreite;
  return {
    left: (links ? pinX - BREITE_PX - 20 : pinX + 20) + 'px',
    top: Math.max(4, props.notiz.y * props.zoom - 16) + 'px',
    width: BREITE_PX + 'px',
    // Bei gedrehter Ansicht dreht der ganze Seitenstapel — die Karte samt
    // Textfeld dreht hier zurück, damit sie lesbar bleibt (sie hängt am
    // Pin, ihre Ecke ist der Drehpunkt).
    ...(viewStore.drehung
      ? { transform: `rotate(${-viewStore.drehung}deg)`, transformOrigin: '0 0' }
      : {}),
  };
});

function speichere() {
  if (text.value !== (props.notiz.text ?? '')) {
    annotStore.aktualisiere([{ id: props.notiz.id, patch: { text: text.value } }]);
  }
}

function schalteErledigt() {
  annotStore.aktualisiere([{ id: props.notiz.id, patch: { erledigt: !props.notiz.erledigt } }]);
}

function loesche() {
  annotStore.offeneNotizId = null;
  annotStore.entferne([props.notiz.id]);
}

function schliesse() {
  speichere();
  annotStore.offeneNotizId = null;
}
</script>

<style scoped>
.pdfed-popover {
  position: absolute;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  pointer-events: auto;
}
.pdfed-popover-text {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  background: var(--pdf-flaeche-2);
  color: var(--pdf-text);
  font: inherit;
  padding: 6px 8px;
  -webkit-user-select: text;
  user-select: text;
}
.pdfed-popover-leiste {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pdfed-popover-btn {
  min-height: 34px;
  min-width: 34px;
  padding: 0;
}
.pdfed-popover-frei { flex: 1; }
</style>
