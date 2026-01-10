<template>
  <div class="shovel-tool-ui">
    <div class="tool-panel">
        <div class="panel-header">Terrain Sculpting</div>
        
        <!-- REVIEW MODE -->
        <div v-if="tool.state === 'REVIEW'" class="review-panel">
            <div class="status-msg">
                Änderung anwenden? ({{ tool.pendingChanges ? tool.pendingChanges.length : 0 }} Zellen)
            </div>
            <div class="btn-group">
                <button class="btn-confirm" @click="tool.commit()">
                    ✔ Anwenden
                </button>
                <button class="btn-cancel" @click="tool.cancel()">
                    ✖ Abbrechen
                </button>
            </div>
        </div>

        <!-- AIMING MODE -->
        <div v-else class="aiming-panel">
             <!-- MODE TOGGLE -->
             <div class="toggle-group">
                 <button :class="{ active: tool.mode === 'RAISE' }" @click="tool.mode = 'RAISE'">Anheben</button>
                 <button :class="{ active: tool.mode === 'LOWER' }" @click="tool.mode = 'LOWER'">Absenken</button>
             </div>

             <!-- SHAPE TOGGLE -->
             <label class="control-label">Pinselform</label>
             <div class="toggle-group start">
                 <button :class="{ active: tool.brushShape === 'CIRCLE' }" @click="tool.brushShape = 'CIRCLE'" title="Kreis">⭕</button>
                 <button :class="{ active: tool.brushShape === 'SQUARE' }" @click="tool.brushShape = 'SQUARE'" title="Quadrat">⬜</button>
                 <button :class="{ active: tool.brushShape === 'POLYGON' }" @click="tool.brushShape = 'POLYGON'" title="Polygon">📐</button>
             </div>

             <!-- RADIUS SLIDER -->
             <div v-if="tool.brushShape !== 'POLYGON'" class="control-row">
                 <label>Radius: {{ tool.radius }}m</label>
                 <input type="range" v-model.number="tool.radius" min="1" max="50" step="1">
             </div>

             <!-- INTENSITY SLIDER -->
             <div class="control-row">
                 <label>Intensität: {{ tool.intensity }}m</label>
                 <input type="range" v-model.number="tool.intensity" min="0.1" max="5.0" step="0.1">
             </div>

             <div class="hint">Klicke auf die Karte für Vorschau</div>
        </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  tool: { type: Object, required: true }
});
</script>

<style scoped>
.shovel-tool-ui {
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

.panel-header { font-weight: bold; margin-bottom: 15px; color: #ecf0f1; border-bottom: 1px solid #7f8c8d; padding-bottom: 5px;}

.control-row { margin-bottom: 10px; }
.control-row label { display: block; font-size: 0.8rem; margin-bottom: 2px; color: #bdc3c7; }
.control-row input { width: 100%; cursor: pointer; }

.toggle-group { display: flex; gap: 5px; margin-bottom: 10px; }
.toggle-group button { 
    flex: 1; border: none; background: #34495e; color: white; padding: 5px; 
    border-radius: 4px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;
}
.toggle-group button.active { background: #3498db; font-weight: bold; }
.toggle-group.start button { flex: unset; width: 40px; }

.btn-group { display: flex; gap: 10px; margin-top: 10px; }
.btn-confirm { background: #2ecc71; color: white; border: none; padding: 8px; border-radius: 4px; flex: 1; cursor: pointer; font-weight: bold; }
.btn-confirm:hover { background: #27ae60; }
.btn-cancel { background: #e74c3c; color: white; border: none; padding: 8px; border-radius: 4px; flex: 1; cursor: pointer; font-weight: bold; }
.btn-cancel:hover { background: #c0392b; }

.status-msg { margin-bottom: 10px; text-align: center; font-size: 0.9rem; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px; }
.hint { text-align: center; font-size: 0.8rem; opacity: 0.6; margin-top: 10px; font-style: italic; }
.control-label { font-size: 0.8rem; margin-bottom: 2px; color: #bdc3c7; display: block; }
</style>
