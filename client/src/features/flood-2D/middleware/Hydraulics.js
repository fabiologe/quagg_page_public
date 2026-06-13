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
        // LISFLOOD .rain-Format (LoadTimeSeries, erste Zeile = Kommentar/übersprungen):
        //   [Kommentar]
        //   [Anzahl] [Zeiteinheit]
        //   [Rate_mm_h] [Zeit_s]     ← Spalte 1 = Rate in mm/h (Solver teilt intern
        //                              durch 1000*3600 → m/s), Spalte 2 = Zeit in s.
        // WICHTIG: Die Rate wird in mm/h angegeben – NICHT in m/s umrechnen.
        // Rechteck-Puls, der nach duration_s sauber auf 0 zurückgeht (sonst hält
        // LISFLOOD die letzte Rate bis sim_time → Dauerregen).
        const rate = Number(intensity_mm_h) || 0;
        const end = Math.max(1, Math.round(duration_s));
        const content = `RECT_RAIN_PULSE
3 seconds
${rate.toFixed(6)}\t0
${rate.toFixed(6)}\t${end - 1}
0.000000\t${end}
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
    /**
     * Processing all boundaries to generate flow.bdy (.bci) and referenced bc files.
     * @param {Array} boundaries - List of boundary objects from GeoStore
     * @param {Object} assignments - Map of { geoId: { type, value, profileId } }
     * @param {Object} ganglinien - Map of { id: { data: [{t,v},...] } }
     * @param {object} gridHeader 
     * @param {Float32Array} gridData - DEM Data for validation
     * @returns {object} { bdyContent: string, bcFiles: object }
     */
    prepareBoundaries(boundaries, assignments, ganglinien, gridHeader, gridData) {
        let bdyContent = ''; // This is actually the .bci content (P col row ...)
        const bcFiles = {};

        let bcCounter = 0;

        const xll = gridHeader.xll !== undefined ? gridHeader.xll : gridHeader.xllcorner;
        const yll = gridHeader.yll !== undefined ? gridHeader.yll : gridHeader.yllcorner;

        for (const b of boundaries) {
            // Logic: Only process if it has an assignment
            const assignment = assignments[b.id];
            if (!assignment) continue; // Skip unassigned boundaries

            // Find Cells
            let cells = [];
            if (b.type === 'Feature') { // GeoJSON
                if (b.geometry.type === 'Polygon') {
                    cells = BoundaryTools.getCellsInPolygon(b.geometry.coordinates[0], gridHeader.cellsize, xll, yll);
                } else if (b.geometry.type === 'LineString') {
                    cells = BoundaryTools.discretizePolyline(b.geometry.coordinates, gridHeader.cellsize, xll, yll);
                } else if (b.geometry.type === 'Point') {
                    const p = b.geometry.coordinates;
                    const col = Math.round((p[0] - xll) / gridHeader.cellsize);
                    const row = Math.round((p[1] - yll) / gridHeader.cellsize);
                    cells.push({ x: col, y: row });
                }
            }
            // Add fallback logic for Flux Splitting N=0 (Centroid)
            if (cells.length === 0 && b.geometry && (b.geometry.type === 'Polygon' || b.geometry.type === 'LineString')) {
                // GeoJSON LineString is [[x,y], [x,y]]. Polygon is [[[x,y],...]].
                const points = b.geometry.type === 'Polygon' ? b.geometry.coordinates[0] : b.geometry.coordinates;

                let cx = 0, cy = 0;
                for (const p of points) { cx += p[0]; cy += p[1]; }
                cx /= points.length;
                cy /= points.length;

                const col = Math.round((cx - xll) / gridHeader.cellsize);
                const row = Math.round((cy - yll) / gridHeader.cellsize);
                cells.push({ x: col, y: row });
            }

            // Identify Valid Cells
            const validCells = [];
            for (const cell of cells) {
                const isValid = (c, r) => {
                    if (c < 0 || c >= gridHeader.ncols || r < 0 || r >= gridHeader.nrows) return false;
                    const idx = r * gridHeader.ncols + c;
                    return gridData[idx] > -9990;
                };
                // Grid Row (Top-Down) for validation
                const ascRow = (gridHeader.nrows - 1) - cell.y;

                if (isValid(cell.x, ascRow)) {
                    validCells.push(cell);
                } else {
                    // Try local rescue for single points?
                    // For now, skip invalid.
                }
            }

            if (validCells.length === 0) {
                // Rescue: If it was a Polygon/Line that had initial cells but ALL were invalid
                // (e.g. over building/void), attempt to snap to nearest valid cell.
                if (cells.length > 0 && b.geometry && (b.geometry.type === 'Polygon' || b.geometry.type === 'LineString')) {
                    console.warn(`Boundary ${b.properties?.name || b.id} has no valid cells. Attempting Rescue.`);

                    // Calculate Centroid
                    // Handle Polygon (ring) vs LineString (points)
                    const points = b.geometry.type === 'Polygon' ? b.geometry.coordinates[0] : b.geometry.coordinates;
                    let cx = 0, cy = 0;
                    for (const p of points) { cx += p[0]; cy += p[1]; }
                    cx /= points.length;
                    cy /= points.length;

                    const col = Math.round((cx - xll) / gridHeader.cellsize);
                    const row = Math.round((cy - yll) / gridHeader.cellsize);
                    const ascRow = (gridHeader.nrows - 1) - row;

                    // Spiral Rescue
                    const found = BoundaryTools.findNearestValidCell(col, ascRow, gridData, gridHeader);
                    if (found) {
                        // found is {x, y (Top-Down)}
                        // Convert back to Bottom-Up Y for consistency if needed, but we essentially need {x, y: bottomUp} for the loop below
                        // validCells stores {x, y: bottomUp}
                        validCells.push({ x: found.x, y: (gridHeader.nrows - 1) - found.y });
                        console.log(`Boundary Rescued: ${b.properties?.name} snapped to valid cell at ${found.x}, ${found.y}`);
                    } else {
                        console.warn(`Boundary Rescue Failed: ${b.properties?.name} is too far from valid domain.`);
                        continue;
                    }
                } else {
                    console.warn(`Boundary ${b.properties?.name || b.id} has no valid cells and cannot be rescued. Skipping.`);
                    continue;
                }
            }

            // --- GENERATE BC DATA ---
            const type = assignment.type;
            let valOrFile = '';
            let lisfloodType = 'QVAR'; // Default

            if (type === 'OUTFLOW_FREE') {
                lisfloodType = 'FREE';
                valOrFile = ''; // No value needed
            } else {
                // INFLOW or WATERLEVEL
                let profileData = [];
                let isStatic = false;
                let staticValue = 0;

                // Determine Data Source
                if (type === 'INFLOW_FIX' || type === 'WATERLEVEL_FIX') {
                    isStatic = true;
                    staticValue = parseFloat(assignment.value || 0);
                    // Conversion? If inflow is m³/s, it's fine.
                } else if (type === 'INFLOW_DYNAMIC' || type === 'WATERLEVEL_DYNAMIC' || type === 'Zufluss') { // 'Zufluss' legacy
                    const profile = ganglinien[assignment.profileId];
                    if (profile && profile.data) {
                        profileData = profile.data;
                    } else {
                        console.warn(`Missing profile for boundary ${b.id}. Defaulting to 0.`);
                        isStatic = true;
                        staticValue = 0;
                    }
                }

                // Flux Splitting for Inflow
                const isFlow = type.includes('INFLOW') || type === 'Zufluss';
                const count = validCells.length;

                if (isStatic) {
                    let val = staticValue;
                    if (isFlow) val = val / count; // Split flow

                    // Create a static .bdy file? Or use scalar in .bci? 
                    // LISFLOOD often prefers files. Let's make a simple constant time series for robustness.
                    // Or just use the value directly if supported? "QFIX" supports value?
                    // "QVAR" needs file. 
                    // Let's use QVAR with a file containing the constant value for 100 hours.
                    const filename = `bc_${bcCounter}.bdy`;
                    bcFiles[filename] = this.generateTimeSeriesObj(b.properties?.name || `BC_${bcCounter}`, val, isFlow);
                    valOrFile = filename;
                    lisfloodType = isFlow ? 'QVAR' : 'HVAR';
                    bcCounter++;

                } else {
                    // Dynamic Profile
                    // We need to divide every V in the profile by count (if flow)
                    const scaledData = profileData.map(pt => ({
                        t: pt.t,
                        v: isFlow ? (pt.v / count) : pt.v
                    }));

                    const filename = `bc_${bcCounter}.bdy`;
                    bcFiles[filename] = this.generateTimeSeriesFromData(b.properties?.name || `BC_${bcCounter}`, scaledData);
                    valOrFile = filename;
                    lisfloodType = isFlow ? 'QVAR' : 'HVAR';
                    bcCounter++;
                }
            }

            // Append to .bci Content
            for (const cell of validCells) {
                const ascRow = (gridHeader.nrows - 1) - cell.y;
                const ascCol = cell.x;
                // Format: P <col> <row> <type> <value/file>
                bdyContent += `P ${ascCol} ${ascRow} ${lisfloodType} ${valOrFile}\n`.trim() + '\n';
            }
        }

        return { bdyContent, bcFiles };
    },

    generateTimeSeriesObj(name, constantValue, isFlow) {
        // Generate a simple BDY file content for constant value
        // Format: 
        // name
        // n_rows seconds/hours? (Units: seconds usually for LISFLOOD)
        // t v
        return `${name}\n2 seconds\n0 ${constantValue.toFixed(6)}\n360000 ${constantValue.toFixed(6)}\n`;
    },

    generateTimeSeriesFromData(name, dataPoints) {
        let content = `${name}\n${dataPoints.length} seconds\n`;
        for (const p of dataPoints) {
            content += `${p.t} ${p.v.toFixed(6)}\n`;
        }
        return content;
    }
};
