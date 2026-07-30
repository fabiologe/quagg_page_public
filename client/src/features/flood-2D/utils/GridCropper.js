/**
 * GridCropper.js
 * Pure utility for cropping a DEM Float32Array to an axis-aligned bounding box.
 *
 * COORDINATE SYSTEM NOTE:
 * The grid is stored BOTTOM-UP: row index 0 is the SOUTHERNMOST row,
 * row index (nrows-1) is the NORTHERNMOST row. This is consistent with the
 * rest of the flood-2D codebase (Rasterizer.js, BoundaryTools.js).
 *
 * yllcorner always describes the SOUTH edge of the raster.
 * World-Y → row index:   row = (worldY - yll) / cellsize
 * New yllcorner after crop: newYll = oldYll + minRow * cellsize
 */

/**
 * Clamps an integer index to [lo, hi].
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Crops a 1-D Float32Array DEM to the given world-coordinate bounding box.
 *
 * @param {Float32Array} gridData   - Source raster (bottom-up row order)
 * @param {Object}       header     - Header metadata; supports both xll/yll and
 *                                    xllcorner/yllcorner naming conventions.
 *   {number} header.ncols
 *   {number} header.nrows
 *   {number} header.cellsize
 *   {number} header.xll | header.xllcorner
 *   {number} header.yll | header.yllcorner
 *   {number} [header.NODATA_value]
 * @param {Object} boundingBox      - Crop region in world coordinates.
 *   {number} boundingBox.minX
 *   {number} boundingBox.maxX
 *   {number} boundingBox.minY   ← south edge (smaller Y)
 *   {number} boundingBox.maxY   ← north edge (larger Y)
 *
 * @returns {{ newGridData: Float32Array, newHeader: Object }}
 * @throws {Error} If the bounding box does not intersect the grid at all.
 */
export function cropGrid(gridData, header, boundingBox) {
    // ── 1. Resolve header aliases ─────────────────────────────────────────────
    const { ncols, nrows, cellsize } = header;
    const xll = header.xllcorner !== undefined ? header.xllcorner : header.xll;
    const yll = header.yllcorner !== undefined ? header.yllcorner : header.yll;
    const nodataValue = header.NODATA_value !== undefined ? header.NODATA_value : -9999;

    const { minX, maxX, minY, maxY } = boundingBox;

    // ── 2. World coordinates → column / row indices (bottom-up) ──────────────
    //   col = (worldX - xll) / cellsize   (no inversion needed for X)
    //   row = (worldY - yll) / cellsize   (bottom-up: south = row 0)
    const rawMinCol = Math.floor((minX - xll) / cellsize);
    const rawMaxCol = Math.floor((maxX - xll) / cellsize);
    const rawMinRow = Math.floor((minY - yll) / cellsize);   // south row  (smaller index)
    const rawMaxRow = Math.floor((maxY - yll) / cellsize);   // north row  (larger index)

    // ── 3. Clamp to valid grid extent ─────────────────────────────────────────
    const minCol = clamp(rawMinCol, 0, ncols - 1);
    const maxCol = clamp(rawMaxCol, 0, ncols - 1);
    const minRow = clamp(rawMinRow, 0, nrows - 1);  // south boundary
    const maxRow = clamp(rawMaxRow, 0, nrows - 1);  // north boundary

    if (minCol > maxCol || minRow > maxRow) {
        throw new Error(
            `[GridCropper] Bounding box (minX:${minX}, maxX:${maxX}, minY:${minY}, maxY:${maxY}) ` +
            `does not intersect the grid (xll:${xll}, yll:${yll}, ncols:${ncols}, nrows:${nrows}).`
        );
    }

    // ── 4. New dimensions ─────────────────────────────────────────────────────
    const newCols = maxCol - minCol + 1;
    const newRows = maxRow - minRow + 1;

    // ── 5. Allocate result and copy row-by-row ────────────────────────────────
    //   Layout of oldArray:  idx = row * ncols + col   (row 0 = south)
    //   Layout of newArray:  idx = newRow * newCols + newCol
    //                        newRow = row - minRow,  newCol = col - minCol
    const newGridData = new Float32Array(newCols * newRows);

    for (let row = minRow; row <= maxRow; row++) {
        const srcRowStart = row * ncols + minCol;
        const dstRowStart = (row - minRow) * newCols;
        newGridData.set(
            gridData.subarray(srcRowStart, srcRowStart + newCols),
            dstRowStart
        );
    }

    // ── 6. New header ─────────────────────────────────────────────────────────
    //   newXllcorner: west edge of the leftmost kept column
    //   newYllcorner: south edge of the bottommost kept row (bottom-up!)
    //                 = oldYll + minRow * cellsize
    //                 (NOT oldYll + (oldNrows-1-maxRow)*cellsize — that formula
    //                  applies to top-down storage and would be wrong here)
    const newXll = xll + minCol * cellsize;
    const newYll = yll + minRow * cellsize;

    const newHeader = {
        ncols: newCols,
        nrows: newRows,
        cellsize,
        xllcorner: newXll,
        yllcorner: newYll,
        xll: newXll, // keep both aliases for compatibility
        yll: newYll,
        NODATA_value: nodataValue,
    };

    console.log(
        `[GridCropper] Cropped grid: ` +
        `cols [${minCol}–${maxCol}] rows [${minRow}–${maxRow}] → ` +
        `${newCols}×${newRows} cells ` +
        `(xll: ${newXll.toFixed(2)}, yll: ${newYll.toFixed(2)})`
    );

    return { newGridData, newHeader };
}

/**
 * Masks a DEM by an irregular polygon: cells whose centre lies OUTSIDE the
 * polygon are set to NODATA; cells inside are left untouched.
 * The grid dimensions (ncols / nrows / header) do NOT change.
 *
 * @param {Float32Array} gridData  - Source raster (bottom-up, row 0 = south)
 * @param {Object}       header    - Header (same shape / aliases as cropGrid)
 * @param {Array<{x: number, y: number}>} polygon
 *   Polygon vertices in WORLD coordinates (same CRS as header).
 *   The ring does NOT need to be explicitly closed (first ≠ last is fine).
 *
 * @returns {Float32Array} New Float32Array (same size) with outside cells = NODATA
 */
export function maskGridByPolygon(gridData, header, polygon) {
    const { ncols, nrows, cellsize } = header;
    const xll = header.xllcorner !== undefined ? header.xllcorner : header.xll;
    const yll = header.yllcorner !== undefined ? header.yllcorner : header.yll;
    const nodata = header.NODATA_value !== undefined ? header.NODATA_value : -9999;

    if (!polygon || polygon.length < 3) {
        throw new Error('[GridCropper] maskGridByPolygon: polygon needs at least 3 vertices.');
    }

    // Copy so the original is not mutated
    const result = new Float32Array(gridData);

    // Cell centre world coords: same formula as Rasterizer.js
    //   worldX = xll + col * cellsize
    //   worldY = yll + row * cellsize   (row 0 = south, bottom-up)
    let masked = 0;
    for (let row = 0; row < nrows; row++) {
        const cy = yll + row * cellsize;          // world Y of cell centre
        for (let col = 0; col < ncols; col++) {
            const idx = row * ncols + col;
            if (result[idx] <= -9000) continue;   // already NODATA – skip

            const cx = xll + col * cellsize;      // world X of cell centre
            if (!pointInPolygon(cx, cy, polygon)) {
                result[idx] = nodata;
                masked++;
            }
        }
    }

    console.log(`[GridCropper] maskGridByPolygon: ${masked} cells set to NODATA.`);
    return result;
}

/**
 * Ray-casting Point-in-Polygon test (same algorithm as Rasterizer.js).
 * Polygon vertices: array of {x, y} in world coords.
 * Exportiert: auch der Netz-Zuschnitt (useNetworkStore.cropOutside via usePolygonCropTool)
 * nutzt exakt denselben Test — Raster-Maske und Netz-Loeschung bleiben deckungsgleich.
 */
export function pointInPolygon(px, py, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

