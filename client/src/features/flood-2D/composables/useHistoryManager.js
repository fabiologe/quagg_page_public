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
import { useNetworkStore }   from '../stores/useNetworkStore.js';

const MAX_SNAPSHOTS = 50;

// Singleton state — bleibt über Komponent-Lebenszyklen hinweg erhalten.
const _past   = ref([]);
const _future = ref([]);

// ─── Extrahierungs-Helfer ─────────────────────────────────────────────────────
// toRaw() entfernt den Vue-Proxy-Wrapper rekursiv aus dem obersten Objekt.
// JSON-Roundtrip danach erledigt die Tiefenkopiierung sicher ohne structuredClone-Fehler
// bei verschachtelten Proxies (THREE.Vector3, Vue-reaktive Arrays, etc.)

/**
 * Tiefe Kopie der Store-Daten (reine Datenbäume: Objekte, Arrays, Primitive).
 *
 * Ersetzt den früheren JSON-Roundtrip: gemessen ~4,8× schneller (39 ms → 8 ms bei einem
 * 3000-Schacht-Netz), und da bei JEDER Mutation ein Snapshot entsteht, war das der
 * spürbarste Ruckler beim Ziehen von Greifpunkten. Das Lesen der Werte erfolgt durch die
 * Vue-Proxies hindurch und erzeugt wieder einfache Objekte — entfernt die Reaktivität
 * also genauso zuverlässig wie der JSON-Umweg (toRaw greift nur eine Ebene tief).
 *
 * Bewusste Abweichungen vom alten JSON-Verhalten, beide unkritisch bzw. besser:
 *   - NaN/Infinity bleiben erhalten (JSON machte still `null` daraus)
 *   - `undefined`-Properties bleiben als Schlüssel erhalten (JSON verwarf sie)
 * Funktionen werden wie bei JSON übersprungen. Zyklen gibt es in diesen Daten nicht
 * (der JSON-Weg hätte sonst längst geworfen).
 */
function deepClean(obj) {
    return cloneValue(toRaw(obj));
}

function cloneValue(v) {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (Array.isArray(v)) {
        const out = new Array(v.length);
        for (let i = 0; i < v.length; i++) out[i] = cloneValue(v[i]);
        return out;
    }
    const out = {};
    for (const k in v) {
        const c = cloneValue(v[k]);
        if (c !== undefined || v[k] === undefined) out[k] = c;
    }
    return out;
}

function extractGeo(store) {
    // ALLE Vektor-Felder, die geoStore-Mutationen per saveSnapshot() schützen — fehlt
    // eines, „verbraucht" Undo den History-Eintrag, ohne die Änderung zurückzunehmen
    // (Symptom: 1. Undo wirkungslos, 2. Undo wirft eine ältere Aktion mit weg).
    return {
        boundaries:    deepClean(store.boundaries),
        modifications: deepClean(store.modifications),
        weirs:         deepClean(store.weirs),
        weirLines:     deepClean(store.weirLines),
        bridges:       deepClean(store.bridges),
        sgcChannels:   deepClean(store.sgcChannels),
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

function extractNet(store) {
    return {
        nodes: deepClean(store.nodes),
        links: deepClean(store.links),
    };
}


// ─── Restore-Helfer ───────────────────────────────────────────────────────────

function restoreGeo(store, snap) {
    store.boundaries    = snap.boundaries;
    store.modifications = snap.modifications;
    store.weirs         = snap.weirs;
    // Alt-Snapshots (vor dem Fix) haben die Felder nicht — dann nicht anfassen.
    if (snap.weirLines)   store.weirLines   = snap.weirLines;
    if (snap.bridges)     store.bridges     = snap.bridges;
    if (snap.sgcChannels) store.sgcChannels = snap.sgcChannels;
    // Setzt die Sammlungen am Store VORBEI — die Renderer hängen an revisions, nicht mehr
    // an deep-Watchern über die Arrays (s. useGeoStore.touch). Ohne Argument: alles neu.
    store.touch();
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

function restoreNet(store, snap) {
    // Alt-Snapshots (vor dem Netz-Undo) haben kein net-Feld — dann nichts anfassen.
    if (!snap) return;
    store.nodes = snap.nodes;
    store.links = snap.links;
    // Setzt die Arrays am Store VORBEI — der Renderer hängt an revision, nicht mehr an
    // einem deep-Watcher über die Arrays (s. useNetworkStore.touch).
    store.touch();
    if (store.selectedId && !snap.nodes.some(n => n.id === store.selectedId)
        && !snap.links.some(l => l.id === store.selectedId)) {
        store.selectedId = null;
    }
}

// ─── Composable ───────────────────────────────────────────────────────────────

export function useHistoryManager() {
    const geoStore  = useGeoStore();
    const hydStore  = useHydraulicStore();
    const surfStore = useSurfaceStore();
    const netStore  = useNetworkStore();

    const canUndo     = computed(() => _past.value.length > 0);
    const canRedo     = computed(() => _future.value.length > 0);
    const historySize = computed(() => _past.value.length);

    // Register saveState with the bridge so GeoStore can call it synchronously
    // (avoids circular-import and async-timing issues)
    registerHistoryManager(saveState);

    // ─── Copy-on-Write für die beiden großen Stores ───────────────────────────
    // geo (Gebäude/Wehre/Brücken/…) und net (Schächte/Haltungen) sind die dicken
    // Datenmengen. Beide mutieren AUSSCHLIESSLICH über notifyPreMutate(label, scope) —
    // wer nicht als scope gemeldet wurde, hat sich seit dem letzten Klon nicht geändert
    // und dessen Klon kann geteilt werden, statt ihn bei jedem fremden Edit neu zu
    // kopieren. Beim Wiederherstellen wird deshalb geklont (s. restoreShared).
    // hyd/surf werden IMMER frisch geklont: sie mutieren teils ohne Meldung (direkte
    // Property-Writes aus Komponenten) — dort wäre eine Wiederverwendung falsch, und
    // ihre Datenmenge ist klein.
    const _cow = { geo: null, net: null };
    const _cowClean = { geo: false, net: false };

    /** Snapshot aller Stores; `mutatingScope` = Store, der gleich mutiert (dessen Klon
     *  ist danach veraltet). Ohne Angabe wird defensiv alles neu geklont. */
    function captureSnapshot(label, mutatingScope) {
        if (!_cowClean.geo || !_cow.geo) { _cow.geo = extractGeo(geoStore); _cowClean.geo = true; }
        if (!_cowClean.net || !_cow.net) { _cow.net = extractNet(netStore); _cowClean.net = true; }

        const snap = {
            ts:    Date.now(),
            label,
            geo:   _cow.geo,
            hyd:   extractHyd(hydStore),
            surf:  extractSurf(surfStore),
            net:   _cow.net,
        };

        if (mutatingScope === 'geo' || mutatingScope === 'net') _cowClean[mutatingScope] = false;
        else { _cowClean.geo = false; _cowClean.net = false; }
        return snap;
    }

    /** Nach dem Zurückschreiben: die Store-Inhalte stammen jetzt aus einem Snapshot,
     *  die zwischengespeicherten Klone gelten nicht mehr als aktuell. */
    function invalidateCow() { _cowClean.geo = false; _cowClean.net = false; }

    /** geo/net-Teilbäume können von mehreren Snapshots geteilt werden — vor dem
     *  Zurückschreiben klonen, sonst mutiert der Store die Snapshots der Nachbarn mit. */
    const restoreShared = (v) => (v ? cloneValue(v) : v);

    /**
     * Erfasst einen atomaren Snapshot aller drei Stores.
     * MUSS VOR einer mutativen Action aufgerufen werden.
     * @param {string} [label='']
     * @param {'geo'|'net'} [scope]  Store, der gleich mutiert (Copy-on-Write, s. o.)
     */
    function saveState(label = '', scope) {
        if (_past.value.length >= MAX_SNAPSHOTS) {
            _past.value.shift(); // FIFO-Eviction
        }

        _past.value.push(captureSnapshot(label || `Snapshot #${_past.value.length + 1}`, scope));

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
        _future.value.push(captureSnapshot('redo-checkpoint'));

        const prev = _past.value.pop();

        // ATOMAR: kein await, kein nextTick zwischen den Writes
        restoreGeo(geoStore, restoreShared(prev.geo));
        restoreHyd(hydStore, prev.hyd);
        restoreSurf(surfStore, prev.surf);
        restoreNet(netStore, restoreShared(prev.net));
        invalidateCow();

        console.debug(`[HistoryManager] undo: restored "${prev.label}"`);
    }

    /** Stellt den nächsten Redo-Snapshot wieder her. */
    function redo() {
        if (!canRedo.value) return;

        _past.value.push(captureSnapshot('undo-checkpoint'));

        const next = _future.value.pop();

        restoreGeo(geoStore, restoreShared(next.geo));
        restoreHyd(hydStore, next.hyd);
        restoreSurf(surfStore, next.surf);
        restoreNet(netStore, restoreShared(next.net));
        invalidateCow();

        console.debug(`[HistoryManager] redo: restored "${next.label}"`);
    }

    /** Löscht die komplette History (z.B. beim Laden eines neuen Projekts). */
    function clearHistory() {
        _past.value   = [];
        _future.value = [];
        invalidateCow();   // Projektwechsel: zwischengespeicherte Klone gehören zum alten Projekt
        console.debug('[HistoryManager] History cleared.');
    }

    /** Debug-Helfer: Gibt lesbare Zusammenfassung der History in der Console aus. */
    function dumpHistory() {
        console.table(_past.value.map((s, i) => ({
            index: i,
            label: s.label,
            time:  new Date(s.ts).toISOString(),
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
