<template>
  <div class="viewer-3d-root" ref="rootEl">
    <div v-if="!nodes.size" class="empty-state">
      Kein Netz geladen – bitte ISYBAU-XML importieren.
    </div>
    <div v-else ref="canvasEl" class="canvas-host" />

    <Viewer3DControls
      v-model:showNodes="showNodes"
      v-model:showEdges="showEdges"
      v-model:showAreas="showAreas"
      v-model:showResults="showResults"
      v-model:showWaterLevel="showWaterLevel"
      v-model:zScale="zScale"
      :hasResults="hasResults"
      @reset-view="core.resetView()"
    />

    <Viewer3DInfoPanel
      :element="selectedElement"
      :result="selectedResult"
      :edges="props.edges"
      :systemStats="props.systemStats"
      @close="selectedElement = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { useThreeCore }    from './viewer3d/useThreeCore.js';
import { useSceneBuilder } from './viewer3d/useSceneBuilder.js';
import Viewer3DControls    from './viewer3d/Viewer3DControls.vue';
import Viewer3DInfoPanel   from './viewer3d/Viewer3DInfoPanel.vue';

const props = defineProps({
  nodes:            { type: Map,     required: true },
  edges:            { type: Map,     required: true },
  areas:            { type: Array,   default: () => [] },
  nodeResults:      { type: Map,     default: () => new Map() },
  edgeResults:      { type: Map,     default: () => new Map() },
  systemStats:      { type: Object,  default: () => ({}) },
  autoShowResults:  { type: Boolean, default: false },
});

const rootEl   = ref(null);
const canvasEl = ref(null);

// UI state — showResults initialised from prop so the "Ergebnis 3D" button can pre-enable it
const showNodes       = ref(true);
const showEdges       = ref(true);
const showAreas       = ref(true);
const showResults     = ref(props.autoShowResults);
const showWaterLevel  = ref(true);
const zScale          = ref(1);
const selectedElement = ref(null);

// Computed as a proper reactive value (plain Map.size is not tracked by Vue)
const hasResults = computed(() => props.nodeResults.size > 0 || props.edgeResults.size > 0);

// When parent navigates via "Ergebnis 3D" while already in 3D view, enable results
watch(() => props.autoShowResults, (v) => { if (v) showResults.value = true; });

// Result for the currently selected element (fed to info panel)
const selectedResult = computed(() => {
  if (!selectedElement.value) return null;
  const id = selectedElement.value.id;
  const isEdge = !!(selectedElement.value.fromNodeId || selectedElement.value.from);
  return isEdge ? (props.edgeResults.get(id) ?? null) : (props.nodeResults.get(id) ?? null);
});

// Three.js sub-systems
const core    = useThreeCore();
const builder = useSceneBuilder();

// Mouse-to-raycaster helper
const mouse = new THREE.Vector2();

// ─── Bounds ────────────────────────────────────────────────────────────────
const bounds = computed(() => {
  if (!props.nodes.size) return { minX: 0, minY: 0, minZ: 0, centerX: 0, centerY: 0, spanX: 10, spanY: 10, spanZ: 5 };

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const n of props.nodes.values()) {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    if (n.x < minX) minX = n.x;  if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;  if (n.y > maxY) maxY = n.y;
    const z = Number.isFinite(n.z) ? n.z : 0;
    if (z < minZ) minZ = z;      if (z > maxZ) maxZ = z;
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, minZ: 0, centerX: 0, centerY: 0, spanX: 10, spanY: 10, spanZ: 5 };

  return {
    minX, minY, minZ,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    spanX: maxX - minX,
    spanY: maxY - minY,
    spanZ: Math.max(maxZ - minZ, 0.1),
  };
});

// ─── Scene rebuild (debounced) ─────────────────────────────────────────────
let rebuildTimer  = null;
let pendingFitCam = false; // latched: set true by any watch, consumed on rebuild

function scheduleRebuild(fitCam = false) {
  if (fitCam) pendingFitCam = true; // never cleared until the rebuild actually runs
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    if (!core.scene) return;
    const b = bounds.value;
    builder.buildScene(core.scene, props.nodes, props.edges, props.areas, b, {
      showNodes:   showNodes.value,
      showEdges:   showEdges.value,
      showAreas:   showAreas.value,
      zScale:      zScale.value,
      showResults:    showResults.value,
      showWaterLevel: showWaterLevel.value,
      nodeResults:    props.nodeResults,
      edgeResults:    props.edgeResults,
    });
    if (pendingFitCam) { core.fitToNetwork(b.spanX, b.spanY, b.spanZ); pendingFitCam = false; }
  }, 150);
}

// ─── Render key: fingerprint of every property that affects the 3D view ────
// More reliable than deep-watching a large reactive Map, and only reacts to
// properties that actually change what's rendered (type, bauwerkstyp, profile…).
const renderKey = computed(() => {
  // Include result sizes so a new simulation triggers rebuild when results overlay is active
  let s = `n:${props.nodes.size}|e:${props.edges.size}|a:${props.areas.length}|nr:${props.nodeResults.size}|er:${props.edgeResults.size}`;
  for (const n of props.nodes.values()) {
    s += `|${n.type}·${n.bauwerkstyp}·${n.status}·${n.diameter ?? ''}·${n.z ?? ''}·${n.coverZ ?? ''}·${n.depth ?? ''}·${n.bauwerkData?.wehrLaenge ?? ''}`;
  }
  for (const e of props.edges.values()) {
    s += `|${e.profile?.type}·${e.profile?.height}·${e.profile?.width}·${e.z1 ?? ''}·${e.z2 ?? ''}·${e.coords?.length ?? 0}`;
  }
  for (const a of props.areas) {
    s += `|${a.points?.length ?? 0}`;
  }
  return s;
});

// Track previous node count to detect first-load (→ fitCam)
const _prevNodeCount = ref(0);

watch(renderKey, () => {
  const prevCount = _prevNodeCount.value;
  const currCount = props.nodes.size;
  _prevNodeCount.value = currCount;
  scheduleRebuild(prevCount === 0 && currCount > 0);
});

// Layer toggles / z-scale / result mode trigger a rebuild without camera reset
watch([showNodes, showEdges, showAreas, zScale, showResults, showWaterLevel], () => scheduleRebuild(false));

// ─── Raycasting ───────────────────────────────────────────────────────────
let pointerMoved = false;

function onPointerDown() { pointerMoved = false; }
function onPointerMove() { pointerMoved = true;  }

function onPointerUp(e) {
  if (pointerMoved || !core.renderer) return; // ignore drag-end
  const rect = core.renderer.domElement.getBoundingClientRect();
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, core.camera);
  const hits = raycaster.intersectObjects(builder.clickableObjects);
  if (hits.length > 0) {
    const mesh = hits[0].object;
    builder.setSelected(mesh);
    selectedElement.value = builder.objectDataMap.get(mesh) ?? null;
  } else {
    builder.setSelected(null);
    selectedElement.value = null;
  }
}

function onDblClick(e) {
  if (!core.renderer) return;
  const rect = core.renderer.domElement.getBoundingClientRect();
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, core.camera);
  const hits = raycaster.intersectObjects(builder.clickableObjects);
  if (hits.length > 0) core.focusMesh(hits[0].object);
}

// ─── Resize ───────────────────────────────────────────────────────────────
function onResize() { core.handleResize(canvasEl.value); }

// ─── Lifecycle ────────────────────────────────────────────────────────────
onMounted(() => {
  if (!canvasEl.value) return;
  core.init(canvasEl.value);
  core.startLoop();

  canvasEl.value.addEventListener('pointerdown', onPointerDown);
  canvasEl.value.addEventListener('pointermove', onPointerMove);
  canvasEl.value.addEventListener('pointerup',   onPointerUp);
  canvasEl.value.addEventListener('dblclick',    onDblClick);
  window.addEventListener('resize', onResize);

  // Initial build if data already present
  if (props.nodes.size) scheduleRebuild(true);
});

onBeforeUnmount(() => {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  canvasEl.value?.removeEventListener('pointerdown', onPointerDown);
  canvasEl.value?.removeEventListener('pointermove', onPointerMove);
  canvasEl.value?.removeEventListener('pointerup',   onPointerUp);
  canvasEl.value?.removeEventListener('dblclick',    onDblClick);
  window.removeEventListener('resize', onResize);
  builder.disposeFully(core.scene);
  core.dispose();
});
</script>

<style scoped>
.viewer-3d-root {
  width: 100%;
  height: 100%;
  position: relative;
  background: #0d1117;
  overflow: hidden;
}

.canvas-host {
  width: 100%;
  height: 100%;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a5568;
  font-size: 0.9rem;
  font-family: 'Press Start 2P', monospace;
  text-align: center;
  padding: 2rem;
}
</style>
