/**
 * SolverBackend — gemeinsames Interface für alle Solver-Ausführungspfade:
 *   - WasmWorkerBackend  (lokal, simulation.main.js)
 *   - RunpodBackend      (remote, LISFLOOD 8.2 auf RUNPOD Serverless)
 *
 * Das Event-Vokabular entspricht 1:1 den bisherigen Worker-Messages, sodass
 * Flood2DSolverRunner.vue seinen bestehenden Message-Switch unverändert
 * weiterverwenden kann. Remote-Backends übersetzen ihren Job-Lifecycle in
 * dieselben Events.
 *
 * @typedef {(
 *   {type:'STATUS', status:'READY'|'IDLE'|'RUNNING'|'FINISHED'} |
 *   {type:'PROGRESS_UPDATE', time:number} |
 *   {type:'LOG'|'STDOUT'|'STDERR', text:string} |
 *   {type:'WARNING', message?:string, text?:string} |
 *   {type:'INPUT_FILES', files:Object<string,string>} |
 *   {type:'RESULT', frame:number, payload:Float32Array, header:Object,
 *    min?:number, max?:number, velocity?:Float32Array, vx?:Float32Array, vy?:Float32Array} |
 *   {type:'MAX_DEPTH_GRID', payload:Float32Array, header?:Object} |
 *   {type:'MAX_HAZARD_GRID', payload:Float32Array, header?:Object} |
 *   {type:'MASS_REPORT', data:Object} |
 *   {type:'JOB_STATE', jobId:string|null,
 *    phase:'idle'|'uploading'|'queued'|'running'|'downloading'|'done'|'error'} |
 *   {type:'ERROR', error:string}
 * )} SolverEvent
 *
 * @typedef {{
 *   files: Object<string,string>,
 *   scenarioData: Object,
 *   maxTime: number
 * }} RunPayload
 */
export class SolverBackend {
    constructor() {
        /** @type {(e: SolverEvent) => void} */
        this._handler = () => {};
    }

    /** Einzelner Event-Subscriber (der Runner). */
    onEvent(handler) {
        this._handler = typeof handler === 'function' ? handler : () => {};
    }

    /** @param {SolverEvent} event */
    emit(event) {
        try {
            this._handler(event);
        } catch (e) {
            console.error('[SolverBackend] Event-Handler warf Fehler:', e);
        }
    }

    /** Initialisierung (entspricht CMD_INIT). Muss STATUS READY emittieren. */
    async prepare() { throw new Error('prepare() not implemented'); }

    /**
     * Startet einen Lauf. Resolved sobald der Lauf ANGENOMMEN wurde
     * (nicht erst bei Abschluss) — Fortschritt/Ergebnis kommen als Events.
     * @param {RunPayload} payload
     */
    // eslint-disable-next-line no-unused-vars
    async run(payload) { throw new Error('run() not implemented'); }

    /** Lauf sauber abbrechen. */
    async abort() {}

    /** Ressourcen freigeben (Worker terminieren, Polling stoppen). */
    dispose() {}
}
