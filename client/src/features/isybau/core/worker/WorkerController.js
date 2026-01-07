/**
 * Controller for the SWMM Wasm Worker.
 * Handles serialization of Store data and Promise-based communication.
 */
export class WorkerController {
    constructor() {
        this.worker = null;
        this.callbacks = new Map(); // id -> {resolve, reject}
    }

    init() {
        if (!this.worker) {
            // Assume the worker file is accessible via URL or bundler
            // In Vite, new Worker(new URL(...)) is standard
            this.worker = new Worker(new URL('../../utils/swmmWasmWorker.js', import.meta.url), { type: 'module' });

            this.worker.onmessage = (e) => this.handleMessage(e);
            this.worker.postMessage({ command: 'INIT' });
        }
    }

    handleMessage(e) {
        const { command, results, message } = e.data;

        // For simple single-task worker usage
        if (command === 'COMPLETE') {
            if (this.currentTask) {
                this.currentTask.resolve(results);
                this.currentTask = null;
            }
        } else if (command === 'ERROR') {
            if (this.currentTask) {
                this.currentTask.reject(new Error(message));
                this.currentTask = null;
            }
            console.error("Worker Error:", message);
        } else if (command === 'INIT_SUCCESS') {
            console.log("Worker initialized successfully");
        }
    }

    /**
     * Runs the simulation.
     * @param {Object} payload - The serialized simulation data {nodes, edges, options}
     * @returns {Promise}
     */
    runSimulation(payload) {
        if (!this.worker) this.init();

        return new Promise((resolve, reject) => {
            this.currentTask = { resolve, reject };

            this.worker.postMessage({
                command: 'RUN',
                data: payload // Payload is already serialized by Store
            });
        });
    }

    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
