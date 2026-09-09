/**
 * S8 — die fehlenden Griffe je Bauform (Teil XVI, 2026-09-08).
 *
 * Löschen (jede Bauform), Kopieren, Reihe, Drehen, Stützpunkt einfügen und
 * entfernen — alles reine Katalogeinträge, geprüft an `anwenden`. Kein neuer
 * Mechanismus: eigenes wandert im Bauplan (`erzeugt`, gleiche oder neue
 * GlobalId), Geliefertes wird ausgeblendet (`geloescht`).
 */
import { describe, expect, it } from 'vitest';
import { nachId, passende } from '../services/Bearbeitungen.js';
import { drehePunktliste, schwerpunktXZ } from '../services/Bauteilrezepte.js';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';

const b = (id) => nachId(id);
const EIGEN = (rezept, punkte, extra = {}) => ({
    globalId: 'cde1', modelId: 'cde-eigenbau', category: 'IFCPIPESEGMENT', name: 'R1',
    lageUmkehrbar: true, versatz: { x: 0, y: 0, z: 0 }, hoehenversatz: 0,
    stand: { bauplan: { rezept, kategorie: 'IFCPIPESEGMENT', name: 'R1', parameter: { punkte, dn: 300 } } },
    ...extra,
});

describe('Löschen — jede Bauform, geliefert wie eigen', () => {
    it('steht an jeder Bauform (auch netz), inklusive Gelände', () => {
        for (const bf of Object.keys(BAUFORMEN)) {
            expect(passende({ bauform: bf, guete: 'unbekannt' }).some(x => x.id === 'loeschen'), bf).toBe(true);
        }
    });
    it('schreibt einen geloescht-Eintrag, den der Aufrufer mit der Herkunft stempelt', () => {
        expect(b('loeschen').anwenden({ globalId: 'H1' })).toEqual({ art: 'geloescht', globalId: 'H1', nachher: true });
        expect(b('loeschen').anwenden({})).toBeNull();
    });
});

describe('Kopieren und Reihe — nur eigen, neuer Bauplan versetzt', () => {
    it('kopieren: neue GlobalId, verschobener Bauplan, „ Kopie" im Namen; unverändert → null', () => {
        const e = b('kopieren').anwenden(EIGEN('rohr', [[0, 1, 0], [5, 1, 0]]), { ost: 2, nord: -3, hoehe: 1 });
        expect(e).toMatchObject({ art: 'erzeugt', modell: 'cde', nachher: { name: 'R1 Kopie', rezept: 'rohr' } });
        expect(e.globalId).not.toBe('cde1');
        // Ost +2, Nord −3 → z +3, Höhe +1
        expect(e.nachher.parameter.punkte).toEqual([[2, 2, 3], [7, 2, 3]]);
        expect(b('kopieren').anwenden(EIGEN('rohr', [[0, 1, 0], [5, 1, 0]]), { ost: 0, nord: 0, hoehe: 0 })).toBeNull();
    });
    it('kopieren erscheint NUR an eigenen Bauteilen', () => {
        expect(passende({ bauform: 'achse+profil', guete: 'gemessen' }).some(x => x.id === 'kopieren')).toBe(false);
        expect(passende({ bauform: 'achse+profil', guete: 'gemessen' }, { eigenes: true }).some(x => x.id === 'kopieren')).toBe(true);
    });
    it('reihe: n Kopien in EINEM Vorgang (mehrteilig), je um den Abstand weiter', () => {
        const liste = b('reihe').anwenden(EIGEN('schacht', [[0, 0, 0], [0, 3, 0]]), { anzahl: 3, ost: 5, nord: 0 });
        expect(Array.isArray(liste)).toBe(true);
        expect(liste).toHaveLength(3);
        expect(liste[0].nachher.parameter.punkte[0]).toEqual([5, 0, 0]);
        expect(liste[2].nachher.parameter.punkte[0]).toEqual([15, 0, 0]);
        expect(new Set(liste.map(x => x.globalId)).size).toBe(3);
        expect(b('reihe').anwenden(EIGEN('schacht', [[0, 0, 0]]), { anzahl: 0, ost: 5, nord: 0 })).toBeNull();
    });
});

describe('Drehen — Bauplan in der Waagerechten', () => {
    it('schwerpunktXZ und drehePunktliste rechnen sauber; 90° dreht Ost→Nord um den Schwerpunkt', () => {
        const punkte = [[0, 1, 0], [4, 1, 0]];
        expect(schwerpunktXZ(punkte)).toEqual({ x: 2, z: 0 });
        const gedreht = drehePunktliste({ punkte }, 90).punkte;
        // um (2,0): (0,0)→(2,-2), (4,0)→(2,2); Höhe bleibt
        expect(gedreht[0][0]).toBeCloseTo(2); expect(gedreht[0][2]).toBeCloseTo(-2); expect(gedreht[0][1]).toBe(1);
        expect(gedreht[1][0]).toBeCloseTo(2); expect(gedreht[1][2]).toBeCloseTo(2);
    });
    it('als Katalogeintrag: erzeugt mit derselben GlobalId; 0°/360° → null', () => {
        const e = b('drehen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { winkel: 90 });
        expect(e).toMatchObject({ art: 'erzeugt', globalId: 'cde1' });
        expect(b('drehen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { winkel: 0 })).toBeNull();
        expect(b('drehen').anwenden(EIGEN('linie', [[0, 0, 0], [4, 0, 0]]), { winkel: 360 })).toBeNull();
    });
});

describe('Stützpunkt einfügen und entfernen', () => {
    it('einfügen bei Station 2,5 zwischen (0)-(5): ein Punkt mehr, an der richtigen Stelle', () => {
        const e = b('stuetzpunkt-einfuegen').anwenden(EIGEN('linie', [[0, 0, 0], [5, 0, 0]]), { station: 2.5 });
        expect(e.nachher.parameter.punkte).toEqual([[0, 0, 0], [2.5, 0, 0], [5, 0, 0]]);
        // Station 0 oder jenseits der Länge → null
        expect(b('stuetzpunkt-einfuegen').anwenden(EIGEN('linie', [[0, 0, 0], [5, 0, 0]]), { station: 0 })).toBeNull();
    });
    it('entfernen: der Index fällt; eine Linie behält 2, eine Fläche 3 Punkte', () => {
        const e = b('stuetzpunkt-entfernen').anwenden(EIGEN('linie', [[0, 0, 0], [2, 0, 0], [5, 0, 0]]), { index: 1 });
        expect(e.nachher.parameter.punkte).toEqual([[0, 0, 0], [5, 0, 0]]);
        // schon am Minimum → null
        expect(b('stuetzpunkt-entfernen').anwenden(EIGEN('linie', [[0, 0, 0], [5, 0, 0]]), { index: 0 })).toBeNull();
        const flaeche = EIGEN('flaeche', [[0, 0, 0], [4, 0, 0], [4, 0, 4]]);
        expect(b('stuetzpunkt-entfernen').anwenden(flaeche, { index: 0 })).toBeNull();
    });
    it('die Station ist eine Punkt-Geste, der Index ein Griff (eingaben-Vertrag)', () => {
        expect(nachId('stuetzpunkt-einfuegen').felder[0].aus).toMatchObject({ geste: 'punkt', auf: 'achse' });
        expect(nachId('stuetzpunkt-entfernen').felder[0].aus).toMatchObject({ geste: 'griff' });
    });
});
