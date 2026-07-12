import { getHortonParams } from './mappings.js';
import { fillDepthRatio, manningQfull } from './prefill.js';
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
            rainSeries: [],
            reportStepSeconds: null, // null → 60s; coupled-Modus synct auf 2D-saveint
            prefillFraction: 0       // 0..1: Netz-Auslastung vor dem Regen (Vorfüllfaktor)
        };
    }

    setOptions(opts) {
        Object.assign(this.options, opts);
        return this;
    }

    build() {
        this.sections = [];
        this.warnings = [];
        this.specialLinks = { weirs: [], orifices: [], pumps: [] };
        this.endDate = new Date(this.options.startDate.getTime() + this.options.durationHours * 3600 * 1000);

        this.addTitle();
        this.addOptions();
        // COUPLED-Modus (1D/2D): der Oberflächenabfluss kommt aus dem 2D-Raster, NICHT
        // aus SWMM-Subcatchments — sonst würde der Regen doppelt gezählt (die "Crux" der
        // Kopplung). Regen/Teileinzugsgebiete werden daher übersprungen; der Zufluss kommt
        // ausschließlich über die Kopplungsschächte (LISFLOOD ↔ swmm_setValue(NODE_LATFLOW)).
        if (!this.options.coupled) {
            this.addRaingages();
            this.addSubcatchments();
        }

        const nodes = this.store.getAllNodes;
        const edges = this.store.getAllEdges;

        // Vorfüllplan VOR dem Sektionsbau: addJunctions (InitDepth), addLinks (InitFlow)
        // und addInflows (Basisabfluss) lesen daraus.
        this.prefill = this.computePrefill(nodes, edges);

        this.classifyAndAddNodes(nodes);
        this.addLinks(edges, nodes);   // populates this.specialLinks

        this.addWeirs();
        this.addOrifices();
        this.addPumps();
        this.addCurves();
        this.addInflows(nodes);        // Trockenwetter/Konstant-Zuflüsse (1D-Basisflüsse) bleiben
        if (!this.options.coupled) this.addTimeseries();  // nur Regen-Zeitreihe (im coupled-Modus obsolet)

        // Join and clean special characters that SWMM C engine cannot parse properly
        let inpString = this.sections.join('\n');
        inpString = inpString.replace(/³/g, '3').replace(/²/g, '2');

        return {
            inpContent: inpString,
            warnings: this.warnings
        };
    }

    addTitle() {
        // COUPLED-Modus: ALLOW_PONDING NO — überstauendes Wasser darf NICHT im Schacht
        // ponden (bliebe sonst in SWMM), sondern wird als NODE_OVERFLOW abgegeben, damit
        // der Kopplungs-Hook es ins 2D-Raster überführt (massenerhaltend). Standalone: YES.
        const allowPonding = this.options.coupled ? 'NO' : 'YES';
        // REPORT_STEP = Schreibtakt der .out-Zeitreihen. Im coupled-Modus liefert
        // coupledScenario hier das 2D-saveint durch, damit 1D- und 2D-Ergebnisframes
        // im Viewer dieselbe Taktung haben.
        const reportStep = this.formatHMS(this.safeFloat(this.options.reportStepSeconds, 0) > 0
            ? this.options.reportStepSeconds : 60);
        this.sections.push(`[TITLE]
Isybau Generated Simulation
[OPTIONS]
FLOW_UNITS           CMS
INFILTRATION         HORTON
FLOW_ROUTING         DYNWAVE
LINK_OFFSETS         DEPTH
MIN_SLOPE            0
ALLOW_PONDING        ${allowPonding}
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
REPORT_STEP          ${reportStep}
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

[REPORT]
INPUT                NO
CONTINUITY           YES
FLOWSTATS            YES
NODES                ALL
LINKS                ALL
`);
        // NODES/LINKS ALL: nur so schreibt SWMM die Zeitreihen ALLER Knoten/Haltungen
        // in die Binärausgabe (.out) — die liest handler.py nach dem gekoppelten Lauf
        // als 1D-Ergebnis (networkResultsFile) für den ErgebnisViewer.
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
                if (!outlet) {
                    this.warnings.push(`Fläche ${subName}: Kein Anschlussknoten definiert — Teileinzugsgebiet wird übersprungen.`);
                    return;
                }

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

    // Gibt den effektiven Bauwerkstyp zurück: XML-geparster Wert ODER manuell gesetzter node.type (Integer)
    getBtyp(n) {
        if (n.bauwerkstyp != null) return n.bauwerkstyp;
        const t = parseInt(n.type);
        return isNaN(t) ? null : t;
    }

    // Profilform + Maße einer Kante für die Vorfüll-Hydraulik (Spiegel des
    // addLinks-Mappings, reduziert auf die Teilfüllungs-relevanten Klassen).
    profileDims(e) {
        const p = e.profile || {};
        const t = p.type;
        const ts = String(t ?? '').toLowerCase();
        let shape = 'CIRCULAR';
        if (t === 3 || t === 5 || ts.includes('rect') || ts.includes('rechteck')) shape = 'RECT';
        else if (t === 8 || ts.includes('trapez')) shape = 'TRAPEZOIDAL';
        const H = this.safeFloat(p.height, 0) > 0 ? this.safeFloat(p.height) : 1.0;
        const W = this.safeFloat(p.width, 0) > 0 ? this.safeFloat(p.width) : H;
        return { shape, H, W };
    }

    /**
     * Vorfüllfaktor f (options.prefillFraction, 0..1) → physikalischer Plan:
     *   initFlow[edge]   = f·Q_voll (Manning)                → [CONDUITS] InitFlow
     *   nodeDepth[node]  = Rohrsohlen-Offset + Teilfüllungstiefe → [JUNCTIONS] InitDepth
     *   nodeInflow[node] = Bilanz Σab−Σzu der f·Q_voll        → [DWF] (trägt die Auslastung dauerhaft)
     * Ein Wert vom Ingenieur („Netz zu 30 % ausgelastet"), der Rest ist Teilfüllungskurve.
     * Getrennt vom individuellen Initialzustand einzelner Bauwerke (Storage-InitDepth).
     */
    computePrefill(nodes, edges) {
        const f = Math.min(Math.max(this.safeFloat(this.options.prefillFraction, 0), 0), 1);
        const plan = { f, initFlow: new Map(), nodeInflow: new Map(), nodeDepth: new Map(), total: 0 };
        if (f <= 0 || !Array.isArray(edges) || edges.length === 0) return plan;

        const LINK_BTYPES = new Set([6, 7, 8, 9]);
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const desiredOut = new Map(), desiredIn = new Map();
        const bump = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
        const deeper = (k, v) => { if (v > (plan.nodeDepth.get(k) || 0)) plan.nodeDepth.set(k, v); };

        for (const e of edges) {
            const n1 = nodeMap.get(e.fromNodeId), n2 = nodeMap.get(e.toNodeId);
            if (!n1 || !n2) continue;
            if (LINK_BTYPES.has(this.getBtyp(n1))) continue;   // Sonderlinks: keine Vorfüllung

            const { shape, H, W } = this.profileDims(e);
            let length = this.safeFloat(e.length, 0);
            if (length <= 0.01) {
                length = Math.hypot(this.safeFloat(n1.x, 0) - this.safeFloat(n2.x, 0),
                                    this.safeFloat(n1.y, 0) - this.safeFloat(n2.y, 0)) || 10;
            }
            // Rohrsohlen wie addLinks: e.z1/z2 wenn gesetzt, sonst Schachtsohle
            const zu = this.safeFloat(e.z1, -9999) !== -9999 ? this.safeFloat(e.z1) : this.safeFloat(n1.z, 0);
            const zd = this.safeFloat(e.z2, -9999) !== -9999 ? this.safeFloat(e.z2) : this.safeFloat(n2.z, 0);
            const slope = (zu - zd) / length;
            const kst = this.safeFloat(e.roughness, 0);
            const n = kst > 1 ? 1 / kst : (kst > 0 ? kst : 0.011);

            const Qf = f * manningQfull(shape, H, W, n, slope);
            if (!(Qf > 0)) continue;
            plan.initFlow.set(e.id, Qf);
            bump(desiredOut, e.fromNodeId, Qf);
            bump(desiredIn, e.toNodeId, Qf);

            // Anfangswasserstand an den Endknoten: Sohlen-Offset + Teilfüllungstiefe
            const y = fillDepthRatio(shape, f) * H;
            deeper(e.fromNodeId, Math.max(0, zu - this.safeFloat(n1.z, 0)) + y);
            deeper(e.toNodeId, Math.max(0, zd - this.safeFloat(n2.z, 0)) + y);
        }

        // Knotenbilanz: nur wo mehr abfließen soll als zufließt, wird eingespeist
        for (const [id, out] of desiredOut) {
            const q = out - (desiredIn.get(id) || 0);
            if (q > 1e-6) { plan.nodeInflow.set(id, q); plan.total += q; }
        }
        if (plan.total > 0) {
            this.warnings.push(`Vorfüllung ${(f * 100).toFixed(0)} %: Basisabfluss `
                + `${(plan.total * 1000).toFixed(1)} l/s automatisch auf ${plan.nodeInflow.size} `
                + `Zulaufknoten verteilt (Manning-Teilfüllung, kein Tagesgang nötig).`);
        }
        return plan;
    }

    classifyAndAddNodes(nodes) {
        const junctions = [];
        const outfalls  = [];
        const storage   = [];

        // Bauwerkstypen die als STORAGE enden
        const STORAGE_BTYPES  = new Set([1, 2, 12, 13]);
        // Bauwerkstypen die als OUTFALL enden
        const OUTFALL_BTYPES  = new Set([3, 4, 5]);
        // Bauwerkstypen deren ausgehende Kante zum Sonder-Link wird (bleiben als Junction)
        // 6=Pumpe, 7=Wehr, 8=Drossel, 9=Schieber

        for (const n of nodes) {
            const btyp    = this.getBtyp(n);
            const typeStr = String(n.type);

            // 1. Storage: explizites Volumen > 0 ODER Bauwerkstyp ist Speicherbauwerk
            const hasVolume = this.safeFloat(n.volume) > 0 ||
                              (n.bauwerkData?.volume != null && n.bauwerkData.volume > 0);
            if (hasVolume || STORAGE_BTYPES.has(btyp)) {
                storage.push(n);
                continue;
            }

            // 2. Outfall: Auslaufbauwerk, Kläre, Behandlung, Anschlusspunkt NN
            const isOutfall =
                OUTFALL_BTYPES.has(btyp) ||
                typeStr === 'Auslaufbauwerk' ||
                n.is_sink === true ||
                (typeStr === 'Anschlusspunkt' && n.punktkennung === 'NN');

            if (isOutfall) {
                outfalls.push(n);
            } else {
                // 3. Junction — inkl. Pumpe/Wehr/Drossel/Schieber (deren Kante wird zum Link)
                junctions.push(n);
            }
        }

        // Fallback-Auslauf wenn keiner gefunden
        if (outfalls.length === 0 && junctions.length > 0) {
            const sorted = [...junctions].sort((a, b) => a.z - b.z);
            const lowest = sorted[0];
            junctions.splice(junctions.indexOf(lowest), 1);
            outfalls.push(lowest);
            this.warnings.push(`Kein Auslauf definiert — ${lowest.id} (tiefster Knoten) automatisch als Auslauf gesetzt.`);
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

            // COUPLED-Modus: Schacht darf in SWMM NICHT fluten (SurDepth hoch = Druck-
            // abfluss). Überstau/Rückgabe ins Gelände rechnet der Kopplungs-Hook im
            // 2D-Solver über die Kopfdifferenz (coupling.cpp) — würde SWMM selbst
            // fluten, ginge das Wasser dort verloren bzw. nur als ungenaues Rate-
            // Sampling zurück (Phantom-Quellen).
            if (this.options.coupled) {
                surDepth = 999;
                aPonded = 0;
            }

            // InitDepth aus dem Vorfüllplan (auf Schachttiefe gekappt) — Lauf startet
            // ohne Auffüll-Transiente auf der gewählten Netz-Auslastung.
            const initDepth = Math.min(this.prefill?.nodeDepth.get(n.id) ?? 0,
                                       this.safeFloat(n.depth, 999));
            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(n.depth)} ${this.pad(initDepth)} ${this.pad(surDepth)} ${this.pad(aPonded)}\n`;
        }
        this.sections.push(text);
    }

    addOutfalls(nodes) {
        let text = '[OUTFALLS]\n;;Name           Elevation  Type       Stage Data       Gated    RouteTo\n';
        for (const n of nodes) {
            // FREE = freier Auslauf, NORMAL = Normalabfluss-Randbedingung,
            // FIXED = fester Vorfluter-Wasserstand (Stage in m NHN, Pflichtspalte).
            let type = 'FREE';
            let stage = '';
            if (n.outflowType === 'normal') type = 'NORMAL';
            if (n.outflowType === 'fixed') {
                const s = this.safeFloat(n.fixedStage, -9999);
                if (s !== -9999) { type = 'FIXED'; stage = this.pad(s); }
                else this.warnings.push(`Auslauf ${n.id}: FIXED ohne Wasserstand — als FREE exportiert.`);
            }
            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(type)} ${stage}${n.outflowType === 'throttled' ? ' ;Throttled' : ''} \n`;
        }
        this.sections.push(text);
    }

    addStorage(nodes) {
        if (nodes.length === 0) return;
        let text = '[STORAGE]\n;;Name           Elev       MaxDepth   InitDepth  Shape      Curve Name/Params            SurDepth  Fevap\n';

        for (const n of nodes) {
            const bd = n.bauwerkData;

            // Volume: explizit > bauwerkData > Fallback 10 m³
            let volume = this.safeFloat(n.volume, 0);
            if (volume <= 0 && bd?.volume > 0) volume = bd.volume;
            if (volume <= 0) {
                volume = 10;
                this.warnings.push(`Speicher ${n.id}: Kein Volumen definiert, Fallback 10 m³.`);
            }

            // Tiefe: bauwerkData.maxDepth > node.depth > 3m
            let depth = this.safeFloat(bd?.maxDepth, 0);
            if (depth <= 0) depth = this.safeFloat(n.depth, 0);
            if (depth <= 0) depth = 3.0;

            const area = volume / depth;
            const initDepth = this.safeFloat(n.initDepth, 0);

            // Versickerungsanlage: SWMM Seepage Parameter (in [STORAGE] via Fevap-Zeile ist nicht Standard;
            // für echte Versickerung müsste LID verwendet werden — hier vereinfacht als normaler Storage)
            const seepageNote = (n.bauwerkstyp === 12 && bd?.seepageRate)
                ? ` ;Versickerung ${bd.seepageRate} m³/h` : '';

            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(depth)} ${this.pad(initDepth)} FUNCTIONAL ${area.toFixed(2)} 0          0${seepageNote}\n`;
        }
        this.sections.push(text);
    }

    addWeirs() {
        if (!this.specialLinks.weirs.length) return;
        let text = '[WEIRS]\n;;Name           Node1          Node2          Type         CrestHt    Cd         Gated    EndCon   EndCoeff   Surcharge\n';
        let xs   = '[XSECTIONS]\n;;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';

        for (const { id, from, to } of this.specialLinks.weirs) {
            if (!to) { this.warnings.push(`Wehr ${id}: Kein Zielknoten — übersprungen.`); continue; }
            const bd = from.bauwerkData;

            // Priorität: UI wehrHeight (relativ ab Sohle) > XML SchwellenhoeheMin (absolut) > 70% Schachttiefe
            let crestHt;
            if (this.safeFloat(from.wehrHeight, 0) > 0) {
                crestHt = this.safeFloat(from.wehrHeight);
            } else if (bd?.wehrSchwelle != null) {
                crestHt = Math.max(0, bd.wehrSchwelle - from.z);
            } else {
                crestHt = this.safeFloat(from.depth, 2.0) * 0.7;
                this.warnings.push(`Wehr ${id}: Schwellenhöhe fehlt, gesetzt auf 70% Schachttiefe (${crestHt.toFixed(2)} m).`);
            }

            // Wehrbreite: UI wehrWidth > XML LaengeWehrschwelle > 1.0m
            const laenge = this.safeFloat(from.wehrWidth, 0) > 0
                ? this.safeFloat(from.wehrWidth)
                : this.safeFloat(bd?.wehrLaenge, 1.0);

            // Beiwert Cw: UI dischargeCoeff > 1.89 (scharfkantig belüftet μ=0.64, FLOW_UNITS=CMS, Q = Cw·L·H^1.5)
            const cd = this.safeFloat(from.dischargeCoeff, 0) > 0
                ? this.safeFloat(from.dischargeCoeff)
                : 1.89;

            text += `${this.pad(id)} ${this.pad(from.id)} ${this.pad(to.id)} TRANSVERSE ${this.pad(crestHt)} ${cd.toFixed(2)}      NO       0        0          YES\n`;
            xs   += `${this.pad(id)} RECT_OPEN  ${this.pad(crestHt > 0 ? crestHt : 0.5)} ${this.pad(laenge)} 0          0          1\n`;
        }
        this.sections.push(text);
        this.sections.push(xs);
    }

    addOrifices() {
        if (!this.specialLinks.orifices.length) return;
        let text = '[ORIFICES]\n;;Name           Node1          Node2          Type         Offset     Cd         Gated    CloseTime\n';
        let xs   = '[XSECTIONS]\n;;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';

        for (const { id, from, to, subtype } of this.specialLinks.orifices) {
            if (!to) { this.warnings.push(`Orifice ${id}: Kein Zielknoten — übersprungen.`); continue; }
            const bd = from.bauwerkData;
            let diameter = 0.3;

            if (subtype === 'drossel') {
                // Priorität: UI maxOutflow > XML nennleistung
                const Q_ls = this.safeFloat(from.maxOutflow, 0) > 0
                    ? this.safeFloat(from.maxOutflow)
                    : this.safeFloat(bd?.nennleistung, 0);
                if (Q_ls > 0) {
                    // Rückrechnung bei 1 m Druckhöhe: Q = Cd × A × sqrt(2g)
                    const A = (Q_ls / 1000) / (0.65 * Math.sqrt(2 * 9.81));
                    diameter = Math.max(0.05, Math.min(Math.sqrt(4 * A / Math.PI), 2.0));
                }
            } else if (subtype === 'schieber') {
                // Breite: UI initialOpening skaliert schieberBreite
                const b = this.safeFloat(from.bauwerkData?.schieberBreite, 0.3);
                const opening = this.safeFloat(from.initialOpening, 1.0);
                diameter = b * Math.sqrt(Math.max(0.01, opening)); // reduzierter Querschnitt
            }

            text += `${this.pad(id)} ${this.pad(from.id)} ${this.pad(to.id)} BOTTOM     0          0.65       NO       0\n`;
            xs   += `${this.pad(id)} CIRCULAR   ${this.pad(diameter)} 0          0          0          1\n`;
        }
        this.sections.push(text);
        this.sections.push(xs);
    }

    addPumps() {
        if (!this.specialLinks.pumps.length) return;
        // SWMM-Spaltenordnung: … Status STARTUP SHUTOFF — Startup (EIN-Wasserstand)
        // ZUERST und ≥ Shutoff, sonst ERROR 122 „startup depth not higher than shutoff".
        // (Bug bis 2026-07: Spalten vertauscht → jede Pumpe brach den SWMM-Start ab;
        // gefunden durch test_coupling_pump.py der QA-Kampagne.)
        let text = '[PUMPS]\n;;Name           Node1          Node2          PumpCurve    InitStatus Startup    Shutoff\n';

        for (const { id, from, to } of this.specialLinks.pumps) {
            if (!to) { this.warnings.push(`Pumpe ${id}: Kein Zielknoten — übersprungen.`); continue; }

            // Priorität: UI onDepth/offDepth > Berechnung aus Schachttiefe
            const onDepth  = this.safeFloat(from.onDepth,  0) > 0 ? this.safeFloat(from.onDepth)  : this.safeFloat(from.depth, 2.0) * 0.4;
            const offDepth = this.safeFloat(from.offDepth, 0) > 0 ? this.safeFloat(from.offDepth) : onDepth * 0.4;

            text += `${this.pad(id)} ${this.pad(from.id)} ${this.pad(to.id)} ${this.pad('CRV_' + id)} ON         ${this.pad(onDepth)} ${this.pad(offDepth)}\n`;
        }
        this.sections.push(text);
    }

    addCurves() {
        if (!this.specialLinks.pumps.length) return;
        let text = '[CURVES]\n;;Name           Type       X-Value    Y-Value\n';

        for (const { id, from } of this.specialLinks.pumps) {
            const bd   = from.bauwerkData;
            const name = `CRV_${id}`;

            // Priorität: UI pumpRate (l/s) > Berechnung aus XML Leistung+Förderhöhe
            const Q_ui = this.safeFloat(from.pumpRate, 0);
            let Q_d, H_d;

            if (Q_ui > 0) {
                // User hat Förderleistung direkt eingegeben
                Q_d = Q_ui / 1000; // l/s → m³/s
                H_d = this.safeFloat(bd?.pumpHead, 10.0);
            } else {
                H_d = this.safeFloat(bd?.pumpHead,  10.0);
                const P   = this.safeFloat(bd?.pumpPower,  5.0);
                Q_d = (P * 1000 * 0.7) / (1000 * 9.81 * H_d);
                this.warnings.push(`Pumpe ${id}: Keine Förderleistung angegeben, Schätzung aus Leistung: ${(Q_d * 1000).toFixed(1)} l/s.`);
            }

            // TYPE3 Q-H Kennlinie: 3 Punkte (Abriegelung, Auslegung, Freilauf)
            text += `${this.pad(name)} Pump       0.0000     ${(H_d * 1.3).toFixed(3)}\n`;
            text += `${this.pad(name)}            ${Q_d.toFixed(4)}  ${H_d.toFixed(3)}\n`;
            text += `${this.pad(name)}            ${(Q_d * 1.4).toFixed(4)} 0.000\n`;
        }
        this.sections.push(text);
    }

    addInflows(nodes) {
        // (1) Vorfüllungs-Basisabfluss als [DWF] — das IST physikalisch Trockenwetter-
        //     abfluss, nur automatisch aus dem Vorfüllfaktor bilanziert (kein Tagesgang).
        if (this.prefill && this.prefill.nodeInflow.size > 0) {
            let dwf = '[DWF]\n;;Node           Parameter  Average    TimePatterns\n';
            for (const [id, q] of this.prefill.nodeInflow) {
                dwf += `${this.pad(id)} FLOW       ${q.toFixed(6)} \n`;
            }
            this.sections.push(dwf);
        }

        // (2) Direkte Zuflüsse (konstant + Ganglinie) als [INFLOWS]: externer Zufluss
        //     (z. B. „30 m³/s auf Schacht X"), NICHT Trockenwetter. UI-Einheit l/s → CMS.
        let inflows = '[INFLOWS]\n;;Node           Constituent  TimeSeries       Type   Mfactor  Sfactor  Baseline\n';
        let ts = '';
        let count = 0;
        for (const n of nodes) {
            const baseCMS = this.safeFloat(n.constantInflow, 0) / 1000.0;
            const series = Array.isArray(n.inflowSeries)
                ? n.inflowSeries.filter(p => Number.isFinite(Number(p?.t)) && Number.isFinite(Number(p?.q)))
                : [];
            if (baseCMS <= 0 && series.length === 0) continue;

            const tsName = series.length ? `TSIN_${n.id}` : '""';
            inflows += `${this.pad(n.id)} FLOW         ${this.pad(tsName)} FLOW   1.0      1.0      ${baseCMS.toFixed(6)}\n`;
            // Ganglinie: Zeit als Stunden seit Simulationsstart (H:MM), Q l/s → m³/s
            for (const p of series) {
                const tMin = Math.max(0, Math.round(Number(p.t)));
                const hhmm = `${Math.floor(tMin / 60)}:${String(tMin % 60).padStart(2, '0')}`;
                ts += `${this.pad(`TSIN_${n.id}`)} ${hhmm.padEnd(10)} ${(Number(p.q) / 1000).toFixed(6)}\n`;
            }
            count++;
        }
        if (count > 0) {
            this.sections.push(inflows);
            if (ts) this.sections.push('[TIMESERIES]\n;;Name           Time       Value\n' + ts);
        }
    }

    addCoordinates(nodes) {
        let text = '[COORDINATES]\n;;Node           X-Coord    Y-Coord\n';
        for (const n of nodes) {
            text += `${this.pad(n.id)} ${this.pad(n.x)} ${this.pad(n.y)} \n`;
        }
        this.sections.push(text);
    }

    addLinks(edges, nodes) {
        let conduits  = '[CONDUITS]\n;;Name           Node1          Node2          Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow\n';
        let xsections = '[XSECTIONS]\n;;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';

        // Bauwerkstypen deren ausgehende Kante zum SWMM-Sonderlink wird
        const LINK_BTYPES = new Set([6, 7, 8, 9]);

        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        for (const e of edges) {
            const n1 = nodeMap.get(e.fromNodeId);
            const n2 = nodeMap.get(e.toNodeId);

            // Kante verlässt einen Link-Bauwerk-Knoten → Sonderlink statt Conduit
            if (n1 && LINK_BTYPES.has(this.getBtyp(n1))) {
                const btyp = this.getBtyp(n1);
                if (btyp === 7)      this.specialLinks.weirs.push({ id: e.id, from: n1, to: n2, edge: e });
                else if (btyp === 8) this.specialLinks.orifices.push({ id: e.id, from: n1, to: n2, edge: e, subtype: 'drossel' });
                else if (btyp === 9) this.specialLinks.orifices.push({ id: e.id, from: n1, to: n2, edge: e, subtype: 'schieber' });
                else if (btyp === 6) this.specialLinks.pumps.push({ id: e.id, from: n1, to: n2, edge: e });
                continue;
            }

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

            const initFlow = this.prefill?.initFlow.get(e.id) ?? 0;
            conduits += `${this.pad(e.id)} ${this.pad(e.fromNodeId)} ${this.pad(e.toNodeId)} ${this.pad(length)} ${this.pad(roughness)} ${this.pad(inOffset)} ${this.pad(outOffset)} ${this.pad(initFlow)} 0\n`;

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

    // Sekunden → SWMM-Intervallformat HH:MM:SS (z. B. 90 → 00:01:30)
    formatHMS(seconds) {
        const s = Math.max(1, Math.round(this.safeFloat(seconds, 60)));
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
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
