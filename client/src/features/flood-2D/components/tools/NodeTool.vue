<template>
  <div
    class="tool-ui-panel node-panel"
    :class="{ collapsed: !panelVisible }"
    v-show="isActive"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      Source Point / Node Tool
      <span v-if="!panelVisible" class="collapse-dots">···</span>
    </div>

    <div class="panel-content" v-show="panelVisible">
      <!-- Zustand 1: Warten auf Klick -->
      <div v-if="!pendingNode" class="state-idle">
        <div class="hint">
          <span class="step-badge">1</span> Klicke auf das Terrain
        </div>
        <div class="sub-hint">
          Setze einen hydrodynamischen Knotenpunkt<br>
          (z.B. als Quelle/Einleiter).
        </div>
      </div>

      <!-- Zustand 2: Popup zur Bestätigung -->
      <div v-else class="state-popup">
        <div class="hint">Knotenpunkt bestätigen</div>
        
        <div class="coord-display">
          <div class="coord-row"><span>X:</span> <strong>{{ pendingNode.x.toFixed(2) }}</strong></div>
          <div class="coord-row"><span>Y:</span> <strong>{{ pendingNode.y.toFixed(2) }}</strong></div>
          <div class="coord-row"><span>Z:</span> <strong>{{ pendingNode.z.toFixed(2) }}</strong></div>
        </div>

        <label class="type-row">
          <span>Typ</span>
          <select v-model="nodeType" class="type-select">
            <option value="SOURCE">Quelle / Einleiter (SOURCE)</option>
            <option value="SINK">Senke / Entnahme (SINK)</option>
          </select>
        </label>

        <div class="actions">
          <button class="btn btn-save" @click="saveNode">Knoten setzen</button>
          <button class="btn btn-cancel" @click="cancelNode">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';

const simStore = useSimulationStore();
const geoStore = useGeoStore();

// --- 1. Aktivierung ---
// Reagiert auf 'NODE', wie zuvor im Toolbar-Fix eingerichtet
const isActive = computed(() => simStore.activeTool === 'NODE');

// Panel per Hover einklappbar (analog ShovelTool); das Bestätigungs-Popup bleibt offen.
const { onPanelEnter, onPanelLeave, panelVisible } =
  useCollapsiblePanel({ forceOpen: () => !!pendingNode.value });

// --- 2. State-Machine ---
const pendingNode = ref(null);
const nodeType = ref('SOURCE');   // SOURCE = Einleiter, SINK = Entnahme

const resetState = () => {
    pendingNode.value = null;
};

// Falls das Tool verlassen wird, State aufräumen
watch(isActive, (active) => {
    if (!active) resetState();
});

// --- 3. Klick-Listener (Raycast Handover) ---
const processClick = (coords) => {
    // Nur aktiv, wenn das 'NODE' Werkzeug ausgewählt ist
    if (!isActive.value) return;
    
    // Blockiere Klicks, falls bereits ein Knoten im Popup bestätigt wird
    if (pendingNode.value) return;
    
    if (!coords || typeof coords.x !== 'number') return;

    // Speichere die Punktkoordinaten in der temporären Variable
    pendingNode.value = { x: coords.x, y: coords.y, z: coords.z };
};

const handleWindowMapClick = (event) => {
    processClick(event.detail);
};

onMounted(() => {
    window.addEventListener('map-click', handleWindowMapClick);
});

onUnmounted(() => {
    window.removeEventListener('map-click', handleWindowMapClick);
});

// --- 4. Speichern in den Store ---
const saveNode = () => {
    if (!pendingNode.value) return;

    // Generiere eine eindeutige ID
    const nodeId = `node_${Date.now()}`;

    // Den Knoten in geoStore.nodes pushen
    geoStore.addNode({
        id: nodeId,
        x: pendingNode.value.x,
        y: pendingNode.value.y,
        z: pendingNode.value.z,
        type: nodeType.value // SOURCE (Einleiter) oder SINK (Entnahme)
    });

    // Reset für den nächsten Punkt
    resetState();
};

const cancelNode = () => {
    resetState();
};
</script>

<style scoped>
.tool-ui-panel.node-panel {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(44, 62, 80, 0.95);
    color: #ecf0f1;
    padding: 16px 20px;
    border-radius: 8px;
    backdrop-filter: blur(8px);
    pointer-events: auto;
    text-align: center;
    min-width: 260px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.25);
    border: 2px solid #3498db; /* Blau für Node/Source Tool */
    z-index: 1000;
}

.panel-header {
    font-weight: 700;
    margin-bottom: 12px;
    color: #3498db;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    padding-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: default;
    user-select: none;
}
.collapse-dots { margin-left: auto; opacity: 0.4; letter-spacing: 2px; font-size: 0.8rem; }

/* Eingeklappt: kompakte Pille, nur der Header bleibt sichtbar (Hover klappt aus). */
.tool-ui-panel.node-panel.collapsed { min-width: unset; padding: 8px 16px; }
.node-panel.collapsed .panel-header { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }

.hint {
    font-size: 0.95rem;
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.step-badge {
    background: #3498db;
    color: white;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: bold;
}

.sub-hint {
    font-size: 0.8rem;
    color: #bdc3c7;
    line-height: 1.4;
}

/* Popup Styles */
.state-popup {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 4px;
}

.coord-display {
    background: #34495e;
    border-radius: 6px;
    padding: 10px;
    border: 1px solid #7f8c8d;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
}

.coord-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #ecf0f1;
}

.coord-row span {
    color: #bdc3c7;
}

.type-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.85rem;
    color: #bdc3c7;
}

.type-select {
    flex: 1;
    background: #34495e;
    color: #ecf0f1;
    border: 1px solid #7f8c8d;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 0.85rem;
}

.actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
}

.btn {
    flex: 1;
    padding: 8px 0;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-save {
    background: #3498db;
    color: white;
}

.btn-save:hover {
    background: #2980b9;
}

.btn-cancel {
    background: #7f8c8d;
    color: white;
}

.btn-cancel:hover {
    background: #95a5a6;
}

.btn:active {
    transform: scale(0.96);
}
</style>
