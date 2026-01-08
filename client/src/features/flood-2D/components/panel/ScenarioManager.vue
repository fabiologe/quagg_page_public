<template>
  <div class="scenario-manager">
    
    <!-- HEADER -->
    <div class="panel-header">
      <h3>Scenario Manager</h3>
      <div class="stats">
        {{ totalItems }} Objects
      </div>
    </div>

    <!-- TABS -->
    <div class="tabs">
      <button 
        :class="{ active: activeTab === 'NODES' }" 
        @click="activeTab = 'NODES'"
        title="Schächte & Knoten"
      >
        Nodes ({{ store.nodes.length }})
      </button>
      <button 
        :class="{ active: activeTab === 'BUILDINGS' }" 
        @click="activeTab = 'BUILDINGS'"
        title="Gebäude"
      >
        Buildings ({{ store.buildings.length }})
      </button>
      <button 
        :class="{ active: activeTab === 'BOUNDARIES' }" 
        @click="activeTab = 'BOUNDARIES'"
        title="Grenzen"
      >
        Bounds ({{ store.boundaries.length }})
      </button>
      <button 
        :class="{ active: activeTab === 'RAIN' }" 
        @click="activeTab = 'RAIN'"
        title="Niederschlag"
      >
        🌧️ Regen
      </button>
    </div>

    <!-- CONTENT -->
    <div class="panel-content">
      
      <ObjectTable 
        v-if="activeTab === 'NODES'"
        :items="store.nodes"
        type="NODE"
        @zoom-to="handleZoom"
      />

      <ObjectTable 
        v-if="activeTab === 'BUILDINGS'"
        :items="store.buildings"
        type="BUILDING"
        @zoom-to="handleZoom"
      />

      <ObjectTable 
        v-if="activeTab === 'BOUNDARIES'"
        :items="store.boundaries"
        type="BOUNDARY"
        @zoom-to="handleZoom"
      />

      <RainConfig v-if="activeTab === 'RAIN'" />

    </div>

    <!-- CONFIGURATION PANEL (Bottom) -->
    <div class="panel-config">
        <BoundaryConfig :selectedItem="store.selectedFeature" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useScenarioStore } from '@/stores/scenarioStore';
import ObjectTable from './ObjectTable.vue';
import BoundaryConfig from './BoundaryConfig.vue';
import RainConfig from './RainConfig.vue';

const store = useScenarioStore();
const activeTab = ref('NODES'); // NODES | BUILDINGS | BOUNDARIES

const totalItems = computed(() => {
    return store.nodes.length + store.buildings.length + store.boundaries.length;
});

const handleZoom = (item) => {
    // Emit Global Event or Call Store Action
    // ideally, we update camera. 
    // We can use a Bus or Store property 'cameraTarget' that MapEditor watches.
    // For now, let's log. Implementation of Zoom logic is a separate task or needs Store support.
    console.log("Zoom to:", item);
    // TODO: Implement camera zoom trigger
};

</script>

<style scoped>
.scenario-manager {
    display: flex; flex-direction: column;
    height: 100%;
    background: #233140;
    border-left: 1px solid #1a252f;
    width: 100%; /* Will be constrained by parent container */
    overflow: hidden;
}

.panel-header {
    padding: 1rem;
    background: #2c3e50;
    border-bottom: 1px solid #34495e;
    display: flex; justify-content: space-between; align-items: center;
}
.panel-header h3 { margin: 0; font-size: 1rem; color: #ecf0f1; text-transform: uppercase; letter-spacing: 1px; }
.stats { font-size: 0.8rem; color: #95a5a6; }

/* TABS */
.tabs {
    display: flex;
    background: #2c3e50;
    border-bottom: 1px solid #34495e;
}
.tabs button {
    flex: 1;
    padding: 0.8rem 0.5rem;
    background: transparent;
    border: none;
    color: #bdc3c7;
    font-size: 0.8rem;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tabs button:hover { background: #34495e; color: #fff; }
.tabs button.active {
    color: #3498db;
    border-bottom-color: #3498db;
    background: #233140;
}

.panel-content {
    flex: 1;
    overflow: hidden; /* Scroll handled by ObjectTable */
    background: #233140;
}


.panel-config {
    flex: 0 0 40%; /* 40% height for config */
    border-top: 1px solid #34495e;
    overflow-y: auto;
    background: #1a252f;
}
</style>
