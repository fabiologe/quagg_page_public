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
export async function prepareResultData(simStore, geoStore, bciContent = null) {
    const rawTerrain = toRaw(geoStore.terrain);
    const rawModifications = toRaw(geoStore.modifications);
    const rawBoundaries = toRaw(geoStore.boundaries);
    const rawNodes = toRaw(geoStore.nodes);
    const rawWeirs = toRaw(geoStore.weirs);
    const rawCulvertLinks = toRaw(geoStore.culvertLinks);

    if (!rawTerrain || !rawTerrain.gridData) {
        console.warn('[ResultBridge] No terrain data available');
        return false;
    }

    // Serialize frames
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
        modifications: rawModifications ? JSON.parse(JSON.stringify(rawModifications)) : null,
        boundaries: rawBoundaries ? JSON.parse(JSON.stringify(rawBoundaries)) : null,
        nodes: rawNodes ? JSON.parse(JSON.stringify(rawNodes)) : null,
        weirs: rawWeirs ? JSON.parse(JSON.stringify(rawWeirs)) : null,
        culvertLinks: rawCulvertLinks ? JSON.parse(JSON.stringify(rawCulvertLinks)) : null,
        header: simStore.resultHeader
            ? JSON.parse(JSON.stringify(toRaw(simStore.resultHeader)))
            : null,
        maxWaterDepth: maxDepth,
        totalFrames: Object.keys(serializedFrames).length,
        simDuration: simStore.simDuration || 3600,
        frames: serializedFrames,
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

            // Hydrate GeoStore with modifications (buildings), boundaries, nodes
            const geoStore = useGeoStore();
            if (data.modifications) geoStore.modifications = data.modifications;
            if (data.boundaries) geoStore.boundaries = data.boundaries;
            if (data.nodes) geoStore.nodes = data.nodes;
            if (data.weirs) geoStore.weirs = data.weirs;
            if (data.culvertLinks) geoStore.culvertLinks = data.culvertLinks;

            // Hydrate frames
            const frameEntries = Object.entries(data.frames || {});
            console.log('[ResultBridge] Loading', frameEntries.length, 'frames...');

            frameEntries.forEach(([frameId, frameArray], index) => {
                resultFrames.value.set(Number(frameId), frameArray instanceof Float32Array ? frameArray : new Float32Array(frameArray));
                loadProgress.value = 40 + Math.round(((index + 1) / frameEntries.length) * 55);
            });

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
