/**
 * Utility class to generate SWMM .inp input files from ISYBAU/Pinia data models.
 */
export class SwmmInputGenerator {
    /**
     * Generates a full SWMM .inp string from nodes, edges, and areas.
     * @param {Map} nodesMap - Map of node objects
     * @param {Map} edgesMap - Map of edge objects
     * @param {Array} areasList - Array of area objects (Subcatchments)
     * @returns {string} The formatted .inp content
     */
    static generateInp(nodesMap, edgesMap, areasList = [], options = {}) {
        const sections = [];

        // Defaults
        const durationHours = options.duration || 6; // Default 6 hours

        // Calculate End Date/Time
        // Start: 01/01/2024 00:00:00
        // We handle simple duration by adding hours to start
        const startDate = new Date("2024-01-01T00:00:00");
        const endDate = new Date(startDate.getTime() + durationHours * 3600 * 1000);

        const pad = (n) => n.toString().padStart(2, '0');
        const fmtDate = (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;

        const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

        // Helper to find Node by ID (Case insensitive check might be needed? assuming exact match for now)
        const getNode = (id) => nodesMap.get(id);

        // --- 0. Pre-processing: Classify Nodes ---
        const junctions = [];
        const outfalls = [];
        const storageUnits = [];

        // Helper to check for storage types (Becken, Klaeranlage, etc.)
        // 2: Becken, 3: Behandlungsanlage, 4: Klaeranlage, 12: Versickerung, 13: Regenwassernutzung
        // NEW: 'BUILDING' or ANY type if it has volume
        const isStorage = (n) => {
            const hasVol = this.safeFloat(n.volume) > 0;
            // Allow specific storage types OR any node with explicit volume (except purely Standard?)
            // We prioritize Volume presence.
            const validTypes = [2, 3, 4, 12, 13, 5]; // Expanded to include 5 if hasVol
            if (validTypes.includes(n.type) || typeof n.type === 'number') return hasVol;
            if (n.type === 'BUILDING' || n.type === 'Bauwerk') return hasVol;
            return false;
        };

        // Helper to check for outfall
        const isOutfall = (n) => n.type === 5 || n.type === '5' || (n.type === 'Bauwerk' && n.subtype === 5) || n.is_sink === true || ((n.type === 'BUILDING' || n.type === 'Bauwerk') && n.is_sink === true);

        for (const node of nodesMap.values()) {
            if (isStorage(node)) {
                storageUnits.push(node);
            } else if (isOutfall(node)) {
                outfalls.push(node);
            } else {
                junctions.push(node);
            }
        }

        // --- Fallback: Ensure at least one Outfall exists (Prevent Error 145) ---
        if (outfalls.length === 0 && junctions.length > 0) {
            // Find junction with lowest elevation Z
            let minZ = Infinity;
            let lowestNodeIndex = -1;

            for (let i = 0; i < junctions.length; i++) {
                const z = this.safeFloat(junctions[i].z, Infinity);
                if (z < minZ) {
                    minZ = z;
                    lowestNodeIndex = i;
                }
            }

            if (lowestNodeIndex !== -1) {
                const lowestNode = junctions[lowestNodeIndex];
                outfalls.push(lowestNode);
                junctions.splice(lowestNodeIndex, 1);
                console.warn(`[SwmmInputGenerator] No Outfall defined. Auto-classified node ${lowestNode.id} (Z=${minZ}) as Outfall to allow simulation.`);
            }
        }

        // --- 1. Header Sections ---
        sections.push(`[TITLE]
Web Simulation Output
[OPTIONS]
FLOW_UNITS CMS
INFILTRATION HORTON
FLOW_ROUTING DYNWAVE
START_DATE ${fmtDate(startDate)}
START_TIME ${fmtTime(startDate)}
END_DATE   ${fmtDate(endDate)}
END_TIME   ${fmtTime(endDate)}
REPORT_STEP 00:01:00
WET_STEP    00:01:00
DRY_STEP    00:01:00
ROUTING_STEP 00:00:05
ALLOW_PONDING YES
SKIP_STEADY_STATE NO

[REPORT]
INPUT NO
SUBCATCHMENTS ALL
NODES ALL
LINKS ALL
`);

        // --- 2. [RAINGAGES] ---
        // We add a default rain gage that subcatchments can refer to.
        // Determine Interval from rainSeries if available
        let gageInterval = '0:05'; // Default 5 min

        // Helper to convert time to string (HH:MM) if it's a number (minutes)
        const formatTimeStep = (t) => {
            if (typeof t === 'number') {
                const h = Math.floor(t / 60);
                const m = Math.floor(t % 60);
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            }
            return t; // Assume ID is already HH:MM
        };

        // Helper to parse time string/number to minutes
        const parseToMinutes = (t) => {
            if (typeof t === 'number') return t;
            if (typeof t === 'string') {
                if (t.includes(':')) {
                    const [h, m] = t.split(':').map(Number);
                    return h * 60 + m;
                }
                // Handle plain number string "5"
                const val = parseFloat(t);
                if (!isNaN(val)) return val;
            }
            return 0;
        };

        // Safe format for Interval string HH:MM
        const toIntervalString = (minutes) => {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return `${h}:${m.toString().padStart(2, '0')}`;
        };

        if (options.rainInterval) {
            gageInterval = toIntervalString(parseToMinutes(options.rainInterval));
        } else if (options.rainSeries && options.rainSeries.length > 1) {
            const t1 = parseToMinutes(options.rainSeries[0].time);
            const t2 = parseToMinutes(options.rainSeries[1].time);

            let diff = t2 - t1;
            if (diff < 0) diff += 24 * 60;

            if (diff > 0) {
                gageInterval = toIntervalString(diff);
            }
        }

        sections.push(`[RAINGAGES]
;;Name           Format    Interval SCF      Source    
;;-------------- --------- ------ ------ ----------
RG1              INTENSITY ${gageInterval}     1.0      TIMESERIES default_rain
`);

        // --- 3. [SUBCATCHMENTS] ---
        // Format: Name RainGage Outlet Area %Imperv Width Slope CurbLen
        // We use areasList here.
        let subcatchments = '[SUBCATCHMENTS]\n';
        subcatchments += ';;Name           RainGage         Outlet           Area     %Imperv  Width    Slope    CurbLen\n';
        subcatchments += ';;-------------- ---------------- ---------------- -------- -------- -------- -------- --------\n';

        // Also collect Subareas and Infiltration for these subcatchments
        let subareas = '[SUBAREAS]\n';
        subareas += ';;Subcatchment   N-Imperv   N-Perv     S-Imperv   S-Perv     PctZero    RouteTo    PctRouted\n';
        subareas += ';;-------------- ---------- ---------- ---------- ---------- ---------- ---------- ----------\n';

        let infiltration = '[INFILTRATION]\n';
        infiltration += ';;Subcatchment   MaxRate    MinRate    Decay      DryTime    MaxInfil\n';
        infiltration += ';;-------------- ---------- ---------- ---------- ---------- ----------\n';

        if (areasList && areasList.length > 0) {
            const usedNames = new Set();
            for (const area of areasList) {
                let name = area.id || `Area_${Math.random().toString(36).substr(2, 5)}`;

                // Ensure Uniqueness
                if (usedNames.has(name)) {
                    let counter = 1;
                    let newName = `${name}_${counter}`;
                    while (usedNames.has(newName)) {
                        counter++;
                        newName = `${name}_${counter}`;
                    }
                    name = newName;
                }
                usedNames.add(name);

                const rainGage = 'RG1';
                // Params
                const sizeHa = this.safeFloat(area.size, 0.01); // in Hectares
                const imperv = this.safeFloat(area.runoffCoeff, 0.5) * 100; // 0-1 -> 0-100%

                // Width estimate: Square root of Area (m2). 1 ha = 10,000 m2.
                // Width = sqrt(ha * 10000)
                // If splitting, we might want to adjust width? For now, we keep it simple.
                const width = Math.sqrt(sizeHa * 10000);

                // Slope: Use Mapping or default 0.5%
                let slope = 0.5;
                const sClass = area.slope;
                if (sClass === 2) slope = 2.5;
                else if (sClass === 3) slope = 7.0;
                else if (sClass === 4) slope = 12.0;
                else if (sClass === 5) slope = 20.0;

                // Splitting Logic
                const splitRatio = this.safeFloat(area.splitRatio, 50); // Default 50% if not specified but splitting is implied? No, only split if nodeId2 exists.
                const hasSplit = area.nodeId2 && area.nodeId2.trim() !== '';

                const createSubcatchment = (subName, outletNode, areaSize) => {
                    // Fallback Outlet
                    let outlet = outletNode;
                    if (!outlet && area.edgeId) {
                        const edge = edgesMap.get(area.edgeId);
                        if (edge) outlet = edge.from;
                    }
                    if (!outlet) outlet = 'FK003';

                    const finalWidth = Math.sqrt(areaSize * 10000); // Recalculate width for partial area

                    subcatchments += `${subName.padEnd(16)} ${rainGage.padEnd(16)} ${String(outlet).padEnd(16)} ${areaSize.toFixed(4).padEnd(8)} ${imperv.toFixed(2).padEnd(8)} ${finalWidth.toFixed(2).padEnd(8)} ${slope.toFixed(2).padEnd(8)} 0\n`;

                    // Defaults for Subareas
                    subareas += `${subName.padEnd(16)} 0.01       0.1        0.05       0.05       25         OUTLET    \n`;
                    // Defaults for Infiltration
                    infiltration += `${subName.padEnd(16)} 3.0        0.5        4.0        7.0        0\n`;
                };

                if (hasSplit) {
                    // Part 1
                    const area1 = sizeHa * (splitRatio / 100.0);
                    createSubcatchment(name, area.nodeId, area1);

                    // Part 2
                    const area2 = sizeHa * (1.0 - (splitRatio / 100.0));
                    createSubcatchment(`${name}_2`, area.nodeId2, area2);
                } else {
                    // Single
                    createSubcatchment(name, area.nodeId, sizeHa);
                }
            }
        }
        sections.push(subcatchments);
        sections.push(subareas);
        sections.push(infiltration);


        // --- 4. [JUNCTIONS] ---
        // Format: Name  Elevation  MaxDepth  InitDepth  SurDepth  Aponded
        let junctionsSection = '[JUNCTIONS]\n';
        junctionsSection += ';;Name           Elevation  MaxDepth   InitDepth  SurDepth   Aponded\n';
        junctionsSection += ';;-------------- ---------- ---------- ---------- ---------- ----------\n';

        let inflows = '[INFLOWS]\n';
        inflows += ';;Node           Constituent      Time Series      Type     Mfactor  Sfactor  Baseline Pattern\n';
        inflows += ';;-------------- ---------------- ---------------- -------- -------- -------- -------- --------\n';
        let hasInflows = false;

        // Process a Node (Common logic for Elevation/Dept)
        const getGeo = (node) => {
            const elevation = this.safeFloat(node.z, 0);
            let validCoverZ = node.coverZ;
            let maxDepth = 2.0; // Default

            // 1. Try to calculate from Cover Elevation (Deckelhöhe) - Invert Elevation (Sohlhöhe)
            if (validCoverZ !== undefined && validCoverZ !== null && validCoverZ !== '') {
                const cZ = parseFloat(validCoverZ);
                if (!isNaN(cZ)) {
                    const diff = cZ - elevation;
                    if (diff > 0.001) maxDepth = diff;
                }
            }

            // 2. Override with explicit 'depth' property if available.
            // This fixes cases where coverZ == z (resulting in 0 calculated depth) 
            // but the node model has a valid physical depth.
            const explicitDepth = this.safeFloat(node.depth, 0);
            if (explicitDepth > 0) {
                maxDepth = explicitDepth;
            }

            return { elevation, maxDepth };
        }

        for (const node of junctions) {
            const { elevation, maxDepth } = getGeo(node);

            // Sealed Manhole Logic (canOverflow)
            // If canOverflow is false (checked 'Druckdichter Deckel' in UI which sets it to false), 
            // we set a high Surcharge Depth to allow pressure buildup without losing water.
            // If canOverflow is true (default), SurDepth is 0 (water floods out).
            // NOTE: In PreprocessingModal, 'checked' means 'Druckdichter Deckel' which sets node.canOverflow = false.
            let surDepth = 0;
            if (node.canOverflow === false) {
                surDepth = 100.0; // High value to behave as sealed/pressurized
            }

            junctionsSection += `${node.id.padEnd(16)} ${elevation.toFixed(3).padEnd(10)} ${maxDepth.toFixed(3).padEnd(10)} 0          ${surDepth.toFixed(3).padEnd(10)} 0\n`;

            // Handling Inflows / Outflows
            const inflow = this.safeFloat(node.constantInflow, 0);
            const outflow = this.safeFloat(node.constantOutflow, 0);

            // Net Flow: Inflow - Outflow
            // If Outflow > Inflow, we have negative net flow (extraction).
            const netFlow = inflow - outflow;

            if (netFlow !== 0) {
                const flowCMS = netFlow / 1000.0;
                inflows += `${node.id.padEnd(16)} FLOW             ""               FLOW     1.0      1.0      ${flowCMS.toFixed(6)}\n`;
                hasInflows = true;
            }
        }
        sections.push(junctionsSection);

        // --- 5. [OUTFALLS] ---
        // Format: Name Elevation Type Stage Data Gated RouteTo
        let outfallSection = '[OUTFALLS]\n';
        outfallSection += ';;Name           Elevation  Type       Stage Data       Gated    RouteTo\n';
        outfallSection += ';;-------------- ---------- ---------- ---------------- -------- ----------------\n';

        for (const node of outfalls) {
            const elevation = this.safeFloat(node.z, 0);
            // Type: FREE, NORMAL, FIXED, TIDAL. We stick to FREE for now.
            outfallSection += `${node.id.padEnd(16)} ${elevation.toFixed(3).padEnd(10)} FREE\n`;
        }
        sections.push(outfallSection);

        // --- 6. [STORAGE] ---
        // Format: Name Elev MaxDepth InitDepth Shape Curve1/A Curve2/B Curve3/C
        let storageSection = '[STORAGE]\n';
        storageSection += ';;Name           Elev       MaxDepth   InitDepth  Shape      Curve Name/Params            SurDepth  Fevap\n';
        storageSection += ';;-------------- ---------- ---------- ---------- ---------- ---------------------------- ----------------\n';

        for (const node of storageUnits) {
            const { elevation, maxDepth } = getGeo(node);
            // We use FUNCTIONAL curve A + B*Depth^C
            // Assuming Box: Area = Volume / MaxDepth
            // So A = Area, B = 0, C = 0.
            const volume = this.safeFloat(node.volume, 10.0);
            const areaVal = volume / (maxDepth > 0 ? maxDepth : 1.0);

            // Shape: FUNCTIONAL A B C
            storageSection += `${node.id.padEnd(16)} ${elevation.toFixed(3).padEnd(10)} ${maxDepth.toFixed(3).padEnd(10)} 0          FUNCTIONAL ${areaVal.toFixed(2)}      0          0\n`;

            const flow = this.safeFloat(node.constantInflow, 0);
            if (flow > 0) {
                const flowCMS = flow / 1000.0;
                inflows += `${node.id.padEnd(16)} FLOW             ""               FLOW     1.0      1.0      ${flowCMS.toFixed(6)}\n`;
                hasInflows = true;
            }
        }
        sections.push(storageSection);

        // --- 7. [COORDINATES] ---
        let coords = '[COORDINATES]\n';
        coords += ';;Node           X-Coord    Y-Coord\n';
        coords += ';;-------------- ---------- ----------\n';

        // Add coords for ALL node types
        const allNodes = [...junctions, ...outfalls, ...storageUnits];
        for (const node of allNodes) {
            const x = this.safeFloat(node.x, 0);
            const y = this.safeFloat(node.y, 0);
            coords += `${node.id.padEnd(16)} ${x.toFixed(3).padEnd(10)} ${y.toFixed(3)}\n`;
        }
        sections.push(coords);

        // --- 8. [CONDUITS] ---
        let conduits = '[CONDUITS]\n';
        conduits += ';;Name           Node1          Node2          Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow\n';
        conduits += ';;-------------- -------------- -------------- ---------- ---------- ---------- ---------- ---------- ----------\n';

        // --- 9. [XSECTIONS] ---
        let xsections = '[XSECTIONS]\n';
        xsections += ';;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';
        xsections += ';;-------------- ---------- ---------- ---------- ---------- ---------- ----------\n';

        const warnings = [];

        for (const edge of edgesMap.values()) {
            const name = edge.id;
            const node1 = edge.from;
            const node2 = edge.to;

            // Validate nodes
            if (!getNode(node1) || !getNode(node2)) {
                // Warning logic could be added here too, but for now we skip invalid edges
                console.warn(`Edge ${name} connects missing nodes (${node1}->${node2}). Skipping.`);
                continue;
            }

            let length = this.safeFloat(edge.length, 0);
            if (length <= 0) {
                const n1 = nodesMap.get(node1);
                const n2 = nodesMap.get(node2);
                if (n1 && n2) {
                    const dx = this.safeFloat(n1.x) - this.safeFloat(n2.x);
                    const dy = this.safeFloat(n1.y) - this.safeFloat(n2.y);
                    length = Math.sqrt(dx * dx + dy * dy);
                }
                if (length <= 0) length = 10.0;
            }

            // Roughness: Input is kst (Strickler), Output is Manning (n)
            // n = 1 / kst
            let kst = this.safeFloat(edge.roughness, 0);
            let roughness = 0.011;

            if (kst <= 0) {
                roughness = 0.011; // Default
                warnings.push(`Haltung ${name}: Rauheit fehlte, gesetzt auf 0.011 (PVC).`);
            } else {
                roughness = 1.0 / kst;
            }

            // Calculate Offsets
            // InOffset = Z1 - NodeFrom.Z
            // OutOffset = Z2 - NodeTo.Z
            let inOffset = 0;
            let outOffset = 0;

            const n1 = getNode(node1);
            const n2 = getNode(node2);

            if (n1 && n2) { // Already checked existence but n1/n2 are objects
                let z1 = this.safeFloat(edge.z1, -9999); // Use a sentinel value for "not set"
                let z2 = this.safeFloat(edge.z2, -9999);
                const n1Z = this.safeFloat(n1.z || n1.sohlhoehe, 0);
                const n2Z = this.safeFloat(n2.z || n2.sohlhoehe, 0);

                if (z1 !== -9999) inOffset = Math.max(0, z1 - n1Z);
                if (z2 !== -9999) outOffset = Math.max(0, z2 - n2Z);
            }

            // Profile / XSection
            let shape = 'CIRCULAR';
            let geom1 = 0;
            let geom2 = 0;
            let geom3 = 0;
            let geom4 = 0;

            const profile = edge.profile || {};
            const pType = profile.type !== undefined ? parseInt(profile.type) : 0;
            const pHeight = this.safeFloat(profile.height, 0);
            const pWidth = this.safeFloat(profile.width, 0);

            geom1 = pHeight;

            if (pType === 1) { // Eiprofil
                shape = 'EGG';
            } else if (pType === 3) { // Rechteck geschlossen
                shape = 'RECT_CLOSED';
                geom2 = pWidth > 0 ? pWidth : pHeight;
            } else if (pType === 5) { // Rechteck offen
                shape = 'RECT_OPEN';
                geom2 = pWidth > 0 ? pWidth : pHeight;
            } else if (pType === 8) { // Trapez
                shape = 'TRAPEZOIDAL';
                geom2 = pWidth; // Bottom width
                const s = this.safeFloat(profile.slope, 1.5);
                geom3 = s;
                geom4 = s;
            } else if (pType === 2 || pType === 7) { // Maulprofil
                shape = 'ARCH';
                geom2 = pWidth > 0 ? pWidth : pHeight;
            } else {
                // Type 0 or unknown. Use Heuristic based on dimensions.
                if (pWidth > pHeight) {
                    shape = 'RECT_CLOSED'; // Flat pipe
                    geom2 = pWidth;
                }
                // Else if Height >= Width, usually Circular or Egg.
            }

            // VALIDATION & DEFAULTS
            // Check Geom1 (Height/Diameter)
            if (geom1 <= 0.001) {
                geom1 = 1.0; // 1000mm Default
                warnings.push(`Haltung ${name}: Profilhöhe fehlte/0, gesetzt auf 1.000m.`);
            }

            // Check Geom2 for Rect/Trapez/Arch
            if ((shape.startsWith('RECT') || shape === 'TRAPEZOIDAL' || shape === 'ARCH') && geom2 <= 0.001) {
                geom2 = 1.0; // 1000mm Default
                warnings.push(`Haltung ${name}: Profilbreite fehlte/0, gesetzt auf 1.000m.`);
            }
            if (shape === 'TRAPEZOIDAL' && geom2 <= 0.001) geom2 = 1.0;

            conduits += `${name.padEnd(16)} ${String(node1).padEnd(14)} ${String(node2).padEnd(14)} ${length.toFixed(3).padEnd(10)} ${roughness.toFixed(4).padEnd(10)} ${inOffset.toFixed(3).padEnd(10)} ${outOffset.toFixed(3).padEnd(10)} 0          0\n`;

            // Append XSection
            xsections += `${name.padEnd(16)} ${shape.padEnd(10)} ${geom1.toFixed(3).padEnd(10)} ${geom2.toFixed(3).padEnd(10)} ${geom3.toFixed(3).padEnd(10)} ${geom4.toFixed(3).padEnd(10)} 1\n`;
        }

        sections.push(conduits);
        sections.push(xsections);

        // Append Inflows last
        if (hasInflows) {
            sections.push(inflows);
        }

        // --- 10. [TIMESERIES] ---
        let timeseries = '[TIMESERIES]\n';
        timeseries += ';;Name           Date       Time       Value     \n';
        timeseries += ';;-------------- ---------- ---------- ----------\n';

        if (options.rainSeries && Array.isArray(options.rainSeries) && options.rainSeries.length > 0) {
            for (const step of options.rainSeries) {
                // SWMM Expects INTENSITY (mm/hr) based on [RAINGAGES] format.
                let val = 0;

                if (step.intensity !== undefined) {
                    val = step.intensity * 0.36; // Convert l/s*ha to mm/hr
                } else if (step.height_mm !== undefined) {
                    // Fallback
                    val = step.height_mm / (5 / 60);
                } else if (step.value !== undefined) {
                    val = step.value;
                }

                // Append TimeSeries Line
                timeseries += `default_rain     ${fmtDate(startDate)} ${formatTimeStep(step.time)}      ${val.toFixed(4)}\n`;
            }
        } else {
            // Fallback Default
            timeseries += `default_rain     ${fmtDate(startDate)} 00:00      0.0\n`;
            timeseries += `default_rain     ${fmtDate(startDate)} 01:00      10.0\n`;
            timeseries += `default_rain     ${fmtDate(startDate)} 02:00      0.0\n`;
        }
        sections.push(timeseries);

        return { inpContent: sections.join('\n'), warnings };
    }

    /**
     * Safely parses a value to float, returning a default if invalid.
     * @returns {number} The parsed float
     */
    static safeFloat(value, defaultValue = 0) {
        if (value === undefined || value === null || value === '') return defaultValue;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }
}
