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
        :class="{ active: activeTab === 'SURFACE' }" 
        @click="activeTab = 'SURFACE'"
        title="Oberflächen-Materialien"
      >
        <SvEmoji emoji="🎨" :size="14" /> Oberfläche
      </button>
      <button
        :class="{ active: activeTab === 'BUILDINGS' }"
        @click="activeTab = 'BUILDINGS'"
        title="Gebäude"
      >
        <SvEmoji emoji="🏢" :size="14" /> Buildings ({{ geoStore.buildings.features.length }})
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
        title="Hydraulische Ganglinien"
      >
        Ganglinien ({{ ganglinienList.length }})
      </button>
      <button
        :class="{ active: activeTab === 'NETWORK' }"
        @click="activeTab = 'NETWORK'"
        title="Kanalnetz (ISYBAU/IFC) — Schächte & Haltungen für die High-End-Kopplung"
      >
        <SvEmoji emoji="🕳️" :size="14" /> Netz ({{ netStore.nodes.length + netStore.links.length }})
      </button>
      <button 
        :class="{ active: activeTab === 'RAIN' }" 
        @click="activeTab = 'RAIN'"
        title="Niederschlag"
      >
        <SvEmoji emoji="🌧" :size="14" /> Regen
      </button>
      <button 
        :class="{ active: activeTab === 'SIMULATION' }" 
        @click="activeTab = 'SIMULATION'"
        title="Simulation & Debug"
      >
        <SvEmoji emoji="⚡" :size="14" /> Run
      </button>
    </div>

    <!-- CONTENT -->
    <div class="panel-content">

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
              <div v-for="gl in ganglinienList" 
                   :key="gl.id" 
                   class="profile-item" 
                   :class="{ active: activeGanglinie && activeGanglinie.id === gl.id }"
                   @click="hydStore.setActiveGanglinie(gl.id)"
              >
                  <div class="p-name">{{ gl.name }}</div>
                  <div class="p-meta">
                      {{ gl.type }} | {{ gl.data.length }} pts
                      <span class="p-usage" title="Genutzt von X Objekten">
                          Used: {{ hydStore.getAssignmentsByGanglinie(gl.id) }}
                      </span>
                  </div>
                  <button class="btn-del" @click.stop="hydStore.deleteGanglinie(gl.id)">×</button>
              </div>
              
              <div v-if="ganglinienList.length === 0" class="empty-msg">Keine Ganglinien.</div>
              <div class="list-actions">
                  <button class="btn-add" @click="hydStore.createGanglinie('Neue Ganglinie', 'Zufluss')">+ Ganglinie</button>
                  <button class="btn-config" @click="showAssignmentModal = true"><SvEmoji emoji="🛠" :size="14" /> Konfigurator</button>
              </div>
          </div>

          <!-- RIGHT: Editor -->
          <div class="profile-editor-col" v-if="activeGanglinie">
              <div class="editor-header">
                  <input v-model="activeGanglinie.name" class="name-input" />
                  <select v-model="activeGanglinie.type" class="type-select">
                      <option value="Zufluss">Zufluss (Q)</option>
                      <option value="Wasserstand">Wasserstand (H)</option>
                  </select>
                  <!-- NEW: Assign Button -->
                  <button 
                    v-if="currentSelectionIds.length > 0" 
                    @click="assignToSelection"
                    class="btn-assign"
                    :title="`Allen ${currentSelectionIds.length} ausgewählten Objekten zuweisen`"
                  >
                    <SvEmoji emoji="🔗" :size="14" /> Zuweisen ({{ currentSelectionIds.length }})
                  </button>
              </div>

              <!-- Pattern Generator -->
              <PatternGenerator @generate="applyPattern" />

              <!-- Visual Editor -->
              <GanglinienEditor 
                v-model="activeGanglinie.data" 
                :duration="7200"
                @update:modelValue="(val) => hydStore.updateGanglinieData(activeGanglinie.id, val)"
              />
          </div>
          <div v-else class="empty-editor">
              Wähle eine Ganglinie zur Bearbeitung.
          </div>

      </div>

      <RainConfig v-if="activeTab === 'RAIN'" />

      <!-- KANALNETZ (Unified Geometry Engine): Import + Tabelle + Detail-Editor -->
      <div v-if="activeTab === 'NETWORK'" class="network-tab">
        <NetworkImportButton />
        <NetworkTable />

        <!-- 3 Aktionen unter der Schacht/Haltung-Liste -->
        <div class="net-actions">
          <button class="na-btn" @click="showNetTable = true" title="Alle Daten in einer Tabelle bearbeiten (Mehrfachauswahl)">
            <SvEmoji emoji="📋" :size="13" /> Tabelle bearbeiten
          </button>
          <div class="na-create">
            <button class="na-btn" @click="netCreateOpen = !netCreateOpen" title="Neuen Schacht/Haltung erstellen">
              <SvEmoji emoji="➕" :size="13" /> Neu erstellen ▾
            </button>
            <div v-if="netCreateOpen" class="na-menu">
              <button @click="createNet('NET_NODE')"><SvEmoji emoji="🕳️" :size="13" /> Schacht setzen (3D)</button>
              <button @click="createNet('NET_CONDUIT')"><SvEmoji emoji="🧵" :size="13" /> Haltung ziehen (3D)</button>
              <button @click="mergeLegacy" title="Legacy Nodes + Culverts (geoStore) ins Netz übernehmen">
                <SvEmoji emoji="♻️" :size="13" /> Legacy übernehmen ({{ geoStore.nodes.length + geoStore.culvertLinks.length }})
              </button>
            </div>
          </div>
          <button class="na-btn" @click="showNetCheck = true" title="Diskrepanzen zwischen DGM-Raster und Netz prüfen">
            <SvEmoji emoji="⛰️" :size="13" /> Raster vs. Netz
          </button>
        </div>

        <NetworkPropertyPanel v-if="netStore.selectedId" />
      </div>

      <!-- SIMULATION RUNNER -->
      <Flood2DSolverRunner v-if="activeTab === 'SIMULATION'" />

      <!-- SURFACE MATERIALS -->
      <SurfaceConfig v-if="activeTab === 'SURFACE'" />

    </div>

    <!-- CONFIGURATION PANEL (Bottom) -->
    <!-- Only show property config if NOT in Profiles/Rain/Sim tab, OR if selection matches -->
    <div class="panel-config" v-if="activeTab !== 'PROFILES' && activeTab !== 'RAIN' && activeTab !== 'SIMULATION' && activeTab !== 'SURFACE' && activeTab !== 'CULVERTS' && activeTab !== 'NETWORK'">
        <!-- NEW: Multi-select support -->
        <div v-if="currentSelectionIds.length > 1" class="bulk-hint">
            <div class="bulk-icon"><SvEmoji emoji="🎯" :size="26" /></div>
            <div>
                <strong>{{ currentSelectionIds.length }} Objekte ausgewählt</strong><br>
                <small>Nutze den Konfigurator oder das Kontextmenü für Massenbearbeitung.</small>
            </div>
            <button class="btn-bulk-config" @click="showAssignmentModal = true"><SvEmoji emoji="🛠" :size="14" /> Konfigurieren</button>
        </div>
        <BoundaryConfig v-else :selectedItem="selectedItem" />
    </div>

    <!-- MODALS -->
    <AssignmentModal
        v-if="showAssignmentModal"
        :targetIds="currentSelectionIds"
        @close="showAssignmentModal = false"
    />
    <NetworkDataTable v-if="showNetTable" @close="showNetTable = false" />
    <NetworkRasterCheck v-if="showNetCheck" @close="showNetCheck = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
// Components
import ObjectTable from './ObjectTable.vue';
import BoundaryConfig from './BoundaryConfig.vue';
import RainConfig from './RainConfig.vue';
import GanglinienEditor from '../hydraulics/GanglinienEditor.vue';
import PatternGenerator from '../hydraulics/PatternGenerator.vue';
import AssignmentModal from '../hydraulics/AssignmentModal.vue';
import Flood2DSolverRunner from '../Flood2DSolverRunner.vue';
import SvEmoji from '../common/SvEmoji.vue';
import SurfaceConfig from './SurfaceConfig.vue';
import NetworkTable from './NetworkTable.vue';
import NetworkImportButton from './NetworkImportButton.vue';
import NetworkPropertyPanel from './NetworkPropertyPanel.vue';
import NetworkDataTable from './NetworkDataTable.vue';
import NetworkRasterCheck from './NetworkRasterCheck.vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import { fromGeoStore } from '@/features/flood-2D/services/geometry/adapters.js';

const geoStore = useGeoStore();
const simStore = useSimulationStore();
const hydStore = useHydraulicStore();
const netStore = useNetworkStore();

const activeTab = ref('SURFACE'); // SURFACE | NODES | BUILDINGS | BOUNDARIES | PROFILES | RAIN | SIMULATION | NETWORK
const showAssignmentModal = ref(false);

// Kanalnetz-Aktionen (Netz-Tab)
const showNetTable = ref(false);
const showNetCheck = ref(false);
const netCreateOpen = ref(false);
function createNet(tool) { simStore.setActiveTool(tool); netCreateOpen.value = false; }
function mergeLegacy() {
    netStore.mergeModel(fromGeoStore({ nodes: geoStore.nodes, culvertLinks: geoStore.culvertLinks }));
    netCreateOpen.value = false;
}

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

const ganglinienList = computed(() => {
    return hydStore.ganglinien ? Object.values(hydStore.ganglinien) : [];
});

const activeGanglinie = computed(() => {
    if (!hydStore.activeGanglinieId) return null;
    return hydStore.ganglinien[hydStore.activeGanglinieId];
});

// Selection Helper: Always return array (Single or Multi)
const currentSelectionIds = computed(() => {
    // NEW: Multi-select support
    if (simStore.multiSelection && simStore.multiSelection.size > 0) {
        return Array.from(simStore.multiSelection);
    }
    if (simStore.selection) {
        return [simStore.selection];
    }
    return [];
});

const applyPattern = (points) => {
    if(activeGanglinie.value) {
        hydStore.updateGanglinieData(activeGanglinie.value.id, points);
    }
};

const assignToSelection = () => {
    if (activeGanglinie.value && currentSelectionIds.value.length > 0) {
        // assignBoundaryCondition handles array now
        hydStore.assignBoundaryCondition(currentSelectionIds.value, {
            type: 'INFLOW_DYNAMIC', 
            value: null, 
            profileId: activeGanglinie.value.id 
        });
    }
};

const handleZoom = (item) => {
    console.log("Zoom to:", item);
};

// NEW: Auto-Switch Tab on Selection
watch(() => simStore.selection, (newId) => {
    if (!newId) return;
    
    // Check Nodes
    if (geoStore.nodes.some(n => n.id === newId)) {
        activeTab.value = 'NODES';
        return;
    }
    // Check Buildings
    if (geoStore.buildings.features.some(f => f.id === newId)) {
        activeTab.value = 'BUILDINGS';
        return;
    }
    // Check Boundaries
    if (geoStore.boundaries.features.some(f => f.id === newId)) {
        activeTab.value = 'BOUNDARIES';
        return;
    }
});
</script>

<style scoped>
/* Kanalnetz-Aktionen (Netz-Tab) */
.net-actions { display: flex; gap: 6px; padding: 8px 10px; flex-wrap: wrap; border-top: 1px solid #2e2740; }
.na-btn { display: flex; align-items: center; gap: 5px; background: #1a2635; color: #ecf0f1; border: 1px solid var(--sv-violet, #8b5cf6); border-radius: 5px; padding: 6px 10px; cursor: pointer; font-size: 0.76rem; }
.na-btn:hover { border-color: var(--sv-lime, #a3e635); }
.na-create { position: relative; }
.na-menu { position: absolute; bottom: calc(100% + 4px); left: 0; z-index: 40; background: var(--sv-surface, #253547); border: 1px solid var(--sv-violet, #8b5cf6); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; gap: 2px; box-shadow: 0 8px 22px rgba(0,0,0,.4); }
.na-menu button { display: flex; align-items: center; gap: 6px; background: none; border: none; color: #ecf0f1; padding: 6px 10px; cursor: pointer; font-size: 0.76rem; white-space: nowrap; border-radius: 4px; }
.na-menu button:hover { background: #ffffff0d; }

.scenario-manager {
    display: flex; flex-direction: column;
    height: 100%;
    background: #16161f;
    border-left: 1px solid var(--sv-border);
    width: 100%; /* Will be constrained by parent container */
    overflow: hidden;
    font-family: var(--sv-font);
}

.panel-header {
    padding: 1rem;
    background: #1e1e2c;
    border-bottom: 1px solid #2e2740;
    display: flex; justify-content: space-between; align-items: center;
}
.panel-header h3 { margin: 0; font-size: 1rem; color: var(--sv-text-violet); text-shadow: var(--sv-glow-violet); text-transform: uppercase; letter-spacing: 1px; }
.stats { font-size: 0.8rem; color: #95a5a6; }

/* TABS */
.tabs {
    display: flex;
    background: #1e1e2c;
    border-bottom: 1px solid #2e2740;
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
.tabs button:hover { background: #2e2740; color: #fff; }
.tabs button.active {
    color: #a3e635;
    border-bottom-color: #a3e635;
    background: #16161f;
}

.panel-content {
    flex: 1;
    overflow: hidden; /* Scroll handled by ObjectTable */
    background: #16161f;
    display: flex; flex-direction: column;
}

/* PROFILES MANAGER LAYOUT */
.profiles-manager {
    display: flex;
    height: 100%;
}

.profiles-list-col {
    width: 200px;
    background: #101018;
    border-right: 1px solid #2e2740;
    overflow-y: auto;
    display: flex; flex-direction: column;
}

.profile-item {
    padding: 10px;
    border-bottom: 1px solid #1e1e2c;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
}
.profile-item:hover { background: #1e1e2c; }
.profile-item.active { background: #2e2740; border-left: 3px solid #a3e635; }

.p-name { color: #ecf0f1; font-weight: bold; font-size: 0.9rem; }
.p-meta { color: #7f8c8d; font-size: 0.75rem; }

.btn-del {
    position: absolute; right: 5px; top: 5px;
    background: none; border: none; color: #e74c3c;
    font-size: 1.2rem; cursor: pointer; opacity: 0;
}
.profile-item:hover .btn-del { opacity: 1; }

.list-actions {
    display: flex; flex-direction: column; gap: 8px; margin-top: 15px; border-top: 1px solid #2e2740; padding-top: 15px;
}
.btn-config {
    width: 100%;
    padding: 12px;
    background: #8b5cf6; /* Prominent Orange */
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: bold;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background 0.2s;
}
.btn-config:hover {
    background: #6d43d4;
}
.btn-add {
    width: 100%;
    padding: 8px;
    background: #a3e635;
    color: #12121a;
    font-weight: 700;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.btn-add:hover { background: #b6f04d; }

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
.name-input { flex: 1; background: #1e1e2c; border: 1px solid #2e2740; color: white; padding: 6px; border-radius: 4px; }
.type-select { background: #1e1e2c; border: 1px solid #2e2740; color: white; padding: 6px; border-radius: 4px; }

.empty-msg, .empty-editor {
    padding: 2rem; text-align: center; color: #7f8c8d; font-style: italic;
}

.panel-config {
    flex: 0 0 40%; /* 40% height for config */
    border-top: 1px solid #2e2740;
    overflow-y: auto;
    background: #101018;
}

</style>

<style scoped>
/* BULK HINT */
.bulk-hint {
    padding: 20px; 
    text-align: center; 
    color: #bdc3c7; 
    background: #1e1e2c; 
    border-radius: 4px;
    display: flex; flex-direction: column; gap: 10px; align-items: center;
    border: 1px dashed #2e2740;
}
.bulk-icon { font-size: 2rem; }
.btn-bulk-config {
    margin-top: 5px;
    padding: 8px 16px;
    background: #a3e635;
    color: #12121a;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}
.btn-bulk-config:hover { background: #6d43d4; }
</style>
