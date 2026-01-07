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
       <MapEditor3D 
         ref="editorRef"
         :activeTool="activeTool"
         @confirm="onTerrainLoaded"
       />

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

const store = useScenarioStore();
const activeTool = ref('SELECT'); // Shared tool state
const errorMsg = ref(null);
const editorRef = ref(null);
const showImportModal = ref(false);

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
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: #f0f2f5;
}

.left-sidebar {
    flex: 0 0 auto;
    z-index: 20;
}

.main-content {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
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
