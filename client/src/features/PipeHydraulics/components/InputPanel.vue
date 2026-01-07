<template>
  <div class="input-panel">
    
    <div class="panel-header">
       Eingangsparameter
    </div>

    <div class="input-grid">
      
      <!-- Type Selection -->
      <div class="form-group">
        <label>Rohrtyp</label>
        <select v-model="store.profileType">
          <option value="circular">Kreisprofil</option>
          <option value="rectangular">Rechteckprofil</option>
          <option value="egg">Eiprofil</option>
        </select>
      </div>

      <!-- Geometry -->
      <div class="form-group" v-if="store.profileType === 'circular'">
        <label>Durchmesser (mm)</label>
        <input 
          type="number" 
          :value="Math.round(store.diameter * 1000)" 
          @input="e => store.diameter = e.target.value / 1000"
          step="10"
        />
      </div>
      <div class="form-group-row" v-else>
         <div class="form-group">
            <label>Breite (mm)</label>
            <input 
              type="number" 
              :value="Math.round(store.width * 1000)" 
              @input="e => store.width = e.target.value / 1000"
            />
         </div>
         <div class="form-group">
            <label>Höhe (mm)</label>
            <input 
              type="number" 
              :value="Math.round(store.height * 1000)" 
              @input="e => store.height = e.target.value / 1000"
            />
         </div>
      </div>

      <!-- Hydraulic -->
      <div class="form-group">
        <label>Gefälle (%)</label>
        <input 
          type="number" 
          v-model.number="store.slope"
          step="0.1"
        />
      </div>
      <div class="form-group">
        <label>Rauheit kSt</label>
        <input 
          type="number" 
          v-model.number="store.roughness"
          step="1"
        />
      </div>

      <!-- Slider for Filling -->
      <div class="form-group slider-group">
         <div class="slider-header">
            <label>Füllhöhe</label>
            <span class="value-tag">{{ (store.fillingHeight * 1000).toFixed(0) }} mm</span>
         </div>
         <input 
            type="range" 
            v-model.number="store.fillingHeight"
            :max="maxHeight"
            min="0"
            step="0.001"
          />
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePipeHydraulicsStore } from '../stores/usePipeHydraulicsStore'

const store = usePipeHydraulicsStore()

const maxHeight = computed(() => {
  if (store.profileType === 'circular') return store.diameter
  return store.height
})
</script>

<style scoped>
.input-panel {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel-header {
  font-weight: 700;
  color: #2c3e50;
  text-transform: uppercase;
  font-size: 0.85rem;
  border-bottom: 2px solid #f1f1f1;
  padding-bottom: 0.5rem;
  margin-bottom: 0.5rem;
}

.input-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1.5rem;
  align-items: end;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group-row {
  display: flex;
  gap: 1rem;
}

label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #7f8c8d;
  text-transform: uppercase;
}

input, select {
  padding: 0.6rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95rem;
  width: 100%;
  color: #2c3e50;
  background: #fff;
}

input:focus, select:focus {
  border-color: #3498db;
  outline: none;
}

.slider-group {
    min-width: 200px;
}

.slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.value-tag {
    background: #e1f5fe;
    color: #0288d1;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
}

input[type=range] {
    padding: 0;
    height: 6px;
    background: #e0e0e0;
    border: none;
    border-radius: 3px;
}
</style>
