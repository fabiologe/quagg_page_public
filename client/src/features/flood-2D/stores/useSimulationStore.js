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

    function setResults(data) {
        results.value = data;
    }

    function setConfig(duration, step) {
        if (duration !== undefined) simDuration.value = duration;
        if (step !== undefined) timeStep.value = step;
    }

    // Baking State
    /** @type {import('vue').Ref<Float32Array|null>} */
    const raster = ref(null); // Baked result

    function setRaster(newRaster) {
        raster.value = newRaster;
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
        setResults,
        setResults,
        setConfig,

        // Baking
        raster,
        setRaster
    };
});
