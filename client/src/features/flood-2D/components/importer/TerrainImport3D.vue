<template>
  <div class="terrain-import-container">
    
    <!-- 3D Canvas (Background) -->
    <div class="canvas-wrapper">
       <div ref="canvasContainer" class="canvas-mount"></div>
       
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
                <span>Datei wählen (.xyz · .txt · .asc)</span>
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

       <!-- Performance-Hinweis (nicht blockierend) -->
       <div v-if="perfHint" class="overlay-perf">⚠ {{ perfHint }}</div>

       <!-- Resampling unstrukturierter Daten auf ein reguläres Gitter -->
       <div v-if="parsedData" class="overlay-resample">
         <label class="resample-toggle">
           <input type="checkbox" v-model="resampleEnabled" />
           Auf reguläres Raster resampeln (IDW)
         </label>
         <div v-if="resampleEnabled" class="resample-body">
           <div class="resample-row">
             <label>Auflösung [m]</label>
             <input type="number" v-model.number="targetCellsize" step="0.5" min="0.1" />
             <button class="btn-resample" @click="applyResample">Anwenden</button>
           </div>
           <div class="resample-hint">
             Füllt Lücken unstrukturierter Punktwolken und erzeugt ein gleichmäßiges
             {{ targetCellsize }}×{{ targetCellsize }} m-Gitter.
           </div>
         </div>
       </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useScenarioStore } from '@/stores/scenarioStore';
import { createDemFromXYZ, resampleGrid } from '@/features/flood-2D/middleware/Rasterizer.js';

const store = useScenarioStore();
const emit = defineEmits(['confirm', 'cancel']);

// State
const loading = ref(false);
const loadingText = ref('');
const parsedData = ref(null);
const rawContent = ref(null);
const stats = ref(null);
const canvasContainer = ref(null);
const perfHint = ref('');               // nicht-blockierender Performance-Hinweis bei großen Rastern

// Resampling unstrukturierter Daten auf ein reguläres Gitter (IDW-Füllung + bilinear)
const resampleEnabled = ref(false);
const targetCellsize = ref(1.0);

// Three.js Objects
let scene, camera, renderer, controls, terrainMesh, animationId;

onMounted(() => {
  initThreeJS();
  window.addEventListener('resize', onWindowResize);

  // Restore from Store if available
  if (store.demData && store.demGrid) {
      console.log("Restoring terrain from store...");
      parsedData.value = {
          gridData: store.demData,
          ...store.demGrid,
          // Reconstruct stats if needed or just use demGrid as stats source
          bounds: store.demGrid.bounds
      };
      // Ensure 'stats' is populated for the overlay
      stats.value = store.demGrid; 
      
      // Rebuild Mesh
      setTimeout(() => buildTerrainMesh({
          gridData: store.demData,
          ...store.demGrid
      }), 100);
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize);
  cancelAnimationFrame(animationId);
  if (renderer) renderer.dispose();
  if (controls) controls.dispose();
  if (terrainMesh) {
      terrainMesh.geometry.dispose();
      terrainMesh.material.dispose();
  }
});

const initThreeJS = () => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5); // Light Gray Background
    // scene.fog = new THREE.FogExp2(0xf0f2f5, 0.002); // Fog disabled per user request

    const width = canvasContainer.value.clientWidth;
    const height = canvasContainer.value.clientHeight;
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    camera.position.set(0, 100, 100); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    canvasContainer.value.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 300, 100);
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(2000, 40, 0xcccccc, 0xe5e5e5);
    scene.add(gridHelper);

    animate();
};

const animate = () => {
    animationId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer) renderer.render(scene, camera);
};

const onWindowResize = () => {
    if (!camera || !renderer || !canvasContainer.value) return;
    const width = canvasContainer.value.clientWidth;
    const height = canvasContainer.value.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
};

const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    controls.autoRotate = false;
    loading.value = true;
    loadingText.value = 'Reading File...';
    
    if (terrainMesh) {
         scene.remove(terrainMesh);
         terrainMesh.geometry.dispose();
         terrainMesh.material.dispose();
         terrainMesh = null;
         parsedData.value = null;
         rawContent.value = null;
         stats.value = null;
    }

    await new Promise(r => setTimeout(r, 50));

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
           const content = e.target.result;
           rawContent.value = content; // Store raw for simulation
           
           loadingText.value = 'Parsing Point Cloud...';
           await new Promise(r => setTimeout(r, 10)); 

           const result = parseXYZ(content);
           
           if (result) {
               parsedData.value = result; 
               stats.value = result.stats;
               loadingText.value = 'Generating 3D Mesh...';
               
               // USER REQUEST: Update Store Immediately (Directly at Import)
               store.demRaw = content;
               store.setTerrain(result);
               console.log("Terrain Updated Immediately. Center:", result.center);

               await new Promise(r => setTimeout(r, 10)); 
               
               buildTerrainMesh(result);
           }
        } catch (err) {
            console.error(err);
            alert("Parsing Failed: " + err.message);
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
    // Kein hartes Limit mehr — große Raster sollen berechenbar bleiben. Nur ein
    // nicht-blockierender Performance-Hinweis bei sehr großen Gittern.
    perfHint.value = (ncols * nrows > 50_000_000)
        ? `Großes Raster: ${ncols}×${nrows} ≈ ${((ncols * nrows) / 1e6).toFixed(0)} Mio Zellen — Vorschau & Berechnung können im Browser langsam werden.`
        : '';

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
        // Add stats object for convenience
        stats: { cols: ncols, rows: nrows, cellsize, minZ, maxZ }
    };
};

// Baut aus einem regulären Raster (Float32Array + Header) die parsedData-Struktur,
// die buildTerrainMesh/Store erwarten (gridData, Maße, Zentrum, bounds, stats).
const computeResult = (data, header) => {
    const { ncols, nrows, cellsize } = header;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v > -9000) { if (v < minZ) minZ = v; if (v > maxZ) maxZ = v; }
    }
    if (minZ === Infinity) { minZ = 0; maxZ = 1; }
    const cx = header.xll ?? header.xllcorner;     // Zell-Zentrum von (0,0)
    const cy = header.yll ?? header.yllcorner;
    const width  = (ncols - 1) * cellsize;
    const height = (nrows - 1) * cellsize;
    return {
        gridData: data, ncols, nrows, cellsize, minZ, maxZ,
        center: { x: cx + width / 2, y: cy + height / 2 },
        bounds: { width: width || 100, height: height || 100 },
        stats: { cols: ncols, rows: nrows, cellsize, minZ, maxZ },
    };
};

// Unstrukturierte/lückenhafte Punktwolke → gleichmäßiges Gitter: IDW-Füllung
// (createDemFromXYZ) auf ein Zwischengitter, dann bilinear auf die Zielauflösung.
const applyResample = async () => {
    if (!rawContent.value) return;
    loading.value = true;
    loadingText.value = 'Resampling (IDW-Füllung)…';
    await new Promise(r => setTimeout(r, 10));
    try {
        const cs = Number(targetCellsize.value) > 0 ? Number(targetCellsize.value) : 1.0;
        // createDemFromXYZ trennt nur an Whitespace → Komma/Semikolon vorab normalisieren.
        const normalized = rawContent.value.replace(/[,;]+/g, ' ');
        const dem = createDemFromXYZ(normalized);
        const rs  = resampleGrid(dem.data, dem.header, cs, 'bilinear');
        const result = computeResult(rs.data, rs.header);
        parsedData.value = result;
        stats.value = result.stats;
        perfHint.value = (result.ncols * result.nrows > 50_000_000)
            ? `Großes Raster: ${result.ncols}×${result.nrows} ≈ ${((result.ncols * result.nrows) / 1e6).toFixed(0)} Mio Zellen — kann langsam werden.`
            : '';
        store.setTerrain(result);
        buildTerrainMesh(result);
        console.log(`[TerrainImport] Resampled auf ${cs} m → ${result.ncols}×${result.nrows}`);
    } catch (err) {
        console.error(err);
        alert('Resampling fehlgeschlagen: ' + err.message);
    } finally {
        loading.value = false;
    }
};

const buildTerrainMesh = (result) => {
    const { ncols, nrows, gridData, minZ, maxZ, bounds } = result;
    const geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, ncols - 1, nrows - 1);
    const count = geometry.attributes.position.count;
    const colors = [];
    
    // Light Mode Colors: Water(Blue) -> Land(Green) -> Peak(White/Brown)
    const colorLow = new THREE.Color(0x3b82f6);
    const colorMid = new THREE.Color(0x10b981);
    const colorHigh = new THREE.Color(0xffffff);

    const range = (maxZ - minZ) || 1;

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
        
        const n = (zVal - minZ) / range;
        const c = new THREE.Color();
        if (n < 0.2) c.lerpColors(colorLow, colorMid, n/0.2);
        else c.lerpColors(colorMid, colorHigh, (n-0.2)/0.8);
        colors.push(c.r, c.g, c.b);
    }
    
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide
    });

    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.rotation.x = -Math.PI / 2;
    scene.add(terrainMesh);

    const maxDim = Math.max(bounds.width, bounds.height);
    camera.position.set(0, maxDim * 0.8, maxDim * 0.8);
    controls.target.set(0, 0, 0);
    controls.update();
};

const acceptTerrain = () => {
    // 1. Save to Store (Raw String + Metadata + Binary Grid)
    // Note: rawContent might be null if restored from store, but store.demRaw should persist.
    // If rawContent is null (restored), we don't overwrite demRaw with null.
    if (rawContent.value) {
        store.setTerrain(rawContent.value, parsedData.value.stats, parsedData.value.gridData);
    } else {
        // Just ensure visualization data is synced if needed, but usually setTerrain is called on upload?
        // Actually, if we restored, store already has it. We just confirm.
    }
    
    // If it was a fresh upload:
    if (rawContent.value && parsedData.value) {
         // Direct assignment for raw, relying on Pinia reactivity
         store.demRaw = rawContent.value;
         
         // Correct call: Pass the single object containing gridData, center, stats, etc.
         store.setTerrain(parsedData.value);
         
         console.log("Terrain Accepted. Center:", parsedData.value.center);
    }

    // 2. Emit confirm
    emit('confirm', parsedData.value.gridData);
};

// --- Camera API (Called by Parent) ---
const setCameraView = (axis) => {
    if (!camera || !controls || !parsedData.value) return;
    
    // Bounds to scale distance
    const bounds = parsedData.value.bounds;
    const maxDim = Math.max(bounds.width, bounds.height) * 1.2;

    switch(axis) {
        case 'XY': // TOP View
            camera.position.set(0, maxDim, 0); 
            camera.up.set(0, 0, -1); // Ensure correct orientation relative to map
            break;
        case 'XZ': // FRONT View
            camera.position.set(0, maxDim * 0.5, maxDim);
            camera.up.set(0, 1, 0);
            break;
        case 'YZ': // SIDE View
            camera.position.set(maxDim, maxDim * 0.5, 0);
            camera.up.set(0, 1, 0);
            break;
    }
    controls.target.set(0, 0, 0);
    controls.update();
};

defineExpose({ setCameraView });
</script>

<style scoped>
.terrain-import-container {
    height: 100%;
    width: 100%;
    background-color: #f5f5f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #333;
}

.canvas-wrapper {
    position: relative;
    height: 100%;
    width: 100%;
}

.canvas-mount {
    position: absolute;
    inset: 0;
    z-index: 0;
}

/* Header */
.overlay-header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    padding: 1rem 1.5rem;
    background: rgba(255, 255, 255, 0.9);
    border-bottom: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    align-items: center;
    backdrop-filter: blur(8px);
}

.header-content h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #2c3e50;
}
.header-content p {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    color: #7f8c8d;
}

.header-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
}

/* Buttons */
.btn-secondary {
    padding: 0.5rem 1rem;
    background-color: transparent;
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    color: #7f8c8d;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
}
.btn-secondary:hover {
    background-color: #ecf0f1;
    color: #2c3e50;
}

.btn-file {
    position: relative;
    display: inline-block;
    cursor: pointer;
}
.btn-file input { display: none; }
.btn-file span {
    display: inline-block;
    padding: 0.5rem 1rem;
    background-color: #ecf0f1;
    border: 1px solid #bdc3c7;
    border-radius: 4px;
    color: #2c3e50;
    font-weight: 500;
    transition: background 0.2s;
}
.btn-file:hover span {
    background-color: #bdc3c7;
}

.btn-primary {
    padding: 0.5rem 1.25rem;
    background-color: #3498db; /* App Blue */
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(52, 152, 219, 0.3);
    transition: background 0.2s;
}
.btn-primary:hover {
    background-color: #2980b9;
}

/* Loading */
.overlay-loading {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.85);
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}
.spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #3498db;
    border-top: 4px solid transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
}
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Stats */
.overlay-stats {
    position: absolute;
    bottom: 1.5rem;
    left: 1.5rem;
    background: rgba(255, 255, 255, 0.95);
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    font-size: 0.85rem;
    color: #34495e;
    min-width: 200px;
}
.stats-title {
    font-weight: 700;
    margin-bottom: 0.5rem;
    color: #2c3e50;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.5px;
}
.stat-row {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
    border-bottom: 1px solid #eee;
}
.stat-row:last-child { border: none; }
.val-min { color: #2980b9; font-weight: bold; }
.val-max { color: #8e44ad; font-weight: bold; }

/* ── Performance-Hinweis ─────────────────────────────────────────────────── */
.overlay-perf {
    position: absolute;
    top: 5.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(243, 156, 18, 0.95);
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    max-width: 60%;
    text-align: center;
}

/* ── Resampling-Panel ────────────────────────────────────────────────────── */
.overlay-resample {
    position: absolute;
    bottom: 1.5rem;
    right: 1.5rem;
    background: rgba(255, 255, 255, 0.95);
    padding: 0.85rem 1rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    font-size: 0.85rem;
    color: #34495e;
    max-width: 280px;
}
.resample-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    cursor: pointer;
}
.resample-toggle input { cursor: pointer; }
.resample-body { margin-top: 0.6rem; }
.resample-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.resample-row label { flex-shrink: 0; }
.resample-row input[type=number] {
    width: 64px;
    padding: 0.25rem 0.4rem;
    border: 1px solid #cdd5db;
    border-radius: 4px;
}
.btn-resample {
    margin-left: auto;
    background: #2980b9;
    color: #fff;
    border: none;
    padding: 0.35rem 0.75rem;
    border-radius: 5px;
    cursor: pointer;
    font-weight: 600;
}
.btn-resample:hover { background: #2471a3; }
.resample-hint {
    margin-top: 0.5rem;
    font-size: 0.74rem;
    color: #7f8c8d;
    line-height: 1.35;
}
</style>
