<template>
  <div class="pdfed-shell">
    <div v-if="docStore.ladeStatus === 'laedt'" class="pdfed-laedt-schleier">
      <PdfIcon name="laedt" :size="22" class="pdfed-laedt-kreisel" /> Dokument wird geladen
    </div>
    <PdfToolbar
      @schliessen="docStore.zeigeStartseite()"
      @zoom="f => scroller?.zoomeSchritt(f)"
      @breite="scroller?.passeBreiteAn()"
      @drehen="r => scroller?.dreheAnsicht(r)"
      @signatur="signaturDialogOffen = true"
      @bild="bildInput?.click()"
      @export="exportDialogOffen = true"
      @lineal="scroller?.schalteLineal()"
    />
    <PdfPageScroller ref="scroller" />
    <!-- Bild einfügen: Dateiwahl (auf dem Tablet inkl. Kamera — bewusst ohne
         `capture`, damit die Galerie eine Option bleibt) -->
    <input ref="bildInput" type="file" accept="image/*" hidden @change="aufBildDatei">

    <SignatureDialog
      v-if="signaturDialogOffen"
      @schliessen="signaturDialogOffen = false"
    />
    <!-- Volumen VOR der Kalibrierung: ruft der Volumendialog „Jetzt
         kalibrieren", liegt der später gemountete Kalibrierdialog oben. -->
    <TextAuswahlMenue v-if="toolStore.textAuswahl" />
    <VolumenDialog v-if="toolStore.volumenAnfrage" />
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
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import PdfToolbar from './PdfToolbar.vue';
import PdfPageScroller from './PdfPageScroller.vue';
import SignatureDialog from './SignatureDialog.vue';
import CalibrateDialog from './CalibrateDialog.vue';
import VolumenDialog from './VolumenDialog.vue';
import TextAuswahlMenue from './TextAuswahlMenue.vue';
import ExportDialog from './ExportDialog.vue';
import PdfIcon from './PdfIcon.vue';
import { useDocStore } from '../stores/useDocStore';
import { useAnnotStore } from '../stores/useAnnotStore';
import { useToolStore } from '../stores/useToolStore';
import { legeBildAb } from '../services/BildAblage';
import { bildAusZwischenablage } from '../services/BildImport';

const docStore = useDocStore();
const annotStore = useAnnotStore();
const toolStore = useToolStore();
const scroller = ref(null);
const signaturDialogOffen = ref(false);
const exportDialogOffen = ref(false);
const bildInput = ref(null);
const bildImportLaeuft = ref(false);

const hinweisText = computed(() => {
  if (toolStore.bildFehler) return toolStore.bildFehler;
  if (toolStore.bildZumPlatzieren) return 'Auf die Seite tippen, um das Bild zu platzieren';
  if (bildImportLaeuft.value) return 'Bild wird vorbereitet';
  if (toolStore.signaturZumPlatzieren) {
    return 'Auf die Seite tippen, um die Signatur zu platzieren';
  }
  const m = toolStore.messungInArbeit;
  if (m?.kind === 'area' || m?.kind === 'volumen') {
    return m.points.length < 3
      ? `Eckpunkte der ${m.kind === 'volumen' ? 'Baugrubensohle' : 'Fläche'} antippen`
      : 'Weitere Punkte antippen — zum Abschließen den ersten Punkt antippen';
  }
  if (m?.kind === 'distance') return 'Zweiten Punkt der Strecke antippen';
  if (m?.kind === 'kalibrieren') return 'Zweiten Punkt der Referenzstrecke antippen';
  if (toolStore.aktivesWerkzeug === 'messenStrecke' && !m) return 'Ersten Punkt der Strecke antippen';
  if (toolStore.aktivesWerkzeug === 'messenFlaeche' && !m) return 'Ersten Eckpunkt der Fläche antippen';
  if (toolStore.aktivesWerkzeug === 'messenVolumen' && !m) {
    return 'Eckpunkte der Baugrubensohle antippen — oder eine bestehende Flächenmessung antippen';
  }
  if (toolStore.aktivesWerkzeug === 'kalibrieren' && !m) return 'Ersten Punkt einer bekannten Strecke antippen';
  // Die beiden Text-Werkzeuge wurden schon einmal verwechselt — der Hinweis
  // macht sichtbar, welches gerade aktiv ist und was es erwartet.
  if (toolStore.aktivesWerkzeug === 'textfeld' && !annotStore.offenesTextfeldId) {
    return 'Auf die Seite tippen, um ein Textfeld zu setzen';
  }
  if (toolStore.aktivesWerkzeug === 'textMarkieren' && !toolStore.textAuswahl) {
    return 'Text mit Stift oder Maus überstreichen — dann Kopieren oder Markieren (geht nur bei echtem Text, nicht auf Scans)';
  }
  return '';
});

const hinweisIcon = computed(() => {
  if (toolStore.bildFehler) return 'warnung';
  if (toolStore.bildZumPlatzieren || bildImportLaeuft.value) return 'bild';
  if (toolStore.signaturZumPlatzieren) return 'signatur';
  if (toolStore.aktivesWerkzeug === 'messenVolumen' || toolStore.messungInArbeit?.kind === 'volumen') return 'volumen';
  if (toolStore.aktivesWerkzeug === 'textfeld') return 'textfeld';
  if (toolStore.aktivesWerkzeug === 'textMarkieren') return 'text-markieren';
  return 'messen';
});

function brichHinweisAktionAb() {
  toolStore.bildZumPlatzieren = null;
  toolStore.bildFehler = '';
  if (toolStore.signaturZumPlatzieren) toolStore.signaturZumPlatzieren = null;
  toolStore.messungInArbeit = null;
  toolStore.waehleWerkzeug('stift');
}

function aufTaste(ev) {
  if (ev.target?.tagName === 'TEXTAREA' || ev.target?.tagName === 'INPUT') return;
  if (ev.key === 'Escape') {
    if (toolStore.messungInArbeit || toolStore.signaturZumPlatzieren
        || toolStore.bildZumPlatzieren || toolStore.bildFehler) brichHinweisAktionAb();
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

// ── Bild einfügen (Stufe 16): Dateiwahl, Strg+V; der Drop lebt im Scroller ──

async function starteBildImport(datei) {
  if (!datei || !docStore.dokId) return;
  toolStore.bildFehler = '';
  bildImportLaeuft.value = true;
  try {
    const vorlage = await legeBildAb(docStore.dokId, datei);
    // ERST das Werkzeug (der Wechsel nullt die Vorlage), DANN die Vorlage.
    toolStore.waehleWerkzeug('bild');
    toolStore.bildZumPlatzieren = vorlage;
  } catch (e) {
    toolStore.bildFehler = e?.message || 'Das Bild konnte nicht übernommen werden.';
  } finally {
    bildImportLaeuft.value = false;
  }
}

function aufBildDatei(ev) {
  const datei = ev.target.files?.[0];
  ev.target.value = '';
  if (datei) starteBildImport(datei);
}

function aufEinfuegen(ev) {
  const ziel = ev.target;
  if (ziel?.tagName === 'TEXTAREA' || ziel?.tagName === 'INPUT' || ziel?.isContentEditable) return;
  const datei = bildAusZwischenablage(ev.clipboardData);
  if (!datei) return;        // Text u. Ä. gehört weiter dem Browser
  ev.preventDefault();
  starteBildImport(datei);
}

// Ein Importfehler blendet sich nach 4 s von selbst aus.
let fehlerTimer = 0;
watch(() => toolStore.bildFehler, (f) => {
  clearTimeout(fehlerTimer);
  if (f) fehlerTimer = setTimeout(() => { toolStore.bildFehler = ''; }, 4000);
});

onMounted(() => {
  window.addEventListener('keydown', aufTaste);
  window.addEventListener('paste', aufEinfuegen);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', aufTaste);
  window.removeEventListener('paste', aufEinfuegen);
  clearTimeout(fehlerTimer);
});
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
