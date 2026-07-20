import { describe, it, expect } from 'vitest';
import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';

// SwmmBuilder liest getAllNodes/getAllEdges als GETTER (wie der Worker-Adapter),
// nicht als Methoden.
function makeStore({ nodes = [], edges = [], areas = [] } = {}) {
    return {
        get getAllNodes() { return nodes; },
        get getAllEdges() { return edges; },
        areas
    };
}

function buildInp(storeLike, options = { durationHours: 2 }) {
    const builder = new SwmmBuilder(storeLike);
    builder.setOptions(options);
    const result = builder.build();
    return typeof result === 'object' ? result : { inpContent: result, warnings: [] };
}

describe('SwmmBuilder', () => {
    const baseNetwork = () => ({
        nodes: [
            new Node({ id: 'N1', x: 0, y: 0, z: 100 }),
            new Node({ id: 'N2', x: 100, y: 0, z: 98 }), // tiefster Punkt → Outfall
            new Node({ id: 'N3', x: 50, y: 50, z: 105 })
        ],
        edges: [
            new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 100 }),
            new Edge({ id: 'E2', fromNodeId: 'N3', toNodeId: 'N1', length: 70 })
        ]
    });

    it('erzeugt Kernsektionen und automatischen Outfall', () => {
        const { inpContent } = buildInp(makeStore(baseNetwork()));
        expect(inpContent).toContain('[JUNCTIONS]');
        expect(inpContent).toContain('[CONDUITS]');
        expect(inpContent).toMatch(/N2\s+98\.000\s+FREE/);
    });

    it('Snapshot des Basis-Netzes (struktureller Golden Master)', () => {
        const { inpContent } = buildInp(makeStore(baseNetwork()));
        expect(inpContent).toMatchSnapshot();
    });

    it('nutzt UI-weirHeight (Domain-Feld) als CrestHt im [WEIRS]-Block', () => {
        const net = baseNetwork();
        const weirNode = new Node({
            id: 'W1', x: 10, y: 10, z: 99, depth: 3,
            bauwerkstyp: 7, weirHeight: 1.25
        });
        net.nodes.push(weirNode);
        net.edges.push(new Edge({ id: 'EW', fromNodeId: 'W1', toNodeId: 'N1', length: 20 }));

        const { inpContent } = buildInp(makeStore(net));
        expect(inpContent).toContain('[WEIRS]');
        // Der Wehr-Link trägt die ID der ausgehenden Kante (EW)
        const weirSection = inpContent.split('[WEIRS]')[1].split('[')[0];
        const weirLine = weirSection.split('\n').find(l => l.startsWith('EW'));
        expect(weirLine).toBeDefined();
        expect(weirLine).toMatch(/1\.250/);
        // NICHT der 70%-Schachttiefe-Fallback (2.1)
        expect(weirLine).not.toMatch(/2\.100/);
    });

    it('Überstau-Präzedenz: beide Editor-Zustände erzeugen identisches [JUNCTIONS]', () => {
        // Editor 1 (ElementPropertiesModal) setzt isManhole+canOverflow,
        // Editor 2 (ElementInfo) via applyOverflowState — nach Normalisierung
        // müssen versiegelte Knoten identisch herauskommen.
        const sealedViaManhole = new Node({ id: 'S1', x: 0, y: 0, z: 100, isManhole: false });
        const sealedViaOverflow = new Node({ id: 'S1', x: 0, y: 0, z: 100, isManhole: true, canOverflow: false });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });

        const junctionLine = (node) => {
            const { inpContent } = buildInp(makeStore({
                nodes: [node, outfall],
                edges: [new Edge({ id: 'E1', fromNodeId: 'S1', toNodeId: 'O1', length: 10 })]
            }));
            const section = inpContent.split('[JUNCTIONS]')[1].split('[')[0];
            return section.split('\n').find(l => l.startsWith('S1'));
        };

        const l1 = junctionLine(sealedViaManhole);
        const l2 = junctionLine(sealedViaOverflow);
        expect(l1).toBe(l2);
        // versiegelt: SurDepth 100, Aponded 0
        expect(l1).toMatch(/100(\.000)?\s+0(\.000)?\s*$/);
    });

    it('Speicher nutzt UI-maxDepth und Form-Preset (volumentreu)', () => {
        // Trichterförmig: A(h) = (2V/D²)·h → Coeff=2·50/4²=6.25, Expon=1
        const basin = new Node({
            id: 'B1', x: 0, y: 0, z: 100,
            bauwerkstyp: 2, volume: 50, maxDepth: 4, initDepth: 0.5, storageShape: 'CONICAL'
        });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [basin, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'B1', toNodeId: 'O1', length: 10 })]
        }));
        const section = inpContent.split('[STORAGE]')[1].split('[')[0];
        const line = section.split('\n').find(l => l.startsWith('B1'));
        expect(line).toContain('FUNCTIONAL');
        expect(line).toMatch(/4\.000/);   // maxDepth
        expect(line).toMatch(/0\.500/);   // initDepth
        expect(line).toMatch(/6\.250 1/); // Coeff Expon
    });

    it('Pumpe nutzt UI-pumpHead für die Kennlinie und schreibt ein gültiges PUMP3-Keyword', () => {
        const pump = new Node({ id: 'P1', x: 0, y: 0, z: 100, depth: 3, bauwerkstyp: 6, pumpRate: 20, pumpHead: 8 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [pump, outfall],
            edges: [new Edge({ id: 'EP', fromNodeId: 'P1', toNodeId: 'O1', length: 10 })]
        }));
        const curves = inpContent.split('[CURVES]')[1] || '';
        // "Pump" (ohne Ziffer) ist kein gültiges SWMM-Keyword (table_readCurve
        // matcht PUMP1..PUMP5) und ließ den Solver mit ERR_KEYWORD abbrechen.
        expect(curves).toMatch(/CRV_EP\s+PUMP3/);
        expect(curves).not.toMatch(/\bPump\s/);
        // PUMP3: X-Value = Head, Y-Value = Flow bei dieser Höhe (link.c pump_getFlow
        // sucht per table_lookup(curve, head) → flow). Abriegelpunkt = 1.3 × Förderhöhe = 10.4 m, 0 Fluss.
        expect(curves).toMatch(/10\.400\s+0\.000/);
        // Auslegungspunkt: H = 8 m, Q = 20 l/s = 0.02 m³/s
        expect(curves).toMatch(/8\.000\s+0\.0200/);
    });

    it('PUMP3-Kennlinie liefert bei 30 l/s realistische Fördermengen, nicht m³/s-Größenordnungen (Regression)', () => {
        // Bug: X/Y waren vertauscht — die Förderhöhe (Standard-Fallback 10 m) landete
        // in der Fluss-Spalte, wodurch der Solver eine ~13 m³/s-Pumpe sah statt 30 l/s
        // und das Netz flutete ("System explodiert").
        const pump = new Node({ id: 'P1', x: 0, y: 0, z: 100, depth: 3, bauwerkstyp: 6, pumpRate: 30 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [pump, outfall],
            edges: [new Edge({ id: 'EP', fromNodeId: 'P1', toNodeId: 'O1', length: 10 })]
        }));
        const curves = inpContent.split('[CURVES]')[1].split('[')[0];
        const flowValues = curves.split('\n')
            .filter(l => l.trim().startsWith('CRV_EP'))
            .map(l => parseFloat(l.trim().split(/\s+/).pop()))
            .filter(v => Number.isFinite(v));
        // Alle Y-Werte (Fluss) müssen im l/s-Bereich bleiben (< 1 m³/s), keine 10/13 m³/s.
        flowValues.forEach(v => expect(v).toBeLessThan(1));
        expect(Math.max(...flowValues)).toBeCloseTo(0.03 * 1.4, 4); // Q_d * 1.4
    });

    it('[PUMPS] schreibt Startup (On) vor Shutoff (Off) — Solver liest Position 6/7 fix', () => {
        // link.c: pump_readParams liest tok[5]→Startup(yOn), tok[6]→Shutoff(yOff),
        // unabhängig von der Spaltenbeschriftung. yOn muss > yOff sein, sonst bricht
        // pump_validate mit ERR_PUMP_LIMITS ab. onDepth > offDepth per Konstruktion.
        const pump = new Node({ id: 'P1', x: 0, y: 0, z: 100, depth: 3, bauwerkstyp: 6, pumpRate: 20, pumpHead: 8, onDepth: 2.0, offDepth: 0.5 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [pump, outfall],
            edges: [new Edge({ id: 'EP', fromNodeId: 'P1', toNodeId: 'O1', length: 10 })]
        }));
        const section = inpContent.split('[PUMPS]')[1].split('[')[0];
        const line = section.split('\n').find(l => l.startsWith('EP'));
        const tokens = line.trim().split(/\s+/);
        // [Name, Node1, Node2, PumpCurve, Status, Startup, Shutoff]
        const startup = parseFloat(tokens[5]);
        const shutoff = parseFloat(tokens[6]);
        expect(startup).toBeCloseTo(2.0, 3);
        expect(shutoff).toBeCloseTo(0.5, 3);
        expect(startup).toBeGreaterThan(shutoff);
    });

    it('Schieber nutzt UI-gateWidth für den Querschnitt', () => {
        const gate = new Node({ id: 'G1', x: 0, y: 0, z: 100, depth: 3, bauwerkstyp: 9, gateWidth: 0.8, initialOpening: 1.0 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [gate, outfall],
            edges: [new Edge({ id: 'EG', fromNodeId: 'G1', toNodeId: 'O1', length: 10 })]
        }));
        const xsAfterOrifices = inpContent.split('[ORIFICES]')[1] || '';
        const xsLine = xsAfterOrifices.split('\n').find(l => l.startsWith('EG') && l.includes('CIRCULAR'));
        expect(xsLine).toMatch(/0\.800/);
    });

    it('Wehr: weirType und Flap-Gate steuerbar (V-NOTCH → TRIANGULAR-Xsection)', () => {
        const weirNode = new Node({
            id: 'W1', x: 0, y: 0, z: 99, depth: 3,
            bauwerkstyp: 7, weirHeight: 1.0, wehrWidth: 0.6, weirType: 'V-NOTCH', gated: true
        });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [weirNode, outfall],
            edges: [new Edge({ id: 'EW', fromNodeId: 'W1', toNodeId: 'O1', length: 10 })]
        }));
        const weirLine = inpContent.split('[WEIRS]')[1].split('[')[0].split('\n').find(l => l.startsWith('EW'));
        expect(weirLine).toMatch(/V-NOTCH/);
        expect(weirLine).toMatch(/YES/); // Gated

        // addLinks() pusht immer ein (hier leeres) [XSECTIONS] zuerst, addWeirs() ein zweites
        const xsSections = inpContent.split('[XSECTIONS]');
        const xsLine = xsSections[xsSections.length - 1].split('\n').find(l => l.startsWith('EW'));
        expect(xsLine).toMatch(/TRIANGULAR/);
    });

    it('Drossel: orificeType SIDE statt hardcoded BOTTOM', () => {
        const drosselNode = new Node({ id: 'D1', x: 0, y: 0, z: 100, depth: 3, bauwerkstyp: 8, maxOutflow: 15, orificeType: 'SIDE', gated: true });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [drosselNode, outfall],
            edges: [new Edge({ id: 'ED', fromNodeId: 'D1', toNodeId: 'O1', length: 10 })]
        }));
        const line = inpContent.split('[ORIFICES]')[1].split('[')[0].split('\n').find(l => l.startsWith('ED'));
        expect(line).toMatch(/SIDE/);
        expect(line).toMatch(/YES/); // Gated
    });

    it('Speicher: evapFactor wird als Fevap geschrieben', () => {
        const basin = new Node({ id: 'B1', x: 0, y: 0, z: 100, bauwerkstyp: 2, volume: 20, maxDepth: 2, evapFactor: 0.6 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [basin, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'B1', toNodeId: 'O1', length: 10 })]
        }));
        const line = inpContent.split('[STORAGE]')[1].split('[')[0].split('\n').find(l => l.startsWith('B1'));
        const tokens = line.trim().split(/\s+/);
        // [Name, Elev, MaxDepth, InitDepth, FUNCTIONAL, Coeff, Expon, Const, SurDepth, Fevap]
        expect(parseFloat(tokens[9])).toBeCloseTo(0.6, 2);
    });

    it('Versickerungsanlage: seepageRate wird als echte Ksat-Exfiltration geschrieben (nicht nur Kommentar)', () => {
        const infil = new Node({
            id: 'V1', x: 0, y: 0, z: 100, bauwerkstyp: 12, volume: 40, maxDepth: 2,
            bauwerkData: { seepageRate: 0.72 } // m³/h
        });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [infil, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'V1', toNodeId: 'O1', length: 10 })]
        }));
        const line = inpContent.split('[STORAGE]')[1].split('[')[0].split('\n').find(l => l.startsWith('V1'));
        const tokens = line.trim().split(/\s+/);
        // planArea = 40/2 = 20 m²; Ksat = (0.72/20)*1000 = 36 mm/h
        expect(tokens.length).toBe(11); // ...Fevap + 1 Exfil-Token (Ksat)
        expect(parseFloat(tokens[10])).toBeCloseTo(36, 1);
    });

    it('Gedrosselter Auslauf: constantOutflow wirkt jetzt hydraulisch (Orifice statt reiner Kommentar)', () => {
        const upstream = new Node({ id: 'S1', x: 0, y: 0, z: 100 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90, outflowType: 'throttled', constantOutflow: 25 });
        const { inpContent } = buildInp(makeStore({
            nodes: [upstream, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'S1', toNodeId: 'O1', length: 10 })]
        }));
        expect(inpContent).toContain('[ORIFICES]');
        const orificeLine = inpContent.split('[ORIFICES]')[1].split('[')[0].split('\n').find(l => l.startsWith('E1'));
        expect(orificeLine).toBeDefined();
        expect(orificeLine).toMatch(/S1\s+O1\s+BOTTOM/);
        // Die Kante darf NICHT auch als normaler Conduit auftauchen
        const conduitSection = inpContent.split('[CONDUITS]')[1]?.split('[')[0] || '';
        expect(conduitSection.split('\n').find(l => l.startsWith('E1'))).toBeUndefined();
    });

    it('offener Schacht bekommt SurDepth 0 und Ponding-Fläche', () => {
        const open = new Node({ id: 'S1', x: 0, y: 0, z: 100, isManhole: true, canOverflow: true });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [open, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'S1', toNodeId: 'O1', length: 10 })]
        }));
        const section = inpContent.split('[JUNCTIONS]')[1].split('[')[0];
        const line = section.split('\n').find(l => l.startsWith('S1'));
        expect(line).toMatch(/\s0(\.000)?\s+20(\.000)?\s*$/);
    });

    // === Phase A: Rechen/Sieb/Einlaufbauwerk via [LOSSES] ===
    it('Rechen (Bauwerkstyp 10): lossCoeff erzeugt eine [LOSSES]-Zeile, Haltung bleibt normaler Conduit', () => {
        const rechen = new Node({ id: 'R1', x: 0, y: 0, z: 100, bauwerkstyp: 10, lossCoeff: 0.5 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [rechen, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'R1', toNodeId: 'O1', length: 10 })]
        }));
        expect(inpContent).toContain('[LOSSES]');
        const lossLine = inpContent.split('[LOSSES]')[1].split('[')[0].split('\n').find(l => l.startsWith('E1'));
        expect(lossLine).toBeDefined();
        expect(lossLine).toMatch(/0\.500/);
        // Kante bleibt normaler Conduit (kein Sonderlink-Intercept für Rechen/Sieb/Einlauf)
        const conduitLine = inpContent.split('[CONDUITS]')[1].split('[')[0].split('\n').find(l => l.startsWith('E1'));
        expect(conduitLine).toBeDefined();
    });

    it('Rechen ohne lossCoeff (0): keine [LOSSES]-Sektion', () => {
        const rechen = new Node({ id: 'R1', x: 0, y: 0, z: 100, bauwerkstyp: 11 });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [rechen, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'R1', toNodeId: 'O1', length: 10 })]
        }));
        expect(inpContent).not.toContain('[LOSSES]');
    });

    // === Phase B: TABULAR-Speicherkurven ===
    it('Speicher TABULAR: schreibt [CURVES] vom Typ STORAGE und referenziert die Kurve in [STORAGE]', () => {
        const basin = new Node({
            id: 'B1', x: 0, y: 0, z: 100, bauwerkstyp: 2, maxDepth: 3, initDepth: 0.2,
            storageShape: 'TABULAR',
            storageCurve: [{ depth: 0, area: 8 }, { depth: 1.5, area: 12 }, { depth: 3, area: 20 }]
        });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [basin, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'B1', toNodeId: 'O1', length: 10 })]
        }));
        expect(inpContent).toContain('[CURVES]');
        const curveLines = inpContent.split('[CURVES]')[1].split('[')[0].split('\n').filter(l => l.startsWith('STOR_B1'));
        expect(curveLines.length).toBe(3);
        expect(curveLines[0]).toMatch(/STORAGE/);
        expect(curveLines[0]).toMatch(/0\.000\s+8\.000/);
        expect(curveLines[2]).toMatch(/3\.000\s+20\.000/);

        const storageLine = inpContent.split('[STORAGE]')[1].split('[')[0].split('\n').find(l => l.startsWith('B1'));
        expect(storageLine).toMatch(/TABULAR/);
        expect(storageLine).toMatch(/STOR_B1/);
    });

    it('Speicher TABULAR ohne gültige Kurve (< 2 Punkte): Fallback auf FUNCTIONAL', () => {
        const basin = new Node({
            id: 'B1', x: 0, y: 0, z: 100, bauwerkstyp: 2, volume: 20, maxDepth: 2,
            storageShape: 'TABULAR'
        });
        // Node() füllt <2 Punkte selbst schon defensiv auf 3 auf (Editor-Startzustand) —
        // hier wird der SwmmBuilder-seitige Fallback isoliert getestet, indem die Kurve
        // nachträglich auf einen (ungültigen) Zustand mit nur 1 Stützstelle gesetzt wird.
        basin.storageCurve = [{ depth: 0, area: 10 }];
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent } = buildInp(makeStore({
            nodes: [basin, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'B1', toNodeId: 'O1', length: 10 })]
        }));
        const storageLine = inpContent.split('[STORAGE]')[1].split('[')[0].split('\n').find(l => l.startsWith('B1'));
        expect(storageLine).toMatch(/FUNCTIONAL/);
    });

    // === Phase C: Flow-Divider (OVERFLOW + CUTOFF) ===
    it('Divider OVERFLOW: [DIVIDERS]-Zeile, beide Kanten bleiben normale [CONDUITS]', () => {
        const divider = new Node({ id: 'DV1', x: 0, y: 0, z: 100, type: 'Divider', dividerType: 'OVERFLOW', dividerLinkId: 'E_over' });
        const outfall1 = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const outfall2 = new Node({ id: 'O2', x: -10, y: 0, z: 95 });
        const { inpContent } = buildInp(makeStore({
            nodes: [divider, outfall1, outfall2],
            edges: [
                new Edge({ id: 'E_main', fromNodeId: 'DV1', toNodeId: 'O1', length: 10 }),
                new Edge({ id: 'E_over', fromNodeId: 'DV1', toNodeId: 'O2', length: 10 }),
            ]
        }));
        expect(inpContent).toContain('[DIVIDERS]');
        const divLine = inpContent.split('[DIVIDERS]')[1].split('[')[0].split('\n').find(l => l.startsWith('DV1'));
        expect(divLine).toBeDefined();
        expect(divLine).toMatch(/E_over/);
        expect(divLine).toMatch(/OVERFLOW/);

        const conduitSection = inpContent.split('[CONDUITS]')[1].split('[')[0];
        expect(conduitSection.split('\n').find(l => l.startsWith('E_main'))).toBeDefined();
        expect(conduitSection.split('\n').find(l => l.startsWith('E_over'))).toBeDefined();
        // Divider-Knoten selbst darf NICHT auch in [JUNCTIONS] auftauchen
        const junctionSection = inpContent.split('[JUNCTIONS]')[1].split('[')[0];
        expect(junctionSection.split('\n').find(l => l.startsWith('DV1'))).toBeUndefined();
    });

    it('Divider CUTOFF: qCutoff wird von l/s in m³/s umgerechnet', () => {
        const divider = new Node({ id: 'DV1', x: 0, y: 0, z: 100, type: 'Divider', dividerType: 'CUTOFF', dividerLinkId: 'E_over', dividerCutoffFlow: 150 });
        const outfall1 = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const outfall2 = new Node({ id: 'O2', x: -10, y: 0, z: 95 });
        const { inpContent } = buildInp(makeStore({
            nodes: [divider, outfall1, outfall2],
            edges: [
                new Edge({ id: 'E_main', fromNodeId: 'DV1', toNodeId: 'O1', length: 10 }),
                new Edge({ id: 'E_over', fromNodeId: 'DV1', toNodeId: 'O2', length: 10 }),
            ]
        }));
        const divLine = inpContent.split('[DIVIDERS]')[1].split('[')[0].split('\n').find(l => l.startsWith('DV1'));
        expect(divLine).toMatch(/CUTOFF/);
        expect(divLine).toMatch(/0\.1500/); // 150 l/s -> 0.15 m³/s
    });

    it('Divider ohne manuelle Auswahl: Auto-Vorschlag wählt die Haltung mit höherer Sohlhöhe (Z1)', () => {
        const divider = new Node({ id: 'DV1', x: 0, y: 0, z: 100, type: 'Divider' }); // dividerLinkId nicht gesetzt
        const outfall1 = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const outfall2 = new Node({ id: 'O2', x: -10, y: 0, z: 95 });
        const { inpContent } = buildInp(makeStore({
            nodes: [divider, outfall1, outfall2],
            edges: [
                new Edge({ id: 'E_low',  fromNodeId: 'DV1', toNodeId: 'O1', length: 10, z1: 99.0 }),
                new Edge({ id: 'E_high', fromNodeId: 'DV1', toNodeId: 'O2', length: 10, z1: 99.8 }),
            ]
        }));
        const divLine = inpContent.split('[DIVIDERS]')[1].split('[')[0].split('\n').find(l => l.startsWith('DV1'));
        expect(divLine).toMatch(/E_high/);
    });

    it('Divider mit < 2 ausgehenden Haltungen: übersprungen, Warnung erzeugt', () => {
        const divider = new Node({ id: 'DV1', x: 0, y: 0, z: 100, type: 'Divider' });
        const outfall = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const { inpContent, warnings } = buildInp(makeStore({
            nodes: [divider, outfall],
            edges: [new Edge({ id: 'E1', fromNodeId: 'DV1', toNodeId: 'O1', length: 10 })]
        }));
        const divSection = inpContent.split('[DIVIDERS]')[1]?.split('[')[0] || '';
        expect(divSection.split('\n').find(l => l.startsWith('DV1'))).toBeUndefined();
        expect(warnings.some(w => w.includes('DV1') && w.includes('2 ausgehende'))).toBe(true);
    });

    // === Phase E: Bauwerkstyp-Wechsel mit mehreren ausgehenden Haltungen ===
    it('Pumpe mit 2 ausgehenden Haltungen: nur die erste wird zum Sonderlink, die zweite bleibt Conduit + Warnung', () => {
        const pump = new Node({ id: 'P1', x: 0, y: 0, z: 100, depth: 3, bauwerkstyp: 6, pumpRate: 20, pumpHead: 8 });
        const outfall1 = new Node({ id: 'O1', x: 10, y: 0, z: 90 });
        const outfall2 = new Node({ id: 'O2', x: -10, y: 0, z: 92 });
        const { inpContent, warnings } = buildInp(makeStore({
            nodes: [pump, outfall1, outfall2],
            edges: [
                new Edge({ id: 'EP1', fromNodeId: 'P1', toNodeId: 'O1', length: 10 }),
                new Edge({ id: 'EP2', fromNodeId: 'P1', toNodeId: 'O2', length: 10 }),
            ]
        }));
        const pumpSection = inpContent.split('[PUMPS]')[1].split('[')[0];
        expect(pumpSection.split('\n').find(l => l.startsWith('EP1'))).toBeDefined();
        expect(pumpSection.split('\n').find(l => l.startsWith('EP2'))).toBeUndefined();

        const conduitSection = inpContent.split('[CONDUITS]')[1].split('[')[0];
        expect(conduitSection.split('\n').find(l => l.startsWith('EP1'))).toBeUndefined();
        expect(conduitSection.split('\n').find(l => l.startsWith('EP2'))).toBeDefined();

        expect(warnings.some(w => w.includes('P1') && w.includes('mehrere ausgehende Haltungen'))).toBe(true);
    });
});
