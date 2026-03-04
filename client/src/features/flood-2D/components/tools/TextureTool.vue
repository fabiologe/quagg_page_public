<template>
  <div class="texture-tool-ui">
    <div class="tool-panel">
        <div class="panel-header">🎨 Texture Brush</div>

        <!-- MATERIAL SELECTOR -->
        <label class="control-label">Material</label>
        <div class="material-grid">
            <button
              v-for="mat in surfaceStore.materials"
              :key="mat.id"
              :class="{ active: surfaceStore.activeMaterialId === mat.id }"
              class="material-btn"
              @click="surfaceStore.activeMaterialId = mat.id"
              :title="`${mat.name} (n=${mat.manning})`"
            >
              <span class="color-swatch" :style="{ background: mat.color }"></span>
              <span class="mat-name">{{ mat.name }}</span>
              <span class="mat-n">{{ mat.manning }}</span>
            </button>
        </div>

        <!-- BRUSH RADIUS -->
        <div class="control-row">
            <label>Radius: {{ surfaceStore.brushRadius }} Zellen</label>
            <input type="range" v-model.number="surfaceStore.brushRadius" min="1" max="20" step="1">
        </div>

        <!-- GRID STATUS -->
        <div class="grid-status">
            <span v-if="surfaceStore.isInitialized" class="status-ok">
                ✅ Grid: {{ surfaceStore.gridNCols }}×{{ surfaceStore.gridNRows }}
            </span>
            <span v-else class="status-warn">
                ⚠ Kein Grid — Klicke auf Terrain zum Initialisieren
            </span>
        </div>

        <div class="hint">Klicke und ziehe auf dem Terrain zum Malen</div>
    </div>
  </div>
</template>

<script setup>
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore.js';

const surfaceStore = useSurfaceStore();
</script>

<style scoped>
.texture-tool-ui {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    z-index: 100;
}

.tool-panel {
    background: rgba(44, 62, 80, 0.9);
    color: white;
    padding: 15px;
    border-radius: 8px;
    pointer-events: auto;
    font-size: 0.9rem;
    backdrop-filter: blur(8px);
    width: 280px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.panel-header { font-weight: bold; margin-bottom: 15px; color: #ecf0f1; border-bottom: 1px solid #7f8c8d; padding-bottom: 5px; }

.control-label { font-size: 0.8rem; margin-bottom: 4px; color: #bdc3c7; display: block; }

.material-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
}

.material-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 2px solid transparent;
    background: #34495e;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.82rem;
    transition: all 0.15s;
}
.material-btn:hover { background: #3d566e; }
.material-btn.active {
    border-color: #e67e22;
    background: #2c3e50;
    font-weight: bold;
}

.color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.3);
    flex-shrink: 0;
}

.mat-name { flex: 1; }
.mat-n { font-size: 0.75rem; color: #95a5a6; font-variant-numeric: tabular-nums; }

.control-row { margin-bottom: 10px; }
.control-row label { display: block; font-size: 0.8rem; margin-bottom: 2px; color: #bdc3c7; }
.control-row input { width: 100%; cursor: pointer; }

.grid-status {
    padding: 6px 8px;
    background: rgba(0,0,0,0.2);
    border-radius: 4px;
    text-align: center;
    margin-bottom: 8px;
    font-size: 0.82rem;
}
.status-ok { color: #2ecc71; }
.status-warn { color: #f39c12; }

.hint { text-align: center; font-size: 0.8rem; opacity: 0.6; margin-top: 8px; font-style: italic; }
</style>
