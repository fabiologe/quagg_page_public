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
     * "Burns" buildings into the DEM by adding height to cells within polygons or along lines.
     * @param {object} gridData - Float32Array
     * @param {object} header - Grid Header
     * @param {object} buildingsGeoJSON 
     * @param {number} defaultHeight 
     */
    burnBuildings(gridData, header, buildingsGeoJSON, defaultHeight = 10.0) {
        if (!buildingsGeoJSON || !buildingsGeoJSON.features) return;

        const { cellsize, xll, yll, ncols, nrows } = header;

        for (const feature of buildingsGeoJSON.features) {
            const geom = feature.geometry;
            const props = feature.properties || {};

            // Determine Height: explicit property > default argument
            let heightToAdd = defaultHeight;
            if (props.height_m !== undefined && props.height_m !== null) {
                heightToAdd = parseFloat(props.height_m);
            }

            let cells = [];

            if (geom.type === 'Polygon') {
                // Fill the building
                cells = BoundaryTools.getCellsInPolygon(geom.coordinates[0], cellsize, xll, yll);

                // Also discretize the perimeter (walls) to strict ensure closure
                const wallCells = BoundaryTools.discretizePolyline(geom.coordinates[0], cellsize, xll, yll);
                cells.push(...wallCells);

            } else if (geom.type === 'LineString') {
                // Handle Wall/Dam
                cells = BoundaryTools.discretizePolyline(geom.coordinates, cellsize, xll, yll);
            }

            // Apply Height
            for (const cell of cells) {
                const row = (nrows - 1) - cell.y; // Invert Y
                const col = cell.x;

                if (row >= 0 && row < nrows && col >= 0 && col < ncols) {
                    const idx = row * ncols + col;
                    if (gridData[idx] > -9000) { // Valid data only
                        gridData[idx] += heightToAdd;
                    }
                }
            }
        }
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

            // For friction, we need higher precision, for DEM maybe less?
            // Using generic join is fast but prints full float precision (often lots of decimals)
            // .map(v => v.toFixed(...)) is slow.
            // Let's rely on default toString for now for speed.
            content += rowData.join(' ') + '\n';
        }
        return content;
    }
};
