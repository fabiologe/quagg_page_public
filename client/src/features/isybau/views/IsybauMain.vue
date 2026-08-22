<template>
  <div class="isybau-main" :data-theme="store.ui.darkMode ? 'dark' : 'light'">
    <Sidebar :width="300" @open-project-manager="store.ui.showProjectManager = true">
        <!-- Pass Props to SimulationControls if needed, or rely on Store -->
        <SimulationControls />
        
        <div class="sidebar-nav" data-tutorial="ansicht-nav">
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
                :origin-anchor="store.metadata.originAnchor"
                @show-details="handleShowDetails"
            />
        </div>
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
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useIsybauStore } from '../store/index.js';
import { sampleTerrainAt } from '../utils/terrainSampling.js';
import Sidebar from '../components/panels/Sidebar.vue';
import SimulationControls from '../components/panels/SimulationControls.vue';
import IsybauEditor from '../components/editor/IsybauEditor.vue';
import IsybauViewer from '../components/visualizer/IsybauViewer.vue';
import IsybauViewer3D from '../components/visualizer/IsybauViewer3D.vue';


// Modals + deren Verdrahtung leben zentral in IsybauModals.vue (store.ui.*)
import IsybauModals from '../components/modals/IsybauModals.vue';
import TutorialMascot from '../tutorial/TutorialMascot.vue';
import '../styles/theme.css';

const store = useIsybauStore();
const viewMode = ref('2d');
const autoResultsFor3d = ref(false);

// --isy-pixel-*-Tokens (theme.css) liegen auf :root statt .isybau-main, da
// Teleport-Modals aus dem .isybau-main-Teilbaum herausspringen — deshalb hier
// zusätzlich data-theme auf <html> spiegeln, damit :root[data-theme] überall
// greift (nicht nur innerhalb von .isybau-main).
watch(
  () => store.ui.darkMode,
  (dark) => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; },
  { immediate: true }
);
onBeforeUnmount(() => { delete document.documentElement.dataset.theme; });

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

// „Ergebnisse anzeigen" aus dem Viewer-Popup: nur das Modal öffnen.
// Bewusst OHNE Kamerasprung — das Element ist ja bereits angeklickt und damit
// sichtbar, und das Modal legt sich ohnehin darüber. Vorher wurde hier
// flashFocus() aufgerufen; die Karte stand nach dem Schließen des Modals
// unbemerkt woanders.
const handleShowDetails = () => {
    store.ui.showResultsModal = true;
};

// --- Validation Warnings Toast ---
const warningToast = ref({ show: false, messages: [] });
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
    z-index: var(--isy-z-panel);
    background: var(--isy-bg-alt);
    padding: var(--isy-space-1);
    border-radius: var(--isy-radius-lg);
    box-shadow: var(--isy-elev-3);
    display: flex;
    gap: 0.25rem;
}

.view-switcher button {
    padding: var(--isy-space-2) var(--isy-space-4);
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    border-radius: var(--isy-radius-sm);
    clip-path: var(--isy-pixel-clip-corner);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-sm);
    color: var(--isy-border);
    transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.1s, border-color 0.15s;
}

.view-switcher button:hover {
    background: var(--isy-accent);
    color: var(--isy-pixel-green-bright);
    border-width: 2px;
    border-color: var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light);
    box-shadow: var(--isy-btn-shadow-hover);
    transform: translateY(-1px);
}

.view-switcher button.active {
    background: var(--isy-accent);
    color: var(--isy-pixel-green-bright);
    border-width: 2px;
    border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark);
    box-shadow: var(--isy-btn-shadow-active);
}
.view-switcher button.active:active,
.view-switcher button:active {
    transform: translateY(0);
    border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark);
    box-shadow: var(--isy-btn-shadow-active);
}

.view-switcher button.result3d-tab {
    border-color: var(--isy-pixel-warning);
    color: var(--isy-pixel-warning-soft-text);
}
.view-switcher button.result3d-tab.active {
    background: var(--isy-pixel-warning);
    color: var(--isy-pixel-text);
    border-color: var(--isy-pixel-warning);
}

.help-btn {
    margin-left: var(--isy-space-1);
    background: var(--isy-bg-alt) !important;
    border-width: 2px !important;
    border-style: solid !important;
    border-color: var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) !important;
    color: var(--isy-accent-hover) !important;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--isy-space-1) var(--isy-space-2) !important;
    clip-path: var(--isy-pixel-clip-corner);
    box-shadow: var(--isy-btn-shadow);
    transition: background 0.15s, color 0.15s, box-shadow 0.15s, transform 0.1s;
}

.help-btn:hover {
    background: var(--isy-accent) !important;
    color: var(--isy-pixel-green-bright) !important;
    box-shadow: var(--isy-btn-shadow-hover);
    transform: translateY(-1px);
}
.help-btn:active {
    transform: translateY(0);
    border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark) !important;
    box-shadow: var(--isy-btn-shadow-active);
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
  margin-top: var(--isy-space-6);
  border-top: 1px solid var(--isy-border);
  padding-top: var(--isy-space-4);
}
.sidebar-nav h3 {
  margin: 0 0 var(--isy-space-3);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--isy-text);
}

/* Theme-konform (SaintV): weiß/violett statt Bootstrap-blau */
.nav-btn {
  display: block;
  width: 100%;
  padding: var(--isy-space-3) var(--isy-space-3);
  margin-bottom: var(--isy-space-2);
  background: var(--isy-btn-bg);
  border-width: 2px;
  border-style: solid;
  border-color: var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light);
  border-radius: var(--isy-radius-md);
  clip-path: var(--isy-pixel-clip-corner);
  text-align: left;
  cursor: pointer;
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  line-height: 1.6;
  color: var(--isy-text);
  box-shadow: var(--isy-btn-shadow);
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.1s;
}

.nav-btn:hover {
  background: var(--isy-accent-soft);
  box-shadow: var(--isy-btn-shadow-hover);
  transform: translateY(-1px);
}

.nav-btn:active {
  transform: translateY(0);
  border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark);
  box-shadow: var(--isy-btn-shadow-active);
}

.nav-btn.active {
  background: var(--isy-accent);
  border-color: var(--isy-pixel-bevel-dark) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-light) var(--isy-pixel-bevel-dark);
  color: var(--isy-pixel-green-bright);
  font-weight: 600;
  box-shadow: var(--isy-btn-shadow-hover);
}
.nav-btn.active .tb-icon {
  filter: invert(63%) sepia(97%) saturate(1000%) hue-rotate(88deg) brightness(103%) contrast(105%);
}

.nav-btn-result3d {
  border-color: var(--isy-pixel-warning);
  color: var(--isy-pixel-warning-soft-text);
}
.nav-btn-result3d:hover {
  background: var(--isy-pixel-warning-soft);
  border-color: var(--isy-pixel-warning-hover);
  box-shadow: var(--isy-btn-shadow), 0 0 9px rgba(243,156,18,0.5);
}
.nav-btn-result3d.active {
  background: var(--isy-pixel-warning-soft);
  border-color: var(--isy-pixel-warning);
  color: var(--isy-pixel-warning-soft-text);
  box-shadow: var(--isy-btn-shadow), 0 0 8px rgba(243,156,18,0.4);
}

/* Warning Toast */
.warning-toast {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 400px;
    background: var(--isy-toast-bg);
    border-left: 5px solid var(--isy-pixel-warning); /* Warning Orange */
    box-shadow: var(--isy-elev-3);
    border-radius: var(--isy-radius-sm);
    padding: var(--isy-space-4);
    z-index: calc(var(--isy-z-top) + 1);
    font-size: var(--isy-fs-lg);
    color: var(--isy-toast-text);
}

.toast-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--isy-space-2);
}

.warning-icon {
    font-size: var(--isy-fs-lg);
    margin-right: var(--isy-space-2);
}

.close-toast {
    background: none;
    border: none;
    font-size: var(--isy-fs-lg);
    cursor: pointer;
    color: #7f8c8d;
}

.toast-body ul {
    margin: 0;
    padding-left: var(--isy-space-5);
    max-height: 200px;
    overflow-y: auto;
}

.toast-body li {
    margin-bottom: var(--isy-space-1);
    color: var(--isy-pixel-danger-hover); /* Dark Red for errors/msgs */
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
    z-index: calc(var(--isy-z-top) + 2);
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

