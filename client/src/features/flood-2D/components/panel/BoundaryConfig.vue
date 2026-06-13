

<script setup>
import { ref, computed, watch } from 'vue';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';

// ── Global Boundary State ─────────────────────────────────────────────────
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
const useNativeFree = ref(true);

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
        useNativeFree.value = assignment.useNativeFree !== undefined ? assignment.useNativeFree : true;
    } else {
        activeType.value = 'NONE';
        constantValue.value = 0;
        selectedProfileId.value = null;
        useNativeFree.value = true;
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
        // Ohne Profil wird die Zuweisung gespeichert (Auswahl bleibt erhalten),
        // aber der InputGenerator überspringt sie mit Warnung.
        finalProfileId = selectedProfileId.value;
    } else if (activeType.value === 'INFLOW_CONSTANT') {
        // Negativer Zufluss wäre ein versteckter Abfluss → Massenbilanz kaputt.
        if (!Number.isFinite(constantValue.value) || constantValue.value < 0) {
            constantValue.value = 0;
        }
        finalValue = constantValue.value;
    }

    const payload = {
        type: activeType.value,
        value: finalValue,
        profileId: finalProfileId,
        useNativeFree: useNativeFree.value
    };

    hydStore.assignBoundaryCondition([id], payload);
};

// Create a new Global Profile and link it immediately
const createNewProfile = () => {
    const newId = hydStore.createGanglinie('Neues Profil ' + new Date().toLocaleTimeString().slice(0,5), 'Zufluss');
    selectedProfileId.value = newId;
    saveSettings(); // Auto-save assignment
};

const goToProfileManager = () => {};

// ── Globale Randbedingung ──────────────────────────────────────────────────
const globalTypeOptions = [
    { value: 'CLOSED', label: '🔒 Geschlossen' },
    { value: 'FREE',   label: '↗️ Frei (FREE)' },
    { value: 'HFIX',   label: '📏 Fester Pegel' },
];

const globalStatusText = computed(() => {
    switch (hydStore.globalBoundaryType) {
        case 'CLOSED': return '⚠️ Alle Kanten geschlossen — Wasser kann nicht abfließen';
        case 'FREE':   return '✅ Freier Auslauf an allen 4 Domänenkanten (empfohlen)';
        case 'HFIX':   return `✅ Wasserstand ${hydStore.globalBoundaryHfix.toFixed(1)} m NHN an allen Kanten`;
        default:       return '';
    }
});

const globalStatusClass = computed(() =>
    hydStore.globalBoundaryType === 'CLOSED' ? 'status-warn' : 'status-ok'
);

// HFIX unterhalb des tiefsten Geländepunkts kann nie Wasser halten — warnen.
const hfixBelowTerrain = computed(() => {
    const minZ = geoStore.terrain?.minZ;
    return hydStore.globalBoundaryType === 'HFIX'
        && Number.isFinite(minZ)
        && hydStore.globalBoundaryHfix < minZ;
});

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
              <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
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
              <input type="number" v-model.number="constantValue" @change="saveSettings" step="0.1" min="0" class="value-input">
              <small class="hint-info">Wird automatisch auf alle Randzellen aufgeteilt.</small>
          </div>
      </div>

       <!-- OUTFLOW CONFIG -->
       <div v-if="activeType === 'OUTFLOW_FREE'" class="info-box outflow-config">
          <p>Das Wasser fließt hier frei aus dem System (Critical Depth).</p>
          <label style="display:flex; align-items:center; gap:8px; margin-top:10px; cursor:pointer;">
              <input type="checkbox" v-model="useNativeFree" @change="saveSettings">
              <span style="font-size:0.9rem; color:#bdc3c7;">Als Modell-Rand (N/E/S/W) behandeln</span>
          </label>
          <small class="hint-info" style="margin-top:8px;">Nur wirksam, wenn die Grenze exakt auf dem Rasterrand liegt. Andernfalls wird intern ein Abfluss-Wehr (HFIX) simuliert.</small>
      </div>

    </div>
    <!-- Globale Randbedingung — immer sichtbar, unterhalb der Objekt-Config -->
    <div class="global-boundary-panel">
      <div class="global-header">🌐 Globale Randbedingung</div>
      <p class="global-desc">
        Gilt für alle 4 Domänenkanten wenn keine manuellen Boundaries gesetzt sind.
      </p>

      <div class="global-type-row">
        <button
          v-for="opt in globalTypeOptions"
          :key="opt.value"
          class="gtype-btn"
          :class="{ active: hydStore.globalBoundaryType === opt.value }"
          @click="hydStore.globalBoundaryType = opt.value"
        >{{ opt.label }}</button>
      </div>

      <div v-if="hydStore.globalBoundaryType === 'HFIX'" class="global-hfix-input">
        <label>Außen-Wasserspiegel [m NHN]</label>
        <input type="number" v-model.number="hydStore.globalBoundaryHfix" step="0.1" />
        <small v-if="hfixBelowTerrain" class="hint-warn">
          ⚠️ Pegel liegt unter dem tiefsten Geländepunkt ({{ geoStore.terrain.minZ.toFixed(1) }} m) — wirkt wie freier Auslauf.
        </small>
      </div>

      <div class="global-status" :class="globalStatusClass">{{ globalStatusText }}</div>
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

/* ── Global Boundary Panel ── */
.global-boundary-panel { padding: 4px 0; display: flex; flex-direction: column; gap: 10px; }
.global-header { font-size: 0.88rem; font-weight: 700; color: #5dade2; border-bottom: 1px solid #34495e; padding-bottom: 6px; }
.global-desc { font-size: 0.78rem; color: #7f8c8d; line-height: 1.4; margin: 0; }
.global-type-row { display: flex; gap: 6px; }
.gtype-btn {
    flex: 1; padding: 7px 4px; border: 1px solid #4a6278; border-radius: 5px;
    background: #1e3348; color: #bdc3c7; font-size: 0.75rem; font-weight: 600;
    cursor: pointer; transition: all 0.15s; text-align: center;
}
.gtype-btn:hover  { background: #2471a3; border-color: #2980b9; color: #fff; }
.gtype-btn.active { background: #2980b9; border-color: #5dade2; color: #fff; }

.global-hfix-input { display: flex; flex-direction: column; gap: 4px; }
.global-hfix-input label { font-size: 0.78rem; color: #bdc3c7; }
.global-hfix-input input {
    padding: 6px 8px; border-radius: 4px; border: 1px solid #4a6278;
    background: #1e3348; color: white; font-size: 0.88rem; outline: none;
}
.global-hfix-input input:focus { border-color: #2980b9; }

.global-status { font-size: 0.78rem; padding: 6px 8px; border-radius: 4px; }
.status-warn { background: rgba(241,196,15,0.12); color: #f1c40f; border: 1px solid rgba(241,196,15,0.3); }
.status-ok   { background: rgba(39,174,96,0.12);  color: #2ecc71; border: 1px solid rgba(39,174,96,0.3); }
</style>


