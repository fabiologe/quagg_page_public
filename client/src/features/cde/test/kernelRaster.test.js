/**
 * Raster-Ops des Kernels (Teil XIV, G1). Die Regel, die alles trägt:
 * `cell` kommt von aussen — sonst hätten zwei Quellen zwei Bezüge.
 */
import { describe, expect, it } from 'vitest';
import {
    rasterAusMesh, rasterAbtasten, rasterResample, rasterDifferenz,
    pruefmassVon, pruefmassGleich,
} from '../services/geometrie/ops/Raster.js';
import { gleicherBezug } from '../services/gelaende/Operationen.js';

/** Geneigte Ebene 10 × 10 m als Dreiecke, y = 300 + 0.1·x + 0.05·z. */
function ebene(dx = 0, dz = 0) {
    const h = (x, z) => 300 + 0.1 * x + 0.05 * z;
    const t = [];
    for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) {
        const a = [x + dx, h(x, z), z + dz], b = [x + 1 + dx, h(x + 1, z), z + dz];
        const c = [x + 1 + dx, h(x + 1, z + 1), z + 1 + dz], d = [x + dx, h(x, z + 1), z + 1 + dz];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}

describe('rasterAusMesh', () => {
    it('ohne cell ist es ein Vertragsbruch — mit cell entsteht der vorgegebene Bezug', () => {
        expect(() => rasterAusMesh({ mesh: ebene() }, {})).toThrow(/cell/);
        const { ergebnis: r, warnungen } = rasterAusMesh({ mesh: ebene() }, { cell: 0.5 });
        expect(r.cell).toBe(0.5);
        expect(r.nx).toBe(21);
        expect(warnungen).toEqual([]);
        // Mitte der Ebene: 300 + 0.1·5 + 0.05·5 = 300,75 (Randklemme ist 1e-9)
        expect(r.heights[10 * r.nz + 10]).toBeCloseTo(300.75, 6);
    });
});

describe('rasterAbtasten (bilinear)', () => {
    it('interpoliert zwischen den Knoten und gibt NaN ausserhalb und an NaN-Knoten', () => {
        const { ergebnis: r } = rasterAusMesh({ mesh: ebene() }, { cell: 1 });
        expect(rasterAbtasten(r, 2.5, 3.5)).toBeCloseTo(300 + 0.25 + 0.175, 6);
        expect(rasterAbtasten(r, -1, 0)).toBeNaN();
        expect(rasterAbtasten(r, 0, 20)).toBeNaN();
        r.heights[3 * r.nz + 3] = NaN;
        expect(rasterAbtasten(r, 2.5, 2.5)).toBeNaN();     // ein NaN-Knoten der Zelle reicht
        expect(rasterAbtasten(r, 6.5, 6.5)).not.toBeNaN();
    });
});

describe('rasterResample + rasterDifferenz', () => {
    it('rechnet auf einen fremden Bezug um und meldet es; gleicher Bezug bleibt still', () => {
        const a = rasterAusMesh({ mesh: ebene() }, { cell: 1 }).ergebnis;
        const b = rasterAusMesh({ mesh: ebene() }, { cell: 0.5 }).ergebnis;
        expect(gleicherBezug(a, b)).toBe(false);
        const d = rasterDifferenz({ a, b });
        expect(d.warnungen[0]).toContain('bezug_angeglichen');
        expect(gleicherBezug(a, d.ergebnis)).toBe(true);
        // Gleiche Fläche, anderer Bezug → Differenz ≈ 0 überall (bilinear auf einer Ebene ist exakt)
        const innen = d.ergebnis.heights[5 * d.ergebnis.nz + 5];
        expect(Math.abs(innen)).toBeLessThan(1e-9);

        const c = rasterAusMesh({ mesh: ebene() }, { cell: 1 }).ergebnis;
        c.heights[5 * c.nz + 5] -= 2;
        const e = rasterDifferenz({ a, b: c });
        expect(e.warnungen).toEqual([]);
        expect(e.ergebnis.heights[5 * e.ergebnis.nz + 5]).toBeCloseTo(-2, 9);
    });

    it('resample erzeugt das Zielraster vollständig — NaN nur, wo die Quelle nicht hinreicht', () => {
        const quelle = rasterAusMesh({ mesh: ebene() }, { cell: 1 }).ergebnis;
        const bezug = { x0: -2, z0: -2, maxX: 12, maxZ: 12, cell: 2, nx: 8, nz: 8 };
        const r = rasterResample({ raster: quelle }, { bezug }).ergebnis;
        expect(r.nx).toBe(8);
        expect(r.heights.length).toBe(64);
        expect(r.heights[0]).toBeNaN();                         // (-2,-2) ausserhalb
        expect(r.heights[3 * 8 + 3]).toBeCloseTo(300 + 0.4 + 0.2, 6); // (4,4)
    });
});

describe('pruefmassVon', () => {
    it('ist translationsinvariant und cm-gerundet — die Momentaufnahme einer Quelle', () => {
        const a = pruefmassVon(ebene());
        const b = pruefmassVon(ebene(1000, -500));
        expect(a).toMatchObject({ triCount: 200, spanX: 10, spanZ: 10 });
        expect(a.spanY).toBeCloseTo(1.5, 2);
        expect(pruefmassGleich(a, b)).toBe(true);
        const c = pruefmassVon({ positions: ebene().positions.slice(0, 9 * 199), triCount: 199 });
        expect(pruefmassGleich(a, c)).toBe(false);
        expect(pruefmassVon(null)).toBeNull();
    });
});

describe('rasterAusMesh mit BEREICH (Korridor, B3)', () => {
    function ebene() {
        const t = [];
        for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) { t.push(x, 5, z, x + 1, 5, z, x + 1, 5, z + 1, x, 5, z, x + 1, 5, z + 1, x, 5, z + 1); }
        return { positions: new Float64Array(t), triCount: t.length / 9 };
    }
    it('schneidet das Raster auf den Bereich zu — geschnitten mit den Netzgrenzen', () => {
        const r = rasterAusMesh({ mesh: ebene() }, { cell: 0.5, bereich: { minX: 10, maxX: 20, minZ: -5, maxZ: 8 } }).ergebnis;
        expect(r.x0).toBe(10); expect(r.maxX).toBe(20); expect(r.z0).toBe(0); expect(r.maxZ).toBe(8);
        expect(r.nx).toBe(21); expect(r.nz).toBe(17);
        expect(r.heights[0]).toBe(5);
    });
    it('ein Bereich neben dem Gelände ergibt null mit Meldung', () => {
        const r = rasterAusMesh({ mesh: ebene() }, { cell: 0.5, bereich: { minX: 100, maxX: 120, minZ: 0, maxZ: 10 } });
        expect(r.ergebnis).toBeNull();
        expect(r.warnungen.join(' ')).toMatch(/heightfield_bereich_leer|kein_raster/);
    });
});
