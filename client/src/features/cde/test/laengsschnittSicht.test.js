/**
 * LaengsschnittSicht (Stufe 17.1) — Stationierung + geforderte Sohle.
 */
import { describe, expect, it } from 'vitest';
import { baueSicht, hoeheBei, griffe, sohlZugEintraege, neuePunkteFuerZug, cdeZugEintraege } from '../services/LaengsschnittSicht.js';

const STRANG = [
    { globalId: 'H1', name: 'H1', dn: 300,
      anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9, z: 0 } },
    { globalId: 'H2', name: 'H2', dn: 300,
      anfang: { x: 50, y: 9, z: 0 }, ende: { x: 50, y: 8, z: 30 } },
];

describe('Die Stationierung', () => {
    it('läuft waagerecht und in Fliessrichtung — Höhen in NN', () => {
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300 });
        expect(s.segmente[0].s0).toBe(0);
        expect(s.segmente[0].s1).toBeCloseTo(50, 6);
        expect(s.segmente[1].s1).toBeCloseTo(80, 6);
        expect(s.gesamt).toBeCloseTo(80, 6);
        expect(s.segmente[0].geliefert).toEqual({ hA: 310, hE: 309 });
        expect(s.hMin).toBe(308);
        expect(s.hMax).toBe(310);
    });

    it('das Gefälle rechnet gegen die WAAGERECHTE Länge — wie der Befund', () => {
        const s = baueSicht({ strang: STRANG, hoehenversatz: 0 });
        expect(s.segmente[0].gefaellePromille).toBeCloseTo(20, 6);
    });

    it('jede Stranggrenze ist ein Knoten — der letzte trägt das Ende', () => {
        const s = baueSicht({ strang: STRANG, hoehenversatz: 0 });
        expect(s.knoten.map(k => k.s)).toEqual([0, 50, 80]);
        expect(s.knoten.at(-1).ende).toBe(true);
    });

    it('leer oder kaputt: null, kein Wurf', () => {
        expect(baueSicht({ strang: [] })).toBeNull();
        expect(baueSicht({})).toBeNull();
    });
});

describe('Die geforderte Sohle', () => {
    it('kommt aus dem parametrik-Stand — nur wo eine Forderung steht', () => {
        const stand = new Map([['H1', { sohlhoeheAnfang: 311, sohlhoeheEnde: 309.5 }]]);
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300, parametrikStand: stand });
        expect(s.segmente[0].gefordert).toEqual({ hA: 311, hE: 309.5 });
        expect(s.segmente[1].gefordert).toBeNull();
        expect(s.hMax).toBe(311);                       // die Forderung dehnt den Rahmen
    });

    it('eine halbe Forderung erbt die andere Hälfte aus der Lieferung', () => {
        const stand = new Map([['H1', { sohlhoeheEnde: 308.5 }]]);
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300, parametrikStand: stand });
        expect(s.segmente[0].gefordert).toEqual({ hA: 310, hE: 308.5 });
    });

    it('eine DN-Forderung allein ist KEINE Sohlforderung', () => {
        const stand = new Map([['H1', { profilGroesse: 400 }]]);
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300, parametrikStand: stand });
        expect(s.segmente[0].gefordert).toBeNull();
    });
});

describe('hoeheBei', () => {
    it('interpoliert linear im Segment', () => {
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300 });
        expect(hoeheBei(s, 25)).toBeCloseTo(309.5, 6);
        expect(hoeheBei(s, 65)).toBeCloseTo(308.5, 6);
        expect(hoeheBei(s, 999)).toBeNull();
    });
});

describe('Die Griffe (17.2)', () => {
    it('koinzidente Enden am Schacht werden EIN Griff — der Normalfall', () => {
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300 });
        const g = griffe(s);
        // 4 Segment-Enden, aber am gemeinsamen Schacht (St. 50, 309) EIN Griff.
        expect(g).toHaveLength(3);
        const mitte = g.find(x => Math.abs(x.station - 50) < 1e-6);
        expect(mitte.enden).toEqual([
            { globalId: 'H1', ende: 'E' }, { globalId: 'H2', ende: 'A' },
        ]);
    });

    it('ein ABSTURZ behält zwei Griffe — Verschmelzen ebnete ihn ein', () => {
        const absturz = [
            STRANG[0],
            { ...STRANG[1], anfang: { x: 50, y: 8.5, z: 0 } },   // 0,5 m Sprung
        ];
        const g = griffe(baueSicht({ strang: absturz, hoehenversatz: 300 }));
        expect(g.filter(x => Math.abs(x.station - 50) < 1e-6)).toHaveLength(2);
    });

    it('gegriffen wird die WIRKSAME Sohle — die Forderung, wo eine steht', () => {
        const stand = new Map([['H1', { sohlhoeheEnde: 308.5 }]]);
        const g = griffe(baueSicht({ strang: STRANG, hoehenversatz: 300, parametrikStand: stand }));
        // Das geforderte Ende (308,5) liegt nicht mehr auf dem gelieferten
        // Anfang von H2 (309) — zwei Griffe, ehrlich.
        const beiFuffzig = g.filter(x => Math.abs(x.station - 50) < 1e-6);
        expect(beiFuffzig).toHaveLength(2);
        expect(beiFuffzig.map(x => x.hoehe).sort()).toEqual([308.5, 309]);
    });
});

describe('Die Einträge eines Griff-Zugs', () => {
    it('je Segment EINE volle Rollen-Karte — das andere Ende behält die wirksame Höhe', () => {
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300 });
        const e = sohlZugEintraege(s,
            [{ globalId: 'H1', ende: 'E' }, { globalId: 'H2', ende: 'A' }], 308.75);
        expect(e).toEqual([
            { art: 'parametrik', globalId: 'H1',
              nachher: { sohlhoeheAnfang: 310, sohlhoeheEnde: 308.75 } },
            { art: 'parametrik', globalId: 'H2',
              nachher: { sohlhoeheAnfang: 308.75, sohlhoeheEnde: 308 } },
        ]);
    });

    it('baut auf der FORDERUNG auf, wo eine steht — nicht auf der Lieferung', () => {
        const stand = new Map([['H1', { sohlhoeheAnfang: 311, sohlhoeheEnde: 309.5 }]]);
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300, parametrikStand: stand });
        const e = sohlZugEintraege(s, [{ globalId: 'H1', ende: 'E' }], 309);
        expect(e[0].nachher).toEqual({ sohlhoeheAnfang: 311, sohlhoeheEnde: 309 });
    });

    it('unbekanntes Segment oder kaputte Höhe: nichts, kein Wurf', () => {
        const s = baueSicht({ strang: STRANG, hoehenversatz: 300 });
        expect(sohlZugEintraege(s, [{ globalId: 'X', ende: 'A' }], 300)).toEqual([]);
        expect(sohlZugEintraege(s, [{ globalId: 'H1', ende: 'A' }], NaN)).toEqual([]);
    });
});

describe('neuePunkteFuerZug — Eigenes = echt (17.3b)', () => {
    const PUNKTE = [[0, 10, 0], [30, 9.4, 0], [50, 9, 0]];

    it('das gezogene Ende bekommt die Höhe, die Zwischenhöhen folgen der Strecke', () => {
        const neu = neuePunkteFuerZug(PUNKTE, 'E', 8);
        expect(neu[0]).toEqual([0, 10, 0]);
        expect(neu[2]).toEqual([50, 8, 0]);
        // Zwischenpunkt bei 60 % der Länge: 10 − 0,6·2 = 8,8.
        expect(neu[1][1]).toBeCloseTo(8.8, 6);
        expect(neu[1][0]).toBe(30);                        // der Grundriss bleibt
    });

    it('auch der Anfang lässt sich ziehen', () => {
        const neu = neuePunkteFuerZug(PUNKTE, 'A', 12);
        expect(neu[0][1]).toBe(12);
        expect(neu[2][1]).toBe(9);
    });

    it('kaputte Eingaben: null, kein Wurf', () => {
        expect(neuePunkteFuerZug([[0, 0, 0]], 'A', 5)).toBeNull();
        expect(neuePunkteFuerZug(PUNKTE, 'A', NaN)).toBeNull();
        expect(neuePunkteFuerZug(null, 'A', 5)).toBeNull();
    });
});

describe('cdeZugEintraege — der Bauplan wird fortgeschrieben (17.3b)', () => {
    const BAUPLAN = {
        rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H2.1', bauform: 'achse+profil',
        parameter: { punkte: [[50, 9, 0], [100, 8, 0]], dn: 300 },
    };
    const opts = { bauplanVon: (gid) => (gid === 'cde-a' ? BAUPLAN : undefined), hoehenversatz: 300 };

    it('neuer erzeugt-Eintrag: gleiche Kennung, gleiche Parameter, neue Höhen in WELT', () => {
        const [e] = cdeZugEintraege([{ globalId: 'cde-a', ende: 'E' }], 307.5, opts);
        expect(e.art).toBe('erzeugt');
        expect(e.globalId).toBe('cde-a');
        expect(e.modell).toBe('cde');
        expect(e.nachher.name).toBe('H2.1');
        expect(e.nachher.parameter.dn).toBe(300);
        // 307,5 m NN − 300 m Versatz = Welt-Y 7,5 am gezogenen Ende.
        expect(e.nachher.parameter.punkte).toEqual([[50, 9, 0], [100, 7.5, 0]]);
    });

    it('nur Rohre — ein fremder oder fehlender Bauplan wird übersprungen', () => {
        expect(cdeZugEintraege([{ globalId: 'cde-x', ende: 'A' }], 307, opts)).toEqual([]);
        const schacht = { ...opts, bauplanVon: () => ({ rezept: 'schacht', parameter: { punkte: [[0, 0, 0], [0, 3, 0]] } }) };
        expect(cdeZugEintraege([{ globalId: 'cde-s', ende: 'A' }], 307, schacht)).toEqual([]);
    });

    it('kaputte Höhe: nichts, kein Wurf', () => {
        expect(cdeZugEintraege([{ globalId: 'cde-a', ende: 'A' }], NaN, opts)).toEqual([]);
    });
});

