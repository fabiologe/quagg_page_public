/**
 * Fangpunkte — der fachliche Fang im Raum (Teil XVI, S1).
 *
 * Rein: der Fang ist eine Frage in Bildschirm-Pixeln, die Projektion kommt
 * als Funktion herein. Hier ist sie eine Parallelprojektion auf XZ — damit
 * lässt sich der Radius in Metern denken.
 */
import { describe, expect, it } from 'vitest';
import { FANG_RADIUS_PX, fangePunkt, fangkandidaten, stationAuf } from '../services/Fangpunkte.js';

/** 10 px je Meter, Bildschirm = Grundriss. */
const projiziere = (p) => ({ x: p.x * 10, y: p.z * 10 });

describe('fangkandidaten', () => {
    it('nimmt Schächte, Achs-ENDEN und Stützpunkte — Zwischenpunkte einer Achse nicht', () => {
        const k = fangkandidaten({
            schaechte: [{ x: 0, y: 0, z: 0, name: 'S1' }],
            achsen: [{ name: 'H1', punkte: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] }],
            stuetzpunkte: [{ x: 3, y: 1, z: 3 }],
        });
        expect(k.map(x => x.art)).toEqual(['schacht', 'achsende', 'achsende', 'stuetzpunkt']);
        expect(k[1].name).toBe('H1 · Anfang');
        expect(k[2].punkt).toEqual({ x: 10, y: 0, z: 0 });
    });

    it('überspringt Kandidaten ohne endliche Koordinaten statt NaN zu fangen', () => {
        const k = fangkandidaten({ schaechte: [{ x: NaN, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }] });
        expect(k).toHaveLength(1);
    });
});

describe('fangePunkt', () => {
    const kandidaten = fangkandidaten({
        schaechte: [{ x: 10, y: 0, z: 10, name: 'S7' }],
        achsen: [{ name: 'H2', punkte: [{ x: 10.5, y: 0, z: 10 }, { x: 40, y: 0, z: 10 }] }],
    });

    it('zieht innerhalb des Radius auf den nächsten Kandidaten', () => {
        const r = fangePunkt({ punkt: { x: 10.8, y: 0, z: 10.1 }, kandidaten, projiziere });
        // S7 liegt 8,1 px weg, das Achsende H2·Anfang 3,2 px — das Nähere gewinnt.
        expect(r.fang.art).toBe('achsende');
        expect(r.punkt).toEqual({ x: 10.5, y: 0, z: 10 });
    });

    it('bei gleichem Abstand gewinnt der fachlich stärkere (Schacht vor Achsende)', () => {
        const zwei = fangkandidaten({
            schaechte: [{ x: 0, y: 0, z: 0, name: 'S' }],
            achsen: [{ punkte: [{ x: 0, y: 5, z: 0 }, { x: 9, y: 0, z: 0 }] }],   // Anfang liegt in XZ genau auf S
        });
        const r = fangePunkt({ punkt: { x: 0.3, y: 0, z: 0 }, kandidaten: zwei, projiziere });
        expect(r.fang.art).toBe('schacht');
    });

    it('lässt den Punkt in Ruhe, wenn nichts im Radius liegt', () => {
        const roh = { x: 25, y: 3, z: 25 };
        const r = fangePunkt({ punkt: roh, kandidaten, projiziere });
        expect(r.fang).toBeNull();
        expect(r.punkt).toBe(roh);
    });

    it('der Radius ist Bildschirm, nicht Welt', () => {
        // Bei 1 px je Meter liegt S7 von (11, 0, 10) nur 1 px weg → gefangen;
        // bei 100 px je Meter sind es 100 px → frei.
        const nah = fangePunkt({ punkt: { x: 11, y: 0, z: 10 }, kandidaten, projiziere: (p) => ({ x: p.x, y: p.z }) });
        const fern = fangePunkt({ punkt: { x: 11, y: 0, z: 10 }, kandidaten, projiziere: (p) => ({ x: p.x * 100, y: p.z * 100 }) });
        expect(nah.fang?.art).toBe('schacht');
        expect(fern.fang).toBeNull();
        expect(FANG_RADIUS_PX).toBeGreaterThan(8);
    });

    it('ohne Projektion oder ohne Kandidaten gibt es keinen Fang — und keinen Wurf', () => {
        expect(fangePunkt({ punkt: { x: 0, y: 0, z: 0 }, kandidaten }).fang).toBeNull();
        expect(fangePunkt({ punkt: { x: 0, y: 0, z: 0 }, kandidaten: [], projiziere }).fang).toBeNull();
        expect(fangePunkt({ punkt: null, kandidaten, projiziere }).fang).toBeNull();
    });
});

describe('stationAuf', () => {
    const achse = { punkte: [{ x: 0, y: 100, z: 0 }, { x: 10, y: 99, z: 0 }, { x: 10, y: 98, z: 10 }] };

    it('misst die Station im GRUNDRISS und interpoliert die Höhe', () => {
        const r = stationAuf(achse, { x: 4, z: 2 });        // Lot auf das erste Segment bei x=4
        expect(r.segment).toBe(0);
        expect(r.station).toBeCloseTo(4, 9);
        expect(r.punkt).toEqual({ x: 4, y: 99.6, z: 0 });
        expect(r.abstand).toBeCloseTo(2, 9);
    });

    it('zählt über den Knick hinaus weiter', () => {
        const r = stationAuf(achse, { x: 11, z: 7 });
        expect(r.segment).toBe(1);
        expect(r.station).toBeCloseTo(17, 9);
        expect(r.punkt.y).toBeCloseTo(98.3, 9);
    });

    it('klemmt hinter dem Ende auf das Ende', () => {
        const r = stationAuf(achse, { x: 30, z: 30 });
        expect(r.station).toBeCloseTo(20, 9);
        expect(r.punkt).toEqual({ x: 10, y: 98, z: 10 });
    });

    it('gibt null für eine Achse ohne zwei Punkte', () => {
        expect(stationAuf({ punkte: [{ x: 0, y: 0, z: 0 }] }, { x: 0, z: 0 })).toBeNull();
        expect(stationAuf(null, { x: 0, z: 0 })).toBeNull();
    });
});
