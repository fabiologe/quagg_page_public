import { BoundaryTools } from './BoundaryTools.js';

/**
 * Rasterizer.js
 * The "Terrain Machine" module.
 * Responsible for creating the Digital Elevation Model (DEM) and Roughness Maps.
 */
export const Rasterizer = {

    /**
     * Parses XYZ text data and creates a Grid object.
     * @param {string} xyzString - Raw XYZ text data
     * @returns {object} { header, data: Float32Array }
     */
    createDemFromXYZ(xyzString) {
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
    },

    /**
     * "Burns" buildings into the DEM.
     * Implements "Baking" pattern: Copies buffer, Raycasting, BBox optimization.
     * 
     * @param {Float32Array} baseRaster - Source DEM
     * @param {object} gridInfo - { ncols, nrows, cellsize, xll, yll }
     * @param {Array} buildingsList - Array of modifications/buildings
     * @returns {Float32Array} New DEM
     */
    burnBuildings(baseRaster, gridInfo, buildingsList) {
        // 1. Erstelle eine Kopie des baseRaster (Requirement 2)
        const newRaster = new Float32Array(baseRaster);
        const { ncols, nrows, cellsize, xll, yll } = gridInfo;

        if (!buildingsList || buildingsList.length === 0) return newRaster;

        // Helper: Grid to World
        const getCellX = (c) => xll + c * cellsize;
        const getCellY = (r) => yll + ((nrows - 1) - r) * cellsize;

        // Helper: Point-in-Polygon (Raycasting) (Requirement 4)
        const isPointInPoly = (x, y, poly) => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i][0], yi = poly[i][1];
                const xj = poly[j][0], yj = poly[j][1];

                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        };

        // 3. Iteriere über alle Gebäude (Requirement 3)
        for (const building of buildingsList) {
            // Defensive Check
            if (!building.geometry || building.geometry.type !== 'Polygon') continue;

            const coords = building.geometry.coordinates[0]; // Outer ring
            if (!coords) continue;

            const height = building.properties.height || 10.0;
            const mode = building.properties.elevation_mode || 'relative';

            // Bounding Box Optimization (Requirement 3)
            let minC = ncols, maxC = 0, minR = nrows, maxR = 0;

            for (const p of coords) {
                const c = Math.round((p[0] - xll) / cellsize);
                const r = (nrows - 1) - Math.round((p[1] - yll) / cellsize); // Invert Y

                if (c < minC) minC = c;
                if (c > maxC) maxC = c;
                if (r < minR) minR = r;
                if (r > maxR) maxR = r;
            }

            // Clamp
            minC = Math.max(0, minC);
            maxC = Math.min(ncols - 1, maxC);
            minR = Math.max(0, minR);
            maxR = Math.min(nrows - 1, maxR);

            // Rasterize (Check cells in BBox)
            for (let r = minR; r <= maxR; r++) {
                const cy = getCellY(r);
                for (let c = minC; c <= maxC; c++) {
                    const cx = getCellX(c);

                    if (isPointInPoly(cx, cy, coords)) {
                        const idx = r * ncols + c;
                        const currentVal = newRaster[idx];

                        if (currentVal > -9000) { // Valid data only
                            let newVal = currentVal;

                            // 5. Setze die Höhe
                            if (mode === 'absolute') {
                                newVal = height;
                            } else {
                                // Default / Relative: terrainHeight + buildingHeight
                                newVal = currentVal + height;
                            }
                            newRaster[idx] = newVal;
                        }
                    }
                }
            }
        }

        return newRaster;
    },

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

        return this.gridToASC(frictionGrid, header);
    },

    /**
     * Helper to convert Grid to ASC string.
     */
    gridToASC(data, header) {
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
};
