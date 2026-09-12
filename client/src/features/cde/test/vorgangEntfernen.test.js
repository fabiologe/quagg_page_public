/**
 * Einen Erdbau-Vorgang entfernen (Abnahme 2026-09-12, A6).
 *
 * Fabio: „die Eigenbau-Sachen sind immer ersichtlich — können nicht
 * ausgeblendet oder gelöscht werden." Löschen am Aushub blendete nur den
 * Körper aus; die Grube steckte weiter in der Anzeige des Geländes, und der
 * geformte Boden blieb. Geprüft am echten Werkzeug (`graben-ausheben`) und an
 * der echten Faltung des Verlaufs (`standAus`). Die Grösse ist die Liste
 * `vorgaenge` der Anzeige — genau die, aus der der Aufbau die Grube formt.
 */
import { describe, expect, it } from 'vitest';
import { nachId } from '../services/Bearbeitungen.js';
import { erdbauStandVon, vorgangEntfernenSchritte } from '../services/Bauteilrezepte.js';
import { standAus } from '../stores/useAenderungen.js';

const GELAENDE = (extra = {}) => ({
    globalId: 'DGM-1', modelId: 'netz.ifc', localId: 42, name: 'Urgelände',
    hoehenversatz: 300, quellmass: { pruefmass: { triCount: 900, spanX: 200, spanY: 12, spanZ: 200 }, cell: 0.5 },
    ...extra,
});
const UMRISS = (x0, y = 4) => [{ x: x0, y, z: 0 }, { x: x0 + 10, y, z: 0 }, { x: x0 + 10, y, z: 10 }, { x: x0, y, z: 10 }];
const klammer = (liste) => liste.find(s => s.nachher?.rezept === 'erdbau').nachher.ableitung;
const anzeige = (stand) => [...stand.values()].find(w => w?.rezept === 'anzeige') ?? null;

/** Zwei Aushübe auf demselben Gelände — wie im Viewer: der zweite sieht den Erdbau-Stand des ersten. */
function zweiAushuebe() {
    const erster = nachId('graben-ausheben').anwenden(GELAENDE(), { mass: 2 }, { zug: UMRISS(0) });
    const zweiter = nachId('graben-ausheben').anwenden(
        GELAENDE({ erdbau: erdbauStandVon(standAus(erster, 'erzeugt'), 'DGM-1') }), { mass: 1 }, { zug: UMRISS(40) });
    return { verlauf: [...erster, ...zweiter], a: klammer(erster), b: klammer(zweiter) };
}

/** Entfernen wie der Viewer: aus dem wirksamen Stand beider Arten. */
const entferne = (verlauf, ableitung) => [...verlauf, ...vorgangEntfernenSchritte(
    standAus(verlauf, 'erzeugt'), ableitung, { geloescht: standAus(verlauf, 'geloescht') })];

describe('vorgangEntfernenSchritte', () => {
    it('die Ausgangslage: EINE Anzeige mit beiden Vorgängen, je zwei Teile', () => {
        const { verlauf, a, b } = zweiAushuebe();
        const stand = standAus(verlauf, 'erzeugt');
        expect(anzeige(stand).parameter.vorgaenge.map(v => v.ableitung)).toEqual([a, b]);
        expect([...stand.values()].filter(w => w.ableitung === a)).toHaveLength(2);
    });

    it('den ersten entfernen: seine Teile gehen, die Anzeige formt nur noch den zweiten', () => {
        const { verlauf, a, b } = zweiAushuebe();
        const danach = entferne(verlauf, a);
        const stand = standAus(danach, 'erzeugt');
        expect([...stand.values()].filter(w => w.ableitung === a)).toHaveLength(0);          // vorher 2
        expect(anzeige(stand).parameter.vorgaenge.map(v => v.ableitung)).toEqual([b]);      // die Grube von a: 1 → 0
        expect([...stand.values()].filter(w => w.ableitung === b)).toHaveLength(2);          // b bleibt ganz
        // Das Ur bleibt verborgen — die Anzeige steht noch dafür.
        expect(standAus(danach, 'geloescht').has('DGM-1')).toBe(true);
    });

    it('den letzten entfernen: die Anzeige geht, und das gelieferte Gelände steht wieder da', () => {
        const { verlauf, a, b } = zweiAushuebe();
        const alle = entferne(entferne(verlauf, a), b);
        expect(standAus(alle, 'erzeugt').size).toBe(0);
        expect(standAus(alle, 'geloescht').has('DGM-1')).toBe(false);                       // vorher verborgen
    });

    it('eine unbekannte Klammer schreibt nichts', () => {
        const { verlauf } = zweiAushuebe();
        expect(vorgangEntfernenSchritte(standAus(verlauf, 'erzeugt'), 'gibt-es-nicht')).toEqual([]);
    });
});
