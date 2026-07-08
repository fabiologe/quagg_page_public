<template>
  <div class="result-inspector">
    <!-- Header -->
    <div class="inspector-header">
      <h3><SvEmoji emoji="📋" :size="15" /> Solver I/O Inspektor</h3>
    </div>

    <!-- Section Toggle -->
    <div class="section-bar">
      <button
        v-for="sec in sections"
        :key="sec.id"
        :class="['sec-btn', { active: activeSection === sec.id }]"
        @click="activeSection = sec.id"
      >
        <SvEmoji :emoji="sec.icon" :size="14" /> {{ sec.label }}
        <span v-if="sec.count > 0" class="sec-count">{{ sec.count }}</span>
      </button>
    </div>

    <!-- File Tabs -->
    <div class="file-tabs" v-if="currentFileNames.length > 0">
      <button
        v-for="name in currentFileNames"
        :key="name"
        :class="['tab', { active: selectedFile === name }]"
        @click="selectedFile = name"
      >
        {{ name }}
      </button>
    </div>
    <div v-else class="no-files">Noch keine Daten in dieser Kategorie</div>

    <!-- Raw Content Viewer -->
    <div v-if="selectedFile && currentContent" class="content-viewer">
      <div class="viewer-toolbar">
        <span class="file-name">{{ selectedFile }}</span>
        <span class="file-size">{{ currentSize }}</span>
        <button class="tool-btn" @click="copyToClipboard" title="Kopieren"><SvEmoji emoji="📋" :size="13" /></button>
        <button class="tool-btn" @click="downloadCurrent" title="Herunterladen"><SvEmoji emoji="⬇" :size="13" /></button>
      </div>
      <pre class="raw-content">{{ currentContent }}</pre>
    </div>

    <!-- Export -->
    <div class="export-row" v-if="hasAnyData">
      <button @click="$emit('prepareZip')" class="export-btn"><SvEmoji emoji="📦" :size="13" /> Alle als ZIP</button>
    </div>
  </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { ref, computed, watch, toRaw } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore.js';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore.js';

const props = defineProps({
  inputFiles: { type: Object, default: () => ({}) },
  outputFiles: { type: Object, default: () => ({}) }
});

defineEmits(['prepareZip']);

const geoStore = useGeoStore();
const hydStore = useHydraulicStore();
const simStore = useSimulationStore();

const activeSection = ref('raster');
const selectedFile = ref('');

// ─── Section definitions ───
const sections = computed(() => [
  { id: 'raster', icon: '🗺️', label: 'Raster', count: rasterFiles.value ? Object.keys(rasterFiles.value).length : 0 },
  { id: 'boundaries', icon: '🔗', label: 'Randbedingungen', count: boundaryFiles.value ? Object.keys(boundaryFiles.value).length : 0 },
  { id: 'input', icon: '📥', label: 'Solver Input', count: Object.keys(props.inputFiles).length },
  { id: 'output', icon: '📤', label: 'Ergebnisse', count: Object.keys(props.outputFiles).length }
]);

const hasAnyData = computed(() => sections.value.some(s => s.count > 0));

// ─── RASTER section: terrain grid ───
const rasterFiles = computed(() => {
  const files = {};
  const terrain = toRaw(geoStore.terrain);
  if (terrain && terrain.gridData) {
    // Generate ASC header
    let asc = '';
    asc += `ncols         ${terrain.ncols}\n`;
    asc += `nrows         ${terrain.nrows}\n`;
    asc += `xllcorner     ${terrain.xllcorner || 0}\n`;
    asc += `yllcorner     ${terrain.yllcorner || 0}\n`;
    asc += `cellsize      ${terrain.cellsize}\n`;
    asc += `NODATA_value  -9999\n`;

    // Only show first 50 rows to keep it readable
    const cols = terrain.ncols;
    const rows = Math.min(terrain.nrows, 50);
    const rawGrid = toRaw(terrain.gridData);
    for (let r = 0; r < rows; r++) {
      const rowVals = [];
      for (let c = 0; c < cols; c++) {
        rowVals.push(rawGrid[r * cols + c].toFixed(2));
      }
      asc += rowVals.join(' ') + '\n';
    }
    if (terrain.nrows > 50) {
      asc += `... (${terrain.nrows - 50} weitere Zeilen ausgeblendet)\n`;
    }

    files['terrain.asc'] = asc;

    // Grid-Info summary
    let info = '';
    info += `Spalten:     ${terrain.ncols}\n`;
    info += `Zeilen:      ${terrain.nrows}\n`;
    info += `Zellgröße:   ${terrain.cellsize} m\n`;
    info += `Min Höhe:    ${terrain.minZ?.toFixed(2) || '?'} m\n`;
    info += `Max Höhe:    ${terrain.maxZ?.toFixed(2) || '?'} m\n`;
    info += `Zellen:      ${terrain.ncols * terrain.nrows}\n`;
    info += `xllcorner:   ${terrain.xllcorner || 0}\n`;
    info += `yllcorner:   ${terrain.yllcorner || 0}\n`;
    if (terrain.center) {
      if (terrain.center.lat !== undefined && terrain.center.lng !== undefined) {
        info += `Center:      ${terrain.center.lat.toFixed(6)}, ${terrain.center.lng.toFixed(6)}\n`;
      } else if (terrain.center.y !== undefined && terrain.center.x !== undefined) {
        info += `Center:      ${terrain.center.y.toFixed(6)}, ${terrain.center.x.toFixed(6)}\n`;
      } else if (Array.isArray(terrain.center) && terrain.center.length >= 2) {
        info += `Center:      ${terrain.center[0].toFixed(6)}, ${terrain.center[1].toFixed(6)}\n`;
      } else {
        info += `Center:      ${JSON.stringify(terrain.center)}\n`;
      }
    }
    files['grid-info.txt'] = info;
  }
  return files;
});

// ─── BOUNDARIES section: nodes, boundaries, assignments, ganglinien ───
const boundaryFiles = computed(() => {
  const files = {};

  // Nodes
  const rawNodes = toRaw(geoStore.nodes);
  if (rawNodes && rawNodes.length > 0) {
    let txt = `# Knoten (${rawNodes.length})\n`;
    txt += `# ID | X | Y | Z | Typ\n`;
    txt += '─'.repeat(60) + '\n';
    for (const n of rawNodes) {
      txt += `${n.id}  ${n.x?.toFixed(2)}  ${n.y?.toFixed(2)}  ${(n.z || 0).toFixed(2)}  ${n.type || ''}\n`;
    }
    files['nodes.txt'] = txt;
  }

  // Boundaries (GeoJSON)
  const rawBounds = toRaw(geoStore.boundaries);
  if (rawBounds && rawBounds.features && rawBounds.features.length > 0) {
    let txt = `# Randbedingungen (${rawBounds.features.length} Features)\n`;
    txt += '─'.repeat(60) + '\n';
    for (const f of rawBounds.features) {
      const p = f.properties || {};
      txt += `ID:   ${f.id || p.id || '?'}\n`;
      txt += `Name: ${p.name || p.label || '—'}\n`;
      txt += `Typ:  ${p.type || f.geometry?.type || '?'}\n`;
      if (f.geometry && f.geometry.coordinates) {
        const coords = f.geometry.coordinates;
        if (f.geometry.type === 'Point') {
          txt += `Pos:  [${coords[0]?.toFixed(4)}, ${coords[1]?.toFixed(4)}]\n`;
        } else {
          const coordStr = JSON.stringify(coords);
          txt += `Punkte: ${coordStr.length > 150 ? coordStr.substring(0, 150) + '...' : coordStr}\n`;
        }
      }
      txt += '\n';
    }
    files['boundaries.txt'] = txt;
  }

  // Assignments
  const rawAssign = toRaw(hydStore.assignments);
  if (rawAssign && Object.keys(rawAssign).length > 0) {
    let txt = `# Zuweisungen (${Object.keys(rawAssign).length})\n`;
    txt += `# ObjektID → Typ | Wert | Profil\n`;
    txt += '─'.repeat(60) + '\n';
    for (const [id, a] of Object.entries(rawAssign)) {
      txt += `${id.substring(0, 12)}  ${a.type || '?'}  Wert: ${a.value ?? '—'}  Profil: ${a.profileId || '—'}\n`;
    }
    files['assignments.txt'] = txt;
  }

  // Ganglinien (Hydrographs)
  const rawGang = toRaw(hydStore.ganglinien);
  if (rawGang && Object.keys(rawGang).length > 0) {
    let txt = `# Ganglinien / Profile (${Object.keys(rawGang).length})\n`;
    txt += '─'.repeat(60) + '\n';
    for (const [id, g] of Object.entries(rawGang)) {
      txt += `\n[${g.name || id}]  (${g.type || ''})\n`;
      txt += `  t [s]       v [m³/s]\n`;
      if (g.data && g.data.length > 0) {
        for (const pt of g.data) {
          txt += `  ${String(pt.t).padEnd(10)} ${pt.v}\n`;
        }
      }
    }
    files['ganglinien.txt'] = txt;
  }

  // Rain data
  const rawRain = toRaw(hydStore.rainData);
  if (rawRain && rawRain.length > 0) {
    let txt = `# Niederschlagsdaten (${rawRain.length} Werte)\n`;
    txt += '─'.repeat(40) + '\n';
    for (const pt of rawRain) {
      txt += `${pt.t || pt.time || '?'}  ${pt.v || pt.intensity || pt.value || '?'}\n`;
    }
    files['rain-data.txt'] = txt;
  }

  // Global roughness
  if (hydStore.globalRoughness) {
    files['roughness.txt'] = `Manning-n (global): ${hydStore.globalRoughness}`;
  }

  return files;
});

// ─── Current files for active section ───
const currentFiles = computed(() => {
  switch (activeSection.value) {
    case 'raster': return rasterFiles.value;
    case 'boundaries': return boundaryFiles.value;
    case 'input': return props.inputFiles;
    case 'output': return props.outputFiles;
    default: return {};
  }
});

const currentFileNames = computed(() => Object.keys(currentFiles.value).sort());

// Auto-select first file when section changes
watch([currentFileNames, activeSection], () => {
  if (currentFileNames.value.length > 0 && !currentFileNames.value.includes(selectedFile.value)) {
    selectedFile.value = currentFileNames.value[0];
  }
}, { immediate: true });

const currentContent = computed(() => currentFiles.value[selectedFile.value] || '');

const currentSize = computed(() => {
  const len = currentContent.value.length;
  if (len < 1024) return len + ' B';
  if (len < 1024 * 1024) return (len / 1024).toFixed(1) + ' KB';
  return (len / (1024 * 1024)).toFixed(2) + ' MB';
});

function copyToClipboard() {
  navigator.clipboard.writeText(currentContent.value);
}

function downloadCurrent() {
  const blob = new Blob([currentContent.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = selectedFile.value;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.result-inspector {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fff;
  margin-top: 0.75rem;
}

.inspector-header {
  padding: 0.5rem 0.8rem;
  border-bottom: 1px solid #e8e8e8;
}
.inspector-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #2c3e50;
}

/* Section Bar */
.section-bar {
  display: flex;
  gap: 2px;
  padding: 0.3rem 0.5rem;
  background: #f8f8f8;
  border-bottom: 1px solid #e8e8e8;
  overflow-x: auto;
}
.sec-btn {
  padding: 0.3rem 0.6rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 0.7rem;
  color: #777;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}
.sec-btn:hover { color: #2c3e50; background: rgba(0,0,0,0.04); }
.sec-btn.active {
  background: #fff;
  color: #2980b9;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.sec-count {
  background: rgba(41, 128, 185, 0.12);
  color: #2980b9;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 0.6rem;
  font-weight: 700;
}

/* File Tabs */
.file-tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
  padding: 0 0.4rem;
  gap: 2px;
}
.tab {
  padding: 0.3rem 0.55rem;
  border: none;
  background: none;
  font-size: 0.68rem;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  font-family: 'Fira Code', 'Consolas', monospace;
}
.tab:hover { color: #2c3e50; background: rgba(0,0,0,0.02); }
.tab.active {
  color: #2980b9;
  border-bottom-color: #2980b9;
  font-weight: 600;
}
.no-files {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.75rem;
  color: #aaa;
}

/* Content */
.content-viewer {
  display: flex;
  flex-direction: column;
}
.viewer-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.6rem;
  background: #f5f5f5;
  border-bottom: 1px solid #eee;
}
.file-name {
  font-size: 0.7rem;
  font-weight: 600;
  color: #2c3e50;
  font-family: monospace;
}
.file-size {
  font-size: 0.62rem;
  color: #95a5a6;
  margin-right: auto;
}
.tool-btn {
  padding: 0.12rem 0.3rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.68rem;
  transition: all 0.15s;
}
.tool-btn:hover { background: #eef6fc; border-color: #b0d4f1; }

.raw-content {
  margin: 0;
  padding: 0.5rem;
  overflow: auto;
  max-height: 350px;
  font-size: 0.62rem;
  line-height: 1.3;
  font-family: 'Fira Code', 'Consolas', 'Courier New', monospace;
  color: #333;
  white-space: pre;
  tab-size: 8;
}

/* Export */
.export-row {
  display: flex;
  justify-content: flex-end;
  padding: 0.35rem 0.6rem;
  border-top: 1px solid #e8e8e8;
}
.export-btn {
  padding: 0.25rem 0.7rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  color: #555;
  font-size: 0.7rem;
  cursor: pointer;
  transition: all 0.15s;
}
.export-btn:hover { background: #eef6fc; border-color: #b0d4f1; color: #2980b9; }
</style>
