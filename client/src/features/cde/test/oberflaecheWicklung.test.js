/**
 * Ein OFFENES Höhenfeld darf so oder so herum gewickelt sein (Teil XX,
 * 2026-09-10). Gemessen: die Anzeige des geformten Geländes kam mit allen
 * 99 414 Dreiecken nach unten gewendet aus der Bibliothek zurück — `upfaces`
 * behielt keins, `hoeheAn` war null, und kein zweites Werkzeug fand Höhen.
 * Die Ursache sitzt in der CDE selbst: `dreieckeAusRaster` (daraus baut der
 * Autor die Anzeige) wickelt jede Zelle nach unten.
 */
import { describe, expect, it } from 'vitest';
import { deriveSurface, dreieckeAusRaster, wicklungVon } from '../services/geometrie/SurfaceOps.js';
import { makeHeightSampler } from '../services/geometrie/HeightSampler.js';

/** Ein kleines geneigtes Raster als Dreiecksnetz — genau so baut der Autor die Anzeige. */
function anzeigeNetz() {
    const nx = 11, nz = 11, heights = new Float64Array(nx * nz);
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) heights[ix * nz + iz] = 10 + 0.2 * ix;
    return dreieckeAusRaster({ x0: 0, z0: 0, maxX: 10, maxZ: 10, cell: 1, nx, nz, heights });
}
/** Dasselbe Netz umgedreht: je Dreieck Ecke 2 und 3 getauscht. */
function umgedreht({ positions, triCount }) {
    const p = Float64Array.from(positions);
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        for (let k = 0; k < 3; k++) { const a = p[o + 3 + k]; p[o + 3 + k] = p[o + 6 + k]; p[o + 6 + k] = a; }
    }
    return { positions: p, triCount };
}

describe('Die Wicklung eines offenen Höhenfelds', () => {
    it('das Rasternetz der CDE ist nach unten gewickelt — und verliert trotzdem kein Dreieck mehr', () => {
        const a = anzeigeNetz();
        expect(wicklungVon(a.positions, a.triCount)).toBe(-1);
        const s = deriveSurface(a.positions, a.triCount);
        expect(s.method).toBe('upfaces');
        expect(s.triCount).toBe(a.triCount);                       // vorher: 0
        expect(makeHeightSampler(s.positions, s.triCount).sample(5, 5)).toBeCloseTo(11, 6);   // 10 + 0,2 · 5
        // …und kommt nach oben gewendet heraus, wie ein geliefertes Gelände
        expect(wicklungVon(s.positions, s.triCount)).toBe(1);
    });

    it('ein nach oben gewickeltes Netz (geliefertes Gelände) bleibt, wie es war', () => {
        const g = umgedreht(anzeigeNetz());
        expect(wicklungVon(g.positions, g.triCount)).toBe(1);
        const s = deriveSurface(g.positions, g.triCount);
        expect(s.triCount).toBe(g.triCount);
        expect(Array.from(s.positions)).toEqual(Array.from(g.positions));
    });

    it('die Mehrheit entscheidet: in einem nach oben gewickelten Netz fällt eine einzelne Unterseite weiter heraus', () => {
        const g = umgedreht(anzeigeNetz());
        const gemischt = Float64Array.from(g.positions);
        gemischt.set(anzeigeNetz().positions.subarray(0, 9), 0);  // EIN Dreieck nach unten
        expect(deriveSurface(gemischt, g.triCount).triCount).toBe(g.triCount - 1);
    });
});
