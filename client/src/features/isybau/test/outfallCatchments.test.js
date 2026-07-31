import { describe, it, expect } from 'vitest';
import { summarizeOutfallCatchments } from '../utils/outfallCatchments.js';

// Netz: N1 -> N2 -> OUT1 (Outfall). Zwei Flächen an N1/N2.
const nodes = [
    { id: 'N1', z: 100, type: 'Schacht' },
    { id: 'N2', z: 98, type: 'Schacht' },
    { id: 'OUT1', z: 95, type: 'Auslaufbauwerk' },
];
const edges = [
    { id: 'E1', fromNodeId: 'N1', toNodeId: 'N2' },
    { id: 'E2', fromNodeId: 'N2', toNodeId: 'OUT1' },
];

describe('summarizeOutfallCatchments', () => {
    it('summiert einfache Flächen (kein Split) korrekt zum erreichten Outfall', () => {
        const areas = [
            { id: 'F1', size: 1.0, runoffCoeff: 0.5, nodeId: 'N1' },
            { id: 'F2', size: 0.5, runoffCoeff: 0.9, nodeId: 'N2' },
        ];
        const result = summarizeOutfallCatchments(areas, nodes, edges);
        expect(result).toHaveLength(1);
        expect(result[0].outfallId).toBe('OUT1');
        expect(result[0].totalAreaHa).toBeCloseTo(1.5, 6);
        // gewichteter Mittelwert: (1.0*0.5 + 0.5*0.9) / 1.5
        expect(result[0].avgRunoffCoeff).toBeCloseTo((1.0 * 0.5 + 0.5 * 0.9) / 1.5, 6);
        expect(result[0].impervAreaHa).toBeCloseTo(1.0 * 0.5 + 0.5 * 0.9, 6);
    });

    it('funktioniert mit Map statt Array für alle drei Collections', () => {
        const areasMap = new Map([['F1', { id: 'F1', size: 1.0, runoffCoeff: 0.5, nodeId: 'N1' }]]);
        const nodesMap = new Map(nodes.map(n => [n.id, n]));
        const edgesMap = new Map(edges.map(e => [e.id, e]));
        const result = summarizeOutfallCatchments(areasMap, nodesMap, edgesMap);
        expect(result).toHaveLength(1);
        expect(result[0].totalAreaHa).toBeCloseTo(1.0, 6);
    });

    it('Split-Fläche (nodeId + nodeId2) teilt sich nach splitRatio auf, ggf. auf zwei Outfalls', () => {
        // N1 und N2 münden BEIDE letztlich in OUT1 in diesem Netz, aber die
        // Aufteilung selbst muss trotzdem stimmen.
        const areas = [{ id: 'F1', size: 2.0, runoffCoeff: 0.5, nodeId: 'N1', nodeId2: 'N2', splitRatio: 25 }];
        const result = summarizeOutfallCatchments(areas, nodes, edges);
        expect(result).toHaveLength(1);
        // 25% über N1 (0.5 ha) + 75% über N2 (1.5 ha) = 2.0 ha insgesamt
        expect(result[0].totalAreaHa).toBeCloseTo(2.0, 6);
    });

    it('Fläche ohne erreichbaren Outfall (Sackgasse) wird ignoriert statt zu crashen', () => {
        const areas = [{ id: 'F1', size: 1.0, runoffCoeff: 0.5, nodeId: 'ISOLIERT' }];
        const result = summarizeOutfallCatchments(areas, nodes, edges);
        expect(result).toEqual([]);
    });

    it('Fallback-Outfall (kein Knoten explizit als Outfall klassifiziert): tiefster Knoten gilt als Auslauf', () => {
        const nodesNoOutfall = [
            { id: 'N1', z: 100, type: 'Schacht' },
            { id: 'N2', z: 98, type: 'Schacht' }, // tiefster -> impliziter Auslauf
        ];
        const edgesLocal = [{ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2' }];
        const areas = [{ id: 'F1', size: 1.0, runoffCoeff: 0.5, nodeId: 'N1' }];
        const result = summarizeOutfallCatchments(areas, nodesNoOutfall, edgesLocal);
        expect(result).toHaveLength(1);
        expect(result[0].outfallId).toBe('N2');
    });

    it('mehrere Outfalls: Flächen werden getrennt zugeordnet, Ergebnis nach outfallId sortiert', () => {
        const nodesTwo = [
            { id: 'A1', z: 100, type: 'Schacht' },
            { id: 'OUT_Z', z: 90, type: 'Auslaufbauwerk' },
            { id: 'B1', z: 100, type: 'Schacht' },
            { id: 'OUT_A', z: 90, type: 'Auslaufbauwerk' },
        ];
        const edgesTwo = [
            { id: 'E1', fromNodeId: 'A1', toNodeId: 'OUT_Z' },
            { id: 'E2', fromNodeId: 'B1', toNodeId: 'OUT_A' },
        ];
        const areas = [
            { id: 'F1', size: 1.0, runoffCoeff: 0.5, nodeId: 'A1' },
            { id: 'F2', size: 2.0, runoffCoeff: 0.5, nodeId: 'B1' },
        ];
        const result = summarizeOutfallCatchments(areas, nodesTwo, edgesTwo);
        expect(result.map(r => r.outfallId)).toEqual(['OUT_A', 'OUT_Z']); // alphabetisch sortiert
    });
});
