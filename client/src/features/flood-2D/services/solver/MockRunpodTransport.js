import { encodeFrame } from './resultCodec.js';

/**
 * MockRunpodTransport — simuliert die RUNPOD-Serverless-API komplett im
 * Frontend, ohne Backend. Treibt unter der Haube den echten WASM-Worker
 * (simulation.main.js) und liefert dessen Ergebnisse über denselben
 * Job-Lifecycle aus, den die echte API hätte:
 *
 *   runJob → IN_QUEUE → IN_PROGRESS → streamChunks (progress/frame/done) → COMPLETED
 *
 * Frames werden durch den echten Binär-Codec geschickt und als mock://-URLs
 * ausgeliefert → der gesamte RunpodBackend-Pfad (Upload-Encoding, Polling,
 * Binär-Download, Decode) wird heute schon end-to-end ausgeübt. Wenn der
 * RUNPOD-Endpoint existiert, ist nur noch der Python-Handler ungetestet.
 */

// gzip+base64 → Text (Gegenstück zum Upload-Encoding im RunpodBackend)
async function gunzipBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).text();
}

async function decodeInputFiles(files) {
    const out = {};
    for (const [name, entry] of Object.entries(files || {})) {
        if (typeof entry === 'string') { out[name] = entry; continue; }
        if (entry.encoding === 'gzip+base64') out[name] = await gunzipBase64(entry.data);
        else out[name] = entry.data;
    }
    // Der Mock treibt den lokalen v5.9-WASM-Worker: v8-only-Keywords aus run.par
    // strippen (fv1/dg2/slopelimiter kennen v5.9-pars.cpp nicht) und sicherstellen,
    // dass ein Schema gesetzt ist. SGC-Keywords + <dir>B-Tags existieren in v5.9.
    if (out['run.par']) {
        const V8_ONLY = /^(fv1|dg2|slopelimiter|dg2depththresh|dg2thindepth_tstep)\b/;
        const lines = out['run.par'].split('\n');
        const kept = lines.filter(l => !V8_ONLY.test(l.trimStart()));
        if (kept.length !== lines.length) {
            if (!kept.some(l => l.trimStart().startsWith('acceleration'))) {
                kept.push('acceleration        ');
            }
            out['run.par'] = kept.join('\n');
            console.info('[MockRunpod] v8-Keywords aus run.par entfernt — WASM v5.9 läuft mit acceleration.');
        }
    }
    return out;
}

const NETWORK_LATENCY = () => 200 + Math.random() * 300;

export function createMockRunpodTransport() {
    /** @type {Map<string, object>} jobId → Job-State */
    const jobs = new Map();
    /** @type {Map<string, ArrayBuffer>} mock://-URL → Binärdaten */
    const binaries = new Map();
    let jobCounter = 0;

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    function startWorker(job, input) {
        const worker = new Worker(
            new URL('../../middleware/simulation.main.js', import.meta.url),
            { type: 'module' }
        );
        job.worker = worker;
        let lastHeader = null;
        let massReport = null;
        let started = false;

        const frameUrl = (jobId, frame) =>
            `mock://jobs/${jobId}/frame-${String(frame).padStart(4, '0')}.bin`;

        worker.onmessage = (e) => {
            const d = e.data;
            switch (d.type) {
                case 'STATUS':
                    if ((d.status === 'READY' || d.status === 'IDLE') && !started) {
                        started = true;
                        job.status = 'IN_PROGRESS';
                        worker.postMessage({
                            cmd: 'CMD_RUN',
                            payload: {
                                files: job.files,
                                scenarioData: { grid: { gridData: null } },
                                culverts: [],
                                header: null,
                                maxTime: input.maxTime || 3600
                            }
                        });
                    } else if (d.status === 'FINISHED') {
                        const done = { event: 'done', massReport };
                        if (job.maxDepthUrl)  done.maxDepthUrl  = job.maxDepthUrl;
                        if (job.maxHazardUrl) done.maxHazardUrl = job.maxHazardUrl;
                        job.queue.push(done);
                        job.status = 'COMPLETED';
                        worker.terminate();
                        job.worker = null;
                    }
                    break;

                case 'PROGRESS_UPDATE':
                    job.queue.push({ event: 'progress', time: d.time });
                    break;

                case 'LOG': case 'STDOUT': case 'STDERR':
                    job.queue.push({ event: 'log', text: d.text });
                    break;

                case 'WARNING':
                    job.queue.push({ event: 'warning', text: d.message || d.text });
                    break;

                case 'RESULT': {
                    lastHeader = d.header || lastHeader;
                    const channels = { depth: d.payload };
                    if (d.vx) channels.vx = d.vx;
                    if (d.vy) channels.vy = d.vy;
                    if (d.velocity) channels.velocity = d.velocity;
                    const meta = { frame: d.frame, ...(d.header || {}), min: d.min, max: d.max };
                    const url = frameUrl(job.id, d.frame);
                    binaries.set(url, encodeFrame(meta, channels));
                    job.queue.push({ event: 'frame', frame: d.frame, url, min: d.min, max: d.max });
                    break;
                }

                case 'MAX_DEPTH_GRID': {
                    const url = `mock://jobs/${job.id}/max-depth.bin`;
                    binaries.set(url, encodeFrame({ frame: -1, ...(lastHeader || {}) }, { depth: d.payload }));
                    job.maxDepthUrl = url;
                    break;
                }

                case 'MAX_HAZARD_GRID': {
                    const url = `mock://jobs/${job.id}/max-hazard.bin`;
                    binaries.set(url, encodeFrame({ frame: -1, ...(lastHeader || {}) }, { depth: d.payload }));
                    job.maxHazardUrl = url;
                    break;
                }

                case 'MASS_REPORT':
                    massReport = d.data;
                    break;

                case 'ERROR':
                    job.status = 'FAILED';
                    job.error = d.error;
                    worker.terminate();
                    job.worker = null;
                    break;
            }
        };

        worker.onerror = (e) => {
            job.status = 'FAILED';
            job.error = e.message || 'Mock worker crashed';
            e.preventDefault();
        };

        worker.postMessage({ cmd: 'CMD_INIT' });
    }

    return {
        async runJob(input) {
            await delay(NETWORK_LATENCY());
            const id = `mock-${Date.now()}-${++jobCounter}`;
            const job = { id, status: 'IN_QUEUE', queue: [], worker: null, error: null, files: null };
            jobs.set(id, job);

            // Upload-Encoding wirklich rückwärts durchlaufen (gzip+base64 → Text),
            // damit der Pfad realistisch getestet ist.
            job.files = await decodeInputFiles(input.files);
            startWorker(job, input);
            return { id, status: 'IN_QUEUE' };
        },

        async getStatus(jobId) {
            await delay(NETWORK_LATENCY());
            const job = jobs.get(jobId);
            if (!job) return { id: jobId, status: 'FAILED', error: 'unknown job id' };
            return { id: jobId, status: job.status, error: job.error || undefined };
        },

        async streamChunks(jobId) {
            await delay(NETWORK_LATENCY());
            const job = jobs.get(jobId);
            if (!job) return { status: 'FAILED', stream: [] };
            const items = job.queue.splice(0, job.queue.length);
            return { status: job.status, stream: items.map(output => ({ output })) };
        },

        async cancel(jobId) {
            const job = jobs.get(jobId);
            if (job) {
                if (job.worker) { job.worker.terminate(); job.worker = null; }
                job.status = 'CANCELLED';
            }
            return { id: jobId, status: 'CANCELLED' };
        },

        async fetchBinary(url) {
            await delay(NETWORK_LATENCY());
            const buf = binaries.get(url);
            if (!buf) throw new Error(`Mock binary not found: ${url}`);
            return buf;
        }
    };
}
