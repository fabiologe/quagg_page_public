import { describe, it, expect } from 'vitest';
import { culvertFlow, culvertState } from './culvertHydraulics.js';

const BASE = {
    z_in: 0.0,
    z_out: 0.0,
    diameter: 1.0,    // 1 m diameter → area = π/4 ≈ 0.7854 m²
    length: 10.0,
    manning_n: 0.013,
    Cd: 0.6,
};

describe('culvertFlow — DRY state', () => {
    it('returns 0 when both WSEs are below invert', () => {
        expect(culvertFlow(-0.5, -0.5, BASE)).toBe(0.0);
        expect(culvertState(-0.5, -0.5, BASE)).toBe('DRY');
    });

    it('returns 0 when WSE_in exactly equals invert', () => {
        expect(culvertFlow(0.0, -1.0, BASE)).toBe(0.0);
    });
});

describe('culvertFlow — FREE_FLOW state (orifice)', () => {
    it('positive Q when inlet just submerged, outlet dry', () => {
        // wse_in = 0.5m, wse_out = -0.5 (below invert), crown_in = 1.0
        // wse_in < crown_in → free flow
        const Q = culvertFlow(0.5, -0.5, BASE);
        expect(Q).toBeGreaterThan(0);
        expect(culvertState(0.5, -0.5, BASE)).toBe('FREE_FLOW');
    });

    it('matches manual orifice formula: Cd * A * sqrt(2g * hw)', () => {
        const wse_in = 0.8, wse_out = -0.5;
        const hw = wse_in - BASE.z_in; // 0.8
        const A = Math.PI * 1.0 * 1.0 / 4.0;
        const expected = BASE.Cd * A * Math.sqrt(2 * 9.81 * hw);
        const Q = culvertFlow(wse_in, wse_out, BASE);
        expect(Q).toBeCloseTo(expected, 6);
    });
});

describe('culvertFlow — PRESSURE_FLOW state (Manning full pipe)', () => {
    it('positive Q when both crowns submerged', () => {
        // crown_in = crown_out = 1.0; need wse > 1.0 at both ends
        const Q = culvertFlow(2.0, 1.5, BASE);
        expect(Q).toBeGreaterThan(0);
        expect(culvertState(2.0, 1.5, BASE)).toBe('PRESSURE');
    });

    it('matches manual Manning formula: (A/n)*R^(2/3)*sqrt(dh/L)', () => {
        const wse_in = 2.5, wse_out = 1.5;
        const A = Math.PI / 4.0;
        const R = 1.0 / 4.0;
        const slope = (wse_in - wse_out) / BASE.length;
        const expected = (A / BASE.manning_n) * Math.pow(R, 2.0 / 3.0) * Math.sqrt(slope);
        const Q = culvertFlow(wse_in, wse_out, BASE);
        expect(Q).toBeCloseTo(expected, 6);
    });
});

describe('culvertFlow — BACKWATER state', () => {
    it('returns negative Q when wse_out > wse_in', () => {
        const Q = culvertFlow(0.5, 1.5, BASE);
        expect(Q).toBeLessThan(0);
        expect(culvertState(0.5, 1.5, BASE)).toBe('BACKWATER');
    });

    it('symmetric: |Q_forward| ≈ |Q_backward| for same head difference', () => {
        const Qfwd = culvertFlow(1.5, 0.5, BASE);
        const Qbwd = culvertFlow(0.5, 1.5, BASE);
        expect(Math.abs(Qfwd)).toBeCloseTo(Math.abs(Qbwd), 6);
    });
});

describe('culvertFlow — monotonicity', () => {
    it('Q increases with increasing head at inlet', () => {
        const Q1 = culvertFlow(0.3, 0.0, BASE);
        const Q2 = culvertFlow(0.6, 0.0, BASE);
        const Q3 = culvertFlow(0.9, 0.0, BASE);
        expect(Q2).toBeGreaterThan(Q1);
        expect(Q3).toBeGreaterThan(Q2);
    });
});
