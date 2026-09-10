// @vitest-environment jsdom
/**
 * Stufe 0 des Aushub-Fachmodells — die Sofortkuren (2026-09-10).
 *
 * Der Anlass war ein Bild: zwei Gelände übereinander, ein „TEST-Erdkoerper
 * (geformt)" mit CDE-Kennung als TERRAIN neben dem gelieferten. Vier Befunde,
 * vier Kuren — und jede misst hier die Größe, die der Befund behauptet hat:
 *
 *   D1  ein verborgenes eigenes DGM stand als `geliefert` im Journal
 *       → `modell` kommt aus der Kennung, an EINER Stelle
 *   D2  zwei Faltungen von „verdeckt", die sich widersprachen
 *       → eine Faltung in CdeAchsen, der Autor ruft sie
 *   D3  ein zweiter Aushub am wieder eingeblendeten Ur-Gelände klonte die
 *       Ableitung (zweite Klammer, doppelte Massen)
 *       → Wächter über die Quelle, Folgeformung statt Klon
 *   D6  das Eigenbau-Modell hiess in der Leiste „cde-eigenbau"
 *       → „Eigenbau · n Bauteile", kein Entladen-Knopf
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { nachId } from '../services/Bearbeitungen.js';
import { ableitungAuf, istAnzeigeform, istEigen, modellVon } from '../services/Bauteilrezepte.js';
import { istVerdeckt, verdeckteAus } from '../services/CdeAchsen.js';
import { planeNachspielen } from '../services/Nachspielen.js';
import { modellTagText } from '../services/IfcAutor.js';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useBearbeitung().modusSetzen(true);
});

const UR = {
    modelId: 'm1', localId: 7, category: 'IFCGEOGRAPHICELEMENT',
    globalId: 'DGM1', name: 'Urgelände', hoehenversatz: 300,
    anker: { x: 10, y: 10, z: 10 }, bezugshoehe: 10, oberkante: 12,
    quellmass: { pruefmass: { triCount: 800, spanX: 40, spanY: 2, spanZ: 40 }, cell: 0.5 },
};
const ZUG = [{ x: 0, z: 10 }, { x: 20, z: 10 }];
const UMRISS = [{ x: 5, z: 5 }, { x: 15, z: 5 }, { x: 15, z: 15 }, { x: 5, z: 15 }];

function erstformung() {
    return nachId('gerinne-einschneiden').anwenden(
        UR, { sohleAnfang: 8, sohleEnde: 6, sohlbreite: 2, boeschung: 1 }, { zug: ZUG });
}

/** Der dgm-Teil einer Bauwerksgrube als Subjekt — ein EIGENES Gelände, dessen Rezept nicht `erdbau` ist. */
function grubenDgm() {
    return {
        ...UR, modelId: 'cde-eigenbau', globalId: 'cde-grube-dgm', name: 'Urgelände (mit Baugrube)',
        stand: {
            bauplan: {
                rezept: 'bauwerksgrube', rolle: 'dgm', ableitung: 'ab-grube', kategorie: 'IFCGEOGRAPHICELEMENT',
                predefinedType: 'TERRAIN', name: 'Urgelände (mit Baugrube)', bauform: 'hoehenfeld',
                parameter: { quellen: { gelaende: 'DGM1', bauteil: 'FK1' }, quellBasis: {}, raster: { cell: 0.5 }, operationen: [] },
            },
        },
    };
}

describe('D1 — modell kommt aus der Kennung, an einer Stelle', () => {
    it('modellVon / istEigen: cde-… ist eigen, alles andere geliefert', () => {
        expect(modellVon('cde-mtvbvbli-6wax23q0')).toBe('cde');
        expect(modellVon('2TestDGM0000000000TEST')).toBe('geliefert');
        expect(modellVon(null)).toBe('geliefert');
        expect(istEigen({ globalId: 'cde-x' })).toBe(true);                     // Beweis
        expect(istEigen({ globalId: 'H1', modell: 'cde' })).toBe(true);         // Aussage
        expect(istEigen({ globalId: 'H1', modell: 'geliefert' })).toBe(false);
        expect(istEigen({ globalId: 'cde-x', modell: 'geliefert' })).toBe(true); // die Kennung heilt die falsche Aussage
    });

    it('das Ausblenden eines eigenen DGM-Teils (Grube/Graben) sagt `modell: cde` — wie Grube und Aussparung', () => {
        const s = nachId('planum-herstellen').anwenden(grubenDgm(), { hoehe: 8 }, { zug: UMRISS });
        expect(s[0]).toEqual({ art: 'geloescht', globalId: 'cde-grube-dgm', nachher: true, modell: 'cde' });
        // und das gelieferte Ur-Gelände bleibt OHNE `modell` (e1Erdbau-Vertrag)
        expect(erstformung()[0]).toEqual({ art: 'geloescht', globalId: 'DGM1', nachher: true });
    });

    it('der Zeichenweg ohne `modell`-Angabe landet trotzdem richtig im Journal', async () => {
        // `useEingabe` reicht kein `modell` an `ausfuehren`; `eintragen` fiel
        // bis Stufe 0 auf 'geliefert'. Jetzt entscheidet die Kennung.
        const ae = useAenderungen();
        const eigen = await ae.eintragen({ art: 'geloescht', globalId: 'cde-grube-dgm', nachher: true, wer: 'Fabio' });
        const fremd = await ae.eintragen({ art: 'geloescht', globalId: 'DGM1', nachher: true, wer: 'Fabio' });
        expect(eigen.modell).toBe('cde');
        expect(fremd.modell).toBe('geliefert');
        // eine ausdrückliche Angabe gewinnt weiterhin
        const gesagt = await ae.eintragen({ art: 'lage', globalId: 'H9', nachher: { x: 1, y: 2, z: 3 }, modell: 'geliefert', wer: 'Fabio' });
        expect(gesagt.modell).toBe('geliefert');
    });

    it('das Nachspielen sucht ein eigenes DGM nie im Lieferstand — auch aus einem Journal ohne Aussage', () => {
        const alt = [{ id: 'e1', art: 'geloescht', globalId: 'cde-grube-dgm', nachher: true, modell: 'geliefert', wer: 'Fabio', wann: 1 }];
        const plan = planeNachspielen(alt, () => undefined, { arten: ['geloescht'] });
        expect(plan.konflikte).toHaveLength(0);
        expect(plan.anzuwenden.map(a => [a.globalId, a.modell])).toEqual([['cde-grube-dgm', 'cde']]);
    });
});

describe('D2 — eine Faltung „verdeckt"', () => {
    it('Stand-Karte und Plan-Schritte geben dieselbe Antwort; `nur` trennt eigen von geliefert', () => {
        const stand = new Map([['DGM1', true], ['cde-grube-dgm', true], ['cde-frei', false]]);
        const schritte = [
            { art: 'geloescht', globalId: 'DGM1', wert: true },
            { art: 'geloescht', globalId: 'cde-grube-dgm', wert: true },          // ohne modell — die Kennung zählt
            { art: 'geloescht', globalId: 'cde-frei', wert: false },
            { art: 'erzeugt', globalId: 'cde-neu', wert: {} },
        ];
        expect([...verdeckteAus(stand)].sort()).toEqual(['DGM1', 'cde-grube-dgm']);
        expect([...verdeckteAus(schritte)].sort()).toEqual(['DGM1', 'cde-grube-dgm']);
        const eigene = verdeckteAus(schritte, { nur: 'cde' });
        expect([...eigene]).toEqual(['cde-grube-dgm']);
        for (const gid of eigene) expect(verdeckteAus(stand).has(gid)).toBe(true);   // ⊆
        expect([...verdeckteAus(stand, { nur: 'geliefert' })]).toEqual(['DGM1']);
        expect(istVerdeckt({ art: 'geloescht', nachher: true })).toBe(true);
        expect(istVerdeckt({ art: 'geloescht', nachher: null })).toBe(false);
    });
});

describe('D3 — zweiter Aushub am wieder eingeblendeten Ur-Gelände: Folgeformung, kein Klon', () => {
    it('ableitungAuf findet die Ableitung über ihre QUELLE', async () => {
        const ae = useAenderungen();
        for (const e of erstformung()) await ae.eintragen({ ...e, wer: 'Fabio' });
        const v = ableitungAuf(ae.wirksamerStand('erzeugt'), 'DGM1');
        expect(v?.ableitung).toMatch(/^ab-/);
        expect([...v.teile.keys()].sort()).toEqual(['auftrag', 'aushub', 'dgm']);
        expect(ableitungAuf(ae.wirksamerStand('erzeugt'), 'ANDERES')).toBe(null);
    });

    it('dieselben drei GlobalIds, eine Klammer, ein geloescht, volle Liste', async () => {
        const ae = useAenderungen();
        const erst = erstformung();
        for (const e of erst) await ae.eintragen({ ...e, wer: 'Fabio' });

        // Das Ur-Gelände wird wieder angefasst — die Anreicherung hängt die
        // vorhandene Ableitung an, wie IfcViewer es tut.
        const ur = { ...UR, ableitungAufMir: ableitungAuf(ae.wirksamerStand('erzeugt'), 'DGM1') };
        const zweite = nachId('planum-herstellen').anwenden(ur, { hoehe: 8 }, { zug: UMRISS });
        for (const e of zweite) await ae.eintragen({ ...e, wer: 'Fabio' });

        const erzeugt = ae.wirksamerStand('erzeugt');
        expect(erzeugt.size).toBe(3);                                                // kein Klon
        expect(new Set([...erzeugt.values()].map(p => p.ableitung)).size).toBe(1);   // eine Klammer
        expect(ae.wirksamerStand('geloescht').size).toBe(1);                         // ein geloescht
        expect(zweite.filter(s => s.art === 'erzeugt').map(s => s.globalId).sort())
            .toEqual(erst.filter(s => s.art === 'erzeugt').map(s => s.globalId).sort());
        const ops = erzeugt.get(erst[3].globalId).parameter.operationen.map(o => o.art);
        expect(ops).toEqual(['gerinne', 'planum']);                                  // Liste +1, absolut
        expect(erzeugt.get(erst[3].globalId).parameter.quellen.gelaende).toBe('DGM1');
        // erdbau-Ableitungen auf dem Ur-Gelände: genau eine
        expect([...erzeugt.values()].filter(p => p.rezept === 'erdbau' && p.parameter.quellen.gelaende === 'DGM1'
            && p.rolle === 'dgm')).toHaveLength(1);
    });

    it('ohne Anreicherung bleibt die Erstformung die Erstformung (kein stiller Wächter im Katalog)', () => {
        const s = nachId('planum-herstellen').anwenden(UR, { hoehe: 8 }, { zug: UMRISS });
        expect(s).toHaveLength(4);
        expect(s[0]).toEqual({ art: 'geloescht', globalId: 'DGM1', nachher: true });
    });
});

describe('D6 / Anzeigeform', () => {
    it('der Chip nennt den Eigenbau beim Namen', () => {
        expect(modellTagText({ modelId: 'cde-eigenbau', name: 'cde-eigenbau' }, 3)).toBe('Eigenbau · 3 Bauteile');
        expect(modellTagText({ modelId: 'cde-eigenbau', name: 'cde-eigenbau' }, 1)).toBe('Eigenbau · 1 Bauteil');
        expect(modellTagText({ modelId: 'm1', name: 'Kanal_R01.ifc' }, 3)).toBe('Kanal_R01.ifc');
    });

    it('istAnzeigeform: der dgm-Teil einer Ableitung ja, Cut/Fill/Altbestand nein', () => {
        const erst = erstformung();
        const teil = (rolle) => erst.find(s => s.nachher?.rolle === rolle).nachher;
        expect(istAnzeigeform(teil('dgm'))).toBe(true);
        expect(istAnzeigeform(teil('aushub'))).toBe(false);
        expect(istAnzeigeform(teil('auftrag'))).toBe(false);
        expect(istAnzeigeform({ rezept: 'gelaende', parameter: { quelle: 'DGM1' } })).toBe(false);
        expect(istAnzeigeform({ rezept: 'erdbau', rolle: 'anzeige' })).toBe(true);   // Stufe 1
        expect(istAnzeigeform(null)).toBe(false);
    });
});
