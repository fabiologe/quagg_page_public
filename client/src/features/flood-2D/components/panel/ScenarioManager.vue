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
        Nodes ({{ geoStore.nodes.length }})
      </button>
      <button 
        :class="{ active: activeTab === 'BUILDINGS' }" 
        @click="activeTab = 'BUILDINGS'"
        title="Gebäude"
      >
        Buildings ({{ geoStore.buildings.features.length }})
      </button>
      <button 
        :class="{ active: activeTab === 'BOUNDARIES' }" 
        @click="activeTab = 'BOUNDARIES'"
        title="Grenzen"
      >
        Bounds ({{ geoStore.boundaries.features.length }})
      </button>
      <button 
        :class="{ active: activeTab === 'PROFILES' }" 
        @click="activeTab = 'PROFILES'"
        title="Hydraulische Profile"
      >
        Profiles ({{ profilesList.length }})
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
        :items="geoStore.nodes"
        type="NODE"
        @zoom-to="handleZoom"
      />

      <ObjectTable 
        v-if="activeTab === 'BUILDINGS'"
        :items="geoStore.buildings.features"
        type="BUILDING"
        @zoom-to="handleZoom"
      />

      <ObjectTable 
        v-if="activeTab === 'BOUNDARIES'"
        :items="geoStore.boundaries.features"
        type="BOUNDARY"
        @zoom-to="handleZoom"
      />

      <!-- REUSE ObjectTable FOR PROFILES if compatible or Custom List -->
      <!-- ObjectTable likely assumes spatial items with zoom. Profiles are data. -->
      <!-- Simple List for Profiles -->
      <div v-if="activeTab === 'PROFILES'" class="profiles-list">
          <div v-for="profile in profilesList" :key="profile.id" class="profile-item" @click="console.log('Select Profile', profile.id)">
              <div class="p-name">{{ profile.name }}</div>
              <div class="p-meta">{{ profile.type }} | {{ profile.data.length }} pts</div>
          </div>
          <div v-if="profilesList.length === 0" class="empty-msg">Keine Profile definiert.</div>
          <button class="btn-small action-btn" @click="hydStore.createProfile('New Profile', 'inflow')">+ Profil Erstellen</button>
      </div>

      <RainConfig v-if="activeTab === 'RAIN'" />

    </div>

    <!-- CONFIGURATION PANEL (Bottom) -->
    <div class="panel-config">
        <BoundaryConfig :selectedItem="selectedItem" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
import ObjectTable from './ObjectTable.vue';
import BoundaryConfig from './BoundaryConfig.vue';
import RainConfig from './RainConfig.vue';

const geoStore = useGeoStore();
const simStore = useSimulationStore();
const hydStore = useHydraulicStore();

const activeTab = ref('NODES'); // NODES | BUILDINGS | BOUNDARIES | PROFILES | RAIN

const totalItems = computed(() => {
    return geoStore.nodes.length + geoStore.buildings.features.length + geoStore.boundaries.features.length;
});

// Helper for selected item
const selectedItem = computed(() => {
    if (!simStore.selection) return null;
    return geoStore.getFeatureById(simStore.selection);
});

const profilesList = computed(() => {
    return Object.values(hydStore.profiles);
});

const handleZoom = (item) => {
    // Standard Zoom Logic placeholder
    console.log("Zoom to:", item);
};

// Handle Selection from Lists
// If ObjectTable emits select? It currently seems to just display.
// Assuming selection handling is done via global store or click?
// If ObjectTable has selection logic, we should use simStore.setSelection


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

/* Profiles List Styles */
.profiles-list {
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
}
.profile-item {
    background: #34495e;
    margin-bottom: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
}
.profile-item:hover { background: #46627f; }
.p-name { font-weight: bold; color: #ecf0f1; font-size: 0.9rem; }
.p-meta { font-size: 0.75rem; color: #95a5a6; }
.empty-msg { color: #7f8c8d; text-align: center; margin-top: 1rem; font-style: italic; }
.action-btn { width: 100%; margin-top: 1rem; padding: 0.5rem; background: #3498db; border: none; color: white; border-radius: 4px; cursor: pointer; }
.action-btn:hover { background: #2980b9; }
</style>
