/**
 * terrainSampling.js — Einzelpunkt-Höhenabfrage aus einem geladenen DGM
 * (`store.terrain`, siehe xyzTerrainImporter.js/makeTerrainObject()).
 *
 * Bewusst getrennt von xyzTerrainImporter.js: läuft synchron auf dem
 * Main-Thread beim Öffnen des Schacht-Erstellen-Modals (kein Delaunay/Worker-
 * Ballast nötig), und bekommt später einen zweiten Aufrufer (Bulk-Vorschlag
 * in PreprocessingModal.vue).
 */

const NODATA_THRESHOLD = -9000; // konsistent mit xyzTerrainImporter.js (NODATA=-9999)

/**
 * Bilineare Interpolation der Geländehöhe an einer Welt-Koordinate (x,y),
 * im selben CRS wie das Kanalnetz (kein Reprojektions-Schritt nötig, siehe
 * Projektentscheidung: DGM wird im Netz-CRS hochgeladen).
 *
 * Rand-/Außerhalb-Koordinaten werden auf die nächste gültige Rasterzelle
 * geklemmt (kein Extrapolations-Overshoot) statt eine Ausnahme zu werfen —
 * nur ein fehlendes/unvollständiges Terrain-Objekt oder eine NODATA-beteiligte
 * Zelle liefert `null`.
 *
 * @param {object|null} terrain  kanonisches Terrain-Objekt (gridData/ncols/nrows/cellsize/xll/yll)
 * @param {number} x
 * @param {number} y
 * @returns {number|null}
 */
export function sampleTerrainAt(terrain, x, y) {
    if (!terrain || !terrain.gridData) return null;
    const { gridData, ncols, nrows, cellsize, xll, yll } = terrain;
    if (!(ncols > 0) || !(nrows > 0) || !(cellsize > 0)) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const fCol = clamp((x - xll) / cellsize, 0, ncols - 1);
    const fRow = clamp((y - yll) / cellsize, 0, nrows - 1);

    const col0 = Math.floor(fCol);
    const row0 = Math.floor(fRow);
    const col1 = Math.min(col0 + 1, ncols - 1);
    const row1 = Math.min(row0 + 1, nrows - 1);
    const tx = fCol - col0;
    const ty = fRow - row0;

    const z00 = gridData[row0 * ncols + col0];
    const z10 = gridData[row0 * ncols + col1];
    const z01 = gridData[row1 * ncols + col0];
    const z11 = gridData[row1 * ncols + col1];
    if (z00 <= NODATA_THRESHOLD || z10 <= NODATA_THRESHOLD || z01 <= NODATA_THRESHOLD || z11 <= NODATA_THRESHOLD) {
        return null;
    }

    const zTop = z00 + (z10 - z00) * tx;
    const zBottom = z01 + (z11 - z01) * tx;
    return zTop + (zBottom - zTop) * ty;
}

function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}
