<template>
  <div class="pyramid-input">
    <h3>Eingabewerte (Flächen)</h3>
    <div class="form-grid">
      <div class="form-group">
        <label>Fläche Unten (A<sub>2</sub>) [m²]</label>
        <input type="number" v-model.number="store.inputs.a2" step="0.01" min="0" placeholder="z.B. 25.00">
      </div>
      <div class="form-group">
        <label>Höhe (h) [m]</label>
        <input type="number" v-model.number="store.inputs.h" step="0.01" min="0" placeholder="z.B. 6.00">
      </div>
      <SlopeInput label="Böschungsneigung (n)" v-model="store.inputs.n" />
      <div class="form-group">
        <label>Fläche Oben (A<sub>1</sub>) [m²]</label>
        <input type="number" :value="store.previewA1" step="0.01" min="0" placeholder="Berechnet..." readonly>
        <p class="hint-small">Automatisch berechnet (quadratische Näherung)</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useMassCalculatorStore } from '@/stores/massCalculatorStore'
import SlopeInput from './SlopeInput.vue'

const store = useMassCalculatorStore()
</script>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

label {
  font-weight: 500;
  color: #2c3e50;
}

input {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.hint-small {
  font-size: 0.8rem;
  color: #95a5a6;
  margin-top: 0.25rem;
  font-style: italic;
}
</style>
