import { getHortonParams } from '../../utils/mappings.js';
/**
 * Builder Service for SWMM .inp generation.
 * Uses Domain Models (Node, Edge) instead of raw JSON.
 */
export class SwmmBuilder {
    constructor(store) {
        this.store = store; // IsybauStore instance
        this.sections = [];
        this.warnings = [];

        // Configuration
        this.options = {
            durationHours: 6,
            startDate: new Date("2024-01-01T00:00:00"),
            rainInterval: null, // "0:05"
            rainSeries: []
        };
    }

    setOptions(opts) {
        Object.assign(this.options, opts);
        return this;
    }

    build() {
        this.sections = [];
        this.warnings = [];
        this.endDate = new Date(this.options.startDate.getTime() + this.options.durationHours * 3600 * 1000);

        this.addTitle();
        this.addOptions();
        this.addRaingages();
        // Areas (Catchments)
        this.addSubcatchments();

        // Nodes & Links - Access via Store Getters (Properties in Pinia)
        const nodes = this.store.getAllNodes;
        const edges = this.store.getAllEdges;

        this.classifyAndAddNodes(nodes);
        this.addLinks(edges, nodes);

        // Dry Weather Flows (Constant Inflow)
        this.addInflows(nodes);

        // Timeseries
        this.addTimeseries();

        // Join
        return {
            inpContent: this.sections.join('\n'),
            warnings: this.warnings
        };
    }

    addTitle() {
        this.sections.push(`[TITLE]
Isybau Generated Simulation
[OPTIONS]
FLOW_UNITS           CMS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
LINK_OFFSETS         DEPTH
MIN_SLOPE            0
ALLOW_PONDING        YES
SKIP_STEADY_STATE    NO
START_DATE           ${this.formatDate(this.options.startDate)}
START_TIME           00:00:00
REPORT_START_DATE    ${this.formatDate(this.options.startDate)}
REPORT_START_TIME    00:00:00
END_DATE             ${this.formatDate(this.endDate)}
END_TIME             ${this.formatTime(this.endDate, true)}
SWEEP_START          01/01
SWEEP_END            12/31
DRY_DAYS             0
REPORT_STEP          00:01:00
WET_STEP             00:00:30
DRY_STEP             00:01:00
ROUTING_STEP         00:00:01
INERTIAL_DAMPING     PARTIAL
NORMAL_FLOW_LIMITED  BOTH
FORCE_MAIN_EQUATION  H-W
VARIABLE_STEP        0.75
LENGTHENING_STEP     0

MAX_TRIALS           8
HEAD_TOLERANCE       0.0015
SYS_FLOW_TOL         5
LAT_FLOW_TOL         5
MINIMUM_STEP         0.5
THREADS              1
SURCHARGE_METHOD     SLOT
`);
    }


    addOptions() {
        // merged into Title usually or separate
    }

    addRaingages() {
        // Logic for Rain Gage
        let interval = '0:05';
        if (this.options.rainInterval) interval = this.options.rainInterval;

        this.sections.push(`[RAINGAGES]
    ;;Name           Format    Interval SCF      Source
    ;; -------------- --------- ------ ------ ----------
        RG1              INTENSITY ${interval} 1.0      TIMESERIES default_rain
`);
    }

    addSubcatchments() {
        if (!this.store.areas || this.store.areas.length === 0) return;

        let subcatchments = '[SUBCATCHMENTS]\n;;Name           RainGage         Outlet           Area     %Imperv  Width    Slope    CurbLen\n';
        let subareas = '[SUBAREAS]\n;;Subcatchment   N-Imperv   N-Perv     S-Imperv   S-Perv     PctZero    RouteTo    PctRouted\n';
        let infiltration = '[INFILTRATION]\n;;Subcatchment   MaxRate    MinRate    Decay      DryTime    MaxInfil\n';

        const areasList = this.store.areas;
        const usedNames = new Set();

        for (const area of areasList) {
            let name = area.id || `Area_${Math.random().toString(36).substr(2, 5)}`;
            if (usedNames.has(name)) {
                let counter = 1;
                while (usedNames.has(`${name}_${counter}`)) counter++;
                name = `${name}_${counter}`;
            }
            usedNames.add(name);

            const rainGage = 'RG1';
            const sizeHa = this.safeFloat(area.size, 0.01);
            const imperv = this.safeFloat(area.runoffCoeff, 0.5) * 100;
            const width = Math.sqrt(sizeHa * 10000);

            // Slope mapping
            let slope = 0.5;
            if (area.slope === 2) slope = 2.5;
            else if (area.slope === 3) slope = 7.0;
            else if (area.slope === 4) slope = 12.0;
            else if (area.slope === 5) slope = 20.0;
            else {
                this.warnings.push(`Fläche ${name}: Gefälleklasse fehlte, gesetzt auf 0.5 % (Standard).`);
            }

            const splitRatio = this.safeFloat(area.splitRatio, 50);
            const hasSplit = area.nodeId2 && area.nodeId2.trim() !== '';

            const createEntry = (subName, outletNode, subAreaSize) => {
                let outlet = outletNode;
                // Fallback outlet logic
                if (!outlet && area.edgeId) {
                    // Try to find edge to get fromNode?? For now simple fallback
                    // This requires edge lookup, which is expensive here if not mapped.
                    // Valid SWMM requires an outlet node or subcatchment.
                    // If missing, default to first node or a specific outfall?
                    // Let's assume user provided valid nodeId.
                }
                if (!outlet) outlet = 'FK003'; // Hardcoded fallback from legacy? Better to find an Outfall.

                const subWidth = Math.sqrt(subAreaSize * 10000);

                // Horton Parameters based on Function (1=Roof, 2=Green, 3=Traffic)
                // Use area.functionId (mapped from UI? Usually mapped to 'flaechenfunktion')
                // Assuming area.function (int code) exists. Note: 'flaechenfunktion' is mostly used in parsing.
                // The Area model might need to ensure it carries this prop.
                // XML Parser maps 'function' (int).
                const horton = getHortonParams(area.function);

                subcatchments += `${this.pad(subName)} ${this.pad(rainGage)} ${this.pad(outlet)} ${this.pad(subAreaSize)} ${this.pad(imperv)} ${this.pad(subWidth)} ${this.pad(slope)} 0\n`;
                subareas += `${this.pad(subName)} 0.01       0.1        0.05       0.05       25         OUTLET    \n`;
                infiltration += `${this.pad(subName)} ${this.pad(horton.max)} ${this.pad(horton.min)} ${this.pad(horton.decay)} ${this.pad(horton.dry)} 0\n`;
            };

            if (hasSplit) {
                const a1 = sizeHa * (splitRatio / 100);
                const a2 = sizeHa * (1 - splitRatio / 100);
                createEntry(name, area.nodeId, a1);
                createEntry(`${name}_2`, area.nodeId2, a2);
            } else {
                createEntry(name, area.nodeId, sizeHa);
            }
        }

        this.sections.push(subcatchments);
        this.sections.push(subareas);
        this.sections.push(infiltration);
    }

    safeFloat(val, def = 0) {
        if (val === undefined || val === null || val === '') return def;
        const f = parseFloat(val);
        return isNaN(f) ? def : f;
    }

    classifyAndAddNodes(nodes) {
        const junctions = [];
        const outfalls = [];
        const storage = [];

        for (const n of nodes) {
            // Logic to classify
            // 1. Storage: If Node has defined Volume > 0, it's a Storage Unit (Becken), 
            //    regardless of Type (unless explicitly forced otherwise, but Volume implies storage capacity).
            //    Exception: Standard nodes might have volume 0, so check > 0.
            if (this.safeFloat(n.volume) > 0) {
                storage.push(n);
                continue;
            }

            // 2. Outfall
            const typeStr = String(n.type);
            // Type 5: Auslaufbauwerk
            // Or 'is_sink' property from generic Bauwerk/Building
            const isOutfall = typeStr === '5' || typeStr === 'Auslaufbauwerk' || n.subtype === 5 || n.is_sink === true;

            if (isOutfall) {
                outfalls.push(n);
            } else {
                // 3. Junction (Standard)
                junctions.push(n);
            }
        }

        // Fallback Outfall
        if (outfalls.length === 0 && junctions.length > 0) {
            // Find lowest
            junctions.sort((a, b) => a.z - b.z);
            const lowest = junctions.shift();
            outfalls.push(lowest);
            this.warnings.push(`Warnung: Kein Auslauf definiert.${lowest.id} wurde automatisch als Auslauf gesetzt.`);
        }

        this.addJunctions(junctions);
        this.addOutfalls(outfalls);
        this.addStorage(storage);
        this.addCoordinates(nodes);
    }

    addJunctions(nodes) {
        let text = '[JUNCTIONS]\n;;Name           Elevation  MaxDepth   InitDepth  SurDepth   Aponded\n';

        // 1. Calculate Connected Areas (Dynamic Ponding)
        const nodePondingMap = new Map();

        // Helper to add area to a node in the map
        const addToMap = (nodeId, areaSqMeters) => {
            if (!nodeId) return;
            const current = nodePondingMap.get(nodeId) || 0;
            nodePondingMap.set(nodeId, current + areaSqMeters);
        };

        if (this.store.areas && this.store.areas.length > 0) {
            // Create Edge Map for fast lookup
            // Fix: Store usually holds edges in 'edges' array or 'getAllEdges' getter. 
            // If it is a getter, it works. If function, needs call. 
            // Check 'edges' property first (standard Pinia state).
            let edges = [];
            if (Array.isArray(this.store.edges)) {
                edges = this.store.edges;
            } else if (typeof this.store.getAllEdges === 'function') {
                edges = this.store.getAllEdges();
            } else if (Array.isArray(this.store.getAllEdges)) {
                edges = this.store.getAllEdges;
            }

            const edgeMap = new Map();
            for (const e of edges) {
                edgeMap.set(e.id, e);
            }

            for (const area of this.store.areas) {
                const sizeHa = this.safeFloat(area.size, 0);
                const sizeM2 = sizeHa * 10000;

                // Case A: Area connected to an Edge (Haltung)
                // User instruction: Check 'outlet' field for Edge ID
                let edgeId = area.outlet;
                // Fallback: check 'edgeId' property if 'outlet' is missing or not found
                // Also check if 'outlet' actually points to a node? SWMM areas usually output to Node or Subcatchment. 
                // But in Isybau, user might link Area -> Edge.
                if (!edgeId && area.edgeId) edgeId = area.edgeId;

                const connectedEdge = edgeMap.get(edgeId);

                if (connectedEdge) {
                    // Split area between Start and End Node
                    const halfArea = sizeM2 / 2.0;
                    addToMap(connectedEdge.fromNodeId, halfArea);
                    addToMap(connectedEdge.toNodeId, halfArea);
                } else {
                    // Case B: Area connected directly to Node (Fallback)
                    // Use existing logic for nodeId/nodeId2
                    const splitRatio = (area.nodeId2) ? this.safeFloat(area.splitRatio, 50) / 100.0 : 1.0;

                    if (area.nodeId) {
                        addToMap(area.nodeId, sizeM2 * splitRatio);
                    }
                    if (area.nodeId2) {
                        addToMap(area.nodeId2, sizeM2 * (1 - splitRatio));
                    }
                }
            }
        }

        for (const n of nodes) {
            // Realism Update: Enable Ponding for Manholes
            // isManhole = True -> Exists on surface -> SurDepth 0, Aponded = Calculated Area
            // isManhole = False -> Virtual/Buried -> SurDepth 100, Aponded 0 (Sealed)
            let surDepth = 0;
            let aPonded = 0;

            if (n.isManhole) {
                surDepth = 0;   // Overflows immediately

                // Get calculated area
                const calculatedArea = nodePondingMap.get(n.id);

                if (calculatedArea && calculatedArea > 1.0) {
                    aPonded = calculatedArea;
                } else {
                    // Fallback constant if no area connected (prevent singularities)
                    aPonded = 20.0;
                }

            } else {
                surDepth = 100.0; // Virtual/Sealed
                aPonded = 0;      // No surface area
            }

            // Legacy/Override check: if explicitly set to canOverflow = false (Sealed Manhole)
            if (n.canOverflow === false) {
                surDepth = 100.0;
                aPonded = 0;
            }

            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(n.depth)} 0          ${this.pad(surDepth)} ${this.pad(aPonded)}\n`;
        }
        this.sections.push(text);
    }

    addOutfalls(nodes) {
        let text = '[OUTFALLS]\n;;Name           Elevation  Type       Stage Data       Gated    RouteTo\n';
        for (const n of nodes) {
            // Map UI outflowType to SWMM Type
            // 'throttled' isn't a direct SWMM type, assuming FREE or NORMAL.
            // If user wants specific stage (Gedrosselt usually implies control), ideal is Regulator.
            // For node-only Outfall: FREE is standard.
            // We'll annotate the type in comment if specific.
            let type = 'FREE';
            if (n.outflowType === 'normal') type = 'NORMAL';
            if (n.outflowType === 'fixed') type = 'FIXED';

            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(type)}${n.outflowType === 'throttled' ? ' ;Throttled' : ''} \n`;
        }
        this.sections.push(text);
    }

    addStorage(nodes) {
        if (nodes.length === 0) return;
        let text = '[STORAGE]\n;;Name           Elev       MaxDepth   InitDepth  Shape      Curve Name/Params            SurDepth  Fevap\n';
        for (const n of nodes) {
            // Use maxDepth if provided, else default to 3m
            const depth = this.safeFloat(n.maxDepth) > 0 ? this.safeFloat(n.maxDepth) : (this.safeFloat(n.depth) > 0 ? n.depth : 3.0);

            // Calculate Area for functional storage
            // If maxDepth is used, ensure Area matches Volume: Volume = Area * Depth -> Area = Vol / Depth
            const volume = this.safeFloat(n.volume, 10);
            const area = volume / depth;

            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(depth)} 0          FUNCTIONAL ${area.toFixed(2)} 0          0\n`;
        }
        this.sections.push(text);
    }

    addInflows(nodes) {
        let text = '[DWF]\n;;Node           Parameter  Average    TimePatterns\n';
        let count = 0;
        for (const n of nodes) {
            const flow = this.safeFloat(n.constantInflow, 0);
            if (flow > 0) {
                // Formatting: Node FLOW Value
                // SWMM DWF usually in same units as Flow Units? default CMS (m3/s) or LPS?
                // Header says FLOW_UNITS CMS.
                // Input is "l/s" in UI.
                // Convert l/s to CMS: / 1000
                const flowCMS = flow / 1000.0;
                text += `${this.pad(n.id)} FLOW       ${flowCMS.toFixed(6)} \n`;
                count++;
            }
        }
        if (count > 0) this.sections.push(text);
    }

    addCoordinates(nodes) {
        let text = '[COORDINATES]\n;;Node           X-Coord    Y-Coord\n';
        for (const n of nodes) {
            text += `${this.pad(n.id)} ${this.pad(n.x)} ${this.pad(n.y)} \n`;
        }
        this.sections.push(text);
    }

    addLinks(edges, nodes) {
        let conduits = '[CONDUITS]\n;;Name           Node1          Node2          Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow\n';
        let xsections = '[XSECTIONS]\n;;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';

        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        for (const e of edges) {
            const n1 = nodeMap.get(e.fromNodeId);
            const n2 = nodeMap.get(e.toNodeId);

            if (!n1 || !n2) {
                this.warnings.push(`Kante ${e.id} ignoriert: Fehlende Knoten.`);
                continue;
            }

            let length = this.safeFloat(e.length, 0);
            if (length <= 0.001) {
                const n1X = this.safeFloat(n1.x, 0);
                const n1Y = this.safeFloat(n1.y, 0);
                const n2X = this.safeFloat(n2.x, 0);
                const n2Y = this.safeFloat(n2.y, 0);

                // If coords exist
                if ((n1X !== 0 || n1Y !== 0) && (n2X !== 0 || n2Y !== 0)) {
                    const dx = n1X - n2X;
                    const dy = n1Y - n2Y;
                    length = Math.sqrt(dx * dx + dy * dy);
                }

                if (length <= 0.01) {
                    length = 10.0; // Fallback default as in legacy
                    this.warnings.push(`Haltung ${e.id}: Länge fehlte / 0, gesetzt auf 10.0m.`);
                } else {
                    this.warnings.push(`Haltung ${e.id}: Länge fehlte, berechnet aus Koordinaten: ${length.toFixed(2)} m.`);
                }
            }

            // Roughness: Input is kst (Strickler), Output is Manning (n)
            // n = 1 / kst
            let kst = this.safeFloat(e.roughness, 0);
            let roughness = 0.011;

            if (kst <= 0) {
                roughness = 0.011; // Default
                this.warnings.push(`Haltung ${e.id}: Rauheit fehlte, gesetzt auf 0.011(PVC).`);
            } else if (kst > 1.0) {
                roughness = 1.0 / kst; // Assume Kst (Strickler) -> Manning
            } else {
                roughness = kst; // Assume Manning (already < 1.0), avoid double inversion
            }
            console.log(`[SwmmBuilder] Link ${e.id}: Input kst=${kst}, Output Manning=${roughness.toFixed(4)}`);

            // Calc Offsets
            // InOffset = Z1 - NodeFrom.Z, OutOffset = Z2 - NodeTo.Z
            let inOffset = 0;
            let outOffset = 0;

            const n1Z = this.safeFloat(n1.z, 0);
            const n2Z = this.safeFloat(n2.z, 0);

            // Use edge.z1/z2 if available (parsed from input), else defaults to node invert (offset 0)
            const z1 = this.safeFloat(e.z1, -9999);
            const z2 = this.safeFloat(e.z2, -9999);

            if (z1 !== -9999) inOffset = Math.max(0, z1 - n1Z);
            if (z2 !== -9999) outOffset = Math.max(0, z2 - n2Z);

            conduits += `${this.pad(e.id)} ${this.pad(e.fromNodeId)} ${this.pad(e.toNodeId)} ${this.pad(length)} ${this.pad(roughness)} ${this.pad(inOffset)} ${this.pad(outOffset)} 0 0\n`;

            // XSections
            let shape = 'CIRCULAR';
            let geom1 = 1.0; // Default 1000mm (Reference)
            let geom2 = 0;   // Width (for Rect/Trapez)
            let geom3 = 0;   // Slope (for Trapez)
            let geom4 = 0;

            if (e.profile) {
                const pType = e.profile.type;
                const pHeight = this.safeFloat(e.profile.height, 0);
                const pWidth = this.safeFloat(e.profile.width, 0);

                geom1 = pHeight;

                // Type Mapping
                if (pType === 0 || pType === 'Circular' || pType === 'Kreisprofil') {
                    shape = 'CIRCULAR';
                } else if (pType === 1 || pType === 'Egg') { // Eiprofil
                    shape = 'EGG';
                } else if (pType === 3 || pType === 'Rechteckprofil') { // Rechteck geschlossen
                    shape = 'RECT_CLOSED';
                    geom2 = pWidth > 0 ? pWidth : pHeight;
                } else if (pType === 5) { // Rechteck offen
                    shape = 'RECT_OPEN';
                    geom2 = pWidth > 0 ? pWidth : pHeight;
                } else if (pType === 8) { // Trapez
                    shape = 'TRAPEZOIDAL';
                    geom2 = pWidth; // Bottom width
                    // Trapez assumption: slope is needed. 
                    const s = this.safeFloat(e.profile.slope, 1.5);
                    geom3 = s;
                    geom4 = s;
                } else if (pType === 2 || pType === 7) { // Maulprofil -> ARCH (Reference)
                    shape = 'ARCH';
                    geom2 = pWidth > 0 ? pWidth : pHeight;
                } else {
                    // Default to Circular if type is unknown or explicit default
                    // User Request (Step 1374): Remove "Flat Pipe Heuristic" (Width > Height).
                    // Strict pType adherence.
                    shape = 'CIRCULAR';
                }
            }

            // VALIDATION & DEFAULTS matching Reference
            if (geom1 <= 0.001) {
                geom1 = 1.0;
                this.warnings.push(`Haltung ${e.id}: Profilhöhe fehlte / 0, gesetzt auf 1.000m.`);
            }

            if ((shape.startsWith('RECT') || shape === 'TRAPEZOIDAL' || shape === 'ARCH') && geom2 <= 0.001) {
                geom2 = 1.0;
                this.warnings.push(`Haltung ${e.id}: Profilbreite fehlte / 0, gesetzt auf 1.000m.`);
            }
            if (shape === 'TRAPEZOIDAL' && geom2 <= 0.001) geom2 = 1.0;

            xsections += `${this.pad(e.id)} ${this.pad(shape)} ${this.pad(geom1)} ${this.pad(geom2)} ${this.pad(geom3)} ${this.pad(geom4)} 1\n`;
        }

        this.sections.push(conduits);
        this.sections.push(xsections);
    }

    addTimeseries() {
        let text = '[TIMESERIES]\n;;Name           Date       Time       Value\n';
        if (this.options.rainSeries.length > 0) {
            for (const step of this.options.rainSeries) {
                // Format: default_rain StepDate StepTime Value
                // Assuming step has .time (minutes or HH:MM) and .value
                let timeStr = step.time;
                if (typeof step.time === 'number') {
                    const h = Math.floor(step.time / 60);
                    const m = step.time % 60;
                    timeStr = `${h}:${m.toString().padStart(2, '0')} `;
                }

                // Fix property access: RainModelService uses 'intensity', legacy might use 'value'
                let val = (step.intensity !== undefined) ? step.intensity : step.value;
                if (val === undefined) val = 0;

                // Conversion: l/s*ha -> mm/hr (Factor 0.36)
                // Assuming SWMM expects mm/hr for INTENSITY rain gages
                val = val * 0.36;

                text += `default_rain     ${this.formatDate(this.options.startDate)} ${timeStr}      ${val.toFixed(4)}\n`;
            }
        } else {
            // Default fake rain
            text += `default_rain     ${this.formatDate(this.options.startDate)} 00:00      0.0\n`;
            text += `default_rain     ${this.formatDate(this.options.startDate)} 01:00      10.0\n`;
            text += `default_rain     ${this.formatDate(this.options.startDate)} 02:00      0.0\n`;
        }
        this.sections.push(text);
    }

    // Helpers
    pad(val) {
        if (val === undefined || val === null) return "0".padEnd(10);
        if (typeof val === 'number') {
            // Avoid massive decimals
            const s = val.toFixed(3); // 3 decimals usually enough for geometric
            return s.padEnd(10);
        }
        return String(val).padEnd(16);
    }

    formatDate(d) {
        const pad = (n) => n.toString().padStart(2, '0');
        // SWMM Date Format: MM/DD/YYYY
        return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    }

    formatTime(d, end = false) {
        if (end && d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
            // End time 00:00:00 usually means next day context, but SWMM handles date/time.
            // Keep standard.
        }
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
}
