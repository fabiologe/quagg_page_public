<template>
  <PublicLayout>
    <div class="mass-calculator-view">
      <div class="header">
        <h1>Massenermittlung</h1>
        <p class="subtitle">Berechnung von Aushub, Verbau und Pyramidenstümpfen</p>
      </div>

      <div class="calculator-container">
        <div class="mode-selection-dropdown">
          <label>Berechnungsziel:</label>
          <select :value="store.mode" @change="store.setMode($event.target.value)">
            <option value="excavation">🚜 Aushub (Böschung)</option>
            <option value="trench">🧱 Verbau (Senkrecht)</option>
            <option value="pyramid">📐 Pyramidenstumpf (Flächen)</option>
          </select>
        </div>

        <div class="input-section">
          <component :is="currentComponent" />
          
          <div class="actions">
            <button class="btn-primary" @click="store.calculate">Berechnen</button>
            <button class="btn-secondary" @click="store.reset">Zurücksetzen</button>
          </div>
        </div>

        <div class="results-section" v-if="store.result">
          <h3>Ergebnisse</h3>
          <div class="result-cards">
            <!-- Volume Card (Always visible) -->
            <div class="result-card highlight">
              <span class="label">Volumen (V)</span>
              <span class="value">{{ formatNumber(store.result.volume) }} m³</span>
            </div>

            <!-- Wall Area (Excavation/Trench only) -->
            <div class="result-card highlight" v-if="store.mode !== 'pyramid'">
              <span class="label">Verbaufläche (A<sub>V</sub>)</span>
              <span class="value">{{ formatNumber(store.result.wallArea) }} m²</span>
            </div>
            
            <!-- Areas -->
            <div class="result-card" v-if="store.result.areaBottom">
              <span class="label">Fläche Sohle (A<sub>2</sub>)</span>
              <span class="value">{{ formatNumber(store.result.areaBottom) }} m²</span>
            </div>
            
            <div class="result-card" v-if="store.result.areaTop">
              <span class="label">Fläche Oben (A<sub>1</sub>)</span>
              <span class="value">{{ formatNumber(store.result.areaTop) }} m²</span>
            </div>
          </div>

          <!-- Details (Excavation/Trench only) -->
          <div class="details-grid" v-if="store.mode !== 'pyramid'">
            <div class="detail-item">
              <span class="label">Länge Gelände (L<sub>1</sub>)</span>
              <span class="value">{{ formatNumber(store.result.l1) }} m</span>
            </div>
            <div class="detail-item">
              <span class="label">Breite Gelände (B<sub>1</sub>)</span>
              <span class="value">{{ formatNumber(store.result.b1) }} m</span>
            </div>
            <div class="detail-item" v-if="store.mode === 'excavation'">
               <span class="label">Böschungsfläche (A<sub>M</sub>)</span>
               <span class="value">{{ formatNumber(store.result.wallArea) }} m²</span>
            </div>
          </div>

          <div class="viewer-section">
            <h3>3D Ansicht (Referenz: PKW)</h3>
            <ExcavationViewer :dimensions="store.result" />
          </div>
        </div>
      </div>
    </div>
  </PublicLayout>
</template>

<script setup>
import { computed } from 'vue'
import PublicLayout from '@/components/layout/PublicLayout.vue'
import { useMassCalculatorStore } from '@/stores/massCalculatorStore'
import Excavation from '../components/Excavation.vue'
import Trench from '../components/Trench.vue'
import TruncatedPyramid from '../components/TruncatedPyramid.vue'
import ExcavationViewer from '../components/ExcavationViewer.vue'

const store = useMassCalculatorStore()

const currentComponent = computed(() => {
  switch (store.mode) {
    case 'excavation': return Excavation
    case 'trench': return Trench
    case 'pyramid': return TruncatedPyramid
    default: return Excavation
  }
})

const formatNumber = (num) => {
  if (num === undefined || num === null) return '-'
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
}
</script>

<style scoped>
.mass-calculator-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.subtitle {
  color: #7f8c8d;
  font-size: 1.1rem;
}

.calculator-container {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}

.mode-selection-dropdown {
  margin-bottom: 2rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mode-selection-dropdown label {
  font-weight: 600;
  color: #2c3e50;
}

.mode-selection-dropdown select {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  background-color: #f8f9fa;
  cursor: pointer;
}

.actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

button {
  flex: 1;
  padding: 0.75rem;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #3498db;
  color: white;
}

.btn-primary:hover {
  background-color: #2980b9;
}

.btn-primary:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: #95a5a6;
  color: white;
}

.btn-secondary:hover {
  background-color: #7f8c8d;
}

.results-section {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid #eee;
  animation: fadeIn 0.5s ease-out;
}

.result-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.result-card {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.result-card.highlight {
  background: #e8f6f3;
  border: 1px solid #a2d9ce;
}

.result-card .label {
  font-size: 0.9rem;
  color: #7f8c8d;
  margin-bottom: 0.5rem;
}

.result-card .value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #2c3e50;
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}

.detail-item:last-child {
  border-bottom: none;
}

.viewer-section {
  margin-top: 3rem;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
