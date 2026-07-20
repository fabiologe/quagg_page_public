import { describe, it, expect } from 'vitest';
import { SwmmOutParser } from '../utils/SwmmOutParser.js';

const MAGIC = 516114522;
const SUB_VARS = 8, NODE_VARS = 6, LINK_VARS = 5, SYS_VARS = 15;

/**
 * Baut eine minimale, strukturell gültige SWMM-.out-Datei:
 * Header → IDs → Properties → Var-Code-Blöcke → Ergebnis-Schritte → Trailer.
 */
function buildOutFile({ nodeSteps }) {
    const subIds = ['SC1'];
    const nodeIds = ['N1', 'N2'];
    const linkIds = ['L1'];

    const ints = [];
    const chunks = [];
    let offset = 0;
    const pushInt = (v) => { chunks.push({ type: 'i32', v }); offset += 4; };
    const pushFloat = (v) => { chunks.push({ type: 'f32', v }); offset += 4; };
    const pushDouble = (v) => { chunks.push({ type: 'f64', v }); offset += 8; };
    const pushId = (s) => {
        pushInt(s.length);
        for (const c of s) { chunks.push({ type: 'u8', v: c.charCodeAt(0) }); offset += 1; }
    };

    // Header
    pushInt(MAGIC); pushInt(52000); pushInt(3); // magic, version, CMS
    pushInt(subIds.length); pushInt(nodeIds.length); pushInt(linkIds.length); pushInt(0);

    // IDs
    subIds.forEach(pushId); nodeIds.forEach(pushId); linkIds.forEach(pushId);

    // Properties (Parser überspringt: Sub-Area + Node-Props 3×)
    subIds.forEach(() => pushFloat(1.0));
    nodeIds.forEach(() => { pushInt(0); pushFloat(100); pushFloat(3); });

    // Var-Code-Blöcke (zusammenhängend, Sys-Block als Scan-Signatur [15][0..14])
    pushInt(SUB_VARS); for (let i = 0; i < SUB_VARS; i++) pushInt(i);
    pushInt(NODE_VARS); for (let i = 0; i < NODE_VARS; i++) pushInt(i);
    pushInt(LINK_VARS); for (let i = 0; i < LINK_VARS; i++) pushInt(i);
    pushInt(SYS_VARS); for (let i = 0; i < SYS_VARS; i++) pushInt(i);

    const resultsStart = offset;

    // Ergebnis-Schritte
    nodeSteps.forEach((step, s) => {
        pushDouble(45000 + s / 1440); // Julian Date, 1-min-Schritte
        // Subcatchments (runoff an Index 3)
        for (let v = 0; v < SUB_VARS; v++) pushFloat(v === 3 ? 0.5 : 0);
        // Nodes: [depth, head, vol, lat, totalInflow, flood]
        for (const nodeVals of step.nodes) {
            for (let v = 0; v < NODE_VARS; v++) pushFloat(nodeVals[v] ?? 0);
        }
        // Links: [flow, depth, vel, vol, cap]
        for (let v = 0; v < LINK_VARS; v++) pushFloat(step.link?.[v] ?? 0);
        // System
        for (let v = 0; v < SYS_VARS; v++) pushFloat(0);
    });

    // Trailer (6 × int32): [IDpos, InputPos, OutputPos, NumPeriods, ErrCode, Magic]
    pushInt(0); pushInt(0); pushInt(resultsStart); pushInt(nodeSteps.length); pushInt(0); pushInt(MAGIC);

    // Serialisieren
    const buf = new ArrayBuffer(offset);
    const view = new DataView(buf);
    let pos = 0;
    for (const c of chunks) {
        if (c.type === 'i32') { view.setInt32(pos, c.v, true); pos += 4; }
        else if (c.type === 'f32') { view.setFloat32(pos, c.v, true); pos += 4; }
        else if (c.type === 'f64') { view.setFloat64(pos, c.v, true); pos += 8; }
        else { view.setUint8(pos, c.v); pos += 1; }
    }
    return new Uint8Array(buf);
}

describe('SwmmOutParser', () => {
    it('parst synthetische .out-Datei mit korrekten Node-/Link-Werten', () => {
        const file = buildOutFile({
            nodeSteps: [
                { nodes: [[0.5, 100.5, 2.0, 0, 0.01, 0], [0.2, 98.2, 1.0, 0, 0.005, 0]], link: [0.02, 0.3, 1.1, 0.5, 0.4] },
                { nodes: [[0.8, 100.8, 3.5, 0, 0.02, 0.001], [0.3, 98.3, 1.5, 0, 0.008, 0]], link: [-0.01, 0.2, 0.9, 0.4, 0.3] }
            ]
        });

        const series = new SwmmOutParser(file).parse();
        expect(series).toHaveLength(2);

        const step0 = series[0];
        expect(step0.nodes.N1.depth).toBeCloseTo(0.5, 4);
        expect(step0.nodes.N1.vol).toBeCloseTo(2.0, 4);
        expect(step0.nodes.N1.inflow).toBeCloseTo(10, 3); // 0.01 CMS → 10 l/s
        expect(step0.edges.L1.q).toBeCloseTo(20, 3);      // |0.02| CMS → 20 l/s
        expect(step0.edges.L1.signedQ).toBeCloseTo(20, 3);
        expect(series[1].edges.L1.signedQ).toBeCloseTo(-10, 3);

        // Zeitachse relativ zum Start (1 min = 60 s)
        expect(step0.time).toBe(0);
        expect(series[1].time).toBeCloseTo(60, 0);
    });

    it('wirft bei ungültiger Magic Number', () => {
        const junk = new Uint8Array(64); // alles 0
        expect(() => new SwmmOutParser(junk).parse()).toThrow(/Magic/);
    });

    it('wirft bei fehlender SysVars-Signatur statt Müll-Zeitreihen zu liefern', () => {
        // Gültiger Header, aber danach nur Nullen — Struktur-Scan MUSS scheitern.
        const buf = new ArrayBuffer(4096);
        const view = new DataView(buf);
        view.setInt32(0, MAGIC, true);
        view.setInt32(4, 52000, true);
        view.setInt32(8, 3, true);
        // 0 Objekte, keine Blöcke
        expect(() => new SwmmOutParser(new Uint8Array(buf)).parse()).toThrow(/SysVars|Struktur/);
    });
});
