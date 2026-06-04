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
export const GEO_FIELDS = ['modifications', 'boundaries', 'nodes', 'weirs', 'bridges', 'culvertLinks'];

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
export async function prepareResultData(simStore, geoStore, { bciContent = null, terrainOverride = null } = {}) {
    const rawTerrain = toRaw(terrainOverride ?? geoStore.terrain);
    const geoSerialized = serializeGeoFields(geoStore);
    console.log('[ResultBridge] serialize geo:', GEO_FIELDS.map(f => `${f}=${geoStore[f]?.length ?? (geoStore[f]?.features?.length ?? '–')}`).join(' '));

    if (!rawTerrain || !rawTerrain.gridData) {
        console.warn('[ResultBridge] No terrain data available');
        return false;
    }

    // Serialize depth frames
    const framesMap = simStore.resultFrames;
    const serializedFrames = {};
    let computedMaxDepth = 0;

    if (framesMap instanceof Map) {
        for (const [frameId, data] of framesMap.entries()) {
            const rawData = toRaw(data);
            const arr = rawData instanceof Float32Array ? rawData.slice() : new Float32Array(rawData);
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
            serializedVelocity[frameId] = raw instanceof Float32Array ? raw.slice() : new Float32Array(raw);
        }
    }

    // Serialize velocity VECTOR frames (Vx/Vy, optional — für Fließpfeile/-partikel)
    const serializedVectors = {};
    if (simStore.velocityVectorFrames instanceof Map) {
        for (const [frameId, comp] of simStore.velocityVectorFrames.entries()) {
            const rawVx = toRaw(comp?.vx);
            const rawVy = toRaw(comp?.vy);
            if (!rawVx || !rawVy) continue;
            serializedVectors[frameId] = {
                vx: rawVx instanceof Float32Array ? rawVx.slice() : new Float32Array(rawVx),
                vy: rawVy instanceof Float32Array ? rawVy.slice() : new Float32Array(rawVy),
            };
        }
    }

    // Serialize max depth + hazard grids (optional)
    const maxDepthRaw  = toRaw(simStore.maxDepthGrid);
    const maxHazardRaw = toRaw(simStore.maxHazardGrid);

    const rawGridData = toRaw(rawTerrain.gridData);
    const maxDepth = Math.max(simStore.maxWaterDepth || 0, computedMaxDepth);

    const resultData = {
        terrain: {
            gridData: rawGridData instanceof Float32Array ? rawGridData.slice() : new Float32Array(rawGridData),
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
        maxDepthGrid:  maxDepthRaw  instanceof Float32Array ? maxDepthRaw.slice()  : (maxDepthRaw  ? new Float32Array(maxDepthRaw)  : null),
        maxHazardGrid: maxHazardRaw instanceof Float32Array ? maxHazardRaw.slice() : (maxHazardRaw ? new Float32Array(maxHazardRaw) : null),
        timestamp: Date.now(),
        bciContent: bciContent
    };

    try {
        await writeData(DATA_KEY, resultData);
        console.log('[ResultBridge] Data stored in IndexedDB:', {
            terrainSize: rawTerrain.ncols + 'x' + rawTerrain.nrows,
            frameCount: Object.keys(serializedFrames).length,
            maxDepth
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
    const maxDepthGrid = ref(null);
    const maxHazardGrid = ref(null);
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
            console.log('[ResultBridge] Reading from IndexedDB...');
            const data = await readData(DATA_KEY);

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

            // Hydrate summary grids
            if (data.maxDepthGrid)  maxDepthGrid.value  = data.maxDepthGrid  instanceof Float32Array ? data.maxDepthGrid  : new Float32Array(data.maxDepthGrid);
            if (data.maxHazardGrid) maxHazardGrid.value = data.maxHazardGrid instanceof Float32Array ? data.maxHazardGrid : new Float32Array(data.maxHazardGrid);

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
        maxDepthGrid,
        maxHazardGrid,
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
