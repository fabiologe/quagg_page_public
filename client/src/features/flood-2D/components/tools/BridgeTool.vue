<template>
  <div class="tool-ui-panel bridge-panel" v-show="isActive">
    <div class="panel-header">
      <span class="header-icon">🌉</span> Brücke / Durchfahrt
    </div>

    <div class="panel-content">

      <!-- Modus-Umschalter: klassische Linie vs. 3D-Körper -->
      <div class="mode-switch">
        <button
          class="mode-btn" :class="{ active: bridge3DState.mode === 'LINE' }"
          @click="setMode('LINE')"
        >➖ Linie</button>
        <button
          class="mode-btn" :class="{ active: bridge3DState.mode === 'MESH3D' }"
          @click="setMode('MESH3D')"
        >🧊 3D-Körper</button>
      </div>

      <template v-if="bridge3DState.mode === 'LINE'">

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

      </template>

      <!-- ════ 3D-Körper-Modus (Polygon → Extrusion → Vertex-Editing) ════ -->
      <template v-else>

        <!-- Footprint zeichnen -->
        <div v-if="bridge3DState.phase === 'DRAW_FOOTPRINT'" class="state-idle">
          <div class="hint drawing-hint" v-if="bridge3DState.draftPoints.length">
            <span class="step-badge">{{ bridge3DState.draftPoints.length }}</span>
            Punkte gesetzt — <strong>Enter</strong> schließt das Polygon
          </div>
          <div class="hint" v-else>
            <span class="step-badge">1</span>
            Footprint-Polygon aufs Terrain klicken (≥ 3 Punkte)
          </div>
          <div class="sub-hint">
            Backspace: letzter Punkt · Esc: abbrechen ·
            Klick auf bestehenden 3D-Körper öffnet das Editing.
          </div>
          <div class="actions">
            <button class="btn btn-save" :disabled="bridge3DState.draftPoints.length < 3" @click="tool3d.commitFootprint()">Polygon abschließen</button>
            <button class="btn btn-cancel" @click="tool3d.cancel()">Abbrechen</button>
          </div>
        </div>

        <!-- Extrudieren -->
        <div v-else-if="bridge3DState.phase === 'EXTRUDE_FORM'" class="state-form">
          <div class="location-badge">
            🧊 Footprint: {{ bridge3DState.draftPoints.length }} Punkte — auf Brückendicke extrudieren
          </div>
          <div class="form-grid">
            <div class="input-group">
              <label>Soffitte [m NHN]</label>
              <input type="number" v-model.number="form3d.soffit" step="0.05" />
              <span class="field-hint">Unterkante Körper (Terrain ⌀ {{ bridge3DState.formDefaults.z_sohle.toFixed(2) }} m)</span>
            </div>
            <div class="input-group">
              <label>Deck [m NHN]</label>
              <input type="number" v-model.number="form3d.deck" step="0.05" />
              <span class="field-hint">Dicke: {{ (form3d.deck - form3d.soffit).toFixed(2) }} m</span>
            </div>
            <div class="input-group">
              <label>Abflussbeiwert Cd</label>
              <input type="number" v-model.number="form3d.Cd" step="0.01" min="0.3" max="1.2" />
              <span class="field-hint">Standard 0.80 (LISFLOOD v8)</span>
            </div>
            <div class="input-group">
              <label>Tz (Transition Zone)</label>
              <input type="number" v-model.number="form3d.Tz" step="0.1" min="1.0" max="3.0" />
              <span class="field-hint">Nur v8 Docker-Solver: ~1.5</span>
            </div>
            <div class="input-group" style="grid-column: 1 / -1">
              <label>Fließrichtung sperren</label>
              <select v-model="form3d.directionMode">
                <option value="AUTO">Auto (aus Spannachse)</option>
                <option value="NS">N–S-Fluss sperren ('S')</option>
                <option value="EW">O–W-Fluss sperren ('E')</option>
              </select>
              <span class="field-hint">Solver-Richtung der Orifice-Zellen</span>
            </div>
          </div>
          <div class="validation-error" v-if="!isValid3d">
            ⚠ Deck muss mindestens 0.1 m über der Soffitte liegen
          </div>
          <div class="actions">
            <button class="btn btn-save" :disabled="!isValid3d" @click="tool3d.applyExtrude(form3d)">Extrudieren</button>
            <button class="btn btn-cancel" @click="tool3d.cancel()">Verwerfen</button>
          </div>
        </div>

        <!-- Vertex-Editing -->
        <div v-else-if="bridge3DState.phase === 'EDIT' || bridge3DState.phase === 'LOOPCUT' || bridge3DState.phase === 'PIER'" class="state-idle">
          <div class="location-badge" v-if="editingBridge">
            ✏ {{ editingBridge.id.substring(0, 16) }} ·
            {{ editingBridge.lattice.nSpan }} Stationen · {{ editingBridge.cells.length }} Zellen
          </div>
          <template v-if="bridge3DState.phase === 'LOOPCUT'">
            <div class="hint drawing-hint" v-if="bridge3DState.cutAxis === 'v'">
              ✛ Quer-Stützpunkt: Klick auf den Körper setzt die Querreihe
              <span v-if="bridge3DState.hoverCutV != null"> (v = {{ bridge3DState.hoverCutV.toFixed(2) }})</span>
            </div>
            <div class="hint drawing-hint" v-else>
              ✂ Loop Cut: Klick auf den Körper setzt die Station
              <span v-if="bridge3DState.hoverCutU != null"> (u = {{ bridge3DState.hoverCutU.toFixed(2) }})</span>
            </div>
            <div class="sub-hint">Neuen Stützpunkt setzen, dann die Griffe in der Höhe ziehen (Bogen). Esc: zurück ohne Schnitt</div>
          </template>
          <template v-else-if="bridge3DState.phase === 'PIER'">
            <div class="hint drawing-hint">
              🛑 Pfeiler: Klick setzt einen Pfeiler (volle Sperrung) — Klick in einen
              bestehenden entfernt ihn
            </div>
            <div class="pier-width-row">
              <label>Pfeilerbreite [m]</label>
              <input type="number" v-model.number="bridge3DState.pierWidth" step="0.5" min="0.5" />
            </div>
            <div class="sel-info" v-if="pierDim">
              📏 Pfeiler: <strong>{{ pierDim.left.toFixed(1) }}–{{ pierDim.right.toFixed(1) }} m</strong>
              entlang der Spannweite (Breite {{ bridge3DState.pierWidth.toFixed(1) }} m)
            </div>
            <div class="sub-hint">
              Die Decke bleibt oben, am Pfeiler geht der Querschnitt im rechten Winkel
              zu. Kein DGM-Eingriff — der Pfeiler sperrt nur die Öffnung. Esc: zurück.
            </div>
          </template>
          <template v-else>
            <div class="sub-hint">
              Griffe in der Höhe ziehen (cyan = Soffitte, grau = Deck) ·
              <strong style="color:#c8915a">braune Boxen = Pfeiler</strong> (anklicken → Maße) ·
              Shift-Klick: Mehrfachauswahl · <strong>R</strong>: Loop Cut · <strong>T</strong>: Quer-Punkt · <strong>P</strong>: Pfeiler · <strong>Enter</strong>: fertig
            </div>
            <!-- Lot-Info + exakte Höhe über Raster für die Auswahl -->
            <div v-if="bridge3DState.selectionInfo" class="sel-info">
              <div class="sel-info-line" v-if="bridge3DState.selectionInfo.count === 1">
                📐 Punkt: <strong>{{ fmtDz(bridge3DState.selectionInfo.dz) }} m</strong> über Raster
                ({{ bridge3DState.selectionInfo.z.toFixed(2) }} m NHN · Lot {{ bridge3DState.selectionInfo.terrZ.toFixed(2) }} m)
              </div>
              <div class="sel-info-line" v-else>
                📐 {{ bridge3DState.selectionInfo.count }} Punkte ausgewählt
              </div>
              <div class="height-row">
                <input type="number" v-model.number="heightAbove" step="0.05" min="0" />
                <button class="btn btn-save btn-slim" @click="tool3d.setHeightAboveTerrain(heightAbove)">Δ Raster setzen</button>
              </div>
            </div>
            <!-- Pfeiler bearbeiten: Ecken ziehen (orange) + Kanten unterteilen -->
            <div v-if="selPier" class="sel-info pier-dim">
              <div class="sel-info-line">🛑 Pfeiler #{{ selPier.index + 1 }} · {{ selPier.corners }} Ecken</div>
              <div class="sub-hint" style="margin:4px 0">
                Orange Ecken in der Fläche ziehen, oranges Kopf-Handle = Höhe.
                „Ecken einfügen" verfeinert das Polygon (für Rundungen).
              </div>
              <div class="pier-dim-grid">
                <label>Kopf [m NHN]</label>
                <input type="number" step="0.05" placeholder="Soffitte" v-model.number="pierH" @change="tool3d.setPierTop(pierH)" />
              </div>
              <div class="actions" style="margin-top:6px">
                <button class="btn btn-cancel btn-slim" @click="pierH = null; tool3d.setPierTop(null)" title="Kopf bündig an die Brückenunterkante">Kopf = Soffitte</button>
                <button class="btn btn-pier btn-slim" @click="tool3d.subdivideSelectedPier()" title="Mittelpunkte auf jeder Kante einfügen">✚ Ecken</button>
              </div>
            </div>
          </template>
          <div class="actions">
            <button class="btn btn-cancel" :disabled="bridge3DState.phase !== 'EDIT'" @click="tool3d.startLoopCut()">✂ Längs</button>
            <button class="btn btn-cancel" :disabled="bridge3DState.phase !== 'EDIT'" @click="tool3d.startCrossCut()">✛ Quer</button>
            <button class="btn btn-pier" :disabled="bridge3DState.phase !== 'EDIT'" @click="tool3d.startPier()">🛑 Pfeiler</button>
          </div>
          <div class="actions">
            <button class="btn btn-save" @click="tool3d.finishEdit()">Fertig</button>
            <button class="btn btn-remove-wide" @click="tool3d.deleteCurrent()">Löschen</button>
          </div>
        </div>

        <!-- Idle (nach "Fertig") -->
        <div v-else class="state-idle">
          <div class="hint">
            <span class="step-badge">＋</span>
            Neuen Brückenkörper zeichnen — oder bestehenden anklicken
          </div>
          <div class="actions">
            <button class="btn btn-save" @click="tool3d.startDrawing()">Neues Polygon</button>
          </div>
        </div>

      </template>

      <!-- Gemeinsame Liste vorhandener Brücken -->
      <div v-if="showBridgeList && bridges.length > 0" class="existing-list">
        <div class="list-title">Vorhandene Brücken</div>
        <div
          v-for="b in bridges"
          :key="b.id"
          class="bridge-item"
        >
          <span class="bridge-label">{{ b.kind === 'mesh3d' ? '🧊 ' : '' }}{{ b.id.substring(0, 12) }}</span>
          <span class="bridge-meta">{{ b.cells.length }} Zellen · soffit={{ b.soffit.toFixed(1) }}m</span>
          <button v-if="b.kind === 'mesh3d'" class="btn-edit" @click="editMesh3D(b.id)" title="3D-Körper bearbeiten">✏</button>
          <button class="btn-remove" @click="geoStore.removeBridge(b.id)" title="Löschen">✕</button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import { computeAxisFromWorldPoints } from '../../composables/editor/useBridgeTool.js';
import { bridge3DState, getBridge3DToolInstance } from '../../composables/editor/useBridge3DTool.js';

const props = defineProps({
  toolInstance: { type: Object, default: null }
});

const simStore = useSimulationStore();
const geoStore = useGeoStore();

const isActive  = computed(() => simStore.activeTool === 'BRIDGE');
const bridges   = computed(() => geoStore.bridges);
const isDrawingAxis = computed(() => props.toolInstance?.state?.value === 'DRAWING');

// ── 3D-Körper-Modus ────────────────────────────────────────────────────────
const tool3d = getBridge3DToolInstance();

const form3d = ref({ soffit: 2.0, deck: 3.0, Cd: 0.80, Tz: 1.5, directionMode: 'AUTO' });
const isValid3d = computed(() => form3d.value.deck >= form3d.value.soffit + 0.1);

const editingBridge = computed(() =>
  geoStore.bridges.find(b => b.id === bridge3DState.editingId)
);

// Selektierter Pfeiler (Klick auf den Pfeiler im EDIT) → Eckenzahl + Kopfhöhe
const selPier = computed(() => {
  const b = editingBridge.value;
  const i = bridge3DState.selectedPier;
  if (!b?.lattice?.piers || i == null) return null;
  const p = b.lattice.piers[i];
  if (!p?.poly) return null;
  return { index: i, corners: p.poly.length, zTop: p.zTop };
});
const pierH = ref(null);
watch(selPier, (s) => {
  if (!s) return;
  pierH.value = s.zTop == null ? null : Math.round(s.zTop * 100) / 100;
}, { immediate: true });

// Live-Bemaßung des Pfeilers (links/rechts in m entlang der Spannweite)
const pierDim = computed(() => {
  if (bridge3DState.phase !== 'PIER' || bridge3DState.hoverCutU == null) return null;
  const lat = editingBridge.value?.lattice;
  if (!lat) return null;
  const spanLen = lat.spanLen || 1;
  const half = (bridge3DState.pierWidth || 0) / 2;
  const center = bridge3DState.hoverCutU * spanLen;
  return { left: Math.max(0, center - half), right: Math.min(spanLen, center + half) };
});

// Liste nur zeigen, wenn kein Formular/Editing den Platz braucht
const showBridgeList = computed(() =>
  bridge3DState.mode === 'LINE'
    ? !pendingBridge.value
    : (bridge3DState.phase === 'IDLE' || bridge3DState.phase === 'DRAW_FOOTPRINT')
);

// Formular-Defaults übernehmen, sobald der Footprint geschlossen wurde
watch(() => bridge3DState.phase, (phase) => {
  if (phase === 'EXTRUDE_FORM') {
    form3d.value.soffit = bridge3DState.formDefaults.soffit;
    form3d.value.deck   = bridge3DState.formDefaults.deck;
  }
});

// Höhe-über-Raster-Input mit der aktuellen Auswahl vorbelegen (nicht während Drag)
const heightAbove = ref(0);
const fmtDz = (dz) => (dz == null ? '–' : `${dz >= 0 ? '+' : ''}${dz.toFixed(2)}`);
watch(() => bridge3DState.selectionInfo, (info) => {
  if (info?.dz != null && !bridge3DState.dragging) {
    heightAbove.value = Math.round(info.dz * 100) / 100;
  }
});

const setMode = (mode) => {
  if (bridge3DState.mode === mode) return;
  reset(); // Pending-State des Linien-Modus verwerfen
  bridge3DState.mode = mode; // MapEditor3D-Watcher tauscht das aktive Sub-Tool
};

const editMesh3D = (id) => {
  if (bridge3DState.mode !== 'MESH3D') {
    setMode('MESH3D');
    nextTick(() => tool3d.startEdit(id)); // erst nach activate() des Sub-Tools
  } else {
    tool3d.startEdit(id);
  }
};

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
.btn-edit { background: none; border: 1px solid #1abc9c; color: #1abc9c; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; }
.btn-edit:hover { background: #1abc9c; color: white; }

.mode-switch { display: flex; gap: 6px; margin-bottom: 12px; }
.mode-btn { flex: 1; padding: 6px; border: 1px solid #4a6278; border-radius: 5px; background: #1e3348; color: #bdc3c7; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.mode-btn.active { border-color: #e74c3c; background: rgba(231,76,60,0.18); color: #ecf0f1; }

.btn-remove-wide { flex: 0 0 auto; padding: 8px 10px; border: 1px solid #c0392b; border-radius: 5px; background: none; color: #c0392b; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.2s; }
.btn-remove-wide:hover { background: #c0392b; color: white; }

.input-group select { padding: 6px 8px; border-radius: 5px; border: 1px solid #4a6278; background: #1e3348; color: white; font-size: 0.88rem; outline: none; }
.input-group select:focus { border-color: #e74c3c; }

.sel-info { margin: 8px 0; padding: 8px; border: 1px solid rgba(241,196,15,0.4); border-radius: 6px; background: rgba(241,196,15,0.08); }
.sel-info-line { font-size: 0.8rem; color: #f1c40f; margin-bottom: 6px; }
.height-row { display: flex; gap: 6px; }
.height-row input[type="number"] { flex: 1; min-width: 0; padding: 6px 8px; border-radius: 5px; border: 1px solid #4a6278; background: #1e3348; color: white; font-size: 0.88rem; outline: none; }
.height-row input[type="number"]:focus { border-color: #f1c40f; }
.btn-slim { flex: 0 0 auto; padding: 6px 10px; font-size: 0.8rem; }

.pier-dim { border-color: rgba(139,90,43,0.6); background: rgba(139,90,43,0.12); }
.pier-dim .sel-info-line { color: #c8915a; }
.pier-dim-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 8px; align-items: center; }
.pier-dim-grid label { font-size: 0.78rem; color: #c8915a; }
.pier-dim-grid input[type="number"] { width: 100%; min-width: 0; padding: 5px 8px; border-radius: 5px; border: 1px solid #8b5a2b; background: #1e3348; color: white; font-size: 0.85rem; outline: none; }
.pier-dim-grid input[type="number"]:focus { border-color: #c8915a; }

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
.btn-pier { background: #8b5a2b; color: white; }
.btn-pier:hover:not(:disabled) { background: #a06a35; }
.btn-pier:disabled { opacity: 0.45; cursor: not-allowed; }

.pier-width-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.pier-width-row label { font-size: 0.8rem; color: #c8915a; flex: 1; }
.pier-width-row input[type="number"] { width: 80px; padding: 6px 8px; border-radius: 5px; border: 1px solid #8b5a2b; background: #1e3348; color: white; font-size: 0.88rem; outline: none; }

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
