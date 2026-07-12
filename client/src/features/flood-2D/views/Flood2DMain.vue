<template>
  <div class="flood-main-container">
    
    <!-- LEFT TOOLBAR -->
    <aside class="left-sidebar">
       <!-- EditorToolbar uses simStore internally for activeTool -->
       <EditorToolbar
         :currentAppMode="appMode"
         @open-import="showImportModal = true"
         @open-bathymetry="showBathymetryModal = true"
         @set-mode="handleSetMode"
         @set-view="handleSetView"
       />
    </aside>

    <!-- MAIN CONTENT -->
    <main class="main-content">
       
       <!-- ERROR BANNER -->
       <div v-if="errorMsg" class="error-banner">
         {{ errorMsg }}
         <button @click="errorMsg = null">x</button>
       </div>

       <!-- UNIFIED EDITOR (2D & 3D) -->
       <!-- MapEditor3D uses geoStore and simStore internally -->
       <MapEditor3D 
         ref="editorRef"
       />

       <!-- RIGHT PANEL CONTAINER (Flex Row) -->
       <div class="right-panel-container">
         
         <!-- RESIZE & TOGGLE AREA -->
         <div class="resize-controls" :class="{ 'panel-closed': !panelOpen }">
             
             <!-- Toggle Button attached to handle -->
             <button 
                class="panel-toggle" 
                @click="panelOpen = !panelOpen" 
                :title="panelOpen ? 'Close Panel' : 'Open Panel'"
             >
                {{ panelOpen ? '→' : '←' }}
             </button>

             <!-- Drag Handle -->
             <div 
                class="resize-bar" 
                @mousedown.prevent="startResize"
                v-if="panelOpen"
             ></div>
         </div>

         <!-- PANEL CONTENT -->
         <aside
            class="right-panel"
            :class="{ closed: !panelOpen, resizing: isResizing }"
            :style="{ width: panelOpen ? panelWidth + 'px' : '0px' }"
         >
             <ScenarioManager />
         </aside>

       </div>

       <!-- MODALS -->
       <DataImportModal
         v-if="showImportModal"
         @close="showImportModal = false"
       />
       <BathymetryModal
         v-if="showBathymetryModal"
         @close="showBathymetryModal = false"
       />

    </main>

  </div>
</template>

<script setup>
import { ref, onMounted, onErrorCaptured, watch, nextTick } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore';

// Components
import EditorToolbar from '../components/editor/EditorToolbar.vue';
import MapEditor3D from '../components/editor/MapEditor3D.vue';
import DataImportModal from '../components/importer/DataImportModal.vue';
import BathymetryModal from '../components/importer/BathymetryModal.vue';
import ScenarioManager from '../components/panel/ScenarioManager.vue';

// Initialize Stores (Pinia best practice: call them in setup)
const geoStore = useGeoStore();
const hydStore = useHydraulicStore();
const simStore = useSimulationStore();

const errorMsg = ref(null);
const editorRef = ref(null);
const showImportModal = ref(false);
const showBathymetryModal = ref(false);
const panelOpen = ref(true);
const appMode = ref('SETUP'); // SETUP (2D) | IMPORT_TERRAIN (3D)

const handleSetMode = (mode) => {
    appMode.value = mode;
    // Switch default view based on mode
    if (mode === 'SETUP') {
        handleSetView('XY'); // 2D Top
    } else if (mode === 'IMPORT_TERRAIN') {
        handleSetView('XZ'); // 3D Front (or whatever default)
    }
};

const handleSetView = (axis) => {
    if (editorRef.value && editorRef.value.setCameraView) {
        editorRef.value.setCameraView(axis);
    }
    // Update Mode based on view if needed?
    if (axis === 'XY') appMode.value = 'SETUP'; // Force 2D mode state if strictly 2D
    else appMode.value = 'IMPORT_TERRAIN';
};

// RESIZE LOGIC
const panelWidth = ref(400); // Default width
const isResizing = ref(false);

const triggerResize = () => {
    // Wait for DOM update/Transition
    setTimeout(() => {
        if (editorRef.value && editorRef.value.resize) {
            editorRef.value.resize();
        }
    }, 100); 
    nextTick(() => {
         if (editorRef.value && editorRef.value.resize) editorRef.value.resize();
    });
};

watch(panelOpen, triggerResize);
watch(panelWidth, () => {
    if (!isResizing.value) triggerResize();
});

const startResize = () => {
    isResizing.value = true;
    window.addEventListener('mousemove', doResize);
    window.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'ew-resize';
};

const doResize = (e) => {
    if (!isResizing.value) return;
    const newWidth = window.innerWidth - e.clientX;
    // Limits
    if (newWidth > 200 && newWidth < 1200) {
        panelWidth.value = newWidth;
        // Erst NACH dem DOM-Update messen: resize() liest clientWidth des
        // Containers — synchron aufgerufen wäre das noch die alte Breite
        // (Canvas hinkt einen Event hinterher → Spalt).
        nextTick(() => {
            if (editorRef.value && editorRef.value.resize) editorRef.value.resize();
        });
    }
};

const stopResize = () => {
    isResizing.value = false;
    window.removeEventListener('mousemove', doResize);
    window.removeEventListener('mouseup', stopResize);
    if (editorRef.value && editorRef.value.resize) editorRef.value.resize(); // Final snap
    document.body.style.cursor = '';
};

onMounted(() => {
    console.log('Flood2DMain mounted successfully');
    simStore.setStatus('IDLE');
});

onErrorCaptured((err, instance, info) => {
    console.error("Flood2DMain Error: ", err);
    errorMsg.value = `Error: ${err.message}`;
    return false;
});

</script>

<style scoped>
.flood-main-container {
    display: flex;
    width: 100vw; height: 100vh;
    overflow: hidden;
    background: var(--sv-bg);
}

.left-sidebar {
    /* auto = exakt so breit wie die Toolbar (kein Gap bei Breitenänderungen) */
    flex: 0 0 auto;
    z-index: 20;
    background: var(--sv-bg-2);
}

.main-content {
    flex: 1;
    position: relative;
    display: flex;
    overflow: hidden; /* Ensure map doesn't overflow */
    /* Dunkler Grund: beim Panel-Resize hinkt der Canvas einen Frame hinterher —
       die kurz sichtbare Lücke muss Theme-dunkel sein, nicht weiß. */
    background: var(--sv-bg);
}

/* Map takes available space */
.main-content > :first-child { 
    /* Assuming MapEditor3D is first child */
    flex: 1; 
    min-width: 0; /* Crucial for flex item shrinking */
}

.right-panel-container {
    display: flex;
    flex-direction: row;
    height: 100%;
    z-index: 15;
    background: transparent; /* Let map show through if needed */
}

/* CONTROLS (Handle + Button) */
.resize-controls {
    display: flex;
    flex-direction: row;
    align-items: center;
    position: relative;
    z-index: 20;
}

.resize-bar {
    width: 8px;
    height: 100%;
    cursor: ew-resize;
    background: var(--sv-bg-2);
    transition: background 0.2s;
    border-left: 1px solid var(--sv-border);
}
.resize-bar:hover, .resize-bar:active {
    background: var(--sv-violet-dim);
    box-shadow: var(--sv-glow-violet);
}

.panel-toggle {
    width: 24px;
    height: 48px;
    background: var(--sv-surface);
    border: 1px solid var(--sv-border);
    border-right: none;
    border-radius: 4px 0 0 4px;
    color: var(--sv-text-dim);
    font-family: var(--sv-font);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem;
    margin-right: -1px; /* Align tight to bar */
    box-shadow: -2px 0 5px rgba(0,0,0,0.2);
}
.panel-toggle:hover {
    background: rgba(139, 92, 246, 0.22);
    color: var(--sv-lime);
    box-shadow: var(--sv-glow-violet);
}

/* PANEL */
.right-panel {
    background: #16161f; /* = ScenarioManager-Grund, kein Blitzer beim Strecken */
    box-shadow: -5px 0 15px rgba(0,0,0,0.3);
    height: 100%;
    overflow: hidden;
    transition: width 0.15s ease; /* nur fürs Auf-/Zuklappen */
    display: flex; flex-direction: column;
}
/* Beim Drag-Resize keine Transition: die Breite muss der Maus 1:1 folgen,
   sonst blitzt zwischen Panel und Canvas ein Streifen auf. */
.right-panel.resizing {
    transition: none;
}

.right-panel.closed {
    border-left: none;
}

.error-banner {
    position: absolute;
    top: 0; left: 0; right: 0;
    z-index: 1000;
    background: #fee2e2;
    color: #b91c1c;
    padding: 0.5rem;
    text-align: center;
}
</style>
