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

export function notifyPreMutate(label) {
    _saveStateFn?.(label);
}

// ─── Terrain History (Raster-Daten) ──────────────────────────────────────────
// Separate History nur für gridData-Mutationen (Shovel + Crop).
// Benutzt Sparse-Patches für Shovel und vollständige Snapshots für Crop.
// Max 5 Einträge — Float32Arrays können groß sein!

const MAX_TERRAIN_SNAPSHOTS = 5;

const _terrainPast   = [];
const _terrainFuture = [];

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

    if (_terrainPast.length >= MAX_TERRAIN_SNAPSHOTS) _terrainPast.shift();

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

    if (_terrainPast.length >= MAX_TERRAIN_SNAPSHOTS) _terrainPast.shift();

    _terrainPast.push({
        type:  'PATCH',
        cells: patch.map(p => ({ idx: p.idx, z: p.oldZ })),
    });

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
        _setTerrainFn(snap);
    } else {
        // PATCH: Aktuelle Zellwerte für Redo sichern, dann alte einspielen
        const redoPatch = snap.cells.map(c => ({ idx: c.idx, z: t.gridData[c.idx] }));
        _terrainFuture.push({ type: 'PATCH', cells: redoPatch });

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
        _setTerrainFn(snap);
    } else {
        const undoPatch = snap.cells.map(c => ({ idx: c.idx, z: t.gridData[c.idx] }));
        _terrainPast.push({ type: 'PATCH', cells: undoPatch });

        snap.cells.forEach(c => { t.gridData[c.idx] = c.z; });
        _setTerrainFn(t);
    }

    _syncCounts();
    console.debug(`[TerrainHistory] redo (${snap.type})`);
    return true;
}
