<template>
  <div class="sidebar" data-tutorial="sidebar" :style="{ width: width + 'px' }">

    <!-- Header -->
    <div class="sidebar-header">
      <span class="sidebar-logo-text">SaintV – 1D</span>
    </div>

    <!-- Import + Projekte -->
    <div class="upload-section">

      <!-- XML Import — gesperrt (a) solange "Neu starten" noch keinen Standort
           bestätigt hat, UND (b) dauerhaft für den Rest des Projekts, sobald
           per "Neu starten" ein manueller Anker gesetzt wurde: ein Import
           würde das eigene CRS der XML-Datei über den gewählten Anker legen —
           man hat sich mit "Neu starten" bewusst für den Hand-gezeichnet-Weg
           entschieden, nicht für den Datei-Import-Weg. -->
      <label
        for="file-upload"
        class="file-btn"
        :class="{ disabled: xmlUploadLocked }"
        data-tutorial="xml-import"
        :title="xmlUploadTitle"
      >
        <img class="px-icon" src="/saintv1d/icons/Content-Files-Notepad--Streamline-Pixel.svg" />
        <div class="btn-text">
          <span class="btn-label">XML importieren</span>
          <span class="file-name">{{ store.metadata.fileName || 'Keine ausgewählt' }}</span>
        </div>
      </label>
      <input
        id="file-upload"
        type="file"
        accept=".xml"
        :disabled="xmlUploadLocked"
        @change="handleFileUpload"
        class="file-upload-input"
      />

      <!-- DGM-Import (Gelände) — gleiche Sperre: ein DGM-Upload mitten in der
           Standortwahl hätte keinen sinnvollen Bezug zum noch unbestätigten Anker. -->
      <label
        for="dem-upload"
        class="file-btn"
        data-tutorial="dgm-import"
        :class="{ disabled: store.ui.showNewProjectLocationModal }"
        :title="store.ui.showNewProjectLocationModal ? 'Erst Standort bestätigen oder Neu starten abbrechen' : 'XYZ/TXT-Punktwolke oder ESRI-ASCII-Grid (.asc)'"
      >
        <img class="px-icon" src="/saintv1d/icons/Interface-Essential-Map--Streamline-Pixel.svg" />
        <div class="btn-text">
          <span class="btn-label">Gelände (DGM) laden</span>
          <span class="file-name">{{ store.terrain ? `${store.terrain.ncols}×${store.terrain.nrows} Zellen` : 'Keine Datei' }}</span>
        </div>
      </label>
      <input
        id="dem-upload"
        type="file"
        accept=".xyz,.txt,.asc"
        :disabled="store.ui.showNewProjectLocationModal"
        @change="handleDemUpload"
        class="file-upload-input"
      />

      <!-- DGM-Auflösung wählen (nur bei irregulärer Punktwolke) -->
      <div v-if="store.ui.demImportPanelOpen && demAnalysis" class="dem-import-panel">
        <div class="dem-import-title">DGM-Auflösung</div>
        <div class="dem-import-badge">
          {{ demAnalysis.isRegular ? 'Reguläres Gitter' : 'Irreguläre Punktwolke' }}
          · {{ demAnalysis.count.toLocaleString() }} Punkte
        </div>
        <div class="dem-import-row">
          <label>Ziel-Zellweite [m]</label>
          <input type="number" min="0.1" step="0.5" v-model.number="demCellsize" />
        </div>
        <div class="dem-import-quick">
          <button @click="demCellsize = 1">1 m</button>
          <button @click="demCellsize = 2">2 m</button>
          <button @click="demCellsize = demAnalysis.suggestedCellsize">Vorschlag {{ demAnalysis.suggestedCellsize }} m</button>
        </div>
        <div class="dem-import-actions">
          <button class="folder-btn" @click="cancelDemImport">Abbrechen</button>
          <button class="folder-btn dem-go" data-tutorial="dgm-importieren" @click="startDemBuild">Importieren</button>
        </div>
      </div>

      <!-- Projekte -->
      <button class="folder-btn" data-tutorial="projekte" @click="$emit('open-project-manager')">
        <img class="px-icon" src="/saintv1d/icons/Content-Files-Folder-Open--Streamline-Pixel.svg" />
        <span>Projekte</span>
      </button>

      <!-- Neu starten: Standort wählen, bevor der erste Knoten gesetzt wird -->
      <button class="folder-btn" data-tutorial="neu-starten" @click="store.ui.showNewProjectLocationModal = true">
        <img class="px-icon" src="/saintv1d/icons/Map-Navigation-Pin-Location-1--Streamline-Pixel.svg" />
        <span>Neu starten</span>
      </button>
      <p v-if="!hasData && store.metadata.originAnchor" class="anchor-badge">
        📍 {{ store.metadata.originAnchor.label }}
      </p>

      <!-- XML Export (nur mit geladenem Netz) -->
      <button v-if="hasData" class="folder-btn" data-tutorial="xml-export" @click="handleXmlExport">
        <img class="px-icon" src="/saintv1d/icons/Interface-Essential-Clound-Download--Streamline-Pixel.svg" />
        <span>XML exportieren</span>
      </button>

    </div>

    <!-- Slot (shown when data loaded) -->
    <div v-if="hasData" class="actions">
      <slot></slot>
    </div>

    <!-- Retro Terminal (nur wenn kein Projekt geladen) -->
    <TerminalHero v-if="!hasData" />

    <LoadingOverlay :visible="demImporting" :label="demLoadingLabel" :percent="demProgress" />

    <!-- Dark/Light Umschalter -->
    <button
      class="theme-toggle"
      type="button"
      data-tutorial="theme-toggle"
      :title="store.ui.darkMode ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'"
      @click="store.toggleDarkMode()"
    >
      <img :src="store.ui.darkMode ? '/saintv1d/dark_ligth/ligth_off.png' : '/saintv1d/dark_ligth/light_on.png'" alt="" />
    </button>

  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { parseIsybauXML } from '../../utils/xmlParser.js';
import { buildIsybauXML } from '../../utils/xmlExporter.js';
import TerminalHero from './TerminalHero.vue';
import LoadingOverlay from '../common/LoadingOverlay.vue';

const props = defineProps({
  width: { type: Number, default: 300 }
});

const emit = defineEmits(['open-project-manager']);

const store = useIsybauStore();
const hasData = computed(() => store.nodes.size > 0);

// XML-Import bleibt dauerhaft gesperrt, sobald per "Neu starten" ein
// manueller Standort-Anker gesetzt wurde (store.metadata.originAnchor) —
// nicht nur, solange das Modal selbst offen ist.
const xmlUploadLocked = computed(() => store.ui.showNewProjectLocationModal || !!store.metadata.originAnchor);
const xmlUploadTitle = computed(() => {
  if (store.ui.showNewProjectLocationModal) return 'Erst Standort bestätigen oder Neu starten abbrechen';
  if (store.metadata.originAnchor) return 'Nach "Neu starten" nicht mehr möglich — Projekt ist auf Hand-Zeichnen festgelegt';
  return '';
});

const handleFileUpload = async (event) => {
  // Zusätzlich zur :disabled-Bindung am Input selbst — Verteidigung in der
  // Tiefe, falls der Input trotz Sperre irgendwie ausgelöst wird (siehe
  // xmlUploadLocked: Modal offen ODER manueller "Neu starten"-Anker gesetzt).
  if (xmlUploadLocked.value) { event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = parseIsybauXML(text);
    parsed.metadata.fileName = file.name;
    store.loadParsedData(parsed);
  } catch (e) {
    console.error('Parse Error', e);
    store.melde('Fehler beim Lesen der XML: ' + e.message, 'fehler');
  } finally {
    // Gleiche Datei erneut wählbar machen
    event.target.value = '';
  }
};

const handleXmlExport = () => {
  const { xml, warnings } = buildIsybauXML({
    nodes: store.nodeArray.map(n => n.toJSON ? n.toJSON() : n),
    edges: store.edgeArray.map(e => e.toJSON ? e.toJSON() : e),
    areas: store.areaArray.map(a => a.toJSON ? a.toJSON() : a),
    metadata: store.metadata
  });

  if (warnings.length) {
    store.melde('Export mit Hinweisen:\n\n' + warnings.join('\n'), 'hinweis');
  }

  const base = (store.metadata.fileName || 'kanalnetz').replace(/\.xml$/i, '');
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}_export.xml`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── DGM-Import (Gelände) ────────────────────────────────────────────────
// Sitzungsbezogen (siehe store.terrain) — Worker-Orchestrierung 1:1 vom
// Muster in flood-2D/components/editor/MapEditor3D.vue portiert:
//   1) analyze → erkennt ESRI-ASCII-Grid vs. XYZ-Punktwolke (regulär/irregulär)
//   2) build   → reguläres Gitter/ESRI-Grid: sofort ohne Rückfrage; irreguläre
//                Punktwolke: Zellweite im Panel bestätigen lassen
const demImporting = ref(false);
const demLoadingLabel = ref('');
const demProgress = ref(null);
// Sichtbarkeit der Auflösungs-Rückfrage liegt im Store (store.ui.demImportPanelOpen),
// nicht lokal: das Tutorial muss mitbekommen, wann der "Importieren"-Knopf da ist.
const demAnalysis = ref(null);
const demCellsize = ref(1);
let demWorker = null;

function ensureDemWorker() {
  if (demWorker) return demWorker;
  demWorker = new Worker(
    new URL('../../workers/terrainImportWorker.js', import.meta.url),
    { type: 'module' },
  );
  demWorker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      demProgress.value = data.value;
      demLoadingLabel.value = `Rasterung… ${data.value | 0}%`;
    } else if (data.type === 'analyzed') {
      demAnalysis.value = data.analysis;
      demCellsize.value = data.analysis.suggestedCellsize;
      if (data.analysis.isRegular) {
        startDemBuild(); // ESRI-Grid oder reguläre Punktwolke — keine Rückfrage nötig
      } else {
        demImporting.value = false;
        store.ui.demImportPanelOpen = true;
      }
    } else if (data.type === 'built') {
      store.importTerrain(data.terrain);
      demImporting.value = false;
      teardownDemWorker();
    } else if (data.type === 'error') {
      demImporting.value = false;
      store.ui.demImportPanelOpen = false;
      teardownDemWorker();
      store.melde('DGM-Import fehlgeschlagen: ' + data.message, 'fehler');
    }
  };
  demWorker.onerror = (e) => {
    demImporting.value = false;
    store.ui.demImportPanelOpen = false;
    teardownDemWorker();
    store.melde('DGM-Import-Worker-Fehler: ' + (e.message || e), 'fehler');
  };
  return demWorker;
}

function teardownDemWorker() {
  if (demWorker) { demWorker.terminate(); demWorker = null; }
}

function startDemBuild() {
  store.ui.demImportPanelOpen = false;
  demImporting.value = true;
  demProgress.value = null;
  demLoadingLabel.value = 'Rasterung…';
  ensureDemWorker().postMessage({
    type: 'build',
    cellsize: Number(demCellsize.value) || 0,
    method: 'tin',
  });
}

function cancelDemImport() {
  store.ui.demImportPanelOpen = false;
  demAnalysis.value = null;
  teardownDemWorker();
}

/**
 * Einstieg in den DGM-Import ab dem rohen Dateitext.
 *
 * Herausgelöst, damit die per Hand gewählte Datei UND das vom Tutorial
 * angebotene Übungs-DGM (store.ui.pendingDemImportText) exakt denselben Weg
 * nehmen — inklusive Auflösungs-Rückfrage, Fortschritt und Fehlerbehandlung.
 */
function startDemAnalysis(text) {
  teardownDemWorker(); // evtl. hängenden Vorlauf verwerfen
  demImporting.value = true;
  demProgress.value = null;
  demLoadingLabel.value = 'Analysiere Höhendaten…';
  store.ui.demImportPanelOpen = false;
  demAnalysis.value = null;
  ensureDemWorker().postMessage({ type: 'analyze', text });
}

const handleDemUpload = async (event) => {
  if (store.ui.showNewProjectLocationModal) { event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  demImporting.value = true;
  demLoadingLabel.value = 'Datei lesen…';

  const reader = new FileReader();
  reader.onload = (e) => startDemAnalysis(e.target.result);
  reader.onerror = () => {
    demImporting.value = false;
    store.melde('DGM-Datei konnte nicht gelesen werden.', 'fehler');
  };
  reader.readAsText(file);
  event.target.value = '';
};

// Vom Tutorial angebotenes Übungs-DGM: Text entgegennehmen, Ablage sofort
// leeren (damit ein erneutes Angebot wieder auslöst) und normal importieren.
watch(() => store.ui.pendingDemImportText, (text) => {
  if (!text) return;
  store.ui.pendingDemImportText = null;
  startDemAnalysis(text);
});

onBeforeUnmount(() => teardownDemWorker());
</script>

<style scoped>
.sidebar {
  background: var(--isy-bg);
  border-right: 1px solid var(--isy-border);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  box-sizing: border-box;
  position: relative;
}

/* ── Header ─────────────────────────────── */
.sidebar-header {
  background: var(--isy-header-bg);
  padding: var(--isy-space-2) var(--isy-space-3);
  border-bottom: 2px solid var(--isy-accent);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.sidebar-logo-text {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-green);
  line-height: 1;
  letter-spacing: 0.02em;
}

/* ── Upload section ──────────────────────── */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: var(--isy-space-2);
  padding: var(--isy-space-3) var(--isy-space-3) var(--isy-space-2);
  border-bottom: 1px solid var(--isy-border);
  flex-shrink: 0;
}

.file-upload-input { display: none; }

/* XML importieren (label acts as button) */
.file-btn {
  display: flex;
  align-items: center;
  gap: var(--isy-space-3);
  padding: var(--isy-space-2) var(--isy-space-3);
  background: var(--isy-accent);
  color: var(--isy-pixel-green-bright);
  border-width: 2px;
  border-style: solid;
  border-color: var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light);
  border-radius: var(--isy-radius-md);
  clip-path: var(--isy-pixel-clip-corner);
  cursor: var(--isy-cursor-hand);
  box-shadow: var(--isy-btn-shadow);
  transition: background 0.15s, box-shadow 0.15s, transform 0.1s, border-color 0.15s;
  user-select: none;
}
.file-btn:hover {
  background: var(--isy-accent-hover);
  color: var(--isy-pixel-green-bright);
  box-shadow: var(--isy-btn-shadow-hover);
  transform: translateY(-1px);
}
.file-btn:active {
  transform: translateY(0);
  border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark);
  box-shadow: var(--isy-btn-shadow-active);
}
.file-btn.disabled {
  opacity: 0.45;
  cursor: var(--isy-cursor-gesperrt);
  pointer-events: none;
}

/* Projekte button */
.folder-btn {
  display: flex;
  align-items: center;
  gap: var(--isy-space-3);
  width: 100%;
  padding: var(--isy-space-2) var(--isy-space-3);
  background: var(--isy-accent);
  color: var(--isy-pixel-green-bright);
  border-width: 2px;
  border-style: solid;
  border-color: var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light);
  border-radius: var(--isy-radius-md);
  clip-path: var(--isy-pixel-clip-corner);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  cursor: var(--isy-cursor-hand);
  box-shadow: var(--isy-btn-shadow);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.1s, border-color 0.15s;
  box-sizing: border-box;
}
.folder-btn:hover {
  background: var(--isy-accent-hover);
  color: var(--isy-pixel-green-bright);
  box-shadow: var(--isy-btn-shadow-hover);
  transform: translateY(-1px);
}
.folder-btn:active {
  transform: translateY(0);
  border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark);
  box-shadow: var(--isy-btn-shadow-active);
}

/* Pixel art icons — Rasterfarbe var(--isy-pixel-green) */
.px-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  image-rendering: pixelated;
  filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
}

.btn-text {
  display: flex;
  flex-direction: column;
  gap: var(--isy-space-1);
  min-width: 0;
}
.btn-label {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  line-height: 1.4;
}
.file-name {
  font-size: var(--isy-fs-sm);
  opacity: 0.65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* DGM-Auflösungs-Panel (nur bei irregulärer Punktwolke) */
.dem-import-panel {
  display: flex;
  flex-direction: column;
  gap: var(--isy-space-2);
  padding: var(--isy-space-2) var(--isy-space-3);
  background: var(--isy-bg-alt);
  border: 1px solid var(--isy-border);
  border-radius: var(--isy-radius-md);
}
.dem-import-title {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  color: var(--isy-text);
}
.dem-import-badge {
  font-size: var(--isy-fs-sm);
  color: var(--isy-text-dim);
}
.dem-import-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--isy-space-2);
  font-size: var(--isy-fs-sm);
  color: var(--isy-text);
}
.dem-import-row input {
  width: 5.5rem;
  padding: var(--isy-space-1) var(--isy-space-1);
  border: 1px solid var(--isy-border);
  border-radius: var(--isy-radius-sm);
  background: var(--isy-btn-bg);
  color: var(--isy-text);
}
.dem-import-quick {
  display: flex;
  gap: var(--isy-space-1);
  flex-wrap: wrap;
}
.dem-import-quick button {
  flex: 1;
  padding: var(--isy-space-1) var(--isy-space-2);
  background: var(--isy-btn-bg);
  border-width: 2px;
  border-style: solid;
  border-color: var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light);
  border-radius: var(--isy-radius-sm);
  clip-path: var(--isy-pixel-clip-corner);
  color: var(--isy-text-dim);
  font-size: var(--isy-fs-sm);
  cursor: var(--isy-cursor-hand);
  box-shadow: var(--isy-btn-shadow);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.1s;
}
.dem-import-quick button:hover {
  background: var(--isy-accent);
  color: var(--isy-pixel-green-bright);
  box-shadow: var(--isy-btn-shadow-hover);
  transform: translateY(-1px);
}
.dem-import-quick button:active {
  transform: translateY(0);
  border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark);
  box-shadow: var(--isy-btn-shadow-active);
}
.dem-import-actions {
  display: flex;
  gap: var(--isy-space-2);
}
.dem-import-actions .folder-btn { font-size: var(--isy-fs-pixel-md); }
.dem-import-actions .dem-go { background: var(--isy-pixel-green); color: var(--isy-pixel-border); }
.dem-import-actions .dem-go:hover { background: var(--isy-pixel-green-hover); }

.anchor-badge {
  font-size: var(--isy-fs-sm);
  color: var(--isy-text-dim);
  margin: calc(-1 * var(--isy-space-1)) 0 0;
  padding: 0 var(--isy-space-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Slot content ────────────────────────── */
.actions {
  flex: 1;
  overflow-y: auto;
  padding: var(--isy-space-3);
}

/* ── Dark/Light Umschalter (unten links) ──── */
.theme-toggle {
  position: absolute;
  bottom: 0.65rem;
  left: 0.65rem;
  width: 34px;
  height: 34px;
  padding: var(--isy-space-1);
  background: var(--isy-btn-bg);
  border: 1px solid var(--isy-border);
  border-radius: 50%;
  cursor: var(--isy-cursor-hand);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--isy-btn-shadow);
  transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
  z-index: var(--isy-z-panel);
}
.theme-toggle:hover {
  border-color: var(--isy-accent);
  transform: scale(1.06);
  box-shadow: var(--isy-btn-shadow-hover);
}
.theme-toggle img {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  object-fit: contain;
}

</style>
