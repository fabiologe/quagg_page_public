<template>
  <div class="flood-solver-container">
    <h2>🌊 2D Flood Simulation (WASM)</h2>

    <!-- SIMULATION PARAMETERS -->
    <div class="sim-params">
      <h3>⚙️ Parameter</h3>
      <div class="param-grid">

        <label>Simulationsdauer (s)</label>
        <input type="number" v-model.number="simStore.simDuration" min="60" step="60" />

        <label>Zeitschritt Δt (s)</label>
        <input type="number" v-model.number="simStore.timeStep" min="0.01" max="10" step="0.1" />

        <label>Ausgabeintervall (s)</label>
        <input type="number" v-model.number="simStore.saveInterval" min="1" step="10" />

        <label>Massenbalanz-Int. (s)</label>
        <input type="number" v-model.number="simStore.massInterval" min="1" step="10" />

        <label>Acceleration Solver</label>
        <div class="toggle-row">
          <input type="checkbox" id="accel-toggle" v-model="simStore.useAcceleration" />
          <label for="accel-toggle" class="toggle-label">
            {{ simStore.useAcceleration ? 'Aktiv (Instabil?)' : 'Aus (Stabil)' }}
          </label>
        </div>

      </div>
      <p class="param-hint">
        📊 {{ estimatedFrames }} Frames · 
        {{ (simStore.simDuration / 60).toFixed(0) }} min Laufzeit
      </p>
    </div>
    
    <div class="controls">
      <button v-if="!isRunning" @click="runSimulation" class="run-btn">
        Start Simulation
      </button>
      <button v-else @click="abortSimulation" class="stop-btn">
        🛑 Stop Simulation
      </button>

      <button @click="showInspector = !showInspector" class="dry-run-btn" type="button">
          {{ showInspector ? '✕ Raw Viewer schließen' : '📋 Raw Viewer' }}
      </button>

      <button 
        v-if="geoStore.terrain || simStore.totalFrameCount > 0" 
        @click.prevent="openViewer" 
        type="button"
        class="viewer-btn"
        title="3D Ergebnis-Viewer öffnen"
      >
        🗺️ 3D Viewer
      </button>
      
      <div v-if="status" class="status-indicator">
        Status: <span :class="statusClass">{{ status }}</span>
      </div>
    </div>

    <div class="logs-container">
      <h3>Simulation Logs:</h3>
      <pre ref="logContainer">{{ logs }}</pre>
    </div>

    <ResultInspector
      v-if="showInspector"
      :inputFiles="inputFiles"
      :outputFiles="resultFiles"
      @prepareZip="prepareZip"
    />
  </div>
</template>

<script setup>
import { ref, onUnmounted, computed, watch, toRaw } from 'vue';

import JSZip from 'jszip';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore.js';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore.js';
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore.js';
import { InputGenerator } from '@/features/flood-2D/middleware/InputGenerator.js';
import { Rasterizer } from '@/features/flood-2D/middleware/Rasterizer.js';
import { prepareResultData } from '@/features/flood-2D/composables/useResultDataBridge.js';
import ResultInspector from '@/features/flood-2D/components/viewer/ResultInspector.vue';

// Stores
const geoStore = useGeoStore();
const hydStore = useHydraulicStore();
const simStore = useSimulationStore();
const surfaceStore = useSurfaceStore();



// State
const isRunning = ref(false);
const logs = ref('');
const resultFiles = ref({});
const inputFiles = ref({});
const showInspector = ref(false);
const zipUrl = ref(null);
const isZipping = ref(false);
const generator = new InputGenerator();

const estimatedFrames = computed(() => {
    const dur = simStore.simDuration || 3600;
    const save = simStore.saveInterval || 60;
    return Math.floor(dur / save);
});
let worker = null;

// Derived State from SimStore for UI
const status = computed(() => simStore.status || 'IDLE');
const statusClass = computed(() => {
    switch (status.value) {
        case 'RUNNING': return 'warning';
        case 'FINISHED': case 'Success': return 'success';
        case 'ERROR': return 'error';
        default: return 'info';
    }
});

// Watch logs from simStore if we want to sync (or keeping local for performance/scroll?)
// User requirement: "Set simStore.status = 'RUNNING'".
// SimStore likely has logs array.
// For now, I'll update SimStore status but keep logs local or sync.
// Let's sync basic status.

const downloadFile = (name, content) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const prepareZip = async () => {
    isZipping.value = true;
    const zip = new JSZip();
    for (const [name, content] of Object.entries(resultFiles.value)) {
        zip.file(name, content);
    }
    
    try {
        const blob = await zip.generateAsync({ type: "blob" });
        if (zipUrl.value) URL.revokeObjectURL(zipUrl.value); // Cleanup old
        zipUrl.value = URL.createObjectURL(blob);
    } catch (e) {
        console.error("Failed to make zip:", e);
        appendLog(`[ERROR] Failed to make zip: ${e.message}`);
    } finally {
        isZipping.value = false;
    }
};

const appendLog = (msg) => {
    logs.value += msg + '\n';
    simStore.addLog(msg); // Sync if possible
};

const runSimulation = async () => {
    if (isRunning.value) return;
    
    // Check Requirements
    if (!geoStore.terrain || !geoStore.terrain.gridData) {
        alert("Kein Terrain geladen! Bitte erst Terrain importieren.");
        return;
    }

    isRunning.value = true;
    simStore.setStatus('INITIALIZING');
    logs.value = '';
    resultFiles.value = {};
    
    try {
        if (!worker) {
            appendLog("Initializing Middleware Worker...");
            worker = new Worker(new URL('../middleware/simulation.main.js', import.meta.url), { type: 'module' });
            
            // IMMEDIATE Error Handler for Startup
            worker.onerror = (e) => {
                const msg = e.message || "Unknown Worker Error";
                appendLog(`[WORKER ERROR] ${msg} (Line: ${e.lineno})`);
                simStore.setStatus('ERROR');
                alert(`Solver Startup Failure:\n${msg}`);
                isRunning.value = false;
            };

            // Safety Timeout
            const initTimeout = setTimeout(() => {
                if (status.value === 'INITIALIZING') {
                    appendLog("[TIMEOUT] Worker took too long to start. Check console/network.");
                    simStore.setStatus('ERROR');
                    isRunning.value = false;
                    alert("Simulation Timed Out during Initialization.\nPlease check if 'lisflood.wasm' is loading correctly.");
                }
            }, 10000); // 10 seconds

            worker.onmessage = (e) => {
                // Clear timeout on first message
                if (initTimeout) clearTimeout(initTimeout);
                
                const { type, status: workerStatus, text, value, frame, header, payload, error, time, message } = e.data;
                
                switch (type) {
                    case 'STATUS':
                        simStore.setStatus(workerStatus);
                        appendLog(`[STATUS] ${workerStatus}`);
                        
                        // Auto-Advance Logic
                        if (workerStatus === 'IDLE' && isRunning.value) {
                           startPreparation();
                        } else if (workerStatus === 'READY' && isRunning.value) {
                           // Worker is initialized, now generate data and run!
                           startPreparation();
                        } else if (workerStatus === 'FINISHED') {
                           simStore.setStatus('FINISHED');
                           simStore.setProgress(100);
                           appendLog(`[COMPLETE] Simulation finished.`);
                           isRunning.value = false;
                        }
                        break; // Added break

                    case 'PROGRESS_UPDATE':
                        // time is current sim time in seconds
                        if (time !== undefined) {
                            const duration = simStore.simDuration || 3600;
                            const percent = Math.min(100, Math.max(0, (time / duration) * 100));
                            simStore.setProgress(Math.round(percent));
                        }
                        break;

                    case 'STDOUT': appendLog(`[STDOUT] ${text}`); break;
                    case 'STDERR': appendLog(`[STDERR] ${text}`); break;

                    case 'LOG': 
                        appendLog(`[SOLVER] ${text}`); 
                        break;
                        
                    case 'WARNING':
                        appendLog(`[WARNING] ${message || text}`);
                        if (message && message.includes('Instability')) {
                            simStore.addLog(`⚠️ INSTABILITY DETECTED: ${message}`);
                        }
                        break;

                    case 'INPUT_FILES':
                        inputFiles.value = e.data.files || {};
                        appendLog(`[INPUT] ${Object.keys(inputFiles.value).length} Input-Dateien empfangen`);
                        break;

                    case 'RESULT':
                         try {
                             const frameName = `res-${String(frame).padStart(4, '0')}.wd.asc`;
                             const ascContent = Rasterizer.gridToASC(payload, header);
                             resultFiles.value[frameName] = ascContent;
                             
                             // Store for Visualization (re-enabled for Result Viewer)
                             simStore.addResultFrame(frame, payload, header, e.data.min, e.data.max);

                             appendLog(`[RESULT] Received Frame ${frame}`);
                         } catch (err) {
                             appendLog(`[ERROR] processing result: ${err.message}`);
                         }
                        break;

                    case 'ERROR':
                        simStore.setStatus('ERROR');
                        appendLog(`[ERROR] ${error}`);
                        isRunning.value = false;
                        
                        // Parse specific known errors for better UX
                        if (error && (error.includes("CFL") || error.includes("Mass Balance") || error.includes("Instability"))) {
                            alert(`Simulation Error: Detected Instability!\n\n${error}\n\nTry reducing the Time Step or checking Boundary Conditions.`);
                        } else {
                            alert(`Simulation Failed: ${error}`);
                        }
                        break;
                }
            };
        }

        // Start Workflow
        worker.postMessage({ cmd: 'CMD_INIT' });

    } catch (e) {
        console.error(e);
        simStore.setStatus('ERROR');
        appendLog(`Setup Error: ${e.message}`);
        isRunning.value = false;
    }
};

const abortSimulation = () => {
    if (worker) {
        worker.terminate();
        worker = null;
    }
    isRunning.value = false;
    simStore.setStatus('ABORTED');
    simStore.rows = []; // Clear current run data? Optional.
    appendLog("⛔ Simulation Aborted by User.");
};

const openViewer = async () => {
    // Store data in IndexedDB BEFORE opening popup
    const bciContent = inputFiles.value && inputFiles.value['flow.bci'] ? inputFiles.value['flow.bci'] : null;
    
    // We must pass the BAKED terrain to the Viewer, not the raw one from GeoStore, 
    // because buildings are not burned into geoStore natively.
    const rawTerrain = toRaw(geoStore.terrain);
    const bakedTerrainData = { ...rawTerrain };
    if (bakedTerrainData.gridData) {
        bakedTerrainData.gridData = bakedTerrainData.gridData.slice(); // Copy
        const header = {
            ncols: bakedTerrainData.ncols,
            nrows: bakedTerrainData.nrows,
            cellsize: bakedTerrainData.cellsize,
            xllcorner: bakedTerrainData.xllcorner,
            yllcorner: bakedTerrainData.yllcorner,
            NODATA_value: bakedTerrainData.minZ
        };
        const modifications = [];
        if (geoStore.buildings && geoStore.buildings.features) {
            modifications.push(...geoStore.buildings.features.map(f => ({
                type: 'BUILDING',
                geometry: f.geometry,
                properties: f.properties || { height: 10.0 }
            })));
        }
        if (geoStore.modifications) {
            modifications.push(...geoStore.modifications);
        }
        if (modifications.length > 0) {
            bakedTerrainData.gridData = Rasterizer.burnBuildings(bakedTerrainData.gridData, header, modifications);
        }
    }

    const exportGeoStore = {
        terrain: bakedTerrainData,
        modifications: geoStore.modifications,
        boundaries: geoStore.boundaries,
        nodes: geoStore.nodes
    };

    const ready = await prepareResultData(simStore, exportGeoStore, bciContent);
    if (!ready) {
        alert('Keine Terrain-Daten vorhanden!');
        return;
    }
    window.open('/tools/flood-2d/viewer', 'FloodViewer', 'width=1400,height=900');
};


const runDryCheck = async () => {
    console.group('🌊 FLOOD-2D DRY RUN');
    try {
        console.log("Gathering Data from Stores...");
        
        // 1. Collect Data (Mirroring startPreparation)
        const scenarioData = {
             grid: geoStore.terrain, 
             modifications: geoStore.modifications, 
             buildings: geoStore.buildings, 
             surfaceGrid: surfaceStore.surfaceGrid ? toRaw(surfaceStore.surfaceGrid) : null,
             surfaceMaterials: surfaceStore.surfaceGrid ? toRaw(surfaceStore.materials) : null,
             rain: hydStore.rainConfig && hydStore.rainData ? {
                 intensity: hydStore.rainConfig.intensity,
                 ...hydStore.rainConfig
             } : null,
             rainSeries: hydStore.rainSeries,
             // Corrected: Boundaries come from GeoStore (Features), Assignments from HydStore
             boundaries: geoStore.boundaries ? geoStore.boundaries.features : [],
             // Manholes (Nodes) -> Map to GeoJSON Point Features
             manholes: geoStore.nodes ? geoStore.nodes.map(n => ({
                 type: 'Feature',
                 id: n.id,
                 geometry: { type: 'Point', coordinates: [n.x, n.y] },
                 properties: { name: n.displayName || `Node_${n.id}` }
             })) : [],
             assignments: hydStore.assignments,
             ganglinien: hydStore.ganglinien,
             globalRoughness: hydStore.globalRoughness,
             config: {
                 sim_time: simStore.simDuration || 3600,
                 initial_tstep: simStore.timeStep || 1.0
             }
        };

        console.log("📦 INPUT DATA:", scenarioData);
        
        if (!scenarioData.grid || !scenarioData.grid.gridData) {
            throw new Error("Missing Terrain Data");
        }

        // 2. Run Generators
        // Using processScenario to orchestrate the generation sequence
        console.log("🚀 Running InputGenerator.processScenario()...");
        const files = generator.processScenario(scenarioData);
        
        console.log("✅ GENERATION SUCCESS!");
        console.log("📂 OUTPUT FILES:", Object.keys(files));
        
        // Log details for key files
        if (files['run.par']) console.log("📄 run.par Content:\n", files['run.par']);
        if (files['rain.txt']) console.log("📄 rain.txt Content:\n", files['rain.txt']);
        
        // Boundaries
        if (files['flow.bci']) console.log("📄 flow.bci Content:\n", files['flow.bci']);
        if (files['flow.bdy']) console.log("📄 flow.bdy Content:\n", files['flow.bdy']); // Fallback
        
        if (files['profiles.bdy']) console.log("📄 profiles.bdy Content:\n", files['profiles.bdy']);
        // Summary for huge files
        if (files['terrain.asc']) console.log(`📄 terrain.asc Size: ${files['terrain.asc'].length} chars`);

    } catch (e) {
        console.error("❌ DRY RUN FAILED:", e);
        alert(`Dry Run Failed: ${e.message}`);
    } finally {
        console.groupEnd();
    }
};

const startPreparation = async () => {
    simStore.setStatus('PREPARING');
    appendLog("Generiere Input Dateien aus Stores (Main Thread)...");

    try {
         // Gather Data from Stores
         const scenarioData = {
             // BINARY DATA: Must remain toRaw() to avoid memory bloat
             grid: toRaw(geoStore.terrain), 
             surfaceGrid: surfaceStore.surfaceGrid ? toRaw(surfaceStore.surfaceGrid) : null,
             
             // JSON METADATA: Must be deep-cloned to kill nested Vue Proxies
             modifications: JSON.parse(JSON.stringify(geoStore.modifications)), 
             buildings: JSON.parse(JSON.stringify(geoStore.buildings)), 
             surfaceMaterials: surfaceStore.surfaceGrid ? JSON.parse(JSON.stringify(surfaceStore.materials)) : null,
             rain: hydStore.rainConfig && hydStore.rainData ? JSON.parse(JSON.stringify({
                 intensity: hydStore.rainConfig.intensity,
                 ...hydStore.rainConfig
             })) : null,
             rainSeries: hydStore.rainSeries ? JSON.parse(JSON.stringify(hydStore.rainSeries)) : null,
             boundaries: geoStore.boundaries ? JSON.parse(JSON.stringify(geoStore.boundaries.features)) : [],
             manholes: geoStore.nodes ? JSON.parse(JSON.stringify(geoStore.nodes)).map(n => ({
                 type: 'Feature',
                 id: n.id,
                 geometry: { type: 'Point', coordinates: [n.x, n.y] },
                 properties: { name: n.displayName || `Node_${n.id}` }
             })) : [],
             assignments: JSON.parse(JSON.stringify(hydStore.assignments)),
             ganglinien: JSON.parse(JSON.stringify(hydStore.ganglinien)),
             globalRoughness: hydStore.globalRoughness,
             config: {
                  sim_time: String(simStore.simDuration || 3600) + '.0',
                  initial_tstep: String(simStore.timeStep || 1.0),
                  saveint: String(simStore.saveInterval || 60) + '.0',
                  massint: String(simStore.massInterval || 60) + '.0',
                  ...(simStore.useAcceleration ? { acceleration: '' } : {})
             }
          };

         // 2. Send to Worker (DELEGATED GENERATION)
         // We send the raw scenario data, and the worker runs InputGenerator internally.
         if (worker) {
             // Clone specifically to be safe
             // const payload = JSON.parse(JSON.stringify(scenarioData)); 
             // ^ CANT DO THIS because gridData is Float32Array (Transferable) ideally, or at least binary.
             // toRaw should be enough.
             
             worker.postMessage({
                 cmd: 'CMD_RUN',
                 payload: { 
                    scenarioData: scenarioData,
                 }
             });
             simStore.setStatus('RUNNING');
         } else {
             throw new Error("Worker not initialized!");
         }

    } catch (e) {
        console.error(e);
        appendLog(`[ERROR] Data Prep failed: ${e.message}`);
        simStore.setStatus('ERROR');
        isRunning.value = false;
    }
};

onUnmounted(() => {
    if (worker) {
        worker.terminate();
        worker = null;
    }
});

</script>

<style scoped>
.flood-solver-container {
    padding: 2rem;
    height: 100%;
    overflow-y: auto;
    background: #f8f9fa;
}

.controls {
    margin: 1rem 0;
    display: flex;
    gap: 1rem;
    align-items: center;
}

.run-btn {
    padding: 0.75rem 1.5rem;
    background: #2196F3;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
}

.run-btn:disabled {
    background: #b0bec5;
    cursor: not-allowed;
}

.run-btn:hover:not(:disabled) {
    background: #1976D2;
}

.stop-btn {
    padding: 0.75rem 1.5rem;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
}

.stop-btn:hover {
    background: #c0392b;
}

.dry-run-btn {
    padding: 0.75rem 1.5rem;
    background: transparent;
    color: #666;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
}
.dry-run-btn:hover {
    background: #e0e0e0;
    color: #333;
    border-color: #999;
}

.viewer-btn {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #0078d7, #00bcd4);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 600;
}
.viewer-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 120, 215, 0.35);
}

/* Simulation Parameters */
.sim-params {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
}
.sim-params h3 {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
    color: #2c3e50;
}
.param-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 1rem;
    align-items: center;
}
.param-grid label {
    font-size: 0.82rem;
    color: #555;
    white-space: nowrap;
}
.param-grid input[type='number'] {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
}
.param-grid input[type='number']:focus {
    border-color: #3498db;
    outline: none;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.15);
}
.toggle-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.toggle-label {
    font-size: 0.8rem;
    color: #666;
}
.param-hint {
    margin: 0.75rem 0 0;
    font-size: 0.78rem;
    color: #7f8c8d;
}

.status-indicator {
    font-weight: bold;
}

.success { color: #2ecc71; }
.error { color: #e74c3c; }
.warning { color: #f39c12; }

.logs-container {
    margin-top: 2rem;
    background: #2c3e50;
    color: #ecf0f1;
    padding: 1rem;
    border-radius: 4px;
    height: 400px;
    overflow-y: auto;
}

pre {
    margin: 0;
    font-family: 'Consolas', 'Monaco', monospace;
    white-space: pre-wrap;
    font-size: 0.9rem;
}

.results-container {
    margin-top: 2rem;
    padding: 1rem;
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.prepare-btn {
    padding: 0.5rem 1rem;
    background: #8e44ad;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
}
.prepare-btn:disabled { opacity: 0.7; cursor: wait; }

.save-zip-btn {
    display: inline-block;
    padding: 0.5rem 1rem;
    background: #2ecc71;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-weight: bold;
    animation: pulse 1s infinite alternate;
}

@keyframes pulse {
    from { transform: scale(1); }
    to { transform: scale(1.05); }
}

.file-list {
    display: grid;
    gap: 0.5rem;
}

.file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: #f1f3f5;
    border-radius: 4px;
}

.download-btn {
    padding: 0.25rem 0.5rem;
    background: #27ae60;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8rem;
}

.download-btn:hover {
    background: #219150;
}
</style>
