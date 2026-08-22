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

        <div class="reference-input-group">
            <div class="input-wrapper">
                <label>X / Longitude</label>
                <input type="number" step="0.0001" v-model.number="manualCoords.x" />
            </div>
            <div class="input-wrapper">
                <label>Y / Latitude</label>
                <input type="number" step="0.0001" v-model.number="manualCoords.y" />
            </div>
            <button class="devil-btn" @click="useKaiserslautern" title="Kaiserslautern (Default)">👹</button>
        </div>

        <div v-if="result" class="result-box">
          <h4>Ergebnis für {{ result.location.lat.toFixed(4) }}, {{ result.location.lon.toFixed(4) }}</h4>
          
          <div class="result-summary">
            <div class="result-value">
              <span class="label">Ausgewählt:</span>
              <span class="value">{{ selectedValue }} l/(s·ha)</span>
            </div>
            <button class="apply-btn" data-tutorial="kostra-uebernehmen" @click="applyResult">Übernehmen</button>
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
        <button class="primary-btn" data-tutorial="kostra-abrufen" @click="fetchData" :disabled="!selectedCRS || isFetching">
          {{ isFetching ? 'Lade...' : 'Daten abrufen' }}
        </button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useIsybauStore } from '../../store/index.js';

import { CRS_OPTIONS, transformToWGS84, fetchKostraData } from '../../utils/KostraService.js';
const store = useIsybauStore();

const props = defineProps({
  isOpen: Boolean,
  referencePoint: Object // { x, y }
});

const emit = defineEmits(['close', 'select', 'data-loaded']);

const selectedCRS = ref(CRS_OPTIONS[0].value);
// Extend options with WGS84 locally
const crsOptions = [...CRS_OPTIONS, { label: "WGS84 (GPS)", value: "EPSG:4326" }];

const isFetching = ref(false);
const result = ref(null);
const error = ref(null);
const manualCoords = ref({ x: 0, y: 0 });

// Init coords from prop, but allow manual edit
watch(() => props.referencePoint, (newVal) => {
    if (newVal) {
        manualCoords.value = { ...newVal };
    }
}, { immediate: true });

const useKaiserslautern = () => {
    // K-Town GPS Coordinates
    manualCoords.value = { x: 7.7690, y: 49.4447 };
    selectedCRS.value = 'EPSG:4326';
};

const close = () => {
  emit('close');
};

const fetchData = async () => {
  // Use manualCoords
  if (!manualCoords.value) {
    error.value = "Kein Referenzpunkt vorhanden.";
    return;
  }

  isFetching.value = true;
  error.value = null;
  result.value = null;

  try {
    const wgs84 = transformToWGS84(manualCoords.value.x, manualCoords.value.y, selectedCRS.value);
    
    if (wgs84) {
      const data = await fetchKostraData(wgs84[1], wgs84[0]);
      if (data) {
        result.value = {
          ...data,
          location: { lat: wgs84[1], lon: wgs84[0] }
        };
        if (data.raw) {
            store.updateKostraData(data.raw);
        }

        if (data.raw) {
            emit('data-loaded', data.raw);
        }
      } else {
        // fetchKostraData fängt API-Fehler intern ab und liefert null —
        // ohne diesen Zweig endet der Spinner kommentarlos.
        error.value = "KOSTRA-Abruf fehlgeschlagen (DWD-Dienst nicht erreichbar oder keine Daten für diesen Punkt).";
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
    
    // Update Store directly to trigger watchers
    // Directly update state to avoid HMR issues with missing actions
    store.rain.intensity = parseFloat(selectedValue.value);
    store.rain.method = 'kostra';
    
    emit('select', {
      value: selectedValue.value,
      duration: selectedCoords.value.duration,
      returnPeriodLabel: returnPeriodMap[key] || key
    });
    close();
  }
};
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
  backdrop-filter: blur(2px);
}

.modal-content {
  background: var(--isy-pixel-content-bg);
  border-radius: var(--isy-radius-lg);
  width: 90%;
  max-width: 500px;
  box-shadow: var(--isy-elev-3);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: var(--isy-space-4);
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
  padding: var(--isy-space-6);
}

.description {
  color: var(--isy-pixel-border);
  margin-bottom: var(--isy-space-6);
  font-size: var(--isy-fs-lg);
}

.reference-info {
  font-size: var(--isy-fs-md);
  color: var(--isy-pixel-text-dim);
  margin-bottom: var(--isy-space-4);
}

.result-box {
  background: var(--isy-pixel-border); color: var(--isy-pixel-green-bright);
  border: 1px solid var(--isy-pixel-text-dim);
  padding: var(--isy-space-4);
  border-radius: var(--isy-radius-sm);
  margin-top: var(--isy-space-4);
}

.result-box h4 {
  margin: 0 0 var(--isy-space-2) 0;
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  color: var(--isy-pixel-info-hover);
}

.result-value {
  font-size: var(--isy-fs-lg);
  font-weight: bold;
  color: var(--isy-pixel-green-bright);
  margin-bottom: var(--isy-space-2);
}

.source {
  font-size: var(--isy-fs-md);
  color: var(--isy-pixel-border);
  margin: 0;
}

.error-box {
  background: var(--isy-pixel-danger-soft);
  color: var(--isy-pixel-danger-soft-text);
  padding: var(--isy-space-4);
  border-radius: var(--isy-radius-sm);
  margin-top: var(--isy-space-4);
}


.primary-btn {
  background: var(--isy-pixel-bg);
  color: var(--isy-pixel-text);
  border: none;
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.15s;
}
.primary-btn:hover:not(:disabled) { background: var(--isy-pixel-border); }
.primary-btn:disabled { background: var(--isy-pixel-text-dim); cursor: not-allowed; }

.secondary-btn {
  background: transparent;
  border: 1px solid var(--isy-pixel-border);
  color: var(--isy-pixel-text-dim);
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.12s;
}
.secondary-btn:hover { background: var(--isy-pixel-content-bg); }

.result-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--isy-space-4);
}

.data-details {
  margin: var(--isy-space-4) 0;
  border: 1px solid var(--isy-pixel-text-dim);
  border-radius: var(--isy-radius-sm);
  background: var(--isy-pixel-content-bg);
}

.data-details summary {
  padding: var(--isy-space-2);
  cursor: pointer;
  background: var(--isy-pixel-content-bg);
  font-weight: 500;
}

.table-container {
  overflow-x: auto;
  padding: var(--isy-space-2);
}

.kostra-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--isy-fs-md);
}

.kostra-table th, .kostra-table td {
  padding: var(--isy-space-2);
  border: 1px solid var(--isy-pixel-text-dim);
  text-align: right;
}

.kostra-table th {
  background: var(--isy-pixel-content-raised);
  font-weight: 600;
  text-align: center;
}

.kostra-table tr:nth-child(even) {
  background: var(--isy-pixel-content-raised);
}

.apply-btn {
  background: var(--isy-pixel-bg);
  color: var(--isy-pixel-text);
  border: none;
  border-radius: var(--isy-radius-md);
  padding: var(--isy-space-2) var(--isy-space-4);
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  letter-spacing: 0.06em;
  cursor: pointer;
  width: auto;
  margin-top: 0;
  transition: background 0.15s;
}
.apply-btn:hover { background: var(--isy-pixel-border); }

.clickable-cell {
  cursor: pointer;
  transition: background 0.2s;
}

.clickable-cell:hover {
  background-color: var(--isy-pixel-content-bg);
}

.reference-input-group {
    display: flex;
    gap: var(--isy-space-2);
    align-items: flex-end;
    margin-bottom: var(--isy-space-4);
}

.input-wrapper {
    display: flex;
    flex-direction: column;
}

.input-wrapper label {
    font-size: var(--isy-fs-md);
    color: var(--isy-pixel-border);
    margin-bottom: var(--isy-space-1);
}

.input-wrapper input {
    padding: var(--isy-space-2);
    border: 1px solid var(--isy-pixel-text-dim);
    border-radius: var(--isy-radius-sm);
    width: 120px;
}

.devil-btn {
    background: var(--isy-pixel-content-bg);
    color: #E30613;
    border: 2px solid #E30613; /* FCK Red Border */
    border-radius: var(--isy-radius-sm);
    width: 36px;
    height: 36px;
    font-size: var(--isy-fs-xl); /* Slightly larger for the Ogre */
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    margin-bottom: var(--isy-space-1);
}

.devil-btn:hover {
    transform: scale(1.1);
    background: var(--isy-pixel-danger-soft); /* Light red tint */
    box-shadow: 0 0 5px rgba(227, 6, 19, 0.4);
}

.selected-cell {
  background-color: var(--isy-pixel-info) !important;
  color: white;
  font-weight: bold;
  border-color: var(--isy-pixel-info-hover);
}

</style>
