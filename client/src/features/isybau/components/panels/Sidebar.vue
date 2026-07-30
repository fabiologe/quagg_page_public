<template>
  <div class="sidebar" :style="{ width: width + 'px' }">

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
      <div v-if="showDemImportPanel && demAnalysis" class="dem-import-panel">
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
          <button class="folder-btn dem-go" @click="startDemBuild">Importieren</button>
        </div>
      </div>

      <!-- Projekte -->
      <button class="folder-btn" @click="$emit('open-project-manager')">
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
      <button v-if="hasData" class="folder-btn" @click="handleXmlExport">
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
      :title="store.ui.darkMode ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'"
      @click="store.toggleDarkMode()"
    >
      <img :src="store.ui.darkMode ? '/saintv1d/dark_ligth/ligth_off.png' : '/saintv1d/dark_ligth/light_on.png'" alt="" />
    </button>

  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
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
    alert('Fehler beim Lesen der XML: ' + e.message);
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
    alert('Export mit Hinweisen:\n\n' + warnings.join('\n'));
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
const showDemImportPanel = ref(false);
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
        showDemImportPanel.value = true;
      }
    } else if (data.type === 'built') {
      store.importTerrain(data.terrain);
      demImporting.value = false;
      teardownDemWorker();
    } else if (data.type === 'error') {
      demImporting.value = false;
      showDemImportPanel.value = false;
      teardownDemWorker();
      alert('DGM-Import fehlgeschlagen: ' + data.message);
    }
  };
  demWorker.onerror = (e) => {
    demImporting.value = false;
    showDemImportPanel.value = false;
    teardownDemWorker();
    alert('DGM-Import-Worker-Fehler: ' + (e.message || e));
  };
  return demWorker;
}

function teardownDemWorker() {
  if (demWorker) { demWorker.terminate(); demWorker = null; }
}

function startDemBuild() {
  showDemImportPanel.value = false;
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
  showDemImportPanel.value = false;
  demAnalysis.value = null;
  teardownDemWorker();
}

const handleDemUpload = async (event) => {
  if (store.ui.showNewProjectLocationModal) { event.target.value = ''; return; }
  const file = event.target.files[0];
  if (!file) return;
  teardownDemWorker(); // evtl. hängenden Vorlauf verwerfen
  demImporting.value = true;
  demProgress.value = null;
  demLoadingLabel.value = 'Datei lesen…';
  showDemImportPanel.value = false;
  demAnalysis.value = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    demLoadingLabel.value = 'Analysiere Höhendaten…';
    ensureDemWorker().postMessage({ type: 'analyze', text: e.target.result });
  };
  reader.onerror = () => {
    demImporting.value = false;
    alert('DGM-Datei konnte nicht gelesen werden.');
  };
  reader.readAsText(file);
  event.target.value = '';
};

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
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid var(--isy-accent);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.sidebar-logo-text {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.72rem;
  color: #2ecc71;
  line-height: 1;
  letter-spacing: 0.02em;
}

/* ── Upload section ──────────────────────── */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem 0.75rem 0.6rem;
  border-bottom: 1px solid var(--isy-border);
  flex-shrink: 0;
}

.file-upload-input { display: none; }

/* XML importieren (label acts as button) */
.file-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  background: var(--isy-header-bg);
  color: #fff;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.file-btn:hover { background: var(--isy-accent); }
.file-btn.disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

/* Projekte button */
.folder-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  background: var(--isy-accent);
  color: #fff;
  border: none;
  border-radius: 7px;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
  box-sizing: border-box;
}
.folder-btn:hover { background: var(--isy-accent-hover); color: var(--isy-header-bg); }

/* Pixel art icons — Rasterfarbe #2ecc71 */
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
  gap: 0.08rem;
  min-width: 0;
}
.btn-label {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  line-height: 1.4;
}
.file-name {
  font-size: 0.7rem;
  opacity: 0.65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* DGM-Auflösungs-Panel (nur bei irregulärer Punktwolke) */
.dem-import-panel {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.6rem 0.65rem;
  background: var(--isy-bg-alt);
  border: 1px solid var(--isy-border);
  border-radius: 7px;
}
.dem-import-title {
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  color: var(--isy-text);
}
.dem-import-badge {
  font-size: 0.7rem;
  color: var(--isy-text-dim);
}
.dem-import-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.72rem;
  color: var(--isy-text);
}
.dem-import-row input {
  width: 5.5rem;
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--isy-border);
  border-radius: 4px;
  background: var(--isy-btn-bg);
  color: var(--isy-text);
}
.dem-import-quick {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.dem-import-quick button {
  flex: 1;
  padding: 0.3rem 0.4rem;
  background: var(--isy-btn-bg);
  border: 1px solid var(--isy-accent);
  border-radius: 5px;
  color: var(--isy-text-dim);
  font-size: 0.65rem;
  cursor: pointer;
}
.dem-import-quick button:hover { background: var(--isy-accent); color: #fff; }
.dem-import-actions {
  display: flex;
  gap: 0.4rem;
}
.dem-import-actions .folder-btn { font-size: 0.5rem; }
.dem-import-actions .dem-go { background: #2ecc71; color: #040647; }
.dem-import-actions .dem-go:hover { background: #27ae60; }

.anchor-badge {
  font-size: 0.72rem;
  color: var(--isy-text-dim);
  margin: -0.1rem 0 0;
  padding: 0 0.1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Slot content ────────────────────────── */
.actions {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

/* ── Dark/Light Umschalter (unten links) ──── */
.theme-toggle {
  position: absolute;
  bottom: 0.65rem;
  left: 0.65rem;
  width: 34px;
  height: 34px;
  padding: 4px;
  background: var(--isy-btn-bg);
  border: 1px solid var(--isy-border);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, transform 0.1s;
  z-index: 5;
}
.theme-toggle:hover {
  border-color: var(--isy-accent);
  transform: scale(1.06);
}
.theme-toggle img {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  object-fit: contain;
}

</style>
