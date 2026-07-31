/**
 * Test des Lazy-Frame-Kerns der Result-Bridge (Viewer-RAM-Fix 2026-07-30):
 * ensureFrame lädt einzeln aus IndexedDB, LRU deckelt den Speicher, |v| wird
 * aus vx/vy abgeleitet (statt als 7. Kanal gespeichert), Prefetch holt den
 * Folgeframe. Läuft in Node mit einem minimalen IndexedDB-Stub.
 *
 * Aufruf:  node src/features/flood-2D/test/test_result_bridge_lazy.mjs
 */

let failures = 0;
function check(name, cond, detail = '') {
    console.log(`  [${cond ? 'OK ' : 'FAIL'}] ${name}${cond || !detail ? '' : ' — ' + detail}`);
    if (!cond) failures++;
}

// ── Mini-IndexedDB-Stub (nur was openDB/readData der Bridge benutzen) ────────
const RECORDS = new Map();
let getCount = 0;
class FakeRequest {
    constructor(result) {
        this.result = result;
        queueMicrotask(() => this.onsuccess && this.onsuccess({ target: this }));
    }
}
globalThis.indexedDB = {
    open() {
        const db = {
            objectStoreNames: { contains: () => true },
            close() {},
            transaction() {
                const tx = {};
                queueMicrotask(() => tx.oncomplete && tx.oncomplete());
                tx.objectStore = () => ({
                    get(key) { getCount++; return new FakeRequest(RECORDS.get(key)); },
                    put(val, key) { RECORDS.set(key, val); return new FakeRequest(undefined); },
                    clear() { RECORDS.clear(); return new FakeRequest(undefined); },
                });
                return tx;
            },
        };
        return new FakeRequest(db);
    },
};

// 12 Frame-Records: depth konstant = frameId, vx=3, vy=4 → |v|=5
const N = 16;
for (let f = 0; f < 12; f++) {
    RECORDS.set(`frame:${f}`, {
        depth: new Float32Array(N).fill(f),
        vx: new Float32Array(N).fill(3),
        vy: new Float32Array(N).fill(4),
    });
}

const { useResultDataFromOpener } = await import('../composables/useResultDataBridge.js');
const bridge = useResultDataFromOpener();
bridge.frameIds.value = Array.from({ length: 12 }, (_, i) => i);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('1. ensureFrame lädt + leitet |v| ab');
check('Frame 0 verfügbar', await bridge.ensureFrame(0));
check('depth korrekt', bridge.resultFrames.value.get(0)?.[0] === 0);
check('vx/vy da', bridge.velocityVectorFrames.value.get(0)?.vx?.[0] === 3);
check('|v| abgeleitet (hypot 3,4 = 5)',
      Math.abs(bridge.velocityFrames.value.get(0)?.[0] - 5) < 1e-6);

console.log('2. Prefetch holt den Folgeframe');
await sleep(30);
check('Frame 1 vorab geladen', bridge.resultFrames.value.has(1));

console.log('3. LRU deckelt den Speicher');
for (let f = 2; f <= 10; f++) await bridge.ensureFrame(f);
await sleep(30); // letzte Prefetches
check('Cache ≤ 6 Frames', bridge.resultFrames.value.size <= 6,
      `size=${bridge.resultFrames.value.size}`);
check('aktueller Frame 10 im Cache', bridge.resultFrames.value.has(10));
check('ältester Frame 0 verdrängt', !bridge.resultFrames.value.has(0));
check('alle Kanäle mit-verdrängt',
      !bridge.velocityFrames.value.has(0) && !bridge.velocityVectorFrames.value.has(0));

console.log('4. Wiederholtes ensureFrame = Cache-Hit (kein IDB-Zugriff)');
const before = getCount;
check('cached true', await bridge.ensureFrame(10));
check('kein neuer get()', getCount === before || getCount === before + 1, // +1 = evtl. Prefetch 11
      `getCount ${before} -> ${getCount}`);

console.log('5. readFrameRecord (Streaming) füllt den Cache NICHT');
const sizeBefore = bridge.resultFrames.value.size;
const rec = await bridge.readFrameRecord(2);
check('Record roh lesbar', rec?.depth?.[0] === 2);
check('Cache unverändert', bridge.resultFrames.value.size === sizeBefore);

console.log('6. Unbekannter Frame -> false, kein Crash');
check('ensureFrame(99) false', (await bridge.ensureFrame(99)) === false);

console.log();
if (failures) { console.log(`FEHLGESCHLAGEN: ${failures}`); process.exit(1); }
console.log('Alle Tests bestanden.');
