import { describe, it, expect } from 'vitest';
import { suggestSlopeClassFromTerrain, slopePercentToClass } from '../utils/slopeSuggestion.js';

// Synthetisches Terrain: flaches Raster, z steigt linear mit x (konstante Steigung).
// z(x,y) = x * slope -> dz/dx = slope, dz/dy = 0 -> |grad| = slope (als Bruchteil, *100 = %).
function makeRampTerrain(slope, { ncols = 50, nrows = 50, cellsize = 1, xll = 0, yll = 0 } = {}) {
    const gridData = new Float32Array(ncols * nrows);
    for (let row = 0; row < nrows; row++) {
        for (let col = 0; col < ncols; col++) {
            const x = xll + col * cellsize;
            gridData[row * ncols + col] = x * slope;
        }
    }
    return { gridData, ncols, nrows, cellsize, xll, yll };
}

const sq = (x0, y0, s) => [
    { x: x0, y: y0 }, { x: x0 + s, y: y0 }, { x: x0 + s, y: y0 + s }, { x: x0, y: y0 + s }
];

describe('slopePercentToClass', () => {
    it('mappt auf die exakten mappings.js-Neigungsklasse-Grenzen', () => {
        expect(slopePercentToClass(0.5)).toBe(1);
        expect(slopePercentToClass(1)).toBe(1);
        expect(slopePercentToClass(1.01)).toBe(2);
        expect(slopePercentToClass(4)).toBe(2);
        expect(slopePercentToClass(4.01)).toBe(3);
        expect(slopePercentToClass(10)).toBe(3);
        expect(slopePercentToClass(10.01)).toBe(4);
        expect(slopePercentToClass(14)).toBe(4);
        expect(slopePercentToClass(14.01)).toBe(5);
        expect(slopePercentToClass(30)).toBe(5);
    });
});

describe('suggestSlopeClassFromTerrain', () => {
    it('erkennt eine konstante 5%-Rampe korrekt als Klasse 3', () => {
        const terrain = makeRampTerrain(0.05); // 5%
        const points = sq(10, 10, 10);
        const result = suggestSlopeClassFromTerrain(points, terrain);
        expect(result).not.toBeNull();
        expect(result.avgSlopePercent).toBeCloseTo(5, 0);
        expect(result.slopeClass).toBe(3);
    });

    it('erkennt eine flache 0.5%-Rampe korrekt als Klasse 1', () => {
        const terrain = makeRampTerrain(0.005); // 0.5%
        const points = sq(10, 10, 10);
        const result = suggestSlopeClassFromTerrain(points, terrain);
        expect(result.slopeClass).toBe(1);
    });

    it('erkennt eine steile 20%-Rampe korrekt als Klasse 5', () => {
        const terrain = makeRampTerrain(0.20); // 20%
        const points = sq(10, 10, 10);
        const result = suggestSlopeClassFromTerrain(points, terrain);
        expect(result.slopeClass).toBe(5);
    });

    it('liefert null ohne Terrain', () => {
        expect(suggestSlopeClassFromTerrain(sq(0, 0, 10), null)).toBeNull();
    });

    it('liefert null wenn die gesamte Fläche auf NODATA liegt', () => {
        const terrain = makeRampTerrain(0.05);
        terrain.gridData.fill(-9999); // komplett NODATA (xyzTerrainImporter.js-Konvention)
        const points = sq(10, 10, 10);
        expect(suggestSlopeClassFromTerrain(points, terrain)).toBeNull();
    });
});
