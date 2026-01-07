<template>
  <div class="boundary-config" v-if="selectedItem">
    
    <div class="header">
      <h4>Hydraulic Configuration</h4>
      <small>ID: {{ shortId }}</small>
    </div>

    <!-- ROLE SELECTION -->
    <div class="form-group">
      <label>Hydraulic Role</label>
      <select v-model="role" @change="saveSettings">
        <option value="NONE">None (Passive)</option>
        <option value="INFLOW">Inflow (Source)</option>
        <option value="OUTFLOW">Outflow (Sink)</option>
        <option value="HFIX">Fixed Level (H-Fix)</option>
      </select>
    </div>

    <!-- CONFIGURATION AREA (If Role Active) -->
    <div v-if="role !== 'NONE'" class="active-config">
      
      <!-- MODE SWITCH -->
      <div class="toggle-group">
        <label>
            <input type="radio" value="CONSTANT" v-model="mode" @change="saveSettings"> Constant
        </label>
        <label>
            <input type="radio" value="SERIES" v-model="mode" @change="saveSettings"> Time Series
        </label>
      </div>

      <!-- CONSTANT INPUT -->
      <div v-if="mode === 'CONSTANT'" class="form-group">
        <label>
            {{ valueLabel }}
        </label>
        <div class="input-wrapper">
            <input 
              type="number" 
              v-model.number="constantValue" 
              @change="saveSettings"
              step="0.01"
            >
            <span class="unit">{{ valueUnit }}</span>
        </div>
      </div>

      <!-- SERIES EDITOR -->
      <div v-if="mode === 'SERIES'" class="form-group">
        <label>{{ valueLabel }} (over Time)</label>
        <TimeSeriesEditor v-model="timeSeries" @update:modelValue="saveSettings" />
      </div>

    </div>

  </div>
  <div v-else class="empty">
    Select an object to configure.
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useScenarioStore } from '@/stores/scenarioStore';
import TimeSeriesEditor from './TimeSeriesEditor.vue';

const props = defineProps({
  selectedItem: { type: Object, default: null }
});

const store = useScenarioStore();

// Local State
const role = ref('NONE');
const mode = ref('CONSTANT'); // CONSTANT | SERIES
const constantValue = ref(0);
const timeSeries = ref([{ t: 0, v: 0 }]);

// Computed Checkers
const shortId = computed(() => {
    if (!props.selectedItem || !props.selectedItem.id) return '';
    const id = props.selectedItem.id;
    return (typeof id === 'string') ? id.substring(0, 8) + '...' : id;
});

const valueLabel = computed(() => {
    if (role.value === 'INFLOW') return 'Discharge (Q)';
    if (role.value === 'OUTFLOW') return 'Level / Discharge';
    if (role.value === 'HFIX') return 'Water Level (H)';
    return 'Value';
});

const valueUnit = computed(() => {
    if (role.value === 'INFLOW') return 'm³/s';
    if (role.value === 'HFIX') return 'm';
    return '-';
});

// --- SYNC ENGINE ---

// 1. Load Data on Selection Change
watch(() => props.selectedItem, (newItem) => {
    if (!newItem) return;
    
    // Extract Logic from properties.hydraulic
    const hydraulic = newItem.properties.hydraulic || {};
    
    role.value = hydraulic.role || 'NONE';
    mode.value = hydraulic.mode || 'CONSTANT';
    constantValue.value = (hydraulic.value !== undefined) ? hydraulic.value : 0;
    
    if (hydraulic.series && Array.isArray(hydraulic.series) && hydraulic.series.length > 0) {
        timeSeries.value = [...hydraulic.series]; // Copy
    } else {
        timeSeries.value = [{ t: 0, v: 0 }]; // Reset
    }

}, { immediate: true });

// 2. Save back to Store
const saveSettings = () => {
    if (!props.selectedItem) return;

    // Construct Payload
    const payload = {
        role: role.value,
        mode: mode.value,
        value: constantValue.value,
        series: timeSeries.value
    };

    // Store Action
    store.updateHydraulics(props.selectedItem.id, payload);
};

</script>

<style scoped>
.boundary-config {
    padding: 1rem;
    background: #233140;
    border-top: 1px solid #34495e;
    color: #ecf0f1;
}

.header {
    border-bottom: 1px solid #34495e;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
}
.header h4 { margin: 0; font-size: 0.95rem; text-transform: uppercase; color: #3498db; }
.header small { color: #7f8c8d; font-family: monospace; }

.form-group { margin-bottom: 1rem; }
.form-group label { display: block; font-size: 0.8rem; color: #bdc3c7; margin-bottom: 0.3rem; }

select, input[type="number"] {
    width: 100%;
    padding: 6px;
    background: #2c3e50;
    border: 1px solid #34495e;
    color: #fff;
    border-radius: 4px;
}
select:focus, input:focus { border-color: #3498db; outline: none; }

.toggle-group {
    display: flex; gap: 1rem; margin-bottom: 1rem;
    font-size: 0.85rem;
}
.toggle-group label { cursor: pointer; display: flex; align-items: center; gap: 4px; }

.input-wrapper { display: flex; align-items: center; gap: 0.5rem; }
.unit { font-size: 0.8rem; color: #7f8c8d; }

.empty { padding: 2rem; text-align: center; color: #7f8c8d; font-style: italic; }

.active-config {
    background: #2c3e50;
    padding: 0.8rem;
    border-radius: 4px;
    border-left: 3px solid #3498db;
}
</style>
