/**
 * resultHydrationWorker.js
 *
 * Liest den Result-Bridge-Blob (Terrain + alle Ergebnis-Frames) aus IndexedDB IM WORKER,
 * d. h. der teure Structured-Clone des ~600-MB-Objekts beim `get` läuft OFF-MAIN-THREAD.
 * Anschließend werden ALLE ArrayBuffers (TypedArray-Backing der Frames/Gitter) per
 * Transferable zero-copy an den Main-Thread zurückgegeben → dort fällt nur noch der
 * winzige Struktur-Clone an, kein 600-MB-Stall mehr.
 *
 * Selbstständig (keine Imports) — die IDB-Konstanten/Helfer sind 1:1 zu useResultDataBridge.js.
 * Fällt der Worker aus (Bundling/Boot), nutzt der Consumer den bisherigen Main-Thread-Pfad.
 */

const DB_NAME = 'flood-result-bridge';
const DB_VERSION = 1;
const STORE_NAME = 'result-data';
const DATA_KEY = 'current';
const FRAME_PREFIX = 'frame:';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function readData(key) {
    return openDB().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
    }));
}

/**
 * Sammelt rekursiv alle ArrayBuffers hinter TypedArrays/DataViews ein (dedupliziert),
 * damit sie als Transfer-Liste zero-copy übergeben werden können. Plain-Objekte/Arrays
 * (GeoJSON etc.) werden durchlaufen, tragen aber keine transferierbaren Buffer.
 */
function collectBuffers(obj, out, seen, depth) {
    if (!obj || typeof obj !== 'object' || depth > 12) return;
    if (ArrayBuffer.isView(obj)) {
        const buf = obj.buffer;
        if (buf instanceof ArrayBuffer && !seen.has(buf)) { seen.add(buf); out.push(buf); }
        return;
    }
    if (obj instanceof ArrayBuffer) {
        if (!seen.has(obj)) { seen.add(obj); out.push(obj); }
        return;
    }
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) collectBuffers(obj[i], out, seen, depth + 1);
        return;
    }
    for (const k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) collectBuffers(obj[k], out, seen, depth + 1);
    }
}

/** Liest die pro-Frame-Records (`frame:<id>`) und setzt sie zur erwarteten data-Form zusammen. */
async function reassemble(meta) {
    const db = await openDB();
    const ids = meta.frameIds || [];
    const recById = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const out = new Map();
        let pending = ids.length;
        if (pending === 0) { resolve(out); return; }
        for (const id of ids) {
            const r = store.get(FRAME_PREFIX + id);
            r.onsuccess = () => { out.set(id, r.result); if (--pending === 0) resolve(out); };
            r.onerror = () => { if (--pending === 0) resolve(out); };
        }
        tx.onerror = () => reject(tx.error);
        tx.oncomplete = () => db.close();
    });
    const frames = {}, velocityFrames = {}, velocityVectorFrames = {}, elevFrames = {}, qFluxFrames = {};
    for (const id of ids) {
        const rec = recById.get(id);
        if (!rec) continue;
        if (rec.depth) frames[id] = rec.depth;
        if (rec.velocity) velocityFrames[id] = rec.velocity;
        if (rec.vx && rec.vy) velocityVectorFrames[id] = { vx: rec.vx, vy: rec.vy };
        if (rec.elev) elevFrames[id] = rec.elev;
        if (rec.qx && rec.qy) qFluxFrames[id] = { qx: rec.qx, qy: rec.qy };
    }
    const { frameIds, schema, ...rest } = meta; // frameIds/schema sind interne Felder
    return { ...rest, frames, velocityFrames, velocityVectorFrames, elevFrames, qFluxFrames };
}

self.onmessage = async (e) => {
    const msg = e.data || {};
    if (msg.type !== 'load') return;
    const key = msg.key || DATA_KEY;
    try {
        const meta = await readData(key);
        if (!meta) { self.postMessage({ type: 'result', data: null }); return; }
        // Neues Schema: Meta + pro-Frame-Records → reassemblen. Alt-Format: ganzes Objekt direkt.
        const data = (meta.schema === 'per-frame-v1') ? await reassemble(meta) : meta;
        const transfer = [];
        collectBuffers(data, transfer, new Set(), 0);
        // Transfer verschiebt die Buffer (kein Kopieren) — `data` wird im Worker danach verworfen.
        self.postMessage({ type: 'result', data }, transfer);
    } catch (err) {
        self.postMessage({ type: 'error', message: String((err && err.message) || err) });
    }
};
