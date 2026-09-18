// @vitest-environment jsdom
/**
 * An Schacht anschliessen + der Bezugs-Arm (Stufe 16, ehemals 12.4/12.5).
 *
 * Zwei Hälften: das WERKZEUG (der Tipp wählt den Schacht, das nähere Ende
 * wandert, starr in der Ebene, mit `bezug` als Pfand) und das NACHSPIELEN
 * (bewegt der Planer den Schacht, wird der Anker NACHGEFÜHRT — idempotent,
 * gemeldet, nie still; fehlt der Schacht, gilt der absolute Anker weiter).
 */
import { describe, expect, it } from 'vitest';
import { nachId } from '../services/Bearbeitungen.js';
import { planeNachspielen, fasseZusammen } from '../services/Nachspielen.js';
import { KUREN } from '../services/Befunde.js';

/** Rohr von (0,10,0) nach (50,9,0); Schächte bei (60,8,0) und (-50,11,0). */
const ROHR = {
    modelId: 'm1', localId: 1, category: 'IFCPIPESEGMENT', globalId: 'H1',
    name: 'H1', anker: { x: 25, y: 9.5, z: 0 },
    achse: { anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9, z: 0 },
             laenge: 50, dn: 300, quelle: 'extrusion' },
    knotenImNetz: [
        { globalId: 'S9', punkt: { x: 60, y: 8, z: 0 }, name: 'S9' },
        { globalId: 'S1', punkt: { x: -50, y: 11, z: 0 }, name: 'S1' },
    ],
};

describe('Das Werkzeug', () => {
    const b = nachId('an-schacht-anschliessen');

    it('der Tipp wählt den Schacht; das NÄHERE Ende wandert — nie ein Index', () => {
        const e = b.anwenden(ROHR, {}, { zug: [{ x: 58, z: 1 }] });
        expect(e.art).toBe('lage');
        // Ende (50,9,0) wandert auf S9 (60,8,0): starr +10 in x, Ebene bleibt.
        expect(e.nachher).toEqual({ x: 35, y: 9.5, z: 0 });
        expect(e.bezug).toEqual({
            art: 'anschluss', ziel: 'S9', ende: 'ende',
            zielBasis: { x: 60, y: 8, z: 0 },
        });
    });

    it('ein Tipp ins Leere fängt nichts — Fangradius 10 m', () => {
        expect(b.anwenden(ROHR, {}, { zug: [{ x: 500, z: 500 }] })).toBeNull();
    });

    it('sitzt das FERNE Ende schon auf einem Schacht, wird abgelehnt — starr risse es ab', () => {
        const angeschlossen = {
            ...ROHR,
            knotenImNetz: [...ROHR.knotenImNetz,
                { globalId: 'S0', punkt: { x: 0, y: 10, z: 0 }, name: 'S0' }],
        };
        expect(angeschlossen.knotenImNetz.some(k => k.punkt.x === 0)).toBe(true);
        expect(b.anwenden(angeschlossen, {}, { zug: [{ x: 58, z: 1 }] })).toBeNull();
    });

    it('sitzt das Ende schon AUF dem Schacht, gibt es nichts zu tun', () => {
        const dran = { ...ROHR, achse: { ...ROHR.achse, ende: { x: 60, y: 9, z: 0 } } };
        expect(b.anwenden(dran, {}, { zug: [{ x: 60, z: 0 }] })).toBeNull();
    });

    it('ist die Kur des losen Endes', () => {
        expect(KUREN.loses_ende?.bearbeitung).toBe('an-schacht-anschliessen');
    });
});

describe('Der Bezugs-Arm beim Nachspielen', () => {
    const EINTRAG = {
        art: 'lage', globalId: 'H1', wer: 'Fabio',
        basis: { x: 25, y: 9.5, z: 0 },
        nachher: { x: 35, y: 9.5, z: 0 },
        bezug: { art: 'anschluss', ziel: 'S9', ende: 'ende',
                 zielBasis: { x: 60, y: 8, z: 0 } },
    };
    const lieferstand = (gid) => (gid === 'H1' ? { x: 25, y: 9.5, z: 0 } : undefined);

    it('Ziel unbewegt → sauber, Wert unverändert', () => {
        const plan = planeNachspielen([EINTRAG], lieferstand, {
            leseBezug: (gid) => (gid === 'S9' ? { x: 60, y: 8, z: 0 } : undefined),
        });
        expect(plan.anzuwenden[0].wert).toEqual({ x: 35, y: 9.5, z: 0 });
        expect(plan.zusammenfassung.nachgefuehrt).toBe(0);
    });

    it('Ziel bewegt → der Anker wird NACHGEFÜHRT und es wird gemeldet', () => {
        const leseBezug = (gid) => (gid === 'S9' ? { x: 62, y: 8, z: 1 } : undefined);
        const plan = planeNachspielen([EINTRAG], lieferstand, { leseBezug });
        expect(plan.anzuwenden[0].wert).toEqual({ x: 37, y: 9.5, z: 1 });
        expect(plan.anzuwenden[0].grund).toBe('nachgefuehrt');
        expect(plan.zusammenfassung.nachgefuehrt).toBe(1);
        expect(fasseZusammen(plan.zusammenfassung)).toMatch(/dem Bezug nachgeführt/);
    });

    it('zweimal geplant ergibt zweimal DASSELBE — Nachführen ist idempotent', () => {
        const leseBezug = (gid) => (gid === 'S9' ? { x: 62, y: 8, z: 1 } : undefined);
        const a = planeNachspielen([EINTRAG], lieferstand, { leseBezug });
        const b2 = planeNachspielen([EINTRAG], lieferstand, { leseBezug });
        expect(b2.anzuwenden[0].wert).toEqual(a.anzuwenden[0].wert);
    });

    it('Ziel fehlt → der absolute Anker gilt weiter, aber es wird GEMELDET', () => {
        const plan = planeNachspielen([EINTRAG], lieferstand, { leseBezug: () => undefined });
        expect(plan.anzuwenden[0].wert).toEqual({ x: 35, y: 9.5, z: 0 });
        expect(plan.anzuwenden[0].grund).toBe('bezug_fehlt');
        expect(fasseZusammen(plan.zusammenfassung)).toMatch(/Bezugsziel nicht mehr/);
    });

    it('das SUBJEKT selbst geändert → Konflikt wie immer — der Bezug rettet nichts', () => {
        const plan = planeNachspielen([EINTRAG],
            (gid) => (gid === 'H1' ? { x: 99, y: 9.5, z: 0 } : undefined),
            { leseBezug: (gid) => ({ x: 60, y: 8, z: 0 }) });
        expect(plan.konflikte).toHaveLength(1);
        expect(plan.zusammenfassung.nachgefuehrt).toBe(0);
    });

    it('ein lage-Eintrag OHNE Bezug läuft unverändert — der Arm ist rein additiv', () => {
        const ohne = { ...EINTRAG, bezug: undefined };
        const plan = planeNachspielen([ohne], lieferstand, { leseBezug: () => undefined });
        expect(plan.anzuwenden[0].wert).toEqual({ x: 35, y: 9.5, z: 0 });
        expect(plan.anzuwenden[0].grund).not.toBe('bezug_fehlt');
    });
});
