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
        <div class="mat-main">
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
            <button 
                v-if="mat.id !== 1" 
                class="btn-delete" 
                @click.stop="deleteMaterial(mat.id)"
                title="Material löschen"
            >✕</button>
        </div>
        
        <!-- Coverage Bar -->
        <div class="coverage-bar-container" v-if="surfaceStore.isInitialized">
            <div class="coverage-bar" :style="{ width: getCoverage(mat.id) + '%', background: mat.color }"></div>
            <span class="coverage-text">{{ getCoverage(mat.id).toFixed(1) }}%</span>
        </div>
      </div>
    </div>

    <div class="add-material-section">
      <button class="btn-add" v-if="!showAddForm" @click="showAddForm = true">+ Neues Material</button>
      <div class="add-form" v-else>
         <input type="text" v-model="newMatName" placeholder="Name" class="form-input" />
         <div class="form-row">
            <input type="color" v-model="newMatColor" class="color-picker" title="Farbe wählen" />
            <input type="number" v-model="newMatManning" step="0.001" class="form-input flex-1" placeholder="Manning (z.B. 0.035)" />
         </div>
         <div class="form-actions">
            <button class="btn-save" @click="addMaterial">Speichern</button>
            <button class="btn-cancel" @click="showAddForm = false">Abbrechen</button>
         </div>
      </div>
    </div>

    <div class="legend">
      <small>Manning n — je höher, desto rauher</small>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore.js';

const surfaceStore = useSurfaceStore();

const showAddForm = ref(false);
const newMatName = ref('');
const newMatColor = ref('#f39c12');
const newMatManning = ref(0.035);

const updateManning = (matId, event) => {
  const val = parseFloat(event.target.value);
  if (isNaN(val) || val <= 0) return;
  const mat = surfaceStore.materials.find(m => m.id === matId);
  if (mat) mat.manning = val;
};

const getCoverage = (matId) => {
    if (!surfaceStore.coverageStats[matId]) return 0;
    return surfaceStore.coverageStats[matId].percent || 0;
};

const deleteMaterial = (id) => {
    if (confirm('Material wirklich löschen? Zugehörige Zellen werden zu Asphalt.')) {
        surfaceStore.deleteMaterial(id);
    }
};

const addMaterial = () => {
    if (!newMatName.value.trim()) return;
    const manning = parseFloat(newMatManning.value);
    if (isNaN(manning) || manning <= 0) return;

    surfaceStore.addMaterial(newMatName.value.trim(), newMatColor.value, manning);
    
    // Reset form
    newMatName.value = '';
    newMatColor.value = '#f39c12';
    newMatManning.value = 0.035;
    showAddForm.value = false;
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
  gap: 6px;
}

.material-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.mat-main {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
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
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.btn-delete {
    background: none;
    border: none;
    color: #e74c3c;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0 4px;
    opacity: 0.6;
    transition: opacity 0.2s;
}
.btn-delete:hover {
    opacity: 1;
}

/* Coverage Bar */
.coverage-bar-container {
    width: 100%;
    height: 12px;
    background: #e0e0e0;
    border-radius: 6px;
    position: relative;
    overflow: hidden;
    margin-top: 2px;
}
.coverage-bar {
    height: 100%;
    border-radius: 6px;
    transition: width 0.3s ease-out;
}
.coverage-text {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: 6px;
    font-size: 0.65rem;
    color: #333;
    font-weight: bold;
    text-shadow: 0 0 2px rgba(255,255,255,0.8);
}

/* Add Material Section */
.add-material-section {
    margin-top: 15px;
    border-top: 1px dashed #bdc3c7;
    padding-top: 10px;
}

.btn-add {
    width: 100%;
    padding: 8px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.2s;
}
.btn-add:hover { background: #2980b9; }

.add-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #ecf0f1;
    padding: 10px;
    border-radius: 6px;
}

.form-input {
    width: 100%;
    padding: 6px;
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    font-size: 0.85rem;
}
.form-input:focus {
    border-color: #3498db;
    outline: none;
}

.form-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.color-picker {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    cursor: pointer;
}

.flex-1 { flex: 1; }

.form-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
}

.btn-save {
    flex: 1;
    padding: 6px;
    background: #27ae60;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.btn-save:hover { background: #2ecc71; }

.btn-cancel {
    flex: 1;
    padding: 6px;
    background: #95a5a6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.btn-cancel:hover { background: #7f8c8d; }

.legend {
  margin-top: 0.75rem;
  color: #7f8c8d;
  font-size: 0.75rem;
  text-align: center;
}
</style>
