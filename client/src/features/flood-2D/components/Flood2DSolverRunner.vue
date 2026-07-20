<template>
  <div class="flood-solver-container">
    <h2><SvEmoji emoji="🌊" :size="16" /> 2D Flood Simulation (WASM)</h2>

    <!-- SIMULATION PARAMETERS -->
    <div class="sim-params">
      <h3><SvEmoji emoji="⚙" :size="15" /> Parameter</h3>

      <!-- Run Presets -->
      <div class="presets-row">
        <button
          v-for="p in RUN_PRESETS"
          :key="p.id"
          class="preset-btn"
          :class="{ active: activePresetId === p.id }"
          :title="p.hint"
          @click="applyPreset(p)"
        ><SvEmoji :emoji="p.icon" :size="14" /> {{ p.label }}</button>
      </div>

      <div class="param-grid">

        <label>Simulationsdauer (s)</label>
        <input type="number" v-model.number="simStore.simDuration" min="60" step="60" @input="clearPreset" />

        <label>Zeitschritt Δt (s)</label>
        <div class="dt-field">
          <input type="number" v-model.number="simStore.timeStep" min="0.01" max="10" step="0.1" @input="clearPreset" />
          <span class="cfl-chip" :class="cflStatus.level">{{ cflStatus.label }}</span>
        </div>

        <label>Ausgabeintervall (s)</label>
        <input type="number" v-model.number="simStore.saveInterval" min="1" step="10" @input="clearPreset" />

        <label>Massenbalanz-Int. (s)</label>
        <input type="number" v-model.number="simStore.massInterval" min="1" step="10" @input="clearPreset" />

        <label>Acceleration Solver</label>
        <div class="toggle-row">
          <input type="checkbox" id="accel-toggle" v-model="simStore.useAcceleration" />
          <label for="accel-toggle" class="toggle-label">
            {{ simStore.useAcceleration ? 'Aktiv (Instabil?)' : 'Aus (Stabil)' }}
          </label>
        </div>

        <label>Engine</label>
        <div class="toggle-row bmi-toggle-row" :class="{ 'bmi-active': simStore.solverMode !== 'wasm' }">
          <select v-model="simStore.solverMode" :disabled="isRunning" class="engine-select">
            <option value="wasm">Classic WASM (Blackbox, lokal)</option>
            <option value="bmi">BMI Frame-by-Frame (God Mode, lokal)</option>
            <option value="runpod">RUNPOD Remote (LISFLOOD 8.2)</option>
          </select>
        </div>

      </div>

      <p v-if="simStore.solverMode === 'runpod'" class="param-hint">
        <SvEmoji emoji="☁" :size="13" /> Job: {{ simStore.jobId || '—' }} · Phase: <strong>{{ simStore.jobPhase }}</strong>
        <span v-if="simStore.jobError"> · <SvEmoji emoji="⚠" :size="13" /> {{ simStore.jobError }}</span>
      </p>

      <!-- ── Genauigkeit (High-End-Pfad) ─────────────────────────────────── -->
      <div v-if="simStore.solverMode === 'runpod'" class="accuracy-section">
        <div class="accuracy-header"><SvEmoji emoji="🎯" :size="14" /> Genauigkeit (High-End)</div>

        <div class="param-grid">
          <label>Numerik-Schema</label>
          <select v-model="simStore.numericalScheme" :disabled="isRunning || simStore.sgcEnabled" class="engine-select">
            <option value="acceleration">Acceleration (inertial, robust, CPU+SGC)</option>
            <option value="fv1">FV1 (volle SWE, HLL-Flux, GPU-fähig)</option>
            <option value="dg2">DG2 (2. Ordnung, genauer, GPU-fähig)</option>
          </select>

          <label>GPU (CUDA)</label>
          <div class="toggle-row">
            <input type="checkbox" id="gpu-toggle" v-model="simStore.useGpu"
              :disabled="isRunning || simStore.sgcEnabled || simStore.numericalScheme === 'acceleration'" />
            <label for="gpu-toggle" class="toggle-label">
              <template v-if="simStore.numericalScheme === 'acceleration' || simStore.sgcEnabled">
                Nur mit FV1/DG2 (Acceleration + SGC laufen auf CPU)
              </template>
              <template v-else>Auf RunPod-GPU rechnen (setzt <code>cuda</code> in run.par; ~max Tempo)</template>
            </label>
          </div>

          <label>SGC Sub-Grid-Gerinne</label>
          <div class="toggle-row">
            <input type="checkbox" id="sgc-toggle" v-model="simStore.sgcEnabled"
              :disabled="isRunning || bathyStore.channelPolyline.length < 2"
              @change="simStore.sgcEnabled && (simStore.numericalScheme = 'acceleration')" />
            <label for="sgc-toggle" class="toggle-label">
              <template v-if="bathyStore.channelPolyline.length >= 2">
                Kanal-Mittellinie als Sub-Grid-Gerinne exportieren (erzwingt Acceleration)
              </template>
              <template v-else>Keine Kanal-Mittellinie gezeichnet (Bathymetrie → Kanal-Geometrie)</template>
            </label>
          </div>
        </div>
      </div>
      <p class="param-hint">
        <SvEmoji emoji="📊" :size="13" /> {{ estimatedFrames }} Frames ·
        {{ (simStore.simDuration / 60).toFixed(0) }} min Laufzeit
        <span v-if="cflStatus.dtMax"> · CFL-Limit: {{ cflStatus.dtMax.toFixed(2) }} s</span>
      </p>

      <!-- Mass Balance Report (Remote-Engines liefern u.U. kein summary) -->
      <div v-if="massReport?.summary" class="mass-badge" :class="massReportLevel">
        <SvEmoji emoji="💧" :size="13" /> Massenbilanz:
        <strong>Verror={{ massReport.summary['Verror']?.toExponential(2) ?? '?' }}</strong>
        · Qin={{ massReport.summary['Qin']?.toFixed(1) ?? '?' }} m³/s
        · Qout={{ massReport.summary['Qout']?.toFixed(1) ?? '?' }} m³/s
        <span v-if="massReport.summary['Rain-Inf+Evap'] !== undefined">
          · Netto-Regen/Infil: {{ massReport.summary['Rain-Inf+Evap']?.toFixed(1) }} m³
        </span>
      </div>
    </div>
    
    <div class="controls">
      <button v-if="!isRunning" @click="runSimulation" class="run-btn">
        Start Simulation
      </button>
      <button v-else @click="abortSimulation" class="stop-btn">
        <SvEmoji emoji="🛑" :size="13" /> Stop Simulation
      </button>

      <button @click="showInspector = !showInspector" class="dry-run-btn" type="button">
          <template v-if="showInspector">✕ Raw Viewer schließen</template><template v-else><SvEmoji emoji="📋" :size="13" /> Raw Viewer</template>
      </button>

      <button 
        v-if="geoStore.terrain || simStore.totalFrameCount > 0" 
        @click.prevent="openViewer" 
        type="button"
        class="viewer-btn"
        title="3D Ergebnis-Viewer öffnen"
      >
        <SvEmoji emoji="🗺" :size="13" /> 3D Viewer
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

    <!-- ── Pre-Run-Gate: kritische Pipeline-Probleme vor dem Upload ──────── -->
    <div v-if="preRunGate.open" class="gate-overlay" @click.self="resolvePreRunGate(false)">
      <div class="gate-modal">
        <div class="gate-header">
          <span class="gate-icon"><SvEmoji emoji="⛔" :size="13" /></span>
          <h3>Kritische Probleme vor dem Start</h3>
        </div>
        <p class="gate-sub">
          Der Lauf kann gestartet werden, aber folgende Punkte führen sonst zu fehlerhaften
          oder unvollständigen Ergebnissen:
        </p>
        <IssueList :issues="preRunGate.issues" :show-counts="true" max-height="46vh" />
        <div class="gate-actions">
          <button class="gate-cancel" @click="resolvePreRunGate(false)">Abbrechen &amp; korrigieren</button>
          <button class="gate-proceed" @click="resolvePreRunGate(true)">Trotzdem hochladen</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import SvEmoji from './common/SvEmoji.vue';
import { ref, onUnmounted, computed, watch, toRaw } from 'vue';

import JSZip from 'jszip';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { useHydraulicStore } from '@/features/flood-2D/stores/useHydraulicStore.js';
import { useSimulationStore } from '@/features/flood-2D/stores/useSimulationStore.js';
import { useSurfaceStore } from '@/features/flood-2D/stores/useSurfaceStore.js';
import { useBathymetryStore } from '@/features/flood-2D/stores/useBathymetryStore.js';
import { InputGenerator } from '@/features/flood-2D/middleware/InputGenerator.js';
import { Severity } from '@/features/flood-2D/middleware/ScenarioValidator.js';
import IssueList from '@/features/flood-2D/components/common/IssueList.vue';
import { Rasterizer } from '@/features/flood-2D/middleware/Rasterizer.js';
import { createSolverBackend } from '@/features/flood-2D/services/solver/index.js';
import { prepareResultData } from '@/features/flood-2D/composables/useResultDataBridge.js';
import ResultInspector from '@/features/flood-2D/components/viewer/ResultInspector.vue';
import { useCoupledExport } from '@/features/flood-2D/composables/useCoupledExport.js';

// Stores
const geoStore = useGeoStore();
const hydStore = useHydraulicStore();
const simStore = useSimulationStore();
const surfaceStore = useSurfaceStore();
const bathyStore = useBathymetryStore();

// 1D/2D-Kopplung (SWMM↔LISFLOOD): reichert im runpod-Modus den Datei-Satz an.
// Gesamte Logik in sauberen Modulen (services/geometry/*, services/swmm/coupledScenario).
const { augmentInputs: augmentCoupledInputs, buildBmiCulverts } = useCoupledExport();



// State
const isRunning = ref(false);
const logs = ref('');
const resultFiles = ref({});
const inputFiles = ref({});
const showInspector = ref(false);
const zipUrl = ref(null);
const isZipping = ref(false);
const generator = new InputGenerator();
const massReport = ref(null);

// ── Pre-Run-Gate ───────────────────────────────────────────────────────────────
// Zeigt bei kritischen Pipeline-Problemen (Severity ERROR) vor dem Upload einen
// Bestätigungsdialog. Promise-basiert: startPreparation awaitet die Entscheidung.
const preRunGate = ref({ open: false, issues: [], resolve: null });

function openPreRunGate(issues) {
    return new Promise((resolve) => {
        preRunGate.value = { open: true, issues, resolve };
    });
}
function resolvePreRunGate(proceed) {
    const r = preRunGate.value.resolve;
    preRunGate.value = { open: false, issues: [], resolve: null };
    if (r) r(proceed);
}
const issueIcon = (sev) => sev === Severity.ERROR ? '⛔' : sev === Severity.WARN ? '⚠️' : 'ℹ️';

// ── Run Presets ───────────────────────────────────────────────────────────────
const RUN_PRESETS = [
    { id: 'quick',    icon: '⚡', label: 'Schnell',  hint: '5 min Sim · dt=2s · grobe Tests',        config: { simDuration: 300,  timeStep: 2.0, saveInterval: 30,  massInterval: 30  } },
    { id: 'standard', icon: '⚖', label: 'Standard', hint: '1h Sim · dt=0.5s · Balance',             config: { simDuration: 3600, timeStep: 0.5, saveInterval: 60,  massInterval: 60  } },
    { id: 'precise',  icon: '🔬', label: 'Präzise',  hint: '1h Sim · dt=0.1s · hohe Ausgabefrequenz', config: { simDuration: 3600, timeStep: 0.1, saveInterval: 30,  massInterval: 30  } },
];
const activePresetId = ref(null);
const applyPreset = (preset) => { simStore.setFullConfig(preset.config); activePresetId.value = preset.id; };
const clearPreset  = () => { activePresetId.value = null; };

// ── CFL-Stabilitäts-Checker ───────────────────────────────────────────────────
const cflStatus = computed(() => {
    const terrain = geoStore.terrain;
    if (!terrain) return { level: 'unknown', label: '—', dtMax: null };
    const cellsize   = terrain.cellsize ?? 1;
    const maxDepth   = Math.max((terrain.maxZ ?? 1) - (terrain.minZ ?? 0), 0.5);
    const dtMax      = cellsize / Math.sqrt(9.81 * maxDepth);
    const ratio      = (simStore.timeStep || 1) / dtMax;
    if (ratio < 0.8)  return { level: 'stable',   label: '✅ Stabil',      dtMax };
    if (ratio <= 1.0) return { level: 'marginal',  label: '⚠️ Grenzwertig', dtMax };
    return             { level: 'unstable', label: '🔴 INSTABIL',     dtMax };
});

const estimatedFrames = computed(() => {
    const dur = simStore.simDuration || 3600;
    const save = simStore.saveInterval || 60;
    return Math.floor(dur / save);
});

const massReportLevel = computed(() => {
    if (!massReport.value?.summary) return '';
    const err = Math.abs(massReport.value.summary['Verror'] ?? 0);
    if (err < 0.01) return 'good';
    if (err < 0.05) return 'warn';
    return 'bad';
});

let backend = null;        // SolverBackend-Instanz (wasm | bmi | runpod)
let backendMode = null;    // Modus, mit dem backend erstellt wurde

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

// Verarbeitet alle SolverEvents (identisches Vokabular für WASM-Worker und RUNPOD).
let initTimeout = null;

const handleSolverEvent = (data) => {
    // Clear timeout on first event
    if (initTimeout) { clearTimeout(initTimeout); initTimeout = null; }

    const { type, status: workerStatus, text, frame, header, payload, error, time, message } = data;

    switch (type) {
        case 'JOB_STATE':
            simStore.setJobState({ jobId: data.jobId, phase: data.phase });
            appendLog(`[JOB] ${data.phase}${data.jobId ? ` (${data.jobId})` : ''}`);
            break;

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
                        inputFiles.value = data.files || {};
                        appendLog(`[INPUT] ${Object.keys(inputFiles.value).length} Input-Dateien empfangen`);
                        break;

                    case 'RESULT':
                         try {
                             const frameName = `res-${String(frame).padStart(4, '0')}.wd.asc`;
                             const ascContent = Rasterizer.gridToASC(payload, header);
                             resultFiles.value[frameName] = ascContent;
                             simStore.addResultFrame(frame, payload, header, data.min, data.max);
                             if (data.velocity) simStore.addVelocityFrame(frame, data.velocity);
                             if (data.vx && data.vy) simStore.addVelocityVectorFrame(frame, data.vx, data.vy);
                             if (data.qx && data.qy) simStore.addQFluxFrame(frame, data.qx, data.qy);
                             if (data.elev) simStore.addElevFrame(frame, data.elev);
                             appendLog(`[RESULT] Frame ${frame}${data.velocity ? ' + velocity' : ''}${data.elev ? ' + elev' : ''}${data.qx ? ' + qflux' : ''}`);
                         } catch (err) {
                             appendLog(`[ERROR] processing result: ${err.message}`);
                         }
                        break;

                    case 'MAX_DEPTH_GRID':
                        simStore.setMaxDepthGrid(payload);
                        appendLog('[RESULT] Max-Tiefen-Raster empfangen.');
                        break;

                    case 'MAX_HAZARD_GRID':
                        simStore.setMaxHazardGrid(payload);
                        appendLog('[RESULT] Max-Hazard-Raster empfangen.');
                        break;

                    case 'MAX_VELOCITY_GRID':
                        simStore.setMaxVelocityGrid(payload);
                        appendLog('[RESULT] Max-Geschwindigkeits-Raster empfangen.');
                        break;

                    case 'MAX_ELEV_GRID':
                        simStore.setMaxElevGrid(payload);
                        appendLog('[RESULT] Max-Wasserspiegel-Raster empfangen.');
                        break;

                    case 'ARRIVAL_TIME_GRID':
                        simStore.setArrivalTimeGrid(payload);
                        appendLog('[RESULT] Ankunftszeit-Raster empfangen.');
                        break;

                    case 'DURATION_GRID':
                        simStore.setDurationGrid(payload);
                        appendLog('[RESULT] Überflutungsdauer-Raster empfangen.');
                        break;

                    case 'MASS_REPORT':
                        massReport.value = data.data;
                        simStore.setMassReport(data.data); // → Bridge/Viewer (Massenbilanz-Panel)
                        break;

                    case 'NETWORK_RESULT': {
                        simStore.setNetworkResults(data.data);
                        const n = Object.keys(data.data?.nodes || {}).length;
                        const l = Object.keys(data.data?.links || {}).length;
                        appendLog(`[RESULT] 1D-Kanalnetz-Ergebnisse: ${n} Knoten, ${l} Haltungen, ${data.data?.times?.length ?? 0} Zeitschritte.`);
                        break;
                    }

                    case 'SWMM_REPORT':
                        simStore.setSwmmReport(data.text);
                        // Klartext-Report auch in den Solver-I/O-Inspektor (Tab „Ergebnisse")
                        resultFiles.value['swmm-report.rpt'] = data.text;
                        appendLog('[RESULT] SWMM-Report (.rpt) empfangen.');
                        break;

                    case 'COUPLING_BUDGET':
                        simStore.setCouplingBudget(data.data);
                        appendLog(`[RESULT] Kopplungsbilanz: 1D→2D ${data.data?.to2d?.toFixed(1)} m³, 2D→1D ${data.data?.to1d?.toFixed(1)} m³, Schuld ${data.data?.debt?.toFixed(3)} m³.`);
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

const runSimulation = async () => {
    if (isRunning.value) return;

    // Check Requirements
    if (!geoStore.terrain || !geoStore.terrain.gridData) {
        alert("Kein Terrain geladen! Bitte erst Terrain importieren.");
        return;
    }

    isRunning.value = true;
    simStore.setStatus('INITIALIZING');
    simStore.resetJob();
    logs.value = '';
    resultFiles.value = {};
    massReport.value = null;

    try {
        // Backend neu erstellen, wenn keins existiert oder der Modus gewechselt wurde
        if (!backend || backendMode !== simStore.solverMode) {
            if (backend) backend.dispose();
            backendMode = simStore.solverMode;
            backend = createSolverBackend(backendMode);
            backend.onEvent(handleSolverEvent);

            const engineLabel = {
                wasm: 'Classic WASM (Blackbox)',
                bmi: 'BMI (Frame-by-Frame)',
                runpod: 'RUNPOD Remote'
            }[backendMode] || backendMode;
            appendLog(`Engine: ${engineLabel}`);
        }

        // Safety Timeout — wird vom ersten SolverEvent gecleart
        initTimeout = setTimeout(() => {
            if (status.value === 'INITIALIZING') {
                appendLog("[TIMEOUT] Backend took too long to start. Check console/network.");
                simStore.setStatus('ERROR');
                isRunning.value = false;
                alert("Simulation Timed Out during Initialization.\nPlease check if 'lisflood.wasm' is loading correctly.");
            }
        }, 10000); // 10 seconds

        // Start Workflow (Backend emittiert STATUS READY → startPreparation)
        await backend.prepare();

    } catch (e) {
        console.error(e);
        simStore.setStatus('ERROR');
        appendLog(`Setup Error: ${e.message}`);
        isRunning.value = false;
    }
};

const abortSimulation = () => {
    if (backend) backend.abort();
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
        
        // 2. Weitere Modifikationen (bisher ausschließlich BUILDING) einsammeln
        if (geoStore.modifications) {
            geoStore.modifications.forEach(m => {
                if (m.type === 'BUILDING') buildingMods.push(m);
            });
        }

        // --- CHIRURGISCHER SCHNITT: Terrain bleibt unter Gebäuden flach (NoData) ---
        if (buildingMods.length > 0) {
            bakedTerrainData.gridData = Rasterizer.maskBuildingsAsNoData(bakedTerrainData.gridData, header, buildingMods);
        }
        // (Kein Export-Resampling mehr — Solver UND Viewer arbeiten in nativer DEM-Auflösung,
        //  daher passt die Wasserhaut-Geometrie automatisch zur Frame-Auflösung.)
    }

    // Vektor-Geometrien liest prepareResultData direkt aus dem echten geoStore (kanonische
    // GEO_FIELDS); nur das "gebackene" Terrain wird als Override übergeben → keine handgepflegte
    // Feldliste mehr (so ging zuvor bridges verloren).
    const ready = await prepareResultData(simStore, geoStore, { bciContent, terrainOverride: bakedTerrainData });
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
             assignments: hydStore.assignments,
             ganglinien: hydStore.ganglinien,
             globalRoughness: hydStore.globalRoughness,
             config: {
                 sim_time: simStore.simDuration || 3600,
                 initial_tstep: simStore.timeStep || 1.0
             },
             // Genauigkeit (High-End-Pfad) — wie startPreparation
             engine:          simStore.solverMode === 'runpod' ? 'v8' : 'v5',
             numericalScheme: simStore.solverMode === 'runpod' ? simStore.numericalScheme : 'acceleration',
             useGpu:          simStore.solverMode === 'runpod' ? simStore.useGpu : false,
             sgc: (simStore.solverMode === 'runpod' && simStore.sgcEnabled && bathyStore.channelPolyline.length >= 2)
                 ? { polyline: toRaw(bathyStore.channelPolyline), ...toRaw(bathyStore.channelParams) }
                 : null
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
        if (generator.warnings?.length) {
            console.warn(`⚠️ ${generator.warnings.length} Pipeline-Warnung(en):`);
            generator.warnings.forEach(w => console.warn('  •', w));
        }
        
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
    // ── Harter CFL-Gate ───────────────────────────────────────────────────────
    // Instabile Zeitschritte (dt > dt_max = cs/√(g·h)) erzeugen am Solver negative
    // Tiefen / NaN. Statt nur zu warnen (cflStatus-Chip) wird der Versand hier
    // blockiert; auf Wunsch dt auf 0.8·dt_max klemmen.
    const cfl = cflStatus.value;
    if (cfl.level === 'unstable' && cfl.dtMax) {
        const clampDt = Math.max(0.01, Math.floor(0.8 * cfl.dtMax * 100) / 100);
        const ok = confirm(
            `🔴 Instabiler Zeitschritt\n\n`
            + `dt = ${(simStore.timeStep || 1)} s überschreitet das CFL-Limit `
            + `(dt_max ≈ ${cfl.dtMax.toFixed(2)} s). Der Lauf erzeugt mit hoher `
            + `Wahrscheinlichkeit negative Tiefen / NaN.\n\n`
            + `OK → dt auf ${clampDt} s (0.8·dt_max) klemmen und fortfahren\n`
            + `Abbrechen → nichts senden`
        );
        if (!ok) { appendLog('🔴 CFL-Gate: Abbruch (dt über Limit).'); return; }
        simStore.timeStep = clampDt;
        appendLog(`✅ CFL-Gate: dt auf ${clampDt} s geklemmt (0.8·dt_max).`);
    }

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
             weirs:               geoStore.weirs   ? JSON.parse(JSON.stringify(geoStore.weirs))   : [],
             weirLines:           geoStore.weirLines ? JSON.parse(JSON.stringify(geoStore.weirLines)) : [],
             bridges:             geoStore.bridges ? JSON.parse(JSON.stringify(geoStore.bridges)) : [],
             infiltration:        surfaceStore.computeWeightedInfiltration?.() ?? 0,
             antecedentMoisture:  hydStore.antecedentMoisture ?? 0,
             globalBoundaryType:  hydStore.globalBoundaryType,
             globalBoundaryHfix:  hydStore.globalBoundaryHfix,

             // ── Genauigkeit (High-End-Pfad, nur runpod) ─────────────────
             engine:          simStore.solverMode === 'runpod' ? 'v8' : 'v5',
             numericalScheme: simStore.solverMode === 'runpod' ? simStore.numericalScheme : 'acceleration',
             useGpu:          simStore.solverMode === 'runpod' ? simStore.useGpu : false,
             sgc: (simStore.solverMode === 'runpod' && simStore.sgcEnabled && bathyStore.channelPolyline.length >= 2)
                 ? { polyline: JSON.parse(JSON.stringify(bathyStore.channelPolyline)),
                     ...JSON.parse(JSON.stringify(bathyStore.channelParams)) }
                 : null
          };

         // 2. Kanalnetz → BMI-Culverts (nur BMI-Worker simulation.bmi.js).
         //    Das Netz kommt AUSSCHLIESSLICH aus dem useNetworkStore („eine Geometrie,
         //    mehrere Kompilate"); der Legacy-geoStore-Pfad wurde 2026-07 entfernt.
         let activeCulverts = [];
         let dmgHeader = null;

         if (simStore.solverMode === 'bmi') {
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

             activeCulverts = buildBmiCulverts() ?? [];
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
             // Pipeline-Befunde mit Schweregrad sichtbar machen (NoData-Rescue,
             // Brücke↔SGC, fehlende Profile, ...).
             for (const it of gen.issues.issues) appendLog(`[${it.severity.toUpperCase()}] ${issueIcon(it.severity)} ${it.message}`);

             // Pre-Run-Gate: bei kritischen Problemen vor dem Upload bestätigen lassen.
             if (gen.issues.has(Severity.ERROR)) {
                 const blocking = [
                     ...gen.issues.bySeverity(Severity.ERROR),
                     ...gen.issues.bySeverity(Severity.WARN),
                 ];
                 const proceed = await openPreRunGate(blocking);
                 if (!proceed) {
                     appendLog('⏹️ Lauf abgebrochen (Pre-Run-Check) — bitte Eingaben korrigieren.');
                     simStore.setStatus('IDLE');
                     isRunning.value = false;
                     return;
                 }
                 appendLog('▶️ Trotz Warnungen fortgesetzt (Nutzerentscheidung).');
             }
         } catch (genErr) {
             throw new Error(`InputGenerator fehlgeschlagen: ${genErr.message}`);
         }

         // 3b. 1D/2D-Kopplung anreichern (nur runpod + Kanalnetz vorhanden; sonst unverändert).
         //     Alle Logik im Composable/Modul — hier nur Aufruf + Log.
         const coupled = augmentCoupledInputs(generatedFiles, { solverMode: simStore.solverMode });
         if (coupled.active) {
             generatedFiles = coupled.files;
             appendLog(`🔗 1D/2D-Kopplung aktiv: ${coupled.summary}.`);
         }
         for (const w of coupled.warnings) appendLog(`⚠️ ${w}`);

         // Set input files for the UI Inspector
         inputFiles.value = generatedFiles;

         // 4. An Backend übergeben (WASM-Worker oder RUNPOD — identisches Payload)
         if (backend) {
             await backend.run({
                files: generatedFiles,        // fertige LISFLOOD-Dateien (terrain.asc, run.par, etc.)
                scenarioData: {               // nur noch für BMI-Heartbeat-Daten (grid, header)
                    grid: { gridData: toRaw(geoStore.terrain?.gridData) }
                },
                // BMI-spezifisch: nur gesetzt wenn solverMode 'bmi'
                culverts: activeCulverts,
                header:   dmgHeader,
                maxTime:  simStore.simDuration || 3600
             });
             simStore.setStatus('RUNNING');
         } else {
             throw new Error("Backend not initialized!");
         }

    } catch (e) {
        console.error(e);
        appendLog(`[ERROR] Data Prep failed: ${e.message}`);
        simStore.setStatus('ERROR');
        isRunning.value = false;
    }
};

onUnmounted(() => {
    if (backend) {
        backend.dispose();
        backend = null;
        backendMode = null;
    }
});

</script>

<style scoped>
.flood-solver-container {
    padding: 1rem 1.25rem;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow-y: auto;
    background: var(--sv-bg);
    color: var(--sv-text);
    font-family: var(--sv-font);
}
.flood-solver-container h2 {
    margin: 0 0 1rem;
    font-size: 1rem;
    font-weight: 400;
    color: var(--sv-text-violet);
    text-shadow: var(--sv-glow-violet);
    text-transform: uppercase;
    letter-spacing: 1px;
}
/* Alle Checkboxen im Runner: Lime statt Browser-Blau */
.flood-solver-container input[type='checkbox'] {
    accent-color: var(--sv-lime);
}

.controls {
    margin: 1rem 0;
    display: flex;
    gap: 1rem;
    align-items: center;
}

.run-btn {
    padding: 0.75rem 1.5rem;
    background: #a3e635;
    color: #12121a;
    font-weight: 700;
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
    background: #b6f04d;
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
    color: var(--sv-text-dim);
    border: 1px solid var(--sv-border);
    border-radius: 4px;
    font-size: 1rem;
    font-family: var(--sv-font);
    cursor: pointer;
    transition: all 0.2s;
}
.dry-run-btn:hover {
    background: rgba(139, 92, 246, 0.15);
    color: var(--sv-text);
    border-color: var(--sv-violet);
}

.viewer-btn {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #6d43d4, #8b5cf6);
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
    background: var(--sv-surface);
    border: 1px solid var(--sv-border);
    border-radius: var(--sv-radius);
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
}
.sim-params h3 {
    margin: 0 0 0.75rem;
    font-size: 0.95rem;
    font-weight: 400;
    letter-spacing: 0.05em;
    color: var(--sv-text-lime);
    text-shadow: var(--sv-glow-lime);
}
.param-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem 1rem;
    align-items: center;
}
.param-grid label {
    font-size: 0.82rem;
    color: var(--sv-text-dim);
    white-space: nowrap;
}
.param-grid input[type='number'] {
    width: 100%;
    padding: 0.4rem 0.6rem;
    background: var(--sv-bg);
    color: var(--sv-text-lime);
    border: 1px solid var(--sv-border);
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: var(--sv-font);
    font-variant-numeric: tabular-nums;
}
.param-grid input[type='number']:focus {
    border-color: var(--sv-lime);
    outline: none;
    box-shadow: var(--sv-glow-lime);
}
.toggle-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.toggle-label {
    font-size: 0.8rem;
    color: var(--sv-text-dim);
}

/* BMI Dev-Switch */
.bmi-toggle-row {
    border-radius: 4px;
    padding: 0.25rem 0.4rem;
    transition: background 0.2s;
}
.bmi-toggle-row.bmi-active {
    background: rgba(139, 92, 246, 0.1);
    outline: 1px solid var(--sv-border);
}
.engine-select {
    width: 100%;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--sv-border);
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: var(--sv-font);
    background: var(--sv-bg);
    color: var(--sv-text);
}
.engine-select:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

/* ── Genauigkeit (High-End) ─────────────────────────────────────────────── */
.accuracy-section {
    margin-top: 0.75rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--sv-border);
    border-radius: 6px;
    background: rgba(139, 92, 246, 0.07);
}
.accuracy-header {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--sv-text-violet);
    margin-bottom: 0.5rem;
}
.param-hint {
    margin: 0.75rem 0 0;
    font-size: 0.78rem;
    color: var(--sv-text-dim);
}

/* ── Run Presets ─────────────────────────────────────────────────────────── */
.presets-row {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
}
.preset-btn {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--sv-border);
    border-radius: 6px;
    background: var(--sv-surface-2);
    color: var(--sv-text-dim);
    font-size: 0.82rem;
    font-family: var(--sv-font);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
}
.preset-btn:hover  { border-color: var(--sv-violet); color: var(--sv-text); box-shadow: var(--sv-glow-violet); }
.preset-btn.active { background: var(--sv-violet-dim); border-color: var(--sv-lime); color: #fff; }

/* ── CFL Chip ────────────────────────────────────────────────────────────── */
.dt-field {
    display: flex;
    align-items: center;
    gap: 6px;
}
.dt-field input { flex: 1; }
.cfl-chip {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 10px;
    white-space: nowrap;
}
.cfl-chip.stable   { background: rgba(39,174,96,.25);  color: #b6f04d; }
.cfl-chip.marginal { background: rgba(241,196,15,.25); color: #f1c40f; }
.cfl-chip.unstable { background: rgba(231,76,60,.25);  color: #e74c3c; }
.cfl-chip.unknown  { background: rgba(127,140,141,.2); color: #95a5a6; }

/* ── Mass Balance Badge ──────────────────────────────────────────────────── */
.mass-badge {
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 0.8rem;
    line-height: 1.5;
}
.mass-badge.good { background: rgba(39,174,96,.18);  border: 1px solid rgba(39,174,96,.4);  color: #b6f04d; }
.mass-badge.warn { background: rgba(241,196,15,.18); border: 1px solid rgba(241,196,15,.4); color: #f1c40f; }
.mass-badge.bad  { background: rgba(231,76,60,.18);  border: 1px solid rgba(231,76,60,.4);  color: #e74c3c; }

.status-indicator {
    font-weight: bold;
}

.success { color: #b6f04d; }
.error { color: #e74c3c; }
.warning { color: #f39c12; }

.logs-container {
    margin-top: 1.5rem;
    background: var(--sv-bg-2);
    color: var(--sv-text);
    border: 1px solid var(--sv-border);
    padding: 1rem;
    border-radius: var(--sv-radius);
    height: 400px;
    overflow-y: auto;
}
.logs-container h3 {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    font-weight: 400;
    letter-spacing: 0.05em;
    color: var(--sv-text-dim);
}

pre {
    margin: 0;
    font-family: var(--sv-font);
    white-space: pre-wrap;
    font-size: 0.85rem;
    color: var(--sv-text-lime);
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
    background: #b6f04d;
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
    background: #a3e635;
    color: #12121a;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.8rem;
}

.download-btn:hover {
    background: #219150;
}

/* ── Pre-Run-Gate ──────────────────────────────────────────────────────── */
.gate-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(8, 16, 24, 0.62);
    display: flex; align-items: center; justify-content: center;
    padding: 1.5rem;
}
.gate-modal {
    width: min(560px, 100%);
    background: var(--sv-bg-2); color: var(--sv-text);
    border: 1px solid var(--sv-border); border-radius: var(--sv-radius);
    box-shadow: 0 18px 50px rgba(0,0,0,.5), var(--sv-glow-violet);
    padding: 1.25rem 1.4rem;
    font-family: var(--sv-font);
}
.gate-header { display: flex; align-items: center; gap: 0.55rem; }
.gate-header h3 { margin: 0; font-size: 1.05rem; color: var(--sv-text-violet); }
.gate-icon { font-size: 1.3rem; }
.gate-sub { color: var(--sv-text-dim); font-size: 0.85rem; line-height: 1.5; margin: 0.6rem 0 0.8rem; }
/* Issue-Liste im Gate via wiederverwendbare <IssueList>-Komponente. */
.gate-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem; }
.gate-cancel, .gate-proceed {
    padding: 0.55rem 1rem; border-radius: 7px; font-size: 0.85rem; cursor: pointer;
    border: 1px solid transparent; font-family: var(--sv-font);
}
.gate-cancel  { background: var(--sv-surface-2); color: var(--sv-text); border-color: var(--sv-border); }
.gate-cancel:hover  { border-color: var(--sv-violet); box-shadow: var(--sv-glow-violet); }
.gate-proceed { background: var(--sv-violet-dim); color: #fff; }
.gate-proceed:hover { background: var(--sv-violet); box-shadow: var(--sv-glow-violet); }
</style>
