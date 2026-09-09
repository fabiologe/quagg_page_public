/**
 * Sweep und Extrusion (Teil XIV, G6) — Körper aus Linie und Umriss.
 *
 * Geprüft an nachrechenbaren Fällen: ein gerades Rohr hat exakt
 * Polygonfläche · Länge, ein Kasten mit Loch exakt (Aussen − Loch) · Höhe.
 * Dazu die Fallen: Achse ohne Höhe, Knick, falsch herum gegebene Ringe.
 */
import { describe, expect, it } from 'vitest';
import { sweep, extrudiere, kreisProfil, trapezProfil } from '../services/geometrie/ops/Sweep.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { pruefeForm } from '../services/geometrie/Formen.js';

const gerade = (l = 10, y = 300) => ({ punkte: [{ x: 0, y, z: 0 }, { x: l, y, z: 0 }] });

describe('sweep', () => {
    it('ein gerades Rohr ist geschlossen und hat exakt Polygonfläche · Länge', () => {
        const r = 0.15, n = 12, L = 10;
        const { ergebnis, warnungen } = sweep({ profil: kreisProfil(r, n), achse: gerade(L) });
        expect(pruefeForm(ergebnis, 'koerper')).toEqual([]);
        expect(ergebnis.closed).toBe(true);
        const flaeche = (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
        expect(ergebnis.volumen).toBeCloseTo(flaeche * L, 6);
        expect(warnungen).toEqual([]);
        expect(ergebnis.triCount).toBe(n * 2 + (n - 2) * 2);      // Seiten + zwei Deckel
    });

    it('ein Knick bleibt geschlossen — und wird ab 60° gemeldet', () => {
        const achse = { punkte: [{ x: 0, y: 300, z: 0 }, { x: 10, y: 300, z: 0 }, { x: 10, y: 300, z: 10 }] };
        const { ergebnis, warnungen } = sweep({ profil: kreisProfil(0.2, 8), achse });
        expect(ergebnis.closed).toBe(true);
        expect(ergebnis.volumen).toBeGreaterThan(0);
        expect(warnungen.some(w => w.startsWith('sweep_knick'))).toBe(true);
        const sanft = { punkte: [{ x: 0, y: 300, z: 0 }, { x: 10, y: 300, z: 0 }, { x: 20, y: 300.5, z: 1 }] };
        expect(sweep({ profil: kreisProfil(0.2, 8), achse: sanft }).warnungen).toEqual([]);
    });

    it('ein Trapezprofil trägt seine Fläche entlang der Achse', () => {
        const p = trapezProfil({ sohlbreite: 1, hoehe: 1, boeschung: 1 });   // Fläche = (1 + 3) / 2 · 1 = 2
        const { ergebnis } = sweep({ profil: p, achse: gerade(5) });
        expect(ergebnis.closed).toBe(true);
        expect(ergebnis.volumen).toBeCloseTo(10, 6);
    });

    it('ein Profil im Uhrzeigersinn ergibt denselben Körper', () => {
        const ccw = kreisProfil(0.1, 6);
        const cw = { punkte: ccw.punkte.slice().reverse() };
        const a = sweep({ profil: ccw, achse: gerade(3) }).ergebnis;
        const b = sweep({ profil: cw, achse: gerade(3) }).ergebnis;
        expect(b.closed).toBe(true);
        expect(b.volumen).toBeCloseTo(a.volumen, 9);
    });

    it('eine Achse ohne Höhe wird abgelehnt — erst drapen', () => {
        const { ergebnis, warnungen } = sweep({ profil: kreisProfil(0.1), achse: { punkte: [{ x: 0, y: NaN, z: 0 }, { x: 1, y: 0, z: 0 }] } });
        expect(ergebnis).toBeNull();
        expect(warnungen[0]).toMatch(/ohne_hoehe/);
    });

    it('läuft über den Kernel-Vertrag mit Provenienz', async () => {
        const k = erzeugeKernel();
        const r = await k.op('sweep', { profil: kreisProfil(0.1), achse: gerade(2) });
        expect(r.provenienz).toMatchObject({ op: 'sweep', backend: 'client' });
        expect(r.ergebnis.closed).toBe(true);
        expect(k.kann('extrudiere').ok).toBe(true);
    });
});

describe('extrudiere', () => {
    const quadrat = (s, cx = 0, cz = 0) => [{ x: cx - s, z: cz - s }, { x: cx + s, z: cz - s }, { x: cx + s, z: cz + s }, { x: cx - s, z: cz + s }];

    it('ein Kasten mit Loch: (Aussen − Loch) · Höhe, geschlossen', () => {
        const umriss = { ring: quadrat(1), loecher: [quadrat(0.5)] };
        const { ergebnis, warnungen } = extrudiere({ umriss }, { von: 300, bis: 302 });
        expect(pruefeForm(ergebnis, 'koerper')).toEqual([]);
        expect(ergebnis.closed).toBe(true);
        expect(ergebnis.volumen).toBeCloseTo((4 - 1) * 2, 6);
        expect(warnungen).toEqual([]);
    });

    it('Ringordnung und Höhenreihenfolge sind egal — der Körper zeigt immer nach aussen', () => {
        const a = extrudiere({ umriss: { ring: quadrat(1) } }, { von: 302, bis: 300 }).ergebnis;
        const b = extrudiere({ umriss: { ring: quadrat(1).reverse() } }, { von: 300, bis: 302 }).ergebnis;
        expect(a.closed && b.closed).toBe(true);
        expect(a.volumen).toBeCloseTo(8, 6);
        expect(b.volumen).toBeCloseTo(8, 6);
    });

    it('ohne Höhe oder mit entartetem Ring gibt es keinen Körper, aber einen Grund', () => {
        expect(extrudiere({ umriss: { ring: quadrat(1) } }, { von: 1, bis: 1 }).warnungen[0]).toMatch(/hoehe_null/);
        expect(extrudiere({ umriss: { ring: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }] } }, { von: 0, bis: 1 }).ergebnis).toBeNull();
    });
});
