

<script setup>
import { ref, computed, watch } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
import GanglinienEditor from '../hydraulics/GanglinienEditor.vue';

const props = defineProps({
  selectedItem: { type: Object, default: null }
});

const hydStore = useHydraulicStore();
const geoStore = useGeoStore();

// --- STATE ---
// Role/Mode simplified to German UI concepts
const activeType = ref('NONE'); // NONE, INFLOW_CONSTANT, INFLOW_DYNAMIC, OUTFLOW_FREE, WATERLEVEL_FIX
const constantValue = ref(0);
const selectedProfileId = ref(null);

// UI Options
const typeOptions = [
    { value: 'NONE', label: 'Keine Auswahl' },
    { value: 'INFLOW_CONSTANT', label: '🚰 Konstanter Zufluss' },
    { value: 'INFLOW_DYNAMIC', label: '🌊 Zufluss (Ganglinie)' },
    { value: 'OUTFLOW_FREE', label: '↘️ Freier Auslauf' },
    { value: 'WATERLEVEL_FIX', label: '🛑 Wasserstand (Ganglinie)' }
];

// Computed
const shortId = computed(() => {
    if (!props.selectedItem || !props.selectedItem.id) return '';
    const id = props.selectedItem.id;
    return (typeof id === 'string') ? id.substring(0, 8) + '...' : id;
});

const isNode = computed(() => {
    if (!props.selectedItem) return false;
    return !props.selectedItem.geometry; // Heuristic for Node
});

const ganglinienOptions = computed(() => {
    return hydStore.ganglinien ? Object.values(hydStore.ganglinien) : [];
});

const currentProfileData = computed({
    get: () => {
        if (selectedProfileId.value && hydStore.ganglinien[selectedProfileId.value]) {
            return hydStore.ganglinien[selectedProfileId.value].data || [];
        }
        return [];
    },
    set: (newPoints) => {
        if (selectedProfileId.value) {
            hydStore.updateGanglinieData(selectedProfileId.value, newPoints);
        }
    }
});

const showGanglinienEditor = computed(() => {
    return (activeType.value === 'INFLOW_DYNAMIC' || activeType.value === 'WATERLEVEL_FIX') && !!selectedProfileId.value;
});

// --- SYNC ENGINE ---

watch(() => props.selectedItem, (newItem) => {
    if (!newItem || !newItem.id) {
        activeType.value = 'NONE';
        return;
    }

    const assignment = hydStore.assignments[newItem.id];
    if (assignment) {
        activeType.value = assignment.type;
        constantValue.value = (assignment.value !== undefined && assignment.value !== null) ? assignment.value : 0;
        selectedProfileId.value = assignment.profileId || null;
    } else {
        activeType.value = 'NONE';
        constantValue.value = 0;
        selectedProfileId.value = null;
    }

}, { immediate: true });

// --- ACTIONS ---

const saveSettings = () => {
    if (!props.selectedItem || !props.selectedItem.id) return;
    const id = props.selectedItem.id;

    if (activeType.value === 'NONE') {
        if (hydStore.assignments[id]) delete hydStore.assignments[id];
        return;
    }

    // Integrity Check
    let finalProfileId = null;
    let finalValue = null;

    if (activeType.value === 'INFLOW_DYNAMIC' || activeType.value === 'WATERLEVEL_FIX') {
        if (!selectedProfileId.value) {
            // Error or wait? User needs to select profile.
            // For now, we save what we have, but it won't simulate correctly without profile.
            // Ideally we could auto-create one?
        }
        finalProfileId = selectedProfileId.value;
    } else if (activeType.value === 'INFLOW_CONSTANT') {
        finalValue = constantValue.value;
    }

    const payload = {
        type: activeType.value,
        value: finalValue,
        profileId: finalProfileId
    };

    hydStore.assignBoundaryCondition([id], payload);
};

// Create a new Global Profile and link it immediately
const createNewProfile = () => {
    const newId = hydStore.createGanglinie('Neues Profil ' + new Date().toLocaleTimeString().slice(0,5), 'Zufluss');
    selectedProfileId.value = newId;
    saveSettings(); // Auto-save assignment
};

const goToProfileManager = () => {
    // Optional: emit event to open full manager if needed
    // For now inline editor is enough
};

</script>

<template>
  <div class="boundary-config-panel">
    <div class="panel-header">
      <h4>Hydraulik ({{ shortId }})</h4>
    </div>

    <div v-if="selectedItem" class="panel-body">
      
      <!-- TYPE SELECTION -->
      <div class="form-group">
          <label>Verhaltenstyp</label>
          <select v-model="activeType" @change="saveSettings" class="main-select">
              <template v-for="opt in typeOptions" :key="opt.value">
                   <!-- Filter Outflow for Nodes if strictly required, but engine often supports sinks -->
                  <option :value="opt.value">{{ opt.label }}</option>
              </template>
          </select>
      </div>

      <!-- DYNAMIC CONFIG -->
      <div v-if="activeType === 'INFLOW_DYNAMIC' || activeType === 'WATERLEVEL_FIX'" class="dynamic-config">
          <div class="form-group">
            <label>Ganglinie wählen</label>
            <div class="select-row">
                <select v-model="selectedProfileId" @change="saveSettings" class="sub-select">
                    <option :value="null" disabled>-- Bitte wählen --</option>
                    <option v-for="gl in ganglinienOptions" :key="gl.id" :value="gl.id">
                        {{ gl.name }}
                    </option>
                </select>
                <button class="btn-new" @click="createNewProfile" title="Neue Ganglinie erstellen">+</button>
            </div>
          </div>

          <!-- EMBEDDED EDITOR -->
          <div v-if="showGanglinienEditor" class="embedded-editor">
              <GanglinienEditor 
                v-model="currentProfileData"
                :duration="10800"
              />
          </div>
          <div v-else-if="!selectedProfileId" class="hint-warn">
              ⚠️ Bitte eine Ganglinie auswählen oder erstellen.
          </div>
      </div>

      <!-- CONSTANT CONFIG -->
      <div v-if="activeType === 'INFLOW_CONSTANT'" class="constant-config">
          <div class="form-group">
              <label>Gesamtzufluss Q (m³/s)</label>
              <input type="number" v-model.number="constantValue" @change="saveSettings" step="0.1" class="value-input">
              <small class="hint-info">Wird automatisch auf alle Randzellen aufgeteilt.</small>
          </div>
      </div>

       <!-- OUTFLOW CONFIG -->
       <div v-if="activeType === 'OUTFLOW_FREE'" class="info-box">
          <p>Das Wasser fließt hier frei aus dem System (Critical Depth).</p>
      </div>

    </div>
    <div v-else class="empty-state">
        Kein Objekt ausgewählt.
    </div>
  </div>
</template>

<style scoped>
.boundary-config-panel {
    background: #2c3e50;
    color: #ecf0f1;
    padding: 10px;
    height: 100%;
    display: flex; flex-direction: column;
}
.panel-header { border-bottom: 1px solid #34495e; margin-bottom: 10px; padding-bottom: 5px; }
.panel-header h4 { margin: 0; font-size: 1rem; color: #bdc3c7; }

.form-group { margin-bottom: 15px; }
.form-group label { display: block; font-size: 0.85rem; color: #bdc3c7; margin-bottom: 5px; }

.main-select, .sub-select, .value-input {
    width: 100%; padding: 8px; background: #1e272e; border: 1px solid #34495e; color: white; border-radius: 4px;
}
.main-select { font-weight: bold; }

.select-row { display: flex; gap: 5px; }
.btn-new {
    background: #27ae60; border: none; color: white; width: 30px; border-radius: 4px; cursor: pointer; font-size: 1.2rem;
}
.btn-new:hover { background: #2ecc71; }

.embedded-editor {
    height: 250px;
    border: 1px solid #34495e;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 10px;
}

.info-box {
    background: rgba(52, 152, 219, 0.1); border-left: 3px solid #3498db; padding: 10px; font-size: 0.9rem;
}
.hint-warn { color: #f39c12; font-size: 0.9rem; margin-top: 5px; }
.hint-info { color: #7f8c8d; font-size: 0.8rem; margin-top: 3px; display: block; }
</style>


