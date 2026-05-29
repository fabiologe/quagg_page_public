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
          </div>

          <!-- Schriftfeld -->
          <div class="settings-group">
            <div class="group-label">Schriftfeld</div>
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
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import { exportPlanPDF, exportVectorPlanPDF } from '../services/IfcPdfExporter.js';
import { LAYER_STYLES } from '../services/LayerStyleManager.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { styleToLegacy } from '../services/VectorStyleEngine.js';
import IfcVectorStyleEditor from './IfcVectorStyleEditor.vue';

const ifc = useIfcStore();

/**
 * Build the resolved {category → legacyStyle} map.
 * Resolution: per-model override > global > default.
 * When multiple IFCs are loaded, each model has its own resolved map — the
 * outline pipeline reads them at draw-time via styleMapPerModel.
 */
function _resolvedStyleMap() {
  const out = {};
  const src = ifc.vectorStyles ?? {};
  for (const cat of Object.keys(src)) out[cat] = styleToLegacy(src[cat]);
  return out;
}
/** Per-model resolved map { modelId: { category: legacyStyle } } for outline overrides. */
function _resolvedStyleMapByModel() {
  const out = {};
  for (const [modelId, override] of Object.entries(ifc.vectorStylesByModel ?? {})) {
    const merged = { ...ifc.vectorStyles, ...override };
    const legacy = {};
    for (const cat of Object.keys(merged)) legacy[cat] = styleToLegacy(merged[cat]);
    out[modelId] = legacy;
  }
  return out;
}

const props = defineProps({
  getSnapshot:           { type: Function, default: null },
  onViewTop:             { type: Function, default: null },
  onViewFront:           { type: Function, default: null },
  onViewSide:            { type: Function, default: null },
  saveRenderState:       { type: Function, default: null },
  restoreRenderState:    { type: Function, default: null },
  applyLayerStyle:       { type: Function, default: null },
  // Scale-accurate snapshot: renders with a custom ortho camera, bypasses viewport camera
  getScaleSnapshot:      { type: Function, default: null }, // (scale, dw, dh, viewDir) => dataUrl|null
  truckCamera:           { type: Function, default: null }, // (dx, dy) => void — pan main camera in Passend mode
  // Kept as no-ops for backward compat — no longer needed
  getOrthoExtent:        { type: Function, default: null },
  setOrthoExtentForScale:{ type: Function, default: null },
  setOrthoExtent:        { type: Function, default: null },
  // Vector export
  getCamera:             { type: Function, default: null }, // () => THREE.Camera|null  (viewport cam)
  getScene:              { type: Function, default: null }, // () => THREE.Scene
  getPlotFrustum:        { type: Function, default: null }, // () => {left,right,top,bottom,position,target,up,viewDir,scaleRatio,drawWidthMm,drawHeightMm}|null
  getCategoryGroups:     { type: Function, default: null }, // () => raw category groups for mesh→category resolution
  getFragmentsList:      { type: Function, default: null }, // () => fragments.list Map<modelId, model>
  getFragmentsManager:   { type: Function, default: null }, // () => FragmentsManager (for rule-based Pset reads)
  getMeasurements:       { type: Function, default: null }, // () => [{ p1, p2, dist }] from IfcViewer
  getWebIfcAPI:          { type: Function, default: null }, // () => { webIfc, modelID, model? }|null
  getSectionCutPlane:    { type: Function, default: null }, // () => THREE.Plane|null
});
const emit = defineEmits(['close']);

const LS_KEY      = 'ifc-pdf-export-form';
const LS_LOGO_KEY = 'ifc-pdf-export-logo';

const PAPER_SIZES = { A0:[841,1189], A1:[594,841], A2:[420,594], A3:[297,420], A4:[210,297] };

const snapshot    = ref(null);
const logoDataUrl = ref(null);
const activeView  = ref('current');
const drawingAreaRef = ref(null);

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
    snapshot.value = props.getScaleSnapshot?.(activeScale.value, dw, dh, _viewDir(), panOffset.x, panOffset.z) ?? null;
  } else {
    // ── Passend mode: pan the main viewport camera ──────────────────────
    // truck() interprets dx/dy as pixel deltas (negate so drag-right shows
    // more of what's to the right, matching natural "grab the canvas" UX).
    props.truckCamera?.(-dx, -dy);
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

const paperAspect = computed(() => {
  const [w, h] = PAPER_SIZES[form.format] ?? [297, 420];
  return form.orientation === 'landscape' ? `${h} / ${w}` : `${w} / ${h}`;
});

// Re-render scale snapshot when paper size or orientation changes
// (drawing area dimensions change → ortho frustum must follow)
watch(() => [form.format, form.orientation], () => {
  if (activeScale.value !== null) {
    const { dw, dh } = drawingDims.value;
    snapshot.value = props.getScaleSnapshot?.(
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
    snapshot.value = props.getSnapshot?.() ?? null;
    return;
  }

  // Reset pan when switching to a different scale
  if (scale !== activeScale.value) { panOffset.x = 0; panOffset.z = 0; }

  if (_preScaleFrustum === null) {
    _preScaleFrustum = true;
    _savedMassstab   = form.massstab;
  }

  if (activeStyleId.value !== 'plan') await selectStyle('plan');

  activeScale.value = scale;
  form.massstab     = `1:${scale}`;

  snapshot.value = props.getScaleSnapshot?.(scale, dw, dh, _viewDir(), panOffset.x, panOffset.z) ?? null;
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
    _savedRenderState = props.saveRenderState?.() ?? null;
  }

  activeStyleId.value = styleId;

  if (styleId === 'realistic' && _savedRenderState) {
    await props.restoreRenderState?.(_savedRenderState);
  } else {
    await props.applyLayerStyle?.(style);
  }

  // Double RAF: frame 1 lets Vue/Three.js process state; frame 2 completes the GPU draw
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  snapshot.value = props.getSnapshot?.() ?? null;
}

// ── Live preview: refresh snapshot from main canvas while in "Passend" mode ──
let _liveTimer = null;

function startLiveRefresh() {
  if (_liveTimer) return;
  _liveTimer = setInterval(() => {
    // Only auto-refresh in Passend mode and not during an active drag
    if (activeScale.value === null && !_isPanning.value) {
      const snap = props.getSnapshot?.();
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
});

onUnmounted(async () => {
  stopLiveRefresh();
  onPanCancel();
  document.removeEventListener('keydown', _onDocKeydown);
  // Restore original render state when the modal is closed
  // This also restores the camera frustum if orthoExtent was saved
  if (_savedRenderState && props.restoreRenderState) {
    await props.restoreRenderState(_savedRenderState);
    _savedRenderState = null;
  }
  _preScaleFrustum = null;
  _savedMassstab   = null;
});

function refreshSnapshot() {
  snapshot.value = props.getSnapshot?.() ?? null;
  activeView.value = 'current';
}

async function setView(dir) {
  activeView.value = dir;
  if (dir === 'top')   await props.onViewTop?.();
  if (dir === 'front') await props.onViewFront?.();
  if (dir === 'side')  await props.onViewSide?.();

  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  if (activeScale.value !== null) {
    panOffset.x = 0; panOffset.z = 0; // view change resets pan
    const { dw, dh } = drawingDims.value;
    snapshot.value = props.getScaleSnapshot?.(activeScale.value, dw, dh, _viewDir(), 0, 0) ?? null;
  } else {
    snapshot.value = props.getSnapshot?.() ?? null;
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

const showStyleEditor = ref(false);
// Category names available in the editor — read from getCategoryGroups()
const _currentCategoryNames = computed(() => {
  const groups = props.getCategoryGroups?.() ?? [];
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

async function doExport() {
  const dims = dimensions.value.map(d => ({ ...d }));
  if (vectorMode.value) {
    // Use the frustum captured during the last scale-snapshot — guarantees the
    // vector plot uses the same world→paper transform as the rendered image.
    const plotFrustum = props.getPlotFrustum?.() ?? null;
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
      scene:          props.getScene?.()  ?? null,
      cutPlane:       props.getSectionCutPlane?.() ?? null,
      ifcData:        props.getWebIfcAPI?.() ?? null,
      categoryGroups:   props.getCategoryGroups?.() ?? null,
      fragmentsList:    props.getFragmentsList?.() ?? null,
      fragmentsManager: props.getFragmentsManager?.() ?? null,
      styleMap:         _resolvedStyleMap(),
      styleMapPerModel: _resolvedStyleMapByModel(),
      rules:            ifc.vectorRules ?? [],
      annotations:      vectorAnnotations.value  ? (ifc.annotations ?? []) : [],
      measurements:     vectorMeasurements.value ? (props.getMeasurements?.() ?? []) : [],
      dimensions:     dims,
      scaleRatio:     activeScale.value ?? null,
      hatch:          vectorHatch.value,
      scaleBar:       vectorScaleBar.value,
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
