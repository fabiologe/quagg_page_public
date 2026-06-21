<template>
  <div class="tool-ui-panel culvert-panel" v-show="isActive">
    <div class="panel-header">Culvert Tool (1D/2D)</div>
    
    <div class="panel-content">
      <!-- State: Warten auf Klicks -->
      <div v-if="!pendingCulvert" class="state-idle">
        <div class="hint" v-if="!sourceNode">
          <span class="step-badge">1</span> Startknoten (Einlauf)
        </div>
        <div class="hint" v-else>
          <span class="step-badge">2</span> Zielknoten (Auslauf)
        </div>
        
        <div class="sub-hint">
          Klicke auf das 3D-Terrain, um die Punkte<br>
          hydraulisch als Rohr zu verbinden.
        </div>
      </div>

      <!-- State: Popup / Hydraulikparameter -->
      <div v-else class="state-popup">
        <div class="hint">Hydraulikparameter</div>

        <div class="param-grid">
          <div class="input-group">
            <label>Durchmesser [m]</label>
            <input type="number" v-model.number="form.diameter" step="0.1" min="0.1" />
            <span class="field-hint">Kreisquerschnitt</span>
          </div>
          <div class="input-group">
            <label>Länge [m]</label>
            <input type="number" v-model.number="form.length" step="0.5" min="0.1" />
          </div>
          <div class="input-group">
            <label>Sohlhöhe Einlauf [m NHN]</label>
            <input type="number" v-model.number="form.z_in" step="0.05" />
            <span class="field-hint">Auto aus Klickpunkt Z</span>
          </div>
          <div class="input-group">
            <label>Sohlhöhe Auslauf [m NHN]</label>
            <input type="number" v-model.number="form.z_out" step="0.05" />
          </div>
          <div class="input-group">
            <label>Manning-n</label>
            <input type="number" v-model.number="form.manning_n" step="0.001" min="0.005" max="0.1" />
            <span class="field-hint">Beton ≈ 0.013</span>
          </div>
          <div class="input-group">
            <label>Einlaufbeiwert Cd</label>
            <input type="number" v-model.number="form.Cd" step="0.01" min="0.3" max="1.0" />
            <span class="field-hint">Standard 0.6</span>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-save" @click="saveCulvert">Speichern</button>
          <button class="btn btn-cancel" @click="cancelCulvert">Verwerfen</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';

const simStore = useSimulationStore();
const geoStore = useGeoStore();

// --- 1. Aktivierung ---
const isActive = computed(() => simStore.activeTool === 'CULVERT');

// --- 2. State-Machine ---
const sourceNode     = ref(null);
const targetNode     = ref(null);
const pendingCulvert = ref(false);

const form = ref({
    diameter:  1.0,
    z_in:      0.0,
    z_out:     0.0,
    length:    10.0,
    manning_n: 0.013,
    Cd:        0.6,
});

const resetState = () => {
    sourceNode.value     = null;
    targetNode.value     = null;
    pendingCulvert.value = false;
    form.value = { diameter: 1.0, z_in: 0.0, z_out: 0.0, length: 10.0, manning_n: 0.013, Cd: 0.6 };
};

// State aufräumen, falls das Tool im Store gewechselt wird
watch(isActive, (active) => {
    if (!active) resetState();
});

// --- 3. Klick-Listener (Raycast Handover) ---
// Ansatz: Globaler EventBus via CustomEvent, da Vue 3 $on/$off entfernt hat.
// Ist der präziseste Weg, um 3D-Canvas Hooks und isolierte Store-UI-Komponenten zu entkoppeln.
// Alternativ kann vom Raycaster einfach `simStore.lastClick = coords` geschrieben 
// und hier via `watch(() => simStore.lastClick, ...)` gelauscht werden.
const processClick = (coords) => {
    if (!isActive.value) return;
    
    // Stoppe Raycast-Auswertung, wenn das Popup auf Dateneingabe wartet
    if (pendingCulvert.value) return;
    if (!coords || typeof coords.x !== 'number') return;

    if (!sourceNode.value) {
        sourceNode.value = { x: coords.x, y: coords.y, z: coords.z };
        form.value.z_in = parseFloat((coords.z ?? 0).toFixed(2));
    } else if (!targetNode.value) {
        targetNode.value = { x: coords.x, y: coords.y, z: coords.z };
        form.value.z_out   = parseFloat((coords.z ?? 0).toFixed(2));
        form.value.length  = parseFloat(Math.hypot(
            targetNode.value.x - sourceNode.value.x,
            targetNode.value.y - sourceNode.value.y
        ).toFixed(1));
        pendingCulvert.value = true;
    }
};

const handleWindowMapClick = (event) => {
    // Erwartet: window.dispatchEvent(new CustomEvent('map-click', { detail: { x, y, z } }))
    processClick(event.detail);
};

onMounted(() => {
    window.addEventListener('map-click', handleWindowMapClick);
});

onUnmounted(() => {
    window.removeEventListener('map-click', handleWindowMapClick);
});

// Optional: Fallback-Watcher, falls das Team die Koordinaten direkt in simStore oder geoStore ablegt.
/* 
watch(() => simStore.lastClick, (newCoords) => {
    if(newCoords) processClick(newCoords);
}); 
*/

// --- 4. Speichern (Store-Integration) ---
const saveCulvert = () => {
    if (!sourceNode.value || !targetNode.value) return;

    // 0) Validierung der Hydraulikparameter (verhindert physikalisch unmögliche Rohre)
    const f = form.value;
    const errs = [];
    if (!(f.diameter > 0))           errs.push('Durchmesser muss > 0 m sein');
    if (!(f.length > 0))             errs.push('Länge muss > 0 m sein');
    if (!(f.manning_n > 0))          errs.push('Manning-n muss > 0 sein');
    if (!(f.Cd > 0 && f.Cd <= 1))    errs.push('Einlaufbeiwert Cd muss in (0, 1] liegen');
    if (errs.length) { alert('Culvert ungültig:\n• ' + errs.join('\n• ')); return; }
    // Widriges Gefälle ist erlaubt (Druckrohr), aber ein häufiger Eingabefehler → nachfragen.
    if (f.z_out > f.z_in &&
        !confirm(`Auslauf-Sohle (${f.z_out} m) liegt HÖHER als Einlauf (${f.z_in} m) — widriges Gefälle. Trotzdem speichern?`)) {
        return;
    }

    // A) Eindeutige IDs generieren
    const timestamp = Date.now();
    const sourceId = `node_in_${timestamp}`;
    const targetId = `node_out_${timestamp}`;

    // B) Knoten in geoStore registrieren
    // Z-Achse ist für die Torricelli-Berechnung kritisch (Invert Level)!
    geoStore.addNode({
        id: sourceId,
        x: sourceNode.value.x,
        y: sourceNode.value.y,
        z: sourceNode.value.z,
        type: 'CULVERT_NODE'
    });

    geoStore.addNode({
        id: targetId,
        x: targetNode.value.x,
        y: targetNode.value.y,
        z: targetNode.value.z,
        type: 'CULVERT_NODE'
    });

    // C) Rohr-Link mit vollständigen Hydraulikparametern
    geoStore.addCulvertLink(sourceId, targetId, { ...form.value });

    // D) Reset für nächstes Rohr
    resetState();
};

const cancelCulvert = () => {
    resetState();
};
</script>

<style scoped>
.tool-ui-panel.culvert-panel {
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
    border: 2px solid #e67e22; /* Pinia/Tool Marker Color */
    z-index: 1000;
}

.panel-header {
    font-weight: 700;
    margin-bottom: 12px;
    color: #e67e22;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    padding-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 0.95rem;
}

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
    background: #e67e22;
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
    gap: 10px;
    margin-top: 4px;
}

.param-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.field-hint {
    font-size: 0.7rem;
    color: #95a5a6;
    line-height: 1.2;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
}

.input-group label {
    font-size: 0.85rem;
    color: #bdc3c7;
}

.input-group input {
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #7f8c8d;
    background: #34495e;
    color: white;
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s;
    text-align: center;
}

.input-group input:focus {
    border-color: #e67e22;
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
    background: #e67e22;
    color: white;
}

.btn-save:hover {
    background: #d35400;
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
