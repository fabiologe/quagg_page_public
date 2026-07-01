<template>
  <div
    class="tool-ui-panel bridge-panel"
    :class="{ collapsed: !panelVisible }"
    v-show="isActive"
    @mouseenter="onPanelEnter"
    @mouseleave="onPanelLeave"
  >
    <div class="panel-header">
      <span class="header-icon">🌉</span> Brücke / Durchfahrt
      <span v-if="!panelVisible" class="collapse-dots">···</span>
    </div>

    <Transition name="panel-slide">
    <div class="panel-content" v-if="panelVisible">

      <!-- Polygon-Körper: Footprint zeichnen → Extrusion → Vertex-Editing (einziger Brücken-Modus) -->

        <!-- Footprint zeichnen -->
        <div v-if="bridge3DState.phase === 'DRAW_FOOTPRINT'" class="state-idle">
          <div class="hint drawing-hint" v-if="bridge3DState.draftPoints.length">
            <span class="step-badge">{{ bridge3DState.draftPoints.length }}</span>
            Punkte gesetzt — <strong>Startpunkt anklicken</strong> oder <strong>Enter</strong> schließt das Polygon
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
              <label>Pfeiler-Nasenform</label>
              <select v-model="form3d.pierNose" @change="onNoseChange">
                <option value="">— manuell —</option>
                <option v-for="s in PIER_NOSE_SHAPES" :key="s.value" :value="s.value">{{ s.label }} (Cd≈{{ s.cd }})</option>
              </select>
              <span class="field-hint">Form → Eintrittsverlust (Cd-Vorschlag); die Verbauung steckt schon in der Öffnungsbreite</span>
            </div>
            <div class="input-group">
              <label>Abflussbeiwert Cd</label>
              <input type="number" v-model.number="form3d.Cd" step="0.01" min="0.3" max="1.2" />
              <span class="field-hint">Standard 0.80 · Vorschlag aus Nasenform (überschreibbar)</span>
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
        <div v-else-if="bridge3DState.phase === 'EDIT' || bridge3DState.phase === 'LOOPCUT' || bridge3DState.phase === 'PIER' || bridge3DState.phase === 'SUBDIVIDE'" class="state-idle">
          <div class="location-badge" v-if="editingBridge">
            ✏ {{ editingBridge.id.substring(0, 16) }} · {{ editingBridge.poly.length }} Ecken · {{ editingBridge.cells.length }} Zellen
          </div>
          <div class="opening-stats" v-if="openingStats">
            💧 Effektive Öffnung: <strong>{{ openingStats.open.toFixed(1) }} m</strong>
            · Verbauung durch Pfeiler: <strong>{{ (openingStats.blockage * 100).toFixed(0) }} %</strong>
          </div>
          <template v-if="bridge3DState.phase === 'SUBDIVIDE'">
            <div class="subdiv-modes">
              <button class="btn btn-slim" :class="{ active: bridge3DState.subdivideMode === 'free' }" @click="tool3d.startSubdivide('free')" title="Einzelpunkt auf der nächsten Kante">Frei</button>
              <button class="btn btn-slim" :class="{ active: bridge3DState.subdivideMode === 'u' }" @click="tool3d.startSubdivide('u')" title="Station quer durch → Bogen entlang der Spannweite">Längs ⟂</button>
              <button class="btn btn-slim" :class="{ active: bridge3DState.subdivideMode === 'v' }" @click="tool3d.startSubdivide('v')" title="Station längs → Profil über die Breite">Quer ∥</button>
            </div>
            <div class="hint drawing-hint" v-if="bridge3DState.subdivideMode === 'free'">✚ Frei: Maus an eine Kante → die <strong>graue Kugel</strong> zeigt, wo der Punkt landet; Klick fügt ihn ein</div>
            <div class="hint drawing-hint" v-else>✚ {{ bridge3DState.subdivideMode === 'u' ? 'Längs-Bogen' : 'Quer-Profil' }}: Maus über den Körper → <strong>2 graue Kugeln + Linie</strong> auf den Außenkanten; Klick fügt beide ein</div>
            <div class="sub-hint" v-if="bridge3DState.subdivideMode === 'free'">Rastet auf die nächste Außenkante. Danach die neue Ecke in der Höhe ziehen (Mitte hoch = Bogen). Esc: abbrechen.</div>
            <div class="sub-hint" v-else>Beide Punkte werden vorausgewählt → einen Höhen-Griff ziehen hebt <strong>beide Enden gemeinsam</strong> = symmetrischer Bogen über die volle Breite. Funktioniert auch bei schiefen/eckigen Grundrissen. Esc: abbrechen.</div>
          </template>
          <template v-else-if="bridge3DState.phase === 'LOOPCUT'">
            <div class="hint drawing-hint" v-if="bridge3DState.cutAxis === 'v'">
              ✛ Quer-Stützpunkt: Klick auf den Körper setzt die Querreihe
              <span v-if="bridge3DState.hoverCutV != null"> (v = {{ bridge3DState.hoverCutV.toFixed(2) }})</span>
            </div>
            <div class="hint drawing-hint" v-else>
              ✂ Loop Cut: Klick auf den Körper setzt die Station
              <span v-if="bridge3DState.hoverCutU != null"> (u = {{ bridge3DState.hoverCutU.toFixed(2) }})</span>
            </div>
            <div class="sub-hint">Neuen Stützpunkt setzen, dann die Griffe in der Höhe ziehen (Bogen). Esc: zurück ohne Schnitt</div>
            <div class="validation-error" v-if="bridge3DState.cutInvalid">⚠ Zu nah am Rechengitter — Mindestabstand = Zellweite (feiner ist nicht berechenbar)</div>
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
              Eck-Kugeln in der Höhe ziehen (cyan = Soffitte, grau = Deck) ·
              <strong style="color:#c8915a">braune Boxen = Pfeiler</strong> (anklicken → Maße) ·
              Shift-Klick: Mehrfachauswahl · <strong>S</strong>: Stützpunkt · <strong>P</strong>: Pfeiler · <strong>Enter</strong>: fertig
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
          <!-- Knickpunkt-/Pfeiler-Werkzeuge erst im EDIT-Modus eines Brückenkörpers zeigen
               (während LOOPCUT/PIER ausblenden statt nur ausgrauen → weniger Clutter). -->
          <div class="actions" v-if="bridge3DState.phase === 'EDIT'">
            <button class="btn btn-cancel" @click="tool3d.startSubdivide()" title="Auf eine Kante klicken → neue ziehbare Ecke (für Bögen)">✚ Stützpunkt</button>
            <button class="btn btn-pier" @click="tool3d.startPier()">🛑 Pfeiler</button>
          </div>
          <div class="actions">
            <button class="btn btn-save" @click="onFinishBridge">Fertig</button>
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
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useSimulationStore } from '../../stores/useSimulationStore';
import { useGeoStore } from '../../stores/useGeoStore';
import { bridge3DState, getBridge3DToolInstance } from '../../composables/editor/useBridge3DTool.js';
import { PIER_NOSE_SHAPES, pierShapeCd } from '../../middleware/structureFiles.js';
import { latticeToCells } from '../../utils/BridgeMeshLattice.js';

const simStore = useSimulationStore();
const geoStore = useGeoStore();

const isActive = computed(() => simStore.activeTool === 'BRIDGE');
const bridges  = computed(() => geoStore.bridges);

// ── 3D-Körper-Modus ────────────────────────────────────────────────────────
const tool3d = getBridge3DToolInstance();

const form3d = ref({ soffit: 2.0, deck: 3.0, Cd: 0.80, Tz: 1.5, directionMode: 'AUTO', pierNose: '' });
const isValid3d = computed(() => form3d.value.deck >= form3d.value.soffit + 0.1);

// Pfeiler-Nasenform → vorgeschlagenes Cd (nur Vorschlag; Cd bleibt frei editierbar).
function onNoseChange() {
  if (form3d.value.pierNose) form3d.value.Cd = pierShapeCd(form3d.value.pierNose);
}

const editingBridge = computed(() =>
  geoStore.bridges.find(b => b.id === bridge3DState.editingId)
);

// Effektive Öffnung der editierten Brücke, wie der Solver sie sieht: Σ offene Breite je
// Zelle (cellOpenWidth zieht den Pfeiler-Anteil sub-grid ab) + Verbauungsgrad gegenüber
// der vollen Zellsumme. Macht sichtbar, wie Pfeilerbreite/-position die Öffnung ändern.
const openingStats = computed(() => {
  const b = editingBridge.value;
  const t = geoStore.terrain;
  if (!b || b.kind !== 'mesh3d' || !b.lattice || !t?.gridData) return null;
  const xll = t.xllcorner ?? t.xll ?? 0;
  const yll = t.yllcorner ?? t.yll ?? 0;
  const header = { ncols: t.ncols, nrows: t.nrows, cellsize: t.cellsize, xllcorner: xll, yllcorner: yll };
  let cells;
  try { cells = latticeToCells(b, header, null, { openWidth: true }); } catch { return null; }
  if (!cells.length) return null;
  const cs = t.cellsize;
  const open = cells.reduce((s, c) => s + (c.width ?? cs), 0);
  const gross = cells.length * cs;
  return { open, blockage: gross > 0 ? Math.max(0, 1 - open / gross) : 0 };
});

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
  bridge3DState.phase === 'IDLE' || bridge3DState.phase === 'DRAW_FOOTPRINT'
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

const editMesh3D = (id) => tool3d.startEdit(id);

// ── Einklappbares Panel (Hover) – analog ShovelTool ─────────────────────────
// Idle → nur der Header-Pill ist sichtbar; Hover oder ein aktiver Arbeitsschritt
// (Zeichnen/Formular/3D-Editing) klappt den Inhalt aus. So bleibt es nie mitten
// im Schritt zu und verdeckt im Leerlauf nicht den Viewport.
const hovered = ref(false);
let closeTimer = null;
const onPanelEnter = () => { clearTimeout(closeTimer); hovered.value = true; };
const onPanelLeave = () => { closeTimer = setTimeout(() => { hovered.value = false; }, 200); };

const bridgeBusy = computed(() => !!bridge3DState.phase && bridge3DState.phase !== 'IDLE');
const panelVisible = computed(() => hovered.value || bridgeBusy.value);

// „Fertig": Editing abschließen UND das Werkzeug deaktivieren (Auto-Reset), damit
// nicht versehentlich gleich der nächste Brückenkörper gezeichnet wird.
const onFinishBridge = () => {
  tool3d.finishEdit();
  simStore.setActiveTool(null);
};
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
  cursor: default;
  user-select: none;
}
.header-icon { font-size: 1.1rem; }
.collapse-dots { margin-left: auto; opacity: 0.4; letter-spacing: 2px; font-size: 0.8rem; }

/* Eingeklappt: kompakte Pille, nur der Header bleibt sichtbar (Hover klappt aus). */
.tool-ui-panel.bridge-panel.collapsed {
  min-width: unset;
  padding: 8px 16px;
}
.bridge-panel.collapsed .panel-header {
  border-bottom: none;
  padding-bottom: 0;
  margin-bottom: 0;
}

/* Slide-Transition für den Panel-Inhalt (analog ShovelTool). */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

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
.opening-stats { font-size: 0.78rem; color: #2ecc71; background: rgba(46,204,113,0.12); border-radius: 4px; padding: 4px 8px; text-align: center; margin-top: 6px; }
.opening-stats strong { color: #d7ffe7; }

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

.subdiv-modes { display: flex; gap: 6px; margin-bottom: 8px; }
.btn-slim { padding: 5px 8px; font-size: 0.8rem; }
.subdiv-modes .btn { background: #2c3e50; color: #bdc3c7; border: 1px solid #4a6278; }
.subdiv-modes .btn:hover { background: #34495e; }
.subdiv-modes .btn.active { background: #16a085; color: #fff; border-color: #1abc9c; }

</style>
