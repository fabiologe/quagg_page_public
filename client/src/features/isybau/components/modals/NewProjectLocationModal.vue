<template>
  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay" @click.self="close">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Neu starten</h3>
          <button class="close-btn" @click="close">×</button>
        </div>

        <div class="modal-body">
          <p class="description">
            Wähle einen Startort, damit die EZG-Karte (Luftbild &amp; Höhenlinien)
            von Anfang an sichtbar ist, während du dein Netz zeichnest.
          </p>

          <div class="mode-tabs">
            <button
              class="mode-tab"
              :class="{ active: mode === 'search' }"
              @click="mode = 'search'"
            >Adresse suchen</button>
            <button
              class="mode-tab"
              :class="{ active: mode === 'manual' }"
              @click="mode = 'manual'"
            >Koordinaten eingeben</button>
          </div>

          <!-- Modus 1: Adresssuche (Nominatim, wie BaseMap.vue) -->
          <div v-if="mode === 'search'">
            <div class="search-row">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Adresse oder Ort suchen…"
                :disabled="isSearching"
                @keyup.enter="searchAddress"
              />
              <button class="secondary-btn" @click="searchAddress" :disabled="isSearching || !searchQuery">
                {{ isSearching ? '…' : 'Suchen' }}
              </button>
            </div>

            <p v-if="foundPlace" class="found-place">📍 {{ foundPlace.label }}</p>

            <div class="form-group">
              <label>Koordinatensystem (Ziel):</label>
              <select v-model="selectedCRS">
                <option v-for="opt in CRS_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Modus 2: Manuelle Eingabe (Fallback, falls Suche nichts findet
               oder man schon präzise Koordinaten hat) -->
          <div v-else>
            <p class="description small">
              Fallback, falls die Suche nichts Passendes findet oder du schon
              genaue Koordinaten hast (Vermessung, GPS-Gerät).
            </p>

            <div class="form-group">
              <label>Format der eingegebenen Werte:</label>
              <select v-model="manualCRS">
                <option v-for="opt in manualCrsOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div class="manual-coords-group">
              <div class="input-wrapper">
                <label>{{ manualCRS === 'EPSG:4326' ? 'X / Longitude' : 'X / Rechtswert' }}</label>
                <input type="number" step="0.0001" v-model.number="manualCoords.x" />
              </div>
              <div class="input-wrapper">
                <label>{{ manualCRS === 'EPSG:4326' ? 'Y / Latitude' : 'Y / Hochwert' }}</label>
                <input type="number" step="0.0001" v-model.number="manualCoords.y" />
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" @click="close">Abbrechen</button>
          <button class="primary-btn" @click="confirm" :disabled="!canConfirm">Bestätigen &amp; Loslegen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import axios from 'axios';
import proj4 from 'proj4';
import { CRS_OPTIONS } from '../../utils/KostraService.js';

const props = defineProps({
  isOpen: Boolean
});

const emit = defineEmits(['close', 'confirm']);

const mode = ref('search');

// --- Modus 1: Adresssuche (identisches Muster zu BaseMap.vue searchAddress) ---
const searchQuery = ref('');
const isSearching = ref(false);
const foundPlace = ref(null); // { label, lat, lon }
const selectedCRS = ref(CRS_OPTIONS[0].value);

// Deutschland grob: UTM32N westlich, UTM33N östlich von 12°E.
function defaultCrsForLon(lon) {
  return lon < 12 ? 'EPSG:25832' : 'EPSG:25833';
}

async function searchAddress() {
  if (!searchQuery.value) return;
  isSearching.value = true;
  foundPlace.value = null;
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: searchQuery.value, format: 'json', limit: 1 }
    });
    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      foundPlace.value = { label: result.display_name, lat, lon };
      selectedCRS.value = defaultCrsForLon(lon);
    } else {
      alert('Adresse nicht gefunden');
    }
  } catch (e) {
    console.error('Search failed:', e);
    alert('Fehler bei der Suche');
  } finally {
    isSearching.value = false;
  }
}

// --- Modus 2: Manuelle Eingabe ---
// Lokal um WGS84 erweitert (gleiches Muster wie KostraModal.vue/EzgCrsConfirmModal.vue)
// — CRS_OPTIONS selbst bleibt unangetastet. Hier gibt der Dropdown das FORMAT
// der eingetippten Zahlen an, nicht das Ziel-CRS (das ergibt sich bei WGS84
// automatisch aus dem Längengrad, siehe confirm()).
const manualCrsOptions = [...CRS_OPTIONS, { label: 'WGS84 (GPS)', value: 'EPSG:4326' }];
const manualCRS = ref(CRS_OPTIONS[0].value);
const manualCoords = ref({ x: 0, y: 0 });

const canConfirm = computed(() => {
  if (mode.value === 'search') return !!foundPlace.value;
  return Number.isFinite(manualCoords.value.x) && Number.isFinite(manualCoords.value.y);
});

function close() {
  emit('close');
}

function confirm() {
  if (!canConfirm.value) return;

  if (mode.value === 'search') {
    const [x, y] = proj4('EPSG:4326', selectedCRS.value, [foundPlace.value.lon, foundPlace.value.lat]);
    emit('confirm', { epsg: selectedCRS.value, x, y, label: foundPlace.value.label });
    return;
  }

  // Manueller Modus
  if (manualCRS.value === 'EPSG:4326') {
    const lon = manualCoords.value.x;
    const lat = manualCoords.value.y;
    const epsg = defaultCrsForLon(lon);
    const [x, y] = proj4('EPSG:4326', epsg, [lon, lat]);
    emit('confirm', { epsg, x, y, label: `Manuell (${lat.toFixed(4)}, ${lon.toFixed(4)})` });
  } else {
    const epsg = manualCRS.value;
    const label = CRS_OPTIONS.find((o) => o.value === epsg)?.label || epsg;
    emit('confirm', { epsg, x: manualCoords.value.x, y: manualCoords.value.y, label: `Manuell (${label})` });
  }
}

// Reset bei jedem erneuten Öffnen, damit ein alter Suchtreffer nicht
// versehentlich ein zweites Mal bestätigt werden kann.
watch(() => props.isOpen, (open) => {
  if (open) {
    mode.value = 'search';
    searchQuery.value = '';
    foundPlace.value = null;
    selectedCRS.value = CRS_OPTIONS[0].value;
    manualCRS.value = CRS_OPTIONS[0].value;
    manualCoords.value = { x: 0, y: 0 };
  }
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
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 460px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 1rem;
}

.modal-header h3 {
  font-family: var(--isy-pixel-font);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0;
  color: var(--isy-pixel-text-dim, #4a4a4a);
}

.modal-body {
  padding: 1.5rem;
}

.description {
  color: var(--isy-pixel-border, #4a4844);
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.description.small {
  font-size: 0.82rem;
  margin-bottom: 1rem;
}

.mode-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--isy-pixel-text-dim, #4a4a4a);
}

.mode-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.5rem 0.25rem;
  cursor: pointer;
  color: var(--isy-pixel-border-hover, #65625c);
  font-size: 0.85rem;
  font-weight: 500;
  transition: color 0.15s, border-color 0.15s;
}

.mode-tab.active {
  color: var(--isy-pixel-green, #219653);
  border-bottom-color: var(--isy-pixel-green, #219653);
}

.search-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.search-row input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--isy-pixel-text-dim, #4a4a4a);
  border-radius: 4px;
  font-size: 1rem;
}

.found-place {
  font-size: 0.85rem;
  background: var(--isy-pixel-border, #4a4844);
  color: var(--isy-pixel-green-bright, #18a34a);
  border-radius: 4px;
  padding: 0.5rem;
  margin: 0 0 1rem;
}

.manual-coords-group {
  display: flex;
  gap: 0.75rem;
}

.input-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.input-wrapper label {
  font-size: 0.8rem;
  color: var(--isy-pixel-border, #4a4844);
  margin-bottom: 0.2rem;
}

.input-wrapper input {
  padding: 0.5rem;
  border: 1px solid var(--isy-pixel-text-dim, #4a4a4a);
  border-radius: 4px;
  width: 100%;
  box-sizing: border-box;
}

.primary-btn {
  background: var(--isy-pixel-bg, #040647);
  color: var(--isy-pixel-text, #fff);
  border: none;
  border-radius: 6px;
  padding: 0.55rem 1rem;
  font-family: var(--isy-pixel-font);
  font-size: 0.52rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.15s;
}
.primary-btn:hover:not(:disabled) { background: var(--isy-pixel-border, #4a4844); }
.primary-btn:disabled { background: var(--isy-pixel-text-dim, #4a4a4a); cursor: not-allowed; }

.secondary-btn {
  background: transparent;
  border: 1px solid var(--isy-pixel-border, #4a4844);
  color: var(--isy-pixel-text-dim, #4a4a4a);
  border-radius: 6px;
  padding: 0.55rem 1rem;
  font-family: var(--isy-pixel-font);
  font-size: 0.52rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.12s;
}
.secondary-btn:hover:not(:disabled) { background: var(--isy-pixel-content-bg, #f3f2fb); }
.secondary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
