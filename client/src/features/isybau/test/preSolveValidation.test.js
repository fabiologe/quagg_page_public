import { describe, it, expect } from 'vitest';
import { Node } from '../core/domain/Node.js';
import { Edge } from '../core/domain/Edge.js';
import { checkPumpDepths, checkPumpHead, checkNodeInitDepth, checkStorageCurveSequence, checkStorageCurveHasEnoughPoints, checkConduitElevationDrop, checkConduitProfile, validateNetwork } from '../utils/preSolveValidation.js';

describe('preSolveValidation', () => {
    describe('checkPumpDepths (ERR_122)', () => {
        it('flags a pump whose startup depth is not above its shutoff depth', () => {
            const pump = new Node({ id: 'H_1635', x: 0, y: 0, z: 0, bauwerkstyp: 6, onDepth: 0.3, offDepth: 0.5 });
            const finding = checkPumpDepths(pump);
            expect(finding).not.toBeNull();
            expect(finding.code).toBe('ERR_122');
            expect(finding.id).toBe('H_1635');
            expect(finding.elementType).toBe('node');
        });

        it('flags equal startup/shutoff depth too', () => {
            const pump = new Node({ id: 'P1', x: 0, y: 0, z: 0, bauwerkstyp: 6, onDepth: 0.5, offDepth: 0.5 });
            expect(checkPumpDepths(pump)).not.toBeNull();
        });

        it('passes when startup depth is above shutoff depth', () => {
            const pump = new Node({ id: 'P1', x: 0, y: 0, z: 0, bauwerkstyp: 6, onDepth: 0.8, offDepth: 0.5 });
            expect(checkPumpDepths(pump)).toBeNull();
        });

        it('ignores non-pump nodes', () => {
            const junction = new Node({ id: 'N1', x: 0, y: 0, z: 0, onDepth: 0.3, offDepth: 0.5 });
            expect(checkPumpDepths(junction)).toBeNull();
        });

        it('does not fire when onDepth is unset (0)', () => {
            const pump = new Node({ id: 'P1', x: 0, y: 0, z: 0, bauwerkstyp: 6, onDepth: 0, offDepth: 0.5 });
            expect(checkPumpDepths(pump)).toBeNull();
        });
    });

    describe('checkPumpHead (ERR_171 via Pumpenkennlinie)', () => {
        it('flags a negative pump head', () => {
            const pump = new Node({ id: 'P1', x: 0, y: 0, z: 0, bauwerkstyp: 6, pumpHead: -5 });
            const finding = checkPumpHead(pump);
            expect(finding).not.toBeNull();
            expect(finding.code).toBe('ERR_171');
        });

        it('passes a positive pump head', () => {
            const pump = new Node({ id: 'P1', x: 0, y: 0, z: 0, bauwerkstyp: 6, pumpHead: 8 });
            expect(checkPumpHead(pump)).toBeNull();
        });

        it('passes an unset (0) pump head — fallback kicks in downstream', () => {
            const pump = new Node({ id: 'P1', x: 0, y: 0, z: 0, bauwerkstyp: 6, pumpHead: 0 });
            expect(checkPumpHead(pump)).toBeNull();
        });

        it('ignores non-pump nodes', () => {
            const node = new Node({ id: 'N1', x: 0, y: 0, z: 0, pumpHead: -5 });
            expect(checkPumpHead(node)).toBeNull();
        });
    });

    describe('checkNodeInitDepth (ERR_138)', () => {
        it('flags initDepth greater than maxDepth', () => {
            const node = new Node({ id: 'N1', x: 0, y: 0, z: 0, maxDepth: 2, initDepth: 3 });
            const finding = checkNodeInitDepth(node);
            expect(finding).not.toBeNull();
            expect(finding.code).toBe('ERR_138');
        });

        it('falls back to shaft depth when maxDepth is unset', () => {
            const node = new Node({ id: 'N1', x: 0, y: 0, z: 0, depth: 2, initDepth: 3 });
            expect(checkNodeInitDepth(node)).not.toBeNull();
        });

        it('passes when initDepth is within range', () => {
            const node = new Node({ id: 'N1', x: 0, y: 0, z: 0, maxDepth: 3, initDepth: 1 });
            expect(checkNodeInitDepth(node)).toBeNull();
        });
    });

    describe('checkStorageCurveSequence (ERR_171)', () => {
        it('flags a non-increasing TABULAR storage curve', () => {
            const node = new Node({
                id: 'S1', x: 0, y: 0, z: 0, storageShape: 'TABULAR',
                storageCurve: [{ depth: 0, area: 10 }, { depth: 1, area: 12 }, { depth: 1, area: 15 }]
            });
            const finding = checkStorageCurveSequence(node);
            expect(finding).not.toBeNull();
            expect(finding.code).toBe('ERR_171');
        });

        it('passes a strictly increasing TABULAR curve', () => {
            const node = new Node({
                id: 'S1', x: 0, y: 0, z: 0, storageShape: 'TABULAR',
                storageCurve: [{ depth: 0, area: 10 }, { depth: 1, area: 12 }, { depth: 2, area: 15 }]
            });
            expect(checkStorageCurveSequence(node)).toBeNull();
        });

        it('ignores FUNCTIONAL storage (shape default)', () => {
            const node = new Node({
                id: 'S1', x: 0, y: 0, z: 0, storageShape: 'PRISMATIC',
                storageCurve: [{ depth: 1, area: 10 }, { depth: 0, area: 12 }]
            });
            expect(checkStorageCurveSequence(node)).toBeNull();
        });
    });

    describe('checkStorageCurveHasEnoughPoints (TABULAR_FALLBACK)', () => {
        it('flags TABULAR storage where one of two points gets filtered out (negative depth typo)', () => {
            // Node's own constructor only substitutes a synthetic default curve when the
            // RAW array has < 2 entries (Node.js:81-87), so this needs >= 2 raw points to
            // reach checkStorageCurveHasEnoughPoints unfiltered — one of them invalid.
            const node = new Node({
                id: 'S1', x: 0, y: 0, z: 0, storageShape: 'TABULAR',
                storageCurve: [{ depth: 0, area: 10 }, { depth: -1, area: 5 }]
            });
            const finding = checkStorageCurveHasEnoughPoints(node);
            expect(finding).not.toBeNull();
            expect(finding.code).toBe('TABULAR_FALLBACK');
            expect(finding.severity).toBe('warning');
        });

        it('flags TABULAR storage where all points get filtered out (negative depth/area typos)', () => {
            const node = new Node({
                id: 'S1', x: 0, y: 0, z: 0, storageShape: 'TABULAR',
                storageCurve: [{ depth: -1, area: 10 }, { depth: 0, area: -5 }]
            });
            expect(checkStorageCurveHasEnoughPoints(node)).not.toBeNull();
        });

        it('passes TABULAR storage with 2+ valid points', () => {
            const node = new Node({
                id: 'S1', x: 0, y: 0, z: 0, storageShape: 'TABULAR',
                storageCurve: [{ depth: 0, area: 10 }, { depth: 1, area: 12 }]
            });
            expect(checkStorageCurveHasEnoughPoints(node)).toBeNull();
        });

        it('ignores non-TABULAR storage shapes', () => {
            const node = new Node({ id: 'S1', x: 0, y: 0, z: 0, storageShape: 'PRISMATIC', storageCurve: [{ depth: 0, area: 10 }] });
            expect(checkStorageCurveHasEnoughPoints(node)).toBeNull();
        });
    });

    describe('checkConduitElevationDrop (WARN08)', () => {
        it('flags a conduit whose invert drop is >= its length', () => {
            const n1 = new Node({ id: 'N1', x: 0, y: 0, z: 10 });
            const n2 = new Node({ id: 'N2', x: 0, y: 0, z: 0 }); // 10 m drop
            const edge = new Edge({ id: 'H_3333', fromNodeId: 'N1', toNodeId: 'N2', length: 5, z1: 10, z2: 0 });
            const nodeById = new Map([['N1', n1], ['N2', n2]]);
            const finding = checkConduitElevationDrop(edge, nodeById);
            expect(finding).not.toBeNull();
            expect(finding.code).toBe('WARN08');
            expect(finding.severity).toBe('warning');
        });

        it('passes a conduit with a shallow, plausible slope', () => {
            const n1 = new Node({ id: 'N1', x: 0, y: 0, z: 10 });
            const n2 = new Node({ id: 'N2', x: 0, y: 0, z: 9.9 });
            const edge = new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 50, z1: 10, z2: 9.9 });
            const nodeById = new Map([['N1', n1], ['N2', n2]]);
            expect(checkConduitElevationDrop(edge, nodeById)).toBeNull();
        });

        it('clamps an edge invert below its node invert up to the node invert (mirrors SwmmBuilder offset clamping)', () => {
            // n1.z=10, edge.z1=5 (below node invert) -> effective z1 = max(10,5) = 10, not 5
            const n1 = new Node({ id: 'N1', x: 0, y: 0, z: 10 });
            const n2 = new Node({ id: 'N2', x: 0, y: 0, z: 9 });
            const edge = new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 100, z1: 5, z2: 9 });
            const nodeById = new Map([['N1', n1], ['N2', n2]]);
            // Effective delta = |10 - 9| = 1, length 100 -> no warning (would have
            // wrongly fired on |5-9|=4 too, but that's still < 100 here; the point
            // is this must use the clamped value, not raw edge.z1).
            expect(checkConduitElevationDrop(edge, nodeById)).toBeNull();
        });

        it('ignores edges referencing unknown nodes', () => {
            const edge = new Edge({ id: 'E1', fromNodeId: 'MISSING1', toNodeId: 'MISSING2', length: 5 });
            expect(checkConduitElevationDrop(edge, new Map())).toBeNull();
        });
    });

    describe('checkConduitProfile (ERR_119)', () => {
        it('flags a circular profile with zero diameter', () => {
            const edge = new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 10, profile: { type: 0, height: 0, width: 0 } });
            const finding = checkConduitProfile(edge);
            expect(finding).not.toBeNull();
            expect(finding.code).toBe('ERR_119');
        });

        it('flags a non-circular profile with zero width even if height is set', () => {
            const edge = new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 10, profile: { type: 3, height: 0.5, width: 0 } });
            expect(checkConduitProfile(edge)).not.toBeNull();
        });

        it('ignores width for a circular profile', () => {
            const edge = new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 10, profile: { type: 0, height: 0.3, width: 0 } });
            expect(checkConduitProfile(edge)).toBeNull();
        });

        it('passes a valid non-circular profile', () => {
            const edge = new Edge({ id: 'E1', fromNodeId: 'N1', toNodeId: 'N2', length: 10, profile: { type: 3, height: 0.5, width: 0.4 } });
            expect(checkConduitProfile(edge)).toBeNull();
        });
    });

    describe('validateNetwork', () => {
        it('collects findings across multiple nodes', () => {
            const pump = new Node({ id: 'H_1635', x: 0, y: 0, z: 0, bauwerkstyp: 6, onDepth: 0.3, offDepth: 0.5 });
            const ok = new Node({ id: 'N1', x: 0, y: 0, z: 0 });
            const findings = validateNetwork([pump, ok]);
            expect(findings).toHaveLength(1);
            expect(findings[0].id).toBe('H_1635');
        });

        it('returns an empty array for a clean network', () => {
            expect(validateNetwork([new Node({ id: 'N1', x: 0, y: 0, z: 0 })])).toEqual([]);
        });

        it('includes edge findings when edges are passed', () => {
            const n1 = new Node({ id: 'N1', x: 0, y: 0, z: 10 });
            const n2 = new Node({ id: 'N2', x: 0, y: 0, z: 0 });
            const edge = new Edge({ id: 'H_3333', fromNodeId: 'N1', toNodeId: 'N2', length: 5, z1: 10, z2: 0 });
            const findings = validateNetwork([n1, n2], [edge]);
            expect(findings).toHaveLength(1);
            expect(findings[0].code).toBe('WARN08');
        });
    });
});
