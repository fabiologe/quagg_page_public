<template>
  <div
    class="tool-ui-panel weir-panel"
    :class="{ collapsed: !panelVisible }"
    v-show="isActive"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      <SvIcon name="Weir.png" :size="18" class="header-icon" /> Wehr / Überlauf
      <span v-if="!panelVisible" class="collapse-toggle">···</span>
    </div>

    <div class="panel-content" v-show="panelVisible">

      <!-- Modus: klassische 2-Klick-Linie vs. editierbare Polylinie -->
      <div class="mode-switch">
        <button class="mode-btn" :class="{ active: weir3DState.mode === 'LINE' }" @click="setMode('LINE')">➖ Linie</button>
        <button class="mode-btn" :class="{ active: weir3DState.mode === 'POLYLINE' }" @click="setMode('POLYLINE')"><SvEmoji emoji="✏" :size="13" /> Polylinie</button>
      </div>

      <!-- ════ Polylinien-Modus (zeichnen + Ecken ziehen) ════ -->
      <template v-if="weir3DState.mode === 'POLYLINE'">
        <div v-if="weir3DState.phase === 'DRAW'" class="state-idle">
          <div class="hint drawing-hint" v-if="weir3DState.draftPoints.length">
            <span class="step-badge">{{ weir3DState.draftPoints.length }}</span>
            Punkte gesetzt — <strong>Enter</strong> schließt die Linie ab (≥ 2)
          </div>
          <div class="hint" v-else>
            <span class="step-badge">1</span>
            Wehr-Punkte aufs Terrain klicken (Polylinie)
          </div>
          <div class="sub-hint">Backspace: letzter Punkt · Esc: abbrechen</div>
          <div class="actions">
            <button class="btn btn-save" :disabled="weir3DState.draftPoints.length < 2" @click="weir3d.finishDrawing()">Linie abschließen</button>
            <button class="btn btn-cancel" @click="weir3d.cancel()">Abbrechen</button>
          </div>
        </div>

        <div v-else-if="weir3DState.phase === 'EDIT'" class="state-idle">
          <div class="location-badge" v-if="editingWeir"><SvEmoji emoji="✏" :size="13" /> {{ editingWeir.points.length }} Ecken · {{ (editingWeir.openings || []).length }} Öffnung(en)</div>
          <div class="sub-hint">
            <strong style="color:#3498db">Basis</strong> ziehen = Lage · <strong style="color:#a3e635">Krone</strong> ziehen = Höhe (Profil) ·
            andere Linie anklicken zum Wechseln · Enter: fertig
          </div>
          <div class="input-group">
            <label>Krone alle Ecken [m NHN]</label>
            <input type="number" step="0.05" v-model.number="crestHc" @change="weir3d.setCrest(crestHc)" />
            <span class="field-hint">Setzt ein flaches Profil; danach einzelne Kronen ziehen.</span>
          </div>
          <div class="input-group">
            <label>Wand-Breite [m]</label>
            <input type="number" step="0.5" min="0.5" v-model.number="weirWidth" @change="weir3d.setWidth(weirWidth)" />
            <span class="field-hint">3D-Dicke der Wand (wie Brücke). Die Wand folgt automatisch dem Gelände entlang des Rasters.</span>
          </div>

          <!-- Öffnungen (Durchlass): rund / rechteckig / polygonal -->
          <div class="existing-list">
            <div class="list-title">Öffnungen (Durchlass)</div>
            <div v-for="(o, k) in (editingWeir?.openings || [])" :key="k" class="op-row">
              <div class="op-head">
                <span class="weir-label">{{ {round:'⚪',rect:'▭',poly:'⬠'}[o.type] || '🛢' }} #{{ k + 1 }} · {{ {round:'rund',rect:'rechteckig',poly:'polygonal'}[o.type] || 'rund' }}</span>
                <button class="btn-remove" @click="weir3d.removeOpening(k)" title="Löschen">✕</button>
              </div>
              <div class="op-fields">
                <label class="op-soffit">Soffit
                  <input type="number" step="0.05" :value="o.soffit" @change="weir3d.setOpeningSoffit(k, parseFloat($event.target.value))" />
                </label>
                <label v-if="o.type !== 'poly'" class="op-soffit">Breite
                  <input type="number" step="0.5" min="0.2" :value="o.width" @change="weir3d.setOpeningWidth(k, parseFloat($event.target.value))" />
                </label>
                <label v-if="o.type === 'rect'" class="op-soffit">Höhe
                  <input type="number" step="0.2" min="0.2" :value="o.height" @change="weir3d.setOpeningHeight(k, parseFloat($event.target.value))" />
                </label>
                <span v-if="o.type === 'poly'" class="op-soffit">Ecken im Profil ziehen ({{ o.points?.length || 0 }})</span>
              </div>
            </div>
            <div class="actions" style="margin-top:6px">
              <button class="btn btn-cancel btn-slim" @click="weir3d.addOpening('round')">⚪ Rund</button>
              <button class="btn btn-cancel btn-slim" @click="weir3d.addOpening('rect')">▭ Rechteck</button>
              <button class="btn btn-cancel btn-slim" @click="weir3d.addOpening('poly')">⬠ Polygon</button>
            </div>
            <div class="sub-hint" style="margin-top:4px">
              Durchlass = Orifice (<code>&lt;dir&gt;B</code>) — Wasser fließt unten durch bis zum Soffit.
              Bleibt automatisch im Wehr (nicht über Krone/Gelände). Setzt den gepatchten v8-Solver voraus.
            </div>
          </div>

          <div class="actions">
            <button class="btn btn-save" @click="onFinishWeir">Fertig</button>
            <button class="btn btn-remove-wide" @click="weir3d.deleteCurrent()">Löschen</button>
          </div>
        </div>

        <div v-else class="state-idle">
          <div class="hint"><span class="step-badge">＋</span> Neue Wehr-Polylinie zeichnen — oder bestehende anklicken</div>
          <div class="actions"><button class="btn btn-save" @click="weir3d.startDrawing()">Neue Polylinie</button></div>
        </div>

        <div v-if="weirLines.length > 0" class="existing-list">
          <div class="list-title">Wehr-Polylinien</div>
          <div v-for="l in weirLines" :key="l.id" class="weir-item">
            <span class="weir-label">{{ l.label || l.id.substring(0,10) }}</span>
            <span class="weir-meta">{{ l.points.length }} Pkt · hc={{ l.hc.toFixed(2) }}m</span>
            <button class="btn-edit" @click="editWeirLine(l.id)" title="Bearbeiten"><SvEmoji emoji="✏" :size="13" /></button>
            <button class="btn-remove" @click="geoStore.removeWeirLine(l.id)" title="Löschen">✕</button>
          </div>
        </div>
      </template>

      <!-- ════ Klassischer 2-Klick-Linien-Modus ════ -->
      <template v-else>

      <!-- Schritt 1: Warten auf Klick im Terrain -->
      <div v-if="!pendingWeir" class="state-idle">
        <div v-if="isDrawingAxis" class="hint drawing-hint">
          <span class="step-badge">2</span>
          Endpunkt klicken — oder <strong>Esc</strong> zum Abbrechen
        </div>
        <div v-else class="hint">
          <span class="step-badge">1</span>
          Klicke auf das Terrain, um den Wehr-Standort zu setzen.
        </div>
        <div class="sub-hint">
          Das Wehr-Linien-Werkzeug: Klicke für den Startpunkt und bewege die Maus, um den Damm zu ziehen. Ein zweiter Klick setzt das Ende. Die Richtung wird automatisch aus dem Raster abgeleitet.
        </div>

        <!-- Bestehende (eigenständige) Wehre — Polylinien-Zellen sind hier ausgeblendet -->
        <div v-if="classicWeirs.length > 0" class="existing-list">
          <div class="list-title">Vorhandene Wehre</div>
          <div
            v-for="w in classicWeirs"
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
          <SvEmoji emoji="📍" :size="13" /> Linie mit {{ pendingSegments.length }} Segmenten
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
          <SvEmoji emoji="⚠" :size="13" /> hc muss über der Geländehöhe liegen (> {{ terrainZ.toFixed(2) }} m)
        </div>
      </div>
      </template>

    </div>
  </div>
</template>

<script setup>
import SvEmoji from '../common/SvEmoji.vue';
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import SvIcon from '../common/SvIcon.vue';

const props = defineProps({
  toolInstance: { type: Object, default: null }
});

const simStore = useSimulationStore();
const geoStore = useGeoStore();

const isActive = computed(() => simStore.activeTool === 'WEIR');
const weirs    = computed(() => geoStore.weirs);

// Panel einklappbar per Hover (analog ShovelTool/BridgeTool): klappt auch während
// des Zeichnens/Editierens ein, sobald die Maus das Panel verlässt. Nur das offene
// Bestätigungs-Formular (pendingWeir) bleibt sichtbar, damit die Bestätigung nicht
// beim Wegbewegen verschwindet.
const { onPanelEnter, onPanelLeave, panelVisible } =
  useCollapsiblePanel({ forceOpen: () => pendingWeir.value });
const isDrawingAxis = computed(() => props.toolInstance?.state?.value === 'DRAWING');

// ── Polylinien-Modus (editierbar) ───────────────────────────────────────────
import { weir3DState, getWeir3DToolInstance } from '../../composables/editor/useWeir3DTool.js';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';
const weir3d = getWeir3DToolInstance();

// „Fertig": Bearbeitung abschließen UND das Werkzeug deaktivieren (Auto-Reset), damit nicht
// versehentlich gleich die nächste Wehr-Polylinie gezeichnet wird.
const onFinishWeir = () => {
  weir3d.finishEdit();
  simStore.setActiveTool(null);
};
const weirLines = computed(() => geoStore.weirLines);
// Klassische 2-Klick-Wehre: Polylinien-Zellen (lineId ∈ weirLines) hier ausblenden,
// sonst sprengt eine Polylinie mit hunderten Zellen die Liste.
const classicWeirs = computed(() => {
  const polyIds = new Set((geoStore.weirLines || []).map(l => l.id));
  return geoStore.weirs.filter(w => !(w.lineId && polyIds.has(w.lineId)));
});
const editingWeir = computed(() => geoStore.weirLines.find(l => l.id === weir3DState.editingId));
const crestHc = ref(0);
const weirWidth = ref(1);
watch(editingWeir, (l) => {
  if (!l) return;
  crestHc.value = Math.round((l.hc ?? 0) * 100) / 100;
  weirWidth.value = Math.round((l.width ?? 1) * 100) / 100;
}, { immediate: true });
const setMode = (mode) => {
  if (weir3DState.mode === mode) return;
  reset();
  weir3DState.mode = mode; // MapEditor3D-Watcher tauscht das Sub-Tool
};
const editWeirLine = (id) => weir3d.startEdit(id);

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
/* Chrome (Position/Surface/Header/Hints/Buttons/Formulare) kommt GLOBAL aus
   styles/tool-panel.css — WeirTool ist die Vorlage. Hier nur Wehr-Spezifisches. */
.weir-item { display: flex; align-items: center; gap: 6px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.weir-label { font-size: 0.85rem; font-weight: 600; flex: 1; }
.weir-meta { font-size: 0.75rem; color: #7f8c8d; }
.btn-remove { background: none; border: 1px solid #c0392b; color: #c0392b; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.75rem; transition: all 0.2s; }
.btn-remove:hover { background: #c0392b; color: white; }

/* Form */
.state-form { display: flex; flex-direction: column; gap: 10px; }
.location-badge { font-size: 0.78rem; color: #a3e635; background: rgba(139,92,246,0.18); border-radius: 4px; padding: 4px 8px; text-align: center; }

/* Direction grid */
.direction-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
.dir-btn { padding: 6px 4px; border: 1px solid #3a2f5c; background: #12121a; color: #bdc3c7; border-radius: 4px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.15s; }
.dir-btn:hover { background: #6d43d4; border-color: #8b5cf6; color: white; }
.dir-btn.active { background: #8b5cf6; border-color: #a3e635; color: white; }
.dir-hint { font-size: 0.72rem; color: #7f8c8d; line-height: 1.3; min-height: 2.5em; }

/* Buttons */
.mode-switch { display: flex; gap: 6px; margin-bottom: 12px; }
.mode-btn { flex: 1; padding: 6px; border: 1px solid #3a2f5c; border-radius: 5px; background: #12121a; color: #bdc3c7; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.mode-btn.active { border-color: #8b5cf6; background: rgba(139,92,246,0.22); color: #ecf0f1; }
.btn-edit { background: none; border: 1px solid #8b5cf6; color: #a3e635; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.75rem; }
.btn-edit:hover { background: #8b5cf6; color: white; }
.btn-remove-wide { flex: 0 0 auto; padding: 8px 10px; border: 1px solid #c0392b; border-radius: 5px; background: none; color: #c0392b; font-weight: 600; font-size: 0.88rem; cursor: pointer; transition: all 0.2s; }
.btn-remove-wide:hover { background: #c0392b; color: white; }
.btn-slim { flex: 0 0 auto; padding: 6px 10px; font-size: 0.8rem; border: none; border-radius: 5px; font-weight: 600; cursor: pointer; }
.op-soffit { font-size: 0.72rem; color: #95a5a6; display: flex; align-items: center; gap: 4px; }
.op-soffit input { width: 58px; padding: 3px 6px; border-radius: 4px; border: 1px solid #3a2f5c; background: #12121a; color: white; font-size: 0.8rem; outline: none; }
.op-row { padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.op-head { display: flex; align-items: center; justify-content: space-between; }
.op-fields { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
.validation-error { font-size: 0.78rem; color: #e74c3c; text-align: center; margin-top: -4px; }
</style>
