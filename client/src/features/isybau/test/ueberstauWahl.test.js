/**
 * Automatische Wahl des Überstauverfahrens (SLOT/EXTRAN): Plausibilitätsprüfung
 * je Lauf und Wahl. Hintergrund und Messwerte: doc/04 Abschn. 5, doc/09 Befund 7.
 */
import { describe, it, expect } from 'vitest';
import { bewerteLauf, waehleVerfahren, deckelhoehe, BILANZ_GRENZE_PCT } from '../utils/swmm/ueberstauWahl.js';

// Kleines Netz: A (Deckel 110) → P (Pumpe) → B (Deckel 105) → C (Deckel 104)
const netz = {
    inputNodes: {
        A: { id: 'A', z: 100, depth: 10 },
        P: { id: 'P', z: 98, depth: 3 },
        B: { id: 'B', z: 101, depth: 4 },
        C: { id: 'C', z: 100, coverZ: 104, depth: 2 }
    },
    edges: [
        { fromNodeId: 'A', toNodeId: 'P' },
        { fromNodeId: 'P', toNodeId: 'B' },
        { fromNodeId: 'B', toNodeId: 'C' }
    ],
    pumpen: []
};
const lauf = (verfahren, flowError, hgl, extra = {}) => ({
    verfahren, flowError, nichtKonv: 0,
    nodes: Object.fromEntries(Object.entries(hgl).map(([id, h]) => [id, { maxHGL: h }])),
    ...extra
});

describe('deckelhoehe', () => {
    it('nimmt coverZ, sonst Sohle + Tiefe (wie die Überstau-Kennzeichnung)', () => {
        expect(deckelhoehe({ z: 100, coverZ: 104, depth: 2 })).toBe(104);
        expect(deckelhoehe({ z: 100, depth: 2 })).toBe(102);
    });
});

describe('bewerteLauf', () => {
    it('plausibel: kleine Bilanz, kein Wasserspiegel über dem höchsten Deckel (110 m)', () => {
        const b = bewerteLauf(lauf('SLOT', 2.1, { A: 101, B: 104.5, C: 103 }), netz);
        expect(b.plausibel).toBe(true);
        expect(b.gruende).toEqual([]);
    });

    it(`unplausibel: |Bilanzfehler| > ${BILANZ_GRENZE_PCT} %`, () => {
        const b = bewerteLauf(lauf('SLOT', 14.27, { B: 104 }), netz);
        expect(b.plausibel).toBe(false);
        expect(b.gruende.join(' ')).toMatch(/Bilanzfehler 14,3 %/);
    });

    it('unplausibel: Wasserspiegel über dem höchsten Deckel des Netzes', () => {
        const b = bewerteLauf(lauf('EXTRAN', -0.2, { C: 118.7 }), netz);
        expect(b.plausibel).toBe(false);
        expect(b.maxUeberHoechstemDeckel).toEqual({ id: 'C', m: expect.closeTo(8.7, 5) });
        expect(b.gruende.join(' ')).toMatch(/C.*8,7 m über dem höchsten Deckel/);
    });

    it('unterhalb einer Pumpe gilt die Schranke + Nullförderhöhe der Pumpe', () => {
        const mitPumpe = { ...netz, pumpen: [{ ziel: 'B', nullfoerderhoehe: 13 }] };
        expect(bewerteLauf(lauf('EXTRAN', 0.1, { C: 118.7 }), mitPumpe).plausibel).toBe(true);   // ≤ 110 + 13
        expect(bewerteLauf(lauf('EXTRAN', 0.1, { C: 124 }), mitPumpe).plausibel).toBe(false);    // > 123
        // oberhalb der Pumpe bleibt es bei 110
        expect(bewerteLauf(lauf('EXTRAN', 0.1, { A: 112 }), mitPumpe).plausibel).toBe(false);
    });

    it('abgebrochener Lauf ist unbrauchbar', () => {
        const b = bewerteLauf({ verfahren: 'SLOT', abbruch: 'ERROR 191: …' }, netz);
        expect(b.plausibel).toBe(false);
        expect(b.gruende.join(' ')).toMatch(/ERROR 191/);
    });
});

describe('waehleVerfahren', () => {
    const b = (verfahren, bilanz, plausibel, gruende = []) => ({ verfahren, bilanz, plausibel, gruende });

    it('beide plausibel → kleinerer Bilanzfehler', () => {
        const w = waehleVerfahren([b('SLOT', 2.27, true), b('EXTRAN', -0.33, true)]);
        expect(w.gewaehlt).toBe('EXTRAN');
        expect(w.keinerPlausibel).toBe(false);
        expect(w.grund).toBe('beide plausibel; kleinerer Bilanzfehler: EXTRAN -0,33 % gegenüber SLOT 2,27 %');
    });

    it('nur einer plausibel → dieser, mit Grund für den anderen', () => {
        const w = waehleVerfahren([b('SLOT', 14.27, false, ['Bilanzfehler 14,3 % > 5 %']), b('EXTRAN', 1.62, true)]);
        expect(w.gewaehlt).toBe('EXTRAN');
        expect(w.grund).toMatch(/SLOT verworfen: Bilanzfehler 14,3 %/);
    });

    it('keiner plausibel → kleinerer Bilanzfehler, aber gekennzeichnet', () => {
        const w = waehleVerfahren([b('SLOT', 9, false, ['x']), b('EXTRAN', 6, false, ['y'])]);
        expect(w.gewaehlt).toBe('EXTRAN');
        expect(w.keinerPlausibel).toBe(true);
    });

    it('ein Lauf abgebrochen → der andere, auch wenn er unplausibel ist', () => {
        const w = waehleVerfahren([{ verfahren: 'SLOT', bilanz: null, plausibel: false, abbruch: 'ERROR 211', gruende: ['SWMM-Abbruch'] }, b('EXTRAN', 7, false, ['y'])]);
        expect(w.gewaehlt).toBe('EXTRAN');
    });
});
