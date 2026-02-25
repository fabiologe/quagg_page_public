import { Rasterizer } from './Rasterizer.js';
import { Hydraulics } from './Hydraulics.js';
import { BoundaryTools } from './BoundaryTools.js';

/**
 * InputGenerator.js
 * The Orchestrator Module.
 * Coordinates Geometry, Rasterization, and Hydraulics to produce simulation files.
 */
export class InputGenerator {
    constructor() {
        this.reset();
    }

    reset() {
        this.terrainHeader = null;
        this.files = {};
    }

    /**
     * Main entry point to process a full scenario input.
     * @param {object} scenario input data
     */
    /**
     * Main entry point to process a full scenario input.
     * @param {object} scenario input data
     * @param {object} fs - Optional Emscripten FS object for direct writing (Streaming)
     */
    processScenario(scenario, fs = null) {
        console.log("[InputGenerator] v2.1 - Connectivity Check ENABLED ✅");
        this.reset();

        // 1. Terrain & Rasterization
        let header, data;
        // ... (existing logic)

        if (scenario.grid) {
            header = scenario.grid.header || scenario.grid;
            data = scenario.grid.data || scenario.grid.gridData;
        } else if (scenario.xyz) {
            const res = Rasterizer.createDemFromXYZ(scenario.xyz);
            header = res.header;
            data = res.data;
        } else {
            throw new Error("InputGenerator: No Terrain Grid or XYZ provided.");
        }
        this.terrainHeader = header;
        console.log(`[InputGenerator] Terrain Header: ncols=${header.ncols}, nrows=${header.nrows}, cellsize=${header.cellsize}, xll=${header.xll}, yll=${header.yll}`);

        // Burn Buildings & Modifications
        const modifications = [];
        if (scenario.buildings && scenario.buildings.features) {
            modifications.push(...scenario.buildings.features.map(f => ({
                type: 'BUILDING',
                geometry: f.geometry,
                properties: f.properties || { height: 10.0 }
            })));
        }
        if (scenario.modifications) {
            modifications.push(...scenario.modifications);
        }
        if (modifications.length > 0) {
            Rasterizer.burnBuildings(data, header, modifications);
        }

        // STREAMING WRITE or BUFFERED
        if (fs) {
            console.log("[InputGenerator] Streaming Terrain to MEMFS...");
            Rasterizer.writeGridToFS(fs, '/terrain.asc', data, header);
        } else {
            const ascContent = Rasterizer.gridToASC(data, header);
            this.files['terrain.asc'] = ascContent;
        }


        // 2. Friction
        let useFrictionFile = false;
        if (scenario.roughness) {
            const frictionRes = Rasterizer.generateRoughnessMap(header, scenario.roughness);
            if (frictionRes) {
                // frictionRes is now { header, data }
                if (fs) {
                    console.log("[InputGenerator] Streaming Friction to MEMFS...");
                    Rasterizer.writeGridToFS(fs, '/friction.asc', frictionRes.data, frictionRes.header);
                } else {
                    this.files['friction.asc'] = Rasterizer.gridToASC(frictionRes.data, frictionRes.header);
                }
                useFrictionFile = true;
            }
        }

        // 3. Hydraulics - Rain
        let hasRain = false;
        if (scenario.rain) {
            if (typeof scenario.rain === 'object' && scenario.rain.intensity) {
                const rainContent = Hydraulics.prepareRain(scenario.rain.intensity, scenario.rain.duration || 3600);
                if (fs) fs.writeFile('/rain.txt', rainContent);
                else this.files['rain.txt'] = rainContent;
                hasRain = true;
            }
        }

        // 4. Boundaries (with Flux Splitting)
        console.log("[InputGenerator] Pre-processing Assignments...");

        // 4a. Pre-process Assignments (Handle Static Values → Synthetic Ganglinien)
        const effectiveGanglinien = { ...scenario.ganglinien };
        const effectiveAssignments = { ...scenario.assignments };

        for (const [id, assign] of Object.entries(effectiveAssignments)) {
            if (assign.type === 'INFLOW_CONSTANT' || assign.type === 'INFLOW_FIX' || assign.type === 'WATERLEVEL_FIX') {
                if (assign.value !== undefined && assign.value !== null) {
                    const val = parseFloat(assign.value);
                    const shortId = id.split('-')[0] || id.substring(0, 8);
                    const synthName = `const_${shortId}`;

                    if (!effectiveGanglinien[synthName]) {
                        effectiveGanglinien[synthName] = {
                            name: synthName,
                            data: [
                                { t: 0, v: val },
                                { t: (scenario.config?.sim_time || 3600) * 2, v: val }
                            ]
                        };
                    }
                    effectiveAssignments[id] = { ...assign, profileId: synthName };
                }
            }
        }

        // 4b. Combined BCI + BDY Generation (with Flux Splitting)
        // This couples both files so BDY profiles can be scaled by cell count.
        const combinedBoundaries = [
            ...(scenario.boundaries || []),
            ...(scenario.manholes || [])
        ];

        console.log(`[InputGenerator] Total BCI Entities: ${combinedBoundaries.length} (Boundaries: ${scenario.boundaries?.length || 0}, Manholes: ${scenario.manholes?.length || 0})`);

        const { bciContent, bdyContent } = this.generateBoundaryFiles(
            effectiveAssignments,
            combinedBoundaries,
            effectiveGanglinien,
            header,
            data
        );

        let hasBdy = false;
        if (bdyContent) {
            if (fs) fs.writeFile('/profiles.bdy', bdyContent);
            else this.files['profiles.bdy'] = bdyContent;
            hasBdy = true;
        }

        let hasBci = false;
        if (bciContent) {
            if (fs) fs.writeFile('/flow.bci', bciContent);
            else this.files['flow.bci'] = bciContent;
            hasBci = true;
        }

        // 5. Parameter File
        const parContent = this.generateParFile(
            scenario.config,
            useFrictionFile,
            hasRain,
            scenario.globalRoughness,
            hasBci,
            hasBdy
        );

        if (fs) fs.writeFile('/run.par', parContent);
        else this.files['run.par'] = parContent;

        return this.files;
    }

    getVirtualFiles() {
        return this.files;
    }

    /**
     * Helper: Get Grid Index from World Coordinates
     */
    getGridIndex(x, y, header) {
        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const col = Math.round((x - xll) / header.cellsize);
        const row_world = Math.round((y - yll) / header.cellsize);
        const row = (header.nrows - 1) - row_world;
        return { col, row, row_world };
    }

    /**
     * Helper: Rasterize Polyline
     */
    rasterizePolyline(coordinates, header) {
        // Use BoundaryTools for robust discretization
        // Check if coordinates is flat array or array of arrays?
        // GeoJSON LineString is [[x,y], [x,y]]
        // BoundaryTools.discretizePolyline expects [[x,y]...]
        // We need to pass the "Origin" correct for BoundaryTools (it returns x, y_bottom_up)
        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;

        // BoundaryTools returns {x, y} where y is bottom-up index
        const rawCells = BoundaryTools.discretizePolyline(coordinates, header.cellsize, xll, yll);

        // Convert to Top-Down for LISFLOOD
        return rawCells.map(c => ({
            col: c.x,
            row: (header.nrows - 1) - c.y
        }));
    }

    /**
     * Combined BCI + BDY Generation with Flux Splitting.
     * 
     * LISFLOOD QVAR expects flow per unit width (m²/s).
     * When a boundary has N cells, each cell independently receives the profile value.
     * So we must divide the user's total Q (m³/s) by (N × cellsize) to get per-unit-width.
     *
     * @returns {{ bciContent: string, bdyContent: string }}
     */
    generateBoundaryFiles(assignments, boundaries, ganglinien, header, gridData) {
        let bciContent = '';
        let bdyContent = 'LISFLOOD boundary conditions\n'; // Required comment line (skipped by parser)
        const bdyProfiles = new Map(); // name -> { data: [{t,v}], ndata } — tracks unique profiles

        console.log(`[InputGenerator] Generating BCI+BDY with Flux Splitting. Boundaries: ${boundaries.length}, Assignments: ${Object.keys(assignments).length}`);

        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const processedCells = new Set(); // Avoid duplicates in BCI
        let boundaryIndex = 0;

        for (const b of boundaries) {
            const assign = assignments[b.id];
            if (!assign) continue;

            // 1. Determine LISFLOOD Type
            let lisfloodType = 'QVAR';
            if (assign.type === 'OUTFLOW_FREE') {
                lisfloodType = 'FREE';
            } else {
                lisfloodType = (assign.type.includes('WATERLEVEL')) ? 'HVAR' : 'QVAR';
            }

            // 2. Resolve source profile data
            let sourceProfileData = null;
            let sourceProfileName = '';

            if (lisfloodType !== 'FREE') {
                if (assign.profileId) {
                    const p = ganglinien[assign.profileId];
                    if (p) {
                        sourceProfileName = p.name ? p.name.replace(/\s+/g, '_') : assign.profileId;
                        sourceProfileData = p.data || [];
                    } else {
                        sourceProfileName = assign.profileId;
                    }
                }
                if (!sourceProfileData || sourceProfileData.length === 0) {
                    console.warn(`[InputGenerator] Boundary ${b.id} missing profile data. Skipping.`);
                    continue;
                }
            }

            // 3. Discretize Geometry → get cells
            let rawCells = [];
            let isPointSource = false;
            let pointWorldCoords = null;

            if (b.type === 'Feature') {
                if (b.geometry.type === 'Point') {
                    isPointSource = true;
                    pointWorldCoords = b.geometry.coordinates;
                    const c = this.getGridIndex(b.geometry.coordinates[0], b.geometry.coordinates[1], header);
                    rawCells.push({ x: c.col, y: c.row_world });
                } else if (b.geometry.type === 'LineString') {
                    console.log(`[InputGenerator] DIAG Boundary ${b.id}: Input coords =`, JSON.stringify(b.geometry.coordinates));
                    console.log(`[InputGenerator] DIAG Header: xll=${xll}, yll=${yll}, cellsize=${header.cellsize}, ncols=${header.ncols}, nrows=${header.nrows}`);
                    rawCells = BoundaryTools.discretizePolyline(b.geometry.coordinates, header.cellsize, xll, yll);
                    console.log(`[InputGenerator] DIAG Boundary ${b.id}: rawCells (bottom-up) =`, JSON.stringify(rawCells.slice(0, 5)), `... (${rawCells.length} total)`);
                } else if (b.geometry.type === 'Polygon') {
                    rawCells = BoundaryTools.getCellsInPolygon(b.geometry.coordinates[0], header.cellsize, xll, yll);
                }
            }

            // 4. Smart Snapping & Validation
            // IMPORTANT: gridData from parseXYZ is stored in BOTTOM-UP row order
            //   (row 0 = south/minY). row_world from discretizePolyline is also bottom-up.
            //   So we use row_world DIRECTLY for gridData indexing — no flip needed.
            //   finalCells stores {x: col, y: row_world} in bottom-up convention.
            const finalCells = [];
            let noDataCount = 0;
            for (const rc of rawCells) {
                const col = rc.x;
                const row_world = rc.y; // bottom-up (0 = south)

                if (col < 0 || col >= header.ncols || row_world < 0 || row_world >= header.nrows) {
                    console.warn(`[InputGenerator] Cell out of bounds: col=${col}, row_world=${row_world}`);
                    continue;
                }

                // gridData is bottom-up, row_world is bottom-up → direct index
                const idx = row_world * header.ncols + col;
                if (gridData[idx] <= -9990) {
                    noDataCount++;
                    // findNearestValidCell uses gridData[r * ncols + c], so pass bottom-up row
                    const valid = BoundaryTools.findNearestValidCell(col, row_world, gridData, header, 15, 1);
                    if (valid) {
                        if (noDataCount <= 3) console.warn(`[InputGenerator] NoData rescue: (${col},${row_world}) → (${valid.x},${valid.y})`);
                        finalCells.push(valid); // valid is {x: col, y: row} in bottom-up
                    }
                    else console.warn(`[InputGenerator] Cell col=${col}, row_world=${row_world} NoData, rescue failed.`);
                } else {
                    finalCells.push({ x: col, y: row_world }); // store bottom-up
                }
            }
            if (noDataCount > 0) console.warn(`[InputGenerator] Boundary ${b.id}: ${noDataCount}/${rawCells.length} cells were NoData`);
            console.log(`[InputGenerator] Boundary ${b.id}: ${finalCells.length} valid cells, first:`, JSON.stringify(finalCells.slice(0, 3)));

            if (finalCells.length === 0) {
                console.warn(`[InputGenerator] Boundary ${b.id} yielded 0 valid cells. Skipping.`);
                continue;
            }

            // 5. FLUX SPLITTING — Create scaled profile for this boundary
            let profileNameForBci = '';

            if (lisfloodType !== 'FREE') {
                const cellCount = finalCells.length;
                const isFlow = lisfloodType === 'QVAR';

                // QVAR: LISFLOOD .bci QVAR expects flux per unit width (m²/s).
                // LISFLOOD internally multiplies by cell width for point sources.
                // So: user's total Q (m³/s) / (N_cells × cellsize) = m²/s per cell
                // HVAR: no scaling (elevation-based)
                const scaleFactor = isFlow ? (cellCount * header.cellsize) : 1;

                console.log(`[InputGenerator] Boundary ${b.id}: Type=${lisfloodType}, Cells=${cellCount}, ScaleFactor=${scaleFactor} (isFlow=${isFlow}, Point=${isPointSource})`);

                // Sanitize and truncate profile name to prevent buffer overflow in LISFLOOD
                // LISFLOOD has char[80] buffers. We limit to 50 to leave room for _bXX suffix.
                const safeProfileName = sourceProfileName.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 50);
                profileNameForBci = `${safeProfileName}_b${boundaryIndex}`;

                // Scale the profile data
                const scaledData = sourceProfileData.map(pt => {
                    const scaledValue = pt.v / scaleFactor;
                    if (isFlow && pt === sourceProfileData[0]) { // Log only the first point for QVAR
                        console.log(`[InputGenerator] QVAR: Original=${pt.v}, Scaled=${scaledValue}`);
                    }
                    return { t: pt.t, v: scaledValue };
                });

                // Store for BDY output
                bdyProfiles.set(profileNameForBci, scaledData);

                console.log(`[InputGenerator] Boundary ${b.id}: ${cellCount} cells, cellsize=${header.cellsize}m, scaleFactor=${scaleFactor.toFixed(2)} (${isFlow ? 'QVAR' : 'HVAR'}). Profile: ${profileNameForBci}`);
            }

            // 6. Write BCI lines
            if (finalCells.length > 0) {
                if (isPointSource && pointWorldCoords) {
                    const key = `${pointWorldCoords[0]},${pointWorldCoords[1]}`;
                    if (!processedCells.has(key)) {
                        processedCells.add(key);
                        let line = `P ${pointWorldCoords[0].toFixed(4)} ${pointWorldCoords[1].toFixed(4)} ${lisfloodType}`;
                        if (lisfloodType !== 'FREE') line += ` ${profileNameForBci}`;
                        bciContent += line + '\n';
                    }
                } else {
                    for (const cell of finalCells) {
                        // cell.x = column index (left-to-right, 0 = west)
                        // cell.y = BOTTOM-UP row index (0 = south/minY, nrows-1 = north/maxY)
                        // Convert to world coordinates (bottom-up → world is direct):
                        const wx = xll + (cell.x + 0.5) * header.cellsize;
                        const wy = yll + (cell.y + 0.5) * header.cellsize;
                        const key = `${cell.x},${cell.y}`;
                        if (processedCells.has(key)) continue;
                        processedCells.add(key);

                        let line = '';
                        if (lisfloodType === 'FREE') {
                            // FREE is only supported natively on the domain edges via N/S/E/W in LISFLOOD 2D
                            const wx_end = wx + header.cellsize;
                            const wy_end = wy + header.cellsize;
                            let onEdge = false;

                            if (cell.x === 0) {
                                line += `W ${wy.toFixed(4)} ${wy_end.toFixed(4)} FREE\n`;
                                onEdge = true;
                            }
                            if (cell.x === header.ncols - 1) {
                                line += `E ${wy.toFixed(4)} ${wy_end.toFixed(4)} FREE\n`;
                                onEdge = true;
                            }
                            // cell.y=0 is bottom-up row 0 = SOUTH edge
                            if (cell.y === 0) {
                                line += `S ${wx.toFixed(4)} ${wx_end.toFixed(4)} FREE\n`;
                                onEdge = true;
                            }
                            // cell.y=nrows-1 is bottom-up last row = NORTH edge
                            if (cell.y === header.nrows - 1) {
                                line += `N ${wx.toFixed(4)} ${wx_end.toFixed(4)} FREE\n`;
                                onEdge = true;
                            }

                            if (!onEdge) {
                                console.warn(`[InputGenerator] Internal FREE boundary ignored at ${cell.x}, ${cell.y}`);
                            }
                        } else {
                            line = `P ${wx.toFixed(4)} ${wy.toFixed(4)} ${lisfloodType}`;
                            if (lisfloodType !== 'FREE') line += ` ${profileNameForBci}`;
                            line += '\n';
                        }

                        if (line) {
                            bciContent += line;
                        }
                    }
                }
            }

            boundaryIndex++;
        }

        // 7. Write BDY profiles
        for (const [name, data] of bdyProfiles) {
            bdyContent += `${name}\n`;
            bdyContent += `${data.length} seconds\n`;
            for (const pt of data) {
                bdyContent += `${pt.v.toFixed(6)} ${pt.t}\n`;
            }
        }

        return { bciContent, bdyContent };
    }

    /**
     * Generate .bdy output (Time Series) — Legacy, kept for compatibility
     */
    generateBdyFile(ganglinien) {
        // LISFLOOD BDY format (input.cpp:1599-1685):
        //   Comment line (SKIPPED by parser)
        //   profileName
        //   ndata units
        //   v1 t1      <-- VALUE first, then TIME!
        //   v2 t2
        //   ...
        //   (repeat for each profile)
        let content = 'LISFLOOD boundary conditions\n'; // Required comment line (skipped)
        const visited = new Set();

        for (const [key, profile] of Object.entries(ganglinien)) {
            if (!profile.data || profile.data.length === 0) continue;

            // Name must correspond to what we write in BCI
            const name = profile.name ? profile.name.replace(/\s+/g, '_') : key;

            if (visited.has(name)) continue;
            visited.add(name);

            content += `${name}\n`;
            content += `${profile.data.length} seconds\n`;

            for (const pt of profile.data) {
                content += `${pt.v.toFixed(6)} ${pt.t}\n`;
            }
        }
        return content;
    }

    /**
     * Generate .bci output (Indices)
     * AND Implements Smart Snapping
     */
    generateBciFile(assignments, boundaries, ganglinien, header, gridData) {
        let content = '';
        console.log(`[InputGenerator] Generating BCI. Poly-Boundaries: ${boundaries.length}, Assignments: ${Object.keys(assignments).length}`);

        const xll = header.xll !== undefined ? header.xll : header.xllcorner;
        const yll = header.yll !== undefined ? header.yll : header.yllcorner;
        const processedCells = new Set(); // Avoid duplicates in BCI

        for (const b of boundaries) {
            const assign = assignments[b.id];
            if (!assign) continue;

            // 1. Determine LISFLOOD Type & Name
            // Output: P col row <Type> <Name>
            let lisfloodType = 'QVAR';
            let profileName = '';

            if (assign.type === 'OUTFLOW_FREE') {
                lisfloodType = 'FREE';
                // No name needed
            } else {
                // Inflow/Stage
                lisfloodType = (assign.type.includes('WATERLEVEL')) ? 'HVAR' : 'QVAR';

                // Resolve Name
                if (assign.profileId) {
                    const p = ganglinien[assign.profileId];
                    if (p) {
                        profileName = p.name ? p.name.replace(/\s+/g, '_') : assign.profileId;
                    } else {
                        profileName = assign.profileId; // Fallback to ID (synthetic)
                    }
                } else {
                    console.warn(`[InputGenerator] Boundary ${b.id} missing profileId/value`);
                    continue;
                }
            }

            // 2. Discretize Geometry
            let rawCells = [];
            let isPointSource = false; // Point sources use real-world coords in BCI!
            let pointWorldCoords = null;
            if (b.type === 'Feature') {
                if (b.geometry.type === 'Point') {
                    isPointSource = true;
                    pointWorldCoords = b.geometry.coordinates; // [x, y] in world coords
                    const p = b.geometry.coordinates;
                    const c = this.getGridIndex(p[0], p[1], header);
                    rawCells.push({ x: c.col, y: c.row_world }); // For validation only
                } else if (b.geometry.type === 'LineString') {
                    rawCells = BoundaryTools.discretizePolyline(b.geometry.coordinates, header.cellsize, xll, yll);
                } else if (b.geometry.type === 'Polygon') {
                    rawCells = BoundaryTools.getCellsInPolygon(b.geometry.coordinates[0], header.cellsize, xll, yll);
                }
            }

            console.log(`[InputGenerator] Processing ${b.id} (${assign.type}). Raw Cells: ${rawCells.length}`);

            // 3. Smart Snapping & Validation
            // Request: "Wenn Zelle NoData oder Out -> Suche spiralig"
            // We check EACH cell.
            const finalCells = [];

            for (const rc of rawCells) {
                // rc is {x: col, y: row_world}
                const col = rc.x;
                const row_world = rc.y;
                const row = (header.nrows - 1) - row_world; // Top-Down Index for LISFLOOD/GridData check

                // Check 1: Bounds
                if (col < 0 || col >= header.ncols || row < 0 || row >= header.nrows) {
                    // User Request: "Teile der Polylinie, die außerhalb sind, sollten ignoriert werden"
                    // So we do NOT rescue them. We skip.
                    continue;
                }

                // Check 2: NoData
                const idx = row * header.ncols + col;
                if (gridData[idx] <= -9990) { // NoData Found
                    // Attempt Rescue with Connectivity Check (min 1 neighbor)
                    const valid = BoundaryTools.findNearestValidCell(col, row, gridData, header, 15, 1);
                    if (valid) {
                        finalCells.push(valid);
                    } else {
                        // Really invalid
                        console.warn(`[InputGenerator] Cell ${col}, ${row} is NoData (Val: ${gridData[idx]}) and Rescue failed (Radius 15).`);
                    }
                } else {
                    // Valid
                    finalCells.push({ x: col, y: row }); // Stores top-down
                }
            }

            // Write to content (deduplicate)
            if (finalCells.length > 0) {
                if (isPointSource && pointWorldCoords) {
                    // For Point Sources, we must SNAP to the cell center to avoid LISFLOOD truncation errors
                    // e.g. 56.9 -> 56, 57.0 -> 57.
                    // We already have the grid index in finalCells[0] (should be only 1 cell for Point)

                    const cell = finalCells[0];
                    const wx_snap = xll + (cell.x + 0.5) * header.cellsize;
                    const wy_snap = yll + ((header.nrows - 1 - cell.y) + 0.5) * header.cellsize;

                    console.log(`[InputGenerator] Point Source Snapped: Raw[${pointWorldCoords[0].toFixed(2)},${pointWorldCoords[1].toFixed(2)}] -> Cell[${cell.x},${cell.y}] -> Snapped[${wx_snap.toFixed(2)},${wy_snap.toFixed(2)}]`);

                    const key = `${wx_snap.toFixed(4)},${wy_snap.toFixed(4)}`;
                    if (!processedCells.has(key)) {
                        processedCells.add(key);

                        let line = '';
                        // FIXED: LISFLOOD ignores 'P ... FREE'. Use 'HFIX <elevation>'
                        if (lisfloodType === 'FREE') {
                            const idx = cell.y * header.ncols + cell.x; // cell.y is top-down
                            let z = (gridData && idx < gridData.length) ? gridData[idx] : -9999;
                            if (z <= -9990) z = 0;
                            line = `P ${wx_snap.toFixed(4)} ${wy_snap.toFixed(4)} HFIX ${z.toFixed(4)}`;
                        } else {
                            line = `P ${wx_snap.toFixed(4)} ${wy_snap.toFixed(4)} ${lisfloodType}`;
                            if (lisfloodType !== 'FREE') line += ` ${profileName}`;
                        }
                        content += line + '\n';
                    }
                } else {
                    // Edge/Line boundaries: Snap all cells to center
                    for (const cell of finalCells) {
                        // Convert grid indices back to world coordinates (CENTERED)
                        const wx = xll + (cell.x + 0.5) * header.cellsize;
                        const wy = yll + ((header.nrows - 1 - cell.y) + 0.5) * header.cellsize;
                        const key = `${cell.x},${cell.y}`;
                        if (processedCells.has(key)) continue;
                        processedCells.add(key);

                        let line = '';
                        // FIXED: LISFLOOD ignores 'P ... FREE'. We must use 'HFIX <elevation>' to simulate outflow (weir).
                        if (lisfloodType === 'FREE') {
                            const idx = cell.y * header.ncols + cell.x;
                            // Ensure we use the correct grid index (cell.y is bottom-up? No, getGridIndex returns top-down row? 
                            // Wait, discretizePolyline returns y as bottom-up index? 
                            // Let's verify: In this loop, cell.y comes from rawCells.
                            // rawCells = discretizePolyline -> returns {x, y} relative to xll, yll (bottom-left).
                            // So cell.y is bottom-up.
                            // gridData is top-down (row 0 is top).
                            // grid_row = (nrows - 1) - cell.y
                            const grid_row = (header.nrows - 1) - cell.y;
                            const grid_idx = grid_row * header.ncols + cell.x;
                            let z = -9999;
                            if (grid_idx >= 0 && grid_idx < gridData.length) {
                                z = gridData[grid_idx];
                            }
                            if (z <= -9990) z = 0; // Fallback for NoData

                            line = `P ${wx.toFixed(4)} ${wy.toFixed(4)} HFIX ${z.toFixed(4)}`;
                        } else {
                            line = `P ${wx.toFixed(4)} ${wy.toFixed(4)} ${lisfloodType}`;
                            if (lisfloodType !== 'FREE') { // Redundant check but safe
                                line += ` ${profileName}`;
                            }
                        }
                        content += line + '\n';
                    }
                }
            } else {
                console.warn(`[InputGenerator] Boundary ${b.id} yielded 0 valid cells after snapping (Radius 15).`);
            }
        }

        // Return .bci and .bdy content
        return { bciContent: content, bdyContent };
    }

    generateParFile(configOverride, hasFrictionMap, hasRain, globalRoughness, hasBci, hasBdy) {
        // CRITICAL: Keywords MUST match pars.cpp exactly (strcmp is case-sensitive!)
        // Source: solverHydro/src/lisflood-fp-bmi-v5.9/pars.cpp
        const config = {
            DEMfile: 'terrain.asc',             // Line 37: strcmp(buffer,"DEMfile")
            resroot: 'res',                     // Line 56: strcmp(buffer,"resroot")
            dirroot: 'results',                 // Line 57: strcmp(buffer,"dirroot")
            sim_time: '3600.0',                 // Line 70: strcmp(buffer,"sim_time")
            initial_tstep: '1.0',               // Line 72: strcmp(buffer,"initial_tstep")
            massint: '60.0',                    // Line 73: strcmp(buffer,"massint")
            saveint: '60.0',                    // Line 74: strcmp(buffer,"saveint")
            fpfric: typeof globalRoughness === 'number' ? globalRoughness.toFixed(4) : '0.0350', // Line 62: strcmp(buffer,"fpfric")
            ...configOverride
        };

        if (hasFrictionMap) config.manningfile = 'friction.asc'; // Line 99: strcmp(buffer,"manningfile")
        if (hasRain) config.rainfall = 'rain.txt';               // Line 228: strcmp(buffer,"rainfall")
        if (hasBci) config.bcifile = 'flow.bci';                 // Line 106: strcmp(buffer,"bcifile")
        if (hasBdy) config.bdyfile = 'profiles.bdy';             // Line 107: strcmp(buffer,"bdyfile")

        // Acceleration solver is now safe to use since boundary conditions are correct
        // (HFIX instead of FREE, proper flux scaling, coordinate snapping).
        if (config.acceleration !== undefined) {
            console.log("[InputGenerator] ✅ Acceleration solver ENABLED for faster computation.");
        }

        console.log("[InputGenerator] Generating run.par with config:", config);

        let content = '';
        for (const [key, val] of Object.entries(config)) {
            content += `${key.padEnd(20)} ${val}\n`;
        }
        return content;
    }
}
