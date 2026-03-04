<template>
  <div class="surface-config">
    <h4>🎨 Oberflächen-Materialien</h4>
    
    <div class="info-box" v-if="!surfaceStore.isInitialized">
      ⚠ Surface Grid noch nicht initialisiert. Aktiviere das Texture-Tool im 3D-Editor.
    </div>

    <div v-else class="grid-info">
      ✅ Grid aktiv: {{ surfaceStore.gridNCols }} × {{ surfaceStore.gridNRows }} Zellen
    </div>

    <!-- Material Library -->
    <div class="material-list">
      <div
        v-for="mat in surfaceStore.materials"
        :key="mat.id"
        class="material-row"
        :class="{ active: surfaceStore.activeMaterialId === mat.id }"
        @click="surfaceStore.activeMaterialId = mat.id"
      >
        <span class="color-dot" :style="{ background: mat.color }"></span>
        <span class="mat-label">{{ mat.name }}</span>
        <input
          type="number"
          :value="mat.manning"
          @input="updateManning(mat.id, $event)"
          step="0.001"
          min="0.001"
          max="1.0"
          class="manning-input"
          title="Manning-Koeffizient"
          @click.stop
        />
      </div>
    </div>

    <div class="legend">
      <small>Manning n — je höher, desto rauher</small>
    </div>
  </div>
</template>

<script setup>
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore.js';

const surfaceStore = useSurfaceStore();

const updateManning = (matId, event) => {
  const val = parseFloat(event.target.value);
  if (isNaN(val) || val <= 0) return;
  const mat = surfaceStore.materials.find(m => m.id === matId);
  if (mat) mat.manning = val;
};
</script>

<style scoped>
.surface-config {
  padding: 0.5rem;
}

.surface-config h4 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  color: #2c3e50;
}

.info-box {
  background: #ffeaa7;
  color: #856404;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
}

.grid-info {
  background: #d5f5e3;
  color: #1e8449;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
}

.material-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.material-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  background: #f8f9fa;
  transition: all 0.15s;
}
.material-row:hover { background: #ecf0f1; }
.material-row.active {
  border-color: #e67e22;
  background: #fef3e6;
}

.color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid #bdc3c7;
  flex-shrink: 0;
}

.mat-label {
  flex: 1;
  font-size: 0.85rem;
  color: #2c3e50;
}

.manning-input {
  width: 58px;
  padding: 2px 4px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 0.78rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.manning-input:focus {
  border-color: #3498db;
  outline: none;
}

.legend {
  margin-top: 0.75rem;
  color: #7f8c8d;
  font-size: 0.75rem;
  text-align: center;
}
</style>
