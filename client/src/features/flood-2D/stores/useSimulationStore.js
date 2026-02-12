import { defineStore } from 'pinia';
import { ref } from 'vue';

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

    function addResultFrame(frameId, data, header) {
        resultFrames.value.set(frameId, data);
        if (!resultHeader.value) resultHeader.value = header;
        // Auto-advance to latest
        currentFrameIndex.value = frameId;
    }

    function clearResults() {
        resultFrames.value.clear();
        currentFrameIndex.value = -1;
        resultHeader.value = null;
    }

    function setConfig(duration, step) {
        if (duration !== undefined) simDuration.value = duration;
        if (step !== undefined) timeStep.value = step;
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
        // resultFrames,     // Disabled
        // currentFrameIndex,// Disabled
        // resultHeader      // Disabled
    };
});
