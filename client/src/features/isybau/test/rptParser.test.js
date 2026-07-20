import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RptParser } from '../utils/swmm/RptParser.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRpt = readFileSync(join(here, 'fixtures/default.rpt'), 'utf8');
const debugRpt = readFileSync(join(here, 'fixtures/debug_report.rpt'), 'utf8');

const noNaN = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'number') {
            expect(Number.isNaN(v), `Feld ${k} ist NaN`).toBe(false);
        }
    }
};

describe('RptParser', () => {
    for (const [name, report] of [['default.rpt', defaultRpt], ['debug_report.rpt', debugRpt]]) {
        describe(name, () => {
            const result = RptParser.parse(report);

            it('liefert den Ergebnis-Kontrakt', () => {
                expect(result).toHaveProperty('nodes');
                expect(result).toHaveProperty('edges');
                expect(result).toHaveProperty('subcatchments');
                expect(result).toHaveProperty('systemStats');
                expect(Object.keys(result.nodes).length).toBeGreaterThan(0);
            });

            it('parst Kontinuitätsfehler-Diagnose-Listen', () => {
                expect(Array.isArray(result.systemStats.continuityErrors)).toBe(true);
                expect(Array.isArray(result.systemStats.instabilityIndexes)).toBe(true);
                expect(Array.isArray(result.systemStats.criticalElements)).toBe(true);
                for (const e of result.systemStats.continuityErrors) {
                    expect(typeof e.id).toBe('string');
                    expect(Number.isNaN(e.error)).toBe(false);
                }
            });

            it('keine NaN-Werte in Summary-Tabellen (NaN-Guards)', () => {
                result.systemStats.outfallLoading.forEach(noNaN);
                result.systemStats.storageSummary.forEach(noNaN);
                result.systemStats.pumpingSummary.forEach(noNaN);
                result.systemStats.flowClassification.forEach(row => {
                    noNaN(row);
                    noNaN(row.fractions);
                });
            });

            it('Flooding-Volumen in m³ (bereits konvertiert)', () => {
                for (const n of Object.values(result.nodes)) {
                    if (n.floodingVolume !== undefined) {
                        expect(Number.isNaN(n.floodingVolume)).toBe(false);
                        expect(n.overflow).toBe(true);
                    }
                }
            });

            it('System-Kontinuitätsfehler wird extrahiert', () => {
                expect(typeof result.systemStats.flow.error).toBe('number');
                expect(Number.isNaN(result.systemStats.flow.error)).toBe(false);
            });
        });
    }

    it('debug_report.rpt: Diagnose-Listen enthalten die realen Einträge', () => {
        const { systemStats } = RptParser.parse(debugRpt);
        expect(systemStats.continuityErrors).toContainEqual({ id: 'FK003', error: 17.8 });
        expect(systemStats.instabilityIndexes).toContainEqual({ id: 'S00-1', index: 2 });
        expect(systemStats.criticalElements).toContainEqual({ type: 'Link', id: '06001', value: 96.87 });
        expect(systemStats.nonConvergingNodes.length).toBeGreaterThan(0);
    });

    it('Link Flow Summary: PUMP/WEIR/ORIFICE-Zeilen mit weniger Spalten werden erfasst (Synthetik)', () => {
        // Reales SWMM-Layout (statsrpt.c writeLinkFlows): CONDUIT hat 8 Spalten,
        // PUMP bricht nach der Q/Qvoll-Spalte ab (6 Tokens), WEIR/ORIFICE haben
        // weder Geschwindigkeit noch Q/Qvoll (5-6 Tokens). Mit der alten fixen
        // `len >= 8`-Schwelle wurden diese Zeilen komplett verworfen.
        const report = [
            '  Link Flow Summary',
            '  ********************',
            '  -----------------------------------------------------------------------------',
            '                                 Maximum  Time of Max   Maximum    Max/    Max/',
            '                                  |Flow|   Occurrence   |Veloc|    Full    Full',
            '  Link                 Type          CMS  days hr:min     m/sec    Flow   Depth',
            '  -----------------------------------------------------------------------------',
            '  C1                   CONDUIT     0.100     0  00:15      0.90    0.80    0.70',
            '  EP                   PUMP        0.020     0  00:20                      0.50',
            '  EW                   WEIR        0.050     0  00:10                            0.30',
            '  EG                   ORIFICE     0.010     0  00:05',
            ''
        ].join('\n');
        const { edges } = RptParser.parse(report);

        expect(edges.C1.maxVelocity).toBeCloseTo(0.90, 5);
        expect(edges.C1.flowCapacityRatio).toBeCloseTo(0.80, 5);
        expect(edges.C1.depthRatio).toBeCloseTo(0.70, 5);

        expect(edges.EP.maxFlow).toBeCloseTo(20, 3); // 0.02 CMS -> 20 L/s
        expect(edges.EP.flowCapacityRatio).toBeCloseTo(0.50, 5);
        expect(edges.EP.maxVelocity).toBeUndefined();
        expect(edges.EP.depthRatio).toBeUndefined();

        expect(edges.EW.maxFlow).toBeCloseTo(50, 3);
        expect(edges.EW.depthRatio).toBeCloseTo(0.30, 5);
        expect(edges.EW.flowCapacityRatio).toBeUndefined();

        expect(edges.EG.maxFlow).toBeCloseTo(10, 3);
        expect(edges.EG.depthRatio).toBeUndefined();
        expect(edges.EG.flowCapacityRatio).toBeUndefined();
    });

    it('Pumping Summary: Energie steht in Spalte 7, nicht 8 (Synthetik)', () => {
        const report = [
            '  Pumping Summary',
            '  ***************',
            '  -------------------------------------------------------------------------------------------------',
            '                                 Min      Avg      Max    Total     Power    %Time Off Pump Curve',
            '  Pump          Utilized Starts  Flow     Flow     Flow    Vol.     Usage       Low        High',
            '  -------------------------------------------------------------------------------------------------',
            '  EP               45.20      3   0.010    0.015    0.020    12.345    2.500       1.10       0.00',
            ''
        ].join('\n');
        const { systemStats } = RptParser.parse(report);
        const p = systemStats.pumpingSummary.find(x => x.id === 'EP');
        expect(p).toBeDefined();
        expect(p.percentUtilized).toBeCloseTo(45.20, 3);
        expect(p.startUps).toBe(3);
        expect(p.minFlow).toBeCloseTo(0.010, 5);
        expect(p.avgFlow).toBeCloseTo(0.015, 5);
        expect(p.maxFlow).toBeCloseTo(0.020, 5);
        expect(p.totalVol).toBeCloseTo(12.345, 5);
        expect(p.totalEnergy).toBeCloseTo(2.500, 5); // NICHT die %TimeOffCurve-Spalte (1.10)
    });

    it('Kontinuitätsfehler-Zeilen werden korrekt geparst (Synthetik)', () => {
        const report = [
            '  *************************',
            '  Highest Continuity Errors',
            '  *************************',
            '  Node RW010 (82.171%)',
            '  Node RW031 (-45.11%)',
            '  ***************************',
            ''
        ].join('\n');
        const { systemStats } = RptParser.parse(report);
        expect(systemStats.continuityErrors).toEqual([
            { id: 'RW010', error: 82.171 },
            { id: 'RW031', error: -45.11 }
        ]);
    });
});
