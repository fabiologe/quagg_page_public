<template>
  <div class="tool-ui-panel weir-panel" v-show="isActive">
    <div class="panel-header">
      <span class="header-icon">〰</span> Wehr / Überlauf
    </div>

    <div class="panel-content">

      <!-- Schritt 1: Warten auf Klick im Terrain -->
      <div v-if="!pendingWeir" class="state-idle">
        <div class="hint">
          <span class="step-badge">1</span>
          Klicke auf das Terrain, um den Wehr-Standort zu setzen.
        </div>
        <div class="sub-hint">
          Das Wehr-Linien-Werkzeug: Klicke für den Startpunkt und bewege die Maus, um den Damm zu ziehen. Ein zweiter Klick setzt das Ende. Die Richtung wird automatisch aus dem Raster abgeleitet.
        </div>

        <!-- Bestehende Wehre auflisten -->
        <div v-if="weirs.length > 0" class="existing-list">
          <div class="list-title">Vorhandene Wehre</div>
          <div
            v-for="w in weirs"
            :key="w.id"
            class="weir-item"
          >
            <span class="weir-label">{{ w.label }}</span>
            <span class="weir-meta">{{ w.direction }} | hc={{ w.hc.toFixed(2) }}m</span>
            <button class="btn-remove" @click="geoStore.removeWeir(w.id)" title="Löschen">✕</button>
          </div>
        </div>
      </div>

      <!-- Schritt 2: Parameter-Formular -->
      <div v-else class="state-form">
        <div class="location-badge">
          📍 Linie mit {{ pendingSegments.length }} Segmenten
        </div>

        <!-- Linie Info -->
        <div class="input-group">
          <div class="dir-hint">Linie erfasst: {{ pendingSegments.length }} Wehr-Segmente</div>
        </div>

        <!-- Wehrschneidenhöhe -->
        <div class="input-group">
          <label for="weirHc">Kronenhöhe hc [m ü. NHN]</label>
          <input id="weirHc" type="number" v-model.number="form.hc" step="0.05" />
          <span class="field-hint">Max. Terrain-Z entlang Linie: {{ terrainZ.toFixed(2) }} m (hc muss darüber liegen)</span>
        </div>

        <!-- Abflussbeiwert Cd -->
        <div class="input-group">
          <label for="weirCd">Abflussbeiwert Cd</label>
          <input id="weirCd" type="number" v-model.number="form.Cd" step="0.01" min="0.5" max="2.5" />
          <span class="field-hint">Scharfkantig ≈ 1.704 · Breitkronig ≈ 1.3</span>
        </div>

        <!-- Einstaukoeffizient m -->
        <div class="input-group">
          <label for="weirM">Einstaukoeffizient m</label>
          <input id="weirM" type="number" v-model.number="form.m" step="0.01" min="0.1" max="1.0" />
          <span class="field-hint">de Marchi 0.667 (Standard)</span>
        </div>

        <!-- Unidirektional -->
        <div class="input-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.fixedDir" />
            Nur in eine Richtung (Rückstauklappe)
          </label>
          <span class="field-hint" v-if="form.fixedDir">Richtungs-Tag → {{ form.direction }}F</span>
        </div>

        <div class="actions">
          <button class="btn btn-save" @click="saveWeir" :disabled="!isValid">Speichern</button>
          <button class="btn btn-cancel" @click="cancel">Verwerfen</button>
        </div>

        <div class="validation-error" v-if="!isValid">
          ⚠ hc muss über der Geländehöhe liegen (> {{ terrainZ.toFixed(2) }} m)
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

const isActive = computed(() => simStore.activeTool === 'WEIR');
const weirs    = computed(() => geoStore.weirs);

// ── Wehr-Richtungen (Typ 0 = nur Poleni-Wehr, keine Brücken) ──────────────
const directions = [
  { tag: 'N',  label: 'Norden (Nordkante der Zelle)' },
  { tag: 'S',  label: 'Süden (Südkante der Zelle)' },
  { tag: 'E',  label: 'Osten (Ostkante der Zelle)' },
  { tag: 'W',  label: 'Westen (Westkante der Zelle)' },
];

// ── State ──────────────────────────────────────────────────────────────────
const pendingWeir = ref(false);
const pendingSegments = ref([]);
const terrainZ    = ref(0); // Max Geländehöhe entlang Linie

const form = ref({
  hc:        0.0,   // Kronenhöhe [m ü. NHN]
  Cd:        1.704, // Abflussbeiwert
  m:         0.667, // Einstaukoeffizient
  fixedDir:  false, // Rückstauklappe?
});

// hc muss über dem Gelände liegen
const isValid = computed(() => form.value.hc > terrainZ.value);

// ── Reset ──────────────────────────────────────────────────────────────────
const reset = () => {
  pendingWeir.value  = false;
  pendingSegments.value = [];
  terrainZ.value     = 0;
  form.value = { hc: 0.0, Cd: 1.704, m: 0.667, fixedDir: false };
};

watch(isActive, active => { if (!active) reset(); });

// ── Klick-Handler (CustomEvent von useInteractionManager) ──────────────────
const handleMapClick = (event) => {
  if (!isActive.value) return;
  if (pendingWeir.value) return;   

  const { segments } = event.detail || {};
  if (!segments || segments.length === 0) return;

  pendingSegments.value = segments;
  // Maximum Z value along the line ensures the dam acts as a barrier
  terrainZ.value = Math.max(...segments.map(s => s.z));

  // Schlaue Vorausfüllung: hc = max Gelände + 5.00 m als Startvorschlag (massive Wand)
  form.value.hc = parseFloat((terrainZ.value + 5.00).toFixed(2));

  pendingWeir.value = true;
};

onMounted(()   => window.addEventListener('weir-line-click', handleMapClick));
onUnmounted(() => window.removeEventListener('weir-line-click', handleMapClick));

// ── Speichern ──────────────────────────────────────────────────────────────
const saveWeir = () => {
  if (!isValid.value) return;

  const lineId = crypto.randomUUID();
  const cellsize = geoStore.terrain ? geoStore.terrain.cellsize : 1.0;

  // addWeirBatch() nimmt EINEN Snapshot für die gesamte Linie —
  // ein einziges Ctrl+Z macht die komplette Linie rückgängig.
  const batch = pendingSegments.value.map(seg => {
      const tag = form.value.fixedDir ? seg.direction + 'F' : seg.direction;
      return {
        id:        crypto.randomUUID(),
        lineId:    lineId,
        label:     `Linie ${lineId.substring(0,4)} (${tag})`,
        x:         seg.x,
        y:         seg.y,
        direction: tag,
        Cd:        form.value.Cd,
        hc:        form.value.hc,
        m:         form.value.m,
        w:         cellsize,
      };
  });

  geoStore.addWeirBatch(batch);

  reset();
};


const cancel = () => reset();
</script>

<style scoped>
.tool-ui-panel.weir-panel {
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
  min-width: 300px;
  max-width: 380px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  border: 2px solid #2980b9;
  z-index: 1000;
}

.panel-header {
  font-weight: 700;
  font-size: 0.95rem;
  color: #5dade2;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(93, 173, 226, 0.3);
  padding-bottom: 8px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.header-icon { font-size: 1.1rem; }

/* Hint */
.hint { font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.step-badge { background: #2980b9; color: white; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: bold; flex-shrink: 0; }
.sub-hint { font-size: 0.8rem; color: #95a5a6; line-height: 1.4; margin-bottom: 12px; }

/* Existing weirs list */
.existing-list { margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; }
.list-title { font-size: 0.78rem; color: #7f8c8d; text-transform: uppercase; margin-bottom: 6px; }
.weir-item { display: flex; align-items: center; gap: 6px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.weir-label { font-size: 0.85rem; font-weight: 600; flex: 1; }
.weir-meta { font-size: 0.75rem; color: #7f8c8d; }
.btn-remove { background: none; border: 1px solid #c0392b; color: #c0392b; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; }
.btn-remove:hover { background: #c0392b; color: white; }

/* Form */
.state-form { display: flex; flex-direction: column; gap: 10px; }
.location-badge { font-size: 0.78rem; color: #5dade2; background: rgba(41,128,185,0.18); border-radius: 4px; padding: 4px 8px; text-align: center; }

.input-group { display: flex; flex-direction: column; gap: 4px; }
.input-group label { font-size: 0.82rem; color: #bdc3c7; }
.input-group input[type="number"] { padding: 7px 10px; border-radius: 5px; border: 1px solid #4a6278; background: #1e3348; color: white; font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
.input-group input[type="number"]:focus { border-color: #2980b9; }
.field-hint { font-size: 0.74rem; color: #7f8c8d; line-height: 1.3; }

.checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; cursor: pointer; }
.checkbox-label input { accent-color: #2980b9; width: 14px; height: 14px; }

/* Direction grid */
.direction-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
.dir-btn { padding: 6px 4px; border: 1px solid #4a6278; background: #1e3348; color: #bdc3c7; border-radius: 4px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.15s; }
.dir-btn:hover { background: #2471a3; border-color: #2980b9; color: white; }
.dir-btn.active { background: #2980b9; border-color: #5dade2; color: white; }
.dir-hint { font-size: 0.72rem; color: #7f8c8d; line-height: 1.3; min-height: 2.5em; }

/* Buttons */
.actions { display: flex; gap: 8px; margin-top: 4px; }
.btn { flex: 1; padding: 8px; border: none; border-radius: 5px; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.2s; }
.btn:active { transform: scale(0.97); }
.btn-save { background: #2980b9; color: white; }
.btn-save:hover:not(:disabled) { background: #1f6691; }
.btn-save:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-cancel { background: #4a6278; color: white; }
.btn-cancel:hover { background: #5d7a91; }

.validation-error { font-size: 0.78rem; color: #e74c3c; text-align: center; margin-top: -4px; }
</style>
