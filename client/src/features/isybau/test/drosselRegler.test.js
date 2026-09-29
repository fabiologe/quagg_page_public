/**
 * Drossel als Abflussregler (Fahrplan „Grenzen beheben“, Stufe 5) — echter
 * WASM-SWMM-Lauf: 100 l/s Zufluss vor einer auf 15 l/s ausgelegten Drossel.
 * Vorher (Kreisblende, bei 1 m Druckhöhe ausgelegt) stieg der Abfluss mit dem
 * Einstau (Q ∝ √h); jetzt bleibt er bei Q_max.
 */
import { describe, it, expect } from 'vitest';
import { SwmmBuilder } from '../core/services/SwmmBuilder.js';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';

async function swmm(inp) {
    const M = await (await import('../utils/swmm_solver.js')).default({ print: () => {}, printErr: () => {} });
    M.FS.writeFile('/d.inp', inp);
    M.cwrap('swmm_run', 'number', ['string', 'string', 'string'])('/d.inp', '/d.rpt', '/d.out');
    return M.FS.readFile('/d.rpt', { encoding: 'utf8' });
}
const maxFluss = (rpt, id) => {
    const block = rpt.slice(rpt.indexOf('Link Flow Summary'), rpt.indexOf('Flow Classification Summary'));
    const z = block.split('\n').map(l => l.trim().split(/\s+/)).find(p => p[0] === id);
    return z ? parseFloat(z[2]) * 1000 : NaN; // Max |Flow| in CMS → l/s
};
const maxTiefe = (rpt, id) => {
    const block = rpt.slice(rpt.indexOf('Node Depth Summary'), rpt.indexOf('Node Inflow Summary'));
    const z = block.split('\n').map(l => l.trim().split(/\s+/)).find(p => p[0] === id);
    return z ? parseFloat(z[3]) : NaN;
};

describe('Drossel als Abflussregler (echter SWMM-Lauf)', () => {
    it('hält Q_max auch bei mehreren Metern Einstau', async () => {
        const nodes = [
            new Node({ id: 'S1', x: 0, y: 0, z: 100, depth: 4, constantInflow: 100 }),
            new Node({ id: 'D1', x: 20, y: 0, z: 99.8, depth: 4, bauwerkstyp: 8, maxOutflow: 15 }),
            new Node({ id: 'O1', x: 40, y: 0, z: 99 }),
        ];
        const edges = [
            new Edge({ id: 'ZU', fromNodeId: 'S1', toNodeId: 'D1', length: 20, profile: { type: 0, height: 0.5 } }),
            new Edge({ id: 'DR', fromNodeId: 'D1', toNodeId: 'O1', length: 20, profile: { type: 0, height: 0.3 } }),
        ];
        const b = new SwmmBuilder({ get getAllNodes() { return nodes; }, get getAllEdges() { return edges; }, areas: [] });
        b.setOptions({ durationHours: 1 });
        const { inpContent } = b.build();
        expect(inpContent).toContain('[OUTLETS]');
        const rpt = await swmm(inpContent);
        expect(maxTiefe(rpt, 'D1')).toBeGreaterThan(1); // die Drossel staut wirklich ein
        expect(maxFluss(rpt, 'DR')).toBeCloseTo(15, 0);  // … und lässt trotzdem nur Q_max durch
    }, 60_000);
});

describe('Auslass mit festem Wasserstand (Rückstau aus dem Vorfluter)', () => {
    const netz = (stage) => {
        const nodes = [
            new Node({ id: 'S1', x: 0, y: 0, z: 100, depth: 3, constantInflow: 20 }),
            new Node({ id: 'O1', x: 50, y: 0, z: 99.5, bauwerkstyp: 5, outflowType: 'fixed', outfallStage: stage }),
        ];
        const edges = [new Edge({ id: 'H1', fromNodeId: 'S1', toNodeId: 'O1', length: 50, profile: { type: 0, height: 0.4 } })];
        return { nodes, edges };
    };
    const inpVon = ({ nodes, edges }) => {
        const b = new SwmmBuilder({ get getAllNodes() { return nodes; }, get getAllEdges() { return edges; }, areas: [] });
        b.setOptions({ durationHours: 1 });
        return b.build().inpContent;
    };

    it('schreibt FIXED mit Wasserstand, SWMM staut die Haltung ein', async () => {
        const inp = inpVon(netz(101.2));
        expect(inp).toMatch(/O1\s+99\.500\s+FIXED\s+101\.200\s+NO/);
        const rpt = await swmm(inp);
        expect(maxTiefe(rpt, 'S1')).toBeGreaterThan(1.1); // Wasserstand 101,2 über Sohle 100 → ≥ 1,2 m im Schacht
    }, 60_000);

    it('ohne Wert: Vorab-Prüfung meldet es', async () => {
        const { validateNetwork } = await import('../utils/preSolveValidation.js');
        const { nodes, edges } = netz(null);
        expect(validateNetwork(nodes, edges).map(f => f.code)).toContain('ERR_STAGE');
    });
});
