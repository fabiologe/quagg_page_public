/**
 * Regressionstest: Download-Fehler dürfen einen laufenden RunPod-Job NICHT abbrechen.
 *
 * Hintergrund (2026-07-29): Der R2-Bucket hatte keine CORS-Policy — der allererste
 * Frame-Download warf im Browser einen NetworkError, der ungefangen durch
 * _handleOutput → _pollLoop → run().catch lief und den kompletten BEZAHLTEN Lauf
 * mit "RUNPOD-Polling fehlgeschlagen" beendete, obwohl der Solver serverseitig
 * sauber weiterrechnete. Die CORS-Policy ist gefixt; dieser Test sichert die
 * zweite Verteidigungslinie: fetchBinary-Fehler ⇒ WARNING + weiterpollen.
 *
 * Aufruf:  node src/features/flood-2D/test/test_runpod_backend_resilience.mjs
 */
import { RunpodBackend } from '../services/solver/RunpodBackend.js';
import { encodeFrame } from '../services/solver/resultCodec.js';

let failures = 0;
function check(name, cond, detail = '') {
    console.log(`  [${cond ? 'OK ' : 'FAIL'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
    if (!cond) failures++;
}

const META = { ncols: 3, nrows: 2, cellsize: 5, xllcorner: 0, yllcorner: 0, NODATA_value: -9999, frame: 1, min: 0, max: 1 };
const GOOD_FRAME = encodeFrame(META, { depth: new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5]) });

// Transport-Stub: Frame 0 wirft (wie der CORS-NetworkError), Frame 1 und
// max-depth laden normal. Stream liefert 2 Frames, dann COMPLETED+done.
const chunks = [
    { status: 'IN_PROGRESS', stream: [
        { output: { event: 'log', text: 'start' } },
        { output: { event: 'frame', frame: 0, url: 'https://r2/broken.bin', min: 0, max: 1 } },
    ] },
    { status: 'IN_PROGRESS', stream: [
        { output: { event: 'frame', frame: 1, url: 'https://r2/ok.bin', min: 0, max: 1 } },
    ] },
    { status: 'COMPLETED', stream: [
        { output: { event: 'done',
                    maxDepthUrl: 'https://r2/broken-max.bin',   // wirft ebenfalls
                    maxElevUrl: 'https://r2/ok.bin',            // lädt
                    massReport: { summary: { Verror: 0 } } } },
    ] },
    { status: 'COMPLETED', stream: [] },  // Rest-Drain nach COMPLETED
];
let chunkIdx = 0;
const transport = {
    runJob: async () => ({ id: 'job-res-1', status: 'IN_QUEUE' }),
    streamChunks: async () => chunks[Math.min(chunkIdx++, chunks.length - 1)],
    getStatus: async () => ({ id: 'job-res-1', status: 'COMPLETED' }),
    cancel: async () => ({}),
    fetchBinary: async (url) => {
        if (url.includes('broken')) throw new Error('NetworkError when attempting to fetch resource.');
        return GOOD_FRAME; // encodeFrame liefert direkt einen ArrayBuffer
    },
};

const backend = new RunpodBackend({ transport, pollIntervalMs: 5 });
const events = [];
backend.onEvent(ev => events.push(ev));

await backend.prepare();
await backend.run({ files: { 'run.par': 'sim_time 60' }, maxTime: 60 });
// _pollLoop läuft detached — auf FINISHED (oder Fehler) warten.
await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
        if (events.some(e => e.type === 'STATUS' && e.status === 'FINISHED')) { clearInterval(iv); resolve(); }
        else if (events.some(e => e.type === 'ERROR')) { clearInterval(iv); resolve(); }
        else if (Date.now() - t0 > 5000) { clearInterval(iv); reject(new Error('Timeout: weder FINISHED noch ERROR')); }
    }, 10);
});

console.log('Kaputter Frame-Download bricht den Lauf nicht ab:');
const types = events.map(e => e.type);
check('kein ERROR-Event', !types.includes('ERROR'),
      JSON.stringify(events.find(e => e.type === 'ERROR') ?? ''));
check('WARNING für den kaputten Frame',
      events.some(e => e.type === 'WARNING' && /Frame 0/.test(e.message ?? '')));
check('intakter Frame 1 kam als RESULT durch',
      events.some(e => e.type === 'RESULT' && e.frame === 1));
check('WARNING für das kaputte Max-Raster',
      events.some(e => e.type === 'WARNING' && /MAX_DEPTH_GRID/.test(e.message ?? '')));
check('intaktes MAX_ELEV_GRID kam durch', types.includes('MAX_ELEV_GRID'));
check('MASS_REPORT trotz Download-Fehlern', types.includes('MASS_REPORT'));
check('STATUS FINISHED erreicht', events.some(e => e.type === 'STATUS' && e.status === 'FINISHED'));
check('JOB_STATE endet auf done',
      events.filter(e => e.type === 'JOB_STATE').at(-1)?.phase === 'done');

// ── Teil 2: replayEvents (früheren Lauf aus Companion-Manifest laden) ────────
console.log('Manifest-Replay stellt einen gespeicherten Lauf wieder her:');
{
    const b2 = new RunpodBackend({ transport, pollIntervalMs: 5 });
    const evs2 = [];
    b2.onEvent(ev => evs2.push(ev));
    await b2.replayEvents([
        { event: 'frame', frame: 0, url: 'https://r2/ok.bin', min: 0, max: 1, time: 0 },
        { event: 'frame', frame: 1, url: 'https://r2/ok.bin', min: 0, max: 1, time: 30 },
        { event: 'done', maxDepthUrl: 'https://r2/ok.bin', massReport: { summary: {} } },
    ]);
    const t2 = evs2.map(e => e.type);
    check('2 RESULT-Frames', evs2.filter(e => e.type === 'RESULT').length === 2, JSON.stringify(t2));
    check('MAX_DEPTH_GRID + MASS_REPORT', t2.includes('MAX_DEPTH_GRID') && t2.includes('MASS_REPORT'));
    check('endet mit STATUS FINISHED', evs2.some(e => e.type === 'STATUS' && e.status === 'FINISHED'));

    // Manifest OHNE done (abgebrochener Lauf) muss trotzdem sauber enden.
    const b3 = new RunpodBackend({ transport, pollIntervalMs: 5 });
    const evs3 = [];
    b3.onEvent(ev => evs3.push(ev));
    await b3.replayEvents([{ event: 'frame', frame: 0, url: 'https://r2/ok.bin', min: 0, max: 1 }]);
    check('ohne done: FINISHED + JOB_STATE done trotzdem',
          evs3.some(e => e.type === 'STATUS' && e.status === 'FINISHED')
          && evs3.filter(e => e.type === 'JOB_STATE').at(-1)?.phase === 'done');
}

console.log();
if (failures) { console.log(`FEHLGESCHLAGEN: ${failures}`); process.exit(1); }
console.log('Alle Tests bestanden.');
