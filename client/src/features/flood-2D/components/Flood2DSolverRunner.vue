<template>
  <div class="flood-solver-container">
    <h2>🌊 2D Flood Simulation (WASM)</h2>
    
    <div class="controls">
      <button @click="runSimulation" :disabled="isRunning" class="run-btn">
        {{ isRunning ? 'Simulating...' : 'Start Smoke Test' }}
      </button>
      
      <div v-if="status" class="status-indicator">
        Status: <span :class="statusClass">{{ status }}</span>
      </div>
    </div>

    <div class="logs-container">
      <h3>Simulation Logs:</h3>
      <pre ref="logContainer">{{ logs }}</pre>
    </div>

    <div v-if="Object.keys(resultFiles).length > 0" class="results-container">
      <div class="results-header">
        <h3>Output Files:</h3>
        <div class="zip-controls">
            <button v-if="!zipUrl" @click="prepareZip" class="prepare-btn" :disabled="isZipping">
                {{ isZipping ? '⏳ Zipping...' : '📦 Prepare ZIP' }}
            </button>
            <a v-else :href="zipUrl" download="simulation_results.zip" class="save-zip-btn">
                💾 Save ZIP
            </a>
        </div>
      </div>
      <div class="file-list">
        <div v-for="(content, name) in resultFiles" :key="name" class="file-item">
            <span>📄 {{ name }}</span>
            <button @click="downloadFile(name, content)" class="download-btn">⬇️ Download</button>
        </div>
      </div>
    </div>
  </div>
</template>

import { ref, onUnmounted, computed, watch } from 'vue';
import JSZip from 'jszip';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useHydraulicStore } from '../../stores/useHydraulicStore.js';
import { useSimulationStore } from '../../stores/useSimulationStore.js';
import { InputGenerator } from '../../middleware/InputGenerator.js';
import { Rasterizer } from '../../middleware/Rasterizer.js';

// Stores
const geoStore = useGeoStore();
const hydStore = useHydraulicStore();
const simStore = useSimulationStore();

// State
const isRunning = ref(false);
const logs = ref('');
const resultFiles = ref({});
const zipUrl = ref(null);
const isZipping = ref(false);
const generator = new InputGenerator();
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
            
            worker.onmessage = (e) => {
                const { type, status: workerStatus, text, value, frame, header, payload, error } = e.data;
                
                switch (type) {
                    case 'STATUS':
                        simStore.setStatus(workerStatus);
                        appendLog(`[STATUS] ${workerStatus}`);
                        
                        // Auto-Advance Logic
                        if (workerStatus === 'IDLE' && isRunning.value) {
                           startPreparation();
                        } else if (workerStatus === 'READY' && isRunning.value) {
                           worker.postMessage({ cmd: 'CMD_RUN' });
                           simStore.setStatus('RUNNING');
                        } else if (workerStatus === 'FINISHED') {
                           simStore.setStatus('FINISHED');
                           appendLog(`[COMPLETE] Simulation finished.`);
                           isRunning.value = false;
                        }
                        break;

                    case 'STDOUT': appendLog(`[STDOUT] ${text}`); break;
                    case 'STDERR': appendLog(`[STDERR] ${text}`); break;

                    case 'PROGRESS':
                        // simStore.setProgress(value); // If exists
                        simStore.setStatus(`RUNNING ${value.toFixed(1)}%`);
                        break;

                    case 'RESULT':
                         try {
                             const frameName = `res-${String(frame).padStart(4, '0')}.wd.asc`;
                             const ascContent = Rasterizer.gridToASC(payload, header);
                             resultFiles.value[frameName] = ascContent;
                             appendLog(`[RESULT] Received Frame ${frame}`);
                         } catch (err) {
                             appendLog(`[ERROR] processing result: ${err.message}`);
                         }
                        break;

                    case 'ERROR':
                        simStore.setStatus('ERROR');
                        appendLog(`[ERROR] ${error}`);
                        isRunning.value = false;
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

const startPreparation = async () => {
    simStore.setStatus('PREPARING');
    appendLog("Generiere Input Dateien aus Stores (im Worker)...");

    try {
         // Gather Data from Stores
         const scenarioData = {
             grid: geoStore.terrain, // Pass the Grid Object directly
             
             // NEW: Pass explicit modifications list for Baking
             modifications: geoStore.modifications, 
             
             // Legacy Compatibility (worker strips this to avoid double-baking, but we pass it just in case logic changes)
             buildings: geoStore.buildings, 

             rain: hydStore.rainConfig && hydStore.rainData ? {
                 intensity: hydStore.rainConfig.intensity,
                 ...hydStore.rainConfig
             } : null,
             
             boundaries: hydStore.profiles ? Object.values(hydStore.profiles) : [],
             
             config: {
                 sim_time: simStore.simDuration || 3600,
                 initial_tstep: simStore.timeStep || 1.0
             }
         };

         // DELEGATE TO WORKER (Task 4 Requirement)
         // Instead of running generator locally, we ask the worker to bake & prepare.
         if (worker) {
             worker.postMessage({
                 type: 'PREPARE_SIMULATION',
                 payload: scenarioData
             });
             // Response will be handled in onmessage ('PREPARATION_COMPLETE' or 'ERROR')
         } else {
             throw new Error("Worker not initialized!");
         }

    } catch (e) {
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
