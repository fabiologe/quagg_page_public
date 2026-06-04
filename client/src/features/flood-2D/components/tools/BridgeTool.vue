<template>
  <div class="tool-ui-panel bridge-panel" v-show="isActive">
    <div class="panel-header">
      <span class="header-icon">🌉</span> Brücke / Durchfahrt
    </div>

    <div class="panel-content">

      <!-- Idle: Warten auf Achsenklicks -->
      <div v-if="!pendingBridge" class="state-idle">
        <!-- DRAWING: Startpunkt gesetzt, Endpunkt erwartet -->
        <template v-if="isDrawingAxis">
          <div class="hint drawing-hint">
            <span class="step-badge">2</span>
            Endpunkt klicken — oder <strong>Esc</strong> zum Abbrechen
          </div>
        </template>
        <template v-else>
          <div class="hint">
            <span class="step-badge">1</span>
            Startpunkt auf das Terrain klicken
          </div>
          <div class="hint" style="margin-top:6px">
            <span class="step-badge">2</span>
            Endpunkt setzen → Brückenachse wird gezogen
          </div>
        </template>
        <div class="sub-hint">
          Die Achse wird Bresenham-4-connected über das Raster gelegt.
          Jede Zelle erhält zwei Wehr-Einträge (Soffitte + Deck).
        </div>

        <!-- IFC-Import -->
        <button class="btn-ifc-import" @click="importFromClipboard" title="quagg-bridge-v1 JSON aus Zwischenablage (IFC-Viewer)">
          📋 Aus IFC einfügen
        </button>

        <div v-if="bridges.length > 0" class="existing-list">
          <div class="list-title">Vorhandene Brücken</div>
          <div
            v-for="b in bridges"
            :key="b.id"
            class="bridge-item"
          >
            <span class="bridge-label">{{ b.id.substring(0, 12) }}</span>
            <span class="bridge-meta">{{ b.cells.length }} Zellen · soffit={{ b.soffit.toFixed(1) }}m</span>
            <button class="btn-remove" @click="geoStore.removeBridge(b.id)" title="Löschen">✕</button>
          </div>
        </div>
      </div>

      <!-- Form: Hydraulikparameter eingeben -->
      <div v-else class="state-form">
        <div class="location-badge">
          📍 Achse: {{ pendingSegments.length }} Zellen
        </div>

        <div class="form-grid">
          <!-- Sohlhöhe -->
          <div class="input-group">
            <label>Sohlhöhe z_sohle [m NHN]</label>
            <input type="number" v-model.number="form.z_sohle" step="0.05" />
            <span class="field-hint">Unterkante Öffnung (aus DEM: {{ demZ.toFixed(2) }} m)</span>
          </div>

          <!-- Durchfahrtshöhe (Soffitte) -->
          <div class="input-group">
            <label>Soffitte [m NHN]</label>
            <input type="number" v-model.number="form.soffit" step="0.05" />
            <span class="field-hint">
              Lichte Höhe: {{ (form.soffit - form.z_sohle).toFixed(2) }} m
            </span>
          </div>

          <!-- Fahrbahnoberkante (Deck) -->
          <div class="input-group">
            <label>Deck [m NHN]</label>
            <input type="number" v-model.number="form.deck" step="0.05" />
            <span class="field-hint">Fahrbahnoberkante (> Soffitte)</span>
          </div>

          <!-- Lichte Breite -->
          <div class="input-group">
            <label>Lichte Breite [m]</label>
            <input type="number" v-model.number="form.width" step="0.5" min="0.5" />
            <span class="field-hint">Öffnungsbreite inkl. Pfeilern</span>
          </div>

          <!-- Abflussbeiwert -->
          <div class="input-group">
            <label>Abflussbeiwert Cd</label>
            <input type="number" v-model.number="form.Cd" step="0.01" min="0.3" max="1.2" />
            <span class="field-hint">Standard 0.80 (LISFLOOD v8)</span>
          </div>

          <!-- Transition Zone (v8) -->
          <div class="input-group">
            <label>Tz (Transition Zone)</label>
            <input type="number" v-model.number="form.Tz" step="0.1" min="1.0" max="3.0" />
            <span class="field-hint">Nur v8 Docker-Solver: ~1.5</span>
          </div>
        </div>

        <div class="validation-error" v-if="!isValid">
          ⚠ Soffitte muss > Sohlhöhe und Deck muss ≥ Soffitte sein
        </div>

        <div class="actions">
          <button class="btn btn-save" @click="saveBridge" :disabled="!isValid">Speichern</button>
          <button class="btn btn-cancel" @click="cancel">Verwerfen</button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import { computeAxisFromWorldPoints } from '../../composables/editor/useBridgeTool.js';

const props = defineProps({
  toolInstance: { type: Object, default: null }
});

const simStore = useSimulationStore();
const geoStore = useGeoStore();

const isActive  = computed(() => simStore.activeTool === 'BRIDGE');
const bridges   = computed(() => geoStore.bridges);
const isDrawingAxis = computed(() => props.toolInstance?.state?.value === 'DRAWING');

// ── State ──────────────────────────────────────────────────────────────────
const pendingBridge   = ref(false);
const pendingSegments = ref([]);
const demZ            = ref(0);

const form = ref({
  z_sohle: 0.0,
  soffit:  2.0,
  deck:    3.0,
  width:   5.0,
  Cd:      0.80,
  Tz:      1.5,
});

const isValid = computed(() =>
  form.value.soffit > form.value.z_sohle &&
  form.value.deck   >= form.value.soffit &&
  form.value.width  > 0
);

// IFC-Import state
const ifcAxisPoints  = ref(null);  // { p1: {x,y}, p2: {x,y} }
const pendingFromIfc = ref(false);

// ── Reset ──────────────────────────────────────────────────────────────────
const reset = () => {
  pendingBridge.value   = false;
  pendingSegments.value = [];
  demZ.value            = 0;
  ifcAxisPoints.value   = null;
  pendingFromIfc.value  = false;
  form.value = { z_sohle: 0.0, soffit: 2.0, deck: 3.0, width: 5.0, Cd: 0.80, Tz: 1.5 };
};

watch(isActive, active => { if (!active) reset(); });

// ── Event-Listener für bridge-axis-click ──────────────────────────────────
const handleAxisClick = (event) => {
  if (!isActive.value) return;
  if (pendingBridge.value) return;

  const { segments } = event.detail || {};
  if (!segments || segments.length === 0) return;

  pendingSegments.value = segments;

  // Vorausfüllung aus DEM-Mittelwert entlang der Achse
  const avgZ = segments.reduce((s, seg) => s + seg.z, 0) / segments.length;
  demZ.value = avgZ;

  form.value.z_sohle = parseFloat(avgZ.toFixed(2));
  form.value.soffit  = parseFloat((avgZ + 2.0).toFixed(2));
  form.value.deck    = parseFloat((avgZ + 3.0).toFixed(2));

  pendingBridge.value = true;
};

onMounted(()   => window.addEventListener('bridge-axis-click', handleAxisClick));
onUnmounted(() => window.removeEventListener('bridge-axis-click', handleAxisClick));

// ── IFC-Clipboard-Import ───────────────────────────────────────────────────
async function importFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text);
    if (data.type !== 'quagg-bridge-v1') {
      alert('Kein Brücken-JSON in Zwischenablage.\nBitte zuerst im IFC-Viewer "Als Brücke kopieren" verwenden.');
      return;
    }
    ifcAxisPoints.value  = { p1: data.axis.p1, p2: data.axis.p2 };
    form.value.z_sohle   = data.z.sohle;
    form.value.soffit    = data.z.soffit;
    form.value.deck      = data.z.deck;
    form.value.width     = data.width;
    form.value.Cd        = 0.80;
    form.value.Tz        = 1.5;
    demZ.value           = data.z.sohle;
    pendingFromIfc.value = true;
    pendingBridge.value  = true;
  } catch {
    alert('Fehler beim Lesen der Zwischenablage.');
  }
}

// ── Speichern ──────────────────────────────────────────────────────────────
const saveBridge = () => {
  if (!isValid.value) return;

  const lineId   = `bridge_${Date.now()}`;
  const { soffit, deck, width, Cd, Tz, z_sohle } = form.value;

  let segments = pendingSegments.value;

  // IFC-Import-Pfad: Achse aus Weltkoordinaten berechnen
  if (pendingFromIfc.value && ifcAxisPoints.value) {
    const terrain = geoStore.terrain;
    if (!terrain) { alert('Kein Terrain geladen — kann Brückenachse nicht rasterisieren.'); return; }
    const pd = terrain.header ?? terrain;
    const rawCells = computeAxisFromWorldPoints(ifcAxisPoints.value.p1, ifcAxisPoints.value.p2, pd);
    if (!rawCells.length) { alert('Brückenachse liegt außerhalb des Terrain-Grids.'); return; }

    const xll = pd.xll ?? pd.xllcorner ?? 0;
    const yll = pd.yll ?? pd.yllcorner ?? 0;
    const cs  = pd.cellsize ?? 1;

    segments = rawCells.map((cell, i) => ({
      col: cell.col, row: cell.row,
      x: xll + (cell.col + 0.5) * cs,
      y: yll + ((pd.nrows - 1 - cell.row) + 0.5) * cs,
      z: z_sohle,
      direction: rawCells.length > 1 && i > 0
        ? (rawCells[i].row !== rawCells[i - 1].row ? 'E' : 'S')
        : 'S',
    }));
  }

  const batch = segments.map(seg => ({
    lineId,
    col:       seg.col,
    row:       seg.row,
    x:         seg.x,
    y:         seg.y,
    z:         seg.z,
    direction: seg.direction,
    z_sohle,
    soffit,
    deck,
    width,
    Cd,
    Tz,
  }));

  geoStore.addBridgeBatch(batch);
  reset();
};

const cancel = () => reset();
</script>

<style scoped>
.tool-ui-panel.bridge-panel {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(26, 42, 58, 0.96);
  color: #ecf0f1;
  padding: 16px 20px;
  border-radius: 10px;
  backdrop-filter: blur(10px);
  pointer-events: auto;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  border: 2px solid #e74c3c;
  z-index: 1000;
}

.panel-header {
  font-weight: 700;
  font-size: 0.95rem;
  color: #e74c3c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(231, 76, 60, 0.3);
  padding-bottom: 8px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.header-icon { font-size: 1.1rem; }

.hint { font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.drawing-hint { color: #ffce54; }
.step-badge { background: #e74c3c; color: white; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; flex-shrink: 0; }
.sub-hint { font-size: 0.8rem; color: #95a5a6; line-height: 1.4; margin: 10px 0; }

.existing-list { margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; }
.list-title { font-size: 0.78rem; color: #7f8c8d; text-transform: uppercase; margin-bottom: 6px; }
.bridge-item { display: flex; align-items: center; gap: 6px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.bridge-label { font-size: 0.85rem; font-weight: 600; flex: 1; }
.bridge-meta { font-size: 0.75rem; color: #7f8c8d; }
.btn-remove { background: none; border: 1px solid #c0392b; color: #c0392b; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; }
.btn-remove:hover { background: #c0392b; color: white; }

.state-form { display: flex; flex-direction: column; gap: 10px; }
.location-badge { font-size: 0.78rem; color: #e74c3c; background: rgba(231,76,60,0.15); border-radius: 4px; padding: 4px 8px; text-align: center; }

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.input-group { display: flex; flex-direction: column; gap: 4px; }
.input-group label { font-size: 0.78rem; color: #bdc3c7; }
.input-group input[type="number"] { padding: 6px 8px; border-radius: 5px; border: 1px solid #4a6278; background: #1e3348; color: white; font-size: 0.88rem; outline: none; transition: border-color 0.2s; }
.input-group input[type="number"]:focus { border-color: #e74c3c; }
.field-hint { font-size: 0.7rem; color: #7f8c8d; line-height: 1.3; }

.validation-error { font-size: 0.78rem; color: #e74c3c; text-align: center; }

.actions { display: flex; gap: 8px; margin-top: 4px; }
.btn { flex: 1; padding: 8px; border: none; border-radius: 5px; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.2s; }
.btn:active { transform: scale(0.97); }
.btn-save { background: #e74c3c; color: white; }
.btn-save:hover:not(:disabled) { background: #c0392b; }
.btn-save:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-cancel { background: #4a6278; color: white; }
.btn-cancel:hover { background: #5d7a91; }

.btn-ifc-import {
  width: 100%;
  padding: 7px;
  margin-bottom: 6px;
  border: 1px dashed rgba(231,76,60,0.5);
  border-radius: 5px;
  background: rgba(231,76,60,0.08);
  color: #e57373;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-ifc-import:hover { background: rgba(231,76,60,0.2); border-style: solid; }
</style>
