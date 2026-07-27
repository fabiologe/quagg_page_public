<template>
  <div class="isybau-main" :data-theme="store.ui.darkMode ? 'dark' : 'light'">
    <Sidebar :width="300" @open-project-manager="store.ui.showProjectManager = true">
        <!-- Pass Props to SimulationControls if needed, or rely on Store -->
        <SimulationControls />
        
        <div class="sidebar-nav">
          <h3>Ansicht</h3>
          <button 
            @click="viewMode = '2d'" 
            :class="['nav-btn', { active: viewMode === '2d' }]"
          >
            <img class="tb-icon" src="/saintv1d/icons/Interface-Essential-Map--Streamline-Pixel.svg" /> Editor (2D)
          </button>
          <button
            @click="goto3d(false)"
            :class="['nav-btn', { active: viewMode === '3d' && !autoResultsFor3d }]"
          >
            <img class="tb-icon" src="/saintv1d/icons/Interface-Essential-Global-Public--Streamline-Pixel.svg" /> 3D Ansicht
          </button>
          <button
            v-if="hasResults"
            @click="viewMode = 'result'"
            :class="['nav-btn', { active: viewMode === 'result' }]"
          >
            <img class="tb-icon" src="/saintv1d/icons/Interface-Essential-Expand-3--Streamline-Pixel.svg" /> Ergebnisse
          </button>
          <button
            v-if="hasResults"
            @click="goto3d(true)"
            :class="['nav-btn', 'nav-btn-result3d', { active: viewMode === '3d' && autoResultsFor3d }]"
          >
            <img class="tb-icon" src="/saintv1d/icons/Interface-Essential-Global-Public--Streamline-Pixel.svg" /> Ergebnis 3D
          </button>
        </div>
    </Sidebar>
    
    <div class="content-area">
        <!-- Toolbar / View Switcher -->
        <div class="view-switcher">
            <button @click="viewMode = '2d'" :class="{ active: viewMode === '2d' }">2D Karte</button>
            <button @click="goto3d(false)" :class="{ active: viewMode === '3d' && !autoResultsFor3d }">3D Ansicht</button>
            <button v-if="hasResults" @click="viewMode = 'result'" :class="{ active: viewMode === 'result' }" data-tutorial="view-results">Ergebnisse</button>
            <button v-if="hasResults" @click="goto3d(true)" :class="{ active: viewMode === '3d' && autoResultsFor3d }" class="result3d-tab">Ergebnis 3D</button>
            <button class="help-btn" @click="store.ui.showHelpModal = true" title="Hilfe & Anleitung">
                <img class="tb-icon" src="/saintv1d/icons/Interface-Essential-Question-Help-Circle-2--Streamline-Pixel.svg" />
            </button>
        </div>

        <!-- 2D View (Editor / Map) -->
        <div v-show="viewMode === '2d'" class="view-container">
            <IsybauEditor
                @create-area="({ points, size }) => store.openElementModal('area', { size: parseFloat(size.toFixed(4)), points })"
                @create-edge="({ from, to }) => store.openElementModal('edge', { metaFromId: from, metaToId: to })"
                @create-node="handleCreateNode"
                @split-edge="handleSplitEdge"
                :focusTarget="store.editor.focusTargetId"
            />
        </div>

        <!-- 3D View -->
        <div v-if="viewMode === '3d'" class="view-container">
            <IsybauViewer3D
                :nodes="store.nodes"
                :edges="store.edges"
                :areas="store.areaArray"
                :nodeResults="new Map(Object.entries(store.simulation.results?.nodes || {}))"
                :edgeResults="new Map(Object.entries(store.simulation.results?.edges || {}))"
                :systemStats="store.simulation.results?.systemStats || {}"
                :autoShowResults="autoResultsFor3d"
            />
        </div>

        <!-- Results View: derselbe 2D-Renderer, aber explizit read-only -->
        <div v-if="viewMode === 'result'" class="view-container">
            <IsybauViewer
                readonly
                :nodes="store.nodes"
                :edges="store.edges"
                :areas="store.areaArray"
                :node-array="store.nodeArray"
                :edge-array="store.edgeArray"
                :hydraulics="new Map(Object.entries(store.simulation.results?.edges || {}))"
                :nodeResults="new Map(Object.entries(store.simulation.results?.nodes || {}))"
                :runoffDetails="store.simulation.results?.subcatchments ? Object.values(store.simulation.results.subcatchments) : []"
                :focusTarget="store.editor.focusTargetId"
                :origin-anchor="store.metadata.originAnchor"
                @show-details="handleShowDetails"
            />
        </div>

        <!-- Message Ticker -->
        <MessageTicker />
    </div>

    <!-- Tutorial-Maskottchen (Kanaltaucher-Ratte): eigenes Modul in ../tutorial/ -->
    <TutorialMascot />

    <!-- Global Modals — Verdrahtung zentral in IsybauModals.vue (store.ui.*) -->
    <IsybauModals @project-loaded="viewMode = '2d'" />

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
import { sampleTerrainAt } from '../utils/terrainSampling.js';
import { useEzgLayer } from '../composables/useEzgLayer.js';
import Sidebar from '../components/panels/Sidebar.vue';
import SimulationControls from '../components/panels/SimulationControls.vue';
import IsybauEditor from '../components/editor/IsybauEditor.vue';
import IsybauViewer from '../components/visualizer/IsybauViewer.vue';
import IsybauViewer3D from '../components/visualizer/IsybauViewer3D.vue';


// Modals + deren Verdrahtung leben zentral in IsybauModals.vue (store.ui.*)
import IsybauModals from '../components/modals/IsybauModals.vue';
import MessageTicker from '../components/ui/MessageTicker.vue';
import TutorialMascot from '../tutorial/TutorialMascot.vue';
import '../styles/theme.css';

const store = useIsybauStore();
const viewMode = ref('2d');
const autoResultsFor3d = ref(false);
const ezgLayer = useEzgLayer();

// Terrarium-Höhenlinien (30m, aus der EZG-Karte) sind gegenstandslos, sobald
// ein eigenes, präziseres DGM hochgeladen wurde — useEzgLayer.js unterdrückt
// künftige Nachlade-/Neuberechnungs-Aufrufe bereits selbst (contoursSuppressed()),
// hier zusätzlich die BEREITS gezeichneten Linien einmalig wegwischen, sonst
// blieben sie bis zum nächsten Pan/Intervall-Wechsel sichtbar stehen.
watch(() => store.terrain, (terrain) => {
  if (terrain) ezgLayer.clearContours();
});

const hasResults = computed(() => !!store.simulation.results);

function goto3d(withResults = false) {
  autoResultsFor3d.value = withResults;
  viewMode.value = '3d';
}

// Neuer Schacht: Deckelhöhe aus geladenem DGM vorschlagen (überschreibbar,
// siehe demSuggested-Hinweis in ElementPropertiesModal.vue). Ohne geladenes
// DGM oder außerhalb dessen NODATA-Bereich bleibt der bisherige feste
// Default (2.0) im Modal unangetastet.
function handleCreateNode({ x, y }) {
  const data = { x, y };
  if (store.terrain) {
    const z = sampleTerrainAt(store.terrain, x, y);
    if (z !== null) {
      data.cover = Math.round(z * 100) / 100;
      data.demSuggested = true;
    }
  }
  store.openElementModal('node', data);
}

const handleSplitEdge = (payload) => {
    // payload can be exactly edgeId (fallback) or an object
    const edgeId = payload.edgeId || payload;
    const coords = payload.coords || null;

    store.splitEdgeWithNode(edgeId, coords);
    // Switch back to view mode to prevent accidental subsequent clics
    store.editor.mode = 'select';
};

// „Ergebnisse anzeigen" aus dem Viewer-Popup: Element fokussieren + Modal öffnen
const handleShowDetails = (element) => {
    store.flashFocus(element?.id || element);
    store.ui.showResultsModal = true;
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

// Import-Sammelbericht: beim XML-Import übersprungene Elemente anzeigen
watch(() => store.ui.importWarnings, (msgs) => {
    if (msgs && msgs.length > 0) {
        warningToast.value = { show: true, messages: msgs };
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
    background: var(--isy-header-bg);
    padding: 0.25rem;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(4,6,71,0.35);
    display: flex;
    gap: 0.25rem;
}

.view-switcher button {
    padding: 0.55rem 0.9rem;
    border: none;
    background: transparent;
    cursor: pointer;
    border-radius: 5px;
    font-family: 'Press Start 2P', monospace;
    font-size: 0.46rem;
    color: var(--isy-border);
    transition: background 0.15s, color 0.15s;
}

.view-switcher button:hover {
    background: var(--isy-accent);
    color: #fff;
}

.view-switcher button.active {
    background: var(--isy-accent);
    color: #fff;
}

.view-switcher button.result3d-tab {
    border-color: #f39c12;
    color: #7d4e00;
}
.view-switcher button.result3d-tab.active {
    background: #f39c12;
    color: #fff;
    border-color: #f39c12;
}

.help-btn {
    margin-left: 0.25rem;
    background: var(--isy-header-alt) !important;
    border: 1px solid var(--isy-accent) !important;
    color: var(--isy-accent-hover) !important;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.35rem 0.5rem !important;
}

.help-btn:hover {
    background: var(--isy-accent) !important;
    color: #fff !important;
}

.tb-icon {
    width: 16px;
    height: 16px;
    image-rendering: pixelated;
    filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
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
    color: var(--isy-text-dim);
}

.sidebar-nav {
  margin-top: 1.5rem;
  border-top: 1px solid var(--isy-border);
  padding-top: 1rem;
}
.sidebar-nav h3 {
  margin: 0 0 0.75rem;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--isy-text);
}

/* Theme-konform (SaintV): weiß/violett statt Bootstrap-blau */
.nav-btn {
  display: block;
  width: 100%;
  padding: 0.8rem 0.75rem;
  margin-bottom: 0.5rem;
  background: var(--isy-btn-bg);
  border: 1px solid var(--isy-border);
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  font-family: 'Press Start 2P', monospace;
  font-size: 0.5rem;
  line-height: 1.6;
  color: var(--isy-text);
  transition: all 0.2s;
}

.nav-btn:hover {
  background: var(--isy-accent-soft);
  border-color: var(--isy-accent-hover);
}

.nav-btn.active {
  background: var(--isy-accent);
  border-color: var(--isy-accent);
  color: #fff;
  font-weight: 600;
}
.nav-btn.active .tb-icon {
  filter: brightness(0) invert(1);
}

.nav-btn-result3d {
  border-color: #f39c12;
  color: #7d4e00;
}
.nav-btn-result3d:hover {
  background: #fff8eb;
  border-color: #e67e22;
}
.nav-btn-result3d.active {
  background: #fff3cd;
  border-color: #f39c12;
  color: #7d4e00;
}

/* Warning Toast */
.warning-toast {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 400px;
    background: var(--isy-toast-bg);
    border-left: 5px solid #f39c12; /* Warning Orange */
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    border-radius: 4px;
    padding: 1rem;
    z-index: 2000;
    font-size: 0.9rem;
    color: var(--isy-toast-text);
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

