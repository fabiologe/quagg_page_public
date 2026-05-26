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
        <div class="canvas-root" ref="canvasRef"></div>

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

            <!-- loaded model tags -->
            <div v-if="modelList.length" class="model-tags">
              <span v-for="m in modelList" :key="m.modelId" class="model-tag">
                {{ m.name }}
                <button class="tag-close" @click="removeModel(m.modelId)" title="Entfernen">✕</button>
              </span>
            </div>
          </div>

          <div v-if="loading" class="loading-badge">
            <span class="spinner"></span> Wird geladen…
          </div>
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
        </div>

        <!-- Section-Cut Mode Bar (gizmo is interactive in scene) -->
        <Transition name="section-slide">
          <div v-if="sectionActive" class="section-bar">
            <span class="section-label">✂️ Schnitt</span>
            <div class="section-modes">
              <button
                class="mode-btn"
                :class="{ active: sectionMode === 'translate' }"
                title="Verschieben (X/Y/Z Pfeile)"
                @click="setSectionMode('translate')"
              >⇔ Pos</button>
              <button
                class="mode-btn"
                :class="{ active: sectionMode === 'rotate' }"
                title="Drehen (Orbit-Ringe)"
                @click="setSectionMode('rotate')"
              >↻ Rot</button>
            </div>
            <button class="section-close" @click="closeSectionCut" title="Schnitt entfernen">✕</button>
          </div>
        </Transition>

        <!-- Koordinatenanzeige -->
        <div v-if="coords" class="coord-bar">
          <span class="coord-mode-badge">{{ coordMode === 'ifc' ? 'IFC' : 'Viewer' }}</span>
          <span v-if="coordMode === 'viewer'"><b>X</b> {{ coords.x }}</span>
          <span v-if="coordMode === 'viewer'"><b>Y</b> {{ coords.y }}</span>
          <span v-if="coordMode === 'viewer'"><b>Z</b> {{ coords.z }}</span>
          <span v-if="coordMode === 'ifc'"><b>X</b> {{ coords.ox }}</span>
          <span v-if="coordMode === 'ifc'"><b>Y</b> {{ coords.oy }}</span>
          <span v-if="coordMode === 'ifc'"><b>Z</b> {{ coords.oz }}</span>
        </div>

        <!-- Element-Indikator (wenn Properties-Fenster geschlossen) -->
        <Transition name="sidebar-slide">
          <div v-if="ifc.selectedElement && !propertiesOpen" class="sel-badge" @click="emit('open-properties')">
            <span class="sel-type">{{ ifc.selectedElement.type }}</span>
            <span class="sel-name">{{ ifc.selectedElement.name || '—' }}</span>
            <span class="sel-hint">Eigenschaften öffnen ↗</span>
          </div>
        </Transition>

        <!-- Layer-Panel (floating) -->
        <Transition name="panel-slide">
          <IfcLayerPanel
            v-if="showLayerPanel && categoryList.length"
            :categories="categoryList"
            @toggle="onToggleCategory"
            @close="showLayerPanel = false"
          />
        </Transition>

      </div>
    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import { IfcEngine } from '../services/IfcEngine.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import IfcLayerPanel   from './IfcLayerPanel.vue';

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
const loading     = ref(false);
const dropdownOpen = ref(false);
const coords      = ref(null);

// Layer panel
const showLayerPanel = ref(false);
const categoryList   = ref([]); // [{name, count, visible}]

// Section cut
const sectionActive = ref(false);
const sectionMode   = ref('translate'); // 'translate' | 'rotate'

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
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
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

  // Reset section cut if one was open
  if (sectionActive.value) {
    engine.value.deleteSectionCuts();
    sectionActive.value = false;
  }

  emit('model-loaded');
}

// ── Section cuts ─────────────────────────────────────────────────────────────
function toggleSectionCut() {
  if (sectionActive.value) {
    closeSectionCut();
  } else {
    const result = engine.value?.createSectionCut();
    if (!result) return;
    sectionMode.value   = 'translate';
    sectionActive.value = true;
  }
}

function closeSectionCut() {
  engine.value?.deleteSectionCuts();
  sectionActive.value = false;
}

function setSectionMode(mode) {
  sectionMode.value = mode;
  engine.value?.setSectionMode(mode);
}

// ── Layer panel ───────────────────────────────────────────────────────────────
async function onToggleCategory({ name, visible }) {
  await engine.value?.setCategoryVisible(name, visible);
  const entry = categoryList.value.find(c => c.name === name);
  if (entry) entry.visible = visible;
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
  _hoverTimer = setTimeout(() => {
    const m = _lastMouse;
    if (m) engine.value?.hoverElement(m.x, m.y);
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

  if (Math.hypot(dx, dy) > 5) return;

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

/* ── Top bar ── */
.top-bar {
  position: absolute; top: 1rem; left: 1rem; right: 1rem; z-index: 20;
  display: flex; justify-content: space-between; align-items: center;
  background: rgba(255,255,255,0.95); padding: 0.65rem 1.25rem;
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  backdrop-filter: blur(4px);
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
  background: rgba(30,30,40,0.85); padding: 0.45rem; border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3); backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.08);
}
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

/* ── Section cut bar ── */
.section-bar {
  position: absolute; bottom: 1rem; left: 75px; z-index: 21;
  display: flex; align-items: center; gap: 0.65rem;
  background: rgba(20,22,35,0.92); border: 1px solid rgba(52,152,219,0.4);
  padding: 0.45rem 0.85rem; border-radius: 8px; backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
}
.section-label {
  font-size: 0.78rem; color: #90caf9; white-space: nowrap; font-weight: 600;
}
.section-modes { display: flex; gap: 0.3rem; }
.mode-btn {
  padding: 0.25rem 0.65rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06); color: #90a4ae; font-size: 0.75rem;
  cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.mode-btn:hover  { background: rgba(255,255,255,0.12); color: #cfd8dc; }
.mode-btn.active { background: rgba(52,152,219,0.3); color: #4fc3f7; border-color: rgba(52,152,219,0.55); }
.section-close {
  background: none; border: none; color: #546e7a; font-size: 1rem;
  cursor: pointer; padding: 0; line-height: 1; transition: color 0.15s; margin-left: 0.2rem;
}
.section-close:hover { color: #ef5350; }

/* ── Coordinate display ── */
.coord-bar {
  position: absolute; bottom: 0.75rem; right: 0.75rem; z-index: 20;
  display: flex; align-items: center; gap: 1rem; background: rgba(30,30,40,0.85);
  padding: 0.38rem 0.7rem; border-radius: 6px;
  font-family: 'Roboto Mono', monospace; font-size: 0.73rem; color: #b0bec5;
  backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.08);
  pointer-events: none;
}
.coord-bar b { color: #4fc3f7; margin-right: 3px; }
.coord-mode-badge {
  font-size: 0.6rem; font-weight: 700; color: #546e7a;
  background: rgba(255,255,255,0.06); border-radius: 3px;
  padding: 0.05rem 0.3rem; letter-spacing: 0.05em;
}

/* ── Model tags ── */
.model-tags { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.model-tag {
  display: flex; align-items: center; gap: 0.3rem;
  background: rgba(52,152,219,0.15); border: 1px solid rgba(52,152,219,0.35);
  border-radius: 4px; padding: 0.2rem 0.5rem;
  font-size: 0.78rem; color: #90caf9; max-width: 160px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tag-close {
  background: none; border: none; cursor: pointer;
  color: #546e7a; font-size: 0.7rem; padding: 0; line-height: 1;
  flex-shrink: 0; transition: color 0.12s;
}
.tag-close:hover { color: #ef5350; }

/* ── Selection badge ── */
.sel-badge {
  position: absolute; bottom: 1rem; right: 1rem; z-index: 20;
  display: flex; flex-direction: column; gap: 0.1rem;
  background: rgba(20,22,30,0.9); border: 1px solid rgba(52,152,219,0.4);
  border-radius: 8px; padding: 0.45rem 0.7rem; cursor: pointer;
  backdrop-filter: blur(8px); transition: border-color 0.15s;
}
.sel-badge:hover { border-color: rgba(52,152,219,0.9); }
.sel-type { font-size: 0.58rem; color: #546e7a; font-family: monospace; }
.sel-name { font-size: 0.75rem; color: #cfd8dc; font-weight: 600; }
.sel-hint { font-size: 0.58rem; color: #3498db; margin-top: 0.1rem; }

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
