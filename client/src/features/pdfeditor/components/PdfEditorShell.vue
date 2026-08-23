<template>
  <div class="pdfed-shell">
    <div v-if="docStore.ladeStatus === 'laedt'" class="pdfed-laedt-schleier">
      <PdfIcon name="laedt" :size="22" class="pdfed-laedt-kreisel" /> Dokument wird geladen
    </div>
    <PdfToolbar
      @schliessen="docStore.zeigeStartseite()"
      @zoom="f => scroller?.zoomeSchritt(f)"
      @breite="scroller?.passeBreiteAn()"
      @signatur="signaturDialogOffen = true"
      @export="exportDialogOffen = true"
      @lineal="scroller?.schalteLineal()"
    />
    <PdfPageScroller ref="scroller" />

    <SignatureDialog
      v-if="signaturDialogOffen"
      @schliessen="signaturDialogOffen = false"
    />
    <CalibrateDialog v-if="toolStore.kalibrierungAnfrage" />
    <ExportDialog
      v-if="exportDialogOffen"
      @schliessen="exportDialogOffen = false"
    />

    <div v-if="hinweisText" class="pdfed-hinweis">
      <PdfIcon :name="hinweisIcon" :size="16" />
      {{ hinweisText }}
      <button class="pdfed-btn" title="Abbrechen" @click="brichHinweisAktionAb">
        <PdfIcon name="schliessen" :size="15" />
      </button>
    </div>
  </div>
</template>

<script setup>
/**
 * PdfEditorShell — dünne Layoutschale um Toolbar und Seitenliste; dazu die
 * Dialoge (Signatur; Export/Kalibrierung folgen in ihren Stufen).
 * Tastatur: Strg+Z / Strg+Y (bzw. Strg+Umschalt+Z) für Undo/Redo,
 * Entf löscht die Lasso-Auswahl.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import PdfToolbar from './PdfToolbar.vue';
import PdfPageScroller from './PdfPageScroller.vue';
import SignatureDialog from './SignatureDialog.vue';
import CalibrateDialog from './CalibrateDialog.vue';
import ExportDialog from './ExportDialog.vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useToolStore } from '../stores/useToolStore';

const docStore = useDocStore();
const annotStore = useAnnotStore();
const toolStore = useToolStore();
const scroller = ref(null);
const signaturDialogOffen = ref(false);
const exportDialogOffen = ref(false);

const hinweisText = computed(() => {
  if (toolStore.signaturZumPlatzieren) {
    return 'Auf die Seite tippen, um die Signatur zu platzieren';
  }
  const m = toolStore.messungInArbeit;
  if (m?.kind === 'area') {
    return m.points.length < 3
      ? 'Eckpunkte der Fläche antippen'
      : 'Weitere Punkte antippen — zum Abschließen den ersten Punkt antippen';
  }
  if (m?.kind === 'distance') return 'Zweiten Punkt der Strecke antippen';
  if (m?.kind === 'kalibrieren') return 'Zweiten Punkt der Referenzstrecke antippen';
  if (toolStore.aktivesWerkzeug === 'messenStrecke' && !m) return 'Ersten Punkt der Strecke antippen';
  if (toolStore.aktivesWerkzeug === 'messenFlaeche' && !m) return 'Ersten Eckpunkt der Fläche antippen';
  if (toolStore.aktivesWerkzeug === 'kalibrieren' && !m) return 'Ersten Punkt einer bekannten Strecke antippen';
  // Die beiden Text-Werkzeuge wurden schon einmal verwechselt — der Hinweis
  // macht sichtbar, welches gerade aktiv ist und was es erwartet.
  if (toolStore.aktivesWerkzeug === 'textfeld' && !annotStore.offenesTextfeldId) {
    return 'Auf die Seite tippen, um ein Textfeld zu setzen';
  }
  if (toolStore.aktivesWerkzeug === 'textMarkieren') {
    return 'Text mit Stift oder Maus überstreichen — geht nur bei echtem Text, nicht auf Scans';
  }
  return '';
});

const hinweisIcon = computed(() => {
  if (toolStore.signaturZumPlatzieren) return 'signatur';
  if (toolStore.aktivesWerkzeug === 'textfeld') return 'textfeld';
  if (toolStore.aktivesWerkzeug === 'textMarkieren') return 'text-markieren';
  return 'messen';
});

function brichHinweisAktionAb() {
  if (toolStore.signaturZumPlatzieren) toolStore.signaturZumPlatzieren = null;
  toolStore.messungInArbeit = null;
  toolStore.waehleWerkzeug('stift');
}

function aufTaste(ev) {
  if (ev.target?.tagName === 'TEXTAREA' || ev.target?.tagName === 'INPUT') return;
  if (ev.key === 'Escape') {
    if (toolStore.messungInArbeit || toolStore.signaturZumPlatzieren) brichHinweisAktionAb();
    else if (annotStore.auswahl) annotStore.leereAuswahl();
    return;
  }
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    if (annotStore.auswahl) { ev.preventDefault(); annotStore.loescheAuswahl(); }
    return;
  }
  if (!(ev.ctrlKey || ev.metaKey)) return;
  const taste = ev.key.toLowerCase();
  if (taste === 'z' && ev.shiftKey) { ev.preventDefault(); annotStore.redo(); }
  else if (taste === 'z') { ev.preventDefault(); annotStore.undo(); }
  else if (taste === 'y') { ev.preventDefault(); annotStore.redo(); }
}

onMounted(() => window.addEventListener('keydown', aufTaste));
onBeforeUnmount(() => window.removeEventListener('keydown', aufTaste));
</script>

<style scoped>
.pdfed-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.pdfed-hinweis {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-akzent);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  color: var(--pdf-text);
  z-index: 20;
}
.pdfed-hinweis .pdfed-btn {
  min-height: 30px;
  min-width: 30px;
  padding: 0;
}
.pdfed-laedt-schleier {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: color-mix(in srgb, var(--pdf-bg) 65%, transparent);
  color: var(--pdf-text-dim);
  font-weight: 500;
}
.pdfed-laedt-kreisel { animation: pdfed-drehen 1s linear infinite; }
@keyframes pdfed-drehen { to { transform: rotate(360deg); } }
</style>
