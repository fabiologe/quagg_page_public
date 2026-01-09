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

      <!-- PROFILE MANAGER -->
      <div v-if="activeTab === 'PROFILES'" class="profiles-manager">
          
          <!-- LEFT: List -->
          <div class="profiles-list-col">
              <div v-for="profile in profilesList" 
                   :key="profile.id" 
                   class="profile-item" 
                   :class="{ active: activeProfile && activeProfile.id === profile.id }"
                   @click="hydStore.setActiveProfile(profile.id)"
              >
                  <div class="p-name">{{ profile.name }}</div>
                  <div class="p-meta">{{ profile.type }} | {{ profile.data.length }} pts</div>
                  <button class="btn-del" @click.stop="hydStore.deleteProfile(profile.id)">×</button>
              </div>
              
              <div v-if="profilesList.length === 0" class="empty-msg">No profiles.</div>
              <button class="btn-add" @click="hydStore.createProfile('New Profile', 'inflow')">+ Add Profile</button>
          </div>

          <!-- RIGHT: Editor -->
          <div class="profile-editor-col" v-if="activeProfile">
              <div class="editor-header">
                  <input v-model="activeProfile.name" class="name-input" />
                  <select v-model="activeProfile.type" class="type-select">
                      <option value="inflow">Inflow (Q)</option>
                      <option value="outflow">Outflow (H/Q)</option>
                      <option value="waterlevel">Water Level (H)</option>
                  </select>
              </div>

              <!-- Pattern Generator -->
              <PatternGenerator @generate="applyPattern" />

              <!-- Visual Editor -->
              <TimeSeriesEditor 
                v-model="activeProfile.data" 
                :duration="7200"
                @update:modelValue="(val) => hydStore.updateProfileData(activeProfile.id, val)"
              />
          </div>
          <div v-else class="empty-editor">
              Select a profile to edit.
          </div>

      </div>

      <RainConfig v-if="activeTab === 'RAIN'" />

    </div>

    <!-- CONFIGURATION PANEL (Bottom) -->
    <!-- Only show property config if NOT in Profiles/Rain tab, OR if selection matches -->
    <div class="panel-config" v-if="activeTab !== 'PROFILES' && activeTab !== 'RAIN'">
        <BoundaryConfig :selectedItem="selectedItem" />
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
// Components
import ObjectTable from './ObjectTable.vue';
import BoundaryConfig from './BoundaryConfig.vue';
import RainConfig from './RainConfig.vue';
import TimeSeriesEditor from './TimeSeriesEditor.vue';
import PatternGenerator from '../hydraulics/PatternGenerator.vue';

const geoStore = useGeoStore();
const simStore = useSimulationStore();
const hydStore = useHydraulicStore();

const activeTab = ref('NODES'); // NODES | BUILDINGS | BOUNDARIES | PROFILES | RAIN

const totalItems = computed(() => {
    return (geoStore.nodes ? geoStore.nodes.length : 0) + 
           (geoStore.buildings.features ? geoStore.buildings.features.length : 0) + 
           (geoStore.boundaries.features ? geoStore.boundaries.features.length : 0);
});

// Helper for selected item (Sim Store Selection -> Geo Feature)
const selectedItem = computed(() => {
    if (!simStore.selection) return null;
    return geoStore.getFeatureById(simStore.selection);
});

const profilesList = computed(() => {
    return hydStore.profiles ? Object.values(hydStore.profiles) : [];
});

const activeProfile = computed(() => {
    if (!hydStore.activeProfileId) return null;
    return hydStore.profiles[hydStore.activeProfileId];
});

const applyPattern = (points) => {
    if(activeProfile.value) {
        hydStore.updateProfileData(activeProfile.value.id, points);
    }
};

const handleZoom = (item) => {
    console.log("Zoom to:", item);
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
    display: flex; flex-direction: column;
}

/* PROFILES MANAGER LAYOUT */
.profiles-manager {
    display: flex;
    height: 100%;
}

.profiles-list-col {
    width: 200px;
    background: #1a252f;
    border-right: 1px solid #34495e;
    overflow-y: auto;
    display: flex; flex-direction: column;
}

.profile-item {
    padding: 10px;
    border-bottom: 1px solid #2c3e50;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
}
.profile-item:hover { background: #2c3e50; }
.profile-item.active { background: #34495e; border-left: 3px solid #3498db; }

.p-name { color: #ecf0f1; font-weight: bold; font-size: 0.9rem; }
.p-meta { color: #7f8c8d; font-size: 0.75rem; }

.btn-del {
    position: absolute; right: 5px; top: 5px;
    background: none; border: none; color: #e74c3c;
    font-size: 1.2rem; cursor: pointer; opacity: 0;
}
.profile-item:hover .btn-del { opacity: 1; }

.btn-add {
    margin: 10px;
    padding: 8px;
    background: #27ae60;
    color: white; border: none; border-radius: 4px;
    cursor: pointer;
}

.profile-editor-col {
    flex: 1;
    padding: 10px;
    overflow-y: auto;
    display: flex; flex-direction: column;
    gap: 10px;
}

.editor-header {
    display: flex; gap: 10px;
    margin-bottom: 5px;
}
.name-input { flex: 1; background: #2c3e50; border: 1px solid #34495e; color: white; padding: 6px; border-radius: 4px; }
.type-select { background: #2c3e50; border: 1px solid #34495e; color: white; padding: 6px; border-radius: 4px; }

.empty-msg, .empty-editor {
    padding: 2rem; text-align: center; color: #7f8c8d; font-style: italic;
}

.panel-config {
    flex: 0 0 40%; /* 40% height for config */
    border-top: 1px solid #34495e;
    overflow-y: auto;
    background: #1a252f;
}

</style>
