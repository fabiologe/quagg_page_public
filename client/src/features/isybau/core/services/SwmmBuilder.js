import { getHortonParams, getEffectiveBauwerkstyp, classifyPreview, LINK_BAUWERKSTYPEN, Bauwerkstyp } from '../../utils/mappings.js';
import { computePumpCurvePoints } from '../../utils/pumpCurve.js';
import { buildDwfPatternValues } from '../../utils/dwfPattern.js';
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
        this.specialLinks = { weirs: [], orifices: [], pumps: [] };
        this.endDate = new Date(this.options.startDate.getTime() + this.options.durationHours * 3600 * 1000);

        this.addTitle();
        this.addOptions();
        this.addRaingages();
        this.addSubcatchments();

        const nodes = this.store.getAllNodes;
        const edges = this.store.getAllEdges;

        this.classifyAndAddNodes(nodes, edges);
        this.addLinks(edges, nodes);   // populates this.specialLinks
        this.addLosses(edges, nodes);

        this.addWeirs();
        this.addOrifices();
        this.addPumps();
        this.addCurves();
        this.computeAreaDwfContributions();
        this.addDwfPatterns();
        this.addInflows(nodes);
        this.addTimeseries();

        // Join and clean special characters that SWMM C engine cannot parse properly
        let inpString = this.sections.join('\n');
        inpString = inpString.replace(/³/g, '3').replace(/²/g, '2');

        return {
            inpContent: inpString,
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

[REPORT]
;; Ohne diesen Block schreibt SWMM KEINE Objekte in die binäre .out-Datei
;; (Header-Counts = 0) — sämtliche Ganglinien im Viewer wären leer.
INPUT                NO
CONTINUITY           YES
FLOWSTATS            YES
SUBCATCHMENTS        ALL
NODES                ALL
LINKS                ALL
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
        // Ohne diese Prüfung schreibt createEntry() jede Outlet-Referenz roh in
        // [SUBCATCHMENTS], auch wenn der Knoten gar nicht im Netz existiert (z.B.
        // verwaiste nodeId/nodeId2 aus einem ISYBAU-Import, dessen Referenzziel
        // außerhalb des importierten Teilnetzes lag). SWMM bricht dann mit
        // "ERROR 209: undefined object" die GESAMTE Analyse ab, statt nur das
        // eine Teileinzugsgebiet zu verlieren.
        const validNodeIds = new Set((this.store.getAllNodes || []).map(n => n.id));

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

            // Slope mapping: Neigungsklasse (1-5, siehe mappings.js) -> repräsentativer SWMM %Slope
            const SLOPE_CLASS_PERCENT = { 1: 0.5, 2: 2.5, 3: 7.0, 4: 12.0, 5: 20.0 };
            let slope = SLOPE_CLASS_PERCENT[area.slope];
            if (slope === undefined) {
                slope = 0.5;
                this.warnings.push(`Fläche ${name}: Gefälleklasse fehlte oder ungültig (Wert: ${area.slope}), gesetzt auf 0.5 % (Standard, Neigungsklasse 1).`);
            }

            const splitRatio = this.safeFloat(area.splitRatio, 50);
            const hasSplit = area.nodeId2 && area.nodeId2.trim() !== '';

            const createEntry = (subName, outletNode, subAreaSize) => {
                let outlet = outletNode;
                if (!outlet) {
                    this.warnings.push(`Fläche ${subName}: Kein Anschlussknoten definiert — Teileinzugsgebiet wird übersprungen.`);
                    return;
                }
                if (!validNodeIds.has(outlet)) {
                    this.warnings.push(`Fläche ${subName}: Anschlussknoten "${outlet}" existiert nicht im Netz — Teileinzugsgebiet wird übersprungen (SWMM würde sonst mit ERROR 209 abbrechen).`);
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
    // — Single Source of Truth in utils/mappings.js, auch von PreprocessingModal genutzt
    // (Klassifizierungs-Vorschau), damit beide Stellen nie auseinanderlaufen.
    getBtyp(n) {
        return getEffectiveBauwerkstyp(n);
    }

    classifyAndAddNodes(nodes, edges) {
        const junctions = [];
        const outfalls  = [];
        const storage   = [];
        const dividers  = [];

        for (const n of nodes) {
            const { section } = classifyPreview(n);
            if (section === '[STORAGE]') storage.push(n);
            else if (section === '[OUTFALLS]') outfalls.push(n);
            else if (section === '[DIVIDERS]') dividers.push(n);
            else junctions.push(n); // inkl. Pumpe/Wehr/Drossel/Schieber (deren Kante wird zum Link)
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
        this.addDividers(dividers, edges);
        this.addCoordinates(nodes);
    }

    // Flow-Divider (OVERFLOW/CUTOFF) — node.c:1113 divider_readParams:
    //   "nodeID elev divLink OVERFLOW [maxDepth initDepth surDepth aPond]"
    //   "nodeID elev divLink CUTOFF qCutoff [maxDepth initDepth surDepth aPond]"
    // Beide ausgehenden Haltungen bleiben normale [CONDUITS] (siehe addLinks()) —
    // hier wird nur festgelegt, WELCHE davon die abgezweigte ist.
    addDividers(nodes, edges) {
        if (!nodes.length) return;
        let text = '[DIVIDERS]\n;;Name           Elevation  DivLink        Type       Parameters\n';

        const outgoingByNode = new Map();
        for (const e of edges) {
            if (!outgoingByNode.has(e.fromNodeId)) outgoingByNode.set(e.fromNodeId, []);
            outgoingByNode.get(e.fromNodeId).push(e);
        }

        for (const n of nodes) {
            const outgoing = outgoingByNode.get(n.id) || [];
            if (outgoing.length < 2) {
                this.warnings.push(`Verteiler ${n.id}: Braucht mindestens 2 ausgehende Haltungen — übersprungen.`);
                continue;
            }

            // Abgezweigte Haltung: manuelle Auswahl > Auto-Vorschlag (höhere Sohlhöhe
            // Z1 = Überlauf-/Nebenleitung liegt konventionell über der Hauptleitung).
            // Auto-Vorschlag nur bei genau 2 Kandidaten eindeutig — sonst Pflichtwahl.
            let divLink = outgoing.find(e => e.id === n.dividerLinkId);
            if (!divLink && outgoing.length === 2) {
                const z1 = (e) => this.safeFloat(e.z1, n.z);
                divLink = z1(outgoing[0]) >= z1(outgoing[1]) ? outgoing[0] : outgoing[1];
            }
            if (!divLink) {
                this.warnings.push(`Verteiler ${n.id}: Abgezweigte Haltung nicht eindeutig (${outgoing.length} Kandidaten) — bitte manuell wählen. Übersprungen.`);
                continue;
            }

            const type = n.dividerType === 'CUTOFF' ? 'CUTOFF' : 'OVERFLOW';
            const param = type === 'CUTOFF' ? ` ${(this.safeFloat(n.dividerCutoffFlow, 0) / 1000).toFixed(4)}` : '';
            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(divLink.id)} ${this.pad(type)}${param}\n`;
        }
        this.sections.push(text);
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
            // Überstau-Ableitung. Die Flags werden in Node.applyOverflowState()
            // normalisiert (isManhole=false erzwingt canOverflow=false), daher gilt:
            //   canOverflow=true  -> Deckel offen: SurDepth 0, Aponded = angeschlossene Fläche
            //   canOverflow=false -> versiegelt/unterirdisch: SurDepth 100, Aponded 0
            // isManhole wird zusätzlich geprüft, um alte Projektdateien mit
            // unnormalisiertem Zustand identisch zu behandeln.
            let surDepth = 100.0; // Sealed default
            let aPonded = 0;

            if (n.isManhole !== false && n.canOverflow !== false) {
                surDepth = 0; // Overflows immediately

                const calculatedArea = nodePondingMap.get(n.id);
                if (calculatedArea && calculatedArea > 1.0) {
                    aPonded = calculatedArea;
                } else {
                    // Fallback constant if no area connected (prevent singularities)
                    aPonded = 20.0;
                }
            }

            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(n.depth)} 0          ${this.pad(surDepth)} ${this.pad(aPonded)}\n`;
        }
        this.sections.push(text);
    }

    addOutfalls(nodes) {
        let text = '[OUTFALLS]\n;;Name           Elevation  Type       Stage Data       Gated    RouteTo\n';
        // 'throttled' wird nicht als FIXED/NORMAL-Outfall übersetzt, sondern in
        // addLinks() zu einem echten [ORIFICES]-Sonderlink (siehe dort) — der Node
        // bleibt hydraulisch ein simpler FREE-Outfall, nur mit Kommentar markiert.
        // (Entfernt: NORMAL/FIXED-Mapping für outflowType war totes Gleis — UI bietet
        // nur 'free'/'throttled' an. FIXED ohne den von outfall_readParams (node.c)
        // geforderten 4. Token "Stage Data" hätte den Solver mit ERR_ITEMS abgebrochen.)
        for (const n of nodes) {
            text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad('FREE')}${n.outflowType === 'throttled' ? ' ;Throttled' : ''} \n`;
        }
        this.sections.push(text);
    }

    addStorage(nodes) {
        if (nodes.length === 0) return;
        let text = '[STORAGE]\n;;Name           Elev       MaxDepth   InitDepth  Shape      Curve Name/Params            SurDepth  Fevap\n';
        let curvesText = '';

        for (const n of nodes) {
            const bd = n.bauwerkData;

            // Volume: explizit > bauwerkData > Fallback 10 m³
            let volume = this.safeFloat(n.volume, 0);
            if (volume <= 0 && bd?.volume > 0) volume = bd.volume;
            if (volume <= 0) {
                volume = 10;
                this.warnings.push(`Speicher ${n.id}: Kein Volumen definiert, Fallback 10 m³.`);
            }

            // Tiefe: UI maxDepth > bauwerkData.maxDepth > node.depth > 3m
            let depth = this.safeFloat(n.maxDepth, 0);
            if (depth <= 0) depth = this.safeFloat(bd?.maxDepth, 0);
            if (depth <= 0) depth = this.safeFloat(n.depth, 0);
            if (depth <= 0) depth = 3.0;

            const initDepth = this.safeFloat(n.initDepth, 0);

            // Form als FUNCTIONAL-Preset A(h) = Coeff·h^Expon, volumentreu:
            //   PRISMATIC:  A = V/D                 (konstante Fläche)
            //   CONICAL:    A = (2V/D²)·h           (Fläche wächst linear, Trichter)
            //   PYRAMIDAL:  A = (3V/D³)·h²          (Fläche wächst quadratisch)
            // (Der Solver kennt nur FUNCTIONAL/TABULAR — Shape-Keywords wie
            //  CYLINDRICAL existieren in SWMM 5.1/5.2-Kern nicht.)
            // TABULAR: echte Tiefe/Fläche-Wertetabelle statt FUNCTIONAL-Näherung —
            // referenziert einen [CURVES]-Eintrag vom Typ STORAGE (node.c:664-666:
            // "nodeID elev maxDepth initDepth TABULAR curveID surDepth fEvap").
            // Mind. 2 gültige Stützstellen nötig, sonst Fallback auf PRISMATIC.
            const curvePts = Array.isArray(n.storageCurve)
                ? n.storageCurve.filter(p => Number.isFinite(p?.depth) && Number.isFinite(p?.area) && p.depth >= 0 && p.area >= 0)
                : [];
            const useTabular = n.storageShape === 'TABULAR' && curvePts.length >= 2;

            let coeff, expon;
            if (!useTabular) {
                if (n.storageShape === 'CONICAL') {
                    coeff = 2 * volume / (depth * depth);
                    expon = 1;
                } else if (n.storageShape === 'PYRAMIDAL') {
                    coeff = 3 * volume / (depth * depth * depth);
                    expon = 2;
                } else {
                    coeff = volume / depth;
                    expon = 0;
                }
            }

            // Verdunstung: UI evapFactor (0-1), Standard 0
            const fevap = Math.min(1, Math.max(0, this.safeFloat(n.evapFactor, 0)));

            // Versickerungsanlage (Bauwerkstyp 12): echte SWMM-Exfiltration statt reinem
            // Kommentar. exfil_readStorageParams erwartet nach SurDepth/Fevap entweder
            // 1 Token (Ksat) oder 3 (SuctionHead, Ksat, IMDmax) — hier reicht ein reiner
            // Ksat-Wert. seepageRate (m³/h) wird über die Grundfläche des Speichers in
            // eine Sickerrate (mm/h) umgerechnet (Näherung: Fläche = Volumen/Tiefe).
            let exfilToken = '';
            if (n.bauwerkstyp === 12) {
                const seepM3h = this.safeFloat(bd?.seepageRate, 0);
                if (seepM3h > 0) {
                    const planArea = volume / depth;
                    if (planArea > 0.01) {
                        const ksatMmHr = (seepM3h / planArea) * 1000; // m/h -> mm/h
                        exfilToken = ` ${ksatMmHr.toFixed(4)}`;
                    } else {
                        this.warnings.push(`Versickerungsanlage ${n.id}: Grundfläche zu klein für Sickerraten-Berechnung — Versickerung ignoriert.`);
                    }
                }
            }

            if (useTabular) {
                const curveName = `STOR_${n.id}`;
                if (!curvesText) curvesText = '[CURVES]\n;;Name           Type       X-Value    Y-Value\n';
                curvePts.forEach((p, i) => {
                    curvesText += i === 0
                        ? `${this.pad(curveName)} STORAGE    ${this.pad(p.depth)} ${this.pad(p.area)}\n`
                        : `${this.pad(curveName)}            ${this.pad(p.depth)} ${this.pad(p.area)}\n`;
                });
                // Tokens: Name Elev MaxDepth InitDepth TABULAR CurveID SurDepth Fevap [Ksat]
                text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(depth)} ${this.pad(initDepth)} TABULAR    ${this.pad(curveName)}            0          ${fevap.toFixed(2)}${exfilToken}\n`;
            } else {
                // Tokens: Name Elev MaxDepth InitDepth FUNCTIONAL Coeff Expon Const SurDepth Fevap [Ksat]
                text += `${this.pad(n.id)} ${this.pad(n.z)} ${this.pad(depth)} ${this.pad(initDepth)} FUNCTIONAL ${coeff.toFixed(3)} ${expon}          0          0          ${fevap.toFixed(2)}${exfilToken}\n`;
            }
        }
        this.sections.push(text);
        if (curvesText) this.sections.push(curvesText);
    }

    addWeirs() {
        if (!this.specialLinks.weirs.length) return;
        let text = '[WEIRS]\n;;Name           Node1          Node2          Type         CrestHt    Cd         Gated    EndCon   EndCoeff   Surcharge\n';
        let xs   = '[XSECTIONS]\n;;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';

        for (const { id, from, to } of this.specialLinks.weirs) {
            if (!to) { this.warnings.push(`Wehr ${id}: Kein Zielknoten — übersprungen.`); continue; }
            const bd = from.bauwerkData;

            // Priorität: UI weirHeight (Domain-Feld, relativ ab Sohle; Legacy-Key wehrHeight)
            //            > XML SchwellenhoeheMin (absolut) > 70% Schachttiefe
            const uiWeirHeight = this.safeFloat(from.weirHeight, 0) > 0
                ? this.safeFloat(from.weirHeight)
                : this.safeFloat(from.wehrHeight, 0);
            let crestHt;
            if (uiWeirHeight > 0) {
                crestHt = uiWeirHeight;
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

            // Wehrtyp (vorher immer hardcoded TRANSVERSE) + Flap-Gate
            const weirType = ['TRANSVERSE', 'SIDEFLOW', 'V-NOTCH'].includes(from.weirType) ? from.weirType : 'TRANSVERSE';
            const gated = from.gated ? 'YES' : 'NO';

            text += `${this.pad(id)} ${this.pad(from.id)} ${this.pad(to.id)} ${this.pad(weirType)}${this.pad(crestHt)} ${cd.toFixed(2)}      ${this.pad(gated)}0        0          YES\n`;

            // V-NOTCH verlangt eine TRIANGULAR-Xsection (weir_validate: ERR_REGULATOR_SHAPE
            // sonst); Transverse/Sideflow bleiben beim offenen Rechteck als Kammer-Näherung.
            if (weirType === 'V-NOTCH') {
                xs += `${this.pad(id)} TRIANGULAR ${this.pad(crestHt > 0 ? crestHt : 0.5)} ${this.pad(laenge)} 0          0          1\n`;
            } else {
                xs += `${this.pad(id)} RECT_OPEN  ${this.pad(crestHt > 0 ? crestHt : 0.5)} ${this.pad(laenge)} 0          0          1\n`;
            }
        }
        this.sections.push(text);
        this.sections.push(xs);
    }

    addOrifices() {
        if (!this.specialLinks.orifices.length) return;
        let text = '[ORIFICES]\n;;Name           Node1          Node2          Type         Offset     Cd         Gated    CloseTime\n';
        let xs   = '[XSECTIONS]\n;;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';

        for (const { id, from, to, subtype } of this.specialLinks.orifices) {
            if (!to || !from) { this.warnings.push(`Orifice ${id}: Kein Start-/Zielknoten — übersprungen.`); continue; }
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
                // Breite: UI gateWidth > XML schieberBreite > 0.3m; initialOpening skaliert den Querschnitt
                const b = this.safeFloat(from.gateWidth, 0) > 0
                    ? this.safeFloat(from.gateWidth)
                    : this.safeFloat(from.bauwerkData?.schieberBreite, 0.3);
                const opening = this.safeFloat(from.initialOpening, 1.0);
                diameter = b * Math.sqrt(Math.max(0.01, opening)); // reduzierter Querschnitt
            } else if (subtype === 'auslaufDrossel') {
                // Gedrosselter Auslauf (outflowType='throttled'): UI-Feld constantOutflow
                // hatte bisher keine hydraulische Wirkung (nur ein Kommentar in [OUTFALLS]).
                // Hier auf dieselbe Weise wie eine Drossel in ein Orifice übersetzt.
                const Q_ls = this.safeFloat(to.constantOutflow, 0);
                if (Q_ls > 0) {
                    const A = (Q_ls / 1000) / (0.65 * Math.sqrt(2 * 9.81));
                    diameter = Math.max(0.05, Math.min(Math.sqrt(4 * A / Math.PI), 2.0));
                } else {
                    this.warnings.push(`Gedrosselter Auslauf ${to.id}: Kein Max.-Abfluss angegeben — Standard-Durchmesser 0.3 m.`);
                }
            }

            // Orifice-Typ (BOTTOM|SIDE) + Flap-Gate: nur für echte Drossel-/Schieber-
            // Bauwerke UI-gesteuert (from = der Bauwerksknoten); der gedrosselte Auslauf
            // hat keine eigene UI dafür und bleibt BOTTOM/ungated.
            const isStructure = subtype === 'drossel' || subtype === 'schieber';
            const orificeType = isStructure && from.orificeType === 'SIDE' ? 'SIDE' : 'BOTTOM';
            const gated = isStructure && from.gated ? 'YES' : 'NO';

            text += `${this.pad(id)} ${this.pad(from.id)} ${this.pad(to.id)} ${this.pad(orificeType)}0          0.65       ${this.pad(gated)}0\n`;
            xs   += `${this.pad(id)} CIRCULAR   ${this.pad(diameter)} 0          0          0          1\n`;
        }
        this.sections.push(text);
        this.sections.push(xs);
    }

    addPumps() {
        if (!this.specialLinks.pumps.length) return;
        // Spalten: Name Node1 Node2 PumpCurve Status Startup Shutoff — der Solver
        // liest Position 6 IMMER als Startup- (Einschalt-) und Position 7 als
        // Shutoff- (Ausschalt-) Tiefe (link.c: pump_readParams), unabhängig von der
        // Spaltenbeschriftung. Startup muss > Shutoff sein (Nasspumpe schaltet bei
        // hohem Stand ein, bei niedrigem aus), sonst bricht pump_validate mit
        // ERR_PUMP_LIMITS ab.
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
            const name = `CRV_${id}`;

            // computePumpCurvePoints() ist die einzige Quelle für Q_d/H_d/Punkte —
            // von PumpCurvePreview.vue (Vorschau im ElementInfo) gemeinsam genutzt,
            // damit Vorschau und tatsächlich geschriebene .inp-Kennlinie nicht
            // auseinanderlaufen können (siehe utils/pumpCurve.js).
            const { H_d, Q_d, estimated, points } = computePumpCurvePoints(from);
            if (estimated) {
                this.warnings.push(`Pumpe ${id}: Keine Förderleistung angegeben, Schätzung aus Leistung: ${(Q_d * 1000).toFixed(1)} l/s.`);
            }

            // PUMP3 Kennlinie: X-Value = Förderhöhe (Head), Y-Value = Förderleistung
            // bei dieser Höhe (link.c pump_getFlow: `table_lookup(&Curve[m], head)`
            // sucht per HEAD und liefert FLOW zurück — nicht umgekehrt!). Vorher
            // standen Q_d/H_d in den falschen Spalten: der Solver las die Fördermenge
            // (z.B. 0.03 m³/s) als winzige Förderhöhe und die Förderhöhe (z.B. 10 m)
            // als Fördermenge von 10 m³/s — daraus resultierte eine um Größenordnungen
            // zu große Pumpe ("System explodiert" bei z.B. 30 l/s Eingabe).
            // 3 Punkte, nach Head aufsteigend sortiert (Pflicht laut table_readCurve):
            // Freilauf (0 Head, max. Fluss) → Auslegung (H_d, Q_d) → Abriegelung (1.3×H_d, 0).
            // "Pump" (ohne Ziffer) ist KEIN gültiges SWMM-Keyword — table_readCurve
            // matcht per Präfix gegen PUMP1..PUMP5 und bricht sonst mit ERR_KEYWORD ab.
            text += `${this.pad(name)} PUMP3      ${points[0].head.toFixed(4)}     ${points[0].flow.toFixed(4)}\n`;
            text += `${this.pad(name)}            ${points[1].head.toFixed(3)}      ${points[1].flow.toFixed(4)}\n`;
            text += `${this.pad(name)}            ${points[2].head.toFixed(3)}      ${points[2].flow.toFixed(3)}\n`;
        }
        this.sections.push(text);
    }

    // Trockenwetterzufluss aus Schmutzfracht-Stammdaten (Area.schmutzfracht) je
    // Anschlussknoten aufsummieren — Grundlage für addDwfPatterns()/addInflows().
    // Getrennt von beiden, weil addDwfPatterns() den gewichteten Spitzenfaktor
    // braucht, addInflows() nur die Summenflüsse.
    computeAreaDwfContributions() {
        this.areaDwfByNode = new Map();
        const areas = this.store.areas || [];

        for (const area of areas) {
            const sf = area.schmutzfracht;
            if (!sf || sf.einwohnerwerte == null) continue;

            if (!area.nodeId) {
                this.warnings.push(`Fläche ${area.id}: Schmutzfracht-Daten vorhanden, aber kein Anschlussknoten — kein Trockenwetterzufluss erzeugt.`);
                continue;
            }

            const wasserverbrauch = this.safeFloat(sf.wasserverbrauch, 0);
            if (wasserverbrauch <= 0) {
                this.warnings.push(`Fläche ${area.id}: Einwohnerwerte gesetzt, aber kein Wasserverbrauch — kein Trockenwetterzufluss erzeugt.`);
                continue;
            }

            const einwohnerwerte = this.safeFloat(sf.einwohnerwerte, 0);
            const flow = einwohnerwerte * wasserverbrauch / 86400; // l/(E*d) * E / (s/d) = l/s
            if (flow <= 0) continue;

            if (!this.areaDwfByNode.has(area.nodeId)) {
                this.areaDwfByNode.set(area.nodeId, { flow: 0, contributions: [] });
            }
            const entry = this.areaDwfByNode.get(area.nodeId);
            entry.flow += flow;
            entry.contributions.push({ areaId: area.id, flow, tagesspitzenfaktor: this.safeFloat(sf.tagesspitzenfaktor, null) });
        }
    }

    // [PATTERNS] HOURLY je Knoten mit Tagesspitzenfaktor. Kurvenform kommt aus
    // utils/dwfPattern.js — einzige Quelle, auch von der Live-Vorschau
    // (DwfPatternPreview.vue) genutzt, damit Solver-Export und UI-Vorschau nie
    // auseinanderlaufen.
    addDwfPatterns() {
        this.dwfPatternByNode = new Map();
        let text = '[PATTERNS]\n;;Name           Type       Value1   Value2   Value3   Value4   Value5   Value6\n';
        let any = false;

        for (const [nodeId, entry] of this.areaDwfByNode) {
            const withFactor = entry.contributions.filter(c => c.tagesspitzenfaktor != null && c.tagesspitzenfaktor > 0);
            if (withFactor.length === 0) continue;

            const totalFlow = withFactor.reduce((s, c) => s + c.flow, 0);
            const peakFactor = totalFlow > 0
                ? withFactor.reduce((s, c) => s + c.flow * c.tagesspitzenfaktor, 0) / totalFlow
                : withFactor[0].tagesspitzenfaktor;

            if (new Set(withFactor.map(c => c.tagesspitzenfaktor)).size > 1) {
                this.warnings.push(`Knoten ${nodeId}: mehrere Flächen mit abweichenden Tagesspitzenfaktoren — gewichteter Mittelwert (${peakFactor.toFixed(2)}) verwendet.`);
            }

            const values = buildDwfPatternValues(peakFactor);

            const patternId = `DWF_${nodeId}`;
            this.dwfPatternByNode.set(nodeId, patternId);

            for (let i = 0; i < 24; i += 6) {
                const chunk = values.slice(i, i + 6).map(v => v.toFixed(3)).join(' ');
                text += i === 0
                    ? `${this.pad(patternId)} HOURLY     ${chunk}\n`
                    : `${this.pad(patternId)}            ${chunk}\n`;
            }
            any = true;
        }

        if (any) this.sections.push(text);
    }

    addInflows(nodes) {
        let text = '[DWF]\n;;Node           Parameter  Average    TimePatterns\n';
        let count = 0;
        const areaByNode = this.areaDwfByNode || new Map();
        const patternByNode = this.dwfPatternByNode || new Map();

        for (const n of nodes) {
            const manualFlow = this.safeFloat(n.constantInflow, 0);
            const areaEntry = areaByNode.get(n.id);
            const areaFlow = areaEntry ? areaEntry.flow : 0;
            const flow = manualFlow + areaFlow;
            if (flow > 0) {
                // Formatting: Node FLOW Value
                // SWMM DWF usually in same units as Flow Units? default CMS (m3/s) or LPS?
                // Header says FLOW_UNITS CMS.
                // Input is "l/s" in UI.
                // Convert l/s to CMS: / 1000
                const flowCMS = flow / 1000.0;
                const pattern = patternByNode.get(n.id) || '';
                text += `${this.pad(n.id)} FLOW       ${flowCMS.toFixed(6)} ${pattern}\n`;
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
        let conduits  = '[CONDUITS]\n;;Name           Node1          Node2          Length     Roughness  InOffset   OutOffset  InitFlow   MaxFlow\n';
        let xsections = '[XSECTIONS]\n;;Link           Shape      Geom1      Geom2      Geom3      Geom4      Barrels\n';

        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        // Pumpe/Wehr/Drossel/Schieber: ein Bauwerksknoten hat konzeptionell EINE
        // Pumpe/EIN Wehr, nicht mehrere. Nur die erste ausgehende Haltung wird zum
        // Sonderlink; weitere ausgehende Haltungen bleiben normale Conduits (mit
        // Warnung) — sonst würde ein Typ-Wechsel Schacht→Pumpe an einer Verzweigung
        // versehentlich alle ausgehenden Haltungen zu Pumpen machen.
        const convertedSpecialNodes = new Set();

        for (const e of edges) {
            const n1 = nodeMap.get(e.fromNodeId);
            const n2 = nodeMap.get(e.toNodeId);

            // Kante verlässt einen Link-Bauwerk-Knoten → Sonderlink statt Conduit
            if (n1 && LINK_BAUWERKSTYPEN.has(this.getBtyp(n1)) && !convertedSpecialNodes.has(n1.id)) {
                const btyp = this.getBtyp(n1);
                convertedSpecialNodes.add(n1.id);
                if (btyp === 7)      this.specialLinks.weirs.push({ id: e.id, from: n1, to: n2, edge: e });
                else if (btyp === 8) this.specialLinks.orifices.push({ id: e.id, from: n1, to: n2, edge: e, subtype: 'drossel' });
                else if (btyp === 9) this.specialLinks.orifices.push({ id: e.id, from: n1, to: n2, edge: e, subtype: 'schieber' });
                else if (btyp === 6) this.specialLinks.pumps.push({ id: e.id, from: n1, to: n2, edge: e });
                continue;
            }
            if (n1 && LINK_BAUWERKSTYPEN.has(this.getBtyp(n1)) && convertedSpecialNodes.has(n1.id)) {
                const btyp = this.getBtyp(n1);
                this.warnings.push(`Knoten ${n1.id} (${Bauwerkstyp[btyp] || btyp}): mehrere ausgehende Haltungen — nur eine wurde als Sonderlink übersetzt, Haltung ${e.id} bleibt normaler Kanal.`);
                // Fällt durch zur normalen Conduit-Behandlung unten.
            }

            // Kante mündet in einen gedrosselten Auslauf (outflowType='throttled')
            // → Orifice statt Conduit, damit "Max. Abfluss" tatsächlich hydraulisch
            // wirkt (vorher nur ein wirkungsloser Kommentar in [OUTFALLS]).
            if (n1 && n2 && n2.outflowType === 'throttled') {
                this.specialLinks.orifices.push({ id: e.id, from: n1, to: n2, edge: e, subtype: 'auslaufDrossel' });
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

    // Rechen/Sieb/Einlaufbauwerk (Bauwerkstyp 10/11/14): die Haltung bleibt ein
    // normaler Conduit (kein Sonderlink), bekommt nur einen zusätzlichen
    // Eintrittsverlustbeiwert (link_readLossParams, link.c:271: "LinkID cInlet
    // cOutlet cAvg FlapGate SeepRate"). Rein additiv — kein addLinks()-Intercept.
    addLosses(edges, nodes) {
        const LOSS_BTYPES = new Set([10, 11, 14]);
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        let text = '[LOSSES]\n;;Link           Kentry     Kexit      Kavg       FlapGate   Seepage\n';
        let count = 0;

        for (const e of edges) {
            const n1 = nodeMap.get(e.fromNodeId);
            if (!n1 || !LOSS_BTYPES.has(this.getBtyp(n1))) continue;
            const coeff = this.safeFloat(n1.lossCoeff, 0);
            if (coeff <= 0) continue;
            text += `${this.pad(e.id)} ${this.pad(coeff)} 0          0          NO         0\n`;
            count++;
        }
        if (count > 0) this.sections.push(text);
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
            // Kein Regen in der UI konfiguriert => echte Nullreihe, damit RG1
            // strukturell gültig bleibt (SWMM braucht eine TIMESERIES-Quelle),
            // aber tatsächlich 0 mm/h liefert. Vorher stand hier ein hartkodiertes
            // 10 mm/h-Fake-Regenereignis, das jede reine Trockenwetter/Schmutz-
            // fracht-Simulation unbemerkt mit echtem Regenabfluss verfälscht hat.
            this.warnings.push('Kein Regen konfiguriert — RG1/default_rain liefert 0 mm/h (reine Trockenwetter-Simulation).');
            text += `default_rain     ${this.formatDate(this.options.startDate)} 00:00      0.0\n`;
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
