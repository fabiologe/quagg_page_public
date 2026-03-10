/**
 * Perform Ray-Casting Point-in-Polygon algorithm.
 * @param {Array<{x: number, y: number}>} polygon - Array of vertices
 * @param {number} x - Point X
 * @param {number} y - Point Y
 * @returns {boolean} True if point is inside the polygon
 */
function isPointInPolygon(polygon, x, y) {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
}

/**
 * Rasterisiert ein Vektor-Polygon und identifiziert aktive Zellen und Randzellen.
 * @param {Array<{x: number, y: number}>} polygon - Die Eckpunkte des Polygons.
 * @param {Object} header - LISFLOOD Raster-Header { xllcorner, yllcorner, cellsize, ncols, nrows }.
 * @returns {Object} { activeIndices: Array<number>, boundaryIndices: Set<number> }
 */
export function getPolygonIndices(polygon, header) {
    if (!polygon || polygon.length < 3 || !header) {
        return { activeIndices: [], boundaryIndices: new Set() };
    }

    const { xllcorner, yllcorner, cellsize, nrows, ncols } = header;

    // 1. Bounding Box Optimierung
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const pt = polygon[i];
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    }

    // Rasterkoordinaten berechnen
    const startCol = Math.max(0, Math.floor((minX - xllcorner) / cellsize));
    const endCol = Math.min(ncols - 1, Math.ceil((maxX - xllcorner) / cellsize));

    // Top-Down Grid annehmen (row 0 = Y max)
    const topEdgeY = yllcorner + nrows * cellsize;
    const startRow = Math.max(0, Math.floor((topEdgeY - maxY) / cellsize));
    const endRow = Math.min(nrows - 1, Math.ceil((topEdgeY - minY) / cellsize));

    const activeIndices = [];

    // 2. Ray-Casting & Active Indices
    for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
            const cellCenterY = topEdgeY - (row + 0.5) * cellsize;
            const cellCenterX = xllcorner + (col + 0.5) * cellsize;

            if (isPointInPolygon(polygon, cellCenterX, cellCenterY)) {
                activeIndices.push(row * ncols + col);
            }
        }
    }

    // Optimiere Nachbarschaftssuche durch Set
    const activeSet = new Set(activeIndices);
    const boundaryIndices = new Set();

    // 3. Boundary Detection (Post-Processing)
    for (let i = 0; i < activeIndices.length; i++) {
        const idx = activeIndices[i];
        const r = Math.floor(idx / ncols);
        const c = idx % ncols;

        // 4 Nachbarn berechnen
        const top = (r > 0) ? idx - ncols : -1;
        const bottom = (r < nrows - 1) ? idx + ncols : -1;
        const left = (c > 0) ? idx - 1 : -1;
        const right = (c < ncols - 1) ? idx + 1 : -1;

        // Wenn ein Nachbar nicht im Polygon liegt oder off-grid ist -> Randzelle
        if (top === -1 || !activeSet.has(top) ||
            bottom === -1 || !activeSet.has(bottom) ||
            left === -1 || !activeSet.has(left) ||
            right === -1 || !activeSet.has(right)) {
            boundaryIndices.add(idx);
        }
    }

    return { activeIndices, boundaryIndices };
}

/**
 * Berechnet das Wasservolumen und das Konfidenzintervall für ein Raster-Polygon.
 * @param {Array<number>} activeIndices - 1D-Grid-Indizes, deren Zentrum im Polygon liegt.
 * @param {Set<number>} boundaryIndices - Subset der Indizes, die exakt am Polygon-Rand liegen.
 * @param {Float32Array} depths - Das Wassertiefen-Array des aktuellen Zeitschritts.
 * @param {number} cellsize - Kantenlänge einer Zelle in Metern (z.B. 1 oder 2).
 * @param {number} zTolerance - Angenommene Höhenungenauigkeit des DGM in Metern (Default 0.05).
 * @returns {Object} { volume, error, formattedVolume, formattedError }
 */
export function calculateVolumeWithConfidence(activeIndices, boundaryIndices, depths, cellsize, zTolerance = 0.05) {
    if (!activeIndices || activeIndices.length === 0 || !depths) {
        return { volume: 0, error: 0, formattedVolume: "0", formattedError: "0" };
    }

    const cellArea = cellsize * cellsize;

    let totalVolume = 0;
    let floodedCellCount = 0;
    let geometricError = 0;

    // Iterative Hochleistungsschleife (eine Iteration für alles)
    for (let i = 0; i < activeIndices.length; i++) {
        const idx = activeIndices[i];
        const depth = depths[idx];

        // Wir betrachten nur "nasse" Zellen (Tiefe > 0.005 m)
        if (depth > 0.005) {
            totalVolume += depth * cellArea;
            floodedCellCount++;

            // Ist die Zelle eine nasse Randzelle? -> Geometrischen Fehler aufaddieren (Tiefe * Fläche * 50%)
            if (boundaryIndices.has(idx)) {
                geometricError += depth * cellArea * 0.5;
            }
        }
    }

    // Physischer Fehler: Toleranz des DGMs für alle nassen Zellen
    const physicalError = floodedCellCount * cellArea * zTolerance;

    // Gesamter Fehler (Konfidenzintervall)
    const totalError = geometricError + physicalError;

    // Integer Formatierung ohne Nachkommastellen für die UI
    const formatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

    return {
        volume: totalVolume,
        error: totalError,
        formattedVolume: formatter.format(totalVolume),
        formattedError: formatter.format(totalError)
    };
}
