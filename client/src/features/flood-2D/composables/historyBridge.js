/**
 * historyBridge.js
 *
 * Winziges Brückenmodul ohne Store-Imports.
 * Löst die Kreisabhängigkeit zwischen GeoStore → HistoryManager.
 *
 * GeoStore importiert DIESES Modul (keine Kreisabhängigkeit).
 * HistoryManager registriert sich einmalig hier.
 * GeoStore ruft notifyPreMutate() — synchron, kein await nötig.
 */

import { ref } from 'vue';

// ─── Vektor-History Bridge ────────────────────────────────────────────────────

let _saveStateFn = null;

export function registerHistoryManager(fn) {
    _saveStateFn = fn;
}

/**
 * Meldet eine BEVORSTEHENDE Mutation → History legt vorher einen Snapshot an.
 * @param {string} label   Anzeigetext im Verlauf
 * @param {'geo'|'net'} [scope]  welcher Store gleich mutiert. Erlaubt der History,
 *   die Klone der NICHT betroffenen Stores wiederzuverwenden (Copy-on-Write) statt
 *   bei jedem Edit alle Daten neu zu kopieren. Ohne Angabe wird defensiv alles geklont.
 */
export function notifyPreMutate(label, scope) {
    _saveStateFn?.(label, scope);
}

// ─── Terrain History (Raster-Daten) ──────────────────────────────────────────
// Separate History nur für gridData-Mutationen (Shovel + Crop).
// Benutzt Sparse-Patches für Shovel und vollständige Snapshots für Crop.
// Max 5 Einträge — Float32Arrays können groß sein!

const MAX_TERRAIN_SNAPSHOTS = 5;
// Byte-Budget für FULL-Snapshots (Crop/Mask kopieren das ganze gridData). Patches sind winzig
// und zählen praktisch nicht. Bound BEIDE Stacks (past+future) gegen RAM-Wachstum bei Undo/Redo.
const MAX_TERRAIN_BYTES = 96 * 1024 * 1024; // ~96 MB

const _terrainPast   = [];
const _terrainFuture = [];

/** Summiert die Bytes der FULL-Snapshots einer History-Liste. */
function _fullBytes(list) {
    let b = 0;
    for (const s of list) if (s.type === 'FULL' && s.gridData) b += s.gridData.byteLength;
    return b;
}

/** Begrenzt eine History-Liste gegen Count- UND Byte-Budget (älteste Einträge zuerst raus). */
function _evict(list) {
    while (list.length > MAX_TERRAIN_SNAPSHOTS) list.shift();
    while (list.length > 1 && _fullBytes(list) > MAX_TERRAIN_BYTES) list.shift();
}

// Reaktive Zähler — damit Vue computed-Props auf Änderungen reagieren können
export const terrainUndoCount = ref(0);
export const terrainRedoCount = ref(0);

function _syncCounts() {
    terrainUndoCount.value = _terrainPast.length;
    terrainRedoCount.value = _terrainFuture.length;
}

// Callbacks die der GeoStore registriert
let _getTerrainFn = null;
let _setTerrainFn = null;

export function registerTerrainAccessors(getFn, setFn) {
    _getTerrainFn = getFn;
    _setTerrainFn = setFn;
}

// ─── Snapshot Helpers ─────────────────────────────────────────────────────────

/**
 * Vollständiger Terrain-Snapshot (für Crop/Mask).
 * Kopiert das gesamte gridData Float32Array + Header.
 */
export function saveTerrainSnapshot() {
    if (!_getTerrainFn) return;
    const t = _getTerrainFn();
    if (!t || !t.gridData) return;

    _terrainPast.push({
        type:     'FULL',
        gridData:  t.gridData.slice(),
        ncols:     t.ncols,
        nrows:     t.nrows,
        cellsize:  t.cellsize,
        xllcorner: t.xllcorner,
        yllcorner: t.yllcorner,
        xll:       t.xll,
        yll:       t.yll,
        minZ:      t.minZ,
        maxZ:      t.maxZ,
        bounds:    t.bounds ? { ...t.bounds } : null,
        center:    t.center ? { ...t.center } : null,
        stats:     t.stats  ? { ...t.stats  } : null,
    });
    _evict(_terrainPast);

    _terrainFuture.length = 0;
    _syncCounts();
    console.debug('[TerrainHistory] Full snapshot saved.');
}

/**
 * Sparse-Patch-Snapshot (für Shovel-Commit).
 * Speichert nur die geänderten Zellen {index, oldZ}.
 * @param {Array<{idx: number, oldZ: number}>} patch
 */
export function saveTerrainPatch(patch) {
    if (!patch || patch.length === 0) return;

    _terrainPast.push({
        type:  'PATCH',
        cells: patch.map(p => ({ idx: p.idx, z: p.oldZ })),
    });
    _evict(_terrainPast);

    _terrainFuture.length = 0;
    _syncCounts();
    console.debug(`[TerrainHistory] Patch snapshot saved (${patch.length} cells).`);
}

// ─── Query ────────────────────────────────────────────────────────────────────

/** @returns {boolean} */
export function canUndoTerrain() { return _terrainPast.length > 0; }

/** @returns {boolean} */
export function canRedoTerrain() { return _terrainFuture.length > 0; }

// ─── Undo / Redo ──────────────────────────────────────────────────────────────

/**
 * Macht die letzte Terrain-Änderung rückgängig.
 * @returns {boolean}
 */
export function undoTerrain() {
    if (_terrainPast.length === 0) return false;
    if (!_getTerrainFn || !_setTerrainFn) return false;

    const t = _getTerrainFn();
    if (!t || !t.gridData) return false;

    const snap = _terrainPast.pop();

    if (snap.type === 'FULL') {
        _terrainFuture.push({
            type:     'FULL',
            gridData:  t.gridData.slice(),
            ncols:     t.ncols,  nrows:     t.nrows,
            cellsize:  t.cellsize,
            xllcorner: t.xllcorner, yllcorner: t.yllcorner,
            xll:       t.xll,   yll:       t.yll,
            minZ:      t.minZ,  maxZ:      t.maxZ,
            bounds:    t.bounds ? { ...t.bounds } : null,
            center:    t.center ? { ...t.center } : null,
            stats:     t.stats  ? { ...t.stats  } : null,
        });
        _evict(_terrainFuture);
        _setTerrainFn(snap);
    } else {
        // PATCH: Aktuelle Zellwerte für Redo sichern, dann alte einspielen
        const redoPatch = snap.cells.map(c => ({ idx: c.idx, z: t.gridData[c.idx] }));
        _terrainFuture.push({ type: 'PATCH', cells: redoPatch });
        _evict(_terrainFuture);

        snap.cells.forEach(c => { t.gridData[c.idx] = c.z; });
        _setTerrainFn(t); // triggert terrainVersion++
    }

    _syncCounts();
    console.debug(`[TerrainHistory] undo (${snap.type})`);
    return true;
}

/**
 * Stellt die letzte rückgängig gemachte Terrain-Änderung wieder her.
 * @returns {boolean}
 */
export function redoTerrain() {
    if (_terrainFuture.length === 0) return false;
    if (!_getTerrainFn || !_setTerrainFn) return false;

    const t = _getTerrainFn();
    const snap = _terrainFuture.pop();

    if (snap.type === 'FULL') {
        _terrainPast.push({
            type:     'FULL',
            gridData:  t.gridData.slice(),
            ncols:     t.ncols,  nrows:     t.nrows,
            cellsize:  t.cellsize,
            xllcorner: t.xllcorner, yllcorner: t.yllcorner,
            xll:       t.xll,   yll:       t.yll,
            minZ:      t.minZ,  maxZ:      t.maxZ,
            bounds:    t.bounds ? { ...t.bounds } : null,
            center:    t.center ? { ...t.center } : null,
            stats:     t.stats  ? { ...t.stats  } : null,
        });
        _evict(_terrainPast);
        _setTerrainFn(snap);
    } else {
        const undoPatch = snap.cells.map(c => ({ idx: c.idx, z: t.gridData[c.idx] }));
        _terrainPast.push({ type: 'PATCH', cells: undoPatch });
        _evict(_terrainPast);

        snap.cells.forEach(c => { t.gridData[c.idx] = c.z; });
        _setTerrainFn(t);
    }

    _syncCounts();
    console.debug(`[TerrainHistory] redo (${snap.type})`);
    return true;
}
