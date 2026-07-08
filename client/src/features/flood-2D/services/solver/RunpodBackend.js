import { SolverBackend } from './SolverBackend.js';
import { decodeFrame } from './resultCodec.js';

/**
 * RunpodBackend — führt einen Lauf auf einem RUNPOD-Serverless-Endpoint aus
 * (LISFLOOD 8.2, später). Übersetzt den Remote-Job-Lifecycle in das kanonische
 * SolverEvent-Vokabular, sodass der Runner keinen Unterschied zum WASM-Pfad sieht.
 *
 * Lifecycle: upload (gzip+base64) → /run → poll /stream → Frames binär laden
 * → RESULT-Events → done → MAX-Grids + MASS_REPORT + STATUS FINISHED.
 *
 * Der Transport ist injizierbar: createRunpodTransport (echt) oder
 * createMockRunpodTransport (Frontend-only, heute testbar).
 */

const POLL_INTERVAL_MS = 2000;
const POLL_BACKOFF_MAX_MS = 10000;
// Aktivitäts-Timeout: maxTime ist SIM-Zeit, die Wall-Zeit kann sie auf großen
// Grids weit übersteigen. Abgebrochen wird nur, wenn der Server längere Zeit
// KEINE Events mehr liefert (Heartbeat = progress alle ~2 Sim-Sekunden),
// plus ein absolutes Sicherheits-Cap.
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;  // 15 min ohne Events → tot
const ABSOLUTE_DEADLINE_MS = 24 * 60 * 60 * 1000;  // 24 h Hard-Cap

// Text → gzip+base64 (Browser CompressionStream); Fallback: unkomprimiert
async function encodeFile(text) {
    if (typeof CompressionStream === 'undefined') {
        return { encoding: 'text', data: text };
    }
    const cs = new CompressionStream('gzip');
    const stream = new Blob([text]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    const CHUNK = 0x8000; // String.fromCharCode-Limit umgehen
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return { encoding: 'gzip+base64', data: btoa(bin) };
}

export class RunpodBackend extends SolverBackend {
    /**
     * @param {{ transport: Object, pollIntervalMs?: number }} options
     */
    constructor({ transport, pollIntervalMs = POLL_INTERVAL_MS }) {
        super();
        this.transport = transport;
        this.pollIntervalMs = pollIntervalMs;
        this.jobId = null;
        this.polling = false;
        this.disposed = false;
    }

    setJobState(phase) {
        this.emit({ type: 'JOB_STATE', jobId: this.jobId, phase });
    }

    async prepare() {
        if (!this.transport) throw new Error('RunpodBackend: kein Transport konfiguriert.');
        this.emit({ type: 'STATUS', status: 'READY' });
    }

    async run(payload) {
        const { files, maxTime } = payload;
        if (!files || Object.keys(files).length === 0) {
            throw new Error('RunpodBackend: keine Input-Dateien im Payload.');
        }

        // 1. Upload-Encoding
        this.setJobState('uploading');
        this.emit({ type: 'LOG', text: `RUNPOD: ${Object.keys(files).length} Input-Dateien werden komprimiert...` });
        const encoded = {};
        for (const [name, content] of Object.entries(files)) {
            encoded[name] = await encodeFile(content);
        }

        // 2. Job anlegen (clientJobToken = Idempotenz-Schutz gegen Doppel-Submits)
        const input = {
            version: 'lisflood-8.0.3',
            files: encoded,
            maxTime: maxTime || 3600,
            deliver: 'urls',
            clientJobToken: (crypto.randomUUID?.() ?? `job-${Date.now()}`)
        };
        const res = await this.transport.runJob(input);
        this.jobId = res.id;
        this.setJobState('queued');
        this.emit({ type: 'LOG', text: `RUNPOD: Job ${res.id} angenommen (${res.status}).` });
        this.emit({ type: 'STATUS', status: 'RUNNING' });

        // 3. Poll-Loop (nicht awaiten — run() resolved bei Annahme)
        this._pollLoop(maxTime || 3600).catch(err => {
            if (this.disposed) return;
            this.setJobState('error');
            this.emit({ type: 'ERROR', error: `RUNPOD-Polling fehlgeschlagen: ${err.message}` });
        });
    }

    async _pollLoop(maxTimeSec) {
        this.polling = true;
        const startedAt = Date.now();
        let lastActivity = Date.now();
        let interval = this.pollIntervalMs;
        let running = false;

        while (this.polling && !this.disposed) {
            if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
                await this.transport.cancel(this.jobId).catch(() => {});
                throw new Error(`Keine Server-Events seit ${INACTIVITY_TIMEOUT_MS / 60000} min (Job ${this.jobId}).`);
            }
            if (Date.now() - startedAt > ABSOLUTE_DEADLINE_MS) {
                await this.transport.cancel(this.jobId).catch(() => {});
                throw new Error(`Zeitlimit überschritten (Job ${this.jobId}).`);
            }

            // Transiente Poll-Fehler (Server kurz überlastet/Netz weg) NICHT fatal werten:
            // der Job läuft serverseitig weiter. Weiterpollen bis zur Inaktivitäts-Deadline;
            // nur echte 4xx (Job unbekannt → fatal-Flag vom Transport) brechen sofort ab.
            let chunk;
            try {
                chunk = await this.transport.streamChunks(this.jobId);
            } catch (e) {
                if (e.fatal) throw e;
                this.emit({ type: 'WARNING', message: `Polling gestört (Job läuft weiter): ${e.message}` });
                await new Promise(r => setTimeout(r, interval));
                interval = Math.min(interval * 1.5, POLL_BACKOFF_MAX_MS);
                continue; // lastActivity läuft weiter → Inaktivitäts-Deadline greift irgendwann
            }

            if (!running && chunk.status === 'IN_PROGRESS') {
                running = true;
                this.setJobState('running');
            }
            if ((chunk.stream || []).length > 0) {
                lastActivity = Date.now();
                interval = this.pollIntervalMs; // Events fließen → wieder dichter pollen
            }

            for (const item of (chunk.stream || [])) {
                await this._handleOutput(item.output);
            }

            if (chunk.status === 'COMPLETED') {
                // Rest-Events abholen, falls der letzte Chunk parallel ankam
                const rest = await this.transport.streamChunks(this.jobId);
                for (const item of (rest.stream || [])) await this._handleOutput(item.output);
                this.polling = false;
                return;
            }
            if (chunk.status === 'FAILED' || chunk.status === 'CANCELLED') {
                const st = await this.transport.getStatus(this.jobId).catch(() => null);
                this.polling = false;
                if (chunk.status === 'FAILED') {
                    this.setJobState('error');
                    this.emit({ type: 'ERROR', error: st?.error || `RUNPOD-Job ${chunk.status}.` });
                }
                return;
            }

            await new Promise(r => setTimeout(r, interval));
            interval = Math.min(interval * 1.5, POLL_BACKOFF_MAX_MS); // Backoff
        }
    }

    /** Einzelnes Stream-Event des Handlers in SolverEvents übersetzen. */
    async _handleOutput(output) {
        if (!output || this.disposed) return;
        switch (output.event) {
            case 'progress':
                this.emit({ type: 'PROGRESS_UPDATE', time: output.time });
                break;

            case 'log':
                this.emit({ type: 'LOG', text: output.text });
                break;

            case 'warning':
                this.emit({ type: 'WARNING', message: output.text });
                break;

            case 'frame': {
                // KANAL-SEMANTIK (ent-staggert in handler.py, Einheiten):
                //   depth  [m]    Wassertiefe (NoData→0)
                //   elev   [m]    Wasserspiegel (absolut, m NHN)
                //   vx,vy  [m/s]  Geschwindigkeit auf Zellzentren; im Gerinne/Brücke vom
                //                 SGC-Kanalwert überschrieben (handler.py: |v_sgc|>eps)
                //   qx,qy  [m³/s] Kantenfluss-Normalkomponenten (für Wehr-Durchfluss)
                // 'velocity' liefert der Solver nicht als eigenen Kanal — Betrag = |(vx,vy)|.
                const buf = await this.transport.fetchBinary(output.url);
                const { meta, channels } = decodeFrame(buf);
                const header = this._headerFromMeta(meta);
                let velocity = channels.velocity;
                if (!velocity && channels.vx && channels.vy) {
                    velocity = new Float32Array(channels.vx.length);
                    for (let i = 0; i < velocity.length; i++) {
                        velocity[i] = Math.hypot(channels.vx[i], channels.vy[i]);
                    }
                }
                this.emit({
                    type: 'RESULT',
                    frame: output.frame ?? meta.frame,
                    payload: channels.depth,
                    header,
                    min: output.min ?? meta.min,
                    max: output.max ?? meta.max,
                    velocity,
                    vx: channels.vx,
                    vy: channels.vy,
                    elev: channels.elev,
                    qx: channels.qx,
                    qy: channels.qy
                });
                break;
            }

            case 'done': {
                this.setJobState('downloading');
                if (output.maxDepthUrl) {
                    const { meta, channels } = decodeFrame(await this.transport.fetchBinary(output.maxDepthUrl));
                    this.emit({ type: 'MAX_DEPTH_GRID', payload: channels.depth, header: this._headerFromMeta(meta) });
                }
                if (output.maxHazardUrl) {
                    const { meta, channels } = decodeFrame(await this.transport.fetchBinary(output.maxHazardUrl));
                    this.emit({ type: 'MAX_HAZARD_GRID', payload: channels.depth, header: this._headerFromMeta(meta) });
                }
                // Weitere Summen-Raster (alle Einkanal über channels.depth kodiert).
                const extraGrids = [
                    ['maxVelocityUrl', 'MAX_VELOCITY_GRID'],
                    ['maxElevUrl',     'MAX_ELEV_GRID'],
                    ['arrivalTimeUrl', 'ARRIVAL_TIME_GRID'],
                    ['durationUrl',    'DURATION_GRID'],
                ];
                for (const [urlKey, evType] of extraGrids) {
                    if (output[urlKey]) {
                        const { meta, channels } = decodeFrame(await this.transport.fetchBinary(output[urlKey]));
                        this.emit({ type: evType, payload: channels.depth, header: this._headerFromMeta(meta) });
                    }
                }
                if (output.massReport) {
                    this.emit({ type: 'MASS_REPORT', data: output.massReport });
                }
                this.setJobState('done');
                this.emit({ type: 'STATUS', status: 'FINISHED' });
                break;
            }
        }
    }

    _headerFromMeta(meta) {
        const { ncols, nrows, cellsize, xllcorner, yllcorner, NODATA_value } = meta;
        return { ncols, nrows, cellsize, xllcorner, yllcorner, NODATA_value: NODATA_value ?? -9999 };
    }

    async abort() {
        this.polling = false;
        if (this.jobId) {
            await this.transport.cancel(this.jobId).catch(() => {});
            this.emit({ type: 'LOG', text: `RUNPOD: Job ${this.jobId} abgebrochen.` });
        }
        this.setJobState('idle');
    }

    dispose() {
        this.disposed = true;
        this.polling = false;
        if (this.jobId) this.transport.cancel(this.jobId).catch(() => {});
    }
}
