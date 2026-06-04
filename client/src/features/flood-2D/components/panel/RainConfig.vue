<template>
  <div class="rain-config-sidebar">
    
    <!-- RESULTS PREVIEW -->
    <div class="result-card" v-if="store.rainData && store.rainData.length > 0">
        <h4>Aktuelles Regenmodell</h4>
        <div class="summary-grid">
            <div class="item">
                <span class="label">Volumen</span>
                <span class="value">{{ totalVolume.toFixed(1) }} mm</span>
            </div>
            <div class="item">
                <span class="label">Spitze</span>
                <span class="value">{{ peakIntensity.toFixed(1) }}</span>
                <span class="unit">l/(s*ha)</span>
            </div>
        </div>
        
        <!-- Mini Chart -->
        <div class="mini-chart">
             <div 
                v-for="(step, idx) in chartSteps" 
                :key="idx" 
                class="bar"
                :style="{ height: step.percent + '%', width: barWidth + '%' }"
             ></div>
        </div>
    </div>
    
    <div class="empty-state" v-else>
        <p>Noch kein Regenmodell definiert.</p>
    </div>

    <!-- ACTION BUTTON -->
    <button class="config-btn" @click="showModal = true">
        🌧️ Regen konfigurieren
    </button>

    <RainConfigModal
        :isOpen="showModal"
        @close="showModal = false"
        @apply="handleApply"
    />

    <!-- BODENVORFEUCHTE -->
    <div class="moisture-card">
      <h4>Bodenvorfeuchte (Antezedenz)</h4>
      <div class="moisture-row">
        <span class="moisture-label">🏜️</span>
        <input
          type="range"
          v-model.number="store.antecedentMoisture"
          min="0" max="100" step="5"
          class="slider"
        />
        <span class="moisture-label">💧</span>
      </div>
      <div class="moisture-value-row">
        <span class="moisture-pct">{{ store.antecedentMoisture }}%</span>
        <span class="moisture-hint">{{
          store.antecedentMoisture === 0   ? 'Trocken — volle Infiltration' :
          store.antecedentMoisture === 100 ? 'Gesättigt — kein Infiltration' :
          `Infiltration auf ${100 - store.antecedentMoisture}% reduziert`
        }}</span>
      </div>
    </div>


  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore';
import RainConfigModal from './RainConfigModal.vue';

const store = useHydraulicStore();
const showModal = ref(false);

const handleApply = () => {
    // Store already updated in Modal
    console.log("Rain Config Updated");
};

// Computed for Chart/Display (Store is Source of Truth)
const peakIntensity = computed(() => {
    if (!store.rainData) return 0;
    const maxH = Math.max(...store.rainData.map(d => d.value_mm));
    // h = I * T * 0.006 => I = h / (T * 0.006)
    return maxH / (5 * 0.006);
});

const totalVolume = computed(() => {
    if (!store.rainData) return 0;
    return store.rainData.reduce((acc, curr) => acc + curr.value_mm, 0);
});

const chartSteps = computed(() => {
    if (!store.rainData) return [];
    const maxVal = Math.max(...store.rainData.map(d => d.value_mm));
    if (maxVal === 0) return [];
    
    return store.rainData.map(d => ({
        val: d.value_mm,
        percent: (d.value_mm / maxVal) * 100
    }));
});

const barWidth = computed(() => {
    if (!chartSteps.value.length) return 0;
    return 100 / chartSteps.value.length;
});

</script>

<style scoped>
.rain-config-sidebar {
    padding: 1rem;
    color: #ecf0f1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
}

.result-card {
    background: #2c3e50;
    border-radius: 6px;
    padding: 1rem;
    border: 1px solid #34495e;
}

h4 {
    margin: 0 0 1rem 0;
    color: #bdc3c7;
    font-size: 0.85rem;
    text-transform: uppercase;
}

.summary-grid {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
}

.item {
    display: flex;
    flex-direction: column;
}

.label { font-size: 0.75rem; color: #95a5a6; }
.value { font-size: 1.1rem; font-weight: bold; color: #ecf0f1; }
.unit { font-size: 0.7rem; color: #95a5a6; }

.mini-chart {
    height: 60px;
    display: flex;
    align-items: flex-end;
    gap: 1px;
}

.bar {
    background: #3498db;
    transition: height 0.3s ease;
}

.empty-state {
    text-align: center;
    color: #7f8c8d;
    padding: 2rem 0;
    font-style: italic;
    font-size: 0.9rem;
}

.config-btn {
    width: 100%;
    padding: 0.8rem;
    background: #34495e;
    border: 1px solid #7f8c8d;
    color: white;
    font-weight: bold;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex; justify-content: center; align-items: center; gap: 0.5rem;
}
.config-btn:hover {
    background: #2c3e50;
    border-color: #bdc3c7;
}

.moisture-card {
    margin-top: 12px;
    padding: 10px 12px;
    background: #1e2d3d;
    border: 1px solid #34495e;
    border-radius: 6px;
}
.moisture-card h4 { margin: 0 0 8px; font-size: 0.82rem; color: #bdc3c7; }
.moisture-row { display: flex; align-items: center; gap: 8px; }
.moisture-label { font-size: 1rem; }
.slider { flex: 1; cursor: pointer; accent-color: #3498db; }
.moisture-value-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.moisture-pct { font-weight: 700; font-size: 0.9rem; color: #5dade2; min-width: 32px; }
.moisture-hint { font-size: 0.74rem; color: #7f8c8d; line-height: 1.3; }

</style>
