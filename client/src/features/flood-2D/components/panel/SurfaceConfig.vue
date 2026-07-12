<template>
  <div class="surface-config">
    <h4><SvEmoji emoji="🎨" :size="15" /> Oberflächen-Materialien</h4>
    
    <div class="info-box" v-if="!surfaceStore.isInitialized">
      <SvEmoji emoji="⚠" :size="14" /> Surface Grid noch nicht initialisiert. Aktiviere das Texture-Tool im 3D-Editor.
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
            <span
              class="infil-chip"
              :title="`Infiltration: ${toMmh(mat.infiltration ?? 0).toFixed(1)} mm/h`"
            ><SvEmoji emoji="💧" :size="12" />{{ toMmh(mat.infiltration ?? 0).toFixed(1) }}</span>
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
import SvEmoji from '../common/SvEmoji.vue';
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

// Convert m/s → mm/h for display
const toMmh = (ms) => ms * 3.6e6;

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
  font-family: var(--sv-font);
  letter-spacing: 0.05em;
  color: var(--sv-text-lime);
  text-shadow: var(--sv-glow-lime);
}

.info-box {
  background: rgba(243, 156, 18, 0.12);
  color: #f39c12;
  border: 1px solid rgba(243, 156, 18, 0.4);
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.82rem;
  margin-bottom: 0.75rem;
}

.grid-info {
  background: rgba(163, 230, 53, 0.1);
  color: var(--sv-lime);
  border: 1px solid var(--sv-border-lime);
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
  background: #1e1e2c;
  transition: all 0.15s;
}
.material-row:hover { background: #2e2740; }
.material-row.active {
  border-color: var(--sv-violet);
  background: rgba(139, 92, 246, 0.15);
  box-shadow: var(--sv-glow-violet);
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
  border: 1px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.mat-label {
  flex: 1;
  font-size: 0.85rem;
  color: var(--sv-text);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.manning-input {
  width: 58px;
  padding: 2px 4px;
  background: var(--sv-bg);
  color: var(--sv-text-lime);
  border: 1px solid var(--sv-border);
  border-radius: 3px;
  font-size: 0.78rem;
  font-family: var(--sv-font);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.manning-input:focus {
  border-color: #a3e635;
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

.infil-chip {
    font-size: 0.68rem;
    color: #a3e635;
    background: rgba(163,230,53,0.12);
    border-radius: 8px;
    padding: 2px 5px;
    white-space: nowrap;
    cursor: default;
}

/* Coverage Bar */
.coverage-bar-container {
    width: 100%;
    height: 12px;
    background: rgba(255, 255, 255, 0.08);
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
    color: #fff;
    font-weight: bold;
    text-shadow: 0 0 3px rgba(0,0,0,0.9);
}

/* Add Material Section */
.add-material-section {
    margin-top: 15px;
    border-top: 1px dashed var(--sv-border);
    padding-top: 10px;
}

.btn-add {
    width: 100%;
    padding: 8px;
    background: #a3e635;
    color: #12121a;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.2s;
}
.btn-add:hover { background: #b6f04d; }

.add-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #1e1e2c;
    border: 1px solid var(--sv-border);
    padding: 10px;
    border-radius: 6px;
}

.form-input {
    width: 100%;
    padding: 6px;
    background: var(--sv-bg);
    color: var(--sv-text);
    border: 1px solid var(--sv-border);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: var(--sv-font);
}
.form-input:focus {
    border-color: var(--sv-lime);
    outline: none;
    box-shadow: var(--sv-glow-lime);
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
    background: #a3e635;
    color: #12121a;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.btn-save:hover { background: #b6f04d; }

.btn-cancel {
    flex: 1;
    padding: 6px;
    background: var(--sv-surface-2);
    color: var(--sv-text-dim);
    border: 1px solid var(--sv-border);
    border-radius: 4px;
    cursor: pointer;
}
.btn-cancel:hover { border-color: var(--sv-violet); color: var(--sv-text); }

.legend {
  margin-top: 0.75rem;
  color: var(--sv-text-dim);
  font-size: 0.75rem;
  text-align: center;
}
</style>
