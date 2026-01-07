<template>
  <div class="excavation-input">
    <h3>Eingabewerte (Baugrubensohle)</h3>
    <div class="form-grid">
      <div class="form-group">
        <label>Länge Sohle (L<sub>2</sub>) [m]</label>
        <input type="number" v-model.number="store.inputs.l2" step="0.01" min="0" placeholder="z.B. 10.00">
      </div>
      <div class="form-group">
        <label>Breite Sohle (B<sub>2</sub>) [m]</label>
        <input type="number" v-model.number="store.inputs.b2" step="0.01" min="0" placeholder="z.B. 5.00">
      </div>
      <div class="form-group">
        <label>Tiefe / Höhe (h) [m]</label>
        <input type="number" v-model.number="store.inputs.h" step="0.01" min="0" placeholder="z.B. 2.50">
      </div>
    </div>

    <h4>Böschungsneigung (1:n)</h4>
    <p class="hint">Verhältnis 1 (vertikal) : n (horizontal). Für 45° ist n=1.</p>
    <SlopeInput label="Böschungsneigung (n)" v-model="store.inputs.n" />
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

.hint {
  font-size: 0.9rem;
  color: #7f8c8d;
  margin-bottom: 1rem;
  font-style: italic;
}
</style>
