/**
 * useHistoryManager.js
 *
 * Cross-Store Undo/Redo für GeoStore + HydraulicStore + SurfaceStore.
 *
 * Design-Prinzipien:
 *  1. ATOMAR: Ein Snapshot erfasst alle drei Stores gleichzeitig.
 *             Undo/Redo schreibt alle drei gleichzeitig zurück.
 *  2. NUR VEKTORDATEN: Raster-Arrays (gridData, surfaceGrid) werden NICHT gecaptured.
 *  3. DEEP ISOLATION: structuredClone() — unabhängig von Vue-Proxies.
 *  4. MEMORY GUARD: Max. 50 Snapshots. Bei Überlauf FIFO-Eviction.
 */

import { ref, computed } from 'vue';
import { toRaw }         from 'vue';
import { registerHistoryManager } from './historyBridge.js';
import { useGeoStore }       from '../stores/useGeoStore.js';
import { useHydraulicStore } from '../stores/useHydraulicStore.js';
import { useSurfaceStore }   from '../stores/useSurfaceStore.js';

const MAX_SNAPSHOTS = 50;

// Singleton state — bleibt über Komponent-Lebenszyklen hinweg erhalten.
const _past   = ref([]);
const _future = ref([]);

// ─── Extrahierungs-Helfer ─────────────────────────────────────────────────────
// toRaw() entfernt den Vue-Proxy-Wrapper rekursiv aus dem obersten Objekt.
// JSON-Roundtrip danach erledigt die Tiefenkopiierung sicher ohne structuredClone-Fehler
// bei verschachtelten Proxies (THREE.Vector3, Vue-reaktive Arrays, etc.)

function deepClean(obj) {
    // Strip all Vue proxies then deep-copy via JSON (handles nested reactive objects)
    return JSON.parse(JSON.stringify(toRaw(obj)));
}

function extractGeo(store) {
    return {
        nodes:         deepClean(store.nodes),
        boundaries:    deepClean(store.boundaries),
        modifications: deepClean(store.modifications),
        weirs:         deepClean(store.weirs),
        culvertLinks:  deepClean(store.culvertLinks),
    };
}

function extractHyd(store) {
    return {
        ganglinien:      deepClean(store.ganglinien),
        assignments:     deepClean(store.assignments),
        rainConfig:      deepClean(store.rainConfig),
        globalRoughness: store.globalRoughness,
        rainSeries:      store.rainSeries ? deepClean(store.rainSeries) : null,
    };
}

function extractSurf(store) {
    return {
        materials:        deepClean(store.materials),
        activeMaterialId: store.activeMaterialId,
        brushRadius:      store.brushRadius,
    };
}


// ─── Restore-Helfer ───────────────────────────────────────────────────────────

function restoreGeo(store, snap) {
    store.nodes         = snap.nodes;
    store.boundaries    = snap.boundaries;
    store.modifications = snap.modifications;
    store.weirs         = snap.weirs;
    store.culvertLinks  = snap.culvertLinks;
}

function restoreHyd(store, snap) {
    store.ganglinien      = snap.ganglinien;
    store.assignments     = snap.assignments;
    store.rainConfig      = snap.rainConfig;
    store.globalRoughness = snap.globalRoughness;
    store.rainSeries      = snap.rainSeries;
}

function restoreSurf(store, snap) {
    store.materials        = snap.materials;
    store.activeMaterialId = snap.activeMaterialId;
    store.brushRadius      = snap.brushRadius;
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useHistoryManager() {
    const geoStore  = useGeoStore();
    const hydStore  = useHydraulicStore();
    const surfStore = useSurfaceStore();

    const canUndo     = computed(() => _past.value.length > 0);
    const canRedo     = computed(() => _future.value.length > 0);
    const historySize = computed(() => _past.value.length);

    // Register saveState with the bridge so GeoStore can call it synchronously
    // (avoids circular-import and async-timing issues)
    registerHistoryManager(saveState);

    /**
     * Erfasst einen atomaren Snapshot aller drei Stores.
     * MUSS VOR einer mutativen Action aufgerufen werden.
     * @param {string} [label='']
     */
    function saveState(label = '') {
        if (_past.value.length >= MAX_SNAPSHOTS) {
            _past.value.shift(); // FIFO-Eviction
        }

        _past.value.push({
            ts:    Date.now(),
            label: label || `Snapshot #${_past.value.length + 1}`,
            geo:   extractGeo(geoStore),
            hyd:   extractHyd(hydStore),
            surf:  extractSurf(surfStore),
        });

        // Neue Action invalidiert Redo-Future
        _future.value = [];

        console.debug(`[HistoryManager] saveState: "${label}" (${_past.value.length} snapshots)`);
    }

    /**
     * Stellt den letzten Snapshot ATOMAR wieder her.
     * Alle drei Stores werden synchron zurückgeschrieben —
     * es gibt keinen Zwischen-Tick, in dem ein Store am alten
     * und ein anderer am neuen Stand ist.
     */
    function undo() {
        if (!canUndo.value) return;

        // Aktuellen Stand für Redo sichern
        _future.value.push({
            ts:    Date.now(),
            label: 'redo-checkpoint',
            geo:   extractGeo(geoStore),
            hyd:   extractHyd(hydStore),
            surf:  extractSurf(surfStore),
        });

        const prev = _past.value.pop();

        // ATOMAR: kein await, kein nextTick zwischen den drei Writes
        restoreGeo(geoStore, prev.geo);
        restoreHyd(hydStore, prev.hyd);
        restoreSurf(surfStore, prev.surf);

        console.debug(`[HistoryManager] undo: restored "${prev.label}"`);
    }

    /** Stellt den nächsten Redo-Snapshot wieder her. */
    function redo() {
        if (!canRedo.value) return;

        _past.value.push({
            ts:    Date.now(),
            label: 'undo-checkpoint',
            geo:   extractGeo(geoStore),
            hyd:   extractHyd(hydStore),
            surf:  extractSurf(surfStore),
        });

        const next = _future.value.pop();

        restoreGeo(geoStore, next.geo);
        restoreHyd(hydStore, next.hyd);
        restoreSurf(surfStore, next.surf);

        console.debug(`[HistoryManager] redo: restored "${next.label}"`);
    }

    /** Löscht die komplette History (z.B. beim Laden eines neuen Projekts). */
    function clearHistory() {
        _past.value   = [];
        _future.value = [];
        console.debug('[HistoryManager] History cleared.');
    }

    /** Debug-Helfer: Gibt lesbare Zusammenfassung der History in der Console aus. */
    function dumpHistory() {
        console.table(_past.value.map((s, i) => ({
            index: i,
            label: s.label,
            time:  new Date(s.ts).toISOString(),
            nodes: s.geo.nodes.length,
            weirs: s.geo.weirs.length,
        })));
    }

    return {
        saveState,
        undo,
        redo,
        clearHistory,
        dumpHistory,
        canUndo,
        canRedo,
        historySize,
    };
}
