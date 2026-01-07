import { BoundaryTools } from './BoundaryTools.js';

/**
 * Hydraulics.js
 * The "Water Manager" module.
 * Handles extensive boundary conditions, flux splitting, and rain unit conversion.
 */
export const Hydraulics = {

    /**
     * Converts Rain intensity to LISFLOOD format.
     * @param {number} intensity_mm_h 
     * @param {number} duration_s 
     * @returns {string} Content for rain.txt
     */
    prepareRain(intensity_mm_h, duration_s = 3600) {
        // unit conv: mm/h -> m/s
        const val_ms = intensity_mm_h / 1000.0 / 3600.0;

        // Format:
        // Number of rows
        // time value
        // time value
        // ...

        // Simple rectangular pulse
        const content = `2
0.0\t${val_ms.toFixed(8)}
${duration_s.toFixed(1)}\t${val_ms.toFixed(8)}
`;
        return content;
    },

    /**
     * Processing all boundaries to generate flow.bdy and referenced bc files.
     * @param {Array} boundaries - List of boundary objects from UI
     * @param {object} gridHeader 
     * @returns {object} { bdyFile: string, bcFiles: object }
     */
    /**
     * Processing all boundaries to generate flow.bdy and referenced bc files.
     * @param {Array} boundaries - List of boundary objects from UI
     * @param {object} gridHeader 
     * @param {Float32Array} gridData - DEM Data for validation
     * @returns {object} { bdyFile: string, bcFiles: object }
     */
    prepareBoundaries(boundaries, gridHeader, gridData) {
        let bdyContent = '';
        const bcFiles = {};

        let bcCounter = 0;

        for (const b of boundaries) {
            if (!b.active) continue;

            const value = parseFloat(b.value); // m3/s
            const isOutflow = b.type && b.type.includes('OUT');
            const signedValue = isOutflow ? -Math.abs(value) : Math.abs(value);

            // Find Cells
            let cells = [];
            if (b.geometryType === 'Polygon') {
                cells = BoundaryTools.getCellsInPolygon(b.geometry.coordinates[0], gridHeader.cellsize, gridHeader.xll, gridHeader.yll);

                // --- FIX 1: Flux-Splitting Silent Fail (N=0) ---
                if (cells.length === 0) {
                    // Polygon is smaller than a cell. 
                    // Calculate Centroid (approx)
                    const ring = b.geometry.coordinates[0];
                    let cx = 0, cy = 0;
                    for (const p of ring) { cx += p[0]; cy += p[1]; }
                    cx /= ring.length;
                    cy /= ring.length;

                    // Treat as Point
                    const col = Math.round((cx - gridHeader.xll) / gridHeader.cellsize);
                    const row = Math.round((cy - gridHeader.yll) / gridHeader.cellsize);
                    cells.push({ x: col, y: row });
                }

            } else if (b.geometryType === 'LineString') {
                cells = BoundaryTools.discretizePolyline(b.geometry.coordinates, gridHeader.cellsize, gridHeader.xll, gridHeader.yll);
            } else if (b.geometryType === 'Point') {
                const p = b.geometry.coordinates;
                const col = Math.round((p[0] - gridHeader.xll) / gridHeader.cellsize);
                const row = Math.round((p[1] - gridHeader.yll) / gridHeader.cellsize);
                cells.push({ x: col, y: row });
            }

            if (cells.length === 0) continue; // Should be impossible now with N=0 fix, but safety first.

            // --- FIX 2: Vector-to-Raster Precision & NoData Validation ---
            const validCells = [];
            for (const cell of cells) {
                // Check if this cell is valid in the DEM
                // Note: Row indices. 
                // BoundaryTools produces 'y' relative to yll (Standard Cartesian row=0 at bottom). 
                // Our DEM 'gridData' is flattened. 
                // Rasterizer.js fills it: row=(nrows-1)-y ... so idx = ((nrows-1)-y)*ncols + x

                const ascRow = (gridHeader.nrows - 1) - cell.y; // Top-Down Row Index

                // Helper to check validity
                const isValid = (c, r) => {
                    if (c < 0 || c >= gridHeader.ncols || r < 0 || r >= gridHeader.nrows) return false;
                    const idx = r * gridHeader.ncols + c;
                    return gridData[idx] > -9990;
                };

                if (isValid(cell.x, ascRow)) {
                    validCells.push(cell);
                } else {
                    // It's invalid (NoData or Out of Bounds).
                    // If it was a Point (single cell), try to rescue it.
                    if (cells.length === 1) {
                        // Spiral Search
                        const found = BoundaryTools.findNearestValidCell(cell.x, ascRow, gridData, gridHeader);
                        if (found) {
                            // "found" is returned as {x: col, y: row (Top-Down)}
                            // We need to convert back to "BoundaryTools" y (Bottom-Up) or just use logic below directly?
                            // Let's standardise validCells to store {x: col, y: bottomUpY} to match loop below.
                            validCells.push({ x: found.x, y: (gridHeader.nrows - 1) - found.y });
                            console.warn(`Boundary Warning: Point moved from NoData to nearest fluid cell.`);
                        } else {
                            console.error(`Boundary Error: Point dropped. No valid cell found near ${cell.x}, ${cell.y}`);
                        }
                    }
                    // If it was a Polygon, we just ignore this Nodata cell (water flows into valid parts only).
                }
            }

            if (validCells.length === 0) {
                // If it was a Polygon that had initial cells but ALL were invalid (e.g. over building/void),
                // we must NOT fail silently. We must attempt rescue.
                if (b.geometryType === 'Polygon' && cells.length > 0) {
                    console.warn(`Boundary Warning: Polygon ${b.name} covers only NoData cells. Attempting Centroid Rescue.`);

                    // Calculate Centroid
                    const ring = b.geometry.coordinates[0];
                    let cx = 0, cy = 0;
                    for (const p of ring) { cx += p[0]; cy += p[1]; }
                    cx /= ring.length;
                    cy /= ring.length;

                    const col = Math.round((cx - gridHeader.xll) / gridHeader.cellsize);
                    const row = Math.round((cy - gridHeader.yll) / gridHeader.cellsize);
                    const ascRow = (gridHeader.nrows - 1) - row;

                    // Spiral Rescue
                    const found = BoundaryTools.findNearestValidCell(col, ascRow, gridData, gridHeader);
                    if (found) {
                        validCells.push({ x: found.x, y: (gridHeader.nrows - 1) - found.y });
                        console.log(`Boundary Rescued: Polygon snapped to nearest valid cell at ${found.x}, ${found.y}`);
                    } else {
                        console.error(`Boundary Validation Failed: Polygon ${b.name} is completely outside valid domain.`);
                        continue; // Skip effectively means Infinity avoidance, but user alerted.
                    }
                } else {
                    continue; // Point failed rescue already, or LineString failed.
                }
            }

            // FLUX SPLITTING (Corrected)
            const flowPerCell = signedValue / validCells.length;

            const bcFileName = `bc_${bcCounter}.txt`;
            bcFiles[bcFileName] = this.generateTimeSeries(flowPerCell, b.duration || 3600);
            bcCounter++;

            bdyContent += `${b.name || 'Boundary'}\n`;

            for (const cell of validCells) {
                const ascRow = (gridHeader.nrows - 1) - cell.y;
                const ascCol = cell.x;
                bdyContent += `P ${ascCol} ${ascRow} ${bcFileName}\n`;
            }
        }

        return { bdyContent, bcFiles };
    },

    generateTimeSeries(steadyValue, duration) {
        // Simple steady state profile
        // rows
        // time val
        // time val
        return `2\n0.0 ${steadyValue.toFixed(8)}\n${duration.toFixed(1)} ${steadyValue.toFixed(8)}\n`;
    }
};
