import { SolverBackend } from './SolverBackend.js';

/**
 * WasmWorkerBackend — dünner Wrapper um die bestehenden WASM-Worker.
 * mode 'wasm' → simulation.main.js (Classic/Blackbox)
 * mode 'bmi'  → simulation.bmi.js  (Frame-by-Frame, abort-fähig)
 *
 * Worker-Messages werden unverändert als SolverEvents durchgereicht.
 */
export class WasmWorkerBackend extends SolverBackend {
    constructor(mode = 'wasm') {
        super();
        this.mode = mode;
        this.worker = null;
    }

    async prepare() {
        if (this.worker) {
            // Re-Run mit bestehendem Worker: erneut initialisieren → STATUS READY
            this.worker.postMessage({ cmd: 'CMD_INIT' });
            return;
        }

        // Vite braucht literale new URL(...)-Ausdrücke fürs Worker-Bundling.
        const workerUrl = this.mode === 'bmi'
            ? new URL('../../middleware/simulation.bmi.js', import.meta.url)
            : new URL('../../middleware/simulation.main.js', import.meta.url);

        this.worker = new Worker(workerUrl, { type: 'module' });

        this.worker.onmessage = (e) => this.emit(e.data);
        this.worker.onerror = (e) => {
            const msg = e.message || e.filename || 'Worker failed to start (possible import/parse error)';
            const file = e.filename ? e.filename.split('/').pop() : 'unknown file';
            this.emit({ type: 'ERROR', error: `${msg} (${file}:${e.lineno ?? '?'})` });
            e.preventDefault();
        };
        this.worker.onmessageerror = () => {
            this.emit({ type: 'ERROR', error: 'Message serialization error in worker.' });
        };

        this.worker.postMessage({ cmd: 'CMD_INIT' });
    }

    async run(payload) {
        if (!this.worker) throw new Error('Worker not initialized — call prepare() first.');
        this.worker.postMessage({ cmd: 'CMD_RUN', payload });
    }

    async abort() {
        if (!this.worker) return;
        // BMI-Worker: erst abort-Signal, damit _bmi_finalize() sauber läuft,
        // dann mit kleinem Verzug terminieren als Fallback.
        this.worker.postMessage({ type: 'abort' });
        const w = this.worker;
        this.worker = null;
        setTimeout(() => w.terminate(), 500);
    }

    dispose() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
