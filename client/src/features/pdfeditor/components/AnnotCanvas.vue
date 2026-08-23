<template>
  <canvas ref="canvasEl" class="pdfed-annot-canvas"></canvas>
</template>

<script setup>
/**
 * AnnotCanvas — alle COMMITTETEN Annotationen einer Seite.
 *
 * Zeichnet über den CanvasAnnotDoc-Adapter durch DIESELBE Painter-Routine
 * wie der PDF-Export (Stufe 6). Redraws sind rAF-koalesziert; die Skala ist
 * exakt die des PDF-Canvas derselben Seite (renderScaleFuer), sonst lägen
 * Tinte und Seiteninhalt beim Zoomen nicht deckungsgleich.
 */
import { ref, computed, watch, onMounted } from 'vue';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useDocStore } from '../stores/useDocStore';
import { renderScaleFuer } from '../services/PdfEngine';
import { erstelleCanvasAnnotDoc } from '../services/CanvasAnnotDoc';
import { zeichneAnnotationen } from '../services/AnnotationPainter';
import { kalibrierungFuerSeite } from '../services/MeasureMath';

const props = defineProps({
  index:      { type: Number, required: true },
  breitePt:   { type: Number, required: true },
  hoehePt:    { type: Number, required: true },
  renderZoom: { type: Number, required: true },
});

const annotStore = useAnnotStore();
const docStore = useDocStore();
const canvasEl = ref(null);

const messKontext = computed(() =>
  kalibrierungFuerSeite(docStore.meta?.kalibrierung, props.index));

const itemsDerSeite = computed(() => annotStore.proSeite.get(props.index) ?? []);
const skala = computed(() => renderScaleFuer(props.breitePt, props.hoehePt, props.renderZoom));

// Ausgewählte Objekte zeichnet die SelectionBox (SVG, live verschiebbar) —
// hier ausblenden, sonst erschienen sie doppelt. Notiz-Pins sind am
// Bildschirm HTML (PageOverlay), im Export zeichnet sie der Exporter.
const OHNE_TYPEN = new Set(['note']);
const ausgenommen = computed(() => {
  const menge = new Set(
    annotStore.auswahl?.page === props.index ? annotStore.auswahl.ids : []);
  // Das gerade bearbeitete Textfeld zeichnet der TextboxEditor (HTML).
  if (annotStore.offenesTextfeldId) menge.add(annotStore.offenesTextfeldId);
  return menge;
});

let rafGeplant = false;

function _zeichne() {
  rafGeplant = false;
  const canvas = canvasEl.value;
  if (!canvas) return;
  const b = Math.max(1, Math.floor(props.breitePt * skala.value));
  const h = Math.max(1, Math.floor(props.hoehePt * skala.value));
  if (canvas.width !== b || canvas.height !== h) {
    canvas.width = b;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, b, h);
  if (!itemsDerSeite.value.length) return;
  const doc = erstelleCanvasAnnotDoc(ctx, { skala: skala.value });
  zeichneAnnotationen(doc, itemsDerSeite.value, {
    ohneTypen: OHNE_TYPEN,
    ausgenommen: ausgenommen.value,
    messKontext: messKontext.value,
  });
}

function _planeZeichnen() {
  if (rafGeplant) return;
  rafGeplant = true;
  requestAnimationFrame(_zeichne);
}

watch([itemsDerSeite, skala, ausgenommen, messKontext], _planeZeichnen);
onMounted(_planeZeichnen);
</script>

<style scoped>
.pdfed-annot-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
