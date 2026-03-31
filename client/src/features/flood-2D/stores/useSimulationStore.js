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
     * Dev-Switch: Nutze den experimentellen BMI-WebWorker (simulation.bmi.js)
     * statt des produktiven Blackbox-Workers (simulation.main.js).
     * Standard: false (produktiver Modus).
     * @type {import('vue').Ref<boolean>}
     */
    const useBmiSolver = ref(false);

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

    /** @type {import('vue').Ref<number>} */
    const currentFrameIndex = ref(-1);

    /** @type {import('vue').Ref<any>} */
    const resultHeader = ref(null);

    function addResultFrame(frameId, data, header, min, max) {
        resultFrames.value.set(frameId, data);
        if (!resultHeader.value) resultHeader.value = header;
        // Track global max depth across all frames
        if (max !== undefined && max > maxWaterDepth.value) {
            maxWaterDepth.value = max;
        }
        // Auto-advance to latest
        currentFrameIndex.value = frameId;
    }

    function clearResults() {
        resultFrames.value.clear();
        currentFrameIndex.value = -1;
        resultHeader.value = null;
        maxWaterDepth.value = 0;
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
        if (cfg.useBmiSolver !== undefined) useBmiSolver.value = cfg.useBmiSolver;
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
        useBmiSolver,

        // Actions
        setActiveTool,
        setSelection,
        setStatus,
        setProgress,
        addLog,
        clearLogs,
        // addResultFrame, // Disabled per user request
        // clearResults,   // Disabled per user request
        setResults: (val) => { results.value = val; }, // Fixed: Inline definition or restore
        setConfig,

        // NEW: Exports
        multiSelection,
        addToSelection,
        toggleSelection,
        clearSelection,

        // Result Data
        resultFrames,
        currentFrameIndex,
        resultHeader,
        addResultFrame,
        clearResults,
        maxWaterDepth,
        totalFrameCount
    };
});
