<template>
  <DraggableModal
    :isOpen="true"
    initialWidth="940px"
    initialHeight="640px"
    initialTop="70px"
    initialLeft="center"
    @close="emit('close')"
  >
    <div class="pdf-modal">

      <!-- ── Header / drag handle ── -->
      <div class="pdf-header">
        <span class="pdf-title">📄 PDF Plan Export</span>

        <div class="view-presets">
          <span class="presets-label">Ansicht:</span>
          <button class="preset-btn" :class="{ active: activeView==='top'   }" @click="setView('top')">⬇ Draufsicht</button>
          <button class="preset-btn" :class="{ active: activeView==='front' }" @click="setView('front')">🔲 Vorne</button>
          <button class="preset-btn" :class="{ active: activeView==='side'  }" @click="setView('side')">◻ Seite</button>
          <button class="preset-btn refresh-btn" title="Snapshot aktualisieren" @click="refreshSnapshot">🔄</button>

          <span class="presets-sep">|</span>
          <button
            class="preset-btn dim-btn"
            :class="{ active: dimensionMode }"
            :disabled="!activeScale"
            :title="activeScale ? 'Bemaßen — 2 Klicks aufs Bild' : 'Bemaßen erst nach Maßstab-Wahl möglich'"
            @click="toggleDimensionMode"
          >📐 Maße</button>
          <button
            v-if="dimensions.length"
            class="preset-btn dim-clear"
            title="Alle Maße entfernen"
            @click="clearDimensions"
          >✕ {{ dimensions.length }}</button>
        </div>

        <button class="hdr-close" @click="emit('close')">&times;</button>
      </div>

      <!-- ── Body ── -->
      <div class="pdf-body">

        <!-- LEFT: Live preview -->
        <div class="preview-pane">
          <div class="preview-label">Vorschau</div>

          <div class="preview-scroll">
            <div class="paper-sheet" :style="{ aspectRatio: paperAspect }">
              <!-- Drawing area — draggable when a scale is active -->
              <div
                ref="drawingAreaRef"
                class="drawing-area pan-active"
                :class="{ panning: _isPanning, 'dim-mode': dimensionMode }"
                @mousedown="onPanStart"
                @click="onPreviewClick"
                @touchstart.prevent="onPanStart"
              >
                <img
                  v-if="snapshot"
                  :src="snapshot"
                  class="snapshot-img"
                  :style="_isPanning ? { transform: `translate(${_dragPx.x}px, ${_dragPx.y}px)`, transition: 'none' } : { transition: 'transform 0.1s ease' }"
                  draggable="false"
                />
                <div v-else class="no-snapshot">Kein IFC-Modell geladen</div>

                <!-- Dimension overlay (SVG) — rendered when scale is active and dimensions exist -->
                <svg v-if="dimensions.length || dimPending" class="dim-overlay" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <!-- Completed dimensions -->
                  <g v-for="(d, i) in dimensions" :key="'d-' + i" class="dim-shape">
                    <line :x1="d.p1.x" :y1="d.p1.y" :x2="d.p2.x" :y2="d.p2.y" />
                    <circle :cx="d.p1.x" :cy="d.p1.y" r="0.4" />
                    <circle :cx="d.p2.x" :cy="d.p2.y" r="0.4" />
                    <text
                      :x="(d.p1.x + d.p2.x) / 2"
                      :y="(d.p1.y + d.p2.y) / 2 - 1.5"
                      text-anchor="middle"
                    >{{ _formatDim(d.distInMeters) }}</text>
                  </g>
                  <!-- Pending first point -->
                  <circle v-if="dimPending" :cx="dimPending.x" :cy="dimPending.y" r="0.6" class="dim-pending" />
                </svg>

                <div v-if="snapshot && !dimensionMode" class="pan-hint">↔ ziehen zum Verschieben</div>
                <div v-if="dimensionMode" class="dim-hint">
                  📐 {{ dimPending ? '2. Punkt setzen' : '1. Punkt setzen' }} — Esc verlässt
                </div>
              </div>
              <!-- Title block preview -->
              <div class="tb-preview">
                <div class="tb-row tb-row1">
                  <div class="tb-cell tb-col-40">
                    <span class="tb-lbl">Projekt</span>
                    <span class="tb-val">{{ form.projekt }}</span>
                  </div>
                  <div class="tb-cell tb-col-25">
                    <span class="tb-lbl">Auftraggeber</span>
                    <span class="tb-val">{{ form.auftraggeber }}</span>
                  </div>
                  <div class="tb-cell tb-col-17">
                    <span class="tb-lbl">Bearbeiter</span>
                    <span class="tb-val">{{ form.bearbeiter }}</span>
                  </div>
                  <div class="tb-cell tb-col-18 tb-logo-cell">
                    <img v-if="logoDataUrl" :src="logoDataUrl" class="tb-logo-img" />
                    <template v-else>
                      <span class="tb-lbl">Firma</span>
                      <span class="tb-val">{{ form.firma }}</span>
                    </template>
                  </div>
                </div>
                <div class="tb-row tb-row2">
                  <div class="tb-cell tb-col-40">
                    <span class="tb-lbl">Nr.</span>
                    <span class="tb-val">{{ form.nummer }}</span>
                  </div>
                  <div class="tb-cell tb-col-25">
                    <span class="tb-lbl">Datum</span>
                    <span class="tb-val">{{ form.datum || today }}</span>
                  </div>
                  <div class="tb-cell tb-col-17">
                    <span class="tb-lbl">Maßstab</span>
                    <span class="tb-val">{{ form.massstab || '1:100' }}</span>
                  </div>
                  <div class="tb-cell tb-col-18">
                    <span class="tb-lbl">Rev.</span>
                    <span class="tb-val">{{ form.index || 'A' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT: Settings -->
        <div class="settings-pane">

          <!-- Format -->
          <div class="settings-group">
            <div class="group-label">Papierformat</div>
            <div class="format-btns">
              <button
                v-for="f in ['A0','A1','A2','A3','A4']"
                :key="f"
                class="fmt-btn"
                :class="{ active: form.format === f }"
                @click="form.format = f"
              >{{ f }}</button>
            </div>
          </div>

          <!-- Layer Style -->
          <div class="settings-group">
            <div class="group-label">Layerstil</div>
            <div class="style-btns">
              <button
                v-for="s in availableStyles"
                :key="s.id"
                class="style-btn"
                :class="{ active: activeStyleId === s.id }"
                @click="selectStyle(s.id)"
              >{{ s.label }}</button>
            </div>
            <div class="style-hint">Wird temporär für Vorschau angewendet</div>
          </div>

          <!-- Orientation -->
          <div class="settings-group">
            <div class="group-label">Ausrichtung</div>
            <div class="orient-btns">
              <button class="orient-btn" :class="{ active: form.orientation === 'landscape' }" @click="form.orientation = 'landscape'">
                <span class="orient-icon landscape-icon"></span> Querformat
              </button>
              <button class="orient-btn" :class="{ active: form.orientation === 'portrait' }" @click="form.orientation = 'portrait'">
                <span class="orient-icon portrait-icon"></span> Hochformat
              </button>
            </div>
          </div>

          <!-- Maßstab -->
          <div class="settings-group">
            <div class="group-label">Maßstab</div>
            <div class="scale-btns">
              <button
                class="scale-btn"
                :class="{ active: activeScale === null }"
                @click="selectScale(null)"
              >Passend</button>
              <button
                v-for="s in SCALE_OPTIONS.filter(x => x !== null)"
                :key="s"
                class="scale-btn"
                :class="{ active: activeScale === s }"
                @click="selectScale(s)"
              >1:{{ s }}</button>
            </div>
            <div class="scale-hint">Erfordert Orthogonalmodus (Planungslayer)</div>

            <!-- Overview mini-map: tightly coupled to scale selection -->
            <div v-if="overviewData" class="overview-pane">
              <div class="overview-label">
                <span>🗺 Übersicht</span>
                <span class="overview-hint">{{ overviewHint }}</span>
              </div>
              <div class="overview-canvas-stack" :style="{ width: OVERVIEW_W + 'px', height: OVERVIEW_H + 'px' }">
                <!-- 3D layer: a real second renderer pointing at the main scene -->
                <canvas
                  ref="overview3dCanvas"
                  :width="OVERVIEW_W"
                  :height="OVERVIEW_H"
                  class="overview-3d"
                />
                <!-- 2D layer: rectangle, crosshair, zoom badge, input handlers -->
                <canvas
                  ref="overviewCanvas"
                  :width="OVERVIEW_W"
                  :height="OVERVIEW_H"
                  class="overview-canvas overview-overlay"
                  :title="overviewHint"
                  @mousedown="onOverviewMouseDown"
                  @wheel.prevent="onOverviewWheel"
                  @dblclick="onOverviewDblClick"
                />
              </div>
            </div>
          </div>

          <!-- Schriftfeld -->
          <div class="settings-group">
            <div class="group-label">
              Schriftfeld
              <button
                v-if="cde.activeProject"
                class="autofill-btn"
                @click="fillFromProject"
                title="Projekt-Nr., Bezeichnung, Bauherr und Bearbeiter aus den Projekt-Stammdaten übernehmen"
              >⤵ Aus Projekt</button>
            </div>
            <div class="fields-grid">
              <label>Projektname</label>
              <input v-model="form.projekt"      class="field-input" placeholder="Projektname" />
              <label>Auftraggeber</label>
              <input v-model="form.auftraggeber" class="field-input" placeholder="Auftraggeber" />
              <label>Bearbeiter</label>
              <input v-model="form.bearbeiter"   class="field-input" placeholder="Bearbeiter" />
              <label>Firma</label>
              <input v-model="form.firma"        class="field-input" placeholder="Firma" />
              <label>Zeichnungs-Nr.</label>
              <input v-model="form.nummer"       class="field-input" placeholder="z.B. P-2026-001" />
              <label>Datum</label>
              <input v-model="form.datum"        class="field-input" :placeholder="today" />
              <label>Maßstab</label>
              <input v-model="form.massstab" class="field-input" placeholder="1:100"
                     :readonly="activeScale !== null"
                     :title="activeScale !== null ? 'Maßstab wird durch Selektion oben gesetzt' : ''" />
              <label>Index (Rev.)</label>
              <input v-model="form.index"        class="field-input" placeholder="A" />
            </div>
          </div>

          <!-- Logo -->
          <div class="settings-group">
            <div class="group-label">Firmenlogo</div>
            <div class="logo-row">
              <img v-if="logoDataUrl" :src="logoDataUrl" class="logo-thumb" />
              <label class="logo-upload-btn">
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" @change="onLogoUpload" class="sr-only" />
                {{ logoDataUrl ? '🔄 Ändern' : '🖼 Logo laden' }}
              </label>
              <button v-if="logoDataUrl" class="logo-clear-btn" @click="clearLogo" title="Logo entfernen">✕</button>
            </div>
            <div class="logo-hint">Wird im Browser gespeichert</div>
          </div>

          <!-- Vector mode -->
          <div class="settings-group vector-group">
            <label class="vector-toggle">
              <input type="checkbox" v-model="vectorMode" />
              <span>📏 Vektor-Plot aktivieren</span>
            </label>

            <div v-if="vectorMode" class="vector-sub-opts">
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorIncludeRaster" />
                <span>Raster-Snapshot als Hintergrund</span>
              </label>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorHatch" />
                <span>Schraffuren in Schnittflächen</span>
              </label>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorScaleBar" />
                <span>Maßstabsbalken + Nordpfeil</span>
              </label>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorAnnotations" />
                <span>Notizen ({{ ifc.annotations.length }}) einfügen</span>
              </label>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorMeasurements" />
                <span>Messungen einfügen</span>
              </label>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorLabels" />
                <span>Element-Beschriftungen</span>
              </label>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorIfcGrids" />
                <span>IFC-Achsenraster</span>
              </label>

              <!-- Sprint T1: Tiefbau-Lageplan -->
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorSlopeHatch" />
                <span>Böschungsschraffur (Gelände)</span>
              </label>
              <div v-if="vectorSlopeHatch" class="vector-subrow">
                <label>ab <input type="number" min="5" max="80" v-model.number="slopeMinAngle" class="num-input" />°</label>
                <label>Abstand <input type="number" min="1" max="10" step="0.5" v-model.number="slopeTickSpacingMm" class="num-input" /> mm</label>
              </div>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorContours" />
                <span>Höhenlinien</span>
              </label>
              <div v-if="vectorContours" class="vector-subrow">
                <label>Intervall
                  <select v-model.number="contourInterval" class="num-select">
                    <option :value="0.1">0,10 m</option>
                    <option :value="0.25">0,25 m</option>
                    <option :value="0.5">0,50 m</option>
                    <option :value="1">1,00 m</option>
                  </select>
                </label>
              </div>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorUtmGrid" />
                <span>UTM-Koordinatenkreuze</span>
              </label>
              <label class="vector-subtoggle">
                <input type="checkbox" v-model="vectorAxisLabels" />
                <span>Haltungsbeschriftung (DN/Länge/Gefälle an der Achse)</span>
              </label>
              <div v-if="vectorScaleBar" class="vector-subrow">
                <label>Nordpfeil-Drehung <input type="number" min="-180" max="180" v-model.number="northAngle" class="num-input" />°</label>
              </div>
              <div class="vector-subrow">
                <label>Wasserzeichen
                  <input type="text" v-model="watermarkText" class="text-input" :placeholder="autoWatermark || '— keins —'" />
                </label>
              </div>
            </div>

            <div v-if="vectorMode" class="vector-style-btn-row">
              <button class="vector-style-btn" @click="showStyleEditor = true">
                🎨 Linienstile bearbeiten
              </button>
            </div>

            <div class="vector-hint">
              Schnitt-Kontur (dicke Linien) + IFC 2D-Geometrie.
              Section Cut empfohlen.
            </div>
          </div>

          <!-- Vector Style Editor (mounted at root so it can teleport) -->
          <IfcVectorStyleEditor
            :open="showStyleEditor"
            :categoryNames="_currentCategoryNames"
            :modelList="ifc.modelList ?? []"
            @close="showStyleEditor = false"
          />

          <!-- T2: Tiefbau-Profile + CAD-Austausch -->
          <div class="settings-group">
            <div class="group-label">Tiefbau-Profile &amp; CAD</div>
            <div class="profile-btn-col">
              <button class="profile-btn" :disabled="profileBusy" @click="doExportDxf"
                      title="Lageplan als DXF R12 in Rohkoordinaten — zur Weiterbearbeitung in CAD/GIS">
                {{ profileBusy === 'dxf' ? '⏳ DXF…' : '📐 Lageplan als DXF' }}
              </button>
              <button class="profile-btn" :disabled="profileBusy" @click="doExportLaengsschnitt"
                      title="Kanal-Längsschnitt (Bandschnitt) aus Haltungsachsen + Gelände">
                {{ profileBusy === 'ls' ? '⏳ Längsschnitt…' : '📉 Kanal-Längsschnitt (PDF)' }}
              </button>
              <button class="profile-btn" :disabled="profileBusy" @click="doExportQuerprofile"
                      title="Querprofile in Stations-Serie">
                {{ profileBusy === 'qp' ? '⏳ Querprofile…' : '📊 Querprofile (PDF)' }}
              </button>
            </div>
            <div class="vector-subrow">
              <label>H-Maßstab
                <select v-model.number="lsScaleV" class="num-select">
                  <option :value="100">1:100</option>
                  <option :value="200">1:200</option>
                </select>
              </label>
              <label>Querprofil alle
                <select v-model.number="qpInterval" class="num-select">
                  <option :value="10">10 m</option>
                  <option :value="25">25 m</option>
                  <option :value="50">50 m</option>
                </select>
              </label>
            </div>
          </div>

          <!-- Export -->
          <button class="export-btn" :disabled="!snapshot" @click="doExport">
            {{ snapshot ? (vectorMode ? '📏 Als Vektor-PDF exportieren' : '📄 Als PDF exportieren') : '⚠ Kein Modell geladen' }}
          </button>

        </div>
      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import * as THREE from 'three';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import { exportPlanPDF, exportVectorPlanPDF, exportVectorPlanDXF } from '../services/IfcPdfExporter.js';
import { buildLaengsschnittFromModel } from '../services/LaengsschnittBuilder.js';
import { exportLaengsschnittPDF, exportQuerprofilePDF } from '../services/LaengsschnittPdf.js';
import { LAYER_STYLES } from '../services/LayerStyleManager.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useCdeStore, resolveWatermarkText } from '../stores/useCdeStore.js';
import { styleToLegacy } from '../services/VectorStyleEngine.js';
import IfcVectorStyleEditor from './IfcVectorStyleEditor.vue';
import { useViewerApi } from '../composables/viewerApi.js';

const ifc = useIfcStore();

// Engine-Accessoren kommen per provide/inject aus IfcViewer.vue (siehe
// composables/viewerApi.js) — ersetzt die früheren ~27 Funktions-Props.
const api = useViewerApi();
const cde = useCdeStore();
const emit = defineEmits(['close']);

// ── T1/E5: Wasserzeichen aus dem ISO-19650-Status des geladenen Modells ─────
const autoWatermark = computed(() => {
  const sha = api.getLoadedModelSha?.() ?? null;
  return resolveWatermarkText(cde.dokumente, sha) ?? '';
});

/** T1/E5: Schriftfeld aus den Projekt-Stammdaten befüllen. */
function fillFromProject() {
  const p = cde.activeProject;
  if (!p) return;
  form.projekt      = [p.nummer, p.name].filter(Boolean).join(' — ');
  form.auftraggeber = p.bauherr ?? form.auftraggeber;
  form.bearbeiter   = cde.bearbeiter || form.bearbeiter;
  form.nummer       = p.nummer ?? form.nummer;
  if (p.lph) form.index = `${form.index || 'A'} · ${p.lph}`.slice(0, 24);
}

const LS_KEY      = 'ifc-pdf-export-form';
const LS_LOGO_KEY = 'ifc-pdf-export-logo';

const PAPER_SIZES = { A0:[841,1189], A1:[594,841], A2:[420,594], A3:[297,420], A4:[210,297] };

const snapshot    = ref(null);
const logoDataUrl = ref(null);
const activeView  = ref('current');
const drawingAreaRef = ref(null);

// ── Overview mini-map ────────────────────────────────────────────────────────
// Top-down fit-all snapshot of the model plus a red rectangle showing where
// the current scale viewport sits. Lets the user navigate when zoomed in.
// At very small scales (1:50 on a huge site) the rectangle would shrink to a
// pixel; we then keep it visible via a minimum size and a centre crosshair.
const OVERVIEW_W = 280, OVERVIEW_H = 190;
const OVERVIEW_MIN_RECT_PX = 14; // minimum on-canvas size for the viewport rect
const OVERVIEW_MAX_ZOOM    = 12; // how deep we let the user wheel-zoom in
const overviewHint = computed(() => activeScale.value === null
  ? 'Klick = 1:100 zentrieren · Rechteck = Region wählen · Mausrad = zoomen'
  : 'Klick / Rechteck = verschieben · Mausrad = Übersicht zoomen · Doppelklick = Reset');
const overview3dCanvas = ref(null);   // 2D canvas: receives a blit of the main renderer
const overviewCanvas   = ref(null);   // 2D overlay: markers + input
const overviewData     = ref(null);   // sentinel: truthy once the overview is initialised
let   _overview3dCam   = null;        // ortho camera derived from overviewView
let   _overviewRafId   = null;

// Independent zoom/pan state for the overview viewport. Initialised to fit-all
// when the modal opens, then mutated by wheel/click handlers.
const overviewView = reactive({ centerX: 0, centerZ: 0, halfW: 1, halfH: 1 });

function resetOverviewView() {
  const b = api.getModelBoundsXZ?.();
  if (!b) return;
  overviewView.centerX = b.centerX;
  overviewView.centerZ = b.centerZ;
  // Add 10% padding so the model doesn't kiss the canvas edge in fit-all.
  const pad = 1.10;
  const halfW = b.width  / 2 * pad;
  const halfH = b.depth  / 2 * pad;
  // Match the canvas aspect so the live render fills the whole pane.
  const canvasAspect = OVERVIEW_W / OVERVIEW_H;
  const worldAspect  = halfW / halfH;
  if (worldAspect > canvasAspect) {
    overviewView.halfW = halfW;
    overviewView.halfH = halfW / canvasAspect;
  } else {
    overviewView.halfH = halfH;
    overviewView.halfW = halfH * canvasAspect;
  }
}

// rAF loop that reuses the MAIN renderer (so it sees the same Fragment buffers
// as the user's viewport) to blit a top-down ortho view of the live scene into
// the overview canvas. Throttled to ~30 fps; pauses when the tab is hidden.
async function initOverviewViewer() {
  if (_overview3dCam) return;
  const scene = api.getMainScene?.();
  if (!scene || !api.renderToCanvas) return;

  // Reveal the canvas stack FIRST so refs become real DOM nodes.
  overviewData.value = { bounds: null };
  await nextTick();

  const cv = overview3dCanvas.value;
  if (!cv) { overviewData.value = null; return; }

  _overview3dCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100000, 100000);
  resetOverviewView();

  const TARGET_INTERVAL_MS = 33; // ~30 fps cap
  let last = 0;
  const tick = (ts) => {
    if (!_overview3dCam) return;
    if (document.visibilityState === 'hidden') {
      _overviewRafId = requestAnimationFrame(tick);
      return;
    }
    if (ts - last >= TARGET_INTERVAL_MS) {
      last = ts;
      _updateOverviewCam();
      try { api.renderToCanvas(cv, _overview3dCam); }
      catch (e) { console.warn('[Overview] renderToCanvas failed', e?.message ?? e); }
      redrawOverview(); // 2D marker layer on top
    }
    _overviewRafId = requestAnimationFrame(tick);
  };
  _overviewRafId = requestAnimationFrame(tick);
}

function _updateOverviewCam() {
  const cy = api.getModelCenterY?.() ?? 0;
  _overview3dCam.left   = -overviewView.halfW;
  _overview3dCam.right  =  overviewView.halfW;
  _overview3dCam.top    =  overviewView.halfH;
  _overview3dCam.bottom = -overviewView.halfH;
  // Looking straight down (top view). up=(0,0,-1) so world +Z points to the
  // top of the canvas (the standard "Z = north" plan convention).
  _overview3dCam.position.set(overviewView.centerX, cy + 10000, overviewView.centerZ);
  _overview3dCam.up.set(0, 0, -1);
  _overview3dCam.lookAt(overviewView.centerX, cy, overviewView.centerZ);
  _overview3dCam.updateProjectionMatrix();
}

function disposeOverviewViewer() {
  if (_overviewRafId) { cancelAnimationFrame(_overviewRafId); _overviewRafId = null; }
  _overview3dCam = null;
}

function redrawOverview() {
  // The 3D content is rendered by the WebGL canvas underneath; this layer
  // only draws the 2D markers (frame, zoom badge, viewport rectangle,
  // crosshair, centre dot).
  const cv = overviewCanvas.value;
  if (!cv || !overviewData.value) return;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);

  // Zoom indicator (top-right) when the user has zoomed in past fit-all.
  const bxz = api.getModelBoundsXZ?.();
  if (bxz) {
    const fitHalfW = bxz.width * 0.55; // matches the pad=1.10 in resetOverviewView
    const zoomLevel = fitHalfW > 0 ? fitHalfW / overviewView.halfW : 1;
    if (zoomLevel > 1.05) {
      ctx.font = '10px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(`${zoomLevel.toFixed(1)}×`, cv.width - 5, 4);
    }
  }

  // Viewport rectangle: only meaningful for the top-down plan view because
  // the overview is itself a top-down render.
  if (activeScale.value === null || _viewDir() !== 'top' || !bxz) return;

  const { dw, dh } = drawingDims.value;
  const halfW = (dw / 1000 * activeScale.value) / 2;
  const halfH = (dh / 1000 * activeScale.value) / 2;
  // Match getScaleSnapshot's target = controls.target + panOffset.
  const ct = api.getCameraTarget?.() ?? { x: bxz.centerX, z: bxz.centerZ };
  const tx = ct.x + panOffset.x;
  const tz = ct.z + panOffset.z;

  const sx = cv.width  / (overviewView.halfW * 2);
  const sz = cv.height / (overviewView.halfH * 2);
  const cx = (tx - (overviewView.centerX - overviewView.halfW)) * sx;
  const cz = (tz - (overviewView.centerZ - overviewView.halfH)) * sz;
  const rawW = (halfW * 2) * sx;
  const rawH = (halfH * 2) * sz;

  // Clamp to a minimum visible size so the rect never disappears on huge sites.
  const drawW = Math.max(rawW, OVERVIEW_MIN_RECT_PX);
  const drawH = Math.max(rawH, OVERVIEW_MIN_RECT_PX);
  const rx = cx - drawW / 2;
  const ry = cz - drawH / 2;
  const tooSmall = rawW < OVERVIEW_MIN_RECT_PX || rawH < OVERVIEW_MIN_RECT_PX;

  // Always-visible crosshair lines that span the whole canvas — make the
  // current centre easy to locate even when the viewport rectangle is tiny.
  ctx.strokeStyle = 'rgba(229, 57, 53, 0.35)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, 0); ctx.lineTo(cx, cv.height);
  ctx.moveTo(0, cz); ctx.lineTo(cv.width, cz);
  ctx.stroke();
  ctx.setLineDash([]);

  // Viewport rectangle: solid red outline + faint fill
  ctx.strokeStyle = '#e53935';
  ctx.lineWidth = tooSmall ? 2 : 1.6;
  ctx.fillStyle = 'rgba(229, 57, 53, 0.18)';
  ctx.fillRect(rx, ry, drawW, drawH);
  ctx.strokeRect(rx, ry, drawW, drawH);

  // Centre marker — always sharp + visible, even when rect is much larger.
  ctx.fillStyle = '#e53935';
  ctx.beginPath();
  ctx.arc(cx, cz, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// ── Overview interaction: click to centre, drag to fit a rectangle ─────────
const CLICK_DRAG_PX = 5; // px threshold below which a press is treated as a click
let   _ovDrag = null;    // { startPx:{x,y}, currentPx:{x,y} } during an active drag

function _ovCanvasToWorld(px, py) {
  // Convert canvas pixel coords → world XZ via the current overview view
  // (which may be zoomed-in compared to the full fit-all data.bounds).
  const cv = overviewCanvas.value;
  if (!overviewData.value || !cv) return null;
  return {
    x: overviewView.centerX - overviewView.halfW + (px / cv.width)  * overviewView.halfW * 2,
    z: overviewView.centerZ - overviewView.halfH + (py / cv.height) * overviewView.halfH * 2,
  };
}

function _ovEventToCanvasPx(e) {
  const cv = overviewCanvas.value;
  if (!cv) return { x: 0, y: 0 };
  const rect = cv.getBoundingClientRect();
  const scaleX = cv.width  / rect.width;
  const scaleY = cv.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
}

function onOverviewMouseDown(e) {
  if (!overviewData.value) return;
  if (e.button !== 0) return;
  e.preventDefault();
  _ovDrag = { startPx: _ovEventToCanvasPx(e), currentPx: _ovEventToCanvasPx(e) };
  document.addEventListener('mousemove', _onOverviewMove);
  document.addEventListener('mouseup',   _onOverviewUp);
}

function onOverviewWheel(e) {
  if (!overviewData.value) return;
  e.preventDefault();
  const px = _ovEventToCanvasPx(e);
  const before = _ovCanvasToWorld(px.x, px.y);
  if (!before) return;

  // Smooth multiplicative zoom — deltaY < 0 = scroll up = zoom in.
  const factor = e.deltaY < 0 ? 1 / 1.18 : 1.18;
  const bxz = api.getModelBoundsXZ?.();
  const maxHalfW = bxz ? (bxz.maxX - bxz.minX) / 2 : overviewView.halfW * 16;
  const maxHalfH = bxz ? (bxz.maxZ - bxz.minZ) / 2 : overviewView.halfH * 16;
  const minHalfW = maxHalfW / OVERVIEW_MAX_ZOOM;
  const minHalfH = maxHalfH / OVERVIEW_MAX_ZOOM;
  overviewView.halfW = Math.max(minHalfW, Math.min(maxHalfW, overviewView.halfW * factor));
  overviewView.halfH = Math.max(minHalfH, Math.min(maxHalfH, overviewView.halfH * factor));

  // Keep the same world point under the cursor (Google-Maps zoom).
  const after = _ovCanvasToWorld(px.x, px.y);
  overviewView.centerX += before.x - after.x;
  overviewView.centerZ += before.z - after.z;

  // Clamp pan so the view never leaves the model bbox.
  if (bxz) {
    overviewView.centerX = Math.max(bxz.minX + overviewView.halfW, Math.min(bxz.maxX - overviewView.halfW, overviewView.centerX));
    overviewView.centerZ = Math.max(bxz.minZ + overviewView.halfH, Math.min(bxz.maxZ - overviewView.halfH, overviewView.centerZ));
  }
  // No explicit refresh: the rAF loop picks up the new view on the next tick.
}

function onOverviewDblClick() {
  if (!overviewData.value) return;
  resetOverviewView();
  // rAF loop picks up the new view on the next tick.
}

function _onOverviewMove(e) {
  if (!_ovDrag) return;
  _ovDrag.currentPx = _ovEventToCanvasPx(e);
  redrawOverview();
  const cv = overviewCanvas.value;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const x0 = Math.min(_ovDrag.startPx.x, _ovDrag.currentPx.x);
  const y0 = Math.min(_ovDrag.startPx.y, _ovDrag.currentPx.y);
  const w  = Math.abs(_ovDrag.currentPx.x - _ovDrag.startPx.x);
  const h  = Math.abs(_ovDrag.currentPx.y - _ovDrag.startPx.y);
  // Cyan-tinted rectangle so it stands out against the red viewport rect.
  ctx.fillStyle = 'rgba(79, 195, 247, 0.18)';
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = '#4fc3f7';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 2]);
  ctx.strokeRect(x0, y0, w, h);
  ctx.setLineDash([]);
}

async function _onOverviewUp(e) {
  document.removeEventListener('mousemove', _onOverviewMove);
  document.removeEventListener('mouseup',   _onOverviewUp);
  if (!_ovDrag) return;
  const drag = _ovDrag;
  _ovDrag = null;

  const dx = Math.abs(drag.currentPx.x - drag.startPx.x);
  const dy = Math.abs(drag.currentPx.y - drag.startPx.y);
  const isClick = dx < CLICK_DRAG_PX && dy < CLICK_DRAG_PX;

  const bxz = api.getModelBoundsXZ?.();
  if (!bxz) { redrawOverview(); return; }

  // Convert click / drag-rect-centre to world coordinates.
  const worldStart = _ovCanvasToWorld(drag.startPx.x, drag.startPx.y);
  if (!worldStart) return;
  let targetX, targetZ;
  if (isClick) {
    targetX = worldStart.x;
    targetZ = worldStart.z;
  } else {
    const worldEnd = _ovCanvasToWorld(drag.currentPx.x, drag.currentPx.y);
    if (!worldEnd) return;
    targetX = (worldStart.x + worldEnd.x) / 2;
    targetZ = (worldStart.z + worldEnd.z) / 2;
  }
  // getScaleSnapshot renders at `controls.target + panOffset`, so panOffset
  // must be expressed relative to the live controls target — not the model
  // bbox centre (those only match when the user hasn't panned the main view).
  const ct = api.getCameraTarget?.() ?? { x: bxz.centerX, z: bxz.centerZ };
  panOffset.x = targetX - ct.x;
  panOffset.z = targetZ - ct.z;

  // Scale policy: the user's scale choice is sacred.
  //  - Scale active           → pan only, never change the scale.
  //  - Passend (kein Maßstab) + Drag → auto-fit smallest scale that contains the rect.
  //  - Passend + Click        → default to 1:100 (otherwise the click would do nothing visible).
  if (activeScale.value !== null) {
    const { dw, dh } = drawingDims.value;
    snapshot.value = api.getScaleSnapshot?.(activeScale.value, dw, dh, _viewDir(), panOffset.x, panOffset.z) ?? null;
    return;
  }

  if (isClick) {
    await selectScale(100);
    return;
  }

  // Passend + Drag-to-rect → fit-to-rect
  const worldEnd = _ovCanvasToWorld(drag.currentPx.x, drag.currentPx.y);
  const rectW = Math.abs(worldEnd.x - worldStart.x);
  const rectD = Math.abs(worldEnd.z - worldStart.z);
  const { dw, dh } = drawingDims.value;
  const scales = SCALE_OPTIONS.filter(s => s !== null).sort((a, b) => a - b);
  let chosen = scales[scales.length - 1];
  for (const s of scales) {
    if ((dw / 1000) * s >= rectW && (dh / 1000) * s >= rectD) { chosen = s; break; }
  }
  await selectScale(chosen);
}

// ── Pan state ─────────────────────────────────────────────────────────────────
// panOffset: accumulated world-unit offset (metres) from user drag operations
const panOffset = reactive({ x: 0, z: 0 });
// _dragPx: live CSS pixel offset during active drag (CSS transform feedback)
const _dragPx   = reactive({ x: 0, y: 0 });
const _isPanning = ref(false);
let   _panStart  = null; // { clientX, clientY } at drag start

function _getEventPos(e) {
  // touchend has empty touches[] — must use changedTouches
  const touch = e.changedTouches?.[0] ?? e.touches?.[0];
  if (touch) return { clientX: touch.clientX, clientY: touch.clientY };
  return { clientX: e.clientX, clientY: e.clientY };
}

function onPanStart(e) {
  if (!snapshot.value) return;
  _isPanning.value = true;
  _panStart        = _getEventPos(e);
  _dragPx.x = 0; _dragPx.y = 0;
  // Document-level so drag survives the mouse leaving the element
  document.addEventListener('mousemove', onPanMove);
  document.addEventListener('mouseup',   onPanEnd);
  document.addEventListener('touchmove', onPanMove, { passive: false });
  document.addEventListener('touchend',  onPanEnd);
}

function onPanMove(e) {
  if (!_isPanning.value || !_panStart) return;
  if (e.cancelable) e.preventDefault();
  const pos = _getEventPos(e);
  _dragPx.x = pos.clientX - _panStart.clientX;
  _dragPx.y = pos.clientY - _panStart.clientY;
}

async function onPanEnd(e) {
  if (!_isPanning.value || !_panStart) return;
  document.removeEventListener('mousemove', onPanMove);
  document.removeEventListener('mouseup',   onPanEnd);
  document.removeEventListener('touchmove', onPanMove);
  document.removeEventListener('touchend',  onPanEnd);

  const pos = _getEventPos(e);
  const dx  = pos.clientX - _panStart.clientX;
  const dy  = pos.clientY - _panStart.clientY;
  _isPanning.value = false; _panStart = null;
  _dragPx.x = 0; _dragPx.y = 0;

  if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return; // was a click, not a drag

  if (activeScale.value !== null) {
    // ── Scale mode: shift the ortho frustum's centre, re-render ──────────
    const el = drawingAreaRef.value;
    if (!el) return;
    const { dw, dh } = drawingDims.value;
    panOffset.x -= dx / el.offsetWidth  * ((dw / 1000) * activeScale.value);
    panOffset.z -= dy / el.offsetHeight * ((dh / 1000) * activeScale.value);
    snapshot.value = api.getScaleSnapshot?.(activeScale.value, dw, dh, _viewDir(), panOffset.x, panOffset.z) ?? null;
  } else {
    // ── Passend mode: pan the main viewport camera ──────────────────────
    // truck() interprets dx/dy as pixel deltas (negate so drag-right shows
    // more of what's to the right, matching natural "grab the canvas" UX).
    api.truckCamera?.(-dx, -dy);
    // Live-refresh timer will pick up the new view on the next tick
  }
}

function onPanCancel() {
  document.removeEventListener('mousemove', onPanMove);
  document.removeEventListener('mouseup',   onPanEnd);
  document.removeEventListener('touchmove', onPanMove);
  document.removeEventListener('touchend',  onPanEnd);
  if (!_isPanning.value) return;
  _isPanning.value = false; _panStart = null;
  _dragPx.x = 0; _dragPx.y = 0;
}

const today = new Date().toLocaleDateString('de-DE');

const saved = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } })();
const form = reactive({
  format:       'A3',
  orientation:  'landscape',
  projekt:      '',
  auftraggeber: '',
  bearbeiter:   '',
  firma:        '',
  nummer:       '',
  datum:        '',
  massstab:     '1:100',
  index:        'A',
  ...saved,
});

watch(form, val => {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ...val })); } catch { /* quota */ }
}, { deep: true });

// T1/E5: Erstbefüllung aus den Projekt-Stammdaten, solange noch kein
// gespeichertes Formular existiert (gespeicherte Eingaben gewinnen immer).
if (!Object.keys(saved).length && cde.activeProject) fillFromProject();

const paperAspect = computed(() => {
  const [w, h] = PAPER_SIZES[form.format] ?? [297, 420];
  return form.orientation === 'landscape' ? `${h} / ${w}` : `${w} / ${h}`;
});

// Re-render scale snapshot when paper size or orientation changes
// (drawing area dimensions change → ortho frustum must follow)
watch(() => [form.format, form.orientation], () => {
  if (activeScale.value !== null) {
    const { dw, dh } = drawingDims.value;
    snapshot.value = api.getScaleSnapshot?.(
      activeScale.value, dw, dh, _viewDir(), panOffset.x, panOffset.z
    ) ?? null;
  }
});

// ── Scale selector ────────────────────────────────────────────────────────────
const SCALE_OPTIONS = [null, 50, 100, 200, 500, 1000]; // null = Passend (auto-fit)
const activeScale   = ref(null);
let _preScaleFrustum = null; // saves frustum before first scale adjustment
let _savedMassstab   = null; // saves user-typed massstab text before auto-set

// Drawing area dimensions (paper minus margins and title block)
const drawingDims = computed(() => {
  const [pw, ph] = PAPER_SIZES[form.format] ?? [297, 420];
  const [W, H]   = form.orientation === 'landscape' ? [ph, pw] : [pw, ph];
  return { dw: W - 20, dh: H - 20 - 40 }; // 2×10mm margin + 40mm title block
});

/** Crop a base64 PNG to a target aspect ratio (centre crop). */
function cropToAspect(dataUrl, targetAspect) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const srcAspect = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAspect > targetAspect) {
        // Canvas wider than paper: crop left and right
        sw = Math.round(img.height * targetAspect);
        sx = Math.round((img.width - sw) / 2);
      } else {
        // Canvas taller than paper: crop top and bottom
        sh = Math.round(img.width / targetAspect);
        sy = Math.round((img.height - sh) / 2);
      }
      const c = document.createElement('canvas');
      c.width = sw; c.height = sh;
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(c.toDataURL('image/png', 0.92));
    };
    img.src = dataUrl;
  });
}

// Map activeView string to engine viewDir parameter
function _viewDir() {
  if (activeView.value === 'front') return 'front';
  if (activeView.value === 'side')  return 'side';
  return 'top'; // default: top-down plan view for scale export
}

async function selectScale(scale) {
  const { dw, dh } = drawingDims.value;

  if (scale === null) {
    activeScale.value = null;
    panOffset.x = 0; panOffset.z = 0;
    if (_savedMassstab !== null) { form.massstab = _savedMassstab; _savedMassstab = null; }
    _preScaleFrustum = null;
    snapshot.value = api.getSnapshot?.() ?? null;
    return;
  }

  // Reset pan when switching to a different scale
  if (scale !== activeScale.value) { panOffset.x = 0; panOffset.z = 0; }

  if (_preScaleFrustum === null) {
    _preScaleFrustum = true;
    _savedMassstab   = form.massstab;
  }

  if (activeStyleId.value !== 'plan') await selectStyle('plan');

  // Smart re-center: if the resulting viewport would lie completely outside
  // the model bbox (e.g. switching 1:1000 → 1:50 left us on a blank wall),
  // snap to model centre so the user lands on something recognisable.
  const bxz = api.getModelBoundsXZ?.();
  if (bxz) {
    const halfW = (dw / 1000 * scale) / 2;
    const halfH = (dh / 1000 * scale) / 2;
    const ct = api.getCameraTarget?.() ?? { x: bxz.centerX, z: bxz.centerZ };
    const tx = ct.x + panOffset.x;
    const tz = ct.z + panOffset.z;
    const outsideX = (tx + halfW) < bxz.minX || (tx - halfW) > bxz.maxX;
    const outsideZ = (tz + halfH) < bxz.minZ || (tz - halfH) > bxz.maxZ;
    if (outsideX || outsideZ) {
      // Centre on model bbox: panOffset = bbox.center - controls.target
      panOffset.x = bxz.centerX - ct.x;
      panOffset.z = bxz.centerZ - ct.z;
    }
  }

  activeScale.value = scale;
  form.massstab     = `1:${scale}`;

  snapshot.value = api.getScaleSnapshot?.(scale, dw, dh, _viewDir(), panOffset.x, panOffset.z) ?? null;
  redrawOverview();
}

// ── Layer styles ─────────────────────────────────────────────────────────────
const availableStyles = Object.values(LAYER_STYLES);
const activeStyleId   = ref('realistic');
let _savedRenderState = null;

async function selectStyle(styleId) {
  const style = LAYER_STYLES[styleId];
  if (!style) return;

  // Save original render state once before first style change
  if (!_savedRenderState) {
    _savedRenderState = api.saveRenderState?.() ?? null;
  }

  activeStyleId.value = styleId;

  if (styleId === 'realistic' && _savedRenderState) {
    await api.restoreRenderState?.(_savedRenderState);
  } else {
    await api.applyLayerStyle?.(style);
  }

  // Double RAF: frame 1 lets Vue/Three.js process state; frame 2 completes the GPU draw
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  snapshot.value = api.getSnapshot?.() ?? null;
}

// ── Live preview: refresh snapshot from main canvas while in "Passend" mode ──
let _liveTimer = null;

function startLiveRefresh() {
  if (_liveTimer) return;
  _liveTimer = setInterval(() => {
    // Only auto-refresh in Passend mode and not during an active drag
    if (activeScale.value === null && !_isPanning.value) {
      const snap = api.getSnapshot?.();
      if (snap) snapshot.value = snap;
    }
  }, 150);
}

function stopLiveRefresh() {
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
}

function _onDocKeydown(e) {
  if (e.key === 'Escape' && dimensionMode.value) toggleDimensionMode();
}

onMounted(() => {
  document.addEventListener('keydown', _onDocKeydown);
});

onMounted(() => {
  const savedLogo = localStorage.getItem(LS_LOGO_KEY);
  if (savedLogo) logoDataUrl.value = savedLogo;
  refreshSnapshot();
  startLiveRefresh();
  initOverviewViewer(); // attaches the second renderer + starts rAF loop
});

// Redraw the viewport rectangle whenever the plot window changes
watch(
  () => [activeScale.value, panOffset.x, panOffset.z, form.format, form.orientation, activeView.value],
  () => redrawOverview(),
);

onUnmounted(async () => {
  stopLiveRefresh();
  onPanCancel();
  disposeOverviewViewer();
  document.removeEventListener('keydown', _onDocKeydown);
  // Restore original render state when the modal is closed
  // This also restores the camera frustum if orthoExtent was saved
  if (_savedRenderState && api.restoreRenderState) {
    await api.restoreRenderState(_savedRenderState);
    _savedRenderState = null;
  }
  _preScaleFrustum = null;
  _savedMassstab   = null;
});

function refreshSnapshot() {
  snapshot.value = api.getSnapshot?.() ?? null;
  activeView.value = 'current';
}

async function setView(dir) {
  activeView.value = dir;
  if (dir === 'top')   await api.onViewTop?.();
  if (dir === 'front') await api.onViewFront?.();
  if (dir === 'side')  await api.onViewSide?.();

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (activeScale.value !== null) {
    panOffset.x = 0; panOffset.z = 0; // view change resets pan
    const { dw, dh } = drawingDims.value;
    snapshot.value = api.getScaleSnapshot?.(activeScale.value, dw, dh, _viewDir(), 0, 0) ?? null;
  } else {
    snapshot.value = api.getSnapshot?.() ?? null;
  }
}

function onLogoUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    logoDataUrl.value = evt.target.result;
    try { localStorage.setItem(LS_LOGO_KEY, evt.target.result); } catch { /* quota */ }
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function clearLogo() {
  logoDataUrl.value = null;
  localStorage.removeItem(LS_LOGO_KEY);
}

const vectorMode          = ref(false);
const vectorIncludeRaster = ref(false); // OFF by default — pure vector for crispness on zoom
const vectorHatch         = ref(true);
const vectorScaleBar      = ref(true);
const vectorAnnotations   = ref(true);   // include pinned notes in the plot
const vectorMeasurements  = ref(true);   // include distance measurements
const vectorLabels        = ref(true);   // render element labels per category-template
const vectorIfcGrids      = ref(false);  // include IFC axes overlay in the PDF plot

// ── Sprint T1: Tiefbau-Lageplan ─────────────────────────────────────────────
const vectorSlopeHatch    = ref(false);  // Böschungsschraffur aus Gelände-Kategorien
const slopeMinAngle       = ref(20);     // ab dieser Neigung (°) gilt eine Fläche als Böschung
const slopeTickSpacingMm  = ref(3);      // Strichabstand auf dem Papier
const vectorContours      = ref(false);  // Höhenlinien
const contourInterval     = ref(0.5);    // Höhenstufen-Abstand in m
const vectorUtmGrid       = ref(false);  // UTM-Gitterkreuze (georeferenzierte Modelle)
const vectorAxisLabels    = ref(true);   // Haltungsbeschriftung entlang der Achse
const northAngle          = ref(0);      // Nordpfeil-Verdrehung in Grad
const watermarkText       = ref('');     // '' = automatisch aus Dokument-Status

const showStyleEditor = ref(false);
// Category names available in the editor — read from getCategoryGroups()
const _currentCategoryNames = computed(() => {
  const groups = api.getCategoryGroups?.() ?? [];
  return groups.map(g => g.name).filter(Boolean);
});

// ── T2.1: Dimensions on the snapshot ─────────────────────────────────────────
// Points are stored as percentages of the drawing-area (0..100) so the SVG
// viewBox 0..100 maps 1:1 and the dimensions stay anchored to the picture
// even when the preview resizes.
const dimensionMode = ref(false);
const dimensions    = ref([]);       // [{p1:{x,y}, p2:{x,y}, distInMeters}]
const dimPending    = ref(null);     // {x,y} | null

function toggleDimensionMode() {
  dimensionMode.value = !dimensionMode.value;
  dimPending.value    = null;
}

function clearDimensions() {
  dimensions.value = [];
  dimPending.value = null;
}

function onPreviewClick(e) {
  if (!dimensionMode.value || !snapshot.value) return;
  const el = drawingAreaRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const p = { x: ((e.clientX - r.left) / r.width) * 100,
              y: ((e.clientY - r.top)  / r.height) * 100 };

  if (!dimPending.value) {
    dimPending.value = p;
    return;
  }

  // Compute real-world distance using the scale + paper width.
  // worldWidth(m) = drawWidthMm/1000 × scale; same for height.
  // Pixel distance scaled to percent (we already use %) × world extent → metres.
  const { dw, dh } = drawingDims.value;
  const scale      = activeScale.value;
  if (!scale) {
    // Without a known scale, distance has no real-world meaning — bail out
    dimPending.value = null;
    return;
  }
  const worldW = (dw / 1000) * scale;
  const worldH = (dh / 1000) * scale;
  const dxN = (p.x - dimPending.value.x) / 100; // normalized
  const dyN = (p.y - dimPending.value.y) / 100;
  const dxM = dxN * worldW;
  const dyM = dyN * worldH;
  const distInMeters = Math.sqrt(dxM * dxM + dyM * dyM);

  dimensions.value.push({ p1: { ...dimPending.value }, p2: p, distInMeters });
  dimPending.value = null;
}

function _formatDim(m) {
  if (m < 1)  return `${(m * 1000).toFixed(0)} mm`;
  if (m < 10) return `${m.toFixed(2)} m`;
  return `${m.toFixed(1)} m`;
}

/** Koordinations-Offset des ersten Modells (UTM-Kreuze: Welt → Rohkoordinate). */
function _firstCoordOffset() {
  const offsets = api.getAllCoordOffsets?.() ?? {};
  const first = Object.values(offsets)[0];
  return first ? { x: first.x, z: first.z } : { x: 0, z: 0 };
}

// ── Sprint T2: DXF + Längsschnitt + Querprofile ─────────────────────────────
const profileBusy = ref(null); // null | 'dxf' | 'ls' | 'qp'
const lsScaleV    = ref(100);
const qpInterval  = ref(25);

async function doExportDxf() {
  profileBusy.value = 'dxf';
  try {
    await exportVectorPlanDXF({
      titleBlock:       { ...form },
      scene:            api.getScene?.() ?? null,
      cutPlane:         api.getSectionCutPlane?.() ?? null,
      ifcData:          api.getWebIfcAPI?.() ?? null,
      categoryGroups:   api.getCategoryGroups?.() ?? null,
      fragmentsList:    api.getFragmentsList?.() ?? null,
      fragmentsManager: api.getFragmentsManager?.() ?? null,
      styleMap:         ifc.resolvedVectorStyleMap,
      rules:            ifc.vectorRules ?? [],
      labelTemplateFor: (cat) => ifc.vectorStyles?.[cat]?.labelTemplate ?? '',
      scaleRatio:       activeScale.value ?? 100,
      coordOffset:      _firstCoordOffset(),
      slopeHatch:       vectorSlopeHatch.value
        ? { enabled: true, minSlopeDeg: slopeMinAngle.value, tickSpacingMm: slopeTickSpacingMm.value }
        : null,
      contours:         vectorContours.value ? { enabled: true, interval: contourInterval.value } : null,
      axisLabels:       vectorAxisLabels.value
        ? { enabled: true, apis: api.getWebIfcAPIs?.() ?? null, coordOffsets: api.getAllCoordOffsets?.() ?? null }
        : null,
    });
  } catch (err) {
    console.error('DXF export error:', err);
    alert('DXF-Export fehlgeschlagen.');
  } finally {
    profileBusy.value = null;
  }
}

async function _buildLsData() {
  return buildLaengsschnittFromModel({
    apis:             api.getWebIfcAPIs?.() ?? [],
    coordOffsets:     api.getAllCoordOffsets?.() ?? {},
    categoryGroups:   api.getCategoryGroups?.() ?? null,
    fragmentsList:    api.getFragmentsList?.() ?? null,
    fragmentsManager: api.getFragmentsManager?.() ?? null,
  });
}

async function doExportLaengsschnitt() {
  profileBusy.value = 'ls';
  try {
    const built = await _buildLsData();
    if (!built) { alert('Keine Haltungsachsen im Modell gefunden (IFCPIPESEGMENT/IFCFLOWSEGMENT mit Axis-Repräsentation).'); return; }
    exportLaengsschnittPDF({
      data: built.data,
      titleBlock: { ...form },
      logo: logoDataUrl.value,
      format: form.format,
      scaleV: lsScaleV.value,
      heightOffsetY: built.heightOffsetY,
    });
  } catch (err) {
    console.error('Längsschnitt export error:', err);
    alert('Längsschnitt-Export fehlgeschlagen.');
  } finally {
    profileBusy.value = null;
  }
}

async function doExportQuerprofile() {
  profileBusy.value = 'qp';
  try {
    const built = await _buildLsData();
    if (!built) { alert('Keine Haltungsachsen im Modell gefunden.'); return; }
    if (!built.sampler) { alert('Kein Gelände im Modell — Querprofile brauchen eine Gelände-Kategorie (IfcGeographicElement/Earthworks).'); return; }
    exportQuerprofilePDF({
      data: built.data,
      sampler: built.sampler,
      titleBlock: { ...form },
      logo: logoDataUrl.value,
      format: form.format,
      interval: qpInterval.value,
      scale: lsScaleV.value,
      heightOffsetY: built.heightOffsetY,
    });
  } catch (err) {
    console.error('Querprofil export error:', err);
    alert('Querprofil-Export fehlgeschlagen.');
  } finally {
    profileBusy.value = null;
  }
}

async function doExport() {
  const dims = dimensions.value.map(d => ({ ...d }));
  if (vectorMode.value) {
    // Use the frustum captured during the last scale-snapshot — guarantees the
    // vector plot uses the same world→paper transform as the rendered image.
    const plotFrustum = api.getPlotFrustum?.() ?? null;
    if (!plotFrustum) {
      alert('Bitte zuerst einen Maßstab wählen — der Vektor-Plot braucht eine definierte Ortho-Ansicht.');
      return;
    }
    await exportVectorPlanPDF({
      snapshot:       vectorIncludeRaster.value ? snapshot.value : null,
      format:         form.format,
      orientation:    form.orientation,
      titleBlock:     { ...form },
      logo:           logoDataUrl.value,
      plotFrustum,
      scene:          api.getScene?.()  ?? null,
      cutPlane:       api.getSectionCutPlane?.() ?? null,
      ifcData:        api.getWebIfcAPI?.() ?? null,
      categoryGroups:   api.getCategoryGroups?.() ?? null,
      fragmentsList:    api.getFragmentsList?.() ?? null,
      fragmentsManager: api.getFragmentsManager?.() ?? null,
      styleMap:         ifc.resolvedVectorStyleMap,
      styleMapPerModel: ifc.resolvedVectorStyleMapByModel,
      rules:            ifc.vectorRules ?? [],
      annotations:      vectorAnnotations.value  ? (ifc.annotations ?? []) : [],
      measurements:     vectorMeasurements.value ? (api.getMeasurements?.() ?? []) : [],
      showLabels:       vectorLabels.value,
      labelTemplateFor: (cat, modelId) => {
        // Per-model override wins over global. Both fall back to '' (off) when
        // the user hasn't set anything explicitly — no built-in defaults forced.
        const override = modelId
          ? ifc.vectorStylesByModel?.[modelId]?.[cat]?.labelTemplate
          : undefined;
        if (typeof override === 'string') return override;
        return ifc.vectorStyles?.[cat]?.labelTemplate ?? '';
      },
      dimensions:     dims,
      scaleRatio:     activeScale.value ?? null,
      hatch:          vectorHatch.value,
      scaleBar:       vectorScaleBar.value,
      ifcGridAxes:    vectorIfcGrids.value ? (api.getIfcGridAxes?.() ?? null) : null,
      // ── Sprint T1: Tiefbau-Lageplan ──
      slopeHatch:     vectorSlopeHatch.value
        ? { enabled: true, minSlopeDeg: slopeMinAngle.value, tickSpacingMm: slopeTickSpacingMm.value }
        : null,
      contours:       vectorContours.value
        ? { enabled: true, interval: contourInterval.value }
        : null,
      utmGrid:        vectorUtmGrid.value
        ? { offset: _firstCoordOffset(), flipNorth: false }
        : null,
      northAngle:     northAngle.value || 0,
      watermark:      (watermarkText.value.trim() || autoWatermark.value) || null,
      axisLabels:     vectorAxisLabels.value
        ? {
            enabled: true,
            apis: api.getWebIfcAPIs?.() ?? null,
            coordOffsets: api.getAllCoordOffsets?.() ?? null,
          }
        : null,
    });
  } else {
    exportPlanPDF({
      snapshot:    snapshot.value,
      format:      form.format,
      orientation: form.orientation,
      titleBlock:  { ...form },
      logo:        logoDataUrl.value,
      dimensions:  dims,
    });
  }
}
</script>

<style scoped>
.pdf-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #0e1018;
  overflow: hidden;
}

/* ── Header ── */
.pdf-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 1rem;
  background: #1a1e2e;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
}
.pdf-header:active { cursor: grabbing; }
.pdf-title { font-size: 0.9rem; font-weight: 700; color: #90caf9; white-space: nowrap; }

.view-presets { display: flex; align-items: center; gap: 0.3rem; flex: 1; }
.presets-label { font-size: 0.7rem; color: #546e7a; margin-right: 0.2rem; }
.preset-btn {
  padding: 0.2rem 0.55rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #90a4ae; font-size: 0.72rem;
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.preset-btn:hover  { background: rgba(255,255,255,0.12); color: #cfd8dc; }
.preset-btn.active { background: rgba(52,152,219,0.28); color: #4fc3f7; border-color: rgba(52,152,219,0.5); }
.refresh-btn { font-size: 0.8rem; }

.hdr-close {
  background: none; border: none; color: #78909c; font-size: 1.3rem;
  cursor: pointer; padding: 0 0.2rem; line-height: 1; border-radius: 4px;
  transition: color 0.12s; margin-left: auto;
}
.hdr-close:hover { color: #ef5350; }

/* ── Body ── */
.pdf-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Left: Preview ── */
.preview-pane {
  flex: 1 1 55%;
  display: flex;
  flex-direction: column;
  padding: 0.75rem;
  background: #13151f;
  border-right: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
}
.preview-label { font-size: 0.65rem; color: #37474f; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.5rem; }
.preview-scroll { flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; }
.overview-pane {
  margin-top: 0.55rem;
  padding: 0.35rem 0.45rem 0.45rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
}
.overview-label {
  display: flex; justify-content: space-between; align-items: baseline; gap: 0.4rem;
  font-size: 0.62rem; color: #b0bec5; margin-bottom: 0.3rem;
}
.overview-hint { font-size: 0.56rem; color: #607d8b; font-weight: normal; }
.overview-canvas-stack {
  position: relative;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  overflow: hidden;
  background: #1c2a35;
}
.overview-3d, .overview-overlay {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  display: block;
}
.overview-3d { pointer-events: none; }
.overview-overlay {
  cursor: crosshair;
  background: transparent;
}
.overview-canvas {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  cursor: crosshair;
}

.paper-sheet {
  background: #fff;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  min-width: 200px;
  flex-shrink: 0;
}

.drawing-area {
  flex: 1;
  overflow: hidden;
  background: #e8eaf0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid #ccc;
  position: relative;
  user-select: none;
}
.drawing-area.pan-active { cursor: grab; }
.drawing-area.pan-active.panning { cursor: grabbing; }
.drawing-area.dim-mode { cursor: crosshair; }
.drawing-area.dim-mode.pan-active { cursor: crosshair; }
.snapshot-img {
  width: 100%;
  height: 100%;
  object-fit: fill; /* fill = no letterboxing, RenderTarget already has correct aspect */
  display: block;
  pointer-events: none;
}
.no-snapshot { font-size: 0.6rem; color: #9e9e9e; }
.pan-hint {
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.58rem;
  color: rgba(0,0,0,0.4);
  background: rgba(255,255,255,0.6);
  padding: 1px 6px;
  border-radius: 3px;
  pointer-events: none;
  white-space: nowrap;
}
.dim-hint {
  position: absolute;
  top: 4px; left: 50%; transform: translateX(-50%);
  font-size: 0.7rem; font-weight: 600;
  color: #1a1a1a;
  background: rgba(255,235,59,0.92);
  padding: 3px 10px;
  border-radius: 4px;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
}

/* SVG overlay with measurements drawn on top of the snapshot */
.dim-overlay {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  pointer-events: none;
}
.dim-shape line {
  stroke: #d50000; stroke-width: 0.25;
}
.dim-shape circle {
  fill: #d50000;
}
.dim-shape text {
  font-size: 2px;
  fill: #d50000;
  font-weight: 700;
  paint-order: stroke;
  stroke: rgba(255,255,255,0.85);
  stroke-width: 0.5;
  stroke-linejoin: round;
}
.dim-pending {
  fill: #ff9800;
  animation: dim-pulse 0.8s ease-in-out infinite;
}
@keyframes dim-pulse {
  0%,100% { opacity: 1; }
  50%     { opacity: 0.4; }
}

.preset-btn.dim-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.preset-btn.dim-clear { background: rgba(213,0,0,0.18); color: #ef9a9a; border-color: rgba(213,0,0,0.35); }
.presets-sep { color: rgba(255,255,255,0.15); margin: 0 0.2rem; }

/* ── Title block preview ── */
.tb-preview {
  flex-shrink: 0;
  background: #fff;
  border-top: 1.5px solid #555;
  display: flex;
  flex-direction: column;
  height: 15%;
  min-height: 36px;
}
.tb-row { display: flex; flex: 1; border-top: 1px solid #aaa; }
.tb-row:first-child { border-top: none; }
.tb-cell {
  border-right: 1px solid #aaa;
  padding: 0.1rem 0.25rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}
.tb-cell:last-child { border-right: none; }
.tb-col-40 { flex: 0 0 40%; }
.tb-col-25 { flex: 0 0 25%; }
.tb-col-17 { flex: 0 0 17%; }
.tb-col-18 { flex: 0 0 18%; }
.tb-lbl { font-size: 0.42rem; color: #888; line-height: 1; }
.tb-val { font-size: 0.58rem; color: #111; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tb-logo-cell { align-items: center; justify-content: center; }
.tb-logo-img { max-width: 80%; max-height: 90%; object-fit: contain; }

/* ── Right: Settings ── */
.settings-pane {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.9rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}

.settings-group { display: flex; flex-direction: column; gap: 0.4rem; }
.group-label { font-size: 0.65rem; font-weight: 700; color: #546e7a; text-transform: uppercase; letter-spacing: 0.07em; }

/* Layer styles */
.style-btns { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.style-btn {
  padding: 0.28rem 0.7rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: #90a4ae; font-size: 0.78rem;
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.style-btn:hover  { background: rgba(255,255,255,0.1); color: #cfd8dc; }
.style-btn.active { background: rgba(52,152,219,0.3); color: #4fc3f7; border-color: rgba(52,152,219,0.55); }
.style-hint { font-size: 0.62rem; color: #37474f; margin-top: 0.15rem; }

.scale-btns { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.scale-btn {
  padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #90a4ae; font-size: 0.72rem;
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.scale-btn:hover  { background: rgba(255,255,255,0.1); color: #cfd8dc; }
.scale-btn.active { background: rgba(102,187,106,0.25); color: #a5d6a7; border-color: rgba(102,187,106,0.5); }
.scale-hint { font-size: 0.62rem; color: #37474f; margin-top: 0.15rem; }

.field-input[readonly] { opacity: 0.55; cursor: default; }

.vector-group { border-top: 1px solid rgba(255,255,255,0.07); padding-top: 0.5rem; }
.vector-toggle { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; color: #b0bec5; font-size: 0.8rem; }
.vector-toggle input[type="checkbox"] { accent-color: #a5d6a7; }
.vector-sub-opts {
  margin: 0.4rem 0 0.2rem 1.2rem;
  display: flex; flex-direction: column; gap: 0.2rem;
  padding-left: 0.5rem;
  border-left: 2px solid rgba(165,214,167,0.25);
}
.vector-subtoggle {
  display: flex; align-items: center; gap: 0.35rem;
  cursor: pointer; color: #90a4ae; font-size: 0.72rem;
}
.vector-subtoggle input[type="checkbox"] { accent-color: #66bb6a; }

/* Sprint T1: Untereinstellungen (Böschung/Höhenlinien/UTM/Wasserzeichen) */
.vector-subrow {
  display: flex; align-items: center; gap: 0.7rem;
  padding-left: 1.5rem;
  font-size: 0.7rem; color: #78909c;
}
.vector-subrow label { display: flex; align-items: center; gap: 0.3rem; }
.num-input {
  width: 3.2rem;
  border: 1px solid #cfd8dc; border-radius: 4px;
  padding: 0.1rem 0.25rem; font-size: 0.72rem;
  text-align: right;
}
.num-select, .text-input {
  border: 1px solid #cfd8dc; border-radius: 4px;
  padding: 0.1rem 0.25rem; font-size: 0.72rem;
}
.text-input { flex: 1; min-width: 7rem; }

.autofill-btn {
  margin-left: 0.5rem;
  background: #e8f5e9; border: 1px solid #a5d6a7; color: #2e7d32;
  border-radius: 4px; padding: 0.1rem 0.45rem;
  font-size: 0.64rem; cursor: pointer; text-transform: none; letter-spacing: 0;
}
.autofill-btn:hover { background: #c8e6c9; }

/* Sprint T2: Profil-/CAD-Buttons */
.profile-btn-col { display: flex; flex-direction: column; gap: 0.3rem; }
.profile-btn {
  background: #eceff1; border: 1px solid #b0bec5; color: #37474f;
  border-radius: 5px; padding: 0.35rem 0.6rem;
  font-size: 0.75rem; cursor: pointer; text-align: left;
}
.profile-btn:hover:not(:disabled) { background: #cfd8dc; }
.profile-btn:disabled { opacity: 0.5; cursor: default; }
.vector-hint { font-size: 0.62rem; color: #37474f; margin-top: 0.2rem; line-height: 1.4; }

.vector-style-btn-row { margin-top: 0.4rem; }
.vector-style-btn {
  width: 100%;
  background: rgba(33,150,243,0.15);
  border: 1px solid rgba(33,150,243,0.4);
  color: #90caf9;
  padding: 0.4rem 0.6rem;
  border-radius: 5px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.12s;
}
.vector-style-btn:hover { background: rgba(33,150,243,0.25); }

.format-btns { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.fmt-btn {
  padding: 0.25rem 0.7rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: #90a4ae; font-size: 0.8rem; font-weight: 600;
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.fmt-btn:hover  { background: rgba(255,255,255,0.1); color: #cfd8dc; }
.fmt-btn.active { background: rgba(52,152,219,0.3); color: #4fc3f7; border-color: rgba(52,152,219,0.55); }

.orient-btns { display: flex; gap: 0.4rem; }
.orient-btn {
  flex: 1; display: flex; align-items: center; gap: 0.4rem; justify-content: center;
  padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: #90a4ae; font-size: 0.75rem;
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.orient-btn:hover  { background: rgba(255,255,255,0.1); }
.orient-btn.active { background: rgba(52,152,219,0.25); color: #4fc3f7; border-color: rgba(52,152,219,0.5); }
.orient-icon { display: inline-block; border: 1.5px solid currentColor; flex-shrink: 0; }
.landscape-icon { width: 16px; height: 11px; }
.portrait-icon  { width: 11px; height: 16px; }

.fields-grid {
  display: grid;
  grid-template-columns: 95px 1fr;
  gap: 0.3rem 0.5rem;
  align-items: center;
}
.fields-grid label { font-size: 0.7rem; color: #78909c; }
.field-input {
  width: 100%; padding: 0.28rem 0.55rem; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);
  color: #cfd8dc; font-size: 0.78rem; outline: none; transition: border-color 0.15s;
}
.field-input:focus { border-color: rgba(52,152,219,0.5); background: rgba(255,255,255,0.07); }
.field-input::placeholder { color: #37474f; }

.logo-row { display: flex; align-items: center; gap: 0.5rem; }
.logo-thumb { height: 32px; max-width: 80px; object-fit: contain; border-radius: 3px; background: #fff; padding: 2px; }
.logo-upload-btn {
  padding: 0.28rem 0.65rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05); color: #90a4ae; font-size: 0.75rem;
  cursor: pointer; transition: background 0.12s;
}
.logo-upload-btn:hover { background: rgba(255,255,255,0.1); color: #cfd8dc; }
.logo-clear-btn {
  background: none; border: none; color: #546e7a; font-size: 0.8rem;
  cursor: pointer; padding: 0.15rem 0.3rem; transition: color 0.12s;
}
.logo-clear-btn:hover { color: #ef5350; }
.logo-hint { font-size: 0.62rem; color: #37474f; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

.export-btn {
  margin-top: auto; width: 100%; padding: 0.6rem;
  background: rgba(52,152,219,0.85); color: #fff; border: none; border-radius: 7px;
  font-size: 0.88rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.export-btn:hover:not(:disabled)  { background: rgba(52,152,219,1); transform: translateY(-1px); }
.export-btn:active:not(:disabled) { transform: translateY(0); }
.export-btn:disabled { background: rgba(84,110,122,0.4); color: #546e7a; cursor: not-allowed; }
</style>
