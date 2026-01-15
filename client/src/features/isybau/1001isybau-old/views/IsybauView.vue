<template>
  <div class="isybau-view">
    <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
      <h2>ISYBAU Import</h2>
      
      <div class="upload-section">
        <label for="file-upload" class="file-upload-label">
          <span class="file-upload-btn">Datei auswählen</span>
          <span class="file-upload-text">{{ uploadedFileName || 'Keine ausgewählt' }}</span>
        </label>
        <input 
          id="file-upload"
          type="file" 
          accept=".xml" 
          @change="handleFileUpload" 
          :disabled="store.loading"
          class="file-upload-input"
        />
        <div v-if="store.loading" class="loading">Lade...</div>
        <div v-if="store.error" class="error">{{ store.error }}</div>
      </div>

      <div v-if="store.hasData" class="info-container">
        <!-- Project Card -->
        <div class="meta-card project-card">
          <div class="card-header">
            <h3>📁 Projekt Details</h3>
          </div>
          <div class="card-content">
            <div class="meta-item">
              <span class="label">Datei:</span>
              <span class="value" :title="store.metadata.fileName">{{ store.metadata.fileName }}</span>
            </div>
            <div class="meta-row">
              <div class="meta-item">
                <span class="label">Version:</span>
                <span class="value">{{ store.metadata.version }}</span>
              </div>
              <div class="meta-item">
                <span class="label">Datum:</span>
                <span class="value">{{ store.metadata.created }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Stats Card -->
        <div class="meta-card stats-card">
           <div class="card-header">
            <h3>📊 Netzstatistik</h3>
          </div>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-icon">⚪</span>
              <span class="stat-val">{{ store.nodeCount }}</span>
              <span class="stat-label">Knoten</span>
            </div>
             <div class="stat-item">
              <span class="stat-icon">➖</span>
              <span class="stat-val">{{ store.edgeCount }}</span>
              <span class="stat-label">Haltungen</span>
            </div>
             <div class="stat-item" v-if="store.inspections.length > 0">
              <span class="stat-icon">🔍</span>
              <span class="stat-val">{{ store.inspections.length }}</span>
              <span class="stat-label">Befahrungen</span>
            </div>
             <div class="stat-item">
              <span class="stat-icon">🏞️</span>
              <span class="stat-val">{{ store.hydraulics.areas.length }}</span>
              <span class="stat-label">Flächen</span>
            </div>
          </div>
        </div>
        
        <div class="actions">
          <!-- Rain Data Box -->
          <div class="control-box">
            <h3>Regendaten</h3>
            
            <button @click="openKostraModal" class="primary-btn full-width kostra-btn" title="KOSTRA Daten importieren">
              ☁️ KOSTRA Daten wählen
            </button>

            <div class="rain-summary">
              <div v-if="activeModelRain" class="rain-main">
                <span class="rain-value">Modellregen</span>
              </div>
              <div v-else class="rain-main">
                <span class="rain-value">{{ rainfall }}</span>
                <span class="rain-unit">l/(s·ha)</span>
              </div>
              <div class="rain-details">
                <span v-if="activeModelRain">{{ activeModelRain.type === 'block' ? 'Block' : 'Euler II' }} • </span>
                <span>{{ rainDuration }} min</span>
                <span class="separator">•</span>
                <span>{{ returnPeriod }}</span>
              </div>
            </div>

            <button @click="createModelRain" class="secondary-btn full-width" title="Euler Typ II / Blockregen erstellen">
              Modellregen erstellen
            </button>

            <div v-if="activeModelRain" class="mini-chart-container">
              <Bar :data="miniChartData" :options="miniChartOptions" />
            </div>

            <button @click="openPreprocessingModal" class="secondary-btn full-width" title="Hydraulische Daten bearbeiten">
              Daten bearbeiten
            </button>
          </div>

          <!-- Simulation Box -->
          <div class="control-box">
            <h3>Simulation</h3>

            <div class="control-group">
                <label>Simulationsdauer (h)</label>
                <div class="input-with-action">
                    <input type="number" v-model.number="simDuration" min="1" max="48" step="1">
                </div>
            </div>
            
            <button @click="runSimulation" class="primary-btn" :disabled="store.loading">
              {{ store.loading ? 'Berechne...' : 'Berechnen' }}
            </button>
            <div v-if="isSimulationCalculated" class="success-msg" style="margin-top: 0.5rem;">
              ✓ Netz berechnet
            </div>
            <button v-if="isSimulationCalculated" @click="showResultsModal = true" class="secondary-btn full-width btn-sm">
              Ergebnisse anzeigen
            </button>
            <button @click="downloadSimulationData" class="secondary-btn full-width btn-sm" title="Eingangsdaten als JSON speichern">
              💾 Eingangsdaten exportieren
            </button>
            <button v-if="isSimulationCalculated" @click="showDebugModal = true" class="secondary-btn full-width btn-sm" title="Input/Output Dateien ansehen">
               🔍 Debug: .inp / .rpt ansehen
            </button>
            <button v-if="isSimulationCalculated" @click="downloadResultsLog" class="secondary-btn full-width btn-sm" title="Simulationsergebnisse als JSON speichern">
              💾 Ergebnisse speichern
            </button>
          </div>



          <div class="view-controls" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
             <button 
                @click="viewMode = 'editor'" 
                class="secondary-btn" 
                :class="{ active: viewMode === 'editor' }"
             >
              ✏️ Editor
            </button>
            <button 
                v-if="isSimulationCalculated"
                @click="viewMode = 'results'" 
                class="secondary-btn" 
                :class="{ active: viewMode === 'results' }"
             >
              📊 Ergebnisse (Karte)
            </button>
             <button 
                @click="viewMode = viewMode === '3d' ? 'editor' : '3d'" 
                class="secondary-btn"
                :class="{ active: viewMode === '3d' }"
             >
              🧊 3D Ansicht
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Resizer Handle -->
    <div class="resizer" @mousedown="startResize"></div>

    <!-- KOSTRA Modal -->
    <KostraModal 
      :is-open="showKostraModal"
      :reference-point="referencePoint"
      @close="showKostraModal = false"
      @select="handleKostraSelect"
      @data-loaded="(data) => kostraRawData = data"
    />

    <!-- Model Rain Modal -->
    <ModelRainModal
      :is-open="showModelRainModal"
      :kostra-data="kostraRawData"
      :initial-duration="rainDuration"
      :initial-intensity="rainfall"
      @close="showModelRainModal = false"
      @apply="handleModelRainApply"
    />

    <!-- Preprocessing Modal -->
    <PreprocessingModal
      :is-open="showPreprocessingModal"
      :network="store.network"
      :hydraulics="store.hydraulics"
      @close="showPreprocessingModal = false"
      @apply="handlePreprocessingApply"
    />

    <!-- Simulation Results Modal -->
    <SimulationResultsModal
      ref="resultsModal"
      :is-open="showResultsModal"
      :nodes="store.network.nodes" 
      :edges="store.network.edges"
      :areas="store.hydraulics.areas"
      :edge-results="store.hydraulics.results"
      :node-results="store.hydraulics.nodeResults"
      :time-series="store.hydraulics.timeSeries"
      :runoff-details="runoffDetails"
      :mass-balance="store.hydraulics.massBalance"
      :subcatchment-results="store.hydraulics.subcatchmentResults"
      :system-stats="store.hydraulics.systemStats"
      @close="showResultsModal = false"
    />

    <!-- Simulation Debug Modal -->
    <SimulationDebugModal
      :is-open="showDebugModal"
      :input-text="store.hydraulics.inputInp"
      :report-text="store.hydraulics.report"
      @close="showDebugModal = false"
    />

    <div class="main-content">
      <IsybauViewer 
        v-if="viewMode === 'editor'"
        :nodes="store.network.nodes" 
        :edges="store.network.edges"
        :areas="store.hydraulics.areas"
        :hydraulics="store.hydraulics.results"
        :nodeResults="store.hydraulics.nodeResults"
        :runoffDetails="runoffDetails"
        @select-node="handleNodeSelect"
        @select-edge="handleEdgeSelect"
        @update-element="handleElementUpdate"
      />
      <IsybauViewerResult
        v-else-if="viewMode === 'results'"
        :nodes="store.network.nodes" 
        :edges="store.network.edges"
        :areas="store.hydraulics.areas"
        :hydraulics="store.hydraulics.results"
        :nodeResults="store.hydraulics.nodeResults"
        :runoffDetails="runoffDetails"
        @select-node="handleNodeSelect"
        @select-edge="handleEdgeSelect"
        @show-details="handleShowDetails"
      />
      <IsybauViewer3D
        v-else-if="viewMode === '3d'"
        :nodes="store.network.nodes" 
        :edges="store.network.edges"
        :areas="store.hydraulics.areas"
      />
      
      <!-- Rain Overlay -->
      <div v-if="isRaining" class="rain-overlay">
        <img src="../components/raining-14436.gif" alt="Raining" class="rain-gif" />
      </div>

      <!-- Runoff Validation Modal -->
      <RunoffValidationModal
        v-if="showValidationModal"
        :details="runoffDetails"
        @close="showValidationModal = false"
        @recalculate="handleRecalculateRunoff"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import { useIsybauStore } from '@/stores/isybauStore';
// import { calculateSurfaceRunoff } from '../utils/hydraulics'; // DELETED
import IsybauViewerResult from '../components/IsybauViewerResults.vue'; // Correct import name? Check file name. I named it IsybauViewerResults.vue
import IsybauViewer from '../components/IsybauViewer.vue';
import IsybauViewer3D from '../components/IsybauViewer3D.vue';
import KostraModal from '../components/KostraModal.vue';
import ModelRainModal from '../components/ModelRainModal.vue';
import PreprocessingModal from '../components/PreprocessingModal.vue';
import RunoffValidationModal from '../components/RunoffValidationModal.vue';
import SimulationResultsModal from '../components/SimulationResultsModal.vue';
import SimulationDebugModal from '../components/SimulationDebugModal.vue';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const store = useIsybauStore();
const viewMode = ref('editor'); // 'editor', 'results', '3d'
const rainfall = ref(120.0); // Default l/s*ha
const rainDuration = ref(15); // Default min
const simDuration = ref(6); // Default 6 hours
const returnPeriod = ref('1 a'); // Default
const showKostraModal = ref(false);
const showModelRainModal = ref(false);
const showPreprocessingModal = ref(false);
const showValidationModal = ref(false);
const referencePoint = ref(null);
const isRaining = ref(false);

const kostraRawData = ref(null); // Store full KOSTRA data
const activeModelRain = ref(null); // { type, series, metadata }
const nodeInflows = ref(null); // Map<NodeID, Array<value>>
const runoffDetails = ref([]); // Array of details
const isRunoffCalculated = ref(false);
const isSimulationCalculated = ref(false);
const showResultsModal = ref(false);
const showDebugModal = ref(false);
const uploadedFileName = ref('');

const runSimulation = async () => {
  console.log("Starting Simulation...");
  

  isRaining.value = true;
  setTimeout(() => {
    isRaining.value = false;
  }, 5000);


  const params = {
    rainfallIntensity: rainfall.value,
    rainDuration: rainDuration.value,
    nodeInflows: nodeInflows.value, // Pass pre-calculated inflows
    duration: simDuration.value // Simulation duration in hours
  };

  if (activeModelRain.value) {
    params.rainSeries = activeModelRain.value.series;
    params.rainType = activeModelRain.value.type;
    // Pass interval if available (default 5 for Kostra/Block usually)
    if (activeModelRain.value.metadata && activeModelRain.value.metadata.interval) {
        params.rainInterval = activeModelRain.value.metadata.interval;
    }
  } else {
    alert("Es konnte kein Regen geladen werden !");
    store.loading = false;
    return;
  }

  // Debug Log
  const debugData = {
    nodes: Array.from(store.network.nodes.entries()),
    edges: Array.from(store.network.edges.entries()),
    hydraulics: store.hydraulics,
    params: params
  };
  console.log("Simulation Input Data (Full):", debugData);

  try {
    await store.calculateHydraulics(params);
    
    if (!store.error) {
      isSimulationCalculated.value = true;
      console.log("Simulation finished.");
      
      // Check for Warnings from Worker
      if (store.hydraulics.warnings && store.hydraulics.warnings.length > 0) {
          const warningMsg = "Hinweis: Für folgende Haltungen wurden Standardwerte (1000mm PVC) gesetzt, da Daten fehlten:\n\n" + store.hydraulics.warnings.join("\n");
          alert(warningMsg);
      }

      // DEBUG: Log full results as requested
      console.group("Simulation Results Debug");
      console.log("Edge Results:", store.hydraulics.results);
      console.log("Node Results:", store.hydraulics.nodeResults);
      console.log("Time Series Data:", store.hydraulics.timeSeries);
      console.groupEnd();

      showResultsModal.value = true;
      viewMode.value = 'results'; // Switch to results view automatically
    }
  } catch (error) {
    console.error("Simulation failed:", error);
    alert("Simulation fehlgeschlagen: " + error.message);
  } finally {
    store.loading = false; // Reset loading state
  }
};

const serializeMap = (data) => {
  if (!data) return [];
  if (data instanceof Map) return Array.from(data.entries());
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') return Object.entries(data);
  return [];
};

const downloadSimulationData = () => {
  try {
    const params = {
      rainfallIntensity: rainfall.value,
      duration: rainDuration.value,
      nodeInflows: serializeMap(nodeInflows.value)
    };
    if (activeModelRain.value) {
      params.rainSeries = activeModelRain.value.series;
      params.rainType = activeModelRain.value.type;
    }

    const data = {
      nodes: serializeMap(store.network.nodes),
      edges: serializeMap(store.network.edges),
      hydraulics: store.hydraulics,
      params: params
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulation_input.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export Error:", error);
    alert("Export fehlgeschlagen: " + error.message);
  }
};

const downloadResultsLog = () => {
  try {
    const data = {
      results: {
          edges: serializeMap(store.hydraulics.results),
          nodes: serializeMap(store.hydraulics.nodeResults),
          massBalance: store.hydraulics.massBalance,
          timeSeries: store.hydraulics.timeSeries
      },
      params: {
          rainfallIntensity: rainfall.value,
          duration: rainDuration.value
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulation_results_log.json';
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download Error:", error);
    alert("Download fehlgeschlagen: " + error.message);
  }
};

const calculateRunoff = (options = {}) => {
  // Client-side runoff disabled in favor of SWMM Wasm solver.
  // Ideally this button should trigger the full simulation or be removed.
  alert("Die separate Oberflächenabfluss-Berechnung wurde deaktiviert. Bitte nutzen Sie die vollständige hydraulische Simulation.");
};

const handleRecalculateRunoff = (options) => {
  calculateRunoff({ ...options, isRecalc: true });
};

const handleElementUpdate = ({ element, key, value }) => {
  console.log('Update Element:', element.id, key, value);
  
  // Update Node
  if (store.network.nodes.has(element.id)) {
    const node = store.network.nodes.get(element.id);
    node[key] = value;
  }
  
  // Update Area
  const areaIndex = store.hydraulics.areas.findIndex(a => a.id === element.id);
  if (areaIndex !== -1) {
    store.hydraulics.areas[areaIndex][key] = value;
  }
  
  // Trigger reactivity if needed (Vue 3 Map/Array reactivity usually handles this)
};

const createModelRain = () => {
  showModelRainModal.value = true;
};

const handleModelRainApply = (data) => {
  console.log("Model Rain Created:", data);
  activeModelRain.value = data;
  
  // Update display values if possible
  if (data.metadata) {
      rainDuration.value = data.metadata.duration;
      if (data.metadata.returnPeriod) {
          returnPeriod.value = data.metadata.returnPeriod;
      }
  }
};

const openPreprocessingModal = () => {
  if (store.network.nodes.size > 0) {
    showPreprocessingModal.value = true;
  } else {
    alert("Bitte laden Sie zuerst ein Netz.");
  }
};

const handlePreprocessingApply = (data) => {
  store.updateNetworkData(data);
  // Optional: Trigger recalculation if needed or just notify
  console.log("Network data updated", data);
};

const openKostraModal = () => {
  console.log("openKostraModal called");
  if (store.network.nodes.size > 0) {
    const firstNode = store.network.nodes.values().next().value;
    referencePoint.value = { x: firstNode.x, y: firstNode.y };
    showKostraModal.value = true;
  } else {
    alert("Bitte laden Sie zuerst ein Netz.");
  }
};

const handleKostraSelect = (data) => {
  // Handle both old (value only) and new (object) format for safety
  if (typeof data === 'object') {
    rainfall.value = data.value;
    rainDuration.value = data.duration;
    returnPeriod.value = data.returnPeriodLabel;
    // We need to capture the raw data if available. 
    // KostraModal emits select, but maybe we need to fetch it or pass it through?
    // KostraModal currently doesn't pass raw data in 'select' event.
    // I need to update KostraModal to pass raw data too.
  } else {
    rainfall.value = data;
  }
  // Reset active model rain when manually selecting KOSTRA or value
  activeModelRain.value = null;
};

const miniChartData = computed(() => {
  if (!activeModelRain.value) return null;
  const series = activeModelRain.value.series;
  return {
    labels: series.map(s => s.time),
    datasets: [{
      label: 'Regen',
      data: series.map(s => s.height_mm !== undefined ? s.height_mm : (s.intensity * (activeModelRain.value.metadata.interval || 5) * 0.006)),
      backgroundColor: '#3498db',
      barThickness: 4
    }]
  };
});

const miniChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { enabled: true }
  },
  scales: {
    x: { display: false },
    y: { 
      display: true,
      ticks: { font: { size: 8 } }
    }
  }
};

const toggle3D = () => {
  is3DMode.value = !is3DMode.value;
};

const handleFileUpload = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  
  uploadedFileName.value = file.name;
  await store.loadFile(file);
};

// Sidebar Resizing
const sidebarWidth = ref(300);
const isResizing = ref(false);

const startResize = () => {
  isResizing.value = true;
  document.addEventListener('mousemove', resize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const resize = (e) => {
  if (isResizing.value) {
    // Limit width between 250px and 600px
    const newWidth = Math.max(250, Math.min(600, e.clientX));
    sidebarWidth.value = newWidth;
  }
};

const handleNodeSelect = (nodeId) => {
  console.log('Node Selected:', nodeId);
  // Future: Open detail view or highlight
};

const handleEdgeSelect = (edgeId) => {
  console.log('Edge Selected:', edgeId);
  // Future: Open detail view or highlight
};

const resultsModal = ref(null);

const handleShowDetails = async (element) => {
  showResultsModal.value = true;
  await nextTick();
  
  if (store.network.edges.has(element.id)) {
      if (resultsModal.value) resultsModal.value.selectEdge(element.id);
  } else if (store.network.nodes.has(element.id)) {
      if (resultsModal.value) resultsModal.value.selectNode(element.id);
  } else if (element.points) { // Area
      // Area details not implemented in modal selection yet
  }
};

const stopResize = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', resize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};
</script>

<style scoped>
.isybau-view {
  display: flex;
  height: 100vh;
  font-family: sans-serif;
}

.sidebar {
  /* width is handled by inline style */
  padding: 1rem;
  background: #fff;
  border-right: 1px solid #ddd;
  overflow-y: auto;
  flex-shrink: 0;
}

.resizer {
  width: 5px;
  background: #f0f0f0;
  cursor: col-resize;
  transition: background 0.2s;
}

.resizer:hover, .resizer:active {
  background: #3498db;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.control-box {
  background: white;
  padding: 1rem;
  border-radius: 6px;
  border: 1px solid #ddd;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.control-box h3 {
  margin-top: 0;
  margin-bottom: 0.75rem;
  font-size: 1rem;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
}

.full-width {
  width: 100%;
  margin-top: 1.5rem;
}

.control-group {
  margin-bottom: 1.5rem;
}

.control-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #2c3e50;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 1rem;
  font-size: 0.95rem;
  color: #555;
  padding: 0.5rem 0;
  border-top: 1px solid #f5f5f5;
}

.info-row .value {
  font-weight: 600;
  color: #2c3e50;
}

.simulation-controls input {
  width: 60px;
  padding: 0.25rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: right;
}

.input-with-action {
  display: flex;
  gap: 0.5rem;
}

.input-with-action input {
  flex: 1;
}

.input-with-action button {
  padding: 0.25rem 0.5rem;
  background: #ecf0f1;
  border: 1px solid #bdc3c7;
  border-radius: 4px;
  cursor: pointer;
}

.input-with-action button:hover {
  background: #bdc3c7;
}

.kostra-btn {
  background: #2980b9;
  margin-bottom: 1rem;
  font-size: 1rem;
}

.rain-summary {
  text-align: center;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #eee;
}

.rain-main {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 0.3rem;
  margin-bottom: 0.3rem;
}

.rain-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2c3e50;
}

.rain-unit {
  font-size: 0.9rem;
  color: #7f8c8d;
}

.rain-details {
  font-size: 0.9rem;
  color: #555;
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

.separator {
  color: #ccc;
}

.primary-btn {
  width: 100%;
  padding: 0.75rem;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.primary-btn:hover {
  background: #2980b9;
}

.secondary-btn {
  background: white;
  color: #333;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
}

.main-content {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
}

.upload-section {
  margin-bottom: 2rem;
}

.file-upload-input {
  display: none;
}

.file-upload-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.file-upload-btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: white;
  color: #333;
  border: 1px solid #bdc3c7;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.file-upload-btn:hover {
  background: #ecf0f1;
  border-color: #95a5a6;
}

.file-upload-text {
  color: #666;
  font-size: 0.9rem;
}

.error {
  color: red;
  margin-top: 0.5rem;
}

.selection-info {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  background: white;
  padding: 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  max-width: 400px;
  max-height: 300px;
  overflow: auto;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.mini-chart-container {
  height: 100px;
  margin-top: 1rem;
  background: #f8f9fa;
  border-radius: 4px;
  padding: 0.5rem;
}

.success-msg {
  color: #27ae60;
  font-size: 0.9rem;
  text-align: center;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

/* Rain Animation */
.rain-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Let clicks pass through */
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0,0,0,0.1); /* Slight darken */
}

.rain-gif {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.6;
}

/* Modern Metadata Styling */
.info-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1rem;
}

.meta-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  overflow: hidden;
  border: 1px solid #eee;
}

.card-header {
  background: #f8f9fa;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #eee;
}

.card-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #2c3e50;
}

.card-content {
  padding: 1rem;
}

.meta-item {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
}

.meta-item:last-child {
  margin-bottom: 0;
}

.meta-row {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
}

.meta-item .label {
  font-size: 0.75rem;
  color: #7f8c8d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.meta-item .value {
  font-size: 0.9rem;
  color: #2c3e50;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: #eee; /* for borders */
}

.stat-item {
  background: white;
  padding: 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.stat-icon {
  font-size: 1.2rem;
  margin-bottom: 0.25rem;
}

.stat-val {
  font-size: 1.1rem;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1.2;
}

.stat-label {
  font-size: 0.75rem;
  color: #7f8c8d;
  margin-top: 0.2rem;
}
</style>
