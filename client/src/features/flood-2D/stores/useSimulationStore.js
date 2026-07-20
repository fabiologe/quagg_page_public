import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useSimulationStore = defineStore('simulation', () => {
    // UI State
    /** @type {import('vue').Ref<string>} */
    const activeTool = ref('SELECT'); // 'SELECT', 'DRAW', 'SHOVEL', ...

    /** @type {import('vue').Ref<string|null>} */
    const selection = ref(null); // ID of selected object

    // Simulation State
    /** @type {import('vue').Ref<'IDLE'|'PREPARING'|'RUNNING'|'COMPLETED'|'ERROR'>} */
    const status = ref('IDLE');

    /** @type {import('vue').Ref<number>} */
    const progress = ref(0); // 0-100

    /** @type {import('vue').Ref<string[]>} */
    const logs = ref([]);

    /** @type {import('vue').Ref<any>} */
    const results = ref(null);

    // Config
    /** @type {import('vue').Ref<number>} */
    const simDuration = ref(3600); // seconds

    /** @type {import('vue').Ref<number>} */
    const timeStep = ref(1.0); // Delta T

    /** @type {import('vue').Ref<number>} */
    const saveInterval = ref(60.0); // Output interval (seconds)

    /** @type {import('vue').Ref<number>} */
    const massInterval = ref(60.0); // Mass balance check interval (seconds)

    /** @type {import('vue').Ref<boolean>} */
    const useAcceleration = ref(true); // Acceleration solver flag

    /**
     * Solver-Ausführungspfad:
     *   'wasm'   — produktiver Blackbox-Worker (simulation.main.js)
     *   'bmi'    — experimenteller Frame-by-Frame-Worker (simulation.bmi.js)
     *   'runpod' — Remote-Lauf auf RUNPOD (LISFLOOD 8.2); ohne API-Key → Mock
     * @type {import('vue').Ref<'wasm'|'bmi'|'runpod'>}
     */
    const solverMode = ref('wasm');

    /**
     * Rückwärtskompatibler Alias (alte Projekt-Dateien):
     * true ⇔ solverMode === 'bmi'.
     */
    const useBmiSolver = computed({
        get: () => solverMode.value === 'bmi',
        set: (v) => { solverMode.value = v ? 'bmi' : 'wasm'; }
    });

    // ── Genauigkeits-Settings (High-End-Pfad, nur solverMode 'runpod') ───────
    // (Export-Zellweite entfernt — Solver rechnet immer in nativer DEM-Auflösung.)
    /** Numerisches Schema für LISFLOOD 8: 'acceleration' | 'fv1' | 'dg2'. SGC erzwingt acceleration. */
    const numericalScheme = ref('acceleration');
    /** Sub-Grid-Channel-Export der gezeichneten Kanal-Mittellinie. */
    const sgcEnabled = ref(false);
    /** GPU/CUDA nutzen (nur wirksam mit fv1/dg2; acceleration+SGC laufen CPU). Setzt `cuda` in run.par. */
    const useGpu = ref(false);

    // ── Remote-Job-State (nur für solverMode 'runpod' relevant) ──────────────
    /** @type {import('vue').Ref<string|null>} */
    const jobId = ref(null);
    /** @type {import('vue').Ref<'idle'|'uploading'|'queued'|'running'|'downloading'|'done'|'error'>} */
    const jobPhase = ref('idle');
    /** @type {import('vue').Ref<string|null>} */
    const jobError = ref(null);

    function setJobState({ jobId: id, phase, error } = {}) {
        if (id !== undefined) jobId.value = id;
        if (phase !== undefined) jobPhase.value = phase;
        if (error !== undefined) jobError.value = error;
    }

    function resetJob() {
        jobId.value = null;
        jobPhase.value = 'idle';
        jobError.value = null;
    }

    // Actions
    function setActiveTool(tool) {
        activeTool.value = tool;
    }

    function setSelection(id) {
        selection.value = id;
    }

    function setStatus(newStatus) {
        status.value = newStatus;
    }

    function setProgress(value) {
        progress.value = value;
    }

    function addLog(message) {
        logs.value.push(message);
    }

    function clearLogs() {
        logs.value = [];
    }

    /** @type {import('vue').Ref<Map<number, Float32Array>>} */
    const resultFrames = ref(new Map());

    /** Velocity magnitude per frame: frameId → Float32Array sqrt(Vx²+Vy²) */
    const velocityFrames = ref(new Map());

    /** Velocity vector components per frame: frameId → { vx: Float32Array, vy: Float32Array } */
    const velocityVectorFrames = ref(new Map());

    /** Edge-flux components per frame (.Qx/.Qy, Zellzentren): frameId → { qx, qy }.
     * Basis für den Wehr-Durchfluss (useWeirResults). Nur RunPod/LISFLOOD-8 liefert sie. */
    const qFluxFrames = ref(new Map());

    /** Max water depth grid from res.max (written at end of simulation) */
    const maxDepthGrid = ref(null);

    /** Max hazard grid from res.maxHaz (depth × velocity, written at end) */
    const maxHazardGrid = ref(null);

    /** Water surface elevation per frame (mNHN): frameId → Float32Array (.elev) */
    const elevFrames = ref(new Map());

    /** Max velocity grid |v| from res.maxVx/.maxVy (written at end) */
    const maxVelocityGrid = ref(null);

    /** Max water surface elevation grid from res.mxe (written at end) */
    const maxElevGrid = ref(null);

    /** Inundation arrival time grid from res.inittm (written at end) */
    const arrivalTimeGrid = ref(null);

    /** Inundation duration grid from res.totaltm (written at end) */
    const durationGrid = ref(null);

    /** 1D-Kanalnetz-Ergebnisse (gekoppelter SWMM-Lauf, aus der .out via handler.py):
     * { reportStep, times[s], nodes:{id:{type,invert,maxDepth,depth[],head[],volume[],
     *   totalInflow[],flooding[]}}, links:{id:{type,maxDepth,length,flow[],depth[],
     *   velocity[],volume[],capacity[]}}, system:{inflow[],flooding[],outflow[],storedVolume[]} } */
    const networkResults = ref(null);

    /** Kopplungsbudget aus den [COUPLE]-Finalize-Zeilen (coupling.cpp):
     * { to2d, to1d, debt, nodes:{id:{kind,to2d,to1d}} } — Volumina in m³ */
    const couplingBudget = ref(null);

    /** 2D-Massenbilanz (res.mass via handler.py MassTail):
     * { headers, rows, summary, maxError } — bisher nur Runner-Badge, jetzt auch Viewer */
    const massReport = ref(null);

    /** SWMM-.rpt als Klartext (gekoppelter Lauf): Kontinuitätsfehler, Warnungen,
     * Peak-Tabellen — wichtigste 1D-Plausibilitätszahlen. */
    const swmmReport = ref(null);

    /** @type {import('vue').Ref<number>} */
    const currentFrameIndex = ref(-1);

    /** @type {import('vue').Ref<any>} */
    const resultHeader = ref(null);

    function addResultFrame(frameId, data, header, min, max) {
        resultFrames.value.set(frameId, data);
        if (!resultHeader.value) resultHeader.value = header;
        if (max !== undefined && max > maxWaterDepth.value) {
            maxWaterDepth.value = max;
        }
        currentFrameIndex.value = frameId;
    }

    function addVelocityFrame(frameId, magnitudeData) {
        velocityFrames.value.set(frameId, magnitudeData);
    }

    function addVelocityVectorFrame(frameId, vx, vy) {
        velocityVectorFrames.value.set(frameId, { vx, vy });
    }

    function addQFluxFrame(frameId, qx, qy) {
        qFluxFrames.value.set(frameId, { qx, qy });
    }

    function addElevFrame(frameId, data) {
        elevFrames.value.set(frameId, data);
    }

    function setNetworkResults(data) { networkResults.value = data; }
    function setCouplingBudget(data) { couplingBudget.value = data; }
    function setMassReport(data) { massReport.value = data; }
    function setSwmmReport(text) { swmmReport.value = text; }

    function setMaxDepthGrid(data) { maxDepthGrid.value = data; }
    function setMaxHazardGrid(data) { maxHazardGrid.value = data; }
    function setMaxVelocityGrid(data) { maxVelocityGrid.value = data; }
    function setMaxElevGrid(data) { maxElevGrid.value = data; }
    function setArrivalTimeGrid(data) { arrivalTimeGrid.value = data; }
    function setDurationGrid(data) { durationGrid.value = data; }

    function clearResults() {
        resultFrames.value.clear();
        velocityFrames.value.clear();
        velocityVectorFrames.value.clear();
        qFluxFrames.value.clear();
        elevFrames.value.clear();
        currentFrameIndex.value = -1;
        resultHeader.value = null;
        maxWaterDepth.value = 0;
        maxDepthGrid.value = null;
        maxHazardGrid.value = null;
        maxVelocityGrid.value = null;
        maxElevGrid.value = null;
        arrivalTimeGrid.value = null;
        durationGrid.value = null;
        networkResults.value = null;
        couplingBudget.value = null;
        massReport.value = null;
        swmmReport.value = null;
    }

    /** @type {import('vue').Ref<number>} */
    const maxWaterDepth = ref(0);

    const totalFrameCount = computed(() => resultFrames.value.size);

    function setConfig(duration, step) {
        if (duration !== undefined) simDuration.value = duration;
        if (step !== undefined) timeStep.value = step;
    }

    function setFullConfig(cfg) {
        if (cfg.simDuration !== undefined) simDuration.value = cfg.simDuration;
        if (cfg.timeStep !== undefined) timeStep.value = cfg.timeStep;
        if (cfg.saveInterval !== undefined) saveInterval.value = cfg.saveInterval;
        if (cfg.massInterval !== undefined) massInterval.value = cfg.massInterval;
        if (cfg.useAcceleration !== undefined) useAcceleration.value = cfg.useAcceleration;
        if (cfg.solverMode !== undefined) solverMode.value = cfg.solverMode;
        else if (cfg.useBmiSolver !== undefined) useBmiSolver.value = cfg.useBmiSolver; // Legacy-Projekte
        if (cfg.numericalScheme !== undefined) numericalScheme.value = cfg.numericalScheme;
        if (cfg.sgcEnabled !== undefined) sgcEnabled.value = cfg.sgcEnabled;
        if (cfg.useGpu !== undefined) useGpu.value = cfg.useGpu;
    }

    // NEW: Multi-select support
    /** @type {import('vue').Ref<Set<string>>} */
    const multiSelection = ref(new Set());

    function addToSelection(id) {
        multiSelection.value.add(id);
    }

    function toggleSelection(id) {
        if (multiSelection.value.has(id)) {
            multiSelection.value.delete(id);
        } else {
            multiSelection.value.add(id);
        }
    }

    function clearSelection() {
        selection.value = null; // Clear single
        multiSelection.value.clear(); // Clear multi
    }

    return {
        // State
        activeTool,
        selection,
        status,
        progress,
        logs,
        results,
        simDuration,
        timeStep,
        saveInterval,
        massInterval,
        useAcceleration,
        solverMode,
        useBmiSolver,
        numericalScheme,
        sgcEnabled,
        useGpu,
        jobId,
        jobPhase,
        jobError,
        setJobState,
        resetJob,

        // Actions
        setActiveTool,
        setSelection,
        setStatus,
        setProgress,
        addLog,
        clearLogs,
        setResults: (val) => { results.value = val; },
        setConfig,
        setFullConfig,

        // NEW: Exports
        multiSelection,
        addToSelection,
        toggleSelection,
        clearSelection,

        // Result Data
        resultFrames,
        velocityFrames,
        velocityVectorFrames,
        qFluxFrames,
        elevFrames,
        maxDepthGrid,
        maxHazardGrid,
        maxVelocityGrid,
        maxElevGrid,
        arrivalTimeGrid,
        durationGrid,
        networkResults,
        couplingBudget,
        massReport,
        swmmReport,
        setNetworkResults,
        setCouplingBudget,
        setMassReport,
        setSwmmReport,
        currentFrameIndex,
        resultHeader,
        addResultFrame,
        addVelocityFrame,
        addVelocityVectorFrame,
        addQFluxFrame,
        addElevFrame,
        setMaxDepthGrid,
        setMaxHazardGrid,
        setMaxVelocityGrid,
        setMaxElevGrid,
        setArrivalTimeGrid,
        setDurationGrid,
        clearResults,
        maxWaterDepth,
        totalFrameCount
    };
});
