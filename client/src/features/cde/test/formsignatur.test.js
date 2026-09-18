/**
 * Die Formsignatur (2026-09-07) — der Geometrie-Rückfall für alle acht
 * Bauformen, an synthetischen Körpern mit bekannter Antwort.
 *
 * Vier Zahlen, jede eine physikalische Aussage: FLACH, LIEGEND, LANG, EBEN.
 * Drei davon sind Verhältnisse und damit EINHEITENFREI — der wichtigste Test
 * hier ist deshalb der, der dasselbe Netz in Millimetern noch einmal fragt.
 */
import { describe, expect, it } from 'vitest';
import {
    bauformAusNetz, bauformAusSignatur, ebenheit, formsignatur, EBEN, FLACH, LANG, LIEGEND,
} from '../services/bauform/Formsignatur.js';
import { box, toPositions } from './fixtures/solidFixtures.js';
import { meshVolume } from '../services/geometrie/MeshOps.js';

/** Geschlossener Quader x × y (Höhe) × z — über die Fixture, in three-Konvention. */
function quader(x, y, z) {
    // box() extrudiert ein xy-Profil entlang z; für Y-oben tauschen wir y↔z.
    const tris = box(x, z, y).map(t => t.map(([px, py, pz]) => [px, pz, py]));
    const positions = toPositions(tris);
    return { positions, triCount: tris.length, closed: meshVolume(positions, tris.length).closed };
}

/** Offenes Gelände-TIN n×n Zellen, Höhe h(x,z) — kein Boden, keine Wände. */
function gelaende(n = 20, breite = 100, h = (x, z) => 300 + 3 * Math.sin(x / 9) + 2 * Math.cos(z / 7)) {
    const c = breite / n;
    const t = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const x0 = i * c, z0 = j * c, x1 = x0 + c, z1 = z0 + c;
        // Wicklung so, dass die Normale nach +Y zeigt (a, c, b) — wie ein DGM.
        t.push(x0, h(x0, z0), z0, x1, h(x1, z1), z1, x1, h(x1, z0), z0);
        t.push(x0, h(x0, z0), z0, x0, h(x0, z1), z1, x1, h(x1, z1), z1);
    }
    const positions = new Float64Array(t);
    return { positions, triCount: t.length / 9, closed: false };
}

describe('Die vier Zahlen sind physikalische Aussagen, keine Stellschrauben', () => {
    it('stehen fest und sind dokumentiert', () => {
        expect(FLACH).toBe(0.15);
        expect(LIEGEND).toBe(0.85);
        expect(LANG).toBe(6);
        expect(EBEN).toBe(0.05);
    });
});

describe('bauformAusNetz — die acht Formen aus synthetischen Körpern', () => {
    it('Würfel und Schacht sind Körper — GEMESSEN, nichts geschätzt', () => {
        expect(bauformAusNetz(quader(1, 1, 1))).toMatchObject({ bauform: 'koerper', guete: 'gemessen' });
        expect(bauformAusNetz(quader(1, 3, 1))).toMatchObject({ bauform: 'koerper', guete: 'gemessen' });
    });

    it('eine Platte ist liegend flach mit ebener Oberseite → flaeche+dicke', () => {
        const r = bauformAusNetz(quader(10, 0.3, 8));
        expect(r).toMatchObject({ bauform: 'flaeche+dicke', guete: 'geschaetzt' });
        expect(r.signatur.relief).toBeLessThan(FLACH);
        expect(r.signatur.obenEben).toBe(true);
        expect(r.grund).toMatch(/liegend flach.*eben/);
    });

    it('eine Wand ist stehend flach → flaeche+dicke', () => {
        const r = bauformAusNetz(quader(10, 3, 0.3));
        expect(r).toMatchObject({ bauform: 'flaeche+dicke', guete: 'geschaetzt' });
        expect(r.signatur.stehendFlach).toBe(true);
        expect(r.grund).toMatch(/stehend flach/);
    });

    it('ein langer Kasten ohne echte Achse ist ein Schwelkörper — geschätzt, nicht gemessen', () => {
        const r = bauformAusNetz(quader(10, 0.3, 0.3));
        expect(r).toMatchObject({ bauform: 'achse+profil', guete: 'geschaetzt' });
        expect(r.signatur.lang).toBe(true);
    });

    it('ein Würfel mit skelettierter Achse bleibt ein Körper — die Skelettachse allein zählt nicht', () => {
        const r = bauformAusNetz({ ...quader(1, 1, 1), achse: 'geschaetzt' });
        expect(r.bauform).toBe('koerper');
    });

    it('ein Blatt mit GEKIPPTER Wicklung (alle Normalen nach unten) wird genauso gelesen', () => {
        // IFC-Wicklungen sind nicht immer konsistent — die Ebenheit darf nicht
        // an der Orientierung hängen.
        const g = gelaende(12, 100);
        const gekippt = new Float64Array(g.positions.length);
        for (let t = 0; t < g.triCount; t++) {
            const o = t * 9;
            gekippt.set(g.positions.subarray(o, o + 3), o);
            gekippt.set(g.positions.subarray(o + 6, o + 9), o + 3);
            gekippt.set(g.positions.subarray(o + 3, o + 6), o + 6);
        }
        const r = bauformAusNetz({ positions: gekippt, triCount: g.triCount, closed: false });
        expect(r.bauform).toBe('hoehenfeld');
        expect(r.signatur.obenEben).toBe(false);
    });

    it('ein hügeliges Gelände ohne Boden ist ein Höhenfeld — über den Flächenanteil, nicht nur die Hülle', () => {
        const r = bauformAusNetz(gelaende(20, 100));
        expect(r).toMatchObject({ bauform: 'hoehenfeld', guete: 'geschaetzt' });
        expect(r.signatur.liegendAnteil).toBeGreaterThan(LIEGEND);
        expect(r.signatur.obenEben).toBe(false);
        expect(r.grund).toMatch(/uneben/);
    });

    it('ein geschlossener, flacher Erdkörper mit unebener Oberseite ist ebenfalls ein Höhenfeld', () => {
        const oben = gelaende(10, 100);
        const t = [...oben.positions];
        const B = 100, y0 = 290;
        // Boden zeigt nach UNTEN (−Y) — sonst wäre er die „Oberseite".
        t.push(0, y0, 0, B, y0, 0, B, y0, B, 0, y0, 0, B, y0, B, 0, y0, B);
        const r = bauformAusNetz({ positions: new Float64Array(t), triCount: t.length / 9, closed: true });
        expect(r.bauform).toBe('hoehenfeld');
        expect(r.signatur.relief).toBeLessThan(FLACH);
    });

    it('ein ebenes offenes Blatt ist eine Fläche ohne Dicke', () => {
        const r = bauformAusNetz(gelaende(4, 50, () => 300));
        expect(r).toMatchObject({ bauform: 'flaeche', guete: 'geschaetzt' });
    });

    it('eine ECHTE Achse macht linear — mit Netz ein Schwelkörper, ohne eine Linie, beides gemessen', () => {
        expect(bauformAusNetz({ ...quader(1, 1, 1), achse: 'gemessen' })).toMatchObject({ bauform: 'achse+profil', guete: 'gemessen' });
        expect(bauformAusNetz({ positions: null, triCount: 0, achse: 'gemessen' })).toMatchObject({ bauform: 'linie', guete: 'gemessen' });
    });

    it('nichts zu messen → netz, mit Grund', () => {
        expect(bauformAusNetz({ positions: new Float64Array(0), triCount: 0 })).toMatchObject({ bauform: 'netz', guete: 'unbekannt' });
        expect(bauformAusSignatur(null).grund).toBe('kein Netz');
    });
});

describe('EINHEITENFREI — dasselbe Netz in Millimetern sagt dasselbe', () => {
    it('Platte, Wand, Lauf und Gelände ändern ihre Form nicht mit dem Massstab', () => {
        for (const netz of [quader(10, 0.3, 8), quader(10, 3, 0.3), quader(10, 0.3, 0.3), gelaende(12, 100)]) {
            const inMm = { ...netz, positions: netz.positions.map(v => v * 1000) };
            const a = bauformAusNetz(netz), b = bauformAusNetz(inMm);
            expect(b.bauform, a.grund).toBe(a.bauform);
        }
    });
});

describe('ebenheit — die Ausgleichsebene', () => {
    it('eine geneigte Ebene hat Abweichung 0, auch in Landeskoordinaten', () => {
        const p = [];
        for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
            const x = 410000 + i * 7, z = -5476000 + j * 5;
            p.push(x, 300 + 0.02 * (x - 410000) - 0.01 * (z + 5476000), z);
        }
        expect(ebenheit(p)).toBeLessThan(1e-6);
    });

    it('eine Welle hat eine Abweichung in der Grössenordnung ihrer Amplitude', () => {
        const p = [];
        for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) p.push(i, 2 * Math.sin(i / 3), j);
        const rms = ebenheit(p);
        expect(rms).toBeGreaterThan(0.8);
        expect(rms).toBeLessThan(2);
    });

    it('zu wenig oder kollineare Punkte → null, kein Wurf', () => {
        expect(ebenheit([0, 0, 0, 1, 1, 1])).toBeNull();
        expect(ebenheit([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0])).toBeNull();
    });
});

describe('formsignatur — die Messwerte selbst', () => {
    it('misst Ausdehnung, Relief und Flächenanteil eines Quaders nachrechenbar', () => {
        const s = formsignatur(quader(4, 1, 9));
        expect(s.ausdehnung).toEqual({ x: 4, y: 1, z: 9 });
        expect(s.relief).toBeCloseTo(1 / 6, 6);
        // Deckel + Boden = 2·36 von 2·36 + 2·4 + 2·9 = 98 → 0,735
        expect(s.liegendAnteil).toBeCloseTo(72 / 98, 3);
        expect(s.geschlossen).toBe(true);
    });
});
