<template>
  <header class="pdfed-toolbar">
    <div class="pdfed-toolbar-gruppe pdfed-toolbar-links">
      <button class="pdfed-btn" title="Zur Startseite" @click="$emit('schliessen')">
        <PdfIcon name="zurueck" />
      </button>
      <span class="pdfed-toolbar-name" :title="docStore.name">{{ docStore.name }}</span>
    </div>

    <div class="pdfed-toolbar-gruppe pdfed-toolbar-mitte">
      <button
        v-for="w in WERKZEUGE"
        :key="w.id"
        class="pdfed-btn"
        :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === w.id }"
        :title="w.titel"
        @click="waehle(w.id)"
      >
        <PdfIcon :name="w.icon" :size="20" />
      </button>

      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'signatur' }"
        title="Signatur einfügen"
        @click="$emit('signatur')"
      >
        <PdfIcon name="signatur" :size="20" />
      </button>
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': istMessWerkzeug }"
        title="Messen (Strecke, Fläche, Kalibrieren)"
        @click="messMenueOffen = !messMenueOffen"
      >
        <PdfIcon name="messen" :size="20" />
      </button>
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': !!toolStore.lineal }"
        :title="toolStore.lineal ? 'Lineal ausblenden' : 'Lineal einblenden (Striche an der Kante werden gerade)'"
        @click="$emit('lineal')"
      >
        <PdfIcon name="lineal" :size="20" />
      </button>
      <button
        v-if="docStore.pdfLayer.length"
        class="pdfed-btn"
        :class="{ 'ist-aktiv': layerPanelOffen }"
        title="PDF-Layer ein-/ausblenden (CAD-Layer)"
        @click="layerPanelOffen = !layerPanelOffen"
      >
        <PdfIcon name="ebenen" :size="20" />
      </button>
      <PdfLayerPanel v-if="layerPanelOffen" @schliessen="layerPanelOffen = false" />

      <div v-if="messMenueOffen" class="pdfed-messmenue" @pointerdown.stop>
        <button
          class="pdfed-btn pdfed-messmenue-eintrag"
          :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'messenStrecke' }"
          @click="waehleMess('messenStrecke')"
        >
          <PdfIcon name="messen" :size="17" /> Strecke messen
        </button>
        <button
          class="pdfed-btn pdfed-messmenue-eintrag"
          :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'messenFlaeche' }"
          @click="waehleMess('messenFlaeche')"
        >
          <PdfIcon name="flaeche" :size="17" /> Fläche messen
        </button>
        <button
          class="pdfed-btn pdfed-messmenue-eintrag"
          :class="{ 'ist-aktiv': toolStore.aktivesWerkzeug === 'kalibrieren' }"
          @click="waehleMess('kalibrieren')"
        >
          <PdfIcon name="kalibrieren" :size="17" /> Kalibrieren (2 Punkte)
        </button>
        <button class="pdfed-btn pdfed-messmenue-eintrag" @click="massstabDirekt">
          <PdfIcon name="einstellungen" :size="17" /> Maßstab eingeben
        </button>
      </div>

      <span class="pdfed-toolbar-trenner"></span>

      <button
        class="pdfed-btn"
        title="Rückgängig (Strg+Z)"
        :disabled="!annotStore.canUndo"
        @click="annotStore.undo()"
      >
        <PdfIcon name="undo" />
      </button>
      <button
        class="pdfed-btn"
        title="Wiederherstellen (Strg+Y)"
        :disabled="!annotStore.canRedo"
        @click="annotStore.redo()"
      >
        <PdfIcon name="redo" />
      </button>

      <PdfToolOptions v-if="optionenOffen" @schliessen="optionenOffen = false" />
    </div>

    <div class="pdfed-toolbar-gruppe pdfed-toolbar-rechts">
      <button
        class="pdfed-btn"
        :class="{ 'ist-aktiv': toolStore.eingabemodus === 'nurStift' }"
        :title="toolStore.eingabemodus === 'nurStift'
          ? 'Nur Stift zeichnet — Finger navigiert (umschalten)'
          : 'Stift und Finger zeichnen (umschalten)'"
        @click="toolStore.schalteEingabemodus()"
      >
        <PdfIcon :name="toolStore.eingabemodus === 'nurStift' ? 'nur-stift' : 'finger'" />
      </button>
      <span class="pdfed-toolbar-trenner"></span>
      <button class="pdfed-btn" title="Verkleinern" @click="$emit('zoom', 1 / ZOOM_SCHRITT)">
        <PdfIcon name="zoom-minus" />
      </button>
      <span class="pdfed-toolbar-zoom">{{ viewStore.zoomProzent }} %</span>
      <button class="pdfed-btn" title="Vergrößern" @click="$emit('zoom', ZOOM_SCHRITT)">
        <PdfIcon name="zoom-plus" />
      </button>
      <button class="pdfed-btn" title="Auf Seitenbreite einpassen" @click="$emit('breite')">
        <PdfIcon name="breite" />
      </button>
      <button class="pdfed-btn" title="Hell/Dunkel umschalten" @click="viewStore.schalteTheme()">
        <PdfIcon name="thema" />
      </button>
      <span class="pdfed-toolbar-trenner"></span>
      <button class="pdfed-btn" title="Exportieren (Herunterladen, Teilen, Drucken)" @click="$emit('export')">
        <PdfIcon name="herunterladen" />
      </button>
    </div>
  </header>
</template>

<script setup>
/**
 * PdfToolbar — obere Leiste: Werkzeuge in der Mitte, Navigation rechts.
 * Ein zweiter Tipp auf das aktive Zeichenwerkzeug öffnet die Kontextoptionen
 * (Farbe/Breite) — das übliche Tablet-Muster, spart eine zweite Leiste.
 * Zoom-Klicks laufen als Events zur Shell, weil das Zoomzentrum
 * (Viewportmitte) nur der Scroller kennt.
 */
import { ref, computed } from 'vue';
import PdfIcon from './PdfIcon.vue';
import PdfToolOptions from './PdfToolOptions.vue';
import PdfLayerPanel from './PdfLayerPanel.vue';
import { useDocStore } from '../stores/useDocStore';
import { useViewStore, ZOOM_SCHRITT } from '../stores/useViewStore';
import { useToolStore } from '../stores/useToolStore';
import { useAnnotStore } from '../stores/useAnnotStore';

const WERKZEUGE = [
  { id: 'pan',        icon: 'hand',       titel: 'Verschieben' },
  { id: 'stift',      icon: 'stift',      titel: 'Stift (erneut tippen: Optionen)' },
  { id: 'textmarker', icon: 'textmarker', titel: 'Textmarker (erneut tippen: Optionen)' },
  { id: 'radierer',   icon: 'radierer',   titel: 'Radierer (erneut tippen: Optionen)' },
  { id: 'textfeld',   icon: 'textfeld',   titel: 'Textfeld (erneut tippen: Optionen)' },
  { id: 'textMarkieren', icon: 'text-markieren', titel: 'Text markieren (Text mit Stift oder Maus überstreichen)' },
  { id: 'lasso',      icon: 'lasso',      titel: 'Lasso-Auswahl' },
  { id: 'kommentar',  icon: 'kommentar',  titel: 'Kommentar setzen' },
  { id: 'stempel',    icon: 'stempel',    titel: 'Stempel (Vorabzug u. a. — erneut tippen: Optionen)' },
];

defineEmits(['schliessen', 'zoom', 'breite', 'signatur', 'export', 'lineal']);

const docStore = useDocStore();
const viewStore = useViewStore();
const toolStore = useToolStore();
const annotStore = useAnnotStore();

const optionenOffen = ref(false);
const messMenueOffen = ref(false);
const layerPanelOffen = ref(false);

const istMessWerkzeug = computed(() =>
  ['messenStrecke', 'messenFlaeche', 'kalibrieren'].includes(toolStore.aktivesWerkzeug));

function waehle(id) {
  messMenueOffen.value = false;
  if (toolStore.aktivesWerkzeug === id && id !== 'pan') {
    optionenOffen.value = !optionenOffen.value;
  } else {
    toolStore.waehleWerkzeug(id);
    optionenOffen.value = false;
  }
}

function waehleMess(id) {
  toolStore.waehleWerkzeug(id);
  messMenueOffen.value = false;
}

function massstabDirekt() {
  toolStore.kalibrierungAnfrage = { laengePt: null, page: null };
  messMenueOffen.value = false;
}
</script>

<style scoped>
.pdfed-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: var(--pdf-flaeche);
  border-bottom: 1px solid var(--pdf-rand);
  box-shadow: var(--pdf-schatten);
  z-index: 10;
}
.pdfed-toolbar-gruppe {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.pdfed-toolbar-links,
.pdfed-toolbar-rechts {
  flex: 1 1 0;
}
.pdfed-toolbar-rechts {
  justify-content: flex-end;
}
.pdfed-toolbar-mitte {
  position: relative;
  justify-content: center;
}
.pdfed-toolbar-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pdfed-toolbar-trenner {
  width: 1px;
  height: 24px;
  margin: 0 6px;
  background: var(--pdf-rand);
}
.pdfed-toolbar-zoom {
  color: var(--pdf-text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 52px;
  text-align: center;
}

.pdfed-messmenue {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  background: var(--pdf-flaeche);
  border: 1px solid var(--pdf-rand);
  border-radius: var(--pdf-radius);
  box-shadow: var(--pdf-schatten);
  z-index: 30;
}
.pdfed-messmenue-eintrag {
  justify-content: flex-start;
  white-space: nowrap;
}

/* Schmale Viewports (Tablet hochkant, halbes Fenster): die Werkzeugmitte
   bekommt eine EIGENE Zeile statt rechts abgeschnitten zu werden.
   (Schwelle 1200: bei ~1100 px kollidierte Undo/Redo mit der Zoom-Gruppe.) */
@media (max-width: 1200px) {
  .pdfed-toolbar { flex-wrap: wrap; }
  .pdfed-toolbar-mitte {
    order: 3;
    flex-basis: 100%;
    justify-content: center;
  }
}
@media (max-width: 720px) {
  .pdfed-toolbar-name { display: none; }
  .pdfed-toolbar-zoom { display: none; }
}
</style>
