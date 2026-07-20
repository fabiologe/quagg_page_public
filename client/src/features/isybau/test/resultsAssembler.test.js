import { describe, it, expect } from 'vitest';
import { ResultsAssembler, CONTINUITY_ERROR_WARN_PCT } from '../utils/swmm/ResultsAssembler.js';

const baseRpt = () => ({
    nodes: { N1: { maxDepth: 1.2, maxHGL: 101.2 }, N2: { maxDepth: 0.5, maxHGL: 98.5 } },
    edges: { L1: { maxFlow: 20 } },
    subcatchments: {},
    systemStats: { continuityErrors: [], flow: { error: 0.5 } }
});

const baseTimeSeries = () => ([
    {
        time: 0,
        nodes: { N1: { depth: 0.5, vol: 2.0, inflow: 10, flooding: 0 }, N2: { depth: 0.2, vol: 1.0, inflow: 5, flooding: 0 } },
        edges: { L1: { q: 20, signedQ: 20 } },
        subcatchments: {}
    },
    {
        time: 60,
        nodes: { N1: { depth: 0.8, vol: 3.5, inflow: 20, flooding: 0 }, N2: { depth: 0.3, vol: 1.5, inflow: 8, flooding: 0 } },
        edges: { L1: { q: 10, signedQ: -10 } },
        subcatchments: {}
    }
]);

const inputNodes = () => ({
    N1: { id: 'N1', z: 100, coverZ: 103, depth: 3, diameter: 1.0, volume: 0 },
    N2: { id: 'N2', z: 98, coverZ: 101, depth: 3, diameter: 0, volume: 25 }
});

const inputEdges = () => ({
    L1: { id: 'L1', fromNodeId: 'N1', toNodeId: 'N2' }
});

describe('ResultsAssembler', () => {
    it('berechnet Knoten-Abfluss je Zeitschritt aus signedQ', () => {
        const { timeSeries } = ResultsAssembler.assemble({
            rptResult: baseRpt(), timeSeries: baseTimeSeries(),
            inputNodes: inputNodes(), inputEdges: inputEdges()
        });
        expect(timeSeries[0].nodes.N1.outflow).toBe(20);  // positiv → verlässt N1
        expect(timeSeries[0].nodes.N2.outflow).toBe(0);
        expect(timeSeries[1].nodes.N2.outflow).toBe(10);  // negativ → verlässt N2
        expect(timeSeries[1].nodes.N1.outflow).toBe(0);
    });

    it('ermittelt maxVolumeStored über alle Zeitschritte', () => {
        const { nodes } = ResultsAssembler.assemble({
            rptResult: baseRpt(), timeSeries: baseTimeSeries(),
            inputNodes: inputNodes(), inputEdges: inputEdges()
        });
        expect(nodes.N1.maxVolumeStored).toBe(3.5);
        expect(nodes.N2.maxVolumeStored).toBe(1.5);
    });

    describe('maxAvailableVolume (Vmax)', () => {
        it('Zylinder aus diameter × depth', () => {
            const v = ResultsAssembler.maxAvailableVolume({ diameter: 1.0, depth: 3, volume: 0 });
            expect(v).toBeCloseTo(Math.PI * 0.25 * 3, 5);
        });

        it('explizites Bauwerksvolumen hat Vorrang', () => {
            expect(ResultsAssembler.maxAvailableVolume({ volume: 25, diameter: 1.0, depth: 3 })).toBe(25);
        });

        it('Durchmesser in mm wird erkannt (> 10 → /1000)', () => {
            const v = ResultsAssembler.maxAvailableVolume({ diameter: 1000, depth: 2 });
            expect(v).toBeCloseTo(Math.PI * 0.25 * 2, 5);
        });

        it('null statt erfundener Zahl bei unbekannter Geometrie', () => {
            expect(ResultsAssembler.maxAvailableVolume({ diameter: 0, volume: 0, depth: 3 })).toBeNull();
        });

        it('depth-Fallback über coverZ - z', () => {
            const v = ResultsAssembler.maxAvailableVolume({ diameter: 1.0, depth: 0, z: 100, coverZ: 102 });
            expect(v).toBeCloseTo(Math.PI * 0.25 * 2, 5);
        });
    });

    it('markiert Überstau, wenn maxHGL über Deckelhöhe liegt', () => {
        const rpt = baseRpt();
        rpt.nodes.N1.maxHGL = 103.5; // Deckel bei 103
        const { nodes } = ResultsAssembler.assemble({
            rptResult: rpt, timeSeries: [], inputNodes: inputNodes(), inputEdges: inputEdges()
        });
        expect(nodes.N1.overflow).toBe(true);
        expect(nodes.N2.overflow).toBeUndefined();
    });

    it('heftet Kontinuitätsfehler an Knoten und warnt bei massiven Fehlern', () => {
        const rpt = baseRpt();
        rpt.systemStats.continuityErrors = [
            { id: 'N1', error: 45.11 },
            { id: 'N2', error: 1.2 }
        ];
        const { nodes, warnings } = ResultsAssembler.assemble({
            rptResult: rpt, timeSeries: [], inputNodes: inputNodes(), inputEdges: inputEdges()
        });
        expect(nodes.N1.continuityError).toBe(45.11);
        expect(nodes.N2.continuityError).toBe(1.2);
        expect(warnings.some(w => w.includes('N1') && w.includes('Kontinuitätsfehler'))).toBe(true);
        expect(warnings.some(w => w.includes('N2'))).toBe(false); // unter Schwelle
        expect(Math.abs(45.11)).toBeGreaterThanOrEqual(CONTINUITY_ERROR_WARN_PCT);
    });

    it('warnt bei massivem systemweitem Kontinuitätsfehler', () => {
        const rpt = baseRpt();
        rpt.systemStats.flow.error = -15.3;
        const { warnings } = ResultsAssembler.assemble({
            rptResult: rpt, timeSeries: [], inputNodes: {}, inputEdges: {}
        });
        expect(warnings.some(w => w.includes('Systemweiter'))).toBe(true);
    });

    it('funktioniert ohne Zeitreihe (leere .out)', () => {
        const { nodes, timeSeries } = ResultsAssembler.assemble({
            rptResult: baseRpt(), timeSeries: [], inputNodes: inputNodes(), inputEdges: inputEdges()
        });
        expect(timeSeries).toEqual([]);
        expect(nodes.N1.maxVolumeStored).toBeUndefined();
        expect(nodes.N1.maxAvailableVolume).toBeGreaterThan(0);
    });
});
