/**
 * Linien-Ops des Kernels (Teil XIV, G5): drape, metrischer Offset (Eigenbau
 * — `@turf/buffer` rechnet in Grad), Isolinie per Marching Squares.
 */
import { describe, expect, it } from 'vitest';
import { drape, offset, isolinie, ringFlaeche } from '../services/geometrie/ops/Linien.js';
import { rasterAusMesh, rasterDifferenz } from '../services/geometrie/ops/Raster.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { gerinne } from '../services/gelaende/Operationen.js';

function ebene(h = (x, z) => 300 + 0.1 * x) {
    const t = [];
    for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}

/** Schneiden sich zwei Grundriss-Strecken (echt, nicht an den Enden)? */
function schneiden(a, b, c, d) {
    const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    const s1 = o(a, b, c), s2 = o(a, b, d), s3 = o(c, d, a), s4 = o(c, d, b);
    return (s1 * s2 < -1e-12) && (s3 * s4 < -1e-12);
}
function selbstueberschneidungen(ring) {
    let n = 0;
    for (let i = 0; i < ring.length; i++) {
        for (let j = i + 2; j < ring.length; j++) {
            if (i === 0 && j === ring.length - 1) continue;
            if (schneiden(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) n++;
        }
    }
    return n;
}

describe('drape', () => {
    it('legt die Linie aufs Raster — ausserhalb bleibt NaN und wird gemeldet', () => {
        const r = rasterAusMesh({ mesh: ebene() }, { cell: 1 }).ergebnis;
        const { ergebnis, warnungen } = drape({ linie: { punkte: [{ x: 2, z: 3 }, { x: 5.5, z: 3 }, { x: 40, z: 3 }] }, raster: r });
        expect(ergebnis.punkte[0].y).toBeCloseTo(300.2, 9);
        expect(ergebnis.punkte[1].y).toBeCloseTo(300.55, 9);
        expect(ergebnis.punkte[2].y).toBeNaN();
        expect(warnungen[0]).toContain('drape_ausserhalb');
    });
});

describe('offset', () => {
    it('gerade Strecke, flache Enden: Fläche = Länge · 2d, keine Selbstüberschneidung', () => {
        const { ergebnis } = offset({ linie: { punkte: [{ x: 0, z: 0 }, { x: 10, z: 0 }] } }, { abstand: 1.5 });
        expect(ringFlaeche(ergebnis.ring)).toBeCloseTo(10 * 3, 9);
        expect(selbstueberschneidungen(ergebnis.ring)).toBe(0);
        expect(ergebnis.loecher).toEqual([]);
    });

    it('mit Knick: Gehrung aussen, keine Selbstüberschneidung, Fläche ≈ Länge · 2d', () => {
        const linie = { punkte: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 20, z: 10 }] };
        const { ergebnis } = offset({ linie }, { abstand: 1 });
        expect(selbstueberschneidungen(ergebnis.ring)).toBe(0);
        // Länge 30 · 2 = 60; Gehrung fügt an zwei rechten Winkeln je (2−π/2)·d²… wir prüfen die Grössenordnung
        expect(ringFlaeche(ergebnis.ring)).toBeGreaterThan(58);
        expect(ringFlaeche(ergebnis.ring)).toBeLessThan(63);
    });

    it('runde Enden fügen zwei Halbkreise hinzu; ohne Abstand ist es ein Vertragsbruch', () => {
        const linie = { punkte: [{ x: 0, z: 0 }, { x: 10, z: 0 }] };
        const rund = offset({ linie }, { abstand: 1, ende: 'rund' }).ergebnis;
        expect(ringFlaeche(rund.ring)).toBeGreaterThan(20 + 2.8);      // π·1² ≈ 3,14 (polygonal etwas weniger)
        expect(selbstueberschneidungen(rund.ring)).toBe(0);
        expect(() => offset({ linie }, {})).toThrow(/abstand/);
        expect(offset({ linie: { punkte: [{ x: 0, z: 0 }, { x: 0, z: 0 }] } }, { abstand: 1 }).ergebnis).toBeNull();
    });
});

describe('isolinie', () => {
    it('ein Kegel liefert einen geschlossenen Ring mit Umfang ≈ 2πr', () => {
        const kegel = ebene((x, z) => 310 - Math.hypot(x - 10, z - 10));     // Spitze bei (10,10), Neigung 1:1
        const r = rasterAusMesh({ mesh: kegel }, { cell: 0.5 }).ergebnis;
        const { ergebnis } = isolinie({ raster: r }, { wert: 305 });          // r = 5 m
        const ringe = ergebnis.filter(l => l.geschlossen);
        expect(ringe).toHaveLength(1);
        let umfang = 0;
        const p = ringe[0].punkte;
        for (let i = 0; i < p.length; i++) umfang += Math.hypot(p[(i + 1) % p.length].x - p[i].x, p[(i + 1) % p.length].z - p[i].z);
        expect(Math.abs(umfang - 2 * Math.PI * 5) / (2 * Math.PI * 5)).toBeLessThan(0.02);
    });

    it('die Nulllinie einer Gerinne-Differenz umschliesst den Graben — das Planbild', async () => {
        const ur = rasterAusMesh({ mesh: ebene() }, { cell: 0.5 }).ergebnis;
        const { raster: neu } = gerinne(ur, { achse: [{ x: 3, z: 10 }, { x: 17, z: 10 }], sohlbreite: 1, boeschung: 1, sohleAnfang: 298, sohleEnde: 298 });
        const d = rasterDifferenz({ a: ur, b: neu }).ergebnis;
        const k = erzeugeKernel();
        const iso = await k.op('isolinie', { raster: d }, { wert: -0.01 });
        expect(iso.ergebnis.length).toBeGreaterThan(0);
        const gesamt = iso.ergebnis.reduce((n, l) => n + l.punkte.length, 0);
        expect(gesamt).toBeGreaterThan(20);
        // Alle Punkte liegen um den Graben herum, keiner ausserhalb des Rasters
        for (const l of iso.ergebnis) for (const p of l.punkte) {
            expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(20);
            expect(Math.abs(p.z - 10)).toBeLessThan(6);
        }
    });
});
