/**
 * BIMFY I2 — die Körper der Schachtteile und das Rohr mit Wand.
 *
 * Ein Körper ist nur dann einer, wenn er GESCHLOSSEN ist (`meshVolume` stellt
 * das Attest aus) und sein Volumen stimmt. Gemessen wird gegen die Formel des
 * Vielecks, das der Körper wirklich ist: ein Kreis aus n Ecken hat die Fläche
 * n/2 · r² · sin(2π/n), nicht π r².
 */
import { describe, expect, it } from 'vitest';
import { baueAusBauplan, rezeptNach } from '../services/Bauteilrezepte.js';
import { ringstueckKoerper, bermeKoerper, trittKoerper, sweepKoerper, profilAus } from '../services/rezept/Geometriebau.js';
import { meshVolume } from '../services/geometrie/MeshOps.js';

const vieleck = (r, n = 32) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
const r4 = (v) => Math.round(v * 10000) / 10000;
const attest = (k) => meshVolume(k.positions, k.positions.length / 9);

describe('Ringstück', () => {
    it('Schachtring DN 1000, Wand 120 mm, 1 m hoch: geschlossen, Volumen des Vielecksrings', () => {
        const k = ringstueckKoerper([[0, 0, 0], [0, 1, 0]], { aussen: 1.24, innen: 1.0 });
        const a = attest(k);
        expect(a.closed).toBe(true);
        expect(r4(a.volume)).toBe(r4(vieleck(0.62) - vieleck(0.5)));
    });

    it('Unterteil als Topf: Ring plus Boden 150 mm — das Volumen ist beides', () => {
        const k = ringstueckKoerper([[0, 0, 0], [0, 0.85, 0]], { aussen: 1.24, innen: 1.0, boden: 0.15 });
        const a = attest(k);
        expect(a.closed).toBe(true);
        expect(r4(a.volume)).toBe(r4((vieleck(0.62) - vieleck(0.5)) * 0.85 + vieleck(0.5) * 0.15));
    });

    it('exzentrischer Konus DN 1000/625: auf der Seite des Versatzes stehen Innen- und Aussenwand senkrecht', () => {
        // Oben um (500 − 312,5) mm nach Ost versetzt — die Steigseite ist Ost.
        const k = ringstueckKoerper([[0, 0, 0], [0.1875, 0.6, 0]], { aussen: 1.24, innen: 1.0, aussenOben: 0.865, innenOben: 0.625 });
        expect(attest(k).closed).toBe(true);
        const p = k.positions;
        const ostAufHoehe = (h) => {
            const xs = new Set();
            for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 1] - h) < 1e-9 && Math.abs(p[i + 2]) < 1e-9 && p[i] > 0) xs.add(r4(p[i]));
            return [...xs].sort();
        };
        // Unten und oben dieselben x auf der Ostseite: innen 0,5, aussen 0,62 — senkrecht.
        expect(ostAufHoehe(0)).toEqual([0.5, 0.62]);
        expect(ostAufHoehe(0.6)).toEqual([0.5, 0.62]);
    });

    it('Abdeckung: Rahmen mit Deckel ist oben zu', () => {
        const k = ringstueckKoerper([[0, 0, 0], [0, 0.16, 0]], { aussen: 0.785, innen: 0.625, deckel: 0.06 });
        const a = attest(k);
        expect(a.closed).toBe(true);
        expect(r4(a.volume)).toBe(r4((vieleck(0.3925) - vieleck(0.3125)) * 0.16 + vieleck(0.3125) * 0.06));
    });
});

describe('Berme und Tritte', () => {
    it('Berme DN 1000, Auftritt 300 mm, Durchlauf DN 300: Kreis minus Gerinnestreifen', () => {
        const k = bermeKoerper([[0, 0, 0], [1, 0, 0], [-1, 0, 0]], { durchmesser: 1, hoehe: 0.3, breite: 0.3 });
        const a = attest(k);
        expect(a.closed).toBe(true);
        // Der Streifen schneidet den Vielecks-Kreis über die ganze Breite: Kreis minus Streifen, zwei Segmente.
        expect(a.volume).toBeLessThan(vieleck(0.5) * 0.3);
        expect(a.volume).toBeGreaterThan((vieleck(0.5) - 1.0 * 0.3) * 0.3);
    });

    it('drei Steigeisen 300 × 160 × 25 mm', () => {
        const k = trittKoerper([[0, 0, 0], [0.5, 0.4, 0], [0, 0.7, 0.5], [-0.5, 1.0, 0]], { breite: 0.3, tiefe: 0.16, dicke: 0.025 });
        const a = attest(k);
        expect(a.closed).toBe(true);
        expect(r4(a.volume)).toBe(r4(3 * 0.3 * 0.16 * 0.025));
    });
});

describe('Rohr mit Wand', () => {
    it('ohne Wanddicke bleibt das Rohr ein voller Kreis — bitgleich wie vorher', () => {
        const r = rezeptNach('rohr');
        const p = profilAus(r.geometrie.profil, { dn: 300 });
        expect(p.loch).toBeUndefined();
        expect(p.punkte).toHaveLength(12);
    });

    it('Steinzeug DN 300 innen, Wand 30 mm: Volumen des Rings, die Sohle bleibt innen', () => {
        const plan = { rezept: 'rohr', parameter: { punkte: [[0, 100, 0], [10, 100, 0]], dn: 300, wanddicke: 30, dnBezug: 'innen' } };
        const k = sweepKoerper(plan.parameter.punkte, profilAus(rezeptNach('rohr').geometrie.profil, plan.parameter));
        const a = attest(k);
        expect(a.closed).toBe(true);
        expect(r4(a.volume)).toBe(r4((vieleck(0.18, 12) - vieleck(0.15, 12)) * 10));
        // Die Sohle (Mitte → Innenunterkante) bleibt DN/2 — nicht DN/2 + Wand.
        expect(r4(rezeptNach('rohr').sohlen.abstand(plan.parameter))).toBe(0.15);
        expect(baueAusBauplan(plan).ok).toBe(true);
    });

    it('PVC DN/OD 200 mit Wand 5,9 mm: aussen 200, innen 188,2', () => {
        const p = profilAus(rezeptNach('rohr').geometrie.profil, { dn: 200, wanddicke: 5.9, dnBezug: 'aussen' });
        const r = (pp) => Math.max(...pp.punkte.map(q => q.u));
        expect(r4(r(p) * 2)).toBe(0.2);
        expect(r4(r(p.loch) * 2)).toBe(0.1882);
    });
});
