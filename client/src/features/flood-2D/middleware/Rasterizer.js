import { BoundaryTools } from './BoundaryTools.js';

/**
 * Rasterizer.js
 * FIXED: Explicit baking logic with BBox optimization and Raycasting.
 */

/**
 * Parses XYZ text data and creates a Grid object.
 * (Kept for compatibility with InputGenerator/Worker usage)
 * @param {string} xyzString - Raw XYZ text data
 * @returns {object} { header, data: Float32Array }
 */
export function createDemFromXYZ(xyzString) {
    if (!xyzString) throw new Error("No XYZ data provided");

    // 1. Parse lines to points
    const lines = xyzString.trim().split('\n');
    const points = [];
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
            points.push({
                x: parseFloat(parts[0]),
                y: parseFloat(parts[1]),
                z: parseFloat(parts[2])
            });
        }
    }

    // 2. Determine Grid Geometry
    const header = BoundaryTools.getGridHeader(points);
    const { ncols, nrows, cellsize, xll, yll } = header;

    // 3. Populate Grid
    const data = new Float32Array(ncols * nrows).fill(-9999);

    for (const p of points) {
        const col = Math.round((p.x - xll) / cellsize);
        // Invert Y for Top-Down raster storage (standard ASC row 0 is top)
        const row = (nrows - 1) - Math.round((p.y - yll) / cellsize);

        if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
            const idx = row * ncols + col;
            data[idx] = p.z;
        }
    }

    // 4. Fill Gap Artifacts
    BoundaryTools.interpolateGaps(data, ncols, nrows, -9999);

    return { header, data };
}

/**
 * Helper to convert Grid to ASC string.
 * (Kept for InputGenerator usage)
 */
export function gridToASC(data, header) {
    let content = '';
    content += `ncols         ${header.ncols}\n`;
    content += `nrows         ${header.nrows}\n`;
    content += `xllcorner     ${header.xllcorner.toFixed(4)}\n`;
    content += `yllcorner     ${header.yllcorner.toFixed(4)}\n`;
    content += `cellsize      ${header.cellsize.toFixed(4)}\n`;
    content += `NODATA_value  -9999\n`;

    for (let i = 0; i < header.nrows; i++) {
        const start = i * header.ncols;
        const end = start + header.ncols;
        const rowData = data.subarray(start, end);
        content += rowData.join(' ') + '\n';
    }
    return content;
}

/**
 * Main Baking Function (Strict Implementation)
 * @param {Float32Array} baseRaster - Source Raster
 * @param {object} gridInfo - Header info { ncols, nrows, cellsize, xll, yll }
 * @param {Array} modifications - Array of modification objects
 * @returns {Float32Array} New baked raster
 */
export function bakeTerrain(baseRaster, gridInfo, modifications) {
    // Safety First: Copy the raster
    const newRaster = new Float32Array(baseRaster);

    if (!modifications || modifications.length === 0) {
        return newRaster;
    }

    const { ncols, nrows, cellsize, xll, yll } = gridInfo;

    // Helper: Grid to World (Cell Center)
    // xll is assumed to be corner. Center = corner + col * size + size/2
    // BUT legacy code mostly used xll + col * size. adhering to "Standard" center logic often safer.
    // If col = round((x-xll)/cs), implies x ~ xll + col*cs.
    const getCellX = (c) => xll + c * cellsize;
    const getCellY = (r) => yll + ((nrows - 1) - r) * cellsize;

    for (const mod of modifications) {
        if (mod.type === 'BUILDING') {
            applyBuilding(newRaster, gridInfo, mod, getCellX, getCellY);
        }
    }

    return newRaster;
}

// Named Export Alias for compatibility if any old code calls it differently, 
// OR user requested strict "export function bakeTerrain" which is above.
// Also exporting burnBuildings as alias if needed by InputGenerator before refill? 
// No, Worker now calls bakeTerrain (or burnBuildings). I will export both names pointing to logic.
export const burnBuildings = bakeTerrain;

/**
 * Sub-function to apply a single building modification
 */
function applyBuilding(raster, gridInfo, mod, getCellX, getCellY) {
    const { ncols, nrows, cellsize, xll, yll } = gridInfo;
    const geom = mod.geometry;
    const props = mod.properties || {};

    // Explicit Geometry Check
    if (!geom || geom.type !== 'Polygon' || !geom.coordinates || geom.coordinates.length === 0) return;

    const polygon = geom.coordinates[0]; // Outer RING
    const height = props.height || 10.0;

    // 1. Calculate Bounding Box (Optimization)
    let minC = ncols, maxC = 0, minR = nrows, maxR = 0;

    for (const p of polygon) {
        // [x, y]
        const px = p[0];
        const py = p[1];

        // World -> Grid
        const c = Math.round((px - xll) / cellsize);
        const r = (nrows - 1) - Math.round((py - yll) / cellsize); // Invert Y

        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
    }

    // Clamp to valid grid area
    minC = Math.max(0, minC);
    maxC = Math.min(ncols - 1, maxC);
    minR = Math.max(0, minR);
    maxR = Math.min(nrows - 1, maxR);

    // 2. Loop over BBox
    for (let r = minR; r <= maxR; r++) {
        const cy = getCellY(r); // World Y of cell center

        for (let c = minC; c <= maxC; c++) {
            const cx = getCellX(c); // World X of cell center

            // 3. Point-in-Polygon Test
            if (isPointInPolygon(cx, cy, polygon)) {
                const idx = r * ncols + c;

                // Safety check for NODATA
                if (raster[idx] > -9000) {
                    // Apply Height
                    // Requirement: "newRaster[index] += properties.height" (or absolute)
                    // Implementation Plan generally favored Relative. 
                    // Fix-Prompt: "Setze newRaster[index] += properties.height"
                    raster[idx] += height;
                }
            }
        }
    }
}

/**
 * Ray-Casting Algorithm (Strict Copy from prompt)
 */
function isPointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Compatibility Object Default Export (If legacy code expects `Rasterizer.method`)
export const Rasterizer = {
    createDemFromXYZ,
    gridToASC,
    bakeTerrain,
    burnBuildings: bakeTerrain,
    /**
     * Generates a Roughness Map (friction.asc).
     * @param {object} header 
     * @param {object} roughnessPolygons - GeoJSON
     * @param {number} defaultRoughness 
     * @returns {string} Content of friction.asc or null
     */
    generateRoughnessMap(header, roughnessPolygons, defaultRoughness = 0.035) {
        if (!roughnessPolygons || !roughnessPolygons.features || roughnessPolygons.features.length === 0) {
            return null;
        }

        const { ncols, nrows, cellsize, xll, yll } = header;
        const frictionGrid = new Float32Array(ncols * nrows).fill(defaultRoughness);

        for (const feature of roughnessPolygons.features) {
            const val = feature.properties.manning || feature.properties.roughness;
            if (val && feature.geometry.type === 'Polygon') {
                const cells = BoundaryTools.getCellsInPolygon(feature.geometry.coordinates[0], cellsize, xll, yll);

                for (const cell of cells) {
                    const row = (nrows - 1) - cell.y;
                    const col = cell.x;
                    if (row >= 0 && row < nrows && col >= 0 && col < ncols) {
                        const idx = row * ncols + col;
                        frictionGrid[idx] = parseFloat(val);
                    }
                }
            }
        }

        return gridToASC(frictionGrid, header);
    }
};
