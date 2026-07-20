import { describe, it, expect } from 'vitest';
import { computePumpCurvePoints } from '../utils/pumpCurve.js';

describe('computePumpCurvePoints', () => {
    it('uses UI pumpRate (l/s -> m³/s) and pumpHead directly when both are set', () => {
        const { H_d, Q_d, estimated, points } = computePumpCurvePoints({ pumpRate: 30, pumpHead: 8 });
        expect(estimated).toBe(false);
        expect(H_d).toBe(8);
        expect(Q_d).toBeCloseTo(0.03, 4);
        expect(points).toHaveLength(3);
    });

    it('falls back to a 10 m head when nothing is set', () => {
        const { H_d } = computePumpCurvePoints({ pumpRate: 30 });
        expect(H_d).toBe(10.0);
    });

    it('estimates flow from bauwerkData.pumpPower when pumpRate is unset', () => {
        const { Q_d, estimated } = computePumpCurvePoints({ pumpHead: 10, bauwerkData: { pumpPower: 5.0 } });
        expect(estimated).toBe(true);
        expect(Q_d).toBeGreaterThan(0);
    });

    it('produces points with strictly increasing head (0 -> H_d -> 1.3*H_d), matching table_readCurve requirements', () => {
        const { H_d, points } = computePumpCurvePoints({ pumpRate: 30, pumpHead: 8 });
        expect(points[0].head).toBe(0);
        expect(points[1].head).toBe(H_d);
        expect(points[2].head).toBeCloseTo(H_d * 1.3, 6);
        expect(points[0].head).toBeLessThan(points[1].head);
        expect(points[1].head).toBeLessThan(points[2].head);
    });

    it('produces decreasing flow (max at zero head, zero at shutoff head)', () => {
        const { Q_d, points } = computePumpCurvePoints({ pumpRate: 30, pumpHead: 8 });
        expect(points[0].flow).toBeCloseTo(Q_d * 1.4, 6);
        expect(points[1].flow).toBeCloseTo(Q_d, 6);
        expect(points[2].flow).toBe(0);
    });

    it('regression: 30 l/s stays in realistic (l/s-scale) flow range, not m³/s-scale', () => {
        const { points } = computePumpCurvePoints({ pumpRate: 30, pumpHead: 8 });
        points.forEach(p => expect(p.flow).toBeLessThan(1));
    });
});
