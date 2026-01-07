<template>
  <div class="isybau-main">
    <Sidebar :width="300">
        <!-- Pass Props to SimulationControls if needed, or rely on Store -->
        <SimulationControls />
        
        <div class="sidebar-nav">
          <h3>Ansicht</h3>
          <button 
            @click="viewMode = '2d'" 
            :class="['nav-btn', { active: viewMode === '2d' }]"
          >
            ✏️ Editor (2D)
          </button>
          <button 
            @click="viewMode = '3d'" 
            :class="['nav-btn', { active: viewMode === '3d' }]"
          >
            🧊 3D Ansicht
          </button>
          <button 
            v-if="hasResults"
            @click="viewMode = 'result'" 
            :class="['nav-btn', { active: viewMode === 'result' }]"
          >
            📊 Ergebnisse
          </button>
        </div>
    </Sidebar>
    
    <div class="content-area">
        <!-- Toolbar / View Switcher -->
        <div class="view-switcher">
            <button @click="viewMode = '2d'" :class="{ active: viewMode === '2d' }">2D Karte</button>
            <button @click="viewMode = '3d'" :class="{ active: viewMode === '3d' }">3D Ansicht</button>
            <button @click="viewMode = 'result'" :class="{ active: viewMode === 'result' }" v-if="hasResults">Ergebnisse</button>
            <button class="help-btn" @click="showHelpModal = true" title="Hilfe & Anleitung">ℹ️</button>
        </div>

        <!-- 2D View (Editor / Map) -->
        <div v-show="viewMode === '2d'" class="view-container">
            <IsybauEditor 
                @create-area="handleCreateAreaRequest" 
                @create-edge="handleCreateEdgeRequest"
                @create-node="handleCreateNodeRequest"
                :focusTarget="focusedElementId"
            />
        </div>

        <!-- 3D View -->
        <div v-if="viewMode === '3d'" class="view-container">
            <IsybauViewer3D 
                :nodes="store.nodes" 
                :edges="store.edges" 
                :areas="store.areaArray"
            />
        </div>

        <!-- Results View -->
        <div v-if="viewMode === 'result'" class="view-container">
            <IsybauViewer 
                :nodes="store.nodes" 
                :edges="store.edges"
                :areas="store.areaArray"
                :node-array="store.nodeArray"
                :edge-array="store.edgeArray"
                :hydraulics="new Map(Object.entries(store.simulation.results?.edges || {}))"
                :nodeResults="new Map(Object.entries(store.simulation.results?.nodes || {}))"
                :runoffDetails="store.simulation.results?.subcatchments ? Object.values(store.simulation.results.subcatchments) : []"
                :focusTarget="focusedElementId"
                @show-details="handleShowDetails"
            />
                @show-details="handleShowDetails"
            />
        </div>
    </div>

    <!-- Global Modals -->
    <!-- These rely on Store state to open/close -->
    <KostraModal 
      v-if="store.ui.showKostraModal" 
      :is-open="store.ui.showKostraModal" 
      :reference-point="store.center"
      @close="store.ui.showKostraModal = false" 
    />
    <ModelRainModal 
      v-if="store.ui.showRainModal" 
      :is-open="store.ui.showRainModal"
      :kostra-data="store.rain.kostraData"
      @close="store.ui.showRainModal = false" 
    />
    <PreprocessingModal
      v-if="store.ui.showPreprocessingModal"
      :is-open="store.ui.showPreprocessingModal"
      :network="{ nodes: store.nodes, edges: store.edges }" 
      :hydraulics="{ catchments: [], areas: store.areaArray }"
      @close="store.ui.showPreprocessingModal = false"
      @apply="(data) => { store.updateNetworkData(data); store.ui.showPreprocessingModal = false; }"
      @select-element="handleHighlightElement"
    />
    <SimulationResultsModal 
      v-if="store.ui.showResultsModal" 
      :is-open="store.ui.showResultsModal"
      :nodes="store.nodes"
      :edges="store.edges"
      :areas="store.areaArray"
      :edgeResults="new Map(Object.entries(store.simulation.results?.edges || {}))"
      :nodeResults="new Map(Object.entries(store.simulation.results?.nodes || {}))"
      :timeSeries="store.simulation.results?.timeSeries || []"
      :runoffDetails="Object.values(store.simulation.results?.subcatchments || {})"
      :subcatchmentResults="new Map(Object.entries(store.simulation.results?.subcatchments || {}))"
      :systemStats="store.simulation.results?.systemStats || {}"
      @close="store.ui.showResultsModal = false" 
      @show-debug="store.ui.showDebugModal = true"
    />
    <SimulationDebugModal
        v-if="store.ui.showDebugModal"
        :is-open="store.ui.showDebugModal"
        :input-text="store.simulation.results?.input || ''"
        :report-text="store.simulation.results?.report || ''"
        @close="store.ui.showDebugModal = false"
    />
    <IsybauHelpModal
        v-if="showHelpModal"
        :is-open="showHelpModal"
        @close="showHelpModal = false"
    />
    
    <ElementPropertiesModal 
        :is-open="showElementModal"
        :mode="elementModalMode"
        :element-data="elementModalData"
        :is-edit="elementModalIsEdit"
        :available-nodes="store.nodeArray"
        :available-edges="store.edgeArray"
        @close="showElementModal = false"
        @save="handleElementSave"
    />

    <!-- Validation Warnings Toast -->
    <Transition name="slide-up">
        <div v-if="warningToast.show" class="warning-toast">
            <div class="toast-header">
                <span class="warning-icon">⚠️</span>
                <strong>Datenvalidierung: Standardwerte verwendet</strong>
                <button class="close-toast" @click="warningToast.show = false">×</button>
            </div>
            <div class="toast-body">
                <p>Es wurden Annahmen getroffen, da Daten fehlten:</p>
                <ul>
                    <li v-for="(msg, index) in warningToast.messages.slice(0, 5)" :key="index">{{ msg }}</li>
                </ul>
                <p v-if="warningToast.messages.length > 5">...und {{ warningToast.messages.length - 5 }} weitere.</p>
            </div>
        </div>
    </Transition>
    
    <!-- Rain Overlay -->
    <Transition name="fade">
        <div v-if="showRainOverlay" class="rain-overlay">
            <img :src="rainGif" alt="Raining..." />
        </div>
    </Transition>
    
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useIsybauStore } from '../store/index.js';
import Sidebar from '../components/panels/Sidebar.vue';
import SimulationControls from '../components/panels/SimulationControls.vue';
import IsybauEditor from '../components/editor/IsybauEditor.vue';
import IsybauViewer from '../components/visualizer/IsybauViewer.vue';
import IsybauViewer3D from '../components/visualizer/IsybauViewer3D.vue';


// Import Modals (ensure paths are correct)
import KostraModal from '../components/modals/KostraModal.vue';
import ModelRainModal from '../components/modals/ModelRainModal.vue';
import PreprocessingModal from '../components/modals/PreprocessingModal.vue';
import SimulationResultsModal from '../components/modals/SimulationResultsModal.vue';
import SimulationDebugModal from '../components/modals/SimulationDebugModal.vue';
import ElementPropertiesModal from '../components/modals/ElementPropertiesModal.vue';
import IsybauHelpModal from '../components/modals/IsybauHelpModal.vue';

const store = useIsybauStore();
const viewMode = ref('2d');

const hasResults = computed(() => !!store.simulation.results);


// Element Modal State
const showElementModal = ref(false);
const elementModalMode = ref('area');
const elementModalData = ref({});
const elementModalIsEdit = ref(false);

const showHelpModal = ref(false);

const handleCreateNodeRequest = ({ x, y }) => {
    console.log("Opening Generic Modal for Node", x, y);
    elementModalMode.value = 'node';
    elementModalIsEdit.value = false;
    elementModalData.value = {
        x: x,
        y: y
    };
    showElementModal.value = true;
};

const focusedElementId = ref(null);
const handleHighlightElement = ({ id }) => {
    console.log("Highlighting Element:", id);
    focusedElementId.value = id;
    // Reset after short delay so we can re-trigger if needed? 
    // Actually watchers work on value change. If I click same row twice, it won't re-trigger. 
    // Force reset using setTimeout
    setTimeout(() => { focusedElementId.value = null; }, 500); 
}; 

const handleShowDetails = (element) => {
    // Extract ID if it's an object, or use it directly
    const id = element?.id || element;
    console.log("Showing Details for:", id);
    
    // Set focus target to select the row in the modal
    focusedElementId.value = id;
    
    // Open the modal
    store.ui.showResultsModal = true;
    
    // Reset focus after delay (modal watcher needs to catch it first)
    setTimeout(() => { focusedElementId.value = null; }, 500);
};

const handleCreateAreaRequest = ({ points, size }) => {
    console.log("Opening Generic Modal for Area", size);
    elementModalMode.value = 'area';
    elementModalIsEdit.value = false;
    // Pass points in data so we can retrieve them on save
    elementModalData.value = {
        size: parseFloat(size.toFixed(4)),
        points: points
    };
    showElementModal.value = true;
};

const handleCreateEdgeRequest = ({ from, to }) => {
    console.log("Opening Generic Modal for Edge", from, to);
    elementModalMode.value = 'edge';
    elementModalIsEdit.value = false;
    // Pass topology IDs as hidden metadata or initial data
    elementModalData.value = {
        metaFromId: from,
        metaToId: to
    };
    showElementModal.value = true;
};

const handleElementSave = ({ mode, data }) => {
    console.log("Saving Element", mode, data);
    
    if (mode === 'area') {
        const points = data.points || [];
        if (points.length < 3) {
            console.error("Missing points for area creation");
            return;
        }
        
        store.addArea({
            points: points,
            properties: data
        });
    } else if (mode === 'edge') {
        const fromId = data.metaFromId || data.fromNodeId;
        const toId = data.metaToId || data.toNodeId;
        console.log("Saving Edge with IDs:", fromId, toId);
        
        store.addEdge({
            fromId: fromId,
            toId: toId,
            properties: data
        });
    } else if (mode === 'node') {
        // Allow passing properties object to addNode
         const props = { ...data };
         // Map UI field 'cover' to Domain field 'coverZ'
         if (props.cover !== undefined) {
             props.coverZ = props.cover;
             delete props.cover;
         }
         store.addNode(data.x, data.y, props);
    }
    
    showElementModal.value = false;
};

// --- Validation Warnings Toast ---
const warningToast = ref({ show: false, messages: [] });
import { watch } from 'vue'; // Ensure watch is imported
import rainGif from '../components/visualizer/raining-14436.gif';

const showRainOverlay = ref(false);

const triggerRainEffect = () => {
    showRainOverlay.value = true;
    setTimeout(() => { showRainOverlay.value = false; }, 5000);
};

// Watch for changes in Rain Configuration to trigger effect
watch(() => [store.rain.activeModelRain, store.rain.intensity], ([newRain, newInt], [oldRain, oldInt]) => {
     // Trigger if activeModelRain changes OR intensity changes significantly
     // Avoid triggering on initial load if possible (though newVal !== oldVal handles it mostly)
     const rainChanged = newRain !== oldRain;
     const intensityChanged = Math.abs((newInt || 0) - (oldInt || 0)) > 0.1;
     
     if (rainChanged || intensityChanged) {
         triggerRainEffect();
     }
});

watch(() => store.simulation.results, (newVal) => {
    if (newVal && newVal.warnings && newVal.warnings.length > 0) {
        warningToast.value = {
            show: true,
            messages: newVal.warnings
        };
        // Auto-hide after 10s? Or keep until dismissed because "Assumption is worse than error"
        // User wants explicit notification. Keep until dismissed.
    } else {
        warningToast.value = { show: false, messages: [] };
    }
});
</script>

<style scoped>
.isybau-main {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
}

.view-switcher {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
    background: white;
    padding: 0.25rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    display: flex;
    gap: 0.25rem;
}

.view-switcher button {
    padding: 0.5rem 1rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 4px;
    font-weight: 500;
}

.view-switcher button.active {
    background: #e3f2fd;
    color: #1976D2;
}

.help-btn {
    margin-left: 0.5rem;
    background: #e1f5fe !important;
    border: 1px solid #b3e5fc !important;
    color: #0277bd;
}

.help-btn:hover {
    background: #b3e5fc !important;
}

.view-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.placeholder {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    color: #888;
}

.sidebar-nav {
  margin-top: 1.5rem;
  border-top: 1px solid #eee;
  padding-top: 1rem;
}

.nav-btn {
  display: block;
  width: 100%;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: #f8f9fa;
  border-color: #bbb;
}

.nav-btn.active {
  background: #e3f2fd;
  border-color: #2196F3;
  color: #1565C0;
  font-weight: 500;
}

/* Warning Toast */
.warning-toast {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 400px;
    background: #e3f2fd; /* Light Blue as requested */
    border-left: 5px solid #f39c12; /* Warning Orange */
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    border-radius: 4px;
    padding: 1rem;
    z-index: 2000;
    font-size: 0.9rem;
    color: #2c3e50;
}

.toast-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
}

.warning-icon {
    font-size: 1.2rem;
    margin-right: 0.5rem;
}

.close-toast {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: #7f8c8d;
}

.toast-body ul {
    margin: 0;
    padding-left: 1.2rem;
    max-height: 200px;
    overflow-y: auto;
}

.toast-body li {
    margin-bottom: 0.25rem;
    color: #c0392b; /* Dark Red for errors/msgs */
}

.slide-up-enter-active, .slide-up-leave-active {
    transition: all 0.3s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
    opacity: 0;
    transform: translateY(20px);
}

/* Rain Overlay */
.rain-overlay {
    position: absolute;
    top: 0; 
    left: 0; 
    width: 100%; 
    height: 100%;
    pointer-events: none;
    z-index: 9999;
    background: rgba(0,0,0,0.1); /* Slight dim */
}
.rain-overlay img { 
    width: 100%; 
    height: 100%; 
    object-fit: cover; 
    mix-blend-mode: screen; /* Helps integrate if GIF has black background, otherwise Normal */
    opacity: 0.6;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>

