<template>
  <div class="flood-main-container">
    
    <!-- LEFT TOOLBAR -->
    <aside class="left-sidebar">
       <EditorToolbar 
         :activeTool="activeTool"
         :currentAppMode="store.editorMode"
         @set-tool="setActiveTool"
         @set-mode="setAppMode"
         @set-view="handleViewChange"
         @open-import="showImportModal = true"
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
       <!-- Logic: MapEditor3D now handles both modes via props or internal state -->
       <!-- UNIFIED EDITOR (2D & 3D) -->
       <!-- Logic: MapEditor3D now handles both modes via props or internal state -->
       <MapEditor3D 
         ref="editorRef"
         :activeTool="activeTool"
         @confirm="onTerrainLoaded"
       />

       <!-- RIGHT PANEL CONTAINER -->
       <div class="right-panel-container" v-if="store.editorMode === 'SETUP' || store.editorMode === 'SIMULATION' || store.editorMode === 'IMPORT_TERRAIN'">
         
         <!-- TOGGLE BUTTON -->
         <button class="panel-toggle" @click="panelOpen = !panelOpen" :title="panelOpen ? 'Close Panel' : 'Open Panel'">
            {{ panelOpen ? '→' : '←' }}
         </button>

         <!-- PANEL -->
         <aside class="right-panel" :class="{ closed: !panelOpen }">
            <ScenarioManager />
         </aside>

       </div>

       <!-- MODAL -->
       <DataImportModal 
         v-if="showImportModal"
         @close="showImportModal = false"
       />

    </main>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useScenarioStore } from '@/stores/scenarioStore';
import EditorToolbar from '../components/editor/EditorToolbar.vue';
import MapEditor3D from '../components/editor/MapEditor3D.vue';
import DataImportModal from '../components/importer/DataImportModal.vue';
import ScenarioManager from '../components/panel/ScenarioManager.vue';

const store = useScenarioStore();
const activeTool = ref('SELECT'); // Shared tool state
const errorMsg = ref(null);
const editorRef = ref(null);
const showImportModal = ref(false);
const panelOpen = ref(true);

// -- ACTIONS --

const setActiveTool = (toolName) => {
    activeTool.value = toolName;
};

const setAppMode = (mode) => {
    store.editorMode = mode;
    // MapEditor3D watches store.editorMode usually, or we trigger it?
    // MapEditor3D is reactive to store. So just updating store is enough.
    // But we might want to reset tool.
    if (mode === 'IMPORT_TERRAIN') {
        activeTool.value = 'PAN'; // Default to Pan in 3D
    } else if (mode === 'SELECT') {
        activeTool.value = 'SELECT';
    } else if (mode.startsWith('DRAW')) {
        activeTool.value = 'DRAW';
    } else {
        activeTool.value = 'SELECT';
    }
    
    // Trigger Camera Update in Child if needed (or Child watches store)
    // Actually EditorToolbar emits 'set-view' separately.
    if(mode === 'SETUP') handleViewChange('XY'); // Force Top-Down
    if(mode === 'IMPORT_TERRAIN') handleViewChange('XZ'); // Force 3D
};

const handleViewChange = (axis) => {
    // Pass to MapEditor3D via ref
    if (editorRef.value && editorRef.value.setCameraView) {
        editorRef.value.setCameraView(axis);
    }
};

const onTerrainLoaded = () => {
    // Called when user accepts terrain in Import Mode
    store.editorMode = 'SETUP';
    // Maybe save something?
};

</script>

<style scoped>
.flood-main-container {
    display: flex; /* Sidebar | Content */
    width: 100vw; height: 100vh;
    overflow: hidden;
    background: #1e272e;
}

.left-sidebar {
    flex: 0 0 60px; /* Toolbar width */
    z-index: 20;
    border-right: 1px solid #2d3436;
}

.main-content {
    flex: 1;
    position: relative;
    display: flex; /* To contain Editor + Right Panel */
}

/* Make Editor fill remaining space */
.main-content > :first-child { 
    /* This targets MapEditor3D if it's the first child (except for error banner) 
       Alternatively, style MapEditor3D to be flex:1 width:100% height:100% 
    */
}
/* Ideally MapEditor3D component root should scale */

.right-panel-container {
    position: relative;
    display: flex;
    z-index: 15;
}

.right-panel {
    width: 300px;
    border-left: 1px solid #2d3436;
    background: #233140;
    transition: width 0.3s ease, opacity 0.3s ease;
    overflow: hidden;
}

.right-panel.closed {
    width: 0;
    opacity: 0;
    border-left: none;
}

.panel-toggle {
    position: absolute;
    left: -24px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 48px;
    background: #233140;
    border: 1px solid #2d3436;
    border-right: none;
    border-radius: 4px 0 0 4px;
    color: #bdc3c7;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem;
    z-index: 20;
}
.panel-toggle:hover {
    background: #34495e;
    color: #fff;
}

.error-banner {
    background: #fee2e2;
    color: #b91c1c;
    padding: 0.5rem;
    text-align: center;
    border-bottom: 1px solid #fecaca;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
</style>
