<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content">
      <div class="modal-header">
        <h3>KOSTRA-DWD Regendaten</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <div class="modal-body">
        <p class="description">
          Wählen Sie das Koordinatensystem Ihrer Daten, um die lokale Regenspende abzurufen.
        </p>

        <div class="form-group">
          <label>Koordinatensystem (CRS):</label>
          <select v-model="selectedCRS">
            <option v-for="opt in crsOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="reference-info" v-if="referencePoint">
          <p>Referenzpunkt: {{ referencePoint.x.toFixed(3) }} / {{ referencePoint.y.toFixed(3) }}</p>
        </div>

        <div v-if="result" class="result-box">
          <h4>Ergebnis für {{ result.location.lat.toFixed(4) }}, {{ result.location.lon.toFixed(4) }}</h4>
          
          <div class="result-summary">
            <div class="result-value">
              <span class="label">Ausgewählt:</span>
              <span class="value">{{ selectedValue }} l/(s·ha)</span>
            </div>
            <button class="apply-btn" @click="applyResult">Übernehmen</button>
          </div>

          <details class="data-details">
            <summary>Detaillierte Datentabelle anzeigen</summary>
            <div class="table-container">
              <table class="kostra-table">
                <thead>
                  <tr>
                    <th>Dauer</th>
                    <th>1 a</th>
                    <th>2 a</th>
                    <th>3 a</th>
                    <th>5 a</th>
                    <th>10 a</th>
                    <th>20 a</th>
                    <th>30 a</th>
                    <th>50 a</th>
                    <th>100 a</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in durations" :key="d">
                    <td>{{ d }} min</td>
                    <td 
                      v-for="key in ['RN_001A', 'RN_002A', 'RN_003A', 'RN_005A', 'RN_010A', 'RN_020A', 'RN_030A', 'RN_050A', 'RN_100A']" 
                      :key="key"
                      @click="selectValue(d, key)"
                      :class="{ 'selected-cell': isSelected(d, key) }"
                      class="clickable-cell"
                    >
                      {{ getValue(d, key) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
          
          <p class="source">Quelle: {{ result.source }}</p>
        </div>

        <div v-else-if="error" class="error-box">
          {{ error }}
        </div>
      </div>

      <div class="modal-footer">
        <button class="secondary-btn" @click="close">Abbrechen</button>
        <button class="primary-btn" @click="fetchData" :disabled="!selectedCRS || isFetching">
          {{ isFetching ? 'Lade...' : 'Daten abrufen' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
import { CRS_OPTIONS, transformToWGS84, fetchKostraData } from '../utils/KostraService';

const props = defineProps({
  isOpen: Boolean,
  referencePoint: Object // { x, y }
});

const emit = defineEmits(['close', 'select', 'data-loaded']);

const selectedCRS = ref(CRS_OPTIONS[0].value);
const crsOptions = CRS_OPTIONS;
const isFetching = ref(false);
const result = ref(null);
const error = ref(null);

const close = () => {
  emit('close');
  // Don't clear result immediately if we want to keep state? 
  // Actually usually modals clear on close.
  // But we want to persist data for the view.
};

const fetchData = async () => {
  if (!props.referencePoint) {
    error.value = "Kein Referenzpunkt vorhanden.";
    return;
  }

  isFetching.value = true;
  error.value = null;
  result.value = null;

  try {
    const wgs84 = transformToWGS84(props.referencePoint.x, props.referencePoint.y, selectedCRS.value);
    
    if (wgs84) {
      const data = await fetchKostraData(wgs84[1], wgs84[0]);
      if (data) {
        result.value = {
          ...data,
          location: { lat: wgs84[1], lon: wgs84[0] }
        };
        // Emit raw data for parent to use
        if (data.raw) {
            emit('data-loaded', data.raw);
        }
      }
    } else {
      error.value = "Transformation fehlgeschlagen. Bitte prüfen Sie das gewählte Koordinatensystem.";
    }
  } catch (e) {
    console.error(e);
    error.value = "Fehler beim Abrufen der Daten.";
  } finally {
    isFetching.value = false;
  }
};

const durations = [5, 10, 15, 20, 30, 45, 60, 90, 120]; // Common durations in min
const selectedValue = ref(null);
const selectedCoords = ref({ duration: 15, key: 'RN_001A' }); // Default selection

const getValue = (duration, key) => {
  if (!result.value || !result.value.raw) return '-';
  const row = result.value.raw[String(duration)];
  return row ? row[key] : '-';
};

const selectValue = (duration, key) => {
  const val = getValue(duration, key);
  if (val !== '-') {
    selectedValue.value = val;
    selectedCoords.value = { duration, key };
  }
};

const isSelected = (duration, key) => {
  return selectedCoords.value.duration === duration && selectedCoords.value.key === key;
};

// Initialize selection when result changes
watch(result, (newVal) => {
  if (newVal) {
    selectedValue.value = newVal.r_15_1;
    selectedCoords.value = { duration: 15, key: 'RN_001A' };
  }
});

const returnPeriodMap = {
  'RN_001A': '1 a',
  'RN_002A': '2 a',
  'RN_003A': '3 a',
  'RN_005A': '5 a',
  'RN_010A': '10 a',
  'RN_020A': '20 a',
  'RN_030A': '30 a',
  'RN_050A': '50 a',
  'RN_100A': '100 a'
};

const applyResult = () => {
  if (selectedValue.value) {
    const key = selectedCoords.value.key;
    emit('select', {
      value: selectedValue.value,
      duration: selectedCoords.value.duration,
      returnPeriodLabel: returnPeriodMap[key] || key
    });
    close();
  }
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
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h3 {
  margin: 0;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7f8c8d;
}

.modal-body {
  padding: 1.5rem;
}

.description {
  color: #7f8c8d;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #2c3e50;
}

.form-group select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.reference-info {
  font-size: 0.85rem;
  color: #95a5a6;
  margin-bottom: 1rem;
}

.result-box {
  background: #f0f9ff;
  border: 1px solid #bde0fe;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}

.result-box h4 {
  margin: 0 0 0.5rem 0;
  color: #2980b9;
}

.result-value {
  font-size: 1.2rem;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.source {
  font-size: 0.8rem;
  color: #7f8c8d;
  margin: 0;
}

.error-box {
  background: #fde8e8;
  color: #c0392b;
  padding: 1rem;
  border-radius: 4px;
  margin-top: 1rem;
}

.modal-footer {
  padding: 1rem;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.primary-btn, .apply-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.primary-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.secondary-btn {
  background: white;
  border: 1px solid #ddd;
  color: #7f8c8d;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.result-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.data-details {
  margin: 1rem 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.data-details summary {
  padding: 0.5rem;
  cursor: pointer;
  background: #f8f9fa;
  font-weight: 500;
}

.table-container {
  overflow-x: auto;
  padding: 0.5rem;
}

.kostra-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.kostra-table th, .kostra-table td {
  padding: 0.4rem;
  border: 1px solid #eee;
  text-align: right;
}

.kostra-table th {
  background: #f1f2f6;
  font-weight: 600;
  text-align: center;
}

.kostra-table tr:nth-child(even) {
  background: #fcfcfc;
}

.apply-btn {
  background: #27ae60;
  width: auto;
  margin-top: 0;
}

.clickable-cell {
  cursor: pointer;
  transition: background 0.2s;
}

.clickable-cell:hover {
  background-color: #e8f4f8;
}

.selected-cell {
  background-color: #3498db !important;
  color: white;
  font-weight: bold;
  border-color: #2980b9;
}
</style>
