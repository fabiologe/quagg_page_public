<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content">
      <div class="modal-header">
        <h3>Modellregen Konfiguration</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <div class="modal-body">
        <!-- Configuration Section -->
        <div class="config-section">

          <!-- Raw Raster Center Display (Requested) -->
          <div v-if="rawCenter" class="raw-center-info">
              <span class="label">Raster Zentrum (Raw):</span>
              <div class="values">
                  X: {{ rawCenter.x }}<br>
                  Y: {{ rawCenter.y }}
              </div>
          </div>
          
          <!-- KOSTRA Import Trigger -->
          <div class="form-group import-group">
             <label>Datenbasis:</label>
             <div v-if="hasKostraData" class="success-msg">KOSTRA Daten geladen ✓ ({{ kostraLocation }})</div>
             <button class="btn-secondary" @click="showKostraImport = true">
                 KOSTRA Daten abrufen
             </button>
          </div>

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
               <option v-for="rp in returnPeriods" :key="rp.key" :value="rp.key">{{ rp.label }}</option>
             </select>
          </div>
        </div>

        <!-- Chart & Table Section -->
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
        <button class="primary-btn" @click="apply" :disabled="!generatedSeries.length">Übernehmen</button>
      </div>

      <!-- Nested Importer -->
      <KostraImportModal 
            :isOpen="showKostraImport"
            :reference-point="referencePoint"
            @close="showKostraImport = false"
            @import="handleKostraImport"
      />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { calculateBlockRain, calculateEulerType2 } from '../../utils/RainModelService.js';
import KostraImportModal from '../importer/KostraImportModal.vue';
import { Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'apply']);
const hydStore = useHydraulicStore();
const geoStore = useGeoStore();

const showKostraImport = ref(false);

// Local State
const rainType = ref('block');
const duration = ref(60);
const interval = ref(5);
const intensity = ref(120);
const selectedReturnPeriod = ref('RN_100A'); // Default 100 years

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

// Reference point for Import Modal
const referencePoint = computed(() => {
    if (hydStore.rainLocation) return { x: hydStore.rainLocation.lon, y: hydStore.rainLocation.lat };
    
    // Priority 1: DEM Grid Center (from GeoStore)
    if (geoStore.terrain && geoStore.terrain.center) return { x: geoStore.terrain.center.x, y: geoStore.terrain.center.y };

    // Priority 2: Nodes Center
    if (geoStore.nodes && geoStore.nodes.length > 0) {
        let sumX = 0, sumY = 0, count = 0;
        for (const n of geoStore.nodes) {
            if (n.x && n.y) {
                sumX += n.x;
                sumY += n.y;
                count++;
            }
        }
        if (count > 0) return { x: sumX / count, y: sumY / count };
    }

    return null;
});

const rawCenter = computed(() => {
    if (geoStore.terrain && geoStore.terrain.center) {
        return geoStore.terrain.center;
    }
    // Fallback display
    if (geoStore.nodes && geoStore.nodes.length > 0) {
       const pt = referencePoint.value;
       if (pt && !hydStore.rainLocation) return pt; 
    }
    return null;
});

const hasKostraData = computed(() => !!hydStore.kostraGrid);
const kostraLocation = computed(() => hydStore.rainLocation ? `${hydStore.rainLocation.lat.toFixed(3)}, ${hydStore.rainLocation.lon.toFixed(3)}` : '');

const handleKostraImport = (data) => {
    store.setKostraGrid(data.raw, data.location);
    // Auto-switch to Euler if sensible?
    rainType.value = 'euler2';
};

const getKostraValue = (d, key) => {
  if (!store.kostraGrid) return '-';
  const row = store.kostraGrid[String(d)];
  return row ? row[key] : '-';
};

const generatedSeries = computed(() => {
  if (rainType.value === 'block') {
    return calculateBlockRain(intensity.value, duration.value, interval.value);
  } else if (rainType.value === 'euler2' && store.kostraGrid) {
    // Extract row for selected return period - map durations to intensity for this column
    const row = {};
    for (const d in store.kostraGrid) {
        if (store.kostraGrid[d][selectedReturnPeriod.value]) {
            row[d] = store.kostraGrid[d][selectedReturnPeriod.value];
        }
    }
    return calculateEulerType2(row, duration.value, interval.value);
  }
  return [];
});

const chartData = computed(() => {
  const series = generatedSeries.value;
  if (!series || !series.length) return null;
  return {
    labels: series.map(s => s.time + ' min'),
    datasets: [{
      label: 'Regenhöhe (mm)',
      data: series.map(s => s.height_mm !== undefined ? s.height_mm : (s.intensity * interval.value * 0.006)),
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
      legend: { display: false },
      tooltip: {
          callbacks: {
              label: (ctx) => `Höhe: ${ctx.raw.toFixed(2)} mm`
          }
      }
  }
};

const close = () => emit('close');

const apply = () => {
    // Save Config to Store
    const config = {
        duration: duration.value,
        interval: interval.value,
        returnPeriod: rainType.value === 'euler2' ? selectedReturnPeriod.value : null,
        intensity: intensity.value,
        type: rainType.value
    };
    store.setRainConfig(config);
    
    // Save Data Series
    store.setRainData(generatedSeries.value.map(s => ({
        time_sec: s.time * 60,
        value_mm: s.height_mm !== undefined ? s.height_mm : (s.intensity * interval.value * 0.006)
    })));

    emit('apply');
    close();
};

// Init from store
watch(() => props.isOpen, (val) => {
    if (val && store.rainConfig) {
        duration.value = store.rainConfig.duration || 60;
        interval.value = store.rainConfig.interval || 5;
        if(store.rainConfig.type) rainType.value = store.rainConfig.type;
        
        if(store.rainConfig.returnPeriod) {
            selectedReturnPeriod.value = store.rainConfig.returnPeriod;
        }
        if(store.rainConfig.intensity) {
            intensity.value = store.rainConfig.intensity;
        }
    }
});
</script>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(2px); }
.modal-content { background: #fff; width: 900px; height: 750px; border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; color: #2c3e50; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }

.modal-header { padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; }
.modal-body { flex: 1; display: flex; overflow: hidden; padding: 1.5rem; gap: 2rem; }

.config-section { width: 300px; flex-shrink: 0; overflow-y: auto; padding-right: 1rem; border-right: 1px solid #f0f0f0; }
.chart-section { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; gap: 1rem; }
.chart-container { flex: 1; min-height: 0; position: relative; }

/* Table Styles - Copied from Isybau */
.table-wrapper { flex-shrink: 0; max-height: 250px; display: flex; flex-direction: column; }
.table-scroll { overflow: auto; border: 1px solid #ddd; border-radius: 4px; }
.kostra-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.kostra-table th, .kostra-table td { padding: 0.3rem 0.5rem; border: 1px solid #eee; text-align: right; white-space: nowrap; }
.kostra-table th { background: #f8f9fa; position: sticky; top: 0; z-index: 1; text-align: center; }

.clickable-col:hover, .clickable-cell:hover { background-color: #e8f4f8; cursor: pointer; }
.active-col { background-color: #e3f2fd !important; border-left: 2px solid #3498db; border-right: 2px solid #3498db; }
.kostra-table th.active-col { border-top: 2px solid #3498db; color: #1976d2; }

/* Form Styles */
.form-group { margin-bottom: 1.5rem; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
.form-group input, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
.radio-group { display: flex; flex-direction: column; gap: 0.5rem; }
.form-row { display: flex; gap: 1rem; }

.btn-secondary { background: white; border: 1px solid #bdc3c7; padding: 0.5rem; border-radius: 4px; cursor: pointer; width: 100%; transition: background 0.2s;}
.btn-secondary:hover { background: #f1f2f6; }

.modal-footer { padding: 1rem; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 1rem; background: #f8f9fa; }
.primary-btn { background: #3498db; color: white; border: none; padding: 0.6rem 1.2rem; border-radius: 4px; cursor: pointer; font-weight: 500; }
.primary-btn:disabled { background: #bdc3c7; cursor: not-allowed; }
.close-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #95a5a6; }
.close-btn:hover { color: #e74c3c; }

.success-msg { color: #27ae60; font-size: 0.8rem; font-weight: bold; margin-bottom: 0.5rem; }
.hint { color: #e74c3c; font-size: 0.8rem; }
h4 { margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #7f8c8d; }

.raw-center-info {
    font-size: 0.8rem;
    background: #fdf2f2; /* Light red/orange hint of raw data */
    border: 1px dashed #e57373;
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    color: #c0392b;
}
.raw-center-info .label { font-weight: bold; display: block; margin-bottom: 0.2rem; }
.raw-center-info .values { font-family: monospace; }
</style>
