/**
 * Führt den ECHTEN Worker-Code (utils/swmmWasmWorker.js → SwmmBuilder → WASM-SWMM
 * → RptParser/SwmmOutParser/ResultsAssembler) im Testprozess aus. Ersetzt wird
 * nur die Web-Worker-Grenze, die Node nicht hat.
 *
 * Einbinden im Test (vi.mock wird hochgezogen, daher der dynamische Import):
 *   vi.mock('../core/worker/WorkerController.js', async () => ({
 *       WorkerController: (await import('./helpers/workerImProzess.js')).WorkerImProzess
 *   }));
 */
import { JSDOM } from 'jsdom';

// xmlParser.js braucht DOMParser (im Browser vorhanden, in Node nicht).
if (!globalThis.DOMParser) globalThis.DOMParser = new JSDOM('').window.DOMParser;

let offen = null;
globalThis.self = {
    postMessage(msg) {
        if (!offen) return;
        if (msg.command === 'COMPLETE') { offen.resolve(msg.results); offen = null; }
        else if (msg.command === 'ERROR') {
            const err = new Error(msg.message);
            if (msg.details) err.details = msg.details; // wie WorkerController.handleMessage
            offen.reject(err);
            offen = null;
        }
    }
};
await import('../../utils/swmmWasmWorker.js');

export class WorkerImProzess {
    /** wie WorkerController.terminate: offene Aufgabe als abgebrochen beenden */
    terminate() {
        if (!offen) return;
        const err = new Error('Simulation abgebrochen.');
        err.abgebrochen = true;
        offen.reject(err);
        offen = null;
    }

    /** Letzte übergebene Nutzlast — für Tests, die prüfen, was die Oberfläche schickt. */
    static letzteNutzlast = null;

    async runSimulation(payload) {
        WorkerImProzess.letzteNutzlast = payload;
        return new Promise((resolve, reject) => {
            offen = { resolve, reject };
            self.onmessage({ data: { command: 'RUN', data: payload } });
        });
    }
}
