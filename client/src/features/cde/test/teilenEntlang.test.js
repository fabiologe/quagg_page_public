// @vitest-environment jsdom
/**
 * Teilen und Schacht einfügen AUF der Achse, nicht auf der Sehne (Nebenbefund
 * aus Teil XXIV, K5).
 *
 * Bis 2026-09-19 lag der Teilungspunkt auf der Geraden zwischen Anfang und
 * Ende, als Anteil der räumlichen Länge — bei einer Haltung mit Knick neben
 * dem Rohr, nicht dort, wo getippt wurde, und beide Stücke verloren ihre
 * Zwischenpunkte. Die Station ist die Weglänge im Grundriss entlang der Achse:
 * so zählt die Geste „Ort auf der Achse zeigen", so zählen Längsschnitt und
 * Gefälle.
 *
 * Die Haltung: L-förmig, A (0|0) → Knick K (20|0) → B (20|20), Sohle 100,00 →
 * 99,90 → 99,80, DN 300 — Weglänge 40 m.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { rezeptNach } from '../services/Bauteilrezepte.js';
import { nachId } from '../services/Bearbeitungen.js';
import { stationAuf } from '../services/Fangpunkte.js';
import { stationiere } from '../services/geometrie/Stationierung.js';
import { subjektAusStand } from '../services/kommando/Subjekt.js';
import { kantenVon } from '../services/Griffe.js';
import { teilePunktlisteAnStation } from '../services/Bauteilrezepte.js';
import { KOMMANDO_SCHEMA } from '../services/kommando/Kommando.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

const kommando = (id, werkzeug, rest) => ({ schema: KOMMANDO_SCHEMA, id, werkzeug, ziel: [], wer: 'fabio', wann: '2026-09-19T15:00:00Z', ...rest });
const MM = 0.001;

async function lHaltung() {
    const b = useBearbeitung();
    const erg = await b.fuehreAus(kommando('ko-h', 'rohr-zeichnen', { neu: ['cde-H'], werte: { name: 'H', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
        eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 20, nord: 0, hoehe: 99.9 }, { ost: 20, nord: 20, hoehe: 99.8 }] } }));
    expect(erg.grund).toBe(null);
    const ae = useAenderungen();
    // Die neuen Stücke — die alte Haltung steht gelöscht noch im Stand.
    const erzeugt = () => [...ae.wirksamerStand('erzeugt').entries()].filter(([gid, p]) => p.rezept === 'rohr' && gid !== 'cde-H');
    // Die Punkte eines Stücks in der Draufsicht (x|z) und seine Sohlen.
    const lage = (plan) => plan.parameter.punkte.map(p => [Math.round(p[0] * 1000) / 1000, Math.round(p[2] * 1000) / 1000]);
    const sohlen = (plan) => rezeptNach('rohr').sohlen.lies(plan.parameter);
    const weg = (plan) => stationiere(plan.parameter.punkte.map(p => ({ x: p[0], y: p[1], z: p[2] }))).laenge;
    return { b, ae, erzeugt, lage, sohlen, weg, subjekt: () => subjektAusStand('cde-H', { wirksamerStand: ae.wirksamerStand }) };
}
/** Die Nord-Achse der Welt läuft nach −z (Rahmen ohne Bezug) — (Ost|Nord) → (x|z). */
const xz = (ost, nord) => [ost, 0 - nord];   // 0 − v: keine −0

describe('Haltung teilen', () => {
    it('bei Station 10: der Punkt liegt AUF dem ersten Schenkel, der Knick bleibt im zweiten Stück', async () => {
        const { b, erzeugt, lage, sohlen, weg } = await lHaltung();
        expect((await b.fuehreAus(kommando('ko-t', 'haltung-teilen', { ziel: ['cde-H'], neu: ['cde-H1', 'cde-H2'], werte: { station: 10 } }))).grund).toBe(null);
        const [[, eins], [, zwei]] = erzeugt();
        expect(lage(eins)).toEqual([xz(0, 0), xz(10, 0)]);                 // vorher: (5|5) — 3,5 m neben dem Rohr
        expect(lage(zwei)).toEqual([xz(10, 0), xz(20, 0), xz(20, 20)]);    // vorher: der Knick war weg
        expect(Math.abs(sohlen(eins)[1] - 99.95)).toBeLessThan(MM);
        expect(Math.abs(sohlen(zwei)[0] - 99.95)).toBeLessThan(MM);
        expect(weg(eins) + weg(zwei)).toBeCloseTo(40, 9);                   // die Weglänge bleibt
    });

    it('genau am Knick (Station 20): der Knick ist der Teilungspunkt, kein Punkt doppelt', async () => {
        const { b, erzeugt, lage } = await lHaltung();
        await b.fuehreAus(kommando('ko-t', 'haltung-teilen', { ziel: ['cde-H'], neu: ['cde-H1', 'cde-H2'], werte: { station: 20 } }));
        const [[, eins], [, zwei]] = erzeugt();
        expect(lage(eins)).toEqual([xz(0, 0), xz(20, 0)]);
        expect(lage(zwei)).toEqual([xz(20, 0), xz(20, 20)]);
    });

    it('die Geste und das Werkzeug zählen dieselbe Station — getippt neben den zweiten Schenkel, geteilt dort', async () => {
        const { b, erzeugt, lage, subjekt } = await lHaltung();
        const a = subjekt().achse;
        const [x, z] = xz(20.4, 7);                                          // 40 cm neben dem Rohr, 7 m nördlich von K
        const { station } = stationAuf({ punkte: a.polyline }, { x, z });
        expect(station).toBeCloseTo(27, 9);
        await b.fuehreAus(kommando('ko-t', 'haltung-teilen', { ziel: ['cde-H'], neu: ['cde-H1', 'cde-H2'], werte: { station } }));
        expect(lage(erzeugt()[0][1]).at(-1)).toEqual(xz(20, 7));
    });

    it('die Vorbelegung ist die halbe Weglänge', async () => {
        const { subjekt } = await lHaltung();
        expect(nachId('haltung-teilen').vorbelegung(subjekt()).station).toBe(20);
    });
});

describe('Schacht einfügen', () => {
    it('bei Station 30: der Schacht steht AUF dem zweiten Schenkel, das erste Stück behält den Knick', async () => {
        const { b, ae, erzeugt, lage, sohlen } = await lHaltung();
        expect((await b.fuehreAus(kommando('ko-s', 'schacht-einfuegen', { ziel: ['cde-H'], neu: ['cde-S', 'cde-H1', 'cde-H2'], werte: { station: 30, deckel: 102.5, durchmesser: 1000 } }))).grund).toBe(null);
        const schacht = [...ae.wirksamerStand('erzeugt').values()].find(p => p.rezept === 'schacht');
        expect([schacht.parameter.punkte[0][0], schacht.parameter.punkte[0][2]]).toEqual(xz(20, 10));
        expect(Math.abs(schacht.parameter.punkte[0][1] - 99.85)).toBeLessThan(MM);   // die Sohle der Haltung dort
        const [[, eins], [, zwei]] = erzeugt();
        expect(lage(eins)).toEqual([xz(0, 0), xz(20, 0), xz(20, 10)]);
        expect(lage(zwei)).toEqual([xz(20, 10), xz(20, 20)]);
        expect(Math.abs(sohlen(eins).at(-1) - 99.85)).toBeLessThan(MM);
    });

    it('die Grenze im Grund ist die Weglänge', async () => {
        const { subjekt } = await lHaltung();
        expect(nachId('schacht-einfuegen').warumNicht(subjekt(), { station: 41 })).toMatch(/0 … 40,00 m/);
        expect(nachId('schacht-einfuegen').warumNicht(subjekt(), { station: 39 })).toBe(null);
    });
});

describe('Stützpunkt einfügen und Linie teilen zählen ebenfalls im Grundriss (2026-09-19)', () => {
    // Eine steile Linie: 10 m im Grundriss, 10 m Höhe — räumlich 14,14 m. Bis
    // hierher zählten „+"-Griff, Stützpunkt einfügen und Linie teilen räumlich,
    // die Geste „Ort auf der Achse zeigen" im Grundriss: Station 5 lag bei
    // 3,54 m statt 5 m.
    const STEIL = [[0, 100, 0], [10, 110, 0]];

    it('der „+"-Griff sitzt in der Mitte, und seine Station ist die halbe Weglänge im Grundriss', () => {
        const [k] = kantenVon(STEIL);
        expect(k.station).toBeCloseTo(5, 12);                       // vorher 7,07
        expect(k.laenge).toBeCloseTo(Math.hypot(10, 10), 12);        // angezeigt wird die räumliche Länge
    });

    it('Linie teilen bei Station 5: der Punkt liegt 5 m im Grundriss vom Anfang, auf halber Höhe', () => {
        const [eins, zwei] = teilePunktlisteAnStation(STEIL, 5);
        expect(eins.at(-1).map(v => Math.round(v * 1e9) / 1e9)).toEqual([5, 105, 0]);   // vorher (3,54 | 103,54)
        expect(zwei[0]).toEqual(eins.at(-1));
    });

    it('Stützpunkt einfügen an einer eigenen steilen Haltung: dort, wo die Geste zeigte', async () => {
        const b = useBearbeitung();
        await b.fuehreAus(kommando('ko-h', 'rohr-zeichnen', { neu: ['cde-S'], werte: { name: 'S', kategorie: 'IFCPIPESEGMENT', hoehe: '', dn: 300 },
            eingaben: { zug: [{ ost: 0, nord: 0, hoehe: 100 }, { ost: 10, nord: 0, hoehe: 110 }] } }));
        const ae = useAenderungen();
        const s = subjektAusStand('cde-S', { wirksamerStand: ae.wirksamerStand });
        const { station } = stationAuf({ punkte: s.achse.polyline }, { x: 5, z: 0.2 });
        expect(station).toBeCloseTo(5, 9);
        expect((await b.fuehreAus(kommando('ko-e', 'stuetzpunkt-einfuegen', { ziel: ['cde-S'], werte: { station } }))).grund).toBe(null);
        const punkte = ae.wirksamerStand('erzeugt').get('cde-S').parameter.punkte;
        expect(punkte).toHaveLength(3);
        expect(punkte[1][0]).toBeCloseTo(5, 9);                      // vorher 3,54
        expect(nachId('stuetzpunkt-einfuegen').vorbelegung(s).station).toBe(5);
    });
});

