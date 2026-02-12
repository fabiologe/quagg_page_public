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
    processScenario(scenario) {
        this.reset();

        // 1. Terrain & Rasterization
        let header, data;

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

        const ascContent = Rasterizer.gridToASC(data, header);
        this.files['terrain.asc'] = ascContent;

        // 2. Friction
        let useFrictionFile = false;
        if (scenario.roughness) {
            const frictionMap = Rasterizer.generateRoughnessMap(header, scenario.roughness);
            if (frictionMap) {
                this.files['friction.asc'] = frictionMap;
                useFrictionFile = true;
            }
        }

        // 3. Hydraulics - Rain
        if (scenario.rain) {
            if (typeof scenario.rain === 'object' && scenario.rain.intensity) {
                const rainContent = Hydraulics.prepareRain(scenario.rain.intensity, scenario.rain.duration || 3600);
                this.files['rain.txt'] = rainContent;
            }
        }

        // 4. Boundaries
        console.log("[InputGenerator] Pre-processing Assignments...");

        // 4a. Pre-process Assignments (Handle Static Values)
        const effectiveGanglinien = { ...scenario.ganglinien };
        const effectiveAssignments = { ...scenario.assignments };

        for (const [id, assign] of Object.entries(effectiveAssignments)) {
            if (assign.type === 'INFLOW_CONSTANT' || assign.type === 'INFLOW_FIX' || assign.type === 'WATERLEVEL_FIX') {
                if (assign.value !== undefined && assign.value !== null) {
                    const val = parseFloat(assign.value);
                    // User Request: "Generiere einen künstlichen Profilnamen: const_<id>"
                    // Use a clean ID
                    const shortId = id.split('-')[0] || id.substring(0, 8);
                    const synthName = `const_${shortId}`;

                    // Create Synthetic Profile
                    if (!effectiveGanglinien[synthName]) {
                        effectiveGanglinien[synthName] = {
                            name: synthName,
                            data: [
                                { t: 0, v: val },
                                { t: (scenario.config?.sim_time || 3600) * 2, v: val }
                            ]
                        };
                    }

                    // Link Assignment
                    effectiveAssignments[id] = { ...assign, profileId: synthName };
                }
            }
        }

        // 4b. Generate Profiles.bdy
        const bdyFileContent = this.generateBdyFile(effectiveGanglinien);
        if (bdyFileContent) {
            this.files['profiles.bdy'] = bdyFileContent;
        }

        // 4c. Generate Flow.bci
        // Combine Boundaries and Manholes (Schächte)
        const combinedBoundaries = [
            ...(scenario.boundaries || []),
            ...(scenario.manholes || [])
        ];

        console.log(`[InputGenerator] Total BCI Entities: ${combinedBoundaries.length} (Boundaries: ${scenario.boundaries?.length || 0}, Manholes: ${scenario.manholes?.length || 0})`);

        const bciContent = this.generateBciFile(
            effectiveAssignments,
            combinedBoundaries,
            effectiveGanglinien,
            header,
            data
        );

        if (bciContent) {
            // User requested: "Stelle sicher, dass die Koordinaten in die .bci Datei geschrieben werden"
            this.files['flow.bci'] = bciContent;
            // Also keep standard LISFLOOD par reference if needed, usually .bci
        }

        // 5. Parameter File
        const parContent = this.generateParFile(
            scenario.config,
            useFrictionFile,
            !!this.files['rain.txt'],
            scenario.globalRoughness,
            !!this.files['flow.bci'],
            !!this.files['profiles.bdy']
        );
        this.files['run.par'] = parContent;

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
     * Generate .bdy output (Time Series)
     */
    generateBdyFile(ganglinien) {
        let content = '';
        const visited = new Set();

        for (const [key, profile] of Object.entries(ganglinien)) {
            if (!profile.data || profile.data.length === 0) continue;

            // Name must correspond to what we write in BCI
            // If explicit name exists, use it, else key
            const name = profile.name ? profile.name.replace(/\s+/g, '_') : key;

            if (visited.has(name)) continue;
            visited.add(name);

            content += `${name}\n`;
            content += `${profile.data.length} seconds\n`;

            for (const pt of profile.data) {
                content += `${pt.t} ${pt.v.toFixed(6)}\n`;
            }
            content += '\n'; // Block separator
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
            if (b.type === 'Feature') {
                if (b.geometry.type === 'Point') {
                    const p = b.geometry.coordinates;
                    const c = this.getGridIndex(p[0], p[1], header);
                    rawCells.push({ x: c.col, y: c.row_world }); // standardized to bottom-up for tool
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
                    // Attempt Rescue
                    const valid = BoundaryTools.findNearestValidCell(col, row, gridData, header, 15);
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
                for (const cell of finalCells) {
                    const key = `${cell.x},${cell.y}`;
                    if (processedCells.has(key)) continue; // avoid duplicates
                    processedCells.add(key);

                    let line = `P ${cell.x} ${cell.y} ${lisfloodType}`;
                    if (lisfloodType !== 'FREE') {
                        line += ` ${profileName}`;
                    }
                    content += line + '\n';
                }
            } else {
                console.warn(`[InputGenerator] Boundary ${b.id} yielded 0 valid cells after snapping (Radius 15).`);
            }
        }
        return content;
    }

    generateParFile(configOverride, hasFrictionMap, hasRain, globalRoughness, hasBci, hasBdy) {
        const config = {
            demfile: 'terrain.asc',
            resroot: 'res',
            dirroot: 'results',
            sim_time: 3600,
            initial_tstep: 1.0,
            massint: 60.0,
            saveint: 60.0,
            manning: globalRoughness,
            acceleration: 'ON',
            adaptoff: 'ON',
            ...configOverride
        };

        if (hasFrictionMap) config.frictionfile = 'friction.asc';
        if (hasRain) config.rainfile = 'rain.txt';
        if (hasBci) config.bcifile = 'flow.bci'; // Correct usage
        if (hasBdy) config.bdyfile = 'profiles.bdy';

        let content = '';
        for (const [key, val] of Object.entries(config)) {
            content += `${key.padEnd(20)} ${val}\n`;
        }
        return content;
    }
}
