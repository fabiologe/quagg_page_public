<template>
  <div class="flood-main-container">
    
    <!-- LEFT TOOLBAR -->
    <aside class="left-sidebar">
       <!-- EditorToolbar uses simStore internally for activeTool -->
       <EditorToolbar 
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
       <!-- MapEditor3D uses geoStore and simStore internally -->
       <MapEditor3D 
         ref="editorRef"
       />

       <!-- RIGHT PANEL CONTAINER -->
       <!-- Logic: Show Panel if not Simulating (or always? configurable) -->
       <div class="right-panel-container">
         
         <!-- TOGGLE BUTTON -->
         <button class="panel-toggle" @click="panelOpen = !panelOpen" :title="panelOpen ? 'Close Panel' : 'Open Panel'">
            {{ panelOpen ? '→' : '←' }}
         </button>

         <!-- PANEL -->
         <aside class="right-panel" :class="{ closed: !panelOpen }">
            <!-- ScenarioManager uses geoStore, hydraulicStore, simStore -->
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
import { ref, onMounted, onErrorCaptured } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore';

// Components
import EditorToolbar from '../components/editor/EditorToolbar.vue';
import MapEditor3D from '../components/editor/MapEditor3D.vue';
import DataImportModal from '../components/importer/DataImportModal.vue';
import ScenarioManager from '../components/panel/ScenarioManager.vue';

// Initialize Stores (Pinia best practice: call them in setup)
const geoStore = useGeoStore();
const hydStore = useHydraulicStore();
const simStore = useSimulationStore();

const errorMsg = ref(null);
const editorRef = ref(null);
const showImportModal = ref(false);
const panelOpen = ref(true);

onMounted(() => {
    console.log('Flood2DMain mounted successfully');
    // Ensure stores are ready or reset if needed
    simStore.setStatus('IDLE');
});

// Error Boundary for Children
onErrorCaptured((err, instance, info) => {
    console.error("Flood2DMain Error Captured:", err);
    errorMsg.value = `Error: ${err.message}`;
    return false; // Prevent propogation to global handler if we want to handle it here
});

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
    background: white; /* Ensure visible background */
}

.main-content {
    flex: 1;
    position: relative;
    display: flex; /* To contain Editor + Right Panel */
}

.right-panel-container {
    position: relative;
    display: flex;
    z-index: 15;
    height: 100%;
}

.right-panel {
    width: 300px;
    border-left: 1px solid #2d3436;
    background: #233140;
    transition: width 0.3s ease, opacity 0.3s ease;
    overflow: hidden;
    height: 100%;
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
    position: absolute;
    top: 0; left: 0; right: 0;
    z-index: 1000;
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
