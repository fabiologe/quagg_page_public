/**
 * src/features/flood-2D/utils/VolumeAnalyzer.js
 * 
 * Performance-optimized math engine for calculating the impounded water volume
 * within a user-drawn polygon.
 */

/**
 * Perform Ray-Casting Point-in-Polygon algorithm.
 * @param {Array<{x, y}>} polygon - Array of vertices
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
 * Phase 1.1: Calculate exact grid indices inside the given polygon bounds
 * 
 * @param {Array<{x, y}>} polygonCoords - Array of world coordinates representing the drawn polygon
 * @param {Object} gridHeader - Contains xllcorner, yllcorner, cellsize, nrows, ncols
 * @returns {{ activeIndices: number[], boundaryIndices: number[] }}
 */
export function getPolygonIndices(polygonCoords, gridHeader) {
    if (!polygonCoords || polygonCoords.length < 3 || !gridHeader) {
        return { activeIndices: [], boundaryIndices: [] };
    }

    const { xllcorner, yllcorner, cellsize, nrows, ncols } = gridHeader;

    // 1. Calculate Bounding Box of the Polygon
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of polygonCoords) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    }

    // 2. Map Bounding Box to Grid Col/Row ranges
    // Note: yllcorner is the bottom edge. nrows is total rows.
    // Row 0 is often considered the Top in top-down formats (like ASC output where depthData lives)
    // We assume the data array is top-down (row 0 = North).

    const startCol = Math.max(0, Math.floor((minX - xllcorner) / cellsize));
    const endCol = Math.min(ncols - 1, Math.ceil((maxX - xllcorner) / cellsize));

    // Invert Y logic for top-down grid:
    // maxY corresponds to the lowest row index (closest to 0).
    const topEdgeY = yllcorner + nrows * cellsize;
    const startRow = Math.max(0, Math.floor((topEdgeY - maxY) / cellsize));
    const endRow = Math.min(nrows - 1, Math.ceil((topEdgeY - minY) / cellsize));

    const insideSet = new Set();
    const activeIndices = [];
    const boundaryIndices = [];

    // 3. Ray-Cast: Iterate over Bounding Box only
    for (let row = startRow; row <= endRow; row++) {
        for (let col = startCol; col <= endCol; col++) {
            // Cell center coordinates
            const cellCenterY = topEdgeY - (row + 0.5) * cellsize;
            const cellCenterX = xllcorner + (col + 0.5) * cellsize;

            if (isPointInPolygon(polygonCoords, cellCenterX, cellCenterY)) {
                const idx = row * ncols + col;
                insideSet.add(idx);
                activeIndices.push(idx);
            }
        }
    }

    // 4. Identify Boundary Cells (cells inside, but touching the outside)
    for (const idx of activeIndices) {
        const r = Math.floor(idx / ncols);
        const c = idx % ncols;

        // Check 4-way neighbors
        const neighbors = [
            (r > 0) ? idx - ncols : -1,         // Top
            (r < nrows - 1) ? idx + ncols : -1, // Bottom
            (c > 0) ? idx - 1 : -1,             // Left
            (c < ncols - 1) ? idx + 1 : -1      // Right
        ];

        let isBoundary = false;
        for (const n of neighbors) {
            // If a neighbor is off-grid OR not in our polygon, then `idx` is a boundary cell
            if (n === -1 || !insideSet.has(n)) {
                isBoundary = true;
                break;
            }
        }

        if (isBoundary) {
            boundaryIndices.push(idx);
        }
    }

    console.log(`[VolumeAnalyzer] Pre-calculated ${activeIndices.length} active cells (${boundaryIndices.length} boundary).`);
    return { activeIndices, boundaryIndices };
}


/**
 * Phase 1.2: Calculate the Volume and Confidence Interval rapidly.
 * Designed to be extremely fast to run at 60fps on slider move.
 * 
 * @param {{ activeIndices: number[], boundaryIndices: number[] }} indicesObj 
 * @param {Float32Array|Array<number>} depths - 1D Array of current water depths
 * @param {number} cellsize 
 * @param {number} zTolerance - Default DGM error margin (e.g. 0.05 meters)
 * @returns {{ volume: number, error: number }}
 */
export function calculateVolumeWithConfidence(indicesObj, depths, cellsize, zTolerance = 0.05) {
    if (!indicesObj || !indicesObj.activeIndices || !depths) {
        return { volume: 0, error: 0, relativeError: 0, confidenceScore: 0 };
    }

    const { activeIndices, boundaryIndices } = indicesObj;
    const boundarySet = new Set(boundaryIndices);
    const cellArea = cellsize * cellsize;

    let internalVol = 0;
    let floodedInternalArea = 0;

    let boundaryVol = 0;
    let floodedBoundaryArea = 0;

    for (let i = 0; i < activeIndices.length; i++) {
        const idx = activeIndices[i];
        const depth = depths[idx];
        if (depth > 0.005) { // Ignore microscopically thin water films
            if (boundarySet.has(idx)) {
                boundaryVol += (depth * cellArea);
                floodedBoundaryArea += cellArea;
            } else {
                internalVol += (depth * cellArea);
                floodedInternalArea += cellArea;
            }
        }
    }

    // Best Estimate: 100% of internal water + 50% of boundary water
    const estimatedVolume = internalVol + (boundaryVol * 0.5);

    // Error 1: Boundary Edge Deviation. The polygon could actually include 0% or 100% of the boundary cells.
    // Our estimate assumes 50%. Therefore the uncertainty is ±50% of the boundary volume.
    const boundaryUncertainty = boundaryVol * 0.5;

    // Error 2: DGM Vertical Tolerance (± zTolerance affects all flooded area).
    const floodedArea = floodedInternalArea + (floodedBoundaryArea * 0.5);
    const physicalErrorVol = floodedArea * zTolerance;

    // Total Error: Add geometric border uncertainty and overall Z-tolerance uncertainty
    const absoluteError = boundaryUncertainty + physicalErrorVol;

    // Calculate Relative Error and Confidence Score
    let relativeError = 0;
    let confidenceScore = 0;

    if (estimatedVolume > 0) {
        relativeError = absoluteError / estimatedVolume;
        // e.g., if relativeError is 0.05 (5%), confidence is 0.95 (95%)
        confidenceScore = Math.max(0, 1 - relativeError);
    }

    return {
        volume: estimatedVolume,
        error: absoluteError,              // Absolute margin in m³
        relativeError: relativeError,      // 0.0 to 1.0+ (fraction)
        confidenceScore: confidenceScore   // 0.0 to 1.0 (clamped)
    };
}
