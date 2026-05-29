<template>
  <DraggableModal
    ref="modalRef"
    :isOpen="true"
    initialWidth="1000px"
    initialHeight="700px"
    initialTop="80px"
    initialLeft="center"
    @close="emit('close')"
  >
    <div class="viewer-wrapper">

      <!-- ── Window chrome ── -->
      <div class="viewer-header">
        <span class="header-title">🏗️ That Open Engine – IFC Viewer</span>
        <div class="header-controls">
          <button class="hdr-btn" @click="modalRef?.toggleMinimize()" title="Minimieren">_</button>
          <button class="hdr-btn" @click="modalRef?.toggleMaximize()" title="Vollbild">□</button>
          <button class="hdr-btn hdr-close" @click="emit('close')" title="Schließen">&times;</button>
        </div>
      </div>

      <!-- ── Canvas + overlays ── -->
      <div class="viewer-body">
        <div class="canvas-root" :class="{ 'measure-cursor': measureActive }" ref="canvasRef"></div>

        <!-- Toolbar: Datei laden -->
        <div class="top-bar">
          <div class="top-bar-left">
            <label class="action-btn primary">
              <input type="file" accept=".ifc" @change="onFileUpload" class="sr-only" />
              📁 IFC laden
            </label>

            <label v-if="modelList.length" class="action-btn secondary">
              <input type="file" accept=".ifc" @change="onFileUploadAdd" class="sr-only" />
              ➕ Hinzufügen
            </label>

            <div class="dropdown" ref="dropdownRef">
              <button class="action-btn secondary" @click="dropdownOpen = !dropdownOpen">
                🏢 Beispiele ▾
              </button>
              <div class="dropdown-menu" :class="{ open: dropdownOpen }">
                <button @click="loadExample('Validated')">Validiertes IFC laden</button>
              </div>
            </div>
          </div>

          <div v-if="loading" class="loading-badge">
            <span class="spinner"></span> Wird geladen…
          </div>
        </div>

        <!-- Full-canvas loading overlay — hides the half-tessellated frames during initial load -->
        <IfcLoadOverlay :visible="loading" />

        <!-- B2: Model tags in separate row below top-bar -->
        <div v-if="modelList.length" class="model-tag-row">
          <span v-for="m in modelList" :key="m.modelId" class="model-tag">
            {{ m.name }}
            <button class="tag-close" @click="removeModel(m.modelId)" title="Entfernen">✕</button>
          </span>
        </div>

        <!-- Kamera-Toolbox (links) -->
        <div class="toolbox">
          <button class="tool-btn" @click="engine?.zoomToFit()" title="Zoom to Fit">🔍<small>Fit</small></button>
          <button class="tool-btn" @click="engine?.viewTop()"   title="Draufsicht">⬇️<small>Oben</small></button>
          <button class="tool-btn" @click="engine?.viewFront()" title="Vorderansicht">🔲<small>Vorne</small></button>
          <button class="tool-btn" @click="engine?.viewSide()"  title="Seitenansicht">◻️<small>Seite</small></button>
          <button class="tool-btn" @click="engine?.resetView()" title="Reset">🏠<small>Reset</small></button>

          <div class="tool-divider"></div>

          <!-- Layer-Panel Toggle -->
          <button
            class="tool-btn"
            :class="{ active: showLayerPanel }"
            @click="showLayerPanel = !showLayerPanel"
            title="Ebenen / Kategorien"
          >🎛️<small>Layer</small></button>

          <!-- Section Cut -->
          <button
            class="tool-btn"
            :class="{ active: sectionActive }"
            @click="toggleSectionCut"
            title="Horizontaler Schnitt"
          >✂️<small>Schnitt</small></button>

          <!-- Coord mode toggle -->
          <button
            class="tool-btn"
            :class="{ active: coordMode === 'ifc' }"
            @click="coordMode = coordMode === 'viewer' ? 'ifc' : 'viewer'"
            title="Koordinaten umschalten (Viewer ↔ IFC)"
          >📍<small>{{ coordMode === 'ifc' ? 'IFC' : 'Viewer' }}</small></button>

          <div class="tool-divider"></div>

          <!-- PDF Export -->
          <button
            class="tool-btn"
            :class="{ active: showPdfExport }"
            @click="showPdfExport = !showPdfExport"
            title="Als PDF exportieren"
          >📄<small>Export</small></button>

          <div class="tool-divider"></div>

          <!-- T1.3: Measurement -->
          <button
            class="tool-btn"
            :class="{ active: measureActive }"
            @click="toggleMeasure"
            title="Strecke messen"
          >📏<small>Messen</small></button>

          <!-- T2.2: Saved Views -->
          <button
            class="tool-btn"
            :class="{ active: showSavedViews }"
            @click="onToggleViews"
            title="Gespeicherte Ansichten [V]"
          >📌<small>Views</small></button>

          <!-- T2.4: Annotations -->
          <button
            class="tool-btn"
            :class="{ active: showAnnotations || annotationActive }"
            @click="onToggleNotes"
            title="Notizen [N]"
          >💬<small>Notizen</small></button>

          <div class="tool-divider"></div>

          <!-- Help / Shortcuts -->
          <button
            class="tool-btn"
            :class="{ active: showShortcuts }"
            @click="showShortcuts = !showShortcuts"
            title="Tastenkürzel anzeigen [?]"
          >⌨<small>Hilfe</small></button>
        </div>

        <!-- B3: Section-Cut Bar — centered, with snap + mode + position readout -->
        <Transition name="section-slide">
          <div v-if="showSectionBar" class="section-bar">
            <span class="section-label">✂️</span>

            <!-- SC-1: Snap-to-axis buttons -->
            <div class="section-snaps">
              <button class="snap-btn" title="Horizontal (Grundriss)" @click="snapSection('horizontal')">H</button>
              <button class="snap-btn" title="Senkrecht X-Achse"      @click="snapSection('x')">X</button>
              <button class="snap-btn" title="Senkrecht Z-Achse"      @click="snapSection('z')">Z</button>
            </div>

            <div class="section-sep"></div>

            <!-- Mode buttons -->
            <div class="section-modes">
              <button
                class="mode-btn"
                :class="{ active: sectionMode === 'translate' }"
                title="Verschieben [T]"
                @click="setSectionMode('translate')"
              >↕ Verschieben</button>
              <button
                class="mode-btn"
                :class="{ active: sectionMode === 'rotate' }"
                title="Drehen [R]"
                @click="setSectionMode('rotate')"
              >⟳ Drehen</button>
            </div>

            <!-- SC-2: Position readout -->
            <span v-if="sectionPosition" class="section-pos">
              Y&thinsp;{{ sectionPosition.y }}&thinsp;m
            </span>

            <div class="section-sep"></div>

            <!-- SC-4: Reset position to model center -->
            <button class="snap-btn" title="Zur Modellmitte zurücksetzen" @click="resetSection">↺</button>
            <!-- Hide bar only (plane stays active; click ✂️ again to fully remove) -->
            <button class="section-close" @click="hideSection" title="Werkzeug ausblenden [Esc]">✕</button>
          </div>
        </Transition>

        <!-- B1: Koordinatenanzeige — centered bottom -->
        <div v-if="coords" class="coord-bar">
          <span class="coord-mode-badge">{{ coordMode === 'ifc' ? 'IFC' : 'Viewer' }}</span>
          <span v-if="coordMode === 'viewer'"><b>X</b> {{ coords.x }}&thinsp;m</span>
          <span v-if="coordMode === 'viewer'"><b>Y</b> {{ coords.y }}&thinsp;m</span>
          <span v-if="coordMode === 'viewer'"><b>Z</b> {{ coords.z }}&thinsp;m</span>
          <span v-if="coordMode === 'ifc'"><b>X</b> {{ coords.ox }}&thinsp;m</span>
          <span v-if="coordMode === 'ifc'"><b>Y</b> {{ coords.oy }}&thinsp;m</span>
          <span v-if="coordMode === 'ifc'"><b>Z</b> {{ coords.oz }}&thinsp;m</span>
        </div>

        <!-- Element-Indikator (wenn Properties-Fenster geschlossen) -->
        <Transition name="sidebar-slide">
          <div v-if="ifc.selectedElement && !propertiesOpen" class="sel-badge" @click="emit('open-properties')">
            <span class="sel-type">{{ ifc.selectedElement.type }}</span>
            <span class="sel-name">{{ ifc.selectedElement.name || '—' }}</span>
            <span class="sel-hint">Eigenschaften öffnen ↗</span>
          </div>
        </Transition>

        <!-- Selection actions (hide/isolate) — show only when an element is selected -->
        <Transition name="sidebar-slide">
          <div v-if="ifc.selectedElement" class="sel-actions">
            <button class="sel-action-btn" title="Auswahl ausblenden" @click="onHideSelected">
              <span>👁‍🗨</span><small>Verstecken</small>
            </button>
            <button class="sel-action-btn" title="Nur Auswahl zeigen" @click="onIsolateSelected">
              <span>⊡</span><small>Isolieren</small>
            </button>
          </div>
        </Transition>

        <!-- Show-all button — visible whenever any category is currently hidden -->
        <Transition name="sidebar-slide">
          <button
            v-if="anyHidden"
            class="show-all-btn"
            title="Alle wieder einblenden"
            @click="onShowAll"
          >
            👁 Alle zeigen
          </button>
        </Transition>

        <!-- T1.3: Measurement toast + list -->
        <Transition name="fade">
          <div v-if="measureToast" class="measure-toast">📏 {{ measureToast.text }}</div>
        </Transition>
        <Transition name="fade">
          <div v-if="measureActive && measurements.length" class="measure-list">
            <div class="measure-list-header">
              Messungen ({{ measurements.length }})
              <button class="ml-clear-btn" @click="clearMeasurements" title="Zurücksetzen">✕</button>
            </div>
            <div v-for="(m, i) in measurements" :key="i" class="measure-item">
              <span class="ml-idx">#{{ i + 1 }}</span>
              <span class="ml-val">{{ _formatDist(m.dist) }}</span>
            </div>
          </div>
        </Transition>

        <!-- Layer-Panel (floating) -->
        <Transition name="panel-slide">
          <IfcLayerPanel
            v-if="showLayerPanel && categoryList.length"
            :categories="categoryList"
            @toggle="onToggleCategory"
            @zoom="({ name }) => engine?.zoomToCategory(name)"
            @close="showLayerPanel = false"
          />
        </Transition>

        <!-- T1.5: Storey-Quick-Nav (floating left) — shifts right when LayerPanel is open -->
        <IfcStoreyNav
          v-if="showStoreyNav"
          :storeys="storeyList"
          :style="{ left: showLayerPanel && categoryList.length ? '320px' : '70px' }"
          @goto="onGotoStorey"
        />

        <!-- T2.2: Saved Views (floating right, toggleable) -->
        <Transition name="panel-slide">
          <div v-if="showSavedViews" class="saved-views-wrap">
            <IfcSavedViews
              :captureView="() => engine?.captureView()"
              :applyView="(s) => engine?.applyView(s)"
            />
          </div>
        </Transition>

        <!-- T2.4: Annotations (floating right, below Saved Views or alone) -->
        <Transition name="panel-slide">
          <div v-if="showAnnotations" class="annotations-wrap">
            <IfcAnnotations
              :annotationActive="annotationActive"
              :zoomToPoint="zoomToAnnotation"
              @toggle-mode="toggleAnnotationMode"
            />
          </div>
        </Transition>

        <!-- T2.4: Speech-bubble overlay (always rendered when there are annotations) -->
        <IfcAnnotationOverlay
          v-if="ifc.annotations.length && canvasRef"
          :annotations="ifc.annotations"
          :projectToScreen="(p) => engine?.projectToScreen(p)"
          :canvasEl="canvasRef"
          @offset-changed="onAnnotationOffsetChanged"
        />

      </div>

      <!-- PDF Export Modal — teleported to body to escape z-index stacking context -->
      <Teleport to="body">
        <IfcPdfExportModal
          v-if="showPdfExport"
          :getSnapshot="() => engine?.getCanvasSnapshot(3)"
          :onViewTop="() => engine?.viewTop()"
          :onViewFront="() => engine?.viewFront()"
          :onViewSide="() => engine?.viewSide()"
          :saveRenderState="() => engine?.saveRenderState()"
          :restoreRenderState="(s) => engine?.restoreRenderState(s)"
          :applyLayerStyle="(style) => applyLayerStyle(style, engine)"
          :getScaleSnapshot="(s, dw, dh, dir, px, pz) => engine?.getScaleSnapshot(s, dw, dh, dir, 10, px ?? 0, pz ?? 0)"
          :truckCamera="(dx, dy) => engine?.truckCamera(dx, dy)"
          :getOrthoExtent="() => engine?.getOrthoExtent()"
          :setOrthoExtentForScale="(s, dw, dh) => engine?.setOrthoExtentForScale(s, dw, dh)"
          :setOrthoExtent="(e) => engine?.setOrthoExtent(e)"
          :getCamera="() => engine?._getWorld()?.camera?.three ?? null"
          :getScene="() => engine?._getWorld()?.scene?.three ?? null"
          :getPlotFrustum="() => engine?.getLastPlotFrustum()"
          :getCategoryGroups="() => engine?.getCategoryGroups()"
          :getFragmentsList="() => engine?.getFragmentsList()"
          :getFragmentsManager="() => engine?.getFragmentsManager()"
          :getMeasurements="() => measurements"
          :getWebIfcAPI="() => engine?.getWebIfcAPI()"
          :getSectionCutPlane="() => engine?.getSectionCutPlane()"
          @close="showPdfExport = false"
        />
      </Teleport>

      <Teleport to="body">
        <IfcSearchOverlay    :open="showSearch"    @close="showSearch = false" />
        <IfcShortcutsOverlay :open="showShortcuts" @close="showShortcuts = false" />
      </Teleport>
    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import { IfcEngine } from '../services/IfcEngine.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import IfcLayerPanel      from './IfcLayerPanel.vue';
import IfcPdfExportModal  from './IfcPdfExportModal.vue';
import IfcSearchOverlay   from './IfcSearchOverlay.vue';
import IfcLoadOverlay     from './IfcLoadOverlay.vue';
import IfcShortcutsOverlay from './IfcShortcutsOverlay.vue';
import IfcStoreyNav        from './IfcStoreyNav.vue';
import IfcSavedViews       from './IfcSavedViews.vue';
import IfcAnnotations      from './IfcAnnotations.vue';
import IfcAnnotationOverlay from './IfcAnnotationOverlay.vue';
import { applyLayerStyle } from '../services/LayerStyleManager.js';

import validatedIfcUrl from '../testdata/6178_A64-2BA_0_2026-03-18 (12).ifc?url';

const emit = defineEmits(['close', 'open-properties', 'model-loaded']);
const ifc  = useIfcStore();

defineProps({
  propertiesOpen: { type: Boolean, default: false },
});

// ── refs ────────────────────────────────────────────────────────────────────
const modalRef    = ref(null);
const canvasRef   = ref(null);
const dropdownRef = ref(null);

const engine      = shallowRef(null);
const loading = ref(false);
const dropdownOpen = ref(false);
const coords      = ref(null);

// Layer panel
const showLayerPanel = ref(false);
const categoryList   = ref([]); // [{name, count, visible}]
const storeyList     = ref([]); // [{modelId, localId, name, elevation, box}]
const showStoreyNav  = ref(true);
const showSavedViews = ref(false);
const showAnnotations    = ref(false);
const annotationActive   = ref(false);

// Section cut — sectionActive = clip plane exists; showSectionBar = UI bar visible
const sectionActive   = ref(false);
const showSectionBar  = ref(false);
const sectionMode     = ref('translate'); // 'translate' | 'rotate'
const sectionPosition = ref(null); // { x, y, z } from engine

// PDF export
const showPdfExport = ref(false);
const showSearch    = ref(false);
const showShortcuts = ref(false);

// T1.3: Measurement
const measureActive    = ref(false);
const measureToast     = ref(null);  // { text, ts }
const measurements     = ref([]);    // [{ dist }]
let _measureToastTimer = null;

// Multi-model list
const modelList = ref([]); // [{modelId, name}]

// Coordinate display mode
const coordMode = ref('viewer'); // 'viewer' | 'ifc'

let _rafId       = null;
let _mouseDownAt = null;
let _hoverTimer  = null;
let _lastMouse   = null;

// ── lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeyDown);

  engine.value = new IfcEngine();
  await engine.value.init(canvasRef.value);

  canvasRef.value.addEventListener('mousemove',  onMouseMove);
  canvasRef.value.addEventListener('mouseleave', onMouseLeave);
  canvasRef.value.addEventListener('mousedown',  onMouseDown);
  canvasRef.value.addEventListener('mouseup',    onMouseUp);

  ifc.registerPsetHandler(async (psetName, props) => {
    try {
      await engine.value.addPsetToElement(psetName, props);
      const refreshed = await engine.value.refreshElement();
      if (refreshed) ifc.setElement(refreshed);
    } catch (err) {
      ifc.setPsetError(`Fehler: ${err.message}`);
    }
  });

  ifc.registerSpatialHandler(async (localId, visible) => {
    await engine.value?.setStoreyVisible(localId, visible);
  });

  // T1.1: zoom-to-element / zoom-to-category — modelId defaults to first loaded model
  ifc.registerZoomHandler(async (localId, modelId) => {
    const mid = modelId ?? engine.value?.getModelList()?.[0]?.modelId;
    if (mid != null) await engine.value?.zoomToElement(mid, localId);
  });
  ifc.registerZoomCategoryHandler(async (name) => {
    await engine.value?.zoomToCategory(name);
  });
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeyDown);
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('mousemove',  onMouseMove);
    canvasRef.value.removeEventListener('mouseleave', onMouseLeave);
    canvasRef.value.removeEventListener('mousedown',  onMouseDown);
    canvasRef.value.removeEventListener('mouseup',    onMouseUp);
  }
  engine.value?.dispose();
  engine.value = null;
});

// ── file loading ─────────────────────────────────────────────────────────────
async function onFileUpload(e) {
  const file = e.target.files[0];
  if (!file || loading.value) return;
  loading.value = true;
  try {
    const buf = await file.arrayBuffer();
    await engine.value.loadIfc(new Uint8Array(buf), file.name);
    await _onModelLoaded();
  } catch (err) {
    console.error('IFC load error:', err);
    alert('Fehler beim Laden der IFC-Datei.');
  } finally {
    loading.value  = false;
    e.target.value = '';
  }
}

async function onFileUploadAdd(e) {
  const file = e.target.files[0];
  if (!file || loading.value) return;
  loading.value = true;
  try {
    const buf = await file.arrayBuffer();
    await engine.value.loadIfc(new Uint8Array(buf), file.name);
    await _onModelLoaded();
  } catch (err) {
    console.error('IFC add error:', err);
    alert('Fehler beim Hinzufügen der IFC-Datei.');
  } finally {
    loading.value  = false;
    e.target.value = '';
  }
}

async function removeModel(modelId) {
  await engine.value?.unloadModel(modelId);
  modelList.value = engine.value.getModelList();
  ifc.setModelList(modelList.value);
  categoryList.value = engine.value.getCategoryList();
  // Update spatial tree for first remaining model
  const tree = await engine.value?.getSpatialTree();
  ifc.setSpatialTree(tree ?? null);
  // Refresh storey list (might be empty if all models with storeys are unloaded)
  storeyList.value = (await engine.value?.getStoreyList()) ?? [];
}

async function loadExample(name) {
  if (loading.value) return;
  dropdownOpen.value = false;
  loading.value = true;
  try {
    const url = name === 'Validated' ? validatedIfcUrl : '';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Netzwerkfehler');
    await engine.value.loadIfc(new Uint8Array(await res.arrayBuffer()), 'example');
    await _onModelLoaded();
  } catch (err) {
    console.error('Example load error:', err);
    alert('Fehler beim Laden des Beispiels.');
  } finally {
    loading.value = false;
  }
}

/** Called after every successful loadIfc() to refresh UI state. */
async function _onModelLoaded() {
  // Categories for Layer Panel
  categoryList.value = engine.value.getCategoryList();

  // Update multi-model list
  modelList.value = engine.value.getModelList();
  ifc.setModelList(modelList.value);

  // Spatial tree → store (IfcSpatialWindow reads from there)
  const tree = await engine.value.getSpatialTree();
  ifc.setSpatialTree(tree);

  // T1.1: Build search index for Cmd/Ctrl+F (runs in background, non-blocking)
  engine.value.buildSearchIndex().then(entries => ifc.setSearchIndex(entries));

  // T1.5: Storey list for the quick-nav panel (skipped silently for infra models)
  engine.value.getStoreyList().then(list => { storeyList.value = list; }).catch(() => {});

  // T2.4: Load persisted annotations for this model + redraw any visuals
  const firstModel = engine.value?.getModelList()?.[0];
  if (firstModel) {
    ifc.loadAnnotationsForModel(firstModel.name);
    // If annotation mode is on, re-create visuals; otherwise pre-fill engine's data only
    engine.value?.setAnnotations(ifc.annotations);
  }

  // Reset section cut when a new model is loaded
  if (sectionActive.value) {
    engine.value.deleteSectionCuts();
    sectionActive.value  = false;
    showSectionBar.value = false;
    sectionPosition.value = null;
  }

  emit('model-loaded');
}

// ── Section cuts ─────────────────────────────────────────────────────────────
function toggleSectionCut() {
  if (!sectionActive.value) {
    // First click: create the clip plane and show the bar
    const result = engine.value?.createSectionCut();
    if (!result) return;
    sectionMode.value     = 'translate';
    sectionActive.value   = true;
    showSectionBar.value  = true;
    sectionPosition.value = engine.value.getSectionPosition();
    engine.value.setSectionChangeCallback(() => {
      sectionPosition.value = engine.value?.getSectionPosition() ?? null;
    });
  } else {
    // Second click: remove the cut entirely (clean toggle)
    engine.value?.setSectionChangeCallback(null);
    engine.value?.deleteSectionCuts();
    sectionActive.value   = false;
    showSectionBar.value  = false;
    sectionPosition.value = null;
  }
}

/** Hide the section bar and gizmo — clip plane remains active. */
function hideSection() {
  showSectionBar.value = false;
  engine.value?.setSectionGizmoVisible(false);
}

function setSectionMode(mode) {
  sectionMode.value = mode;
  engine.value?.setSectionMode(mode);
}

function snapSection(axis) {
  engine.value?.snapSectionTo(axis);
  sectionPosition.value = engine.value?.getSectionPosition() ?? null;
}

function resetSection() {
  engine.value?.resetSection();
  sectionPosition.value = engine.value?.getSectionPosition() ?? null;
}

// SC-3: Keyboard shortcuts for section cut
function onKeyDown(e) {
  // Cmd/Ctrl+F → open search overlay
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    showSearch.value = true;
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // ? toggles the shortcut overlay
  if (e.key === '?') { e.preventDefault(); showShortcuts.value = !showShortcuts.value; return; }
  if (e.key === 'Escape' && showShortcuts.value) { showShortcuts.value = false; return; }

  // T1.3: M toggles measure mode, Esc exits it
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMeasure(); return; }
  if (e.key === 'Escape' && measureActive.value) { toggleMeasure(); return; }

  // T2.2: V toggles Saved Views panel
  if (e.key === 'v' || e.key === 'V') { e.preventDefault(); showSavedViews.value = !showSavedViews.value; return; }

  // T2.4: N toggles Notes panel, Esc exits annotation placement mode
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); showAnnotations.value = !showAnnotations.value; return; }
  if (e.key === 'Escape' && annotationActive.value) { toggleAnnotationMode(); return; }

  // T1.2: H = hide selected, I = isolate selected, Shift+A = show all
  if (ifc.selectedElement && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault(); onHideSelected(); return;
  }
  if (ifc.selectedElement && (e.key === 'i' || e.key === 'I')) {
    e.preventDefault(); onIsolateSelected(); return;
  }
  if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault(); onShowAll(); return;
  }

  // Section-cut shortcuts (only while section bar is active)
  if (!sectionActive.value) return;
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); setSectionMode('translate'); }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setSectionMode('rotate'); }
  if (e.key === 'Escape') hideSection();
}

// ── Layer panel ───────────────────────────────────────────────────────────────
async function onToggleCategory({ name, visible }) {
  await engine.value?.setCategoryVisible(name, visible);
  const entry = categoryList.value.find(c => c.name === name);
  if (entry) entry.visible = visible;
}

// ── T1.2: Hide / Isolate / Show all ───────────────────────────────────────────
const anyHidden = computed(() => categoryList.value.some(c => !c.visible));

async function onHideSelected() {
  await engine.value?.hideSelected();
  // Selection cleared in engine — refresh store
  ifc.clearElement();
  // categoryList visibility doesn't change for hide-selected (selection ≠ whole category)
  // but show "Alle zeigen" if any item is hidden — we approximate by marking dirty later
}

async function onIsolateSelected() {
  await engine.value?.isolateSelected();
  // Engine flipped all g.visible = false → mirror in UI
  categoryList.value = engine.value?.getCategoryList() ?? [];
}

async function onShowAll() {
  await engine.value?.showAll();
  categoryList.value = engine.value?.getCategoryList() ?? [];
}

// ── T1.5: Storey navigation ───────────────────────────────────────────────────
async function onGotoStorey({ modelId, localId, withSection }) {
  const ok = await engine.value?.gotoStorey(modelId, localId, { withSection });
  if (ok && withSection) {
    // Sync the section-cut UI state so the bar appears
    sectionActive.value   = true;
    showSectionBar.value  = true;
    sectionMode.value     = 'translate';
    sectionPosition.value = engine.value?.getSectionPosition() ?? null;
    engine.value?.setSectionChangeCallback(() => {
      sectionPosition.value = engine.value?.getSectionPosition() ?? null;
    });
  }
}

// ── T1.3: Measurement ────────────────────────────────────────────────────────
function toggleMeasure() {
  if (measureActive.value) {
    engine.value?.disableMeasureMode();
    measureActive.value = false;
    measureToast.value  = null;
  } else {
    engine.value?.enableMeasureMode();
    measureActive.value = true;
    _setMeasureToast('Klick auf 1. Punkt');
  }
}

function clearMeasurements() {
  engine.value?.clearMeasurements();
  measurements.value = [];
  _setMeasureToast('Messungen zurückgesetzt');
}

function _setMeasureToast(text) {
  measureToast.value = { text, ts: Date.now() };
  if (_measureToastTimer) clearTimeout(_measureToastTimer);
  _measureToastTimer = setTimeout(() => { measureToast.value = null; }, 3500);
}

function _formatDist(m) {
  if (m < 1)   return `${(m * 1000).toFixed(0)} mm`;
  if (m < 10)  return `${m.toFixed(3)} m`;
  return `${m.toFixed(2)} m`;
}

// ── T2.4: Annotations ────────────────────────────────────────────────────────
function onToggleViews() { showSavedViews.value  = !showSavedViews.value; }
function onToggleNotes() { showAnnotations.value = !showAnnotations.value; }

function toggleAnnotationMode() {
  if (annotationActive.value) {
    annotationActive.value = false;
  } else {
    if (measureActive.value) toggleMeasure();
    engine.value?.enableAnnotationMode();
    annotationActive.value = true;
  }
}

async function _onAnnotationClick(e) {
  const text = prompt('Notiz hinzufügen:', '');
  if (text === null) return;
  // Re-use the last annotation's color so users can place a series of same-colored pins
  const lastColor = ifc.annotations[ifc.annotations.length - 1]?.color ?? '#e91e63';
  const ann = await engine.value?.addAnnotation(e.clientX, e.clientY, text, lastColor);
  if (ann) ifc.pushAnnotation(ann);
}

function onAnnotationOffsetChanged({ id, offset }) {
  ifc.updateAnnotationOffset(id, offset);
  // Reflect in the engine's internal copy so future redraws use the new offset
  engine.value?.updateAnnotation?.(id, { labelOffset: offset });
}

function zoomToAnnotation(position) {
  engine.value?.lookAtPoint(position[0], position[1], position[2], 5);
}

// ── mouse interaction ─────────────────────────────────────────────────────────
function onMouseMove(e) {
  if (!_rafId) {
    _rafId = requestAnimationFrame(() => {
      _rafId = null;
      const pos = engine.value?.getHitPoint();
      coords.value = pos
        ? {
            x: pos.x.toFixed(3), y: pos.y.toFixed(3), z: pos.z.toFixed(3),
            ox: pos.ox.toFixed(3), oy: pos.oy.toFixed(3), oz: pos.oz.toFixed(3),
          }
        : null;
    });
  }

  _lastMouse = { x: e.clientX, y: e.clientY };
  clearTimeout(_hoverTimer);
  // 30 ms debounce: prevents raycast on every pixel during fast mouse movement
  _hoverTimer = setTimeout(() => {
    const m = _lastMouse;
    if (!m) return;
    if (measureActive.value) {
      // Live measure-hover marker (probe-only — does not change selection)
      engine.value?.updateMeasureHover(m.x, m.y);
    } else {
      engine.value?.hoverElement(m.x, m.y);
    }
  }, 30);
}

function onMouseLeave() {
  coords.value = null;
  clearTimeout(_hoverTimer);
  _lastMouse = null;
  engine.value?.clearHover();
}

function onMouseDown(e) {
  _mouseDownAt = { x: e.clientX, y: e.clientY };
  clearTimeout(_hoverTimer);
}

async function onMouseUp(e) {
  if (!_mouseDownAt) return;
  const dx = e.clientX - _mouseDownAt.x;
  const dy = e.clientY - _mouseDownAt.y;
  _mouseDownAt = null;

  if (Math.hypot(dx, dy) > 5) return; // >5 px movement = orbit drag, not a click

  // T1.3: in measure mode, clicks add measurement points instead of selecting
  if (measureActive.value) {
    const res = await engine.value?.addMeasurePoint(e.clientX, e.clientY);
    if (!res || res.phase === 'no-hit') {
      _setMeasureToast('Kein Treffer — bitte auf Bauteil klicken');
    } else if (res.phase === 'awaiting-second') {
      _setMeasureToast('Klick auf 2. Punkt');
    } else if (res.phase === 'complete') {
      // Store the world-space endpoints too — the PDF exporter needs them to render the measurement
      measurements.value.push({
        dist: res.dist,
        p1: { x: res.p1.x, y: res.p1.y, z: res.p1.z },
        p2: { x: res.p2.x, y: res.p2.y, z: res.p2.z },
      });
      _setMeasureToast(`Abstand: ${_formatDist(res.dist)} — Klick auf nächste 2 Punkte`);
    }
    return;
  }

  // T2.4: in annotation mode, clicks place pins instead of selecting
  if (annotationActive.value) {
    await _onAnnotationClick(e);
    return;
  }

  const result = await engine.value?.pickElement(e.clientX, e.clientY);
  if (result) {
    ifc.setElement(result);
    emit('open-properties');
  } else {
    ifc.clearElement();
    await engine.value?.clearSelection();
  }
}

function onDocClick(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    dropdownOpen.value = false;
  }
}
</script>

<style scoped>
/* ── Layout shell ── */
.viewer-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* ── Header ── */
.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1rem;
  background: #2c3e50;
  color: #fff;
  user-select: none;
  cursor: grab;
  flex-shrink: 0;
}
.viewer-header:active { cursor: grabbing; }

.header-title { font-weight: 600; font-size: 1.05rem; }
.header-controls { display: flex; gap: 0.4rem; }

.hdr-btn {
  background: none; border: none; color: #ecf0f1;
  font-size: 1.15rem; cursor: pointer; padding: 0.2rem 0.45rem;
  border-radius: 4px; transition: background 0.15s;
}
.hdr-btn:hover { background: rgba(255,255,255,0.1); }
.hdr-close:hover { color: #e74c3c; background: rgba(231,76,60,0.12); }

/* ── Body ── */
.viewer-body { position: relative; flex: 1; overflow: hidden; }

.canvas-root {
  position: absolute; inset: 0; background: #f0f0f0; z-index: 10;
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='rgba(0,0,0,0.55)' stroke-width='4'/%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='18' cy='18' r='2' fill='white'/%3E%3Ccircle cx='18' cy='18' r='2' fill='none' stroke='rgba(0,0,0,0.5)' stroke-width='1'/%3E%3C/svg%3E") 18 18, crosshair;
}
.canvas-root.measure-cursor {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect x='2' y='2' width='32' height='32' fill='none' stroke='rgba(0,0,0,0.6)' stroke-width='3'/%3E%3Crect x='2' y='2' width='32' height='32' fill='none' stroke='%23ffeb3b' stroke-width='1.5'/%3E%3Cline x1='18' y1='6' x2='18' y2='30' stroke='%23ffeb3b' stroke-width='2'/%3E%3Cline x1='6' y1='18' x2='30' y2='18' stroke='%23ffeb3b' stroke-width='2'/%3E%3C/svg%3E") 18 18, crosshair;
}

/* ── Top bar ── */
.top-bar {
  position: absolute; top: 1rem; left: 1rem; right: 1rem; z-index: 20;
  display: flex; justify-content: space-between; align-items: center;
  background: #fff; padding: 0.65rem 1.25rem;
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.top-bar-left { display: flex; gap: 0.75rem; align-items: center; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

.action-btn {
  padding: 0.45rem 0.9rem; border: none; border-radius: 6px;
  font-weight: 600; font-size: 0.9rem; cursor: pointer;
  transition: background 0.15s, transform 0.15s;
  display: inline-flex; align-items: center; gap: 0.4rem;
}
.action-btn.primary { background: var(--primary, #3498db); color: #fff; }
.action-btn.primary:hover { background: #2980b9; transform: translateY(-1px); }
.action-btn.secondary { background: #e2e8f0; color: #2c3e50; }
.action-btn.secondary:hover { background: #cbd5e1; }

/* Dropdown */
.dropdown { position: relative; }
.dropdown-menu {
  display: none; position: absolute; top: calc(100% + 0.4rem); left: 0;
  min-width: 180px; background: #fff; border-radius: 6px;
  box-shadow: 0 8px 16px rgba(0,0,0,0.12); overflow: hidden; z-index: 30;
  animation: fadeDown 0.15s ease;
}
.dropdown-menu.open { display: block; }
.dropdown-menu button {
  width: 100%; padding: 0.7rem 1rem; border: none; background: none;
  text-align: left; font-size: 0.88rem; color: #333; cursor: pointer;
  transition: background 0.12s;
}
.dropdown-menu button:hover { background: #f1f5f9; color: var(--primary, #3498db); }

/* Loading badge */
.loading-badge {
  display: flex; align-items: center; gap: 0.5rem;
  color: #e67e22; font-weight: 600; font-size: 0.9rem;
}
.spinner {
  width: 15px; height: 15px;
  border: 2.5px solid rgba(230,126,34,0.3); border-top-color: #e67e22;
  border-radius: 50%; animation: spin 0.8s linear infinite;
}

/* ── Camera toolbox ── */
.toolbox {
  position: absolute; bottom: 1rem; left: 1rem; z-index: 20;
  display: flex; flex-direction: column; gap: 0.3rem;
  background: rgba(22,24,34,0.97); padding: 0.45rem; border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.08);
  /* Cap height + scroll so growing button list doesn't escape the viewport */
  max-height: calc(100% - 7rem);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.18) transparent;
}
.toolbox::-webkit-scrollbar { width: 4px; }
.toolbox::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 2px; }
.tool-btn {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 1px; width: 50px; height: 46px;
  border: none; border-radius: 7px; background: rgba(255,255,255,0.08);
  color: #e0e0e0; cursor: pointer; font-size: 1.1rem;
  transition: background 0.15s, transform 0.12s;
}
.tool-btn small { font-size: 0.57rem; opacity: 0.7; font-weight: 500; }
.tool-btn:hover { background: rgba(255,255,255,0.18); color: #fff; transform: scale(1.05); }
.tool-btn:active { transform: scale(0.94); background: rgba(52,152,219,0.35); }
.tool-btn.active { background: rgba(52,152,219,0.35); color: #4fc3f7; }

.tool-divider {
  height: 1px; background: rgba(255,255,255,0.12); margin: 0.2rem 0.3rem;
}

/* ── B3: Section cut bar — centered bottom ── */
.section-bar {
  position: absolute; bottom: 1rem;
  left: 50%; transform: translateX(-50%);
  z-index: 21;
  display: flex; align-items: center; gap: 0.5rem;
  background: rgba(16,18,30,0.97); border: 1px solid rgba(52,152,219,0.4);
  padding: 0.4rem 0.75rem; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.45);
  white-space: nowrap;
}
.section-label { font-size: 0.9rem; }
.section-sep { width: 1px; height: 18px; background: rgba(255,255,255,0.12); margin: 0 0.1rem; }
.section-snaps { display: flex; gap: 0.25rem; }
.snap-btn {
  padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15);
  background: rgba(255,255,255,0.07); color: #90a4ae; font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: background 0.12s, color 0.12s;
  line-height: 1.4;
}
.snap-btn:hover { background: rgba(255,255,255,0.15); color: #cfd8dc; }
.snap-btn--danger:hover { background: rgba(239,83,80,0.18); color: #ef5350; border-color: rgba(239,83,80,0.4); }
.section-modes { display: flex; gap: 0.25rem; }
.mode-btn {
  padding: 0.22rem 0.6rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #90a4ae; font-size: 0.73rem;
  cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.mode-btn:hover  { background: rgba(255,255,255,0.12); color: #cfd8dc; }
.mode-btn.active { background: rgba(52,152,219,0.3); color: #4fc3f7; border-color: rgba(52,152,219,0.55); }
.section-pos {
  font-family: 'Roboto Mono', monospace; font-size: 0.7rem; color: #4fc3f7;
  padding: 0 0.2rem;
}
.section-close {
  background: none; border: none; color: #546e7a; font-size: 1rem;
  cursor: pointer; padding: 0 0.1rem; line-height: 1; transition: color 0.15s;
}
.section-close:hover { color: #ef5350; }

/* ── B1: Coordinate display — centered bottom ── */
.coord-bar {
  position: absolute; bottom: 0.75rem;
  left: 50%; transform: translateX(-50%);
  z-index: 20;
  display: flex; align-items: center; gap: 0.9rem; background: rgba(22,24,34,0.97);
  padding: 0.35rem 0.7rem; border-radius: 6px;
  font-family: 'Roboto Mono', monospace; font-size: 0.72rem; color: #b0bec5;
  border: 1px solid rgba(255,255,255,0.08);
  pointer-events: none; white-space: nowrap;
}
.coord-bar b { color: #4fc3f7; margin-right: 2px; }
.coord-mode-badge {
  font-size: 0.6rem; font-weight: 700; color: #546e7a;
  background: rgba(255,255,255,0.06); border-radius: 3px;
  padding: 0.05rem 0.3rem; letter-spacing: 0.05em;
}

/* ── B2: Model tag row below top-bar ── */
.model-tag-row {
  position: absolute; top: calc(1rem + 56px); left: 1rem; z-index: 19;
  display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;
}
.model-tag {
  display: flex; align-items: center; gap: 0.3rem;
  background: rgba(52,152,219,0.15); border: 1px solid rgba(52,152,219,0.35);
  border-radius: 4px; padding: 0.2rem 0.5rem;
  font-size: 0.78rem; color: #90caf9; max-width: 200px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tag-close {
  background: none; border: none; cursor: pointer;
  color: #546e7a; font-size: 0.7rem; padding: 0; line-height: 1;
  flex-shrink: 0; transition: color 0.12s;
}
.tag-close:hover { color: #ef5350; }

/* ── B1: Selection badge — bottom right (no longer overlaps centered coord-bar) ── */
.sel-badge {
  position: absolute; bottom: 1rem; right: 1rem; z-index: 20;
  display: flex; flex-direction: column; gap: 0.1rem;
  background: rgba(16,18,28,0.97); border: 1px solid rgba(52,152,219,0.4);
  border-radius: 8px; padding: 0.45rem 0.7rem; cursor: pointer;
  transition: border-color 0.15s;
}
.sel-badge:hover { border-color: rgba(52,152,219,0.9); }
.sel-type { font-size: 0.58rem; color: #546e7a; font-family: monospace; }
.sel-name { font-size: 0.75rem; color: #cfd8dc; font-weight: 600; }
.sel-hint { font-size: 0.58rem; color: #3498db; margin-top: 0.1rem; }

/* Selection-action toolbar (Hide / Isolate) */
.sel-actions {
  position: absolute; bottom: 1rem; right: 13rem; z-index: 20;
  display: flex; gap: 0.3rem;
}
.sel-action-btn {
  display: flex; flex-direction: column; align-items: center; gap: 0.05rem;
  background: rgba(16,18,28,0.97);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  color: #cfd8dc; cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;
  min-width: 64px;
}
.sel-action-btn > span { font-size: 1rem; }
.sel-action-btn > small { font-size: 0.58rem; color: #90a4ae; letter-spacing: 0.02em; }
.sel-action-btn:hover {
  background: rgba(33,150,243,0.18);
  border-color: rgba(52,152,219,0.6);
  transform: translateY(-1px);
}

/* Persistent "Alle zeigen" button when anything is hidden */
.show-all-btn {
  position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); z-index: 21;
  background: rgba(102,187,106,0.18);
  border: 1px solid rgba(102,187,106,0.5);
  border-radius: 6px;
  padding: 0.4rem 0.9rem;
  color: #a5d6a7;
  font-size: 0.78rem; font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.show-all-btn:hover { background: rgba(102,187,106,0.28); transform: translate(-50%, -1px); }

/* T1.3: Measurement UI */
.measure-toast {
  position: absolute; top: 5.5rem; left: 50%; transform: translateX(-50%); z-index: 22;
  background: rgba(255,235,59,0.92); color: #1a1a1a;
  padding: 0.4rem 0.9rem; border-radius: 6px;
  font-size: 0.8rem; font-weight: 600;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
.measure-list {
  position: absolute; top: 5.5rem; right: 1rem; z-index: 22;
  width: 180px;
  background: rgba(16,18,28,0.97);
  border: 1px solid rgba(255,235,59,0.4);
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
}
.measure-list-header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.65rem; font-weight: 700; color: #ffeb3b;
  text-transform: uppercase; letter-spacing: 0.06em;
  padding-bottom: 0.3rem; border-bottom: 1px solid rgba(255,235,59,0.18);
  margin-bottom: 0.3rem;
}
.ml-clear-btn {
  background: none; border: none; color: #78909c;
  font-size: 0.9rem; cursor: pointer; padding: 0 0.2rem; line-height: 1;
}
.ml-clear-btn:hover { color: #ef5350; }
.measure-item {
  display: flex; justify-content: space-between; gap: 0.5rem;
  font-size: 0.75rem; color: #cfd8dc;
  padding: 0.18rem 0.1rem;
}
.ml-idx { color: #78909c; font-family: monospace; font-size: 0.7rem; }
.ml-val { font-weight: 600; color: #fff59d; font-variant-numeric: tabular-nums; }

/* T2.2: Saved Views floating panel — right edge, above coord-bar */
.saved-views-wrap {
  position: absolute; right: 1rem; top: 5rem; z-index: 25;
  width: 280px; max-height: 480px;
  background: rgb(18, 20, 30);
  border: 1px solid rgba(255,213,79,0.25);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex; flex-direction: column;
}

/* T2.4: Annotations panel — also right, shifts down if Saved Views is open */
.annotations-wrap {
  position: absolute; right: 1rem; top: 5rem; z-index: 25;
  width: 320px; max-height: 500px;
  background: rgb(18, 20, 30);
  border: 1px solid rgba(233,30,99,0.3);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  overflow: hidden;
  display: flex; flex-direction: column;
}
/* If both panels are open, push annotations down */
.saved-views-wrap ~ .annotations-wrap { top: calc(5rem + 500px); }

/* ── Transitions ── */
.sidebar-slide-enter-active, .sidebar-slide-leave-active,
.panel-slide-enter-active,   .panel-slide-leave-active,
.section-slide-enter-active, .section-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.sidebar-slide-enter-from, .sidebar-slide-leave-to { opacity: 0; transform: translateY(8px); }
.panel-slide-enter-from,   .panel-slide-leave-to   { opacity: 0; transform: translateX(-8px); }
.section-slide-enter-from, .section-slide-leave-to { opacity: 0; transform: translateY(6px); }

/* ── Animations ── */
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
</style>
