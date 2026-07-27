import { describe, it, expect } from 'vitest';
import { sampleTerrainAt } from '../utils/terrainSampling.js';

// 3x3 grid, cellsize=1, xll=0, yll=0 -> cell centers at (0,0)..(2,2).
// bottom-up: row0=y=0 (10,11,12), row1=y=1 (20,21,22), row2=y=2 (30,31,32)
function makeTerrain(overrides = {}) {
    return {
        gridData: new Float32Array([10, 11, 12, 20, 21, 22, 30, 31, 32]),
        ncols: 3, nrows: 3, cellsize: 1, xll: 0, yll: 0,
        ...overrides,
    };
}

describe('sampleTerrainAt', () => {
    it('returns the exact cell value at a cell center', () => {
        expect(sampleTerrainAt(makeTerrain(), 1, 1)).toBeCloseTo(21, 6);
        expect(sampleTerrainAt(makeTerrain(), 0, 0)).toBeCloseTo(10, 6);
        expect(sampleTerrainAt(makeTerrain(), 2, 2)).toBeCloseTo(32, 6);
    });

    it('bilinearly interpolates at the midpoint of four cells', () => {
        // midpoint of (0,0)=10,(1,0)=11,(0,1)=20,(1,1)=21 -> average 15.5
        expect(sampleTerrainAt(makeTerrain(), 0.5, 0.5)).toBeCloseTo(15.5, 6);
    });

    it('interpolates linearly along a single axis', () => {
        expect(sampleTerrainAt(makeTerrain(), 0.5, 0)).toBeCloseTo(10.5, 6);
        expect(sampleTerrainAt(makeTerrain(), 0, 0.5)).toBeCloseTo(15, 6);
    });

    it('clamps out-of-bounds coordinates to the nearest edge cell', () => {
        expect(sampleTerrainAt(makeTerrain(), -50, -50)).toBeCloseTo(10, 6);
        expect(sampleTerrainAt(makeTerrain(), 50, 50)).toBeCloseTo(32, 6);
    });

    it('returns null when any of the 4 surrounding cells is NODATA', () => {
        const terrain = makeTerrain({ gridData: new Float32Array([10, 11, 12, -9999, 21, 22, 30, 31, 32]) });
        expect(sampleTerrainAt(terrain, 0.5, 0.5)).toBeNull();
    });

    it('returns null for a missing/incomplete terrain object', () => {
        expect(sampleTerrainAt(null, 1, 1)).toBeNull();
        expect(sampleTerrainAt({}, 1, 1)).toBeNull();
        expect(sampleTerrainAt(makeTerrain({ cellsize: 0 }), 1, 1)).toBeNull();
    });

    it('returns null for non-finite coordinates', () => {
        expect(sampleTerrainAt(makeTerrain(), NaN, 1)).toBeNull();
    });
});
