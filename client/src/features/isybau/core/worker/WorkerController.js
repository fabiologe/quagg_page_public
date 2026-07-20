/**
 * Controller for the SWMM Wasm Worker.
 * Handles serialization of Store data and Promise-based communication.
 *
 * Single-Task-Design: es läuft immer höchstens eine Simulation. Ein zweiter
 * Aufruf während eines laufenden Runs wird abgewiesen statt das Promise des
 * ersten stillschweigend zu verwaisen.
 */

// Harte Obergrenze pro Simulationslauf — ein hängender/instabiler SWMM-Run
// darf die UI nicht ewig auf 'running' stehen lassen.
const RUN_TIMEOUT_MS = 5 * 60 * 1000;

export class WorkerController {
    constructor() {
        this.worker = null;
        this.currentTask = null;
        this.timeoutHandle = null;
    }

    init() {
        if (!this.worker) {
            // In Vite, new Worker(new URL(...)) is standard
            this.worker = new Worker(new URL('../../utils/swmmWasmWorker.js', import.meta.url), { type: 'module' });

            this.worker.onmessage = (e) => this.handleMessage(e);
            // Unbehandelte Worker-Fehler (Ladefehler, WASM-Abort) müssen das
            // laufende Promise rejecten, sonst hängt die Simulation für immer.
            this.worker.onerror = (e) => {
                console.error("Worker crashed:", e.message || e);
                this.failCurrentTask(new Error(e.message || 'Worker-Fehler (Absturz beim Simulationslauf)'));
            };
            this.worker.postMessage({ command: 'INIT' });
        }
    }

    handleMessage(e) {
        const { command, results, message } = e.data;

        if (command === 'COMPLETE') {
            this.settleCurrentTask(task => task.resolve(results));
        } else if (command === 'ERROR') {
            console.error("Worker Error:", message);
            this.failCurrentTask(new Error(message));
        } else if (command === 'INIT_SUCCESS') {
            console.log("Worker initialized successfully");
        }
    }

    settleCurrentTask(settle) {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
        if (this.currentTask) {
            const task = this.currentTask;
            this.currentTask = null;
            settle(task);
        }
    }

    failCurrentTask(error) {
        this.settleCurrentTask(task => task.reject(error));
    }

    get isBusy() {
        return this.currentTask !== null;
    }

    /**
     * Runs the simulation.
     * @param {Object} payload - The serialized simulation data {nodes, edges, options}
     * @returns {Promise}
     */
    runSimulation(payload) {
        if (this.isBusy) {
            return Promise.reject(new Error('Es läuft bereits eine Simulation.'));
        }
        if (!this.worker) this.init();

        return new Promise((resolve, reject) => {
            this.currentTask = { resolve, reject };

            this.timeoutHandle = setTimeout(() => {
                this.failCurrentTask(new Error(`Simulation nach ${RUN_TIMEOUT_MS / 60000} min abgebrochen (Timeout) — Modell auf Instabilitäten prüfen.`));
                // Worker steckt vermutlich in einer Endlosschleife — neu aufsetzen
                this.terminate();
            }, RUN_TIMEOUT_MS);

            // Der Worker queued RUN intern hinter die WASM-Initialisierung
            // (initModule-Promise), daher ist kein Warten auf INIT_SUCCESS nötig.
            this.worker.postMessage({
                command: 'RUN',
                data: payload
            });
        });
    }

    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.failCurrentTask(new Error('Simulation abgebrochen.'));
    }
}
