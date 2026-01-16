<template>
  <div class="isyifc-main">
    <Sidebar :width="300">
        <!-- Sidebar content (file upload etc) -->
    </Sidebar>
    
    <div class="content-area">
        <!-- Toolbar -->
        <div class="view-switcher">
            <span class="title-badge">ISYIFC 3D Viewer</span>
            <button class="help-btn" @click="showHelpModal = true" title="Hilfe & Anleitung">ℹ️</button>
        </div>

        <!-- 3D View (Always Active) -->
        <div class="view-container">
            <IsyIfcViewer3D 
                :nodes="store.nodes" 
                :edges="store.edges" 
                :areas="store.areaArray"
            />
        </div>
    </div>

    <!-- Global Modals -->
    <IsyIfcHelpModal
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
    
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useIsyIfcStore } from '../store/index.js';
import Sidebar from '../components/panels/Sidebar.vue';
import IsyIfcViewer3D from '../components/visualizer/IsyIfcViewer3D.vue';

// Import Modals
import ElementPropertiesModal from '../components/modals/ElementPropertiesModal.vue';
import IsyIfcHelpModal from '../components/modals/IsyIfcHelpModal.vue';

const store = useIsyIfcStore();

// Element Modal State
const showElementModal = ref(false);
const elementModalMode = ref('area');
const elementModalData = ref({});
const elementModalIsEdit = ref(false);

const showHelpModal = ref(false);

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
</script>

<style scoped>
.isyifc-main {
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
    padding: 0.5rem 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.title-badge {
    font-weight: 600;
    color: #2c3e50;
    font-size: 0.95rem;
}

.help-btn {
    background: #e1f5fe;
    border: 1px solid #b3e5fc;
    color: #0277bd;
    border-radius: 4px;
    width: 28px; 
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.9rem;
}

.help-btn:hover {
    background: #b3e5fc;
}

.view-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
</style>
