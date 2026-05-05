<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
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
  z-index: 2000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.modal-header {
  background: #040647;
  padding: 1rem;
  border-bottom: 2px solid #594491;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-body {
  padding: 1rem;
  overflow-y: auto;
  flex: 1;
}

.controls {
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: #f3f2fb;
  border-radius: 4px;
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th, td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #aeadd2;
}

th {
  background: #f3f2fb;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

th:hover {
  background: #e9ecef;
}

.modal-footer {
  padding: 1rem;
  border-top: 1px solid #aeadd2;
  display: flex;
  justify-content: flex-end;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #8f8be1; /* Slate 400 */
  transition: color 0.2s;
  padding: 0 0.5rem;
}

.close-btn:hover {
  color: #2ecc71; /* Red 500 */
}

/* Toggle Switch */
.toggle-switch {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.slider {
  width: 40px;
  height: 20px;
  background-color: #ccc;
  border-radius: 20px;
  position: relative;
  margin-right: 10px;
  transition: 0.3s;
}

.slider::before {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: white;
  top: 2px;
  left: 2px;
  transition: 0.3s;
}

input:checked + .slider {
  background-color: #2196F3;
}

input:checked + .slider::before {
  transform: translateX(20px);
}

.label-text {
  font-weight: 500;
}

/* ── Design Schema ────────────────────────────── */
.tab-btn {
  font-family: "Press Start 2P", monospace !important;
  font-size: 0.5rem !important;
  letter-spacing: 0.06em;
  background: transparent !important;
  border: 1px solid #594491 !important;
  color: #aeadd2 !important;
  border-radius: 5px !important;
  padding: 0.45rem 0.75rem !important;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.tab-btn:hover { background: #594491 !important; color: #fff !important; }
.tab-btn.active { background: #594491 !important; color: #fff !important; border-color: #8f8be1 !important; }

.primary-btn {
  background: #040647 !important;
  color: #fff !important;
  border: none !important;
  border-radius: 6px !important;
  font-weight: 700 !important;
  transition: background 0.15s;
}
.primary-btn:hover:not(:disabled) { background: #594491 !important; }
.primary-btn:disabled { background: #aeadd2 !important; cursor: default; }

.secondary-btn {
  background: #fff !important;
  border: 1px solid #aeadd2 !important;
  color: #040647 !important;
  border-radius: 6px !important;
  font-weight: 600 !important;
  transition: background 0.12s;
}
.secondary-btn:hover { background: #f3f2fb !important; }

.modal-body h3, .panel h3 {
  font-family: "Press Start 2P", monospace !important;
  font-size: 0.55rem !important;
  color: #594491 !important;
  letter-spacing: 0.06em;
  border-bottom: 1px solid #aeadd2 !important;
  padding-bottom: 0.4rem !important;
  margin-bottom: 0.75rem !important;
}

</style>
