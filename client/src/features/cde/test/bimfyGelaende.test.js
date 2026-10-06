// @vitest-environment jsdom
/**
 * BIMFY · ein Raster ist ein Gelände (Fahrplan XYZ, X1). Eine klassische XYZ-Datei
 * oder ein ASCII-Grid wird erkannt und NICHT in Einzelbauteile zerlegt; eine
 * Bestandsaufnahme mit Codes bleibt eine Punktliste.
 */
import { describe, expect, it } from 'vitest';
import { GELAENDE_AB_PUNKTEN, gelaendeSatz, rasterAusAsciiGrid, rasterAusPunkten } from '../services/bimfy/Punktanalyse.js';
import { liesGeometrien } from '../services/bimfy/Geometrieleser.js';

const raster = (nx, ny, d = 1, ohne = new Set()) => {
    const z = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        if (!ohne.has(`${i}|${j}`)) z.push(`${410000 + i * d} ${5460000 + j * d} ${(100 + i * 0.1 + j * 0.05).toFixed(2)}`);
    }
    return z.join('\n');
};

describe('Punktanalyse', () => {
    it('ein XYZ-Raster: Weite, Grösse, Lücken, Höhen', () => {
        const pkt = raster(12, 10, 2, new Set(['3|4'])).split('\n').map(z => { const [a, b, c] = z.split(' ').map(Number); return { ost: a, nord: b, hoehe: c }; });
        const g = rasterAusPunkten(pkt);
        expect(g).toMatchObject({ format: 'xyz-raster', nx: 12, ny: 10, dx: 2, dy: 2, punkte: 119, luecken: 1 });
        expect(g.hoehe.min).toBe(100);
        expect(gelaendeSatz(g)).toMatch(/^XYZ-Raster 12 × 10, Raster 2 m, 119 Punkte \(1 Lücken\)/);
    });
    it('verstreut oder zu wenig: kein Raster', () => {
        const verstreut = Array.from({ length: 200 }, (_, k) => ({ ost: 410000 + (k * 37 % 101) * 1.37, nord: 5460000 + (k * 53 % 97) * 2.11, hoehe: 100 }));
        expect(rasterAusPunkten(verstreut)).toBeNull();
        expect(rasterAusPunkten(Array.from({ length: GELAENDE_AB_PUNKTEN - 1 }, (_, k) => ({ ost: k, nord: 0, hoehe: 0 })))).toBeNull();
    });
    it('ASCII-Grid: Ecke wird Zellmitte, NODATA zählt als Lücke', () => {
        const g = rasterAusAsciiGrid('ncols 3\nnrows 2\nxllcorner 100\nyllcorner 200\ncellsize 2\nNODATA_value -9999\n1 2 3\n4 -9999 6\n');
        expect(g).toMatchObject({ format: 'ascii-grid', nx: 3, ny: 2, punkte: 5, luecken: 1, ausdehnung: { minO: 101, minN: 201, maxO: 105, maxN: 203 } });
        expect(() => rasterAusAsciiGrid('ncols 3\nnrows 2\nxllcorner 0\nyllcorner 0\ncellsize 1\n1 2\n')).toThrow(/erwartet/);
    });
});

describe('BIMFY liest ein Raster als Gelände', () => {
    it('XYZ-Raster und ASCII-Grid: keine Einzelbauteile, ein Geländebefund', () => {
        const xyz = liesGeometrien('dgm1.xyz', raster(20, 20));
        expect(xyz.geometrien).toEqual([]);
        expect(xyz.gelaende).toMatchObject({ nx: 20, ny: 20, punkte: 400 });
        expect(xyz.warnungen).toEqual([]);
        const asc = liesGeometrien('dgm.asc', 'ncols 2\nnrows 2\nxllcenter 0\nyllcenter 0\ncellsize 1\n1 1\n1 1\n');
        expect(asc).toMatchObject({ format: 'asc', geometrien: [], gelaende: { format: 'ascii-grid', punkte: 4 } });
    });
    it('eine Bestandsaufnahme mit Codes bleibt eine Punktliste', () => {
        const aus = liesGeometrien('bestand.xyz', '1 410000.12 5460000.40 101.2 SD\n2 410012.70 5460003.10 101.5 HY\n3 410020.05 5460011.93 101.1 SD');
        expect(aus.gelaende).toBeUndefined();
        expect(aus.geometrien.map(g => g.ebene)).toEqual(['SD', 'HY', 'SD']);
    });
});
