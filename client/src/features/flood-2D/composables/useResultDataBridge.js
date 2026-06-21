/**
 * useResultDataBridge.js
 * Reliable data bridge for transferring simulation data
 * from the main window to the popup Result Viewer.
 *
 * Uses IndexedDB — supports large binary data (no 5MB sessionStorage limit),
 * works reliably across windows (no window.opener security issues).
 */
import { ref, toRaw } from 'vue';

const DB_NAME = 'flood-result-bridge';
const DB_VERSION = 1;
const STORE_NAME = 'result-data';
const DATA_KEY = 'current';
const FRAME_PREFIX = 'frame:'; // pro-Frame-Records (Schema 'per-frame-v1') gegen Mega-Clone-OOM

// ─── IndexedDB Helpers ───

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function writeData(key, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(data, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function readData(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => { db.close(); resolve(req.result); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

/**
 * Schreibt resultData als META-Record (DATA_KEY) + EIN Record je Frame (`frame:<id>`).
 * So klont IndexedDB.put pro Aufruf nur EINEN kleinen Frame (~MB) statt des ganzen
 * Mehrhundert-MB-Blobs in einem Rutsch → behebt `DataCloneError: out of memory`.
 */
async function writeResultData(resultData) {
    const db = await openDB();
    const {
        frames = {}, velocityFrames = {}, velocityVectorFrames = {},
        elevFrames = {}, qFluxFrames = {}, ...meta
    } = resultData;
    const frameIds = Object.keys(frames).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    meta.frameIds = frameIds;
    meta.schema = 'per-frame-v1';
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear(); // alte Records (Meta + Frames eines früheren Laufs) entfernen
        store.put(meta, DATA_KEY);
        for (const id of frameIds) {
            const rec = { depth: frames[id] };
            if (velocityFrames[id]) rec.velocity = velocityFrames[id];
            const vv = velocityVectorFrames[id];
            if (vv && vv.vx && vv.vy) { rec.vx = vv.vx; rec.vy = vv.vy; }
            if (elevFrames[id]) rec.elev = elevFrames[id];
            const qf = qFluxFrames[id];
            if (qf && qf.qx && qf.qy) { rec.qx = qf.qx; rec.qy = qf.qy; }
            store.put(rec, FRAME_PREFIX + id);
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('IDB-Transaktion abgebrochen (evtl. Quota/Speicher)')); };
    });
}

/** Setzt die pro-Frame-Records (`frame:<id>`) wieder zur erwarteten data-Form zusammen. */
function reassemblePerFrame(meta, recById) {
    const frames = {}, velocityFrames = {}, velocityVectorFrames = {}, elevFrames = {}, qFluxFrames = {};
    for (const id of (meta.frameIds || [])) {
        const rec = recById.get(id);
        if (!rec) continue;
        if (rec.depth) frames[id] = rec.depth;
        if (rec.velocity) velocityFrames[id] = rec.velocity;
        if (rec.vx && rec.vy) velocityVectorFrames[id] = { vx: rec.vx, vy: rec.vy };
        if (rec.elev) elevFrames[id] = rec.elev;
        if (rec.qx && rec.qy) qFluxFrames[id] = { qx: rec.qx, qy: rec.qy };
    }
    const { frameIds, schema, ...rest } = meta; // eslint-disable-line no-unused-vars
    return { ...rest, frames, velocityFrames, velocityVectorFrames, elevFrames, qFluxFrames };
}

/** Main-Thread-Fallback (wenn der Worker ausfällt): Meta + Frames lesen und zusammensetzen. */
async function readResultDataMainThread() {
    const meta = await readData(DATA_KEY);
    if (!meta) return null;
    if (meta.schema !== 'per-frame-v1') return meta; // Alt-Format (ganzes Objekt)
    const db = await openDB();
    const recById = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const out = new Map();
        const ids = meta.frameIds || [];
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
    return reassemblePerFrame(meta, recById);
}

/**
 * Liest den Result-Blob über einen Worker: der teure Structured-Clone des ~600-MB-Objekts
 * läuft off-main-thread, die ArrayBuffers kommen per Transfer zero-copy zurück → kein
 * Main-Thread-Freeze beim Öffnen des Result-Viewers. Bei jedem Fehler (Bundling/Boot/Timeout)
 * wird auf den synchronen Main-Thread-Pfad (readData) zurückgefallen — Worst Case = bisheriges
 * Verhalten, kein kaputter Viewer.
 */
function readDataViaWorker(key, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        let worker, timer;
        const done = (fn, arg) => {
            if (timer) clearTimeout(timer);
            try { worker && worker.terminate(); } catch { /* noop */ }
            fn(arg);
        };
        try {
            worker = new Worker(new URL('../workers/resultHydrationWorker.js', import.meta.url), { type: 'module' });
        } catch (e) { reject(e); return; }
        timer = setTimeout(() => done(reject, new Error('Hydrierungs-Worker Timeout')), timeoutMs);
        worker.onmessage = (e) => {
            const m = e.data || {};
            if (m.type === 'error') done(reject, new Error(m.message || 'Worker-Fehler'));
            else done(resolve, m.data);
        };
        worker.onerror = (e) => done(reject, new Error(e.message || 'Worker-Fehler'));
        worker.postMessage({ type: 'load', key });
    });
}

// ─── Producer (Main Window) ───

/**
 * Called BEFORE window.open() — serializes terrain + result data into IndexedDB.
 * @param {Object} simStore
 * @param {Object} geoStore
 * @param {String} bciContent
 * @returns {Promise<boolean>} true if data was stored successfully
 */
// Kanonische Liste der Vektor-Geometrie-Felder des GeoStore — EINE Quelle der Wahrheit für
// Producer (Serialisierung) UND Consumer (Hydration). Verhindert vergessene Felder (z.B. bridges).
// NB: 'buildings' bewusst NICHT hier — das Viewer-Terrain hat Gebäude bereits als NoData
// eingebrannt (Flood2DSolverRunner.openViewer), und die separat hydrierte Gebäudemaske
// clippte über der Gerinnefläche zusätzlich das WASSER weg (Wasser = Klon der geclippten
// Terrain-Geometrie). Streamlines blenden Gebäude über das gridData-NoData-Gate aus.
export const GEO_FIELDS = ['modifications', 'boundaries', 'nodes', 'weirs', 'weirLines', 'bridges', 'culvertLinks'];

function serializeGeoFields(geoStore) {
    const out = {};
    for (const f of GEO_FIELDS) {
        const raw = toRaw(geoStore[f]);
        out[f] = raw ? JSON.parse(JSON.stringify(raw)) : null;
    }
    return out;
}

/**
 * @param {Object} simStore
 * @param {Object} geoStore  Der echte GeoStore (Vektor-Geometrien werden via GEO_FIELDS gelesen).
 * @param {Object} [opts]    { bciContent, terrainOverride } — terrainOverride z.B. das "gebackene" Terrain.
 */
/**
 * Baut das Result-Datenobjekt (Terrain + Geo + Frames als Typed-Arrays). EINE Quelle, geteilt von der
 * IndexedDB-Bridge (prepareResultData) UND dem Projekt-Datei-Export (useProjectFile.saveProject).
 * @returns {object|null} resultData oder null, wenn kein Terrain vorhanden ist.
 */
export function buildResultData(simStore, geoStore, { bciContent = null, terrainOverride = null, copyArrays = true } = {}) {
    const rawTerrain = toRaw(terrainOverride ?? geoStore.terrain);
    const geoSerialized = serializeGeoFields(geoStore);
    // copyArrays=false (IDB-Pfad): keine redundante .slice()-Kopie — IndexedDB.put klont ohnehin.
    // Spart bei großen Läufen die Speicher-VERDOPPLUNG vor dem Schreiben (Mit-Ursache des OOM).
    // copyArrays=true (Projekt-Export): unabhängige Kopien wie bisher.
    const keep = (raw) => raw instanceof Float32Array ? (copyArrays ? raw.slice() : raw) : new Float32Array(raw);
    console.log('[ResultBridge] serialize geo:', GEO_FIELDS.map(f => `${f}=${geoStore[f]?.length ?? (geoStore[f]?.features?.length ?? '–')}`).join(' '));

    if (!rawTerrain || !rawTerrain.gridData) {
        console.warn('[ResultBridge] No terrain data available');
        return null;
    }

    // Serialize depth frames
    const framesMap = simStore.resultFrames;
    const serializedFrames = {};
    let computedMaxDepth = 0;

    if (framesMap instanceof Map) {
        for (const [frameId, data] of framesMap.entries()) {
            const rawData = toRaw(data);
            const arr = keep(rawData);
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] > computedMaxDepth) computedMaxDepth = arr[i];
            }
            serializedFrames[frameId] = arr;
        }
    }

    // Serialize velocity frames (optional)
    const serializedVelocity = {};
    if (simStore.velocityFrames instanceof Map) {
        for (const [frameId, data] of simStore.velocityFrames.entries()) {
            const raw = toRaw(data);
            serializedVelocity[frameId] = keep(raw);
        }
    }

    // Serialize velocity VECTOR frames (Vx/Vy, optional — für Fließpfeile/-partikel)
    const serializedVectors = {};
    if (simStore.velocityVectorFrames instanceof Map) {
        for (const [frameId, comp] of simStore.velocityVectorFrames.entries()) {
            const rawVx = toRaw(comp?.vx);
            const rawVy = toRaw(comp?.vy);
            if (!rawVx || !rawVy) continue;
            serializedVectors[frameId] = { vx: keep(rawVx), vy: keep(rawVy) };
        }
    }

    // Serialize Wasserspiegel-Frames (.elev, optional — Ober-/Unterwasser am Wehr)
    const serializedElev = {};
    if (simStore.elevFrames instanceof Map) {
        for (const [frameId, data] of simStore.elevFrames.entries()) {
            const raw = toRaw(data);
            if (!raw) continue;
            serializedElev[frameId] = keep(raw);
        }
    }

    // Serialize Kantenfluss-Frames (Qx/Qy, optional — für Wehr-Durchfluss)
    const serializedQFlux = {};
    if (simStore.qFluxFrames instanceof Map) {
        for (const [frameId, comp] of simStore.qFluxFrames.entries()) {
            const rawQx = toRaw(comp?.qx);
            const rawQy = toRaw(comp?.qy);
            if (!rawQx || !rawQy) continue;
            serializedQFlux[frameId] = { qx: keep(rawQx), qy: keep(rawQy) };
        }
    }

    // Serialize Summen-/Max-Raster (optional). Einheitlich über _sliceGrid.
    const _sliceGrid = (g) => {
        const raw = toRaw(g);
        return raw ? keep(raw) : null;
    };

    const rawGridData = toRaw(rawTerrain.gridData);
    const maxDepth = Math.max(simStore.maxWaterDepth || 0, computedMaxDepth);

    const resultData = {
        terrain: {
            gridData: keep(rawGridData),
            ncols: rawTerrain.ncols,
            nrows: rawTerrain.nrows,
            cellsize: rawTerrain.cellsize,
            minZ: rawTerrain.minZ,
            maxZ: rawTerrain.maxZ,
            xllcorner: rawTerrain.xllcorner,
            yllcorner: rawTerrain.yllcorner,
            center: rawTerrain.center ? JSON.parse(JSON.stringify(toRaw(rawTerrain.center))) : null,
            bounds: rawTerrain.bounds ? JSON.parse(JSON.stringify(toRaw(rawTerrain.bounds))) : null
        },
        ...geoSerialized,
        header: simStore.resultHeader
            ? JSON.parse(JSON.stringify(toRaw(simStore.resultHeader)))
            : null,
        maxWaterDepth: maxDepth,
        totalFrames: Object.keys(serializedFrames).length,
        simDuration: simStore.simDuration || 3600,
        frames: serializedFrames,
        velocityFrames: serializedVelocity,
        velocityVectorFrames: serializedVectors,
        elevFrames: serializedElev,
        qFluxFrames: serializedQFlux,
        maxDepthGrid:    _sliceGrid(simStore.maxDepthGrid),
        maxHazardGrid:   _sliceGrid(simStore.maxHazardGrid),
        maxVelocityGrid: _sliceGrid(simStore.maxVelocityGrid),
        maxElevGrid:     _sliceGrid(simStore.maxElevGrid),
        arrivalTimeGrid: _sliceGrid(simStore.arrivalTimeGrid),
        durationGrid:    _sliceGrid(simStore.durationGrid),
        timestamp: Date.now(),
        bciContent: bciContent
    };

    return resultData;
}

/** Serialisiert simStore + geoStore in die IndexedDB (Producer für den Result-Viewer). */
export async function prepareResultData(simStore, geoStore, opts = {}) {
    const resultData = buildResultData(simStore, geoStore, { ...opts, copyArrays: false });
    if (!resultData) return false;
    try {
        await writeResultData(resultData);
        console.log('[ResultBridge] Data stored in IndexedDB:', {
            terrainSize: resultData.terrain.ncols + 'x' + resultData.terrain.nrows,
            frameCount: Object.keys(resultData.frames).length,
            maxDepth: resultData.maxWaterDepth
        });
        return true;
    } catch (err) {
        console.error('[ResultBridge] IndexedDB write failed:', err);
        return false;
    }
}

// ─── Consumer (Popup Window) ───
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';

/**
 * Reads data from IndexedDB and hydrates reactive refs.
 * Use in the popup ResultViewer.
 */
export function useResultDataFromOpener() {
    const terrain = ref(null);
    const resultHeader = ref(null);
    const resultFrames = ref(new Map());
    const velocityFrames = ref(new Map());
    const velocityVectorFrames = ref(new Map());
    const elevFrames = ref(new Map());
    const qFluxFrames = ref(new Map());
    const maxDepthGrid = ref(null);
    const maxHazardGrid = ref(null);
    const maxVelocityGrid = ref(null);
    const maxElevGrid = ref(null);
    const arrivalTimeGrid = ref(null);
    const durationGrid = ref(null);
    const maxWaterDepth = ref(0);
    const totalFrames = ref(0);
    const simDuration = ref(3600);
    const bciContent = ref('');
    const isLoading = ref(true);
    const loadProgress = ref(0);
    const error = ref(null);

    const loadData = async () => {
        isLoading.value = true;
        loadProgress.value = 0;
        error.value = null;

        try {
            console.log('[ResultBridge] Reading from IndexedDB (Worker, Fallback Main-Thread)...');
            let data;
            try {
                data = await readDataViaWorker(DATA_KEY);
                console.log('[ResultBridge] Hydrierung via Worker (off-main-thread).');
            } catch (werr) {
                console.warn('[ResultBridge] Worker-Hydrierung fehlgeschlagen → Main-Thread-Fallback:', werr?.message || werr);
                data = await readResultDataMainThread();
            }

            if (!data) {
                error.value = 'Keine Daten gefunden. Bitte zuerst Simulation starten.';
                console.error('[ResultBridge] No data in IndexedDB');
                isLoading.value = false;
                return;
            }

            loadProgress.value = 20;
            console.log('[ResultBridge] Data found, hydrating...');

            // Hydrate terrain
            if (data.terrain && data.terrain.gridData) {
                const t = { ...data.terrain };
                t.gridData = t.gridData instanceof Float32Array ? t.gridData : new Float32Array(t.gridData);
                terrain.value = t;
                console.log('[ResultBridge] Terrain:', t.ncols, 'x', t.nrows, 'minZ:', t.minZ, 'maxZ:', t.maxZ);
            }

            resultHeader.value = data.header;
            maxWaterDepth.value = data.maxWaterDepth || 0;
            totalFrames.value = data.totalFrames || 0;
            simDuration.value = data.simDuration || 3600;
            bciContent.value = data.bciContent || '';
            loadProgress.value = 40;

            // Hydrate GeoStore über dieselbe kanonische Feldliste wie der Producer.
            const geoStore = useGeoStore();
            // Terrain auch in den GeoStore spiegeln, damit terrain-abhängige Layer-Watcher
            // (Wehre/Brücken/Nodes in useLayerRenderer) im Result-Viewer zuverlässig feuern.
            if (terrain.value) geoStore.terrain = terrain.value;
            for (const f of GEO_FIELDS) {
                if (data[f]) geoStore[f] = data[f];
            }
            console.log('[ResultBridge] hydrate geo:', GEO_FIELDS.map(f => `${f}=${data[f]?.length ?? (data[f]?.features?.length ?? '–')}`).join(' '));

            // Hydrate depth frames
            const frameEntries = Object.entries(data.frames || {});
            console.log('[ResultBridge] Loading', frameEntries.length, 'depth frames...');
            frameEntries.forEach(([frameId, frameArray], index) => {
                resultFrames.value.set(Number(frameId), frameArray instanceof Float32Array ? frameArray : new Float32Array(frameArray));
                loadProgress.value = 40 + Math.round(((index + 1) / frameEntries.length) * 40);
            });

            // Hydrate velocity frames (optional)
            Object.entries(data.velocityFrames || {}).forEach(([frameId, arr]) => {
                velocityFrames.value.set(Number(frameId), arr instanceof Float32Array ? arr : new Float32Array(arr));
            });

            // Hydrate velocity VECTOR frames (Vx/Vy, optional)
            Object.entries(data.velocityVectorFrames || {}).forEach(([frameId, comp]) => {
                if (!comp || !comp.vx || !comp.vy) return;
                velocityVectorFrames.value.set(Number(frameId), {
                    vx: comp.vx instanceof Float32Array ? comp.vx : new Float32Array(comp.vx),
                    vy: comp.vy instanceof Float32Array ? comp.vy : new Float32Array(comp.vy),
                });
            });

            // Hydrate Wasserspiegel-Frames (.elev, optional — Ober-/Unterwasser am Wehr)
            Object.entries(data.elevFrames || {}).forEach(([frameId, arr]) => {
                if (!arr) return;
                elevFrames.value.set(Number(frameId), arr instanceof Float32Array ? arr : new Float32Array(arr));
            });

            // Hydrate Kantenfluss-Frames (Qx/Qy, optional — Wehr-Durchfluss)
            Object.entries(data.qFluxFrames || {}).forEach(([frameId, comp]) => {
                if (!comp || !comp.qx || !comp.qy) return;
                qFluxFrames.value.set(Number(frameId), {
                    qx: comp.qx instanceof Float32Array ? comp.qx : new Float32Array(comp.qx),
                    qy: comp.qy instanceof Float32Array ? comp.qy : new Float32Array(comp.qy),
                });
            });

            // Hydrate summary grids
            const _hydrate = (v) => v == null ? null : (v instanceof Float32Array ? v : new Float32Array(v));
            if (data.maxDepthGrid)    maxDepthGrid.value    = _hydrate(data.maxDepthGrid);
            if (data.maxHazardGrid)   maxHazardGrid.value   = _hydrate(data.maxHazardGrid);
            if (data.maxVelocityGrid) maxVelocityGrid.value = _hydrate(data.maxVelocityGrid);
            if (data.maxElevGrid)     maxElevGrid.value     = _hydrate(data.maxElevGrid);
            if (data.arrivalTimeGrid) arrivalTimeGrid.value = _hydrate(data.arrivalTimeGrid);
            if (data.durationGrid)    durationGrid.value    = _hydrate(data.durationGrid);

            loadProgress.value = 100;
            isLoading.value = false;
            console.log('[ResultBridge] ✅ All data loaded. MaxDepth:', maxWaterDepth.value, 'Frames:', resultFrames.value.size);

        } catch (err) {
            console.error('[ResultBridge] Error loading from IndexedDB:', err);
            error.value = 'Fehler beim Laden: ' + err.message;
            isLoading.value = false;
        }
    };

    return {
        terrain,
        resultHeader,
        resultFrames,
        velocityFrames,
        velocityVectorFrames,
        elevFrames,
        qFluxFrames,
        maxDepthGrid,
        maxHazardGrid,
        maxVelocityGrid,
        maxElevGrid,
        arrivalTimeGrid,
        durationGrid,
        maxWaterDepth,
        totalFrames,
        simDuration,
        bciContent,
        isLoading,
        loadProgress,
        error,
        loadData
    };
}
