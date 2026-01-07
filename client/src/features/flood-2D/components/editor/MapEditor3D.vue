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
         <div class="stats-title">Terrain Statistics</div>
         <div class="stat-row"><span>Grid:</span> <span>{{ stats.cols }} x {{ stats.rows }}</span></div>
         <div class="stat-row"><span>Resolution:</span> <span>~{{ stats.cellsize.toFixed(2) }}m</span></div>
         <div class="stat-row"><span>Min Z:</span> <span class="val-min">{{ stats.minZ.toFixed(2) }}m</span></div>
         <div class="stat-row"><span>Max Z:</span> <span class="val-max">{{ stats.maxZ.toFixed(2) }}m</span></div>
       </div>

       <!-- Tool UIs (Context Sensitive) -->
       
       <!-- SHOVEL UI -->
       <div v-if="activeTool === 'SHOVEL'" class="tool-ui-panel shovel-panel">
          <div class="panel-header">Shovel Tool</div>
          <div class="panel-content">
             <div class="hint">Click terrain to lower by 0.5m</div>
          </div>
       </div>

       <!-- BUILDING / DRAW UI -->
       <!-- Assuming activeTool 'DRAW' maps to Building Logic internally now -->
       <BuildingTool 
          v-if="activeTool === 'DRAW' || activeTool.startsWith('DRAW')"
          :toolInstance="buildingTool"
       />

       <!-- CULVERT UI -->
       <CulvertTool 
          v-if="activeTool === 'CULVERT'"
          :toolInstance="culvertTool"
       />

       <!-- BOUNDARY UI -->
       <BoundaryTool
          v-if="activeTool === 'BOUNDARY'"
          :toolInstance="boundaryTool"
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

<script setup>
import { ref, onMounted, onUnmounted, reactive, toRef, watch, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useScenarioStore } from '@/stores/scenarioStore';
import TerrainInfoCard from './TerrainInfoCard.vue';

// --- COMPOSABLES ---
import { useInteractionManager } from '../../composables/editor/useInteractionManager.js';
import { useDrawTool } from '../../composables/editor/useDrawTool.js'; // Still needed if referenced elsewhere or for types? Alternatively, BuildingTool wraps it.
import { useShovelTool } from '../../composables/editor/useShovelTool.js';
import { useBoundaryTool } from '../../composables/editor/useBoundaryTool.js';
import { useBuildingTool } from '../../composables/editor/useBuildingTool.js';
import { useCulvertTool } from '../../composables/editor/useCulvertTool.js';
import { useLayerRenderer } from '../../composables/editor/useLayerRenderer.js';

// --- UI COMPONENTS ---
import BuildingTool from '../tools/BuildingTool.vue';
import CulvertTool from '../tools/CulvertTool.vue';
import BoundaryTool from '../tools/BoundaryTool.vue';

const props = defineProps({
  activeTool: { type: String, default: 'SELECT' }
});

const emit = defineEmits(['cancel', 'confirm']);
const store = useScenarioStore();

// --- STATE ---
const canvasContainer = ref(null);
const loading = ref(false);
const loadingText = ref('');
const parsedData = ref(null);
const rawContent = ref(null);
const stats = ref(null);
const selectedInfo = ref(null); // { x, y, z, col, row }

// --- THREE.JS OBJECTS ---
let scene, renderer, controls, animationId;
let cameraPerspective, cameraOrtho, activeCamera;
let terrainMesh, interactionPlane;
let selectionMesh;
const raycaster = new THREE.Raycaster();

// --- TOOLS SETUP ---
// We keep drawTool for generic drawing if needed, but BuildingTool wraps it for Buildings.
const drawTool = useDrawTool(); // Legacy/Generic
const shovelTool = useShovelTool();
const boundaryTool = useBoundaryTool();
const buildingTool = useBuildingTool();
const culvertTool = useCulvertTool();

// Tool Mapping
const tools = {
    'DRAW': buildingTool, // Default DRAW maps to Building Construction for now
    'SHOVEL': shovelTool,
    'BOUNDARY': boundaryTool,
    'CULVERT': culvertTool,
    'SELECT': { onClick: () => console.log('Selection not implemented yet'), onMove: () => {} }, 
    'INFO': { 
        onClick: (ctx) => handleInfoClick(ctx),
        onMove: (ctx) => {} 
    },
    'PAN': { onClick: ()=>{}, onMove: ()=>{} } 
};

// Proxy handles DRAW_POLY etc if still used upstream
const toolMap = new Proxy(tools, {
    get: (target, prop) => {
        if (typeof prop === 'string' && prop.startsWith('DRAW')) return buildingTool;
        return target[prop];
    }
});

const interactionManager = useInteractionManager(
    toRef(props, 'activeTool'),
    toolMap
);


// --- INIT ---
onMounted(() => {
    initThreeJS();
    
    // Unified Grid Source (Preview OR Store)
    const activeGrid = computed(() => parsedData.value || store.demGrid);

    // Initialize Layer Renderer (Visualizes Imported Data)
    useLayerRenderer(scene, store, activeGrid);

    // Restore if data exists
    if (store.demData && store.demGrid) {
         loadingText.value = "Restoring Terrain...";
         loading.value = true;
         setTimeout(() => {
             parsedData.value = {
                 gridData: store.demData,
                 ...store.demGrid,
                 bounds: store.demGrid.bounds
             };
             stats.value = store.demGrid;
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
        parsedData: parsedData.value 
    };
    
    const res = interactionManager.handleClick(event, context);
    // Actions 'FINISHED' etc are now handled inside useBuildingTool for DRAW
};

const handleWrapperMove = (event) => {
    if (!renderer || !activeCamera) return;
    const context = {
        scene, camera: activeCamera, renderer, container: canvasContainer.value, raycaster, terrainMesh, interactionPlane, parsedData: parsedData.value
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
        scene, camera: activeCamera, renderer, container: canvasContainer.value, raycaster, terrainMesh, interactionPlane, parsedData: parsedData.value 
    };
    interactionManager.handleDoubleClick(event, context);
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
    boundaryTool.finishLine(type, scene, store, { parsedData: parsedData.value });
};


// --- THREE.JS SETUP ---
const initThreeJS = () => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);
    
    const width = canvasContainer.value.clientWidth;
    const height = canvasContainer.value.clientHeight;
    
    cameraPerspective = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    cameraPerspective.position.set(0, 100, 100);
    
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
    
    controls = new OrbitControls(activeCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
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
            controls = new OrbitControls(activeCamera, renderer.domElement);
            controls.enableDamping = true;
        }
        controls.enableRotate = false;
        controls.screenSpacePanning = true;
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
        
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
            controls = new OrbitControls(activeCamera, renderer.domElement);
            controls.enableDamping = true;
        }
        controls.enableRotate = true;
        controls.screenSpacePanning = false;
        controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

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
               store.editorMode = 'IMPORT_TERRAIN';
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
        store.setTerrain(parsedData.value); // Assume Store has this action, or set individual props
        // Previous store check: setDemData, setDemGrid...
        // Safest to call setTerrain if available as per Step 19.
        // Step 19 Store: setTerrain(parsedData) IS AVAILABLE.
        store.setTerrain(parsedData.value);
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
        center: { x: (minX + maxX)/2, y: (minY + maxY)/2 },
        bounds: { width: (maxX-minX)||100, height: (maxY-minY)||100 },
        stats: { cols: ncols, rows: nrows, cellsize, minZ, maxZ }
    };
};

const buildTerrainMesh = (result) => {
    const { ncols, nrows, gridData, minZ, maxZ, bounds } = result;
    const geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, ncols - 1, nrows - 1);
    const count = geometry.attributes.position.count;
    
    // Shader Mesh Construction
    // Re-using the logic from Step 20
    
    for (let i = 0; i < count; i++) {
        const col = i % ncols;
        const geomRow = Math.floor(i / ncols); 
        const gridRow = (nrows - 1) - geomRow; 
        const idx = gridRow * ncols + col;
        let zVal = minZ;
        if (idx >= 0 && idx < gridData.length) {
             const val = gridData[idx];
             if (val > -9000) zVal = val;
        }
        geometry.attributes.position.setZ(i, (zVal - minZ)); 
    }
    geometry.computeVertexNormals();

    const vertexShader = `
      varying float vZ;
      varying vec2 vPlanePos;
      void main() {
        vZ = position.z; 
        vPlanePos = position.xy; 
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying float vZ;
      varying vec2 vPlanePos;
      uniform float uMinZ;
      uniform float uMaxZ;
      uniform vec3 uColorLow;
      uniform vec3 uColorMid;
      uniform vec3 uColorHigh;
      uniform float uIs2D; 
      uniform vec2 uBounds;
      uniform float uCellSize;

      void main() {
        float range = uMaxZ - uMinZ;
        if(range < 0.1) range = 1.0;
        float h = vZ / range; 
        vec3 col;
        if (h < 0.2) col = mix(uColorLow, uColorMid, h / 0.2);
        else col = mix(uColorMid, uColorHigh, (h - 0.2) / 0.8);

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

defineExpose({ setCameraView });
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
    position: absolute; bottom: 1.5rem; left: 1.5rem;
    background: rgba(255, 255, 255, 0.95); padding: 1rem;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    font-size: 0.85rem; color: #34495e; min-width: 200px;
}
.stat-row { display: flex; justify-content: space-between; padding: 0.25rem 0; border-bottom: 1px solid #eee; }
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
</style>
