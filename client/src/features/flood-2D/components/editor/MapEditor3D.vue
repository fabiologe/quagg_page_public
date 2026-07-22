<template>
  <div class="terrain-import-container">
    
    <!-- 3D Canvas -->
    <div class="canvas-wrapper">
       <div 
         ref="canvasContainer" 
         class="canvas-mount"
         @click="handleWrapperClick"
         @pointermove="handleWrapperMove"
         @contextmenu="handleWrapperRightClick"
         @dblclick="handleWrapperDoubleClick"
         @pointerdown="handleWrapperMouseDown"
         @pointerup="handleWrapperMouseUp"
       ></div>

       <!-- Leerer Zustand: Terminal/ASCII-Startbildschirm bis ein Raster geladen ist -->
       <DefaultMap v-if="!hasTerrain && !loading" />

       <!-- Header Overlay -->
       <div class="overlay-header">
          <div class="header-content">
            <h2 class="sv-title">SaintV<span class="sv-accent">-2D</span></h2>
            <p class="sv-subtitle">// 2D terrain editor</p>
          </div>

          <div class="header-actions">
             <button @click="$emit('cancel')" class="sv-btn">
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

             <label class="sv-btn sv-btn-file">
                <input type="file" accept=".xyz,.txt,.asc" @change="handleFileUpload" />
                <span>Select .XYZ File</span>
             </label>

             <CompassRose :angle="compassAngle" />
          </div>
       </div>

       <!-- Kanalnetz-UI (Import, Tabelle, Eigenschaften) lebt komplett im ScenarioManager-
            „Netz"-Tab. 3D-Szene zeigt nur das gerenderte Netz + die Setz-Werkzeuge. -->

       <!-- Loading Overlay -->
       <SaintVLoader v-if="loading" :text="loadingText" />

       <!-- XYZ-Import: Auflösungs-Dialog (irreguläre Punktwolken) -->
       <div v-if="showImportPanel && importAnalysis" class="import-panel sv-panel sv-theme">
         <div class="import-title sv-title">SaintV<span class="sv-accent">-2D</span></div>
         <div class="import-badge">
           {{ importAnalysis.isRegular ? 'Reguläres Gitter' : 'Irreguläre Punktwolke' }}
           · {{ importAnalysis.count.toLocaleString() }} Punkte
         </div>
         <div class="import-row">
           <label>Ziel-Zellweite [m]</label>
           <input class="sv-input" type="number" min="0.1" step="0.5" v-model.number="importCellsize" />
         </div>
         <div class="import-quick">
           <button class="sv-btn" @click="importCellsize = 1">1 m</button>
           <button class="sv-btn" @click="importCellsize = 2">2 m</button>
           <button class="sv-btn" @click="importCellsize = importAnalysis.suggestedCellsize">
             Vorschlag {{ importAnalysis.suggestedCellsize }} m
           </button>
         </div>
         <div class="import-hint">
           ≈ {{ Math.max(1, Math.round(importAnalysis.extent.width / (importCellsize || 1)) + 1) }}
           × {{ Math.max(1, Math.round(importAnalysis.extent.height / (importCellsize || 1)) + 1) }} Zellen
           · TIN + IDW-Interpolation
         </div>
         <div class="import-actions">
           <button class="sv-btn" @click="cancelImport">Abbrechen</button>
           <button class="sv-btn sv-btn-go" @click="startBuild">Importieren</button>
         </div>
       </div>

       <!-- Stats Overlay (eigene, einklappbare Komponente) -->
       <TerrainStatics :stats="stats" />

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

       <!-- WEIR UI -->
       <WeirTool v-if="simStore.activeTool === 'WEIR'" />

       <!-- BRIDGE UI -->
       <BridgeTool v-if="simStore.activeTool === 'BRIDGE'" />

       <!-- KANALNETZ: Schacht setzen / Haltung ziehen (Unified Geometry Engine) -->
       <NetNodeTool v-if="simStore.activeTool === 'NET_NODE'" />
       <NetConduitTool v-if="simStore.activeTool === 'NET_CONDUIT'" />

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
         <div class="tool-panel" :class="{ collapsed: !cropPanel.panelVisible.value }"
              @mouseenter="cropPanel.onPanelEnter" @mouseleave="cropPanel.onPanelLeave">

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
             <span v-if="!cropPanel.panelVisible.value" class="collapse-dots">···</span>
           </div>

           <template v-if="cropPanel.panelVisible.value">
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
           </template>

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

       <!-- CHANNEL POLYGON drawing panel -->
       <div v-if="simStore.activeTool === 'CHANNEL_POLYGON'" class="crop-tool-ui">
         <div class="tool-panel">
           <div class="panel-header">
             <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
               stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
               style="vertical-align:middle;margin-right:6px">
               <polygon points="3,18 8,6 16,3 21,14 12,21"/>
             </svg>
             Flussschlauch zeichnen
           </div>
           <div class="hint" style="color:#f97316;font-weight:600">
             {{ channelPolygonState.draftPoints.length }} Punkte
             &nbsp;·&nbsp; <strong>Klick</strong> = Punkt setzen
           </div>
           <div class="hint" style="margin-top:2px;font-size:0.76rem;opacity:0.7">
             Polygon schließen = alle Zellen innen werden mit IDW befüllt
           </div>
           <div class="actions" style="margin-top:8px">
             <button class="btn-clear"
               :disabled="!channelPolygonState.draftPoints.length"
               @click="getChannelPolygonToolInstance().undoLastPoint()">← Undo</button>
             <button class="btn-confirm"
               :disabled="channelPolygonState.draftPoints.length < 3"
               @click="commitChannelPolygon"
               style="background:#f97316;color:#fff;font-weight:700;border:none;border-radius:4px;padding:4px 10px;cursor:pointer">
               ✓ Bestätigen
             </button>
             <button class="btn-clear" @click="cancelChannelPolygon">✖ Abbrechen</button>
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
import { useTextureTool } from '../../composables/editor/useTextureTool.js';
import { useLayerRenderer } from '../../composables/editor/useLayerRenderer.js';
import { useNetworkRenderer } from '../../composables/editor/useNetworkRenderer.js';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import NetNodeTool from '../tools/NetNodeTool.vue';
import NetConduitTool from '../tools/NetConduitTool.vue';
import { getNetworkConduitToolInstance } from '../../composables/editor/useNetworkConduitTool.js';
import { getNetworkNodeToolInstance } from '../../composables/editor/useNetworkNodeTool.js';
import { useCropTool } from '../../composables/editor/useCropTool.js';
import { useCollapsiblePanel } from '../../composables/editor/useCollapsiblePanel.js';
import { usePolygonCropTool } from '../../composables/editor/usePolygonCropTool.js';
import { getWeir3DToolInstance, weir3DState } from '../../composables/editor/useWeir3DTool.js';
import { getBridge3DToolInstance, bridge3DState } from '../../composables/editor/useBridge3DTool.js';
import { createTerrainMaterial } from '../../composables/editor/MapShader.js';
import { useHistoryManager } from '../../composables/useHistoryManager.js';
import { useSurveyPointsRenderer } from '../../composables/editor/useSurveyPointsRenderer.js';
import { useVirtualRasterRenderer } from '../../composables/editor/useVirtualRasterRenderer.js';
import { useBathyBrushTool } from '../../composables/editor/useBathyBrushTool.js';
import { channelLineState, getChannelLineToolInstance } from '../../composables/editor/useChannelLineTool.js';
import { useSgcRasterPreview } from '../../composables/editor/useSgcRasterPreview.js';
import { useBridgeRasterPreview } from '../../composables/editor/useBridgeRasterPreview.js';
import { channelPolygonState, getChannelPolygonToolInstance } from '../../composables/editor/useChannelPolygonTool.js';
import { refPickState, getRefPickToolInstance } from '../../composables/editor/useOffsetRefPickTool.js';
import {
    undoTerrain, redoTerrain, canUndoTerrain, canRedoTerrain,
    terrainUndoCount, terrainRedoCount
} from '../../composables/historyBridge.js';

// --- UI COMPONENTS ---
import LayerControl from './LayerControl.vue';
import CompassRose from './CompassRose.vue';
import TerrainStatics from './TerrainStatics.vue';
import SaintVLoader from '../common/SaintVLoader.vue';
import DefaultMap from './DefaultMap.vue';
import BuildingTool from '../tools/BuildingTool.vue';
import WeirTool from '../tools/WeirTool.vue';
import BridgeTool from '../tools/BridgeTool.vue';
import BoundaryTool from '../tools/BoundaryTool.vue';
import ShovelTool from '../tools/ShovelTool.vue';
import TextureTool from '../tools/TextureTool.vue';
import { flipRow } from '../../utils/gridIndex.js';

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

// Leerer Editor (kein Raster) → Terminal/ASCII-Startbildschirm zeigen
const hasTerrain = computed(() => !!(parsedData.value?.gridData || geoStore.terrain?.gridData));

// XYZ-Import (Auflösungs-Dialog für irreguläre/große Punktwolken)
const importAnalysis = ref(null);
const importCellsize = ref(1);
const showImportPanel = ref(false);
let importWorker = null;
const selectedInfo = ref(null); // { x, y, z, col, row }
const activeLayerMode = ref('WIREFRAME'); // 'CLASSIC' | 'SURFACE' | 'SOLID' | 'WIREFRAME' | 'CONTOUR' | 'TIFF' — Standard: Rasteransicht
const compassAngle = ref(0);

// --- THREE.JS OBJECTS ---
let scene, renderer, controls, animationId;
let cameraPerspective, cameraOrtho, activeCamera;
let terrainMesh, interactionPlane;
let sgcPreview; // { rebuild, clear, setVisible } — Sichtbarkeit an applyLayerMode() gekoppelt (nur WIREFRAME)
let bridgeRasterPreview; // dito, für die Brücken-Öffnungsbreiten-Vorschau
// Unsichtbare Tiefen-Maske, exakt deckungsgleich mit terrainMesh — nur für WIREFRAME aktiv (siehe
// applyLayerMode). Grund: der Wireframe-Shader discard'et fast alle Fragmente (MapShader.js,
// uIsWireframe-Zweig) und schreibt deshalb kaum Tiefe → vergrabene Geometrie (Weir-Wand-Unterkante,
// s. weirWall.js GROUND_BURY, aber auch SWMM-Schächte/Haltungen) scheint im Wireframe-Modus plötzlich
// durchs "leere" Gelände durch. Diese Maske schreibt Tiefe normal (colorWrite:false → unsichtbar),
// unabhängig vom Shader-Modus der sichtbaren Terrain-Mesh.
let terrainDepthMesh;
let selectionMesh;
let networkRenderer = null;   // Kanalnetz-Renderer (G2), in initScene gesetzt
const raycaster = new THREE.Raycaster();
const networkStore = useNetworkStore();

// --- TOOLS SETUP ---
const drawTool = useDrawTool();
const shovelTool = useShovelTool();
const bathyBrushTool = useBathyBrushTool();
const boundaryTool = useBoundaryTool();
const buildingTool = useBuildingTool();
const textureTool = useTextureTool();
const cropTool = useCropTool();
const polygonCropTool = usePolygonCropTool();
// Einheitliches Hover-Einklappen fürs Zuschneiden-Panel (Muster Tool-Panels);
// während des aktiven Zeichnens (BBOX-2.-Ecke / Polygon-Punkte) bleibt es offen.
const cropPanel = useCollapsiblePanel({
    forceOpen: () => !!(cropTool.isDrawing.value || polygonCropTool.isDrawing.value),
});
const weir3DTool = getWeir3DToolInstance();
const bridge3DTool = getBridge3DToolInstance();
const channelLineTool    = getChannelLineToolInstance();
const channelPolygonTool = getChannelPolygonToolInstance();
const refPickTool        = getRefPickToolInstance();
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

// Brücke = nur noch Polygon-3D-Körper (LINE-Modus entfernt) → direkt das 3D-Tool.
const bridgeProxy = {
    activate(s)      { bridge3DTool.activate(s); },
    deactivate(s)    { bridge3DTool.deactivate(s); },
    onClick(ctx)     { return bridge3DTool.onClick(ctx); },
    onMove(ctx)      { return bridge3DTool.onMove(ctx); },
    onMouseDown(ctx) { return bridge3DTool.onMouseDown(ctx); },
    onMouseUp(ctx)   { return bridge3DTool.onMouseUp(ctx); },
};

// Channel-line helper actions (called from inline UI)
function commitChannelLine() {
    getChannelLineToolInstance().commitLine();
    simStore.setActiveTool(null);
}
function cancelChannelLine() {
    simStore.setActiveTool(null); // deactivate() keeps committed line, discards draft
}

// Channel-polygon helper actions
function commitChannelPolygon() {
    getChannelPolygonToolInstance().commitPolygon();
    simStore.setActiveTool(null);
}
function cancelChannelPolygon() {
    simStore.setActiveTool(null);
}

// Kanalnetz-Werkzeuge (Singletons; Renderer wird in initScene gesetzt).
const networkConduitTool = getNetworkConduitToolInstance();
const networkNodeTool = getNetworkNodeToolInstance();

// Tool Mapping
const tools = {
    'NET_CONDUIT': networkConduitTool,
    'NET_NODE': networkNodeTool,      // Drag bestehender Schächte; Setzen via map-click
    'DRAW': buildingTool,
    'SHOVEL': shovelTool,
    'BATHY_BRUSH': bathyBrushTool,
    'CHANNEL_LINE':    channelLineTool,
    'CHANNEL_POLYGON': channelPolygonTool,
    'OFFSET_REF_PICK': refPickTool,
    'BOUNDARY': boundaryTool,
    'TEXTURE': textureTool,
    'CROP': cropProxy,          // single entry; delegates via cropMode
    'WEIR':   weir3DTool,
    'BRIDGE': bridgeProxy,      // nur Polygon-3D-Körper (LINE-Modus entfernt)
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
    // BRIDGE/MESH3D: Footprint-Zeichnen sperrt die linke Maustaste (wie CHANNEL_POLYGON)
    const bridgeDrawing = tool === 'BRIDGE'
        && bridge3DState.mode === 'MESH3D'
        && bridge3DState.phase === 'DRAW_FOOTPRINT';
    // WEIR-Polylinie: Punkte-Zeichnen sperrt LEFT (sonst orbitet die Kamera)
    const weirDrawing = tool === 'WEIR' && weir3DState.phase === 'DRAW';
    if (tool === 'SHOVEL' || tool === 'TEXTURE' || tool === 'CHANNEL_LINE' || tool === 'CHANNEL_POLYGON' || tool === 'BATHY_BRUSH' || tool === 'OFFSET_REF_PICK' || bridgeDrawing || weirDrawing) {
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

// --- AUTO-RESET: nach genau EINEM platzierten Objekt das Objekt-Werkzeug deaktivieren ---
// Verhindert, dass man versehentlich 2–3 Objekte hintereinander setzt. Mal-/Editier-Werkzeuge
// (SHOVEL, TEXTURE, CROP, SELECT …) bleiben aktiv. Schlüssel = activeTool, Wert = erwarteter
// Objekt-Typ aus dem geoStore-Event. Der Typ-Abgleich verhindert Fehl-Resets, falls ein Tool
// intern ein Objekt anderen Typs anlegt. WEIR/BRIDGE setzen sich über ihren „Fertig"-Button
// zurück (mehrstufiger Edit-Flow), nicht hierüber.
const TOOL_RESET_ON = {
    BOUNDARY:  'BOUNDARY',
    DRAW_POLY: 'BUILDING',
    DRAW:      'BUILDING',
    NET_NODE:  'NET_NODE',   // Kanalnetz-Schacht (useNetworkStore.addNode)
};
function _handleObjectPlaced(e) {
    const expected = TOOL_RESET_ON[simStore.activeTool];
    if (expected && e.detail?.type === expected) {
        simStore.setActiveTool(null);
    }
}

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

// Vertex-Drag friert die Kamera komplett ein; Phasenwechsel aktualisieren die
// LEFT-Maustasten-Sperre (applyCameraLock kennt DRAW_FOOTPRINT). flush:'sync',
// damit controls.enabled noch im selben pointerdown-Durchlauf greift.
watch(() => [bridge3DState.phase, bridge3DState.dragging], ([, dragging]) => {
    if (!controls) return;
    controls.enabled = !dragging;
    if (activeTool.value === 'BRIDGE' && bridge3DState.mode === 'MESH3D') applyCameraLock();
}, { flush: 'sync' });

// --- WEIR-Polylinie: Kamera-Sperre während Drag/Draw (analog Brücke) ---
watch(() => [weir3DState.phase, weir3DState.dragging], ([, dragging]) => {
    if (!controls) return;
    controls.enabled = !dragging;
    if (activeTool.value === 'WEIR') applyCameraLock();
}, { flush: 'sync' });

// --- NET_NODE: Schacht-Drag friert die Kamera ein (Muster Brücke/Wehr) ---
watch(() => networkNodeTool.state.dragging, (dragging) => {
    if (!controls) return;
    controls.enabled = !dragging;
}, { flush: 'sync' });

// --- SHADER TOGGLE ---
const setLayerMode = (mode) => {
    activeLayerMode.value = mode;
};

// Aktuellen Layer-Modus auf die Terrain-Shader-Uniforms schreiben. Wird sowohl vom
// Watcher (Moduswechsel per LayerControl) als auch direkt nach jedem Mesh-Bau
// aufgerufen, damit der Startmodus (Standard: WIREFRAME) auch beim ersten Terrain
// greift — der Watcher feuert bei Initialwert nicht.
const applyLayerMode = (val) => {
    if (!terrainMesh || !terrainMesh.material.uniforms) return;
    terrainMesh.material.uniforms.uShowSurface.value = (val === 'SURFACE') ? 1.0 : 0.0;
    terrainMesh.material.uniforms.uIsSolid.value = (val === 'SOLID') ? 1.0 : 0.0;
    terrainMesh.material.uniforms.uIsWireframe.value = (val === 'WIREFRAME') ? 1.0 : 0.0;
    terrainMesh.material.uniforms.uIsContour.value = (val === 'CONTOUR') ? 1.0 : 0.0;
    // terrainMesh.material.wireframe = (val === 'WIREFRAME'); // Disabled: Native wireframe draws diagonals. We use custom Shader Grid instead.
    terrainMesh.material.needsUpdate = true;
    // WIREFRAME discard'et fast alle Fragmente → kaum Tiefe. Maske nur dann zuschalten (sonst in den
    // anderen Modi überflüssig, die schreiben ihre Tiefe schon selbst normal/vollflächig).
    if (terrainDepthMesh) terrainDepthMesh.visible = (val === 'WIREFRAME');
    // SGC-/Brücken-Rasterzellen-Vorschau nur zeigen, wenn die Rasterzellen-Grenzen selbst
    // sichtbar sind (Rasteransicht/WIREFRAME) — sonst wirkt es wie ein unmotiviert schwebender Layer.
    if (sgcPreview) sgcPreview.setVisible(val === 'WIREFRAME');
    if (bridgeRasterPreview) bridgeRasterPreview.setVisible(val === 'WIREFRAME');
};

watch(activeLayerMode, (val) => applyLayerMode(val));

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

    // Initialize Layer Renderer (Visualizes Imported Data).
    // Verdrahtet sich intern selbst über reaktive Watcher — getLocalPos wird geteilt.
    const layer = useLayerRenderer(scene, geoStore, activeGrid);

    // Kanalnetz-Renderer (Unified Geometry Engine, G2): rendert Schächte + Haltungen aus
    // useNetworkStore mit demselben Welt→Szene-Transform. Self-contained wie useLayerRenderer.
    networkRenderer = useNetworkRenderer(scene, layer.getLocalPos);
    // Haltungs-Werkzeug braucht den Renderer fürs Schacht-Snapping (Picking).
    networkConduitTool.setRenderer(networkRenderer);
    networkNodeTool.setRenderer(networkRenderer);

    // Render terrestrial survey points as colored point cloud
    useSurveyPointsRenderer(scene);

    // Render virtual raster (IDW corridor preview) as colored point cloud
    useVirtualRasterRenderer(scene);

    // Live-Vorschau des echten SGC-Gerinnerasters (gestempelte Zellen + Pfeiler-Sperren),
    // reagiert auf die eingestellte Breite — zeigt die KORRIDOR-Breite, nicht nur die Linie.
    // Nur in der WIREFRAME-Rasteransicht sichtbar (siehe applyLayerMode) — nur dort sieht
    // man die Rasterzellen-Grenzen selbst, gegen die die eingefärbten Quads einrasten.
    sgcPreview = useSgcRasterPreview(scene);
    sgcPreview.setVisible(activeLayerMode.value === 'WIREFRAME');

    // Live-Vorschau der gerasterten Brückenzellen + effektiver Öffnungsbreite (Pfeiler
    // sub-grid): zeigt im BRÜCKEN-Werkzeug, was der Solver wirklich rechnet.
    // Nur in der WIREFRAME-Rasteransicht sichtbar (siehe applyLayerMode) — analog SGC-Vorschau.
    bridgeRasterPreview = useBridgeRasterPreview(scene);
    bridgeRasterPreview.setVisible(activeLayerMode.value === 'WIREFRAME');

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

    // Auto-Reset des Objekt-Werkzeugs nach einer Platzierung
    window.addEventListener('flood2d-object-placed', _handleObjectPlaced);
});

onUnmounted(() => {
    cancelAnimationFrame(animationId);
    teardownImportWorker();
    if(renderer) renderer.dispose();
    if(controls) controls.dispose();
    if(terrainMesh) {
        terrainMesh.geometry.dispose();
        terrainMesh.material.dispose();
    }
    if(terrainDepthMesh) terrainDepthMesh.material.dispose();
    // Reset Tools
    buildingTool.reset(scene); // Resets wrapped draw tool
    boundaryTool.reset(scene);
    window.removeEventListener('keydown', _handleKeydown);
    window.removeEventListener('flood2d-object-placed', _handleObjectPlaced);
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
    if (event.isPrimary === false) return; // Zweitfinger (Pinch/Zoom) ignorieren, nur der erste steuert Tools
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
    if (event.isPrimary === false) return; // Zweitfinger (Pinch/Zoom) ignorieren, nur der erste steuert Tools
    const context = {
        scene, camera: activeCamera, renderer, container: canvasContainer.value, raycaster, terrainMesh, interactionPlane, parsedData: parsedData.value, geoStore 
    };
    interactionManager.handleMouseDown(event, context);
};

const handleWrapperMouseUp = (event) => {
    if (!renderer || !activeCamera) return;
    if (event.isPrimary === false) return; // Zweitfinger (Pinch/Zoom) ignorieren, nur der erste steuert Tools
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

     // Kanalnetz-Picking (G2): zuerst prüfen, ob ein Schacht/Haltung getroffen wurde.
     if (networkRenderer && networkStore.hasNetwork) {
         const netHits = raycaster.intersectObjects(networkRenderer.group.children, false);
         const picked = networkRenderer.pickFromIntersects(netHits);
         if (picked) { networkStore.select(picked.id); return; }
     }

     const plane = interactionPlane;
     const target = new THREE.Vector3();
     raycaster.ray.intersectPlane(plane, target);
     
     if (target && parsedData) {
         const { minZ, center, cellsize, ncols, nrows, gridData, bounds } = parsedData;
         const localX = target.x + bounds.width / 2;
         const localY = -target.z + bounds.height / 2;
         const col = Math.round(localX / cellsize);
         const geomRow = Math.round(localY / cellsize); 
         const gridRow = flipRow(geomRow, nrows);

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
    // Unter-Gelände-Orbit fürs Kanalnetz (Haltungen/Schachtsohlen liegen unterflur).
    controls.maxPolarAngle = Math.PI - 0.02;
    
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
            // Unter-Gelände-Orbit fürs Kanalnetz (wie im Init-Setup).
            controls.maxPolarAngle = Math.PI - 0.02;
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
// Robuster XYZ-Import (auch irregulär & sehr groß) via terrainImportWorker:
//   1) analyze  → erkennt regulär/irregulär + schlägt sichere Zellweite vor
//   2) build    → TIN (Delaunay) + IDW-Fallback auf reguläres Gitter
// Reguläre, budgetkonforme Gitter werden ohne Nachfrage importiert; bei
// irregulären Wolken erscheint ein Auflösungs-Dialog (Zellweite überschreibbar).

function ensureImportWorker() {
    if (importWorker) return importWorker;
    importWorker = new Worker(
        new URL('../../workers/terrainImportWorker.js', import.meta.url),
        { type: 'module' },
    );
    importWorker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
            loadingText.value = `Rasterung… ${data.value | 0}%`;
        } else if (data.type === 'analyzed') {
            importAnalysis.value = data.analysis;
            importCellsize.value = data.analysis.suggestedCellsize;
            if (data.analysis.isRegular) {
                // Reguläres Gitter → direkt bauen, kein Dialog.
                startBuild();
            } else {
                loading.value = false;
                showImportPanel.value = true; // Auflösung wählen lassen
            }
        } else if (data.type === 'built') {
            applyImportedTerrain(data.terrain);
            loading.value = false;
            teardownImportWorker();
        } else if (data.type === 'error') {
            loading.value = false;
            showImportPanel.value = false;
            teardownImportWorker();
            alert('Import fehlgeschlagen: ' + data.message);
        }
    };
    importWorker.onerror = (e) => {
        loading.value = false;
        showImportPanel.value = false;
        teardownImportWorker();
        alert('Import-Worker-Fehler: ' + (e.message || e));
    };
    return importWorker;
}

function teardownImportWorker() {
    if (importWorker) { importWorker.terminate(); importWorker = null; }
}

function applyImportedTerrain(result) {
    parsedData.value = result;
    stats.value = result.stats;
    geoStore.importTerrain(result);
    console.log(`[MapEditor3D] Terrain importiert: ${result.ncols}×${result.nrows} @ ${result.cellsize} m`);
    buildTerrainMesh(result);
}

const startBuild = () => {
    showImportPanel.value = false;
    loading.value = true;
    loadingText.value = 'Rasterung…';
    ensureImportWorker().postMessage({
        type: 'build',
        cellsize: Number(importCellsize.value) || 0,
        method: 'tin',
    });
};

const cancelImport = () => {
    showImportPanel.value = false;
    importAnalysis.value = null;
    teardownImportWorker();
};

const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    teardownImportWorker(); // evtl. hängenden Vorlauf verwerfen
    loading.value = true;
    loadingText.value = 'Datei lesen…';
    showImportPanel.value = false;
    importAnalysis.value = null;

    const reader = new FileReader();
    reader.onload = (e) => {
        rawContent.value = e.target.result;
        loadingText.value = 'Analysiere Punktwolke…';
        ensureImportWorker().postMessage({ type: 'analyze', text: rawContent.value });
    };
    reader.onerror = () => {
        loading.value = false;
        alert('Datei konnte nicht gelesen werden.');
    };
    reader.readAsText(file);
    event.target.value = '';
};

const buildTerrainMesh = (result) => {
    const { ncols, nrows, gridData, minZ, maxZ, bounds, cellsize } = result;
    // Extend by one cellsize so we get ncols×nrows faces (one per computation cell)
    const displayWidth  = bounds.width  + cellsize;
    const displayHeight = bounds.height + cellsize;
    const geometry = new THREE.PlaneGeometry(displayWidth, displayHeight, ncols, nrows);
    const count = geometry.attributes.position.count; // (ncols+1)*(nrows+1)

    // Per-vertex validity flag: 1.0 = real data, 0.0 = NODATA
    const validArray = new Float32Array(count);

    // Value of the data cell at (col, geomRow), clamped for the phantom right/top border.
    // null = NODATA.
    const cellValue = (col, geomRow) => {
        const dataCol = Math.min(Math.max(col, 0), ncols - 1);
        const gridRow = flipRow(Math.min(Math.max(geomRow, 0), nrows - 1), nrows);
        const val = gridData[gridRow * ncols + dataCol];
        return (val > -9000) ? val : null;
    };

    for (let i = 0; i < count; i++) {
        const col     = i % (ncols + 1);
        const geomRow = Math.floor(i / (ncols + 1));
        // Höhe primär aus der eigenen Zelle, sonst aus einer Nachbarzelle des Vertex:
        // Eck-Vertices gültiger Randzellen dürfen nie auf minZ fallen (Spike-Optik).
        const val = cellValue(col, geomRow)
            ?? cellValue(col - 1, geomRow)
            ?? cellValue(col, geomRow - 1)
            ?? cellValue(col - 1, geomRow - 1);
        geometry.attributes.position.setZ(i, (val ?? minZ) - minZ);
        validArray[i] = (val !== null) ? 1.0 : 0.0;
    }
    geometry.setAttribute('aValid', new THREE.BufferAttribute(validArray, 1));

    // --- HARD CUT: NODATA-Zellen physisch aus dem Index-Buffer stanzen ---
    // (gleiche Technik wie useTerrainLayer im Result-Viewer). Der Shader-Discard
    // über vValid schneidet nur weich (Interpolation → halbe Randzellen sichtbar);
    // ohne Faces gibt es weder Rand-Spikes noch Raycast-Treffer der Tools
    // außerhalb des gültigen Rasters.
    const srcIndex = geometry.getIndex();
    const faceCount = ncols * nrows;
    const faceValid = new Uint8Array(faceCount);
    let validFaces = 0;
    for (let f = 0; f < faceCount; f++) {
        const faceCol = f % ncols;
        const gridRow = flipRow(Math.floor(f / ncols), nrows);
        if (gridData[gridRow * ncols + faceCol] > -9000) {
            faceValid[f] = 1;
            validFaces++;
        }
    }
    if (srcIndex && validFaces < faceCount) {
        const newIndex = new Uint32Array(validFaces * 6);
        let w = 0;
        for (let f = 0; f < faceCount; f++) {
            if (!faceValid[f]) continue;
            for (let k = 0; k < 6; k++) newIndex[w++] = srcIndex.getX(f * 6 + k);
        }
        geometry.setIndex(new THREE.BufferAttribute(newIndex, 1));
    }

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

    const material = createTerrainMaterial(minZ, maxZ, { width: displayWidth, height: displayHeight }, cellsize);

    if (terrainMesh) {
         scene.remove(terrainMesh);
         terrainMesh.geometry.dispose();
         terrainMesh.material.dispose();
    }
    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.userData.isTerrain = true; // IMPORTANT: Tagging for Shovel Tool
    terrainMesh.rotation.x = -Math.PI / 2;
    scene.add(terrainMesh);

    // Tiefen-Maske neu aufbauen (teilt sich die Geometrie mit terrainMesh, eigenes Material) —
    // Sichtbarkeit wird in applyLayerMode() an den Layer-Modus gekoppelt (nur WIREFRAME).
    if (terrainDepthMesh) {
        scene.remove(terrainDepthMesh);
        terrainDepthMesh.material.dispose();
    }
    // side:DoubleSide wie die sichtbare Terrain-Mesh (MapShader.js) — sonst fehlt die Tiefen-Maske
    // von unten (Unter-Gelände-Orbit fürs Kanalnetz, s.o.).
    terrainDepthMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide }));
    terrainDepthMesh.rotation.x = -Math.PI / 2;
    terrainDepthMesh.visible = false;
    scene.add(terrainDepthMesh);

    // Startmodus (Standard: WIREFRAME) auf das frische Mesh anwenden — der
    // activeLayerMode-Watcher feuert beim Initialwert nicht.
    applyLayerMode(activeLayerMode.value);
    
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
/* Dunkler Grund hinter dem Canvas: blitzt beim Panel-Resize einen Frame lang
   durch (Canvas hinkt hinterher) und darf dann nicht weiß aufleuchten. */
.terrain-import-container { width: 100%; height: 100%; background: var(--sv-bg); font-family: var(--sv-font); }
.canvas-wrapper { width: 100%; height: 100%; position: relative; }
.canvas-mount { width: 100%; height: 100%; }
/* Canvas füllt IMMER den Container: renderer.setSize() schreibt inline px-Maße,
   die beim Panel-Resize einen Event hinterherhinken → Spalt. CSS überstimmt die
   Inline-Maße; der Drawing-Buffer zieht beim nächsten resize() nach (kurzes
   minimales Stretching statt sichtbarem Spalt). */
.canvas-mount :deep(canvas) {
    width: 100% !important;
    height: 100% !important;
    display: block;
}

/* Header & Overlay */
.overlay-header {
    position: absolute; top: 0; left: 0; right: 0;
    z-index: 10; padding: 1rem 1.5rem;
    background: rgba(18, 18, 26, 0.85);
    border-bottom: 1px solid var(--sv-border);
    display: flex; justify-content: space-between; align-items: center;
    backdrop-filter: blur(8px);
    box-shadow: 0 2px 20px rgba(139, 92, 246, 0.15);
}

.header-actions { display: flex; gap: 1rem; align-items: center; }

/* Undo / Redo */
.undo-redo-group {
    display: flex;
    gap: 2px;
    background: var(--sv-surface-2);
    border: 1px solid var(--sv-border);
    border-radius: 6px;
    overflow: hidden;
}
.btn-icon {
    width: 32px; height: 32px;
    border: none;
    background: transparent;
    color: var(--sv-text);
    font-family: var(--sv-font);
    font-size: 1.1rem;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
    border-radius: 0;
}
.btn-icon:hover:not(:disabled) { background: rgba(139, 92, 246, 0.2); color: var(--sv-text-lime); }
.btn-icon:disabled, .btn-icon.disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.btn-primary {
    padding: 0.5rem 1.25rem; background-color: #3498db;
    color: white; border: none; border-radius: 4px;
    font-weight: 600; cursor: pointer;
    box-shadow: 0 2px 4px rgba(52, 152, 219, 0.3); transition: background 0.2s;
}
.btn-primary:hover { background-color: #2980b9; }

/* Loading */
/* XYZ-Import Auflösungs-Dialog (SaintV-2D Theme) */
.import-panel {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 60; width: 320px;
    padding: 16px 18px;
    pointer-events: auto;
}
.import-title { font-size: 1.15rem; margin-bottom: 6px; }
.import-badge {
    font-size: 0.8rem; color: var(--sv-text-lime); margin-bottom: 12px;
    padding-bottom: 8px; border-bottom: 1px solid var(--sv-border-lime);
    letter-spacing: 0.03em;
}
.import-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.import-row label { font-size: 0.85rem; color: var(--sv-text-dim); }
.import-row .sv-input { width: 90px; }
.import-quick { display: flex; gap: 6px; margin-bottom: 10px; }
.import-quick .sv-btn { flex: 1; padding: 4px 6px; font-size: 0.8rem; }
.import-hint { font-size: 0.75rem; color: var(--sv-text-dim); margin-bottom: 14px; }
.import-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Stats */


/* Tool-Panel-Chrome kommt GLOBAL aus styles/tool-panel.css (Vorlage WeirTool).
   ACHTUNG: keine scoped .tool-ui-panel-Regel hier — sie träfe als Parent-Scope die
   Wurzeln ALLER Kind-Panels und würde das globale Chrome überstimmen. */
.panel-header { font-weight: bold; margin-bottom: 8px; color: var(--sv-text-violet); border-bottom: 1px solid var(--sv-border); padding-bottom: 4px; }
.hint { font-size: 0.85rem; color: var(--sv-text-dim); margin-bottom: 8px; }

.actions button {
    margin: 0 4px; padding: 4px 8px;
    border: 1px solid var(--sv-border);
    background: var(--sv-surface-2); color: var(--sv-text);
    font-family: var(--sv-font);
    cursor: pointer;
    border-radius: 4px; font-size: 0.8rem;
    transition: all 0.15s ease;
}
.actions button:hover { border-color: var(--sv-violet); box-shadow: var(--sv-glow-violet); color: var(--sv-text-violet); }
.actions .btn-clear { background: #7a2531; border-color: rgba(231, 76, 60, 0.5); }

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
    /* Einheitliches Panel-Chrome (Vorlage WeirTool / styles/tool-panel.css) */
    background: var(--sv-surface, #253547);
    color: var(--sv-text, #ecf0f1);
    font-family: var(--sv-font, sans-serif);
    padding: 16px 20px;
    border-radius: 10px;
    pointer-events: auto;
    font-size: 0.9rem;
    backdrop-filter: blur(10px);
    width: 270px;
    box-shadow: var(--sv-glow-violet, 0 4px 20px rgba(0,0,0,0.4));
    border: 2px solid var(--sv-violet, #8b5cf6);
}
/* Hover-Einklappen (Muster tool-ui-panel.collapsed): nur die Header-Pille bleibt */
.crop-tool-ui .tool-panel.collapsed { width: auto; padding: 8px 16px; }
.crop-tool-ui .tool-panel.collapsed .panel-header { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.crop-tool-ui .collapse-dots { margin-left: auto; opacity: .4; letter-spacing: 2px; font-size: 0.8rem; }
.crop-tool-ui .panel-header {
    font-weight: 700;
    font-size: 0.95rem;
    margin-bottom: 12px;
    color: var(--sv-lime, #a3e635);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid rgba(163, 230, 53, 0.3);
    padding-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: default;
    user-select: none;
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
/* Polygon-Modus nutzt dasselbe einheitliche Chrome (kein eigener Rahmen mehr). */
</style>
