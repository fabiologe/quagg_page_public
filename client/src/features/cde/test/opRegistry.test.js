/**
 * Die Registry der Geländeoperationen (Teil XXIII, A2).
 *
 * Bis zum 2026-09-18 wusste ein Eintrag in `GELAENDE_OPS` nur Titel und
 * Funktion; alles andere stand in 38 Verzweigungen über den Op-Namen, verteilt
 * auf vier Dateien. Jetzt steht alles am Eintrag.
 *
 * Dass KEINE andere Datei mehr nach einem Op-Namen verzweigt, prüft der
 * Architektur-Wächter (W2, Liste leer). Hier wird geprüft, dass der Eintrag
 * reicht: eine PROBE-Operation, die es nur in einer Test-Registry gibt,
 * bekommt Wirkbereich, Wirkfläche, Kennweite, Punktlisten und IFC-Typ, ohne
 * dass eine Zeile Code sie beim Namen kennt.
 */
import { describe, expect, it } from 'vitest';
import {
    GELAENDE_OPS, cutTypAus, fillTypAus, kennweiteVon, punktlistenVon, wirkbereichVon, wirkflaecheVon,
} from '../services/gelaende/Operationen.js';
import { ERDBAU_HOEHENFELDER, ERDBAU_PUNKTHOEHEN } from '../services/ableitung/Ableitungen.js';

/** Ein flaches Raster 40 × 40 m auf 300 m. */
function raster() {
    const nx = 41, nz = 41;
    return { x0: 0, z0: 0, maxX: 40, maxZ: 40, cell: 1, nx, nz, heights: new Float64Array(nx * nz).fill(300) };
}

describe('Jeder Eintrag weiss alles über seine Operation', () => {
    const PFLICHT = ['titel', 'wende', 'wirkbereich', 'wirkflaeche', 'kennweiten', 'hoehenfelder', 'kennhoehen', 'cutTyp'];
    for (const [art, e] of Object.entries(GELAENDE_OPS)) {
        it(`${art}: ${PFLICHT.join(', ')}`, () => {
            for (const k of PFLICHT) expect(k in e, `${art} ohne ${k}`).toBe(true);
            expect(typeof e.wende).toBe('function');
            expect(typeof e.wirkbereich).toBe('function');
            // Die Wirkfläche nennt Form UND Punkte — sonst fiele sie still aufs Hüllrechteck zurück.
            if (e.wirkflaeche !== null) {
                expect(['streifen', 'ring']).toContain(e.wirkflaeche.form);
                expect(typeof e.wirkflaeche.punkte).toBe('function');
            }
            expect(['TRENCH', 'EXCAVATION']).toContain(e.cutTyp);
        });
    }

    it('ein innerer Ring nennt Feld, Titel, Richtung und seine Bedingung', () => {
        for (const [art, e] of Object.entries(GELAENDE_OPS).filter(([, e]) => e.innen)) {
            expect(e.innen, art).toMatchObject({ feld: expect.any(String), titel: expect.any(String) });
            expect([1, -1], art).toContain(e.innen.richtung);
            expect(typeof e.innen.gilt, art).toBe('function');
        }
    });
});

describe('Die alten Tabellen sind jetzt Sichten — und sagen genau dasselbe', () => {
    // Die Werte VOR dem Umbau, wörtlich. Eine Sicht, die davon abweicht, hätte
    // die Höhenumrechnung an der NN-Grenze verändert.
    it('ERDBAU_HOEHENFELDER', () => {
        expect(ERDBAU_HOEHENFELDER).toEqual({
            gerinne: ['sohleAnfang', 'sohleEnde'], planum: ['hoehe'], boeschung: ['hoehe'], baugrube: ['sohle'],
            bauwerksgrube: ['sohle'], grube: ['sohle'], schuettung: ['hoehe'], boeschungLinie: [],
        });
    });
    it('ERDBAU_PUNKTHOEHEN', () => {
        expect(ERDBAU_PUNKTHOEHEN).toEqual({
            grube: ['umriss'], schuettung: ['umriss'], boeschungLinie: ['linie'], gerinne: ['stationen'],
        });
    });
});

describe('Eine neue Operation ist EIN Eintrag', () => {
    // „Damm" gibt es nicht — nur hier, als Eintrag in einer Test-Registry.
    const DAMM = {
        titel: 'Damm schütten', wende: (r) => ({ raster: r, warnungen: [] }),
        hoehenfelder: ['krone'], punktfelder: ['kante'],
        wirkbereich: (r, p) => ({ huelle: { minX: 10, maxX: 20, minZ: 5, maxZ: 6 }, saum: Number(p.breite) || 0 }),
        wirkflaeche: { form: 'streifen', punkte: (p) => p.kante },
        kennweiten: (r, p) => [Number(p.breite) || 0],
        kennhoehen: (p) => [{ art: 'kronenkante', hoehe: p.krone }],
        cutTyp: 'EXCAVATION',
        fillTyp: () => 'SLOPEFILL',
    };
    const ops = { ...GELAENDE_OPS, damm: DAMM };
    const op = { art: 'damm', parameter: { breite: 3, krone: 302, kante: [{ x: 10, y: 301, z: 5 }, { x: 20, y: 301, z: 5 }] } };

    it('Wirkbereich: seine Hülle, sein Saum, plus der Mindestrand', () => {
        const b = wirkbereichVon(raster(), 'damm', op.parameter, { ops });
        expect(b).toEqual({ minX: 10 - 7, maxX: 20 + 7, minZ: 5 - 7, maxZ: 6 + 7 });   // Rand 4 + Saum 3
    });
    it('Wirkfläche: als Streifen gerechnet, weil der Eintrag es sagt', () => {
        const f = wirkflaecheVon(raster(), 'damm', op.parameter, { ops });
        const box = (20 + 7 - (10 - 7)) * (6 + 7 - (5 - 7));
        expect(f).toBeGreaterThan(0);
        expect(f).toBeLessThan(box);                        // ein Streifen, nicht die Hülle
    });
    it('Kennweite: das Schmalste, das der Eintrag nennt', () => {
        expect(kennweiteVon(raster(), 'damm', op.parameter, { ops })).toBe(3);
    });
    it('Punktlisten: die Felder, die der Eintrag als Punkte mit Höhe nennt', () => {
        expect(punktlistenVon([op], { ops })).toEqual([{ op: 0, feld: 'kante', punkte: op.parameter.kante }]);
    });
    it('IFC-Typen: was er beisteuert, nach der Rangfolge', () => {
        expect(cutTypAus([op], { ops })).toBe('EXCAVATION');
        expect(fillTypAus([op], { ops })).toBe('SLOPEFILL');
        expect(fillTypAus([op, { art: 'schuettung', parameter: { ziel: 'ur' } }], { ops })).toBe('BACKFILL');
    });
    it('eine unbekannte Operation: kein Bereich, keine Punkte — kein Wurf', () => {
        expect(wirkbereichVon(raster(), 'damm', op.parameter)).toBeNull();          // ohne Test-Registry unbekannt
        expect(punktlistenVon([op])).toEqual([]);
        expect(kennweiteVon(raster(), 'damm', op.parameter)).toBeNull();
    });
});

describe('Die IFC-Typen der Erdkörper — wie vorher', () => {
    const o = (art, parameter = {}) => ({ art, parameter });
    it('nur Gräben → TRENCH, sonst EXCAVATION', () => {
        expect(cutTypAus([o('gerinne')])).toBe('TRENCH');
        expect(cutTypAus([o('gerinne'), o('planum')])).toBe('EXCAVATION');
        expect(cutTypAus([o('grube')])).toBe('EXCAVATION');
    });
    it('bis GOK → BACKFILL, Kante → SLOPEFILL, sonst EMBANKMENT', () => {
        expect(fillTypAus([o('schuettung', { ziel: 'ur' })])).toBe('BACKFILL');
        expect(fillTypAus([o('boeschungLinie')])).toBe('SLOPEFILL');
        expect(fillTypAus([o('boeschungLinie'), o('schuettung', { ziel: 'ur' })])).toBe('BACKFILL');
        expect(fillTypAus([o('schuettung', { ziel: 'hoehe' })])).toBe('EMBANKMENT');
        expect(fillTypAus([o('planum')])).toBe('EMBANKMENT');
    });
});
