<template>
  <div class="flood-wave-view">
    <div class="map-section">
      <BaseMap 
        ref="mapRef"
        :draw-options="{ polygon: true, polyline: true, rectangle: false, circle: false, marker: false, circlemarker: false }"
        :polygon-styles="store.mapStyles"
        @update="handleMapUpdate"
        @delete="handleMapDelete"
      />
      <div class="map-overlay-info" v-if="store.riverLength > 0">
        Fließlänge: {{ (store.riverLength / 1000).toFixed(3) }} km
      </div>
    </div>

    <div class="tools-section">
      <div class="tools-header">
        <h2>Hochwasserwelle HQ100</h2>
        <p class="subtitle">Berechnung nach SCS-Verfahren & Lineare Speicherkaskade</p>
      </div>

      <div class="scroll-container">
        <!-- 1. Geometry / Tc -->
        <div class="section-card">
          <h3>1. Einzugsgebiet & Konzentrationszeit</h3>
          
          <div class="input-group">
            <label>Fließlänge L<sub>f</sub> (km)</label>
            <div class="input-with-action">
              <input type="number" v-model.number="store.params.Lf" step="0.01" placeholder="Zeichnen oder eingeben">
              <button class="small-btn" @click="startDrawRiver" title="Fluss zeichnen (Polyline)">
                ✏️ Fluss zeichnen
              </button>
            </div>
            <small v-if="store.riverLength > 0" class="hint">Gezeichnet: {{ (store.riverLength/1000).toFixed(3) }} km (übernommen)</small>
          </div>

          <div class="input-group">
            <label>Höhendifferenz &Delta;h (m)</label>
            <div class="input-with-action">
              <input type="number" v-model.number="store.params.deltaH" step="0.1">
              <button class="small-btn" @click="fetchElevation" :disabled="!store.riverCoords || store.isLoadingElevation" title="Höhendifferenz aus Karte ermitteln">
                ⛰️
              </button>
            </div>
          </div>

          <div class="result-display">
            <span>T<sub>c</sub> (Konzentrationszeit):</span>
            <strong>{{ store.tcResult.toFixed(2) }} h</strong>
          </div>
        </div>

        <!-- 2. Areas & CN -->
        <div class="section-card">
          <h3>2. Flächen & CN-Werte</h3>
          <div v-if="store.areas.length === 0" class="empty-state">
            <p>Keine Flächen definiert. Zeichnen oder GeoJSON droppen.</p>
            <button v-if="store.riverLength > 0" class="magic-btn" @click="estimateArea">
              <span>🪄</span> Einzugsgebiet schätzen
            </button>
          </div>
          <div v-else class="area-list">
            <div v-for="area in store.areas" :key="area.id" class="area-item">
              <div class="area-info">
                <span class="area-name">{{ area.name || 'Fläche' }}</span>
                <span class="area-size">{{ (area.area / 10000).toFixed(2) }} ha</span>
              </div>
              <div class="area-cn">
                <label>CN:</label>
                <input type="number" v-model.number="area.cn" min="0" max="100">
              </div>
            </div>
            <div class="total-area">
              Gesamt: {{ (store.totalArea / 10000).toFixed(2) }} ha | Misch-CN: {{ store.weightedCN.toFixed(1) }}
            </div>
          </div>
        </div>

        <!-- 3. Rain -->
        <div class="section-card">
          <h3>3. Niederschlag (T=100a)</h3>
          <div class="rain-actions">
            <button class="fetch-btn" @click="fetchKostra" :disabled="store.isLoadingKostra">
              {{ store.isLoadingKostra ? 'Lade...' : 'KOSTRA Daten laden' }}
            </button>
          </div>
          
          <div class="input-group">
            <label>Niederschlagshöhe P (mm)</label>
            <input type="number" v-model.number="store.params.P" step="0.1">
          </div>
          <div class="input-group">
            <label>Dauer D (min)</label>
            <select v-model.number="store.params.D">
              <option v-for="d in store.availableDurations" :key="d" :value="d">
                {{ d }} min
              </option>
            </select>
          </div>
        </div>

        <!-- 4. Parameters -->
        <div class="section-card">
          <h3>4. Modellparameter</h3>
          <div class="grid-2">
            <div class="input-group">
              <label>Basisabfluss (l/s*km²)</label>
              <input type="number" v-model.number="store.params.qBase" step="1">
            </div>
            <div class="input-group">
              <label>Speicherkoeffizient k (h)</label>
              <input type="number" v-model.number="store.params.k" step="0.1">
            </div>
            <div class="input-group">
              <label>Kaskaden n</label>
              <input type="number" v-model.number="store.params.n" step="1" min="1">
            </div>
             <div class="input-group">
              <label>Drosselabfluss Q<sub>Dr</sub> (l/s)</label>
              <input type="number" v-model.number="store.params.qDr" step="0.1">
            </div>
          </div>
        </div>

        <button class="calc-btn" @click="calculate">
          🌊 Berechnen
        </button>

        <!-- Results -->
        <div v-if="store.results.hydrograph.length > 0" class="results-section">
          <div class="kpi-grid">
            <div class="kpi-card">
              <span class="label">Q<sub>max</sub></span>
              <span class="value">{{ store.results.qMax.toFixed(3) }} m³/s</span>
            </div>
            <div class="kpi-card">
              <span class="label">V<sub>erf</sub></span>
              <span class="value">{{ store.results.vReq.toFixed(0) }} m³</span>
            </div>
          </div>
          
          <div class="chart-box">
            <h4>Ganglinie</h4>
            <div class="chart-wrapper">
              <HydrographChart 
                :hydrograph="store.results.hydrograph" 
                :q-max="store.results.qMax"
              />
            </div>
          </div>
        </div>

        <!-- Export -->
        <div v-if="store.results.hydrograph.length > 0" class="section-card export-card">
          <h3>Bericht</h3>
          <button class="export-btn" @click="exportReport">
            📄 PDF Bericht erstellen
          </button>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import BaseMap from '@/components/base/BaseMap.vue'
import HydrographChart from '../components/HydrographChart.vue'
import { useFloodWaveStore } from '../stores/useFloodWaveStore'
import { FloodWaveReportService } from '../services/FloodWaveReportService'
import L from 'leaflet'
import area from '@turf/area'
import length from '@turf/length'

const store = useFloodWaveStore()
const mapRef = ref(null)

// Map Handlers
function handleMapUpdate(geoJSON) {
  if (geoJSON.geometry.type === 'LineString') {
    // It's the river
    const len = length(geoJSON, { units: 'kilometers' }) * 1000 // meters
    
    // Extract start and end coordinates (GeoJSON is [lng, lat])
    const coords = geoJSON.geometry.coordinates
    let riverCoords = null
    if (coords.length >= 2) {
      const start = coords[0] // [lng, lat]
      const end = coords[coords.length - 1] // [lng, lat]
      riverCoords = {
        start: [start[1], start[0]],
        end: [end[1], end[0]]
      }
    }
    store.updateRiver(len, riverCoords)
    
  } else if (geoJSON.geometry.type === 'Polygon') {
    // It's an area
    const a = area(geoJSON)
    const name = geoJSON.properties?.name || `Fläche ${store.areas.length + 1}`
    const cn = geoJSON.properties?.cn || 60
    store.addOrUpdateArea(geoJSON.id, name, a, cn)
  }
}

function handleMapDelete(id) {
  store.removeArea(id)
  // If river is deleted, we might want to reset length, but BaseMap doesn't distinguish easily.
  // We could check if store.areas has changed.
}

function startDrawRiver() {
  if (mapRef.value) {
    mapRef.value.startDraw('polyline')
  }
}

async function fetchKostra() {
  const map = mapRef.value?.getMap()
  if (!map) return
  
  const center = map.getCenter()
  try {
    await store.fetchKostra(center.lat, center.lng)
  } catch (e) {
    alert(e.message)
  }
}

async function fetchElevation() {
  try {
    const res = await store.fetchElevation()
    if (res) {
      alert(`Höhen ermittelt: ${res.h1}m -> ${res.h2}m. Differenz: ${res.diff.toFixed(2)}m`)
    }
  } catch (e) {
    alert(e.message)
  }
}

function estimateArea() {
  try {
    const buffered = store.estimateCatchmentArea()
    if (buffered) {
      // Add to map via BaseMap method or just let store update handle it?
      // Store updates 'areas' array, but BaseMap needs to know to draw it?
      // BaseMap watches 'polygonStyles' but not 'areas' directly for geometry.
      // We need to pass the geometry to BaseMap to draw it.
      // BaseMap doesn't have a prop to feed in geometries easily except via drag/drop or draw.
      // We need to add a method to BaseMap to add a layer programmatically.
      if (mapRef.value) {
        mapRef.value.addGeoJSON(buffered)
      }
    }
  } catch (e) {
    console.error(e)
    alert('Fehler bei der Schätzung')
  }
}

function calculate() {
  store.calculate()
}

function exportReport() {
  FloodWaveReportService.generateFloodWaveReport(store)
}
</script>

<style scoped>
.flood-wave-view {
  display: grid;
  grid-template-columns: 60% 40%;
  height: calc(100vh - 64px);
  overflow: hidden;
  background-color: #f5f7fa;
}

.map-section {
  position: relative;
  height: 100%;
  border-right: 1px solid #e0e0e0;
}

.map-overlay-info {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 8px 12px;
  border-radius: 8px;
  z-index: 1000;
  font-weight: 600;
  color: #2c3e50;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0,0,0,0.05);
}

.tools-section {
  padding: 1.5rem;
  background: #f8f9fa;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.tools-header {
  margin-bottom: 1.5rem;
}

.tools-header h2 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
  font-size: 1.5rem;
  font-weight: 700;
}

.subtitle {
  color: #7f8c8d;
  font-size: 0.9rem;
  margin: 0;
}

.scroll-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
  padding-bottom: 4rem;
}

/* Scrollbar Styling */
.scroll-container::-webkit-scrollbar {
  width: 6px;
}
.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 3px;
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}

.section-card {
  background: white;
  padding: 1.25rem;
  border-radius: 12px;
  margin-bottom: 1.25rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  border: 1px solid #edf2f7;
  transition: transform 0.2s, box-shadow 0.2s;
}

.section-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}

.section-card h3 {
  margin: 0 0 1.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-group {
  margin-bottom: 1rem;
}

.input-group label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  color: #64748b;
  margin-bottom: 0.4rem;
}

.input-group input,
.input-group select {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 0.95rem;
  background-color: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
  color: #2c3e50;
}

.input-group input:focus,
.input-group select:focus {
  outline: none;
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.input-with-action {
  display: flex;
  gap: 0.5rem;
}

.small-btn {
  padding: 0 0.8rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.9rem;
  transition: all 0.2s;
  color: #475569;
}

.small-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.small-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  display: block;
  margin-top: 0.4rem;
  font-size: 0.8rem;
  color: #10b981;
  font-weight: 500;
}

.result-display {
  background: #f0f9ff;
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #0369a1;
  border: 1px solid #bae6fd;
  margin-top: 1rem;
}

.empty-state {
  text-align: center;
  padding: 1.5rem;
  color: #94a3b8;
  background: #f8fafc;
  border-radius: 8px;
  border: 2px dashed #e2e8f0;
}

.area-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.area-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.area-info {
  display: flex;
  flex-direction: column;
}

.area-name {
  font-weight: 600;
  color: #334155;
  font-size: 0.95rem;
}

.area-size {
  font-size: 0.8rem;
  color: #64748b;
}

.area-cn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.area-cn label {
  font-size: 0.85rem;
  color: #64748b;
  font-weight: 500;
}

.area-cn input {
  width: 70px;
  padding: 0.4rem;
  text-align: center;
}

.total-area {
  text-align: right;
  font-size: 0.9rem;
  font-weight: 600;
  color: #334155;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #e2e8f0;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.fetch-btn {
  width: 100%;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: #e0f2fe;
  color: #0284c7;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  transition: all 0.2s;
}

.fetch-btn:hover {
  background: #bae6fd;
}

.fetch-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.calc-btn {
  width: 100%;
  padding: 1rem;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  margin-bottom: 2rem;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.5);
}

.calc-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px -1px rgba(59, 130, 246, 0.6);
}

.results-section {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  border: 1px solid #e2e8f0;
  margin-bottom: 2rem;
  position: relative;
  overflow: hidden;
}

.results-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, #3b82f6, #06b6d4);
}

.kpi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.kpi-card {
  background: #f8fafc;
  padding: 1.25rem;
  border-radius: 10px;
  text-align: center;
  border: 1px solid #e2e8f0;
}

.kpi-card .label {
  display: block;
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.kpi-card .value {
  display: block;
  font-size: 1.5rem;
  font-weight: 800;
  color: #1e293b;
}

.chart-box {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.25rem;
  margin-top: 1.5rem;
}

.chart-box h4 {
  margin: 0 0 1rem 0;
  color: #64748b;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 700;
  text-align: center;
}

.chart-wrapper {
  height: 400px;
}

.export-card {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  margin-top: 3rem;
  text-align: center;
}

.export-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.export-btn {
  width: 100%;
  padding: 0.8rem;
  background: #334155;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.export-btn:hover {
  background: #1e293b;
  transform: translateY(-1px);
}

.magic-btn {
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.8rem;
  background: linear-gradient(135deg, #8b5cf6, #6d28d9);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px -1px rgba(139, 92, 246, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.magic-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px -1px rgba(139, 92, 246, 0.5);
}

@media (max-width: 768px) {
  .flood-wave-view {
    display: flex;
    flex-direction: column;
    height: auto;
    overflow: visible;
  }

  .map-section {
    height: 400px;
    border-right: none;
    border-bottom: 1px solid #e0e0e0;
  }

  .tools-section {
    height: auto;
    overflow: visible;
    padding: 1rem;
  }

  .scroll-container {
    overflow: visible;
    padding-bottom: 2rem;
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
