<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content" role="dialog" aria-modal="true" aria-label="Regenberechnung prüfen">
      <div class="modal-header">
        <h3>Regenberechnung Validierung</h3>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>
      
      <div class="modal-body">
        <div class="controls">
          <label class="toggle-switch">
            <input type="checkbox" v-model="useLosses" @change="updateCalculation">
            <span class="slider"></span>
            <span class="label-text">Verluste einbeziehen (1mm Initialverlust)</span>
          </label>
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th @click="sortBy('nodeId')">Schacht {{ sortKey === 'nodeId' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('areaId')">Fläche {{ sortKey === 'areaId' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('areaSize')">Größe (ha) {{ sortKey === 'areaSize' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('flowLength')">Geometrie-Länge (m) {{ sortKey === 'flowLength' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('slope')">Neigung {{ sortKey === 'slope' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('tc')">Fließzeit (min) {{ sortKey === 'tc' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('maxFlow')">Max. Volumenstrom (l/s) {{ sortKey === 'maxFlow' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('totalVolume')">Volumen (m³) {{ sortKey === 'totalVolume' ? (sortAsc ? '▲' : '▼') : '' }}</th>
                <th @click="sortBy('emptyTime')">Leerlaufzeit (min) {{ sortKey === 'emptyTime' ? (sortAsc ? '▲' : '▼') : '' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in sortedData" :key="index">
                <td>{{ item.nodeId }}</td>
                <td>{{ item.areaId }}</td>
                <td>{{ item.areaSize.toFixed(4) }}</td>
                <td>{{ item.flowLength.toFixed(2) }}</td>
                <td>{{ item.slope }}</td>
                <td>{{ item.tc.toFixed(2) }}</td>
                <td>{{ item.maxFlow.toFixed(2) }}</td>
                <td>{{ item.totalVolume ? item.totalVolume.toFixed(2) : '0.00' }}</td>
                <td>{{ item.emptyTime.toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="secondary-btn" @click="$emit('close')">Schließen</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const props = defineProps({
  details: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['close', 'recalculate']);

const useLosses = ref(false);
const sortKey = ref('nodeId');
const sortAsc = ref(true);

const updateCalculation = () => {
  emit('recalculate', { applyLosses: useLosses.value });
};

const sortBy = (key) => {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
};

const sortedData = computed(() => {
  return [...props.details].sort((a, b) => {
    let valA = a[sortKey.value];
    let valB = b[sortKey.value];
    
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    
    if (valA < valB) return sortAsc.value ? -1 : 1;
    if (valA > valB) return sortAsc.value ? 1 : -1;
    return 0;
  });
});
</script>

<style scoped src="./shared/modalBase.css"></style>
<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--isy-z-modal);
}

.modal-content {
  background: var(--isy-pixel-content-bg);
  border-radius: var(--isy-radius-lg);
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--isy-elev-2);
}

.modal-header {
  padding: var(--isy-space-4);
  background: var(--isy-pixel-bg);
}

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
  color: var(--isy-pixel-text-dim);
}

.modal-body {
  padding: var(--isy-space-4);
  overflow-y: auto;
  flex: 1;
}

.controls {
  margin-bottom: var(--isy-space-4);
  padding: var(--isy-space-2);
  background: var(--isy-pixel-border); color: var(--isy-pixel-green-bright);
  border-radius: var(--isy-radius-sm);
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--isy-fs-lg);
}

th, td {
  padding: var(--isy-space-3);
  text-align: left;
  border-bottom: 1px solid var(--isy-pixel-text-dim);
}

th {
  background: var(--isy-pixel-content-bg);
  font-weight: 600;
  cursor: var(--isy-cursor-hand);
  user-select: none;
}

th:hover {
  background: var(--isy-pixel-content-hover);
}

/* Toggle Switch */
.toggle-switch {
  display: flex;
  align-items: center;
  cursor: var(--isy-cursor-hand);
}

.toggle-switch input {
  display: none;
}

.slider {
  width: 40px;
  height: 20px;
  background-color: var(--isy-pixel-content-sunken);
  border-radius: 999px;
  position: relative;
  margin-right: var(--isy-space-2);
  transition: 0.3s;
}

.slider::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: var(--isy-pixel-content-bg);
  top: 2px;
  left: 2px;
  transition: 0.3s;
}

input:checked + .slider {
  background-color: var(--isy-pixel-green);
}

input:checked + .slider::before {
  transform: translateX(20px);
}

.label-text {
  font-weight: 500;
}

.secondary-btn {
  background: transparent;
  border: 1px solid var(--isy-pixel-border);
  color: var(--isy-pixel-text-dim);
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: var(--isy-cursor-hand);
  transition: background 0.12s;
}
.secondary-btn:hover { background: var(--isy-pixel-content-bg); }
</style>
