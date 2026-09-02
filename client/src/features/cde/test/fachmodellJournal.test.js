/**
 * Das Fachmodell kennt den Journalstand (Stufe 17.3).
 *
 * Das Loch: Netz, Strang, Anschlüsse, Prüfliste und Mengen kamen NUR aus
 * der IfcQuelle — ein geteiltes Rohr verschwand aus dem Fachmodell, und die
 * ausgeblendete Alt-Haltung stand als Geist weiter darin (seit 14.3!).
 *
 * Getestet wird die ECHTE Engine-Logik über `prototype.call` mit einem
 * handgebauten `this` — keine Attrappe, die die eigene Annahme spiegelt
 * (Gesetz 9): dieselben Methodenkörper, die die Produktion ausführt.
 */
import { describe, expect, it } from 'vitest';
import { IfcEngine } from '../services/IfcEngine.js';
import { cdeAchsenAus, verdeckteAus } from '../services/CdeAchsen.js';

/** Geliefert: S0 —H1→ S1 —H2→ S2, alles koinzident. */
function geliefertesThis() {
    const achsen = new Map([
        [1, { globalId: 'H1', name: 'H1', kategorie: 'IFCPIPESEGMENT',
              anfang: { x: 0, y: 10, z: 0 }, ende: { x: 50, y: 9, z: 0 }, laenge: 50, dn: 300 }],
        [2, { globalId: 'H2', name: 'H2', kategorie: 'IFCPIPESEGMENT',
              anfang: { x: 50, y: 9, z: 0 }, ende: { x: 100, y: 8, z: 0 }, laenge: 50, dn: 300 }],
    ]);
    const knoten = new Map([
        [10, { punkt: { x: 0, y: 10, z: 0 }, globalId: 'S0', name: 'S0' }],
        [11, { punkt: { x: 50, y: 9, z: 0 }, globalId: 'S1', name: 'S1' }],
        [12, { punkt: { x: 100, y: 8, z: 0 }, globalId: 'S2', name: 'S2' }],
    ]);
    return {
        _achsen: new Map([['m1', achsen]]),
        _knoten: new Map([['m1', knoten]]),
        _merkmale: new Map(),
        achsenVon: IfcEngine.prototype.achsenVon,
        achseVon: IfcEngine.prototype.achseVon,
        netzVon: IfcEngine.prototype.netzVon,
        quelleVon: () => null,
        merkmaleAlle: () => new Map(),
    };
}

/** Journal: H2 geteilt — H2 verdeckt, zwei CDE-Rohre + ein Schacht dazwischen. */
function teilungsStand() {
    const erzeugt = new Map([
        ['cde-a', { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H2.1',
                    parameter: { punkte: [[50, 9, 0], [75, 8.5, 0]], dn: 300 } }],
        ['cde-b', { rezept: 'rohr', kategorie: 'IFCPIPESEGMENT', name: 'H2.2',
                    parameter: { punkte: [[75, 8.5, 0], [100, 8, 0]], dn: 300 } }],
        ['cde-s', { rezept: 'schacht', name: 'S-neu',
                    parameter: { punkte: [[75, 8.5, 0], [75, 11, 0]], dn: 1000 } }],
    ]);
    const geloescht = new Map([['H2', true]]);
    return { erzeugt, geloescht };
}

function mitJournal(dies, { erzeugt, geloescht }) {
    IfcEngine.prototype.setzeJournalStand.call(dies, {
        ...cdeAchsenAus(erzeugt),
        verdeckt: verdeckteAus(geloescht),
    });
    return dies;
}

describe('CdeAchsen — Journal → Fachmodell-Daten', () => {
    it('Rohre werden Kanten, Schächte Knoten — Linien und Gelände nicht', () => {
        const { erzeugt } = teilungsStand();
        erzeugt.set('cde-l', { rezept: 'linie', parameter: { punkte: [[0, 0, 0], [9, 0, 0]] } });
        erzeugt.set('cde-g', { rezept: 'gelaende', parameter: { quelle: 'X', operationen: [] } });
        const { kanten, knoten } = cdeAchsenAus(erzeugt);
        expect(kanten.map(k => k.globalId)).toEqual(['cde-a', 'cde-b']);
        expect(knoten.map(k => k.globalId)).toEqual(['cde-s']);
        expect(kanten[0].anfang).toEqual({ x: 50, y: 9, z: 0 });
        expect(kanten[0].dn).toBe(300);
    });
});

describe('Das Netz mit Journalstand', () => {
    it('OHNE Journal: das nackte Geliefert', () => {
        const netz = geliefertesThis().netzVon('m1');
        expect(netz.kanten.size).toBe(2);
        expect(netz.knoten.size).toBe(3);
    });

    it('nach dem Teilen: der GEIST ist raus, die neuen Rohre sind DRIN — geschlossen', () => {
        const dies = mitJournal(geliefertesThis(), teilungsStand());
        const netz = dies.netzVon('m1');
        expect(netz.kanten.has(2)).toBe(false);              // H2 verdeckt
        expect(netz.kanten.has('cde:cde-a')).toBe(true);
        expect(netz.kanten.has('cde:cde-b')).toBe(true);
        expect(netz.knoten.has('cde:cde-s')).toBe(true);
        // Die Koinzidenz schliesst das Netz von selbst: keine losen Enden.
        expect(netz.loseEnden).toHaveLength(0);
        expect(netz.ohneAnschluss).toHaveLength(0);
    });

    it('der STRANG läuft durch die CDE-Rohre hindurch — mit Namen und Kennung', () => {
        const dies = mitJournal(geliefertesThis(), teilungsStand());
        dies.strangVon = IfcEngine.prototype.strangVon;
        const strang = dies.strangVon('m1', 1);
        expect(strang.map(k => k.globalId)).toEqual(['H1', 'cde-a', 'cde-b']);
        expect(strang[1].name).toBe('H2.1');
        expect(strang[1].dn).toBe(300);
    });

    it('die ANSCHLÜSSE eines CDE-Schachts kennen beide Seiten', () => {
        const dies = mitJournal(geliefertesThis(), teilungsStand());
        dies.anschluesseVon = IfcEngine.prototype.anschluesseVon;
        const anschluesse = dies.anschluesseVon('m1', 'cde:cde-s');
        expect(anschluesse.map(a => [a.globalId, a.ende]).sort()).toEqual([
            ['cde-a', 'ende'], ['cde-b', 'anfang'],
        ]);
    });

    it('schachtPunkteVon führt den neuen Schacht und lässt Verdecktes weg', () => {
        const stand = teilungsStand();
        stand.geloescht.set('S1', true);                    // auch ein Schacht verdeckt
        const dies = mitJournal(geliefertesThis(), stand);
        dies.schachtPunkteVon = IfcEngine.prototype.schachtPunkteVon;
        const karte = dies.schachtPunkteVon('m1');
        expect(karte.has('cde-s')).toBe(true);
        expect(karte.has('S1')).toBe(false);
        expect(karte.get('cde-s')).toEqual({ x: 75, y: 8.5, z: 0, name: 'S-neu' });
    });

    it('mengenGrundlage: der Geist zählt nicht, die neuen Rohre schon', () => {
        const dies = mitJournal(geliefertesThis(), teilungsStand());
        dies.mengenGrundlage = IfcEngine.prototype.mengenGrundlage;
        const ids = dies.mengenGrundlage().map(b => b.globalId).sort();
        expect(ids).toEqual(['H1', 'cde-a', 'cde-b']);
    });
});

describe('Die Prüfliste mit Journalstand', () => {
    it('verdeckte Bauteile prüfen NICHT mit — CDE-Rohre durch dieselben Regeln', () => {
        const stand = teilungsStand();
        // Das neue Rohr cde-a bekommt ein Gegengefälle — es soll denselben
        // Befund tragen wie ein geliefertes.
        stand.erzeugt.get('cde-a').parameter.punkte = [[50, 8, 0], [75, 8.5, 0]];
        const dies = mitJournal(geliefertesThis(), stand);
        dies.pruefeAlles = IfcEngine.prototype.pruefeAlles;
        const liste = dies.pruefeAlles({});
        const je = new Map(liste.map(e => [e.globalId, e.befunde.map(b => b.regel)]));
        expect(je.get('cde-a')).toContain('gefaelle_gegen');
        expect(je.has('H2')).toBe(false);                   // der Geist schweigt
    });
});
