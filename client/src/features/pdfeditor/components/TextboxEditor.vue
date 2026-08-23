<template>
  <div
    class="pdfed-textbox-editor"
    :style="editorStil"
    @pointerdown.stop
  >
    <textarea
      ref="textEl"
      v-model="text"
      class="pdfed-textbox-text"
      :style="textStil"
      rows="1"
      spellcheck="false"
      placeholder="Text eingeben"
      @input="passeGroesseAn"
    ></textarea>
    <div class="pdfed-textbox-leiste" @pointerdown.stop>
      <button
        v-for="g in TEXT_GROESSEN_PT"
        :key="g"
        class="pdfed-btn pdfed-textbox-btn pdfed-textbox-groesse"
        :class="{ 'ist-aktiv': lokal.schriftGroessePt === g }"
        :title="`Schriftgröße ${g} pt`"
        @click="lokal.schriftGroessePt = g"
      >{{ g }}</button>
      <span class="pdfed-textbox-trenner"></span>
      <button
        v-for="f in STIFT_FARBEN"
        :key="f"
        class="pdfed-textbox-farbe"
        :class="{ 'ist-aktiv': lokal.textFarbe === f }"
        :style="{ background: f }"
        :title="`Textfarbe`"
        @click="lokal.textFarbe = f"
      ></button>
      <span class="pdfed-textbox-trenner"></span>
      <button
        v-for="h in TEXT_HINTERGRUENDE"
        :key="h.wert"
        class="pdfed-textbox-farbe"
        :class="{ 'ist-aktiv': lokal.hintergrundFarbe === h.wert, 'ist-transparent': h.wert === 'transparent' }"
        :style="h.wert === 'transparent' ? {} : { background: h.wert }"
        :title="h.titel"
        @click="lokal.hintergrundFarbe = h.wert"
      ></button>
      <span class="pdfed-textbox-trenner"></span>
      <button class="pdfed-btn pdfed-textbox-btn" title="Textfeld löschen" @click="loesche">
        <PdfIcon name="loeschen" :size="15" />
      </button>
      <button class="pdfed-btn pdfed-textbox-btn ist-primaer" title="Fertig" @click="schliesse">
        <PdfIcon name="ok" :size="15" />
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * TextboxEditor — Bearbeitungsmodus eines Textfelds direkt auf der Seite.
 * Die textarea spiegelt Schriftgröße/Farben live (lokaler Zustand); der
 * Commit in den Store passiert beim Schließen als EIN Undo-Schritt.
 * Das Annotations-Canvas blendet das offene Feld derweil aus.
 */
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import PdfIcon from './PdfIcon.vue';
import { useAnnotStore } from '../stores/useAnnotStore';
import { STIFT_FARBEN, TEXT_GROESSEN_PT, TEXT_HINTERGRUENDE } from '../stores/useToolStore';
import { TEXTBOX_POLSTER_PT, TEXTBOX_ZEILENHOEHE } from '../services/TextboxMasse';

const props = defineProps({
  annot: { type: Object, required: true },
  zoom:  { type: Number, required: true },
});

const annotStore = useAnnotStore();
const textEl = ref(null);
const text = ref(props.annot.text ?? '');
const lokal = reactive({
  schriftGroessePt: props.annot.schriftGroessePt ?? 12,
  textFarbe: props.annot.textFarbe ?? '#111827',
  hintergrundFarbe: props.annot.hintergrundFarbe ?? 'transparent',
});

const editorStil = computed(() => ({
  left: props.annot.x * props.zoom + 'px',
  top: props.annot.y * props.zoom + 'px',
}));

const textStil = computed(() => ({
  fontSize: lokal.schriftGroessePt * props.zoom + 'px',
  lineHeight: String(TEXTBOX_ZEILENHOEHE),
  color: lokal.textFarbe,
  background: lokal.hintergrundFarbe === 'transparent' ? 'transparent' : lokal.hintergrundFarbe,
  padding: TEXTBOX_POLSTER_PT * props.zoom + 'px',
}));

function passeGroesseAn() {
  const el = textEl.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  el.style.width = 'auto';
  el.style.width = Math.max(80, el.scrollWidth + 4) + 'px';
}

watch(lokal, () => nextTick(passeGroesseAn));

function schliesse() {
  const a = props.annot;
  if (!text.value.trim()) {
    // Leeres Feld verwerfen — hinterlässt keinen unsichtbaren Rest.
    annotStore.entferne([a.id]);
  } else if (
    text.value !== a.text
    || lokal.schriftGroessePt !== a.schriftGroessePt
    || lokal.textFarbe !== a.textFarbe
    || lokal.hintergrundFarbe !== a.hintergrundFarbe
  ) {
    annotStore.aktualisiere([{ id: a.id, patch: { text: text.value, ...lokal } }]);
  }
  annotStore.offenesTextfeldId = null;
  annotStore.textfeldGeschlossenUm = performance.now();
}

function loesche() {
  annotStore.entferne([props.annot.id]);
  annotStore.offenesTextfeldId = null;
}

function aufAussenKlick(ev) {
  if (!ev.target.closest?.('.pdfed-textbox-editor')) schliesse();
}

onMounted(async () => {
  await nextTick();
  passeGroesseAn();
  textEl.value?.focus();
  setTimeout(() => window.addEventListener('pointerdown', aufAussenKlick, true), 0);
});
onBeforeUnmount(() => window.removeEventListener('pointerdown', aufAussenKlick, true));
</script>

<style scoped>
.pdfed-textbox-editor {
  position: absolute;
  z-index: 7;
  pointer-events: auto;
}
.pdfed-textbox-text {
  display: block;
  min-width: 80px;
  border: 1.5px dashed var(--pdf-akzent);
  border-radius: 2px;
  font-family: Helvetica, Arial, sans-serif;
  resize: none;
  overflow: hidden;
  white-space: pre;
  -webkit-user-select: text;
  user-select: text;
}
.pdfed-textbox-leiste {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  display: flex;
  flex-wrap: wrap;                 /* 7 Größen + Farben: zweizeilig statt endlos breit */
  align-items: center;
  gap: 3px;
  padding: 4px;
  max-width: 360px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius-klein);
  box-shadow: var(--pdf-schatten);
}
.pdfed-textbox-groesse {
  font-size: 12px;
  font-weight: 700;
}
.pdfed-textbox-btn {
  min-height: 32px;
  min-width: 32px;
  padding: 0;
}
.pdfed-textbox-trenner {
  width: 1px;
  height: 20px;
  background: var(--pdf-rand);
  margin: 0 3px;
}
.pdfed-textbox-farbe {
  width: 24px;
  height: 24px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
}
.pdfed-textbox-farbe.ist-aktiv { border-color: var(--pdf-akzent); }
.pdfed-textbox-farbe.ist-transparent {
  background:
    linear-gradient(to top right,
      transparent calc(50% - 1.5px), var(--pdf-fehler) calc(50% - 1.5px),
      var(--pdf-fehler) calc(50% + 1.5px), transparent calc(50% + 1.5px)),
    var(--pdf-flaeche);
  border-color: var(--pdf-rand-stark);
  border-width: 1px;
}
</style>
