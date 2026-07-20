<template>
  <div class="sidebar" :style="{ width: width + 'px' }">

    <!-- Header -->
    <div class="sidebar-header">
      <span class="sidebar-logo-text">SaintV – 1D</span>
    </div>

    <!-- Import + Projekte -->
    <div class="upload-section">

      <!-- XML Import -->
      <label for="file-upload" class="file-btn" data-tutorial="xml-import">
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
        @change="handleFileUpload"
        class="file-upload-input"
      />

      <!-- Projekte -->
      <button class="folder-btn" @click="$emit('open-project-manager')">
        <img class="px-icon" src="/saintv1d/icons/Content-Files-Folder-Open--Streamline-Pixel.svg" />
        <span>Projekte</span>
      </button>

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

  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { parseIsybauXML } from '../../utils/xmlParser.js';
import { buildIsybauXML } from '../../utils/xmlExporter.js';
import TerminalHero from './TerminalHero.vue';

const props = defineProps({
  width: { type: Number, default: 300 }
});

const emit = defineEmits(['open-project-manager']);

const store = useIsybauStore();
const hasData = computed(() => store.nodes.size > 0);

const handleFileUpload = async (event) => {
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
</script>

<style scoped>
.sidebar {
  background: #fff;
  border-right: 1px solid #aeadd2;
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  height: 100%;
  box-sizing: border-box;
}

/* ── Header ─────────────────────────────── */
.sidebar-header {
  background: #040647;
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid #594491;
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
  border-bottom: 1px solid #aeadd2;
  flex-shrink: 0;
}

.file-upload-input { display: none; }

/* XML importieren (label acts as button) */
.file-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  background: #040647;
  color: #fff;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}
.file-btn:hover { background: #594491; }

/* Projekte button */
.folder-btn {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  background: #594491;
  color: #fff;
  border: none;
  border-radius: 7px;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
  box-sizing: border-box;
}
.folder-btn:hover { background: #8f8be1; color: #040647; }

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

/* ── Slot content ────────────────────────── */
.actions {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
}

</style>
