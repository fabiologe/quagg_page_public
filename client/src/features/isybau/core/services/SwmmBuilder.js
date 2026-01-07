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
FLOW_UNITS CMS
INFILTRATION HORTON
FLOW_ROUTING DYNWAVE
START_DATE ${this.fmtDate(this.options.startDate)}
START_TIME ${this.fmtTime(this.options.startDate)}
END_DATE   ${this.fmtDate(this.endDate)}
END_TIME   ${this.fmtTime(this.endDate)}
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
;;-------------- --------- ------ ------ ----------
RG1              INTENSITY ${interval}     1.0      TIMESERIES default_rain
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
                this.warnings.push(`Fläche ${name}: Gefälleklasse fehlte, gesetzt auf 0.5% (Standard).`);
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
            // Type 5 or 'Bauwerk' subtype 5 -> Outfall
            // Type 2,3,4 -> Storage if volume > 0?
            const typeStr = String(n.type);
            const isOutfall = typeStr === '5' || typeStr === 'Auslaufbauwerk' || n.subtype === 5;

            if (isOutfall) {
                outfalls.push(n);
            } else if ([2, 3, 4, 12, 13].includes(n.type) && (n.volume > 0)) { // volume prop on Node? Need to ensure Node model has it
                storage.push(n);
            } else {
                junctions.push(n);
            }
        }

        // Fallback Outfall
        if (outfalls.length === 0 && junctions.length > 0) {
            // Find lowest
            junctions.sort((a, b) => a.z - b.z);
            const lowest = junctions.shift();
            outfalls.push(lowest);
            this.warnings.push(`Warnung: Kein Auslauf definiert. ${lowest.id} wurde automatisch als Auslauf gesetzt.`);
        }

        this.addJunctions(junctions);
        this.addOutfalls(outfalls);
        this.addStorage(storage);
        this.addCoordinates(nodes);
    }

    addJunctions(nodes) {
        let text = '[JUNCTIONS]\n;;Name           Elevation  MaxDepth   InitDepth  SurDepth   Aponded\n';
        for (const n of nodes) {
            const surDepth = (n.canOverflow === false) ? 100.0 : 0;
            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(n.depth)} 0          ${this.pad(surDepth)} 0\n`;
        }
        this.sections.push(text);
    }

    addOutfalls(nodes) {
        let text = '[OUTFALLS]\n;;Name           Elevation  Type       Stage Data       Gated    RouteTo\n';
        for (const n of nodes) {
            text += `${this.pad(n.id)} ${this.pad(n.z)} FREE\n`;
        }
        this.sections.push(text);
    }

    addStorage(nodes) {
        if (nodes.length === 0) return;
        let text = '[STORAGE]\n;;Name           Elev       MaxDepth   InitDepth  Shape      Curve Name/Params            SurDepth  Fevap\n';
        for (const n of nodes) {
            // Simply functional box for now
            const area = (n.volume || 10) / (n.depth || 1);
            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(n.depth)} 0          FUNCTIONAL ${area.toFixed(2)}      0          0\n`;
        }
        this.sections.push(text);
    }

    addCoordinates(nodes) {
        let text = '[COORDINATES]\n;;Node           X-Coord    Y-Coord\n';
        for (const n of nodes) {
            text += `${this.pad(n.id)} ${this.pad(n.x)} ${this.pad(n.y)}\n`;
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
                    this.warnings.push(`Haltung ${e.id}: Länge fehlte/0, gesetzt auf 10.0m.`);
                } else {
                    this.warnings.push(`Haltung ${e.id}: Länge fehlte, berechnet aus Koordinaten: ${length.toFixed(2)}m.`);
                }
            }

            // Roughness: Input is kst (Strickler), Output is Manning (n)
            // n = 1 / kst
            let kst = this.safeFloat(e.roughness, 0);
            let roughness = 0.011;

            if (kst <= 0) {
                roughness = 0.011; // Default
                this.warnings.push(`Haltung ${e.id}: Rauheit fehlte, gesetzt auf 0.011 (PVC).`);
            } else if (kst > 1.0) {
                roughness = 1.0 / kst; // Assume Kst (Strickler) -> Manning
            } else {
                roughness = kst; // Assume Manning (already < 1.0), avoid double inversion
            }

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
                if (pType === 1 || pType === 'Egg') { // Eiprofil
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
                    // Default Circular or Heuristic
                    if (pWidth > pHeight) {
                        shape = 'RECT_CLOSED'; // Flat pipe heuristic from reference
                        geom2 = pWidth;
                    }
                    // Else Circular
                }
            }

            // VALIDATION & DEFAULTS matching Reference
            if (geom1 <= 0.001) {
                geom1 = 1.0;
                this.warnings.push(`Haltung ${e.id}: Profilhöhe fehlte/0, gesetzt auf 1.000m.`);
            }

            if ((shape.startsWith('RECT') || shape === 'TRAPEZOIDAL' || shape === 'ARCH') && geom2 <= 0.001) {
                geom2 = 1.0;
                this.warnings.push(`Haltung ${e.id}: Profilbreite fehlte/0, gesetzt auf 1.000m.`);
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
                    timeStr = `${h}:${m.toString().padStart(2, '0')}`;
                }

                // Fix property access: RainModelService uses 'intensity', legacy might use 'value'
                let val = (step.intensity !== undefined) ? step.intensity : step.value;
                if (val === undefined) val = 0;

                // Conversion: l/s*ha -> mm/hr (Factor 0.36)
                // Assuming SWMM expects mm/hr for INTENSITY rain gages
                val = val * 0.36;

                text += `default_rain     ${this.fmtDate(this.options.startDate)} ${timeStr}      ${val.toFixed(4)}\n`;
            }
        } else {
            // Default fake rain
            text += `default_rain     ${this.fmtDate(this.options.startDate)} 00:00      0.0\n`;
            text += `default_rain     ${this.fmtDate(this.options.startDate)} 01:00      10.0\n`;
            text += `default_rain     ${this.fmtDate(this.options.startDate)} 02:00      0.0\n`;
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

    fmtDate(d) {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    }

    fmtTime(d) {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
}
