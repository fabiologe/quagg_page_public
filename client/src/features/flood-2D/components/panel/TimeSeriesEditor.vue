<template>
  <div class="time-series-editor">
    
    <!-- TOOLBAR -->
    <div class="ts-toolbar">
      <span class="title">Time Series</span>
      <button class="add-btn" @click="addRow" title="Add Row">+</button>
    </div>

    <!-- TABLE -->
    <div class="ts-table-container">
      <table class="ts-table">
        <thead>
          <tr>
            <th>Time (s)</th>
            <th>Value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(point, index) in localData" :key="index">
            <td>
                <input 
                  type="number" 
                  v-model.number="point.t" 
                  @change="emitUpdate"
                  step="60"
                  class="ts-input"
                >
            </td>
            <td>
                <input 
                  type="number" 
                  v-model.number="point.v" 
                  @change="emitUpdate"
                  step="0.01"
                  class="ts-input"
                >
            </td>
            <td class="action-cell">
                <button 
                  v-if="localData.length > 1" 
                  class="del-btn" 
                  @click="removeRow(index)"
                >×</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- PREVIEW CHART (Simple SVG) -->
    <div class="ts-chart" v-if="localData.length > 1">
      <svg width="100%" height="50" viewBox="0 0 100 50" preserveAspectRatio="none">
        <polyline 
          :points="chartPoints"
          fill="none"
          stroke="#3498db"
          stroke-width="2"
        />
      </svg>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [{ t: 0, v: 0 }]
  }
});

const emit = defineEmits(['update:modelValue']);

// Local Clone to avoid direct mutation prop issues
const localData = ref([]);

// Initialize
watch(() => props.modelValue, (newVal) => {
    // Deep copy to break reference
    if (newVal) {
        localData.value = JSON.parse(JSON.stringify(newVal));
    }
}, { immediate: true, deep: true });

const emitUpdate = () => {
    // Sort by time? Usually good practice but might annoy user while typing.
    // Let's just emit raw.
    emit('update:modelValue', localData.value);
};

const addRow = () => {
    const last = localData.value[localData.value.length - 1];
    const newTime = last ? last.t + 3600 : 0;
    localData.value.push({ t: newTime, v: 0 });
    emitUpdate();
};

const removeRow = (index) => {
    localData.value.splice(index, 1);
    emitUpdate();
};

// --- CHART GENERATION ---
const chartPoints = computed(() => {
    if (localData.value.length < 2) return "";
    
    // Find min/max
    const times = localData.value.map(p => p.t);
    const vals = localData.value.map(p => p.v);
    
    const minT = Math.min(...times);
    const maxT = Math.max(...times);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals); 
    
    // Normalize to 0-100 (x) and 0-50 (y)
    // Avoid divide by zero
    const rangeT = (maxT - minT) || 1;
    const rangeV = (maxV - minV) || 1;

    return localData.value.map(p => {
        const x = ((p.t - minT) / rangeT) * 100;
        // SVG Y is top-down, so invert value
        // if val = max -> y = 0
        // if val = min -> y = 50
        const y = 50 - ((p.v - minV) / rangeV) * 50; 
        return `${x},${y}`;
    }).join(' ');
});

</script>

<style scoped>
.time-series-editor {
    background: #1a252f;
    border: 1px solid #34495e;
    border-radius: 4px;
    padding: 0.5rem;
    margin-top: 0.5rem;
}

.ts-toolbar {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 0.5rem;
}
.title { font-size: 0.8rem; color: #bdc3c7; font-weight: bold; }

.add-btn {
    background: #2ecc71; color: white; border: none; border-radius: 4px;
    width: 20px; height: 20px; cursor: pointer; line-height: 1;
}

.ts-table-container {
    max-height: 150px;
    overflow-y: auto;
}

.ts-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
}

.ts-table th { text-align: left; color: #7f8c8d; padding-bottom: 4px; }
.ts-table td { padding: 2px; }

.ts-input {
    width: 100%;
    background: #2c3e50;
    border: 1px solid #34495e;
    color: #ecf0f1;
    padding: 2px 4px;
    border-radius: 2px;
}
.ts-input:focus { outline: none; border-color: #3498db; }

.del-btn {
    background: none; border: none; color: #e74c3c; cursor: pointer; font-weight: bold;
}
.action-cell { text-align: right; width: 20px; }

.ts-chart {
    border-top: 1px solid #34495e;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    background: #151d24;
}
</style>
