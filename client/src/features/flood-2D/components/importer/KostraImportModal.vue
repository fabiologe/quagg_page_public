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
             <h4>Gefunden: {{ result.location.lat.toFixed(4) }}, {{ result.location.lon.toFixed(4) }}</h4>
             <p>Daten liegen vor. Klicken Sie auf Übernehmen, um diese Regendaten für das Szenario zu verwenden.</p>
             <button class="apply-btn" @click="applyResult">Übernehmen</button>
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
import { ref, watch, onMounted } from 'vue';
import proj4 from 'proj4';
import { CRS_OPTIONS, transformToWGS84, fetchKostraGrid } from '../../utils/KostraHelper.js';

// Explicitly register defs to ensure they are available in this component's scope
// (Redundant but safe)
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31466", "+proj=tmerc +lat_0=0 +lon_0=6 +k=1 +x_0=2500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31467", "+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31468", "+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");
proj4.defs("EPSG:31469", "+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=5500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs +type=crs");

const props = defineProps({
  isOpen: Boolean,
  referencePoint: Object 
});

const emit = defineEmits(['close', 'import']);

// Match Isybau: Append WGS84 locally
const crsOptions = [...CRS_OPTIONS, { label: "WGS84 (GPS)", value: "EPSG:4326" }];
const selectedCRS = ref(CRS_OPTIONS[0].value);

const isFetching = ref(false);
const result = ref(null);
const error = ref(null);
// Default Init to 0,0 like Isybau
const manualCoords = ref({ x: 0, y: 0 });

const useKaiserslautern = () => {
    manualCoords.value = { x: 7.7690, y: 49.4447 };
    selectedCRS.value = 'EPSG:4326';
};

// Simple Watcher (Copy Only) - Like Isybau
watch(() => props.referencePoint, (newVal) => {
    if (newVal) {
         manualCoords.value = { x: newVal.x, y: newVal.y };
         // Isybau does NOT update CRS here.
         // It implies usage of default (UTM) or manual user switch.
    }
}, { immediate: true });

const close = () => {
  emit('close');
};

const fetchData = async () => {
    isFetching.value = true;
    error.value = null;
    result.value = null;
    
    try {
         console.log(`[KostraImport] Fetching for X=${manualCoords.value.x}, Y=${manualCoords.value.y}, CRS=${selectedCRS.value}`);
         
         const wgs84 = transformToWGS84(manualCoords.value.x, manualCoords.value.y, selectedCRS.value);
         console.log(`[KostraImport] Transformed:`, wgs84);

         if(!wgs84 || !Number.isFinite(wgs84[0]) || !Number.isFinite(wgs84[1])) {
             throw new Error(`Transformation fehlgeschlagen für ${manualCoords.value.x}/${manualCoords.value.y}`);
         }

         // Fetch Full Grid (Order: Lat, Lon)
         const data = await fetchKostraGrid(wgs84[1], wgs84[0]);
         
         result.value = data;
    } catch(e) {
        console.error("[KostraImport] Error:", e);
        error.value = e.message || "Fehler beim Abrufen.";
    } finally {
        isFetching.value = false;
    }
};

const applyResult = () => {
    if(result.value) {
        emit('import', result.value); // { raw, location }
        close();
    }
};

</script>

<style scoped>
/* Reuse styles from KostraModal reference broadly */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(2px); }
.modal-content { background: #fff; width: 90%; max-width: 500px; border-radius: 8px; overflow: hidden; color: #2c3e50; }
.modal-header { padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
.modal-body { padding: 1.5rem; }
.modal-footer { padding: 1rem; background: #f9f9f9; display: flex; justify-content: flex-end; gap: 1rem; }
.close-btn { background:none; border:none; font-size:1.5rem; cursor:pointer;}
h3 { margin:0; }

.form-group { margin-bottom: 1rem; }
label { display: block; margin-bottom: 0.5rem; font-weight: 500; font-size: 0.9rem;}
select, input { width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }

.reference-input-group { display: flex; gap: 0.5rem; align-items: flex-end; }
.input-wrapper { flex: 1; }

.devil-btn {
    background: white;
    color: #E30613;
    border: 2px solid #E30613; /* FCK Red Border */
    border-radius: 4px;
    width: 36px;
    height: 36px;
    font-size: 1.4rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    margin-bottom: 1px;
}
.devil-btn:hover {
    transform: scale(1.1);
    background: #fff5f5;
    box-shadow: 0 0 5px rgba(227, 6, 19, 0.4);
}

.primary-btn { background: #3498db; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.primary-btn:disabled { background: #95a5a6; cursor: not-allowed; }
.secondary-btn { background: white; border: 1px solid #bdc3c7; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }

.result-box { background: #eafaf1; border: 1px solid #2ecc71; padding: 1rem; border-radius: 4px; margin-top: 1rem;}
.apply-btn { background: #27ae60; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; display: block; width: 100%; margin-top: 0.5rem;}
.error-box { background: #fdedec; color: #c0392b; padding: 1rem; margin-top: 1rem; border-radius: 4px; }
</style>
