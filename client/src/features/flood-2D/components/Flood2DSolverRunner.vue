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

<script setup>

import { ref, onUnmounted } from 'vue';
// import SimulationWorker from '../simulation.worker.js?worker'; // Unused
import JSZip from 'jszip';

// Hardcoded File Contents
const PAR_CONTENT = `# LISFLOOD-FP Parameter File
dirroot results
resroot res
sim_time 3600.0
initial_tstep 0.1
massint 60.0
saveint 60.0
fpfric 0.035

# Input Dateien
DEMfile      debug_terrain_check.asc
bdyfile      manual_flow.bdy
bcifile      manual_flow.bci

# Output Optionen
voutput
depthoff
adaptoff
`;

const BCI_CONTENT = `P 408940.000 5482490.000 QVAR schacht_inflow
P 409777.114 5482463.699 QVAR zufluss_50ls
P 409776.299 5482577.394 QVAR zufluss_50ls
P 409776.299 5482691.091 QVAR zufluss_50ls
P 408797.902 5482165.578 QVAR abfluss_10ls
P 408689.976 5482230.198 QVAR abfluss_10ls
`;

const BDY_CONTENT = `Boundary Data
schacht_inflow
2 seconds
0       0.5
3600    0.5

zufluss_50ls
2 seconds
0       0.016667
3600    0.016667

abfluss_10ls
2 seconds
0       -0.005
3600    -0.005
`;

// import demUrl from '../debug_terrain_check.asc?url';
const demUrl = '/debug_terrain_check.asc'; // Expecting it in public for now? Or just mock.

const isRunning = ref(false);
const status = ref('');
const logs = ref('');
const statusClass = ref('');
const resultFiles = ref({});
let worker = null;

import { Rasterizer } from '../middleware/Rasterizer.js';

const downloadFile = (name, content) => {
    // Content is String (ASC)
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const zipUrl = ref(null);
const isZipping = ref(false);

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
};

const runSimulation = async () => {
    if (isRunning.value) return;
    
    isRunning.value = true;
    status.value = 'Initializing...';
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
                        status.value = workerStatus;
                        statusClass.value = (workerStatus === 'RUNNING') ? 'warning' : 'info';
                        appendLog(`[STATUS] ${workerStatus}`);
                        
                        // Auto-Advance Logic
                        if (workerStatus === 'IDLE' && isRunning.value) {
                           // Initialized, now Prepare
                           startPreparation();
                        } else if (workerStatus === 'READY' && isRunning.value) {
                           // Prepared, now Run
                           worker.postMessage({ cmd: 'CMD_RUN' });
                        } else if (workerStatus === 'FINISHED') {
                           status.value = 'Success';
                           statusClass.value = 'success';
                           appendLog(`[COMPLETE] Simulation finished.`);
                           isRunning.value = false;
                        }
                        break;

                    case 'STDOUT':
                        appendLog(`[STDOUT] ${text}`);
                        break;

                    case 'STDERR':
                        appendLog(`[STDERR] ${text}`);
                        break;

                    case 'PROGRESS':
                        status.value = `Running ${value.toFixed(1)}%`;
                        break;

                    case 'RESULT':
                         // Payload is Float32Array
                         // Reconstruct ASC for download
                         try {
                             const frameName = `res-${String(frame).padStart(4, '0')}.wd.asc`;
                             // Convert Float32 back to ASC String
                             const ascContent = Rasterizer.gridToASC(payload, header);
                             resultFiles.value[frameName] = ascContent;
                             appendLog(`[RESULT] Received Frame ${frame}`);
                         } catch (err) {
                             appendLog(`[ERROR] processing result: ${err.message}`);
                         }
                        break;

                    case 'ERROR':
                        status.value = 'Error';
                        statusClass.value = 'error';
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
        status.value = 'Setup Error';
        statusClass.value = 'error';
        appendLog(`Setup Error: ${e.message}`);
        isRunning.value = false;
    }
};

const startPreparation = async () => {
    status.value = 'Fetching Data...';
    try {
         appendLog(`Fetching DEM from ${demUrl}...`);
         const demResponse = await fetch(demUrl);
         if (!demResponse.ok) throw new Error("Failed to fetch DEM file");
         const demText = await demResponse.text();

         const files = {
            'run.par': PAR_CONTENT,
            'manual_flow.bdy': BDY_CONTENT,
            'manual_flow.bci': BCI_CONTENT,
            'debug_terrain_check.asc': demText
         };

         worker.postMessage({
             cmd: 'CMD_PREPARE',
             payload: {
                 config: { sim_time: 3600 },
                 files: files
             }
         });
    } catch (e) {
        appendLog(`[ERROR] Prep failed: ${e.message}`);
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
