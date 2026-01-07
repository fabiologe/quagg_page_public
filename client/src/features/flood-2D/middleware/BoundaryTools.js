/**
 * BoundaryTools.js
 * A pure mathematics/geometry library for Grid/Vector operations.
 * Stateless and dependency-free.
 */

export const BoundaryTools = {
    /**
     * Implements Bresenham's Line Algorithm to find all grid cells intersected by a line segment.
     * @param {number} x0 - Start X coordinate (grid index or float, will be rounded)
     * @param {number} y0 - Start Y coordinate
     * @param {number} x1 - End X coordinate
     * @param {number} y1 - End Y coordinate
     * @returns {Array<{x: number, y: number}>} List of grid coordinates
     */
    discretizeLine(x0, y0, x1, y1) {
        // Ensure integer coordinates for grid indices
        x0 = Math.round(x0);
        y0 = Math.round(y0);
        x1 = Math.round(x1);
        y1 = Math.round(y1);

        const cells = [];
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            cells.push({ x: x0, y: y0 });

            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
        return cells;
    },

    /**
     * Identifies all grid cells that fall within a given polygon.
     * Uses Ray-Casting algorithm for Point-in-Polygon test.
     * @param {Array<Array<number>>} polygonGeoJSON - Array of [x, y] coordinates (closed loop)
     * @param {number} cellSize - Size of a grid cell
     * @param {number} xll - X coordinate of the lower-left corner of the grid
     * @param {number} yll - Y coordinate of the lower-left corner of the grid
     * @param {object} bounds - Optional bounding box {minX, minY, maxX, maxY} to optimize search
     * @returns {Array<{x: number, y: number}>} List of grid indices (col, row) inside the polygon
     */
    getCellsInPolygon(polygonGeoJSON, cellSize, xll, yll, bounds = null) {
        const cells = [];

        // 1. Calculate Bounding Box of the polygon if not provided
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        if (bounds) {
            ({ minX, minY, maxX, maxY } = bounds);
        } else {
            for (const [px, py] of polygonGeoJSON) {
                if (px < minX) minX = px;
                if (py < minY) minY = py;
                if (px > maxX) maxX = px;
                if (py > maxY) maxY = py;
            }
        }

        // 2. Convert Bounding Box to Grid Indices
        const startCol = Math.floor((minX - xll) / cellSize);
        const endCol = Math.floor((maxX - xll) / cellSize);
        const startRow = Math.floor((minY - yll) / cellSize);
        const endRow = Math.floor((maxY - yll) / cellSize);

        // 3. Iterate over the bounding box grid cells
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                // Calculate center of the cell in world coordinates
                const cellCenterX = xll + col * cellSize + cellSize / 2;
                const cellCenterY = yll + row * cellSize + cellSize / 2;

                if (this.isPointInPolygon([cellCenterX, cellCenterY], polygonGeoJSON)) {
                    cells.push({ x: col, y: row });
                }
            }
        }

        return cells;
    },

    /**
     * Helper: Ray-Casting algorithm to check if a point is inside a polygon
     * @param {Array<number>} point - [x, y]
     * @param {Array<Array<number>>} vs - Polygon vertices
     * @returns {boolean}
     */
    isPointInPolygon(point, vs) {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i][0], yi = vs[i][1];
            const xj = vs[j][0], yj = vs[j][1];

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    /**
     * Discretizes a polyline into grid cells.
     * @param {Array<Array<number>>} polyline - Array of [x, y] points
     * @param {number} cellSize 
     * @param {number} xll 
     * @param {number} yll 
     * @returns {Array<{x: number, y: number}>} Unique list of grid cells
     */
    discretizePolyline(polyline, cellSize, xll, yll) {
        const allCells = [];
        const seen = new Set();

        for (let i = 0; i < polyline.length - 1; i++) {
            const p1 = polyline[i];
            const p2 = polyline[i + 1];

            // Convert world coordinates to grid indices
            const x0 = (p1[0] - xll) / cellSize;
            const y0 = (p1[1] - yll) / cellSize;
            const x1 = (p2[0] - xll) / cellSize;
            const y1 = (p2[1] - yll) / cellSize;

            const segmentCells = this.discretizeLine(x0, y0, x1, y1);

            for (const cell of segmentCells) {
                const key = `${cell.x},${cell.y}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    allCells.push(cell);
                }
            }
        }
        return allCells;
    },

    /**
     * Calculates grid geometry (header) from a set of XYZ points.
     * Assumes roughly regular grid.
     * @param {Array<{x:number, y:number, z:number}>} points 
     * @returns {object} { ncols, nrows, xllcorner, yllcorner, cellsize }
     */
    getGridHeader(points) {
        if (!points || points.length === 0) throw new Error("Empty Point Cloud");

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }

        // Determine Cell Size (robust estimate)
        const xs = points.map(p => p.x).sort((a, b) => a - b);
        let cellSize = 1.0;
        for (let i = 1; i < xs.length; i++) {
            const diff = xs[i] - xs[i - 1];
            if (diff > 0.001) {
                cellSize = diff;
                break;
            }
        }
        cellSize = Math.round(cellSize * 1000) / 1000;

        const ncols = Math.round((maxX - minX) / cellSize) + 1;
        const nrows = Math.round((maxY - minY) / cellSize) + 1;

        return {
            ncols,
            nrows,
            xllcorner: minX - cellSize / 2,
            yllcorner: minY - cellSize / 2,
            cellsize: cellSize,
            xll: minX, // Center origin for internal use
            yll: minY
        };
    },

    /**
     * Fills gaps (substitute -9999) with average of neighbors.
     * Modifies gridData in place.
     */
    interpolateGaps(gridData, ncols, nrows, noDataValue = -9999) {
        const original = new Float32Array(gridData);

        for (let row = 0; row < nrows; row++) {
            for (let col = 0; col < ncols; col++) {
                const idx = row * ncols + col;
                if (original[idx] <= noDataValue + 0.1) {
                    let sum = 0;
                    let count = 0;

                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            if (dx === 0 && dy === 0) continue;

                            const nr = row + dy;
                            const nc = col + dx;

                            if (nr >= 0 && nr < nrows && nc >= 0 && nc < ncols) {
                                const val = original[nr * ncols + nc];
                                if (val > noDataValue + 0.1) {
                                    sum += val;
                                    count++;
                                }
                            }
                        }
                    }

                    if (count > 0) {
                        gridData[idx] = sum / count;
                    }
                }
            }
        }
    },

    /**
     * Spiral search to find the nearest valid cell (value > noDataValue).
     * @param {number} startCol 
     * @param {number} startRow 
     * @param {Float32Array} gridData 
     * @param {object} header 
     * @param {number} maxRadius 
     * @returns {{x: number, y: number}|null}
     */
    findNearestValidCell(startCol, startRow, gridData, header, maxRadius = 3) {
        const { ncols, nrows } = header;
        const noDataValue = -9990; // Default safety threshold

        // Check center first
        const centerIdx = startRow * ncols + startCol;
        if (gridData[centerIdx] > noDataValue) {
            return { x: startCol, y: startRow };
        }

        // Spiral out
        for (let r = 1; r <= maxRadius; r++) {
            for (let i = -r; i <= r; i++) {
                for (let j = -r; j <= r; j++) {
                    // Only check the perimeter (optimization)
                    if (Math.abs(i) !== r && Math.abs(j) !== r) continue;

                    const c = startCol + i;
                    const ro = startRow + j;

                    if (c >= 0 && c < ncols && ro >= 0 && ro < nrows) {
                        const idx = ro * ncols + c;
                        if (gridData[idx] > noDataValue) {
                            return { x: c, y: ro };
                        }
                    }
                }
            }
        }
        return null; // No valid cell found in radius
    }
};
