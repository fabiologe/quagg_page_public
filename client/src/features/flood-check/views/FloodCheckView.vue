<template>
  <div class="flood-check-view">
    <div class="map-section" :class="{ 'export-mode': isExporting }">
      <BaseMap 
        ref="mapRef"
        :polygon-styles="mapStyles" 
        @update="store.addOrUpdateSurface" 
        @delete="store.removeSurface" 
        @select="handleSurfaceSelect"
      />
      <Transition name="fade">
        <div v-if="showInstruction" class="map-overlay">
          <p><strong>Anleitung:</strong> Nutzen Sie das Polygon-Werkzeug (links oben), um Flächen einzuzeichnen.</p>
        </div>
      </Transition>
    </div>

    <div class="tools-section">
      <div class="tools-header">
        <h2>Überflutungsnachweis</h2>
        <p class="subtitle">Berechnung nach DIN 1986-100</p>
      </div>
      
      <div class="rain-data-section">
        <div class="section-header">
          <h3>Regendaten (KOSTRA-DWD 2020)</h3>
          <button class="fetch-btn" @click="fetchRainData" :disabled="store.isLoadingKostra">
            {{ store.isLoadingKostra ? 'Lade...' : '📍 Daten für Kartenmitte laden' }}
          </button>
        </div>
        
        <div class="rain-inputs">
          <div class="input-group">
            <label>r<sub>5,2</sub> (l/(s*ha))</label>
            <input type="number" v-model.number="store.rainData.r5_2" />
          </div>
          <div class="input-group">
            <label>r<sub>5,30</sub> (l/(s*ha))</label>
            <input type="number" v-model.number="store.rainData.r5_30" />
          </div>
          <div class="input-group">
            <label>r<sub>5,100</sub> (l/(s*ha))</label>
            <input type="number" v-model.number="store.rainData.r5_100" readonly class="readonly-input" title="Für Notentwässerung" />
          </div>
        </div>
        <a href="https://www.openko.de/maps/kostra_dwd_2020.html#7/50.573/10.39" target="_blank" class="kostra-link">
          Karte öffnen ↗
        </a>
      </div>

      <!-- Zusätzliche Nachweise -->
      <div class="additional-checks-section">
        <h3>Zusätzliche Nachweise</h3>
        
        <!-- Hydraulisch -->
        <div class="check-item">
          <label class="check-label">
            <input type="checkbox" v-model="store.additionalCalculations.hydraulic.active">
            <span>Hydraulischer Nachweis (Formel 21)</span>
          </label>
          <div v-if="store.additionalCalculations.hydraulic.active" class="check-details">
            <div class="input-group">
              <label>Q<sub>voll</sub> (l/s) - Rohrleistung</label>
              <input type="number" v-model.number="store.additionalCalculations.hydraulic.qVoll" placeholder="0.0">
            </div>
          </div>
        </div>

        <!-- Drossel -->
        <div class="check-item">
          <label class="check-label">
            <input type="checkbox" v-model="store.additionalCalculations.throttle.active">
            <span>Behördliche Drosselung (Formel 22)</span>
          </label>
          <div v-if="store.additionalCalculations.throttle.active" class="check-details">
            <div class="input-group">
              <label>Q<sub>Dr</sub> (l/s) - Drosselabfluss</label>
              <input type="number" v-model.number="store.additionalCalculations.throttle.qDr" placeholder="0.0">
            </div>
            <div class="input-group">
              <label>f<sub>Z</sub> - Sicherheitsfaktor</label>
              <input type="number" v-model.number="store.additionalCalculations.throttle.safetyFactor" step="0.05">
            </div>
          </div>
        </div>
      </div>

      <div class="surfaces-list">
        <div v-if="store.surfaces.length === 0" class="empty-hint">
          <p>Keine Flächen vorhanden.</p>
          <small>Nutzen Sie das Werkzeug links oben.</small>
        </div>

        <div 
          v-for="surface in store.surfaces" 
          :key="surface.id" 
          class="surface-card"
          :class="{ 'selected': selectedSurfaceId === surface.id }"
          :ref="el => { if(el) surfaceRefs[surface.id] = el }"
        >
          <div class="surface-header">
            <input v-model="surface.name" class="name-input" placeholder="Name..." />
            <span class="area-badge">{{ surface.area }} m²</span>
          </div>
          
          <div class="surface-type">
            <label>Oberfläche:</label>
            <select v-model="surface.typeId">
              <option v-for="t in store.surfaceTypes" :key="t.id" :value="t.id">
                {{ t.name }} (Cs: {{ t.cs }})
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="calculation-box">
        <div class="result-grid">
          <div class="res-item">
            <span class="label">Gesamtfläche</span>
            <span class="value">{{ store.totalArea.toFixed(2) }} m²</span>
          </div>
          <div class="res-item">
            <span class="label">Effektiv (A<sub>u</sub>)</span>
            <span class="value">{{ store.totalEffectiveArea.toFixed(2) }} m²</span>
          </div>
        </div>
        
        <div class="divider"></div>

        <!-- Standard Ergebnis -->
        <div class="result-row">
          <span>Standard (Formel 20):</span>
          <strong>{{ store.retentionVolumeStandard.toFixed(2) }} m³</strong>
        </div>

        <!-- Hydraulisch Ergebnis -->
        <div v-if="store.additionalCalculations.hydraulic.active" class="result-row secondary">
          <span>Hydraulisch (Formel 21):</span>
          <strong>{{ store.retentionVolumeHydraulic.toFixed(2) }} m³</strong>
        </div>

        <!-- Drossel Ergebnis -->
        <div v-if="store.additionalCalculations.throttle.active" class="result-row secondary">
          <span>Gedrosselt (Formel 22):</span>
          <strong>{{ store.retentionVolumeThrottle.toFixed(2) }} m³</strong>
        </div>
        
        <div class="export-actions">
          <BaseButton variant="secondary" class="export-btn" @click="exportCalculation">
            📄 Bericht (Berechnung)
          </BaseButton>
          <BaseButton variant="primary" class="export-btn" @click="exportMap">
            🗺️ Lageplan (Karte)
          </BaseButton>
          <BaseButton variant="secondary" class="export-btn" @click="exportGeoJSON">
            💾 GeoJSON
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import BaseMap from '@/components/base/BaseMap.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import { useFloodCheckStore } from '../stores/useFloodCheckStore'
import { FloodReportService } from '../services/FloodReportService'

const store = useFloodCheckStore()
const showInstruction = ref(true)
const isExporting = ref(false)
const mapRef = ref(null)
const map = ref(null) // Added
const mapContainer = ref(null) // Added
const selectedSurfaceId = ref(null)
const surfaceRefs = ref({})

function handleSurfaceSelect(id) {
  selectedSurfaceId.value = id
  
  // Scroll into view
  const el = surfaceRefs.value[id]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function fetchRainData() {
  const currentMap = mapRef.value?.getMap()
  if (!currentMap) return
  const center = currentMap.getCenter()
  store.fetchKostraData(center.lat, center.lng)
}

onMounted(() => {
  setTimeout(() => {
    showInstruction.value = false
  }, 10000)
})

const mapStyles = computed(() => {
  return store.surfaces.map(surface => {
    const typeDef = store.surfaceTypes.find(t => t.id === surface.typeId)
    return {
      id: surface.id,
      color: typeDef ? typeDef.color : '#3498db'
    }
  })
})

function exportCalculation() {
  FloodReportService.generateCalculationPdf(store)
}

async function exportMap() {
  isExporting.value = true
  await nextTick()
  
  // Get map instance and fit bounds to all surfaces
  const map = mapRef.value?.getMap()
  const editableLayers = mapRef.value?.getEditableLayers()
  
  if (map && editableLayers) {
    const bounds = editableLayers.getBounds()
    if (bounds.isValid()) {
      // Fit map to show all surfaces with some padding
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }
  
  // Give map time to animate and render
  setTimeout(async () => {
    const mapEl = document.querySelector('.map-section')
    await FloodReportService.generateMapPdf(mapEl)
    isExporting.value = false
  }, 1000)
}

function exportGeoJSON() {
  const editableLayers = mapRef.value?.getEditableLayers()
  if (!editableLayers) return

  const geoJSON = editableLayers.toGeoJSON()
  
  // Merge store data into properties
  geoJSON.features = geoJSON.features.map(feature => {
    const surface = store.surfaces.find(s => s.id === feature.id)
    if (surface) {
      const typeDef = store.surfaceTypes.find(t => t.id === surface.typeId)
      feature.properties = {
        ...feature.properties,
        name: surface.name,
        type: surface.typeId,
        typeName: typeDef?.name,
        cs: typeDef?.cs,
        area: surface.area
      }
    }
    return feature
  })

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geoJSON, null, 2))
  const downloadAnchorNode = document.createElement('a')
  downloadAnchorNode.setAttribute("href", dataStr)
  downloadAnchorNode.setAttribute("download", "flood_check_surfaces.geojson")
  document.body.appendChild(downloadAnchorNode) // required for firefox
  downloadAnchorNode.click()
  downloadAnchorNode.remove()
}
</script>

<style scoped>
.flood-check-view {
  display: grid;
  grid-template-columns: 65% 35%;
  height: calc(100vh - 64px);
  overflow: hidden;
}

/* Hide elements during export */
/* Hide elements during export */
.export-mode :deep(.map-overlay),
.export-mode :deep(.search-overlay),
.export-mode :deep(.leaflet-control-container) {
  display: none !important;
}

.map-section {
  position: relative;
  height: 100%;
}

.map-overlay {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  padding: 0.75rem 1.5rem;
  border-radius: 50px;
  font-size: 0.9rem;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  pointer-events: none;
  z-index: 1000;
}

.tools-section {
  padding: 1.5rem;
  background: #f8f9fa;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tools-header h2 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.subtitle {
  color: #7f8c8d;
  margin: 0 0 1.5rem 0;
  font-size: 0.9rem;
}

.rain-data-section {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #2c3e50;
}

.fetch-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}

.fetch-btn:hover {
  background: #2980b9;
}

.fetch-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.rain-inputs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.readonly-input {
  background-color: #f8f9fa;
  color: #7f8c8d;
  cursor: default;
}

.input-group {
  display: flex;
  flex-direction: column;
}

.input-group label {
  font-size: 0.8rem;
  color: #7f8c8d;
  margin-bottom: 0.25rem;
}

.input-group input {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
}

.kostra-link {
  display: block;
  text-align: center;
  color: #3498db;
  text-decoration: none;
  font-size: 0.9rem;
  padding: 0.5rem;
  border: 1px dashed #3498db;
  border-radius: 4px;
  transition: background 0.2s;
}

.kostra-link:hover {
  background: #f0f8ff;
}

.surfaces-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
  margin-bottom: 1rem;
}

.empty-hint {
  text-align: center;
  color: #95a5a6;
  padding: 2rem;
  border: 2px dashed #e0e0e0;
  border-radius: 8px;
}

.surface-card {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  border-left: 4px solid transparent;
  transition: border-color 0.2s;
}

.surface-card:hover {
  border-left-color: #3498db;
}

.surface-card.selected {
  border-left-color: #e74c3c;
  background-color: #fdf2f2;
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.surface-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.name-input {
  border: none;
  font-weight: bold;
  font-size: 1rem;
  width: 60%;
  background: transparent;
}

.name-input:focus {
  outline: none;
  border-bottom: 2px solid #3498db;
}

.area-badge {
  background: #e1f0fa;
  color: #2980b9;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background-color: #fff;
}

.calculation-box {
  background: #2c3e50;
  color: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 -4px 15px rgba(0,0,0,0.1);
  margin-top: auto;
}

.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.res-item {
  display: flex;
  flex-direction: column;
}
/* Additional Checks */
.additional-checks-section {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.additional-checks-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
  color: #2c3e50;
}

.check-item {
  margin-bottom: 1rem;
  border-bottom: 1px solid #f0f0f0;
  padding-bottom: 1rem;
}

.check-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.check-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-weight: 500;
  color: #34495e;
}

.check-label input {
  width: 16px;
  height: 16px;
}

.check-details {
  margin-top: 0.75rem;
  padding-left: 1.5rem;
  display: grid;
  gap: 0.5rem;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
  color: white;
}

.result-row.secondary {
  font-size: 0.95rem;
  opacity: 0.9;
  border-top: 1px dashed rgba(255,255,255,0.2);
  padding-top: 0.5rem;
}

.export-actions {
  margin-top: 1.5rem;
}

.res-item .label {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-bottom: 0.2rem;
}

.res-item .value {
  font-size: 1.1rem;
  font-weight: bold;
}

.divider {
  height: 1px;
  background: rgba(255,255,255,0.2);
  margin: 0.5rem 0 1rem 0;
}

.result-row.highlight {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
  color: #f1c40f;
}

.info-text {
  font-size: 0.75rem;
  opacity: 0.6;
  margin-bottom: 1rem;
  line-height: 1.4;
}

.export-actions {
  display: flex;
  gap: 0.5rem;
}

.export-btn {
  flex: 1;
  font-size: 0.8rem !important;
  padding: 0.5rem !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .flood-check-view {
    display: flex;
    flex-direction: column;
    height: auto;
    overflow: visible;
  }

  .map-section {
    height: 400px;
  }

  .tools-section {
    height: auto;
    overflow: visible;
    border-left: none;
    border-top: 1px solid #e0e0e0;
  }

  .surfaces-list {
    overflow: visible;
    max-height: 300px; /* Limit height on mobile but allow scroll */
    overflow-y: auto;
  }

  .rain-inputs {
    grid-template-columns: 1fr;
  }

  .export-actions {
    flex-direction: column;
  }

  .export-btn {
    width: 100%;
  }
}
</style>