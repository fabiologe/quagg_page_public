// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildIsybauXML } from '../utils/xmlExporter.js';
import { parseIsybauXML } from '../utils/xmlParser.js';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';
import { Area } from '../core/domain/Area.js';

const here = dirname(fileURLToPath(import.meta.url));

// ── Synthetisches Netz mit allen Bauwerks-Sonderfällen ──────────────────────
const makeNetwork = () => {
    const nodes = [
        new Node({ id: 'S1', x: 1000, y: 2000, z: 100.5, depth: 2.5, coverZ: 103.0, diameter: 1.0, type: 'Schacht' }),
        new Node({ id: 'S2', x: 1050, y: 2000, z: 99.8, depth: 2.0, type: 'Schacht' }),
        // Wehr (7): UI-Felder gesetzt — müssen Export-Priorität haben
        new Node({ id: 'W1', x: 1100, y: 2000, z: 99.0, depth: 3.0, type: 'Bauwerk', bauwerkstyp: 7, weirHeight: 1.2, wehrWidth: 2.5 }),
        // Becken (2)
        new Node({ id: 'B1', x: 1150, y: 2000, z: 98.5, type: 'Bauwerk', bauwerkstyp: 2, volume: 120, maxDepth: 4.0 }),
        // Pumpe (6): nur UI pumpRate/pumpHead — Leistung wird rückgerechnet
        new Node({ id: 'P1', x: 1200, y: 2000, z: 98.0, depth: 3.0, type: 'Bauwerk', bauwerkstyp: 6, pumpRate: 50, pumpHead: 8 }),
        // Drossel (8)
        new Node({ id: 'D1', x: 1250, y: 2000, z: 97.5, depth: 2.0, type: 'Bauwerk', bauwerkstyp: 8, maxOutflow: 25 }),
        // Schieber (9)
        new Node({ id: 'G1', x: 1300, y: 2000, z: 97.0, depth: 2.0, type: 'Bauwerk', bauwerkstyp: 9, gateWidth: 0.8 }),
        // Auslaufbauwerk (5) — keine Parameter
        new Node({ id: 'A1', x: 1350, y: 2000, z: 96.5, type: 'Bauwerk', bauwerkstyp: 5 }),
        // Anschlusspunkt
        new Node({ id: 'AP1', x: 1400, y: 2000, z: 96.0, type: 'Anschlusspunkt', punktkennung: 'NN' }),
    ];
    const edges = [
        new Edge({ id: 'H1', fromNodeId: 'S1', toNodeId: 'S2', length: 50, material: 'PVC', roughness: 0.011, z1: 100.5, z2: 99.8, profile: { type: 0, height: 0.3, width: 0.3 }, coords: [{ x: 1000, y: 2000, z: 100.5 }, { x: 1050, y: 2000, z: 99.8 }] }),
        new Edge({ id: 'H2', fromNodeId: 'S2', toNodeId: 'W1', length: 50, material: 'B', z1: 99.8, z2: 99.0, profile: { type: 1, height: 0.5, width: 0.4 }, type: 'Leitung' }),
    ];
    const areas = [
        new Area({ id: 'F1', points: [{ x: 990, y: 1990 }, { x: 1010, y: 1990 }, { x: 1010, y: 2010 }], size: 0.35, runoffCoeff: 0.9, edgeId: 'H1' }),
        new Area({ id: 'F2', points: [{ x: 1040, y: 1990 }, { x: 1060, y: 1990 }, { x: 1060, y: 2010 }, { x: 1040, y: 2010 }], size: 0.12, runoffCoeff: 0.5, nodeId: 'S2' }),
    ];
    return { nodes, edges, areas };
};

const roundtrip = () => {
    const { nodes, edges, areas } = makeNetwork();
    const { xml, warnings } = buildIsybauXML({
        nodes: nodes.map(n => n.toJSON()),
        edges: edges.map(e => e.toJSON()),
        areas: areas.map(a => a.toJSON()),
        metadata: { version: '2017-07' }
    });
    return { parsed: parseIsybauXML(xml), xml, warnings };
};

describe('buildIsybauXML → parseIsybauXML (Roundtrip)', () => {
    const { parsed, warnings } = roundtrip();
    const nodes = parsed.network.nodes;
    const edges = parsed.network.edges;

    it('erzeugt valides XML ohne Warnungen', () => {
        expect(warnings).toEqual([]);
    });

    it('alle Knoten und Haltungen kommen zurück', () => {
        expect(nodes.size).toBe(9);
        expect(edges.size).toBe(2);
    });

    it('Schacht: Koordinaten, Sohl-/Deckelhöhe, Tiefe, Durchmesser', () => {
        const s1 = nodes.get('S1');
        expect(s1.type).toBe('Schacht');
        expect(s1.x).toBeCloseTo(1000, 3);
        expect(s1.y).toBeCloseTo(2000, 3);
        expect(s1.z).toBeCloseTo(100.5, 3);
        expect(s1.coverZ).toBeCloseTo(103.0, 3);
        expect(s1.depth).toBeCloseTo(2.5, 3);
        expect(s1.diameter).toBeCloseTo(1.0, 3);
    });

    it('Wehr (7): UI weirHeight wird als absolute Schwelle exportiert', () => {
        const w = nodes.get('W1');
        expect(w.bauwerkstyp).toBe(7);
        // weirHeight 1.2 relativ ab Sohle 99.0 → SchwellenhoeheMin 100.2 absolut
        expect(w.bauwerkData.wehrSchwelle).toBeCloseTo(100.2, 3);
        expect(w.bauwerkData.wehrLaenge).toBeCloseTo(2.5, 3);
    });

    it('Becken (2): Volumen und Nutztiefe', () => {
        const b = nodes.get('B1');
        expect(b.bauwerkstyp).toBe(2);
        expect(b.bauwerkData.volume).toBeCloseTo(120, 1);
        expect(b.bauwerkData.maxDepth).toBeCloseTo(4.0, 3);
    });

    it('Pumpe (6): Förderhöhe erhalten, Leistung rückgerechnet aus pumpRate', () => {
        const p = nodes.get('P1');
        expect(p.bauwerkstyp).toBe(6);
        expect(p.bauwerkData.pumpHead).toBeCloseTo(8, 3);
        // P = Q·9.81·H/700 = 50·9.81·8/700 ≈ 5.606 kW — Rückrechnung im
        // PreprocessingModal ergibt daraus wieder pumpRate ≈ 50 l/s
        expect(p.bauwerkData.pumpPower).toBeCloseTo(50 * 9.81 * 8 / 700, 2);
    });

    it('Drossel (8) und Schieber (9)', () => {
        expect(nodes.get('D1').bauwerkData.nennleistung).toBeCloseTo(25, 3);
        expect(nodes.get('G1').bauwerkData.schieberBreite).toBeCloseTo(0.8, 3);
    });

    it('Auslaufbauwerk (5) und Anschlusspunkt', () => {
        expect(nodes.get('A1').bauwerkstyp).toBe(5);
        const ap = nodes.get('AP1');
        expect(ap.type).toBe('Anschlusspunkt');
        expect(ap.punktkennung).toBe('NN');
    });

    it('Haltung: Topologie, Sohlhöhen, Material, Profil (mm→m), Polyline', () => {
        const h1 = edges.get('H1');
        expect(h1.from).toBe('S1');
        expect(h1.to).toBe('S2');
        expect(h1.z1).toBeCloseTo(100.5, 3);
        expect(h1.z2).toBeCloseTo(99.8, 3);
        expect(h1.length).toBeCloseTo(50, 2);
        expect(h1.material).toBe('PVC');
        expect(h1.profile.type).toBe(0);
        expect(h1.profile.height).toBeCloseTo(0.3, 3);
        expect(h1.profile.width).toBeCloseTo(0.3, 3);
        expect(h1.coords.length).toBe(2);
        expect(h1.coords[0].x).toBeCloseTo(1000, 3);

        const h2 = edges.get('H2');
        expect(h2.type).toBe('Leitung');
        expect(h2.profile.height).toBeCloseTo(0.5, 3);
        expect(h2.profile.width).toBeCloseTo(0.4, 3);
    });

    it('Flächen: Polygon, Größe, Abflussbeiwert, Haltungs-/Knoten-Referenz', () => {
        const areas = parsed.hydraulics.areas;
        expect(areas.length).toBe(2);

        const f1 = areas.find(a => a.id === 'F1');
        expect(f1.points.length).toBe(3);
        expect(f1.size).toBeCloseTo(0.35, 4);
        expect(f1.runoffCoeff).toBeCloseTo(0.9, 3);
        expect(f1.edgeId).toBe('H1');

        // Knoten-Anschluss läuft über dieselbe Referenz — der Store löst sie
        // nach der Haltungs-Suche als Knoten-Fallback auf (store loadParsedData)
        const f2 = areas.find(a => a.id === 'F2');
        expect(f2.points.length).toBe(4);
        expect(f2.edgeId).toBe('S2');
    });
});

describe('buildIsybauXML Sonderfälle', () => {
    it('Divider wird als Schacht exportiert und erzeugt eine Warnung', () => {
        const div = new Node({ id: 'DIV1', x: 0, y: 0, z: 10, type: 'Schacht' }).toJSON();
        div.type = 'Divider';
        const { xml, warnings } = buildIsybauXML({ nodes: [div], edges: [], areas: [] });
        expect(warnings.some(w => w.includes('DIV1'))).toBe(true);
        const parsed = parseIsybauXML(xml);
        expect(parsed.network.nodes.get('DIV1').type).toBe('Schacht');
    });

    it('Fläche ohne Geometrie wird als Einzugsgebiet exportiert (Catchment-Fallback)', () => {
        const a = new Area({ id: 'EZG1', points: [], size: 1.5, runoffCoeff: 0.4, nodeId: 'S1' }).toJSON();
        const { xml, warnings } = buildIsybauXML({ nodes: [], edges: [], areas: [a] });
        expect(warnings).toEqual([]); // kein Mischfall → keine Warnung
        const parsed = parseIsybauXML(xml);
        expect(parsed.hydraulics.areas.length).toBe(0);
        const c = parsed.hydraulics.catchments[0];
        expect(c.id).toBe('EZG1');
        expect(c.nodeId).toBe('S1');
        expect(c.area).toBeCloseTo(1.5, 3);
        expect(c.runoffCoeff).toBeCloseTo(0.4, 3);
    });

    it('Mischfall Flächen mit/ohne Geometrie warnt', () => {
        const withGeom = new Area({ id: 'F1', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], size: 0.1 }).toJSON();
        const noGeom = new Area({ id: 'F2', points: [], size: 0.2, nodeId: 'S1' }).toJSON();
        const { warnings } = buildIsybauXML({ nodes: [], edges: [], areas: [withGeom, noGeom] });
        expect(warnings.some(w => w.includes('ohne Polygon-Geometrie'))).toBe(true);
    });

    it('Sonderzeichen in IDs und Material werden escaped', () => {
        const n1 = new Node({ id: 'S<1>&"x"', x: 0, y: 0, z: 1 }).toJSON();
        const n2 = new Node({ id: 'S2', x: 10, y: 0, z: 0.5 }).toJSON();
        const e = new Edge({ id: 'H&1', fromNodeId: 'S<1>&"x"', toNodeId: 'S2', length: 10, material: 'St & B' }).toJSON();
        const { xml } = buildIsybauXML({ nodes: [n1, n2], edges: [e], areas: [] });
        const parsed = parseIsybauXML(xml);
        expect(parsed.network.nodes.has('S<1>&"x"')).toBe(true);
        const edge = parsed.network.edges.get('H&1');
        expect(edge.from).toBe('S<1>&"x"');
        expect(edge.material).toBe('St & B');
    });
});

describe('Roundtrip mit realer Fixture (test.xml)', () => {
    it('Import → Export → Re-Import erhält Netzgröße und Stichproben', () => {
        const original = parseIsybauXML(readFileSync(join(here, 'test.xml'), 'utf8'));

        const { xml } = buildIsybauXML({
            nodes: Array.from(original.network.nodes.values()),
            edges: Array.from(original.network.edges.values()),
            areas: original.hydraulics.areas,
            metadata: original.metadata || {}
        });
        const re = parseIsybauXML(xml);

        expect(re.network.nodes.size).toBe(original.network.nodes.size);
        expect(re.network.edges.size).toBe(original.network.edges.size);
        expect(re.hydraulics.areas.length).toBe(original.hydraulics.areas.length);

        // Stichprobe: erste Haltung
        const [edgeId, origEdge] = original.network.edges.entries().next().value;
        const reEdge = re.network.edges.get(edgeId);
        expect(reEdge.from).toBe(origEdge.from);
        expect(reEdge.to).toBe(origEdge.to);
        expect(reEdge.length).toBeCloseTo(origEdge.length, 2);
        expect(reEdge.profile.height).toBeCloseTo(origEdge.profile.height, 3);

        // Stichprobe: jeder Knoten behält Koordinaten und Sohlhöhe
        for (const [id, origNode] of original.network.nodes) {
            const reNode = re.network.nodes.get(id);
            expect(reNode, `Knoten ${id} fehlt nach Re-Import`).toBeTruthy();
            expect(reNode.x).toBeCloseTo(origNode.x, 3);
            expect(reNode.y).toBeCloseTo(origNode.y, 3);
            if (origNode.z !== null) expect(reNode.z).toBeCloseTo(origNode.z, 3);
        }
    });
});
