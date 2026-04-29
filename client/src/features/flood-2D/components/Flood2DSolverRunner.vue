<template>
  <div class="flood-solver-container">

    <!-- HEADER -->
    <div class="runner-header">
      <div class="runner-title">
        <span class="runner-icon">🌊</span>
        <div>
          <div class="runner-name">Flood Simulation</div>
          <div class="runner-sub">LISFLOOD-FP · WASM Engine</div>
        </div>
      </div>
      <div class="status-pill" :class="statusClass">
        {{ status }}
      </div>
    </div>

    <!-- SIMULATION PARAMETERS -->
    <div class="section-card">
      <div class="section-title">⚙️ Parameter</div>

      <div class="param-grid">
        <div class="param-row">
          <label>Simulationsdauer</label>
          <div class="input-unit-wrap">
            <input type="number" v-model.number="simStore.simDuration" min="60" step="60" />
            <span class="unit">s</span>
          </div>
        </div>

        <div class="param-row">
          <label>Zeitschritt Δt</label>
          <div class="input-unit-wrap">
            <input type="number" v-model.number="simStore.timeStep" min="0.01" max="10" step="0.1" />
            <span class="unit">s</span>
          </div>
        </div>

        <div class="param-row">
          <label>Ausgabeintervall</label>
          <div class="input-unit-wrap">
            <input type="number" v-model.number="simStore.saveInterval" min="1" step="10" />
            <span class="unit">s</span>
          </div>
        </div>

        <div class="param-row">
          <label>Massenbalanz-Int.</label>
          <div class="input-unit-wrap">
            <input type="number" v-model.number="simStore.massInterval" min="1" step="10" />
            <span class="unit">s</span>
          </div>
        </div>
      </div>

      <!-- Stats bar -->
      <div class="param-stats">
        <span>📊 <strong>{{ estimatedFrames }}</strong> Frames</span>
        <span>⏱ <strong>{{ (simStore.simDuration / 60).toFixed(0) }}</strong> min Laufzeit</span>
      </div>
    </div>

    <!-- TOGGLES -->
    <div class="section-card toggles-card">
      <label class="toggle-row">
        <input type="checkbox" v-model="simStore.useAcceleration" />
        <div class="toggle-track" :class="{ on: simStore.useAcceleration }">
          <div class="toggle-thumb"></div>
        </div>
        <span>Acceleration Solver
          <em>{{ simStore.useAcceleration ? '(Instabil?)' : '(Stabil)' }}</em>
        </span>
      </label>

      <label class="toggle-row bmi-row" :class="{ 'bmi-active': simStore.useBmiSolver }">
        <input type="checkbox" v-model="simStore.useBmiSolver" :disabled="isRunning" />
        <div class="toggle-track" :class="{ on: simStore.useBmiSolver }">
          <div class="toggle-thumb"></div>
        </div>
        <span>🧪 BMI 1D/2D Solver <strong>God Mode</strong></span>
      </label>
    </div>

    <!-- PROGRESS BAR -->
    <div class="progress-bar-wrap" v-if="isRunning">
      <div class="progress-bar-fill" :style="{ width: simStore.progress + '%' }"></div>
      <span class="progress-label">{{ simStore.progress }}%</span>
    </div>

    <!-- CONTROLS -->
    <div class="controls">
      <button v-if="!isRunning" @click="runSimulation" class="run-btn">
        ▶️ Start Simulation
      </button>
      <button v-else @click="abortSimulation" class="stop-btn">
        🛑 Stopp
      </button>

      <button @click="showInspector = !showInspector" class="ghost-btn" type="button">
        {{ showInspector ? '✕ Inspector' : '📋 Raw Inspector' }}
      </button>

      <button
        v-if="geoStore.terrain || simStore.totalFrameCount > 0"
        @click.prevent="openViewer"
        type="button"
        class="viewer-btn"
      >
        🗺️ 3D Viewer
      </button>
    </div>

    <!-- LOG CONSOLE -->
    <div class="logs-console">
      <div class="logs-title">
        <span>🖥️ Simulation Log</span>
        <button class="clear-btn" @click="logs = ''">Clear</button>
      </div>
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

            const workerUrl = simStore.useBmiSolver
                ? new URL('../middleware/simulation.bmi.js', import.meta.url)
                : new URL('../middleware/simulation.main.js', import.meta.url);

            appendLog(`Engine: ${simStore.useBmiSolver ? '🧪 BMI (Frame-by-Frame)' : '⚙️ Classic (Blackbox)'}`);
            worker = new Worker(workerUrl, { type: 'module' });
            
            // IMMEDIATE Error Handler for Startup
            worker.onerror = (e) => {
                // e.message kann leer sein wenn ein Import fehlschlug
                const msg = e.message || e.filename || 'Worker failed to start (possible import/parse error)';
                const line = e.lineno ?? 'unknown';
                const file = e.filename ? e.filename.split('/').pop() : 'unknown file';
                console.error('[SolverRunner] Worker onerror:', e);
                appendLog(`[WORKER ERROR] ${msg}`);
                appendLog(`  → File: ${file}, Line: ${line}`);
                appendLog('  → Check browser DevTools > Network tab for failed requests (404s).');
                appendLog('  → Check browser DevTools > Console for detailed error messages.');
                simStore.setStatus('ERROR');
                isRunning.value = false;
                e.preventDefault(); // Verhindert unkontrollierten Absturz
            };
            worker.onmessageerror = (e) => {
                console.error('[SolverRunner] Worker messageerror:', e);
                appendLog('[WORKER ERROR] Message serialization error in worker.');
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
        // BMI-Worker: Erst abort-Signal senden, damit _bmi_finalize() sauber läuft,
        // dann mit kleinem Verzug terminieren als Fallback.
        worker.postMessage({ type: 'abort' });
        setTimeout(() => {
            if (worker) {
                worker.terminate();
                worker = null;
            }
        }, 500);
    }
    isRunning.value = false;
    simStore.setStatus('ABORTED');
    simStore.rows = []; // Clear current run data? Optional.
    appendLog("⛔ Simulation Aborted by User.");
};

const openViewer = async () => {
    // Store data in IndexedDB BEFORE opening popup
    const bciContent = inputFiles.value && inputFiles.value['flow.bci'] ? inputFiles.value['flow.bci'] : null;
    
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
        
        // 1. Gebäude als NoData maskieren (niemals Höhe auf DGM addieren!)
        const buildingMods = [];
        if (geoStore.buildings && geoStore.buildings.features) {
            buildingMods.push(...geoStore.buildings.features.map(f => ({
                type: 'BUILDING',
                geometry: f.geometry,
                properties: f.properties || {}
            })));
        }
        
        // 2. Echte Geländemanipulationen (Teiche/Abgrabungen) sammeln
        const nonBuildingMods = [];
        if (geoStore.modifications) {
            geoStore.modifications.forEach(m => {
                if (m.type === 'BUILDING') buildingMods.push(m);
                else nonBuildingMods.push(m);
            });
        }
        
        // --- CHIRURGISCHER SCHNITT: Terrain bleibt unter Gebäuden flach (NoData) ---
        if (buildingMods.length > 0) {
            bakedTerrainData.gridData = Rasterizer.maskBuildingsAsNoData(bakedTerrainData.gridData, header, buildingMods);
        }
        
        // Erdbau/Bodensenkungen normal ins Mesh brennen
        if (nonBuildingMods.length > 0) {
            bakedTerrainData.gridData = Rasterizer.burnBuildings(bakedTerrainData.gridData, header, nonBuildingMods);
        }
    }

    const exportGeoStore = {
        terrain: bakedTerrainData,
        modifications: geoStore.modifications,
        boundaries: geoStore.boundaries,
        nodes: geoStore.nodes,
        weirs: geoStore.weirs,
        culvertLinks: geoStore.culvertLinks
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
             },
             // Wehre (LISFLOOD weirfile) — Poleni-Formel, nur Typ 0 (keine Brücken)
             weirs: geoStore.weirs ? JSON.parse(JSON.stringify(geoStore.weirs)) : []
          };

         // 2. Node-zu-Culvert-Mapping ─────────────────────────────────────────
         //    Nur relevant für den BMI-Worker (simulation.bmi.js).
         //    Liest culvertLinks aus dem HydraulicStore, löst die Node-IDs gegen
         //    die echten Welt-Koordinaten aus dem GeoStore auf und baut das
         //    activeCulverts-Array, das der Worker erwartet.
         let activeCulverts = [];
         let dmgHeader = null;

         if (simStore.useBmiSolver) {
             const rawNodes = toRaw(geoStore.nodes) || [];
             const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

             const rawLinks = toRaw(geoStore.culvertLinks) || [];

             const t = geoStore.terrain;
             if (t) {
                 const h = t.header ?? t;
                 dmgHeader = {
                     xllcorner: h.xll      !== undefined ? h.xll      : (h.xllcorner ?? 0),
                     yllcorner: h.yll      !== undefined ? h.yll      : (h.yllcorner ?? 0),
                     cellsize:  h.cellsize ?? 1,
                     nrows:     h.nrows    ?? 0,
                     ncols:     h.ncols    ?? 0
                 };
             }

             for (const link of rawLinks) {
                 const inNode  = nodeMap.get(link.sourceId);
                 const outNode = nodeMap.get(link.targetId);

                 if (!inNode || !outNode) {
                     appendLog(`⚠️ Culvert [${link.id}]: Node nicht gefunden (source=${link.sourceId}, target=${link.targetId}) — übersprungen.`);
                     continue;
                 }

                 activeCulverts.push({
                     inX:  inNode.x,
                     inY:  inNode.y,
                     outX: outNode.x,
                     outY: outNode.y,
                     maxQ: link.maxQ ?? 1.0
                 });
             }



             appendLog(`🔌 BMI: ${activeCulverts.length} Culvert-Paar(e) gemapped. Header: xll=${dmgHeader?.xllcorner}, yll=${dmgHeader?.yllcorner}, cs=${dmgHeader?.cellsize}`);
         }

         // 3. Input-Dateien im Haupt-Thread generieren (nicht im Worker!)
         // Grund: InputGenerator hat transitive Imports (Rasterizer, Hydraulics etc.) die
         // in einem gebündelten ES-Modul-Worker Production-Build nicht auflösbar sind.
         // Der Worker erhält fertige Dateien und muss keine eigene Generierung mehr leisten.
         appendLog('Generiere LISFLOOD Input-Dateien im Haupt-Thread...');
         let generatedFiles;
         try {
             const gen = new InputGenerator();
             generatedFiles = gen.processScenario(scenarioData);
             appendLog(`✅ ${Object.keys(generatedFiles).length} Input-Dateien generiert: ${Object.keys(generatedFiles).join(', ')}`);
         } catch (genErr) {
             throw new Error(`InputGenerator fehlgeschlagen: ${genErr.message}`);
         }
         
         // Set input files for the UI Inspector
         inputFiles.value = generatedFiles;

         // 4. Send to Worker (ONLY pre-generated files + culvert metadata)
         if (worker) {
             worker.postMessage({
                 cmd: 'CMD_RUN',
                 payload: {
                    files: generatedFiles,        // fertige LISFLOOD-Dateien (terrain.asc, run.par, etc.)
                    scenarioData: {               // nur noch für BMI-Heartbeat-Daten (grid, header)
                        grid: { gridData: toRaw(geoStore.terrain?.gridData) }
                    },
                    // BMI-spezifisch: nur gesetzt wenn useBmiSolver aktiv
                    culverts: activeCulverts,
                    header:   dmgHeader,
                    maxTime:  simStore.simDuration || 3600
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
/* ── Layout ───────────────────────────────────────────────────────────────────*/
.flood-solver-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    height: 100%;
    overflow-y: auto;
    background: #1a252f;
    color: #ecf0f1;
    scrollbar-width: thin;
    scrollbar-color: #34495e transparent;
}

/* ── Header ──────────────────────────────────────────────────────────────────*/
.runner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: #2c3e50;
    border-radius: 8px;
    border: 1px solid #34495e;
}
.runner-title {
    display: flex;
    align-items: center;
    gap: 10px;
}
.runner-icon { font-size: 1.4rem; }
.runner-name { font-weight: 700; font-size: 0.95rem; color: #ecf0f1; }
.runner-sub  { font-size: 0.72rem; color: #7f8c8d; margin-top: 1px; }

.status-pill {
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    border: 1px solid currentColor;
}
.status-pill.info    { color: #95a5a6; }
.status-pill.success { color: #2ecc71; background: rgba(46,204,113,0.1); }
.status-pill.warning { color: #f39c12; background: rgba(243,156,18,0.1); }
.status-pill.error   { color: #e74c3c; background: rgba(231,76,60,0.1); }

/* ── Section Card ────────────────────────────────────────────────────────────*/
.section-card {
    background: #243342;
    border: 1px solid #2c3e50;
    border-radius: 8px;
    padding: 12px 14px;
}
.section-title {
    font-size: 0.78rem;
    font-weight: 700;
    color: #7f8c8d;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 10px;
}

/* ── Param Grid ──────────────────────────────────────────────────────────────*/
.param-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.param-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px;
}
.param-row label {
    font-size: 0.8rem;
    color: #bdc3c7;
    white-space: nowrap;
}
.input-unit-wrap {
    display: flex;
    align-items: center;
    background: #1a252f;
    border: 1px solid #34495e;
    border-radius: 5px;
    overflow: hidden;
    width: 100px;
}
.input-unit-wrap input[type='number'] {
    width: 70px;
    padding: 5px 7px;
    background: transparent;
    border: none;
    color: #ecf0f1;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    outline: none;
}
.input-unit-wrap input[type='number']:focus {
    background: rgba(52,152,219,0.08);
}
.unit {
    padding: 0 7px 0 2px;
    font-size: 0.72rem;
    color: #7f8c8d;
}

.param-stats {
    display: flex;
    gap: 16px;
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #2c3e50;
    font-size: 0.78rem;
    color: #7f8c8d;
}
.param-stats strong { color: #3498db; }

/* ── Toggles ─────────────────────────────────────────────────────────────────*/
.toggles-card { display: flex; flex-direction: column; gap: 10px; }

.toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
}
.toggle-row input[type='checkbox'] { display: none; }
.toggle-track {
    width: 34px; height: 18px;
    background: #34495e;
    border-radius: 9px;
    position: relative;
    flex-shrink: 0;
    transition: background 0.2s;
}
.toggle-track.on { background: #3498db; }
.toggle-thumb {
    width: 14px; height: 14px;
    background: #ecf0f1;
    border-radius: 50%;
    position: absolute;
    top: 2px; left: 2px;
    transition: left 0.2s;
}
.toggle-track.on .toggle-thumb { left: 18px; }

.toggle-row span {
    font-size: 0.8rem;
    color: #bdc3c7;
    line-height: 1.3;
}
.toggle-row em { color: #7f8c8d; font-style: normal; margin-left: 4px; }
.toggle-row strong { color: #f39c12; }

.bmi-row {
    padding: 6px 8px;
    border-radius: 5px;
    transition: background 0.2s;
}
.bmi-row.bmi-active {
    background: rgba(243,156,18,0.07);
    border: 1px solid rgba(243,156,18,0.25);
}
.bmi-row.bmi-active span { color: #d4a017; }

/* ── Progress Bar ────────────────────────────────────────────────────────────*/
.progress-bar-wrap {
    height: 6px;
    background: #2c3e50;
    border-radius: 3px;
    overflow: hidden;
    position: relative;
}
.progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #3498db, #2ecc71);
    border-radius: 3px;
    transition: width 0.4s ease;
}
.progress-label {
    position: absolute;
    right: 0; top: -16px;
    font-size: 0.7rem;
    color: #7f8c8d;
}

/* ── Controls ────────────────────────────────────────────────────────────────*/
.controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
}

.run-btn {
    flex: 1;
    min-width: 130px;
    padding: 9px 14px;
    background: linear-gradient(135deg, #2980b9, #3498db);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(52,152,219,0.25);
}
.run-btn:hover { background: linear-gradient(135deg, #3498db, #5dade2); transform: translateY(-1px); }
.run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.stop-btn {
    flex: 1;
    min-width: 100px;
    padding: 9px 14px;
    background: linear-gradient(135deg, #c0392b, #e74c3c);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}
.stop-btn:hover { opacity: 0.9; }

.ghost-btn {
    padding: 8px 12px;
    background: transparent;
    color: #7f8c8d;
    border: 1px solid #34495e;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s;
}
.ghost-btn:hover { background: #2c3e50; color: #ecf0f1; border-color: #3d5266; }

.viewer-btn {
    padding: 8px 14px;
    background: linear-gradient(135deg, #0078d7, #00bcd4);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}
.viewer-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,120,215,0.35); }

/* ── Log Console ─────────────────────────────────────────────────────────────*/
.logs-console {
    flex: 1;
    min-height: 180px;
    background: #0d1b24;
    border: 1px solid #1e3040;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.logs-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: #162433;
    border-bottom: 1px solid #1e3040;
    font-size: 0.72rem;
    color: #7f8c8d;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.clear-btn {
    background: none;
    border: none;
    color: #7f8c8d;
    font-size: 0.7rem;
    cursor: pointer;
    padding: 1px 5px;
}
.clear-btn:hover { color: #e74c3c; }
.logs-console pre {
    flex: 1;
    margin: 0;
    padding: 8px 10px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.78rem;
    line-height: 1.55;
    color: #a8c7d8;
    white-space: pre-wrap;
    overflow-y: auto;
}

/* success / error classes for status-pill (reused elsewhere) */
.success { color: #2ecc71; }
.error   { color: #e74c3c; }
.warning { color: #f39c12; }
.info    { color: #95a5a6; }
</style>

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

/* BMI Dev-Switch */
.bmi-toggle-row {
    border-radius: 4px;
    padding: 0.25rem 0.4rem;
    transition: background 0.2s;
}
.bmi-toggle-row.bmi-active {
    background: rgba(243, 156, 18, 0.08);
    outline: 1px solid rgba(243, 156, 18, 0.35);
}
.bmi-toggle-row input[type='checkbox']:disabled + .bmi-label {
    opacity: 0.45;
    cursor: not-allowed;
}
.bmi-label {
    font-size: 0.8rem;
    color: #7f5200;
}
.bmi-toggle-row.bmi-active .bmi-label {
    color: #b7771d;
    font-weight: 500;
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
