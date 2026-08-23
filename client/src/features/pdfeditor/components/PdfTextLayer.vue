<template>
  <div
    ref="el"
    class="pdfed-textlayer"
    :class="{ 'ist-aktiv': aktiv }"
    :data-seite="index"
  ></div>
</template>

<script setup>
/**
 * PdfTextLayer — die pdf.js-Textschicht einer Seite: transparente Spans über
 * den Glyphen, damit Text nativ ausgewählt werden kann. Wird nur gebaut,
 * wenn das Text-Markier-Werkzeug aktiv ist (lazy), und nur dann bekommt sie
 * Zeigerereignisse; sonst stört sie die Zeichenwerkzeuge nicht.
 *
 * pdf.js 4.x positioniert die Spans über die CSS-Variable --scale-factor auf
 * dem Container — die MUSS zur Viewport-Skala passen, sonst sitzt alles
 * verschoben. Während einer Zoomgeste (viewStore.gesteAktiv) skaliert der
 * Host-Transform die Schicht mit; neu gebaut wird erst nach dem Commit.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { TextLayer } from 'pdfjs-dist';
import { useDocStore } from '../stores/useDocStore';
import { useViewStore } from '../stores/useViewStore';
import { useToolStore } from '../stores/useToolStore';

const props = defineProps({
  index:    { type: Number, required: true },
  zoom:     { type: Number, required: true },   // CSS-px je Seitenpunkt
  breitePt: { type: Number, required: true },
});

const docStore = useDocStore();
const viewStore = useViewStore();
const toolStore = useToolStore();

const el = ref(null);
const aktiv = computed(() => toolStore.aktivesWerkzeug === 'textMarkieren');

let layer = null;
let bauNr = 0;
let bauTimer = 0;

async function _baue() {
  const nr = ++bauNr;
  layer?.cancel();
  layer = null;
  if (!el.value || !aktiv.value) return;
  const dok = docStore.pdfDok;
  if (!dok) return;
  let seite;
  try { seite = await dok.holeSeite(props.index); }
  catch { return; }
  if (nr !== bauNr || !el.value) return;

  el.value.textContent = '';
  el.value.style.setProperty('--scale-factor', String(props.zoom));
  const viewport = seite.getViewport({ scale: props.zoom });
  layer = new TextLayer({
    textContentSource: seite.streamTextContent(),
    container: el.value,
    viewport,
  });
  try { await layer.render(); }
  catch { /* Abbruch beim Werkzeug-/Zoomwechsel */ }
}

function _planeBau() {
  clearTimeout(bauTimer);
  bauTimer = setTimeout(_baue, 150);
}

watch(aktiv, (a) => { if (a) _baue(); else { layer?.cancel(); layer = null; if (el.value) el.value.textContent = ''; } });
watch(() => props.zoom, () => { if (aktiv.value && !viewStore.gesteAktiv) _planeBau(); });
watch(() => viewStore.gesteAktiv, (g) => { if (!g && aktiv.value) _planeBau(); });

onMounted(() => { if (aktiv.value) _baue(); });
onBeforeUnmount(() => {
  bauNr++;
  clearTimeout(bauTimer);
  layer?.cancel();
});
</script>

<style scoped>
.pdfed-textlayer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  line-height: 1;
  text-size-adjust: none;
  forced-color-adjust: none;
  caret-color: transparent;
  pointer-events: none;
  z-index: 2;
}
.pdfed-textlayer.ist-aktiv {
  pointer-events: auto;
  cursor: text;
  -webkit-user-select: text;
  user-select: text;
}
.pdfed-textlayer :deep(span) {
  color: transparent;
  position: absolute;
  white-space: pre;
  transform-origin: 0% 0%;
}
.pdfed-textlayer :deep(br) {
  -webkit-user-select: none;
  user-select: none;
}
.pdfed-textlayer :deep(::selection) {
  background: rgba(15, 118, 110, 0.35);
}
</style>
