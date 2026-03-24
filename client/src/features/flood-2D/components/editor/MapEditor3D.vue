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

             <label class="btn-file">
                <input type="file" accept=".xyz,.txt,.asc" @change="handleFileUpload" />
                <span>Select .XYZ File</span>
             </label>
             
             <button v-if="parsedData" @click="acceptTerrain" class="btn-primary">
               Accept Terrain
             </button>
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
          :toolInstance="culvertTool"
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

       <!-- MAP LAYER CONTROL -->
       <div class="layer-control" v-if="parsedData">
          <div class="layer-btn" :class="{ active: activeLayerMode === 'CLASSIC' }" @click="setLayerMode('CLASSIC')" title="Klassische Höhen-Ansicht">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
          </div>
          <div class="layer-btn" :class="{ active: activeLayerMode === 'SURFACE' }" @click="setLayerMode('SURFACE')" title="Oberflächen-Materialien (Textur)">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
          </div>
          <div class="layer-btn disabled" title="Tiff-Hintergrund (Demnächst)">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
          </div>
       </div>

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

// --- UI COMPONENTS ---
import BuildingTool from '../tools/BuildingTool.vue';
import CulvertTool from '../tools/CulvertTool.vue';
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
const activeLayerMode = ref('CLASSIC'); // 'CLASSIC' | 'SURFACE' | 'TIFF'

// --- THREE.JS OBJECTS ---
let scene, renderer, controls, animationId;
let cameraPerspective, cameraOrtho, activeCamera;
let terrainMesh, interactionPlane;
let selectionMesh;
const raycaster = new THREE.Raycaster();

// --- TOOLS SETUP ---
const drawTool = useDrawTool(); 
const shovelTool = useShovelTool();
const boundaryTool = useBoundaryTool();
const buildingTool = useBuildingTool();
const culvertTool = useCulvertTool();
const textureTool = useTextureTool();
const cropTool = useCropTool();
const polygonCropTool = usePolygonCropTool();

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

// Tool Mapping
const tools = {
    'DRAW': buildingTool, 
    'SHOVEL': shovelTool,
    'BOUNDARY': boundaryTool,
    'CULVERT': culvertTool,
    'TEXTURE': textureTool,
    'CROP': cropProxy,          // single entry; delegates via cropMode
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
    if (tool === 'SHOVEL' || tool === 'TEXTURE') {
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
    if (terrainMesh && terrainMesh.material.uniforms && terrainMesh.material.uniforms.uShowSurface) {
        terrainMesh.material.uniforms.uShowSurface.value = (val === 'SURFACE') ? 1.0 : 0.0;
        // Logic for TIFF can be added here later
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
});

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

const acceptTerrain = () => {
    if (parsedData.value && rawContent.value) {
        geoStore.importTerrain(parsedData.value); 
        // Previous store check: setDemData, setDemGrid...
        // Safest to call setTerrain if available as per Step 19.
        // Step 19 Store: setTerrain(parsedData) IS AVAILABLE.
        geoStore.importTerrain(parsedData.value);
        emit('confirm');
    }
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

    const vertexShader = `
      attribute float aValid;
      attribute vec3 aSurfaceColor;
      varying float vZ;
      varying float vValid;
      varying vec2 vPlanePos;
      varying vec3 vSurfaceColor;
      void main() {
        vZ = position.z; 
        vValid = aValid;
        vPlanePos = position.xy;
        vSurfaceColor = aSurfaceColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying float vZ;
      varying float vValid;
      varying vec2 vPlanePos;
      varying vec3 vSurfaceColor;
      uniform float uMinZ;
      uniform float uMaxZ;
      uniform vec3 uColorLow;
      uniform vec3 uColorMid;
      uniform vec3 uColorHigh;
      uniform float uIs2D; 
      uniform float uShowSurface;
      uniform vec2 uBounds;
      uniform float uCellSize;

      void main() {
        // Discard NODATA cells
        if (vValid < 0.5) discard;

        float range = uMaxZ - uMinZ;
        if(range < 0.1) range = 1.0;
        float h = vZ / range; 
        vec3 col;
        if (h < 0.2) col = mix(uColorLow, uColorMid, h / 0.2);
        else col = mix(uColorMid, uColorHigh, (h - 0.2) / 0.8);

        // Surface Material Overlay (Texture Pipeline)
        if (uShowSurface > 0.5) {
            // Blend surface color with subtle height shading for depth cues
            vec3 surfCol = vSurfaceColor;
            float heightShade = 0.7 + 0.3 * h; // subtle brightness variation by height
            col = surfCol * heightShade;
        }

        if (uIs2D > 0.5) {
            float gray = dot(col, vec3(0.299, 0.587, 0.114));
            col = mix(col, vec3(gray), 0.7) + 0.1;
            
            float localX = vPlanePos.x + (uBounds.x * 0.5);
            float localY = vPlanePos.y + (uBounds.y * 0.5);
            vec2 normPos = vec2(localX, localY) / uCellSize;
            vec2 grid = abs(fract(normPos) - 0.5);
            float px = fwidth(localX) * 1.5;
            if(px < 0.02) px = 0.02; 
            float lineX = 1.0 - smoothstep(0.0, px/uCellSize, grid.x);
            float lineY = 1.0 - smoothstep(0.0, px/uCellSize, grid.y);
            float isGrid = max(lineX, lineY);
            col = mix(col, vec3(0.35), isGrid * 0.6);
        }

        float contourInterval = 1.0;
        float dist = abs(fract(vZ) - 0.5);
        float lineIntensity = 1.0 - smoothstep(0.45, 0.48, dist); 
        col = mix(col, vec3(0.0), lineIntensity * 0.3);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uMinZ: { value: 0 }, 
            uMaxZ: { value: maxZ - minZ },
            uColorLow: { value: new THREE.Color(0x3b82f6) },
            uColorMid: { value: new THREE.Color(0x10b981) },
            uColorHigh: { value: new THREE.Color(0xffffff) },
            uIs2D: { value: 0.0 },
            uShowSurface: { value: 0.0 },
            uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
            uCellSize: { value: result.cellsize || 1.0 }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.DoubleSide
    });

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

/* Layer Control */
.layer-control {
    position: absolute;
    bottom: 16px;
    right: 16px;
    background: rgba(44, 62, 80, 0.85);
    backdrop-filter: blur(8px);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 100;
}
.layer-btn {
    padding: 10px;
    color: #bdc3c7;
    cursor: pointer;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.2s;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
}
.layer-btn:last-child { border-bottom: none; }
.layer-btn:hover:not(.disabled) { background: rgba(52, 152, 219, 0.2); color: #ecf0f1; }
.layer-btn.active {
    background: #3498db;
    color: white;
}
.layer-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

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
