<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content large-modal">
        <div class="modal-header">
          <h3>Modellregen erstellen</h3>
          <button class="close-btn" @click="close">×</button>
        </div>
        
        <div class="modal-body">
          <div class="config-section">
            <div class="form-group">
              <label>Regentyp:</label>
              <div class="radio-group">
                <label>
                  <input type="radio" value="block" v-model="rainType"> Blockregen
                </label>
                <label>
                  <input type="radio" value="euler2" v-model="rainType" :disabled="!hasKostraData"> 
                  Euler Typ II
                  <span v-if="!hasKostraData" class="hint">(Benötigt KOSTRA Daten)</span>
                </label>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Dauer (min):</label>
                <input type="number" v-model.number="duration" step="5" min="5">
              </div>
              <div class="form-group">
                <label>Intervall (min):</label>
                <input type="number" v-model.number="interval" step="1" min="1" max="60">
              </div>
            </div>

            <div v-if="rainType === 'block'" class="form-group">
              <label>Intensität (l/s*ha):</label>
              <input type="number" v-model.number="intensity" step="0.1">
            </div>
            
            <div v-if="rainType === 'euler2'" class="form-group">
               <label>Wiederkehrzeit (KOSTRA):</label>
               <select v-model="selectedReturnPeriod">
                 <option value="RN_001A">1 Jahr</option>
                 <option value="RN_002A">2 Jahre</option>
                 <option value="RN_003A">3 Jahre</option>
                 <option value="RN_005A">5 Jahre</option>
                 <option value="RN_010A">10 Jahre</option>
                 <option value="RN_020A">20 Jahre</option>
                 <option value="RN_030A">30 Jahre</option>
                 <option value="RN_050A">50 Jahre</option>
                 <option value="RN_100A">100 Jahre</option>
               </select>
            </div>
          </div>

          <div class="chart-section">
            <div class="chart-container">
              <Bar v-if="chartData" :data="chartData" :options="chartOptions" />
            </div>
            
            <!-- KOSTRA Table for Selection -->
            <div v-if="rainType === 'euler2' && hasKostraData" class="table-wrapper">
              <h4>Wiederkehrzeit wählen (Klick auf Spalte):</h4>
              <div class="table-scroll">
                <table class="kostra-table">
                  <thead>
                    <tr>
                      <th>Dauer</th>
                      <th 
                        v-for="rp in returnPeriods" 
                        :key="rp.key"
                        :class="{ 'active-col': selectedReturnPeriod === rp.key }"
                        @click="selectedReturnPeriod = rp.key"
                        class="clickable-col"
                      >
                        {{ rp.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="d in durations" :key="d">
                      <td>{{ d }} min</td>
                      <td 
                        v-for="rp in returnPeriods" 
                        :key="rp.key"
                        :class="{ 'active-col': selectedReturnPeriod === rp.key }"
                        @click="selectedReturnPeriod = rp.key"
                        class="clickable-cell"
                      >
                        {{ getKostraValue(d, rp.key) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" @click="close">Abbrechen</button>
          <button class="primary-btn" @click="apply">Übernehmen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { calculateBlockRain, calculateEulerType2 } from '../utils/RainModelService';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const props = defineProps({
  isOpen: Boolean,
  kostraData: Object, // Full raw data
  initialDuration: Number,
  initialIntensity: Number
});

const emit = defineEmits(['close', 'apply']);

const rainType = ref('block');
const duration = ref(60);
const interval = ref(5);
const intensity = ref(120);
const selectedReturnPeriod = ref('RN_001A');

const durations = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const returnPeriods = [
  { key: 'RN_001A', label: '1 a' },
  { key: 'RN_002A', label: '2 a' },
  { key: 'RN_003A', label: '3 a' },
  { key: 'RN_005A', label: '5 a' },
  { key: 'RN_010A', label: '10 a' },
  { key: 'RN_020A', label: '20 a' },
  { key: 'RN_030A', label: '30 a' },
  { key: 'RN_050A', label: '50 a' },
  { key: 'RN_100A', label: '100 a' }
];

const getKostraValue = (d, key) => {
  if (!props.kostraData) return '-';
  const row = props.kostraData[String(d)];
  return row ? row[key] : '-';
};

const hasKostraData = computed(() => !!props.kostraData);

// Initialize
watch(() => props.isOpen, (val) => {
  if (val) {
    duration.value = props.initialDuration || 60;
    intensity.value = props.initialIntensity || 120;
    if (hasKostraData.value) {
      // Try to match current intensity to a return period? Too complex.
      // Just keep default or last selected.
    }
  }
});

const generatedSeries = computed(() => {
  if (rainType.value === 'block') {
    return calculateBlockRain(intensity.value, duration.value, interval.value);
  } else if (rainType.value === 'euler2' && props.kostraData) {
    // Extract row for selected return period
    // kostraData is { '5': { RN_001A: ... }, '10': ... }
    // We need map: duration -> intensity
    const row = {};
    for (const d in props.kostraData) {
        if (props.kostraData[d][selectedReturnPeriod.value]) {
            row[d] = props.kostraData[d][selectedReturnPeriod.value];
        }
    }
    return calculateEulerType2(row, duration.value, interval.value);
  }
  return [];
});

const chartData = computed(() => {
  const series = generatedSeries.value;
  return {
    labels: series.map(s => s.time + ' min'),
    datasets: [{
      label: 'Regenhöhe (mm)',
      data: series.map(s => s.height_mm !== undefined ? s.height_mm : (s.intensity * interval.value * 0.006)), // Fallback for block rain
      backgroundColor: '#3498db',
    }]
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: 'Regenhöhe (mm)' }
    },
    x: {
      title: { display: true, text: 'Zeit (min)' }
    }
  },
  plugins: {
    tooltip: {
      callbacks: {
        label: (context) => {
          const val = context.raw;
          const seriesItem = generatedSeries.value[context.dataIndex];
          const intensity = seriesItem.intensity.toFixed(1);
          return [`Höhe: ${val.toFixed(2)} mm`, `Intensität: ${intensity} l/(s·ha)`];
        }
      }
    }
  }
};

const close = () => emit('close');

const apply = () => {
  emit('apply', {
    type: rainType.value,
    series: generatedSeries.value,
    metadata: {
        duration: duration.value,
        interval: interval.value,
        returnPeriod: rainType.value === 'euler2' ? selectedReturnPeriod.value : null
    }
  });
  close();
};
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
  z-index: 1100; /* Higher than KostraModal if needed */
  backdrop-filter: blur(2px);
}

.modal-content.large-modal {
  width: 90%;
  max-width: 800px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-body {
  flex: 1;
  padding: 1.5rem;
  display: flex;
  gap: 2rem;
  overflow: hidden;
}

.config-section {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
}

.chart-section {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.chart-container {
  flex: 1;
  min-height: 0;
}

.table-wrapper {
  flex-shrink: 0;
  max-height: 200px;
  display: flex;
  flex-direction: column;
}

.table-wrapper h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.9rem;
  color: #555;
}

.table-scroll {
  overflow: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.kostra-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.kostra-table th, .kostra-table td {
  padding: 0.3rem 0.5rem;
  border: 1px solid #eee;
  text-align: right;
  white-space: nowrap;
}

.kostra-table th {
  background: #f8f9fa;
  font-weight: 600;
  text-align: center;
  position: sticky;
  top: 0;
  z-index: 1;
}

.clickable-col, .clickable-cell {
  cursor: pointer;
}

.clickable-col:hover, .clickable-cell:hover {
  background-color: #e8f4f8;
}

.active-col {
  background-color: #e3f2fd !important;
  border-left: 2px solid #3498db;
  border-right: 2px solid #3498db;
}

.kostra-table th.active-col {
  border-top: 2px solid #3498db;
  color: #1976d2;
}

.kostra-table tr:last-child td.active-col {
  border-bottom: 2px solid #3498db;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #2c3e50;
}

.form-group input, .form-group select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-row {
  display: flex;
  gap: 1rem;
}

.hint {
  font-size: 0.8rem;
  color: #e74c3c;
}

.modal-footer {
  padding: 1rem;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.primary-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.secondary-btn {
  background: white;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}
</style>
