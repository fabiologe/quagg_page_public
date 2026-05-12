<template>
  <div class="terrain-import-container">
    
    <!-- 3D Canvas -->
    <div class="canvas-wrapper">
       <div 
         ref="canvasContainer" 
         class="canvas-mount"
         @click="handleWrapperClick"
         @mousemove="handleWrapperMove"
         @contextmenu="handleWrapperRightClick"
         @dblclick="handleWrapperDoubleClick"
         @mousedown="handleWrapperMouseDown"
         @mouseup="handleWrapperMouseUp"
       ></div>
       
       <!-- Header Overlay -->
       <div class="overlay-header">
          <div class="header-content">
            <h2>Import Terrain (3D Preview)</h2>
            <p>Inspect Geometry before Simulation</p>
          </div>
          
          <div class="header-actions">
             <button @click="$emit('cancel')" class="btn-secondary">
               Start Over
             </button>

             <!-- Undo / Redo -->
             <div class="undo-redo-group">
               <button
                 class="btn-icon"
                 :class="{ disabled: !anyCanUndo }"
                 :disabled="!anyCanUndo"
                 @click="_performUndo"
                 title="Rückgängig (Ctrl+Z)"
               >↶</button>
               <button
                 class="btn-icon"
                 :class="{ disabled: !anyCanRedo }"
                 :disabled="!anyCanRedo"
                 @click="_performRedo"
                 title="Wiederholen (Ctrl+Y)"
               >↷</button>
             </div>

             <label class="btn-file">
                <input type="file" accept=".xyz,.txt,.asc" @change="handleFileUpload" />
                <span>Select .XYZ File</span>
             </label>
             
             <CompassRose :angle="compassAngle" />
          </div>
       </div>

       <!-- Loading Overlay -->
       <div v-if="loading" class="overlay-loading">
         <div class="spinner"></div>
         <span>{{ loadingText }}</span>
       </div>

       <!-- Stats Overlay -->
       <div v-if="stats" class="overlay-stats">
         <div class="stats-title-row">
             <div class="stats-title">Terrain Statistics</div>
         </div>
         <div class="stat-row"><span>Grid:</span> <span>{{ stats.cols }} x {{ stats.rows }}</span></div>
         <div class="stat-row"><span>Resolution:</span> <span>~{{ stats.cellsize.toFixed(2) }}m</span></div>
         <div class="stat-row"><span>Min Z:</span> <span class="val-min">{{ stats.minZ.toFixed(2) }}m</span></div>
         <div class="stat-row"><span>Max Z:</span> <span class="val-max">{{ stats.maxZ.toFixed(2) }}m</span></div>
       </div>

       <!-- Tool UIs (Context Sensitive) -->
       
       <!-- SHOVEL UI -->
       <ShovelTool 
          v-if="simStore.activeTool === 'SHOVEL'" 
          :tool="shovelTool" 
       />

       <!-- BUILDING / DRAW UI -->
       <!-- Assuming activeTool 'DRAW' maps to Building Logic internally now -->
       <BuildingTool 
          v-if="simStore.activeTool && (simStore.activeTool === 'DRAW' || simStore.activeTool.startsWith('DRAW'))"
          :toolInstance="buildingTool"
       />

       <!-- CULVERT UI -->
       <CulvertTool 
          v-if="simStore.activeTool === 'CULVERT'"
       />

       <!-- WEIR UI -->
       <WeirTool
          v-if="simStore.activeTool === 'WEIR'"
       />

       <!-- NODE/SOURCE UI -->
       <NodeTool 
          v-if="simStore.activeTool === 'NODE'"
       />

       <!-- BOUNDARY UI -->
       <BoundaryTool
          v-if="simStore.activeTool === 'BOUNDARY'"
          :toolInstance="boundaryTool"
       />

       <!-- TEXTURE UI -->
       <TextureTool
          v-if="simStore.activeTool === 'TEXTURE'"
       />

       <!-- CROP / POLYGON-CROP unified panel -->
       <div v-if="simStore.activeTool === 'CROP'" class="crop-tool-ui" :class="{ 'polygon-crop-ui': cropMode === 'POLYGON' }">
         <div class="tool-panel">

           <!-- Header -->
           <div class="panel-header">
             <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
               stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
               style="vertical-align:middle;margin-right:6px">
               <circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/>
               <line x1="8.12" y1="7.62" x2="21" y2="21"/>
               <line x1="8.12" y1="16.38" x2="21" y2="3"/>
             </svg>
             Terrain zuschneiden
           </div>

           <!-- Mode toggle (only when not actively drawing) -->
           <div v-if="!cropTool.isDrawing.value && !polygonCropTool.isDrawing.value"
                class="crop-mode-toggle">
             <button :class="{ active: cropMode === 'BBOX' }" @click="setCropMode('BBOX')">
               <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5">
                 <rect x="3" y="3" width="18" height="18" rx="1"/>
               </svg>
               Rechteck
             </button>
             <button :class="{ active: cropMode === 'POLYGON' }" @click="setCropMode('POLYGON')">
               <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                 stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5">
                 <path d="M4 8 L8 4 L16 4 L20 8 L20 16 L16 20 L8 20 L4 16 Z"/>
               </svg>
               Polygon
             </button>
           </div>

           <!-- BBOX mode hints -->
           <template v-if="cropMode === 'BBOX'">
             <div class="hint" v-if="!cropTool.isDrawing.value">
               1/2 &nbsp;·&nbsp; Ecke <strong>klicken</strong>
             </div>
             <div class="hint" v-else style="color:#ff7043;font-weight:600">
               2/2 &nbsp;·&nbsp; Gegenüberliegende Ecke <strong>klicken</strong>
             </div>
             <div class="actions" v-if="cropTool.isDrawing.value">
               <button class="btn-clear" @click="cropTool.cancel()">✖ Abbrechen</button>
             </div>
           </template>

           <!-- Polygon mode hints -->
           <template v-if="cropMode === 'POLYGON'">
             <div class="hint" v-if="!polygonCropTool.isDrawing.value">
               Ersten Punkt <strong>klicken</strong>
             </div>
             <div class="hint" v-else style="color:#7c3aed;font-weight:600">
               {{ polygonCropTool.drawingPoints.value.length }} Punkte
               &nbsp;·&nbsp; Startpunkt oder <strong>Doppelklick</strong> zum Schließen
             </div>
             <div class="actions" v-if="polygonCropTool.isDrawing.value">
               <button class="btn-clear" @click="polygonCropTool.cancel()">✖ Abbrechen</button>
             </div>
           </template>

           <div class="hint" style="margin-top:8px;font-size:0.75rem;opacity:0.5">
             Rechtsklick = Abbrechen
           </div>

         </div>
       </div>

       <!-- CHANNEL LINE drawing panel -->
       <div v-if="simStore.activeTool === 'CHANNEL_LINE'" class="crop-tool-ui">
         <div class="tool-panel">
           <div class="panel-header">
             <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
               stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
               style="vertical-align:middle;margin-right:6px">
               <path d="M3 17 Q8 7 12 12 Q16 17 21 7"/>
               <circle cx="3" cy="17" r="1.5" fill="currentColor"/>
               <circle cx="21" cy="7" r="1.5" fill="currentColor"/>
             </svg>
             Flusslinie zeichnen
           </div>
           <div class="hint" style="color:#00e5ff;font-weight:600">
             {{ channelLineState.draftPoints.length }} Punkte
             &nbsp;·&nbsp; <strong>Klick</strong> = Punkt setzen
           </div>
           <div class="hint" style="margin-top:2px;font-size:0.76rem;opacity:0.7">
             Erster Punkt = Oberstrom · Letzter Punkt = Unterstrom
           </div>
           <div class="actions" style="margin-top:8px">
             <button class="btn-clear"
               :disabled="!channelLineState.draftPoints.length"
               @click="getChannelLineToolInstance().undoLastPoint()">← Undo</button>
             <button class="btn-confirm"
               :disabled="channelLineState.draftPoints.length < 2"
               @click="commitChannelLine"
               style="background:#00e5ff;color:#1a2a3a;font-weight:700;border:none;border-radius:4px;padding:4px 10px;cursor:pointer">
               ✓ Bestätigen
             </button>
             <button class="btn-clear" @click="cancelChannelLine">✖ Abbrechen</button>
           </div>
         </div>
       </div>

       <!-- OFFSET REF PICK panel -->
       <div v-if="simStore.activeTool === 'OFFSET_REF_PICK'" class="crop-tool-ui">
         <div class="tool-panel">
           <div class="panel-header">
             <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"
               stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
               style="vertical-align:middle;margin-right:6px">
               <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>
             </svg>
             Referenzpunkt wählen
           </div>

           <template v-if="refPickState.hoverInfo">
             <div class="hint" style="color:#ffaa00;font-weight:600">
               {{ refPickState.hoverInfo.label }}
             </div>
             <div class="hint" style="font-size:0.75rem;margin-top:2px">
               Survey Z: {{ refPickState.hoverInfo.surveyZ.toFixed(3) }} m
               <span v-if="refPickState.hoverInfo.demZ != null">
                 &ensp;·&ensp; DEM Z: {{ refPickState.hoverInfo.demZ.toFixed(3) }} m
                 &ensp;·&ensp;
                 <span :style="{ color: Math.abs(refPickState.hoverInfo.delta) < 0.05 ? '#2ecc71' : Math.abs(refPickState.hoverInfo.delta) < 0.3 ? '#f39c12' : '#e74c3c' }">
                   Δ {{ refPickState.hoverInfo.delta >= 0 ? '+' : '' }}{{ refPickState.hoverInfo.delta.toFixed(3) }} m
                 </span>
               </span>
             </div>
             <div class="hint" style="margin-top:4px;color:#7f8c8d;font-size:0.74rem">
               Klicken zum Auswählen
             </div>
           </template>
           <template v-else>
             <div class="hint" style="color:#7f8c8d">
               Maus über einen Vermessungspunkt bewegen
             </div>
           </template>

           <div class="actions" style="margin-top:8px">
             <button class="btn-clear" @click="simStore.setActiveTool(null)">✖ Abbrechen</button>
           </div>
         </div>
       </div>

       <!-- MAP LAYER CONTROL -->
       <LayerControl 
          v-if="parsedData" 
          :activeMode="activeLayerMode" 
          @set-mode="setLayerMode" 
       />

       <!-- INFO CARD -->
       <TerrainInfoCard
         v-if="selectedInfo"
         :visible="true"
         v-bind="selectedInfo"
         @close="selectedInfo = null; if(selectionMesh) selectionMesh.visible = false;"
       />

    </div>
  </div>
</template>

<style scoped>
/* Ensure canvas wrapper handles relative positioning for overlays */
.canvas-wrapper {
    position: relative;
    /* ... existing styles ... */
}
/* ... rest of existing styles ... */
</style>

<script setup>
import { ref, onMounted, onUnmounted, reactive, toRef, watch, computed } from 'vue';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useSimulationStore } from '../../stores/useSimulationStore.js';
import { useSurfaceStore } from '../../stores/useSurfaceStore.js';
import TerrainInfoCard from './TerrainInfoCard.vue';

// --- COMPOSABLES ---
import { useInteractionManager } from '../../composables/editor/useInteractionManager.js';
import { useDrawTool } from '../../composables/editor/useDrawTool.js';
import { useShovelTool } from '../../composables/editor/useShovelTool.js';
import { useBoundaryTool } from '../../composables/editor/useBoundaryTool.js';
import { useBuildingTool } from '../../composables/editor/useBuildingTool.js';
import { useCulvertTool } from '../../composables/editor/useCulvertTool.js';
import { useTextureTool } from '../../composables/editor/useTextureTool.js';
import { useLayerRenderer } from '../../composables/editor/useLayerRenderer.js';
import { useCropTool } from '../../composables/editor/useCropTool.js';
import { usePolygonCropTool } from '../../composables/editor/usePolygonCropTool.js';
import { useWeirTool } from '../../composables/editor/useWeirTool.js';
import { createTerrainMaterial } from '../../composables/editor/MapShader.js';
import { useHistoryManager } from '../../composables/useHistoryManager.js';
import { useSurveyPointsRenderer } from '../../composables/editor/useSurveyPointsRenderer.js';
import { useVirtualRasterRenderer } from '../../composables/editor/useVirtualRasterRenderer.js';
import { useBathyBrushTool } from '../../composables/editor/useBathyBrushTool.js';
import { channelLineState, getChannelLineToolInstance } from '../../composables/editor/useChannelLineTool.js';
import { refPickState, getRefPickToolInstance } from '../../composables/editor/useOffsetRefPickTool.js';
import {
    undoTerrain, redoTerrain, canUndoTerrain, canRedoTerrain,
    terrainUndoCount, terrainRedoCount
} from '../../composables/historyBridge.js';

// --- UI COMPONENTS ---
import LayerControl from './LayerControl.vue';
import CompassRose from './CompassRose.vue';
import BuildingTool from '../tools/BuildingTool.vue';
import CulvertTool from '../tools/CulvertTool.vue';
import WeirTool from '../tools/WeirTool.vue';
import NodeTool from '../tools/NodeTool.vue';
import BoundaryTool from '../tools/BoundaryTool.vue';
import ShovelTool from '../tools/ShovelTool.vue';
import TextureTool from '../tools/TextureTool.vue';

// No props needed for activeTool anymore, using store
const props = defineProps({}); 

const emit = defineEmits(['cancel', 'confirm']);
const geoStore = useGeoStore();
const simStore = useSimulationStore();
const surfaceStore = useSurfaceStore();

// --- STATE ---
const canvasContainer = ref(null);
const loading = ref(false);
const loadingText = ref('');
const parsedData = ref(null);
const rawContent = ref(null);
const stats = ref(null);
const selectedInfo = ref(null); // { x, y, z, col, row }
const activeLayerMode = ref('CLASSIC'); // 'CLASSIC' | 'SURFACE' | 'SOLID' | 'WIREFRAME' | 'CONTOUR' | 'TIFF'
const compassAngle = ref(0);

// --- THREE.JS OBJECTS ---
let scene, renderer, controls, animationId;
let cameraPerspective, cameraOrtho, activeCamera;
let terrainMesh, interactionPlane;
let selectionMesh;
const raycaster = new THREE.Raycaster();

// --- TOOLS SETUP ---
const drawTool = useDrawTool();
const shovelTool = useShovelTool();
const bathyBrushTool = useBathyBrushTool();
const boundaryTool = useBoundaryTool();
const buildingTool = useBuildingTool();
const culvertTool = useCulvertTool();
const textureTool = useTextureTool();
const cropTool = useCropTool();
const polygonCropTool = usePolygonCropTool();
const weirTool = useWeirTool();
const channelLineTool = getChannelLineToolInstance();
const refPickTool     = getRefPickToolInstance();
const { saveState, undo, redo, canUndo, canRedo } = useHistoryManager();

// Kombinierte Undo/Redo-Flags für die Toolbar-Buttons:
// true wenn Terrain-History ODER Vektor-History einen Eintrag hat.
const anyCanUndo = computed(() => canUndo.value || terrainUndoCount.value > 0);
const anyCanRedo = computed(() => canRedo.value || terrainRedoCount.value > 0);

// Which sub-mode is active inside the CROP tool: 'BBOX' | 'POLYGON'
const cropMode = ref('BBOX');

function setCropMode(mode) {
    if (cropMode.value === mode) return;
    // Reset the currently active sub-tool
    if (cropMode.value === 'BBOX') {
        cropTool.cancel();
        // Activate polygon tool NOW so its internal `scene` ref is populated
        polygonCropTool.activate(scene);
    } else {
        polygonCropTool.onRightClick({ scene });
        cropTool.activate(scene);
    }
    cropMode.value = mode;
}

// Proxy tool: delegates all events to the active sub-tool based on cropMode
const cropProxy = {
    activate(s) {
        scene = s;
        if (cropMode.value === 'POLYGON') polygonCropTool.activate(s);
        else cropTool.activate(s);
    },
    deactivate(s) {
        cropTool.deactivate(s);
        polygonCropTool.deactivate(s);
    },
    onClick(ctx)       { return cropMode.value === 'POLYGON' ? polygonCropTool.onClick(ctx)       : cropTool.onClick(ctx); },
    onMove(ctx)        { return cropMode.value === 'POLYGON' ? polygonCropTool.onMove(ctx)        : cropTool.onMove(ctx); },
    onDoubleClick(ctx) { return cropMode.value === 'POLYGON' ? polygonCropTool.onDoubleClick(ctx) : undefined; },
    onRightClick(ctx)  { return cropMode.value === 'POLYGON' ? polygonCropTool.onRightClick(ctx)  : cropTool.onRightClick?.(ctx); },
};

// Channel-line helper actions (called from inline UI)
function commitChannelLine() {
    getChannelLineToolInstance().commitLine();
    simStore.setActiveTool(null);
}
function cancelChannelLine() {
    simStore.setActiveTool(null); // deactivate() keeps committed line, discards draft
}

// Tool Mapping
const tools = {
    'DRAW': buildingTool,
    'SHOVEL': shovelTool,
    'BATHY_BRUSH': bathyBrushTool,
    'CHANNEL_LINE':    channelLineTool,
    'OFFSET_REF_PICK': refPickTool,
    'BOUNDARY': boundaryTool,
    'TEXTURE': textureTool,
    'CROP': cropProxy,          // single entry; delegates via cropMode
    'WEIR': weirTool,           // handles hover/ghost cell
    'SELECT': { /* Default handled by InteractionManager */ }, 
    'INFO': { 
        onClick: (ctx) => handleInfoClick(ctx),
        onMove: (ctx) => {} 
    },
    'PAN': { onClick: ()=>{}, onMove: ()=>{} } 
};

// Proxy handles DRAW_POLY etc
const toolMap = new Proxy(tools, {
    get: (target, prop) => {
        if (typeof prop === 'string' && prop.startsWith('DRAW')) return buildingTool;
        return target[prop];
    }
});

const activeTool = computed(() => simStore.activeTool); // Use SimStore

const interactionManager = useInteractionManager(
    activeTool,
    toolMap
);

const applyCameraLock = () => {
    if (!controls) return;
    const tool = activeTool.value;
    if (tool === 'SHOVEL' || tool === 'TEXTURE' || tool === 'CHANNEL_LINE' || tool === 'BATHY_BRUSH' || tool === 'OFFSET_REF_PICK') {
        controls.mouseButtons.LEFT = null;
    } else {
        if (activeCamera === cameraOrtho) {
            controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
            controls.mouseButtons.RIGHT = null;
        } else {
            controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
            controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        }
    }
};

// --- TOOL LIFECYCLE MANAGEMENT ---
watch(activeTool, (newVal, oldVal) => {
    // 1. Deactivate Old
    if (oldVal) {
        const tool = tools[oldVal];
        if (tool && typeof tool.deactivate === 'function') {
            tool.deactivate(scene);
        }
    }
    // 2. Activate New
    if (newVal) {
        const tool = tools[newVal];
        if (tool && typeof tool.activate === 'function') {
            tool.activate(scene);
        }
        
        applyCameraLock();

        // --- TEXTURE VIEW TOGGLE (Auto-switch on tool) ---
        if (newVal === 'TEXTURE') {
            setLayerMode('SURFACE');
        }
        // --- CROP: disable camera rotation so click-dragging doesn't orbit ---
        if (newVal === 'CROP' && controls) {
            controls.mouseButtons.LEFT = null;
        }
    }
}, { immediate: true });

// --- SHADER TOGGLE ---
const setLayerMode = (mode) => {
    activeLayerMode.value = mode;
};

watch(activeLayerMode, (val) => {
    if (terrainMesh && terrainMesh.material.uniforms) {
        terrainMesh.material.uniforms.uShowSurface.value = (val === 'SURFACE') ? 1.0 : 0.0;
        terrainMesh.material.uniforms.uIsSolid.value = (val === 'SOLID') ? 1.0 : 0.0;
        terrainMesh.material.uniforms.uIsWireframe.value = (val === 'WIREFRAME') ? 1.0 : 0.0;
        terrainMesh.material.uniforms.uIsContour.value = (val === 'CONTOUR') ? 1.0 : 0.0;
        // terrainMesh.material.wireframe = (val === 'WIREFRAME'); // Disabled: Native wireframe draws diagonals. We use custom Shader Grid instead.
        terrainMesh.material.needsUpdate = true;
    }
});

// --- UPDATE ON EXTERNAL SURFACE DATA ---
watch(() => surfaceStore.gridVersion, () => {
    if (surfaceStore.isInitialized && terrainMesh) {
        // Force visual update on the terrain mesh using the texture tool's logic
        textureTool.syncColors({ terrainMesh, parsedData: parsedData.value });
    }
});

// --- PHASE 4: Terrain Crop → Mesh Rebuild ---
// When cropTerrain() fires in useGeoStore it increments terrainVersion.
// We dispose the stale Three.js geometry (memory leak prevention!) and rebuild
// a fresh PlaneGeometry from the now-smaller gridData.
watch(() => geoStore.terrainVersion, (version) => {
    if (version === 0) return; // initial value – nothing to do
    const newTerrain = geoStore.terrain;
    if (!newTerrain || !newTerrain.gridData) return;

    // Sync local parsedData so stats overlay + all tool composables are up to date
    parsedData.value = { ...newTerrain };
    stats.value = newTerrain.stats || {
        cols: newTerrain.ncols,
        rows: newTerrain.nrows,
        cellsize: newTerrain.cellsize,
        minZ: newTerrain.minZ,
        maxZ: newTerrain.maxZ,
    };

    // Rebuild Three.js mesh with the new (smaller) geometry
    buildTerrainMesh(parsedData.value);

    console.log(`[MapEditor3D] Phase 4: rebuilt terrain mesh after crop (v${version}). ` +
        `New dims: ${newTerrain.ncols}×${newTerrain.nrows}`);
});


// --- INIT ---
onMounted(() => {
    initThreeJS();
    
    // Unified Grid Source (Preview OR Store)
    const activeGrid = computed(() => parsedData.value || geoStore.terrain);

    // Initialize Layer Renderer (Visualizes Imported Data)
    useLayerRenderer(scene, geoStore, activeGrid);

    // Render terrestrial survey points as colored point cloud
    useSurveyPointsRenderer(scene);

    // Render virtual raster (IDW corridor preview) as colored point cloud
    useVirtualRasterRenderer(scene);

    // Restore if data exists
    if (geoStore.terrain && geoStore.terrain.gridData) {
         loadingText.value = "Restoring Terrain...";
         loading.value = true;
         setTimeout(() => {
             parsedData.value = {
                 ...geoStore.terrain,
                 stats: geoStore.terrain.stats || geoStore.terrain // Fallback if stats nested or root
             };
             stats.value = parsedData.value.stats || parsedData.value;
             buildTerrainMesh(parsedData.value);
             loading.value = false;
         }, 100);
    }

    // ── Keyboard Shortcuts: Ctrl+Z (Undo) / Ctrl+Y or Ctrl+Shift+Z (Redo) ──
    window.addEventListener('keydown', _handleKeydown);
});

onUnmounted(() => {
    cancelAnimationFrame(animationId);
    if(renderer) renderer.dispose();
    if(controls) controls.dispose();
    if(terrainMesh) {
        terrainMesh.geometry.dispose();
        terrainMesh.material.dispose();
    }
    // Reset Tools
    buildingTool.reset(scene); // Resets wrapped draw tool
    culvertTool.reset(scene);
    boundaryTool.reset(scene);
    window.removeEventListener('keydown', _handleKeydown);
});


/** Einheitlicher Undo: Terrain zuerst, dann Vektor. */
function _performUndo() {
    if (canUndoTerrain()) {
        if (undoTerrain()) { _rebuildTerrainMesh(); return; }
    }
    if (canUndo.value) undo();
}

/** Einheitlicher Redo: Terrain zuerst, dann Vektor. */
function _performRedo() {
    if (canRedoTerrain()) {
        if (redoTerrain()) { _rebuildTerrainMesh(); return; }
    }
    if (canRedo.value) redo();
}

/**
 * Keyboard handler für Undo/Redo.
 * Ctrl+Z = Undo | Ctrl+Y = Redo | Ctrl+Shift+Z = Redo
 */
function _handleKeydown(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;

    // Nicht feuern wenn ein echtes Texteingabefeld aktiv ist
    const el = document.activeElement;
    const tag = el?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;

    // e.key ist beim Mac manchmal 'Z' (Großbuchstabe) → toLowerCase()
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        console.debug('[MapEditor3D] Ctrl+Z → _performUndo()');
        _performUndo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        console.debug('[MapEditor3D] Ctrl+Y → _performRedo()');
        _performRedo();
    }
}

/**
 * Baut das Three.js Terrain-Mesh nach einem Terrain-Undo/Redo neu.
 * Synchronisiert parsedData und Stats mit dem aktuellen geoStore.terrain.
 */
function _rebuildTerrainMesh() {
    const t = geoStore.terrain;
    if (!t || !t.gridData) return;

    parsedData.value = { ...t };
    stats.value = t.stats || {
        cols: t.ncols, rows: t.nrows,
        cellsize: t.cellsize, minZ: t.minZ, maxZ: t.maxZ,
    };

    buildTerrainMesh(parsedData.value);
    console.debug('[MapEditor3D] ✅ Terrain mesh rebuilt after undo/redo.');
}


// --- EVENT HANDLERS ---

const handleWrapperClick = (event) => {
    if (!renderer || !activeCamera) return;
    
    const context = {
        scene,
        camera: activeCamera,
        renderer,
        container: canvasContainer.value,
        raycaster,
        terrainMesh,
        interactionPlane,
        parsedData: parsedData.value,
        geoStore,
        simStore // NEW: Pass SimStore for Selection Logic
    };
    
    const res = interactionManager.handleClick(event, context);
    // Actions 'FINISHED' etc are now handled inside useBuildingTool for DRAW
};

const handleWrapperMove = (event) => {
    if (!renderer || !activeCamera) return;
    const context = {
        scene, camera: activeCamera, renderer, container: canvasContainer.value, raycaster, terrainMesh, interactionPlane, parsedData: parsedData.value, geoStore
    };
    interactionManager.handleMouseMove(event, context);
};

const handleWrapperRightClick = (event) => {
    if (!renderer || !activeCamera) return;
    const context = { scene }; 
    interactionManager.handleRightClick(event, context);
};

const handleWrapperDoubleClick = (event) => {
    if (!renderer || !activeCamera) return;
    const context = {
        scene, camera: activeCamera, renderer, container: canvasContainer.value, raycaster, terrainMesh, interactionPlane, parsedData: parsedData.value, geoStore 
    };
    interactionManager.handleDoubleClick(event, context);
};

const handleWrapperMouseDown = (event) => {
    if (!renderer || !activeCamera) return;
    const context = {
        scene, camera: activeCamera, renderer, container: canvasContainer.value, raycaster, terrainMesh, interactionPlane, parsedData: parsedData.value, geoStore 
    };
    interactionManager.handleMouseDown(event, context);
};

const handleWrapperMouseUp = (event) => {
    if (!renderer || !activeCamera) return;
    const context = {
        scene, camera: activeCamera, renderer, container: canvasContainer.value, raycaster, terrainMesh, interactionPlane, parsedData: parsedData.value, geoStore 
    };
    interactionManager.handleMouseUp(event, context);
};

const handleInfoClick = (ctx) => {
    // Re-implement Info Tool Logic here or extract to useInfoTool?
    // For now, inline to save file count.
    const { pointer, raycaster, camera, terrainMesh, parsedData } = ctx;
    
    // ... Raycast Logic (similar to shovel) ...
    // Note: InteractionManager already updated coordinates.
    // But we need to use them.
    raycaster.setFromCamera(pointer, camera);
     const plane = interactionPlane;
     const target = new THREE.Vector3();
     raycaster.ray.intersectPlane(plane, target);
     
     if (target && parsedData) {
         const { minZ, center, cellsize, ncols, nrows, gridData, bounds } = parsedData;
         const localX = target.x + bounds.width / 2;
         const localY = -target.z + bounds.height / 2;
         const col = Math.round(localX / cellsize);
         const geomRow = Math.round(localY / cellsize); 
         const gridRow = (nrows - 1) - geomRow;
         
         if (col >= 0 && col < ncols && gridRow >= 0 && gridRow < nrows) {
             const idx = gridRow * ncols + col;
             let zVal = minZ;
             if (gridData[idx] > -9000) zVal = gridData[idx];
             
             const realX = target.x + center.x;
             const realY = -target.z + center.y;
             
             // const wX = (col * cellsize) - (bounds.width / 2);
             console.log("Info Hit:", realX, realY, zVal);
             
             selectedInfo.value = {
                 x: realX, y: realY, z: zVal, col, row: gridRow
             };
         }
     }
};

// --- LOGIC: BOUNDARY FINISH ---
const finishBoundary = (type) => {
    // Call composable logic
    boundaryTool.finishLine(type, scene, geoStore, { parsedData: parsedData.value });
};


// --- THREE.JS SETUP ---
const initThreeJS = () => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);
    
    const width = canvasContainer.value.clientWidth;
    const height = canvasContainer.value.clientHeight;
    
    cameraPerspective = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    cameraPerspective.position.set(0, 500, 500); // RTS-Angle (Start Position)
    
    const aspect = width / height;
    const frustumSize = 100;
    cameraOrtho = new THREE.OrthographicCamera(
        frustumSize * aspect / -2, frustumSize * aspect / 2, 
        frustumSize / 2, frustumSize / -2, 
        0.1, 10000
    );
    cameraOrtho.position.set(0, 1000, 0);
    cameraOrtho.up.set(0, 0, -1);
    cameraOrtho.lookAt(0, 0, 0);

    activeCamera = cameraPerspective;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvasContainer.value.appendChild(renderer.domElement);
    
    controls = new MapControls(activeCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 10;
    controls.maxPolarAngle = Math.PI / 2.2;
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 300, 100);
    scene.add(dirLight);

    interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    // Info Selection Mesh
    selectionMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ color: 0x3498db, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    selectionMesh.rotation.x = -Math.PI / 2;
    selectionMesh.visible = false;
    scene.add(selectionMesh);
    
    animate();
    
    window.addEventListener('resize', onWindowResize);
};

const animate = () => {
    animationId = requestAnimationFrame(animate);
    controls.update();

    if (activeCamera && controls) {
        if (activeCamera === cameraOrtho) {
            // In 2D Top-Down mode, rotation is locked. Fix compass to 0 to prevent jitter.
            compassAngle.value = 0;
        } else {
            // In 3D Perspective mode, calculate azimuthal angle.
            const dx = activeCamera.position.x - controls.target.x;
            const dz = activeCamera.position.z - controls.target.z;
            // Add a small threshold to avoid precision jitter when looking perfectly down
            if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                compassAngle.value = Math.atan2(dx, dz) * (180 / Math.PI);
            }
        }
    }

    renderer.render(scene, activeCamera);
};

const onWindowResize = () => {
    if (!renderer || !canvasContainer.value) return;
    const width = canvasContainer.value.clientWidth;
    const height = canvasContainer.value.clientHeight;
    
    cameraPerspective.aspect = width / height;
    cameraPerspective.updateProjectionMatrix();
    
    const aspect = width / height;
    const frustumSize = 100; // Keep scale consistent
    cameraOrtho.left = -frustumSize * aspect / 2;
    cameraOrtho.right = frustumSize * aspect / 2;
    cameraOrtho.top = frustumSize / 2;
    cameraOrtho.bottom = -frustumSize / 2;
    cameraOrtho.updateProjectionMatrix();

    renderer.setSize(width, height);
};

// --- LOGIC: CAMERA CONTROL ---
const setCameraView = (axis) => {
    if (!controls || !parsedData.value) return;
    const bounds = parsedData.value.bounds;
    const maxDim = Math.max(bounds.width, bounds.height);

    if (axis === 'XY') { // 2D Mode
        if (activeCamera !== cameraOrtho) {
            activeCamera = cameraOrtho;
            controls.dispose();
            controls = new MapControls(activeCamera, renderer.domElement);
            controls.enableDamping = true;
        }
        controls.enableRotate = false;
        controls.screenSpacePanning = true;
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        
        applyCameraLock();

        // Fit Bounds
        activeCamera.position.set(0, 1000, 0); 
        activeCamera.up.set(0, 0, -1); 
        activeCamera.lookAt(0, 0, 0);
        activeCamera.zoom = 1;
        
        // Fit Bounds
        const aspect = canvasContainer.value.clientWidth / canvasContainer.value.clientHeight;
        activeCamera.left = -maxDim * aspect / 2;
        activeCamera.right = maxDim * aspect / 2;
        activeCamera.top = maxDim / 2;
        activeCamera.bottom = -maxDim / 2;
        activeCamera.updateProjectionMatrix();

        if (terrainMesh && terrainMesh.material.uniforms) {
            terrainMesh.material.uniforms.uIs2D.value = 1.0;
        }

    } else { // 3D Mode
        if (activeCamera !== cameraPerspective) {
            activeCamera = cameraPerspective;
            controls.dispose();
            controls = new MapControls(activeCamera, renderer.domElement);
            controls.enableDamping = true;
            controls.screenSpacePanning = false;
            controls.minDistance = 10;
            controls.maxPolarAngle = Math.PI / 2.2;
            controls.enableDamping = true;
        }
        controls.enableRotate = true;
        controls.screenSpacePanning = false;

        applyCameraLock();

        const dist = maxDim * 1.2;
        if (axis === 'XZ') { // Front
             activeCamera.position.set(0, maxDim * 0.5, dist);
             activeCamera.up.set(0, 1, 0);
        } else if (axis === 'YZ') { // Side
             activeCamera.position.set(dist, maxDim * 0.5, 0);
             activeCamera.up.set(0, 1, 0);
        }
        activeCamera.lookAt(0,0,0);
        
        if (terrainMesh && terrainMesh.material.uniforms) {
            terrainMesh.material.uniforms.uIs2D.value = 0.0;
        }
    }
    controls.target.set(0, 0, 0);
    controls.update();
};



// --- FILE UPLOAD & TERRAIN GEN ---
const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    loading.value = true;
    loadingText.value = "Reading File...";
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
           rawContent.value = e.target.result;
           await new Promise(r => setTimeout(r, 50)); // Render UI
           const result = parseXYZ(rawContent.value);
           if (result) {
               parsedData.value = result;
               stats.value = result.stats;
               // store.editorMode = 'IMPORT_TERRAIN'; // Removed dependency on old store
               
               // USER REQUEST: Update Store Immediately
               // store.demRaw = rawContent.value;
               geoStore.importTerrain(result);
               console.log("Terrain Updated Immediately (Map3D). Center:", result.center);

               buildTerrainMesh(result);
           }
        } catch(e) {
            alert(e.message);
        } finally {
            loading.value = false;
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};


const parseXYZ = (text) => {
    const lines = text.trim().split('\n');
    const points = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#') || isNaN(line.codePointAt(0))) continue; 
        const parts = line.split(/[\s,]+/); 
        if (parts.length >= 3) {
            points.push({ x: parseFloat(parts[0]), y: parseFloat(parts[1]), z: parseFloat(parts[2]) });
        }
    }
    if (points.length === 0) throw new Error("No numeric points found.");

    const uniqueX = [...new Set(points.map(p => p.x))].sort((a,b) => a-b);
    const uniqueY = [...new Set(points.map(p => p.y))].sort((a,b) => a-b);
    const minX = uniqueX[0], maxX = uniqueX[uniqueX.length-1];
    const minY = uniqueY[0], maxY = uniqueY[uniqueY.length-1];
    let cellsize = uniqueX.length > 1 ? (uniqueX[1]-uniqueX[0]) : 1.0;
    cellsize = Math.round(cellsize * 100) / 100 || 1.0;
    
    const ncols = Math.round((maxX - minX) / cellsize) + 1;
    const nrows = Math.round((maxY - minY) / cellsize) + 1;
    if (ncols * nrows > 20000000) throw new Error(`Grid too large (${ncols}x${nrows})`);

    const gridData = new Float32Array(ncols * nrows).fill(-9999);
    let minZ = Infinity, maxZ = -Infinity;

    for (const p of points) {
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
        const col = Math.round((p.x - minX) / cellsize);
        const row = Math.round((p.y - minY) / cellsize);
        if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
             gridData[row * ncols + col] = p.z;
        }
    }

    return {
        gridData, ncols, nrows, cellsize, minZ, maxZ,
        xllcorner: minX, yllcorner: minY, // Keep origin for Export
        center: { x: (minX + maxX)/2, y: (minY + maxY)/2 },
        bounds: { width: (maxX-minX)||100, height: (maxY-minY)||100 },
        stats: { cols: ncols, rows: nrows, cellsize, minZ, maxZ }
    };
};

const buildTerrainMesh = (result) => {
    const { ncols, nrows, gridData, minZ, maxZ, bounds } = result;
    const geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, ncols - 1, nrows - 1);
    const count = geometry.attributes.position.count;

    // Per-vertex validity flag: 1.0 = real data, 0.0 = NODATA
    const validArray = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
        const col = i % ncols;
        const geomRow = Math.floor(i / ncols); 
        const gridRow = (nrows - 1) - geomRow; 
        const idx = gridRow * ncols + col;
        let zVal = minZ;
        let valid = 0.0;
        if (idx >= 0 && idx < gridData.length) {
             const val = gridData[idx];
             if (val > -9000) {
                 zVal = val;
                 valid = 1.0;
             }
        }
        geometry.attributes.position.setZ(i, (zVal - minZ));
        validArray[i] = valid;
    }
    geometry.setAttribute('aValid', new THREE.BufferAttribute(validArray, 1));

    // Surface color attribute (for Texture Pipeline painting)
    // Default to Asphalt (Light Gray #95a5a6) — will be updated by useTextureTool
    const surfaceColorArray = new Float32Array(count * 3);
    const defaultColor = new THREE.Color('#95a5a6');
    for (let i = 0; i < count * 3; i += 3) {
        surfaceColorArray[i]     = defaultColor.r; // R
        surfaceColorArray[i + 1] = defaultColor.g; // G
        surfaceColorArray[i + 2] = defaultColor.b; // B
    }
    geometry.setAttribute('aSurfaceColor', new THREE.BufferAttribute(surfaceColorArray, 3));

    geometry.computeVertexNormals();

    geometry.computeVertexNormals();

    const material = createTerrainMaterial(minZ, maxZ, bounds, result.cellsize);

    if (terrainMesh) {
         scene.remove(terrainMesh);
         terrainMesh.geometry.dispose();
         terrainMesh.material.dispose();
    }
    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.userData.isTerrain = true; // IMPORTANT: Tagging for Shovel Tool
    terrainMesh.rotation.x = -Math.PI / 2;
    scene.add(terrainMesh);
    
    // Position camera
    const maxDim = Math.max(bounds.width, bounds.height);
    if(activeCamera === cameraPerspective) {
         activeCamera.position.set(0, maxDim * 0.8, maxDim * 0.8);
    }
    controls.target.set(0, 0, 0);
    controls.update();
};

// --- WATER VISUALIZATION DISABLED ---
// Result frames are displayed in the dedicated popup Result Viewer (ResultMap3D.vue).
// Keeping editor free of simulation result rendering to avoid confusion.
// To re-enable: uncomment the watcher + updateWaterLayer below.
/*
let waterMesh;

watch(() => simStore.currentFrameIndex, (newIndex) => {
    if (newIndex >= 0 && simStore.resultFrames.has(newIndex)) {
        const data = simStore.resultFrames.get(newIndex);
        if (data && parsedData.value) {
            updateWaterLayer(data, parsedData.value);
        }
    } else {
        if (waterMesh) waterMesh.visible = false;
    }
});
*/

defineExpose({ 
    setCameraView,
    resize: onWindowResize // EXPOSE RESIZE
});
</script>

<style scoped>
.terrain-import-container { width: 100%; height: 100%; background: #f5f5f5; font-family: sans-serif; }
.canvas-wrapper { width: 100%; height: 100%; position: relative; }
.canvas-mount { width: 100%; height: 100%; }

/* Header & Overlay */
.overlay-header {
    position: absolute; top: 0; left: 0; right: 0;
    z-index: 10; padding: 1rem 1.5rem;
    background: rgba(255, 255, 255, 0.9);
    border-bottom: 1px solid #ddd;
    display: flex; justify-content: space-between; align-items: center;
    backdrop-filter: blur(8px);
}
.header-content h2 { margin: 0; font-size: 1.25rem; font-weight: 600; color: #2c3e50; }
.header-content p { margin: 0.25rem 0 0; font-size: 0.875rem; color: #7f8c8d; }

.header-actions { display: flex; gap: 1rem; align-items: center; }

/* Buttons */
.btn-secondary {
    padding: 0.5rem 1rem;
    background-color: transparent; border: 1px solid #bdc3c7;
    border-radius: 4px; color: #7f8c8d;
    cursor: pointer; font-weight: 500; transition: all 0.2s;
}
.btn-secondary:hover { background-color: #ecf0f1; color: #2c3e50; }

/* Undo / Redo */
.undo-redo-group {
    display: flex;
    gap: 2px;
    background: rgba(255,255,255,0.9);
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    overflow: hidden;
}
.btn-icon {
    width: 32px; height: 32px;
    border: none;
    background: transparent;
    color: #2c3e50;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
    border-radius: 0;
}
.btn-icon:hover:not(:disabled) { background: #e8f4fd; color: #2980b9; }
.btn-icon:disabled, .btn-icon.disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.btn-file {
    position: relative; display: inline-block; cursor: pointer;
}
.btn-file input { display: none; }
.btn-file span {
    display: inline-block; padding: 0.5rem 1rem;
    background-color: #ecf0f1; border: 1px solid #bdc3c7;
    border-radius: 4px; color: #2c3e50; font-weight: 500;
    transition: background 0.2s;
}
.btn-file:hover span { background-color: #bdc3c7; }

.btn-primary {
    padding: 0.5rem 1.25rem; background-color: #3498db;
    color: white; border: none; border-radius: 4px;
    font-weight: 600; cursor: pointer;
    box-shadow: 0 2px 4px rgba(52, 152, 219, 0.3); transition: background 0.2s;
}
.btn-primary:hover { background-color: #2980b9; }

/* Loading */
.overlay-loading {
    position: absolute; inset: 0;
    background: rgba(255, 255, 255, 0.85); z-index: 50;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.spinner {
    width: 48px; height: 48px;
    border: 4px solid #3498db; border-top: 4px solid transparent;
    border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Stats */
.overlay-stats {
    position: absolute;
    bottom: 1.5rem;
    left: 1.5rem;
    background: rgba(44, 62, 80, 0.9);
    color: white;
    padding: 15px;
    border-radius: 8px;
    font-size: 0.85rem;
    pointer-events: auto;
    backdrop-filter: blur(8px);
    width: 250px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 100;
}
.stats-title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    border-bottom: 1px solid #7f8c8d;
    padding-bottom: 5px;
}
.stats-title { font-weight: bold; color: #ecf0f1; }

.stat-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
.val-min { color: #2980b9; font-weight: bold; }
.val-max { color: #8e44ad; font-weight: bold; }



/* Tool Panels (Shovel/Boundary) */
.tool-ui-panel {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(44, 62, 80, 0.9); color: white;
    padding: 10px 15px; border-radius: 6px;
    backdrop-filter: blur(4px); pointer-events: auto;
    text-align: center;
    min-width: 200px;
}
.panel-header { font-weight: bold; margin-bottom: 8px; color: #dcdcdc; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px; }
.hint { font-size: 0.85rem; opacity: 0.8; margin-bottom: 8px; }

.actions button {
    margin: 0 4px; padding: 4px 8px; border: none;
    background: #3498db; color: white; cursor: pointer;
    border-radius: 3px; font-size: 0.8rem;
}
.actions .btn-clear { background: #e74c3c; }

/* Crop Tool Panel */
.crop-tool-ui {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none;
    z-index: 100;
}
.crop-tool-ui .tool-panel {
    background: rgba(44, 62, 80, 0.92);
    color: white;
    padding: 15px 18px;
    border-radius: 10px;
    pointer-events: auto;
    font-size: 0.9rem;
    backdrop-filter: blur(10px);
    width: 270px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,69,0,0.4);
}
.crop-tool-ui .panel-header {
    font-weight: bold;
    margin-bottom: 12px;
    color: #ecf0f1;
    border-bottom: 1px solid rgba(255,69,0,0.4);
    padding-bottom: 6px;
    display: flex;
    align-items: center;
}
.crop-tool-ui .hint {
    text-align: center;
    padding: 8px 0;
    font-size: 0.85rem;
    color: #bdc3c7;
}
.crop-tool-ui .actions {
    display: flex;
    justify-content: center;
    margin-top: 8px;
}
.crop-tool-ui .actions button {
    padding: 5px 14px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
}
.crop-tool-ui .btn-clear {
    background: #e74c3c;
    color: white;
}
.crop-tool-ui .btn-clear:hover { background: #c0392b; }

/* Crop mode toggle */
.crop-mode-toggle {
    display: flex;
    gap: 6px;
    margin-bottom: 12px;
}
.crop-mode-toggle button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 8px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06);
    color: #bdc3c7;
    border-radius: 5px;
    cursor: pointer;
    font-size: 0.78rem;
    font-weight: 500;
    transition: all 0.15s;
}
.crop-mode-toggle button:hover {
    background: rgba(255,255,255,0.12);
    color: #ecf0f1;
}
.crop-mode-toggle button.active {
    background: rgba(255,69,0,0.25);
    border-color: rgba(255,69,0,0.6);
    color: #ff7043;
    font-weight: 700;
}
.polygon-crop-ui .crop-mode-toggle button.active {
    background: rgba(124,58,237,0.25);
    border-color: rgba(124,58,237,0.6);
    color: #a78bfa;
}

/* Polygon Crop panel accent colour override */
.polygon-crop-ui .tool-panel {
    box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(124,58,237,0.5);
}
.polygon-crop-ui .panel-header {
    border-bottom-color: rgba(124,58,237,0.5);
}
</style>
