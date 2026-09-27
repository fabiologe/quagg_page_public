/**
 * 3D-Gelände (2026-09-27, „man sieht nur eine braune Fläche“): Farbraum, Relief und
 * Farbrampe. Shader-Ausgabe lässt sich ohne WebGL nicht rendern — geprüft werden die
 * reine Höhenspanne und der Shader-Quelltext.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hoehenSpanne } from '../components/visualizer/viewer3d/useTerrainLayer.js';

describe('Gelände: Höhenspanne der Farbrampe', () => {
    // 100 × 100 Zellen à 10 m; Netzgebiet flach 200–205 m, in der Ferne ein 400-m-Hügel
    const ncols = 100, nrows = 100;
    const gridData = new Float32Array(ncols * nrows);
    for (let r = 0; r < nrows; r++) for (let c = 0; c < ncols; c++) {
        gridData[r * ncols + c] = c > 80 ? 400 : 200 + (c % 6);
    }
    const grid = { gridData, ncols, nrows, cellsize: 10, xll: 0, yll: 0 };

    it('um das Netz statt über die ganze Kachel (ferner Hügel bestimmt nicht die Farben)', () => {
        const s = hoehenSpanne(grid, { minX: 100, minY: 100, spanX: 200, spanY: 200 });
        expect(s.min).toBeGreaterThanOrEqual(200);
        expect(s.max).toBeLessThanOrEqual(205);
        const ganz = hoehenSpanne(grid);
        expect(ganz.max).toBe(400);
    });

    it('NODATA wird übergangen, flaches Gelände bekommt mindestens 1 m Spanne', () => {
        const flach = { ...grid, gridData: new Float32Array(ncols * nrows).fill(150) };
        flach.gridData[0] = -9999;
        const s = hoehenSpanne(flach);
        expect(s.max - s.min).toBeCloseTo(1, 6);
    });
});

describe('Gelände-Shader', () => {
    const quelle = readFileSync(new URL('../components/visualizer/viewer3d/useTerrainLayer.js', import.meta.url), 'utf8');
    it('wandelt nach sRGB (sonst #8b7355 → #422B17) und streckt das Relief', () => {
        expect(quelle).toContain('#include <colorspace_fragment>');
        expect(quelle).toMatch(/uRelief:\s*\{\s*value:\s*4/);
        expect(quelle).toMatch(/uAmbient:\s*\{\s*value:\s*0\.4/);
    });
});
