/**
 * Tote Quellen (Fahrplan Erdbau-Container, Stufe 1) — der Fall aus Projekt 1337.
 *
 * Commit A legt eine Anzeige des Ur-Geländes an. Commit B nimmt sie zurück
 * (`erzeugt`, `nachher: null`). Commit C formt trotzdem auf ihr — die Szene
 * stand noch: eine neue Anzeige, ein Aushub und ein Auftrag nennen die
 * zurückgenommene Kennung als Gelände. Bis 2026-09-11 brach die Kette dort:
 * der Aushub war nie wieder ableitbar, „Erdbau registrieren" lehnte ab
 * („Wirt ohne Registerdokument"), und der Verbund liess ihn still weg.
 *
 * Gemessen wird dieselbe Grösse wie im Befund: ableitbar ja/nein, Wirt,
 * Stapel — vorher und nachher.
 */
import { describe, expect, it } from 'vitest';
import { historieAus, standAus } from '../stores/useAenderungen.js';
import { neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { erdbauStapelVon, pruefeBezuege, urGelaendeVon, verdraengteAnzeigen } from '../services/ableitung/Bezuege.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { wirtVon } from '../services/EigenbauPaket.js';
import { eigenbauDiagnose } from '../services/EigenbauDiagnose.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

function gelaende() {
    const h = (x, z) => 300 + 0.02 * x - 0.01 * z;
    const t = [];
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const holeQuellForm = async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster'
    ? rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1 }).ergebnis : null);
const GERINNE = { art: 'gerinne', parameter: {
    achse: [{ x: 5, z: 10 }, { x: 35, z: 10 }], sohlbreite: 2, boeschung: 1.5, sohleAnfang: 598, sohleEnde: 597.5,
} };

// Commit A: die Anzeige des Ur. Commit B: zurückgenommen. Commit C: auf der toten Kennung geformt.
const [alt] = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, name: 'Ur' });
const TOT = alt.globalId;
const vorgang = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: TOT }, raster: { cell: 1 },
                                     operationen: [GERINNE], name: 'Ur · Gerinne' });
const [neueAnzeige] = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: TOT }, raster: { cell: 1 }, name: 'Ur',
                                           vorgaenge: [{ ableitung: vorgang[0].nachher.ableitung }] });
const eintraege = [
    { art: 'erzeugt', globalId: TOT, nachher: alt.nachher },
    { art: 'erzeugt', globalId: TOT, nachher: null },
    ...[...vorgang, neueAnzeige].map(s => ({ art: 'erzeugt', globalId: s.globalId, nachher: s.nachher })),
];
const stand = standAus(eintraege, 'erzeugt');
const historie = historieAus(eintraege, 'erzeugt');
const aushub = vorgang.find(s => s.nachher.rolle === 'aushub');
const aufToterQuelle = [...vorgang, neueAnzeige].map(s => s.globalId).sort();

describe('Die Historie kennt, was der Stand vergessen hat', () => {
    it('zurückgenommen: im Stand weg, in der Historie mit dem letzten Bauplan', () => {
        expect(TOT.startsWith('cde-')).toBe(true);
        expect(stand.has(TOT)).toBe(false);
        expect(historie.get(TOT)).toEqual(alt.nachher);
        expect(aushub).toBeTruthy();
    });
});

describe('Die Kette zum Ur läuft durch Zurückgenommenes', () => {
    it('ohne Historie bleibt die tote Kennung „Ur" — mit Historie ist es das gelieferte Gelände', () => {
        expect(urGelaendeVon(stand, TOT, { rezeptNach })).toBe(TOT);
        expect(urGelaendeVon(stand, TOT, { rezeptNach, historie })).toBe('DGM1');
    });

    it('der Vorgang gehört wieder in den Stapel des Ur, die neue Anzeige ist dessen Anzeige', () => {
        expect(erdbauStapelVon(stand, 'DGM1', { rezeptNach }).vorgaenge).toHaveLength(0);
        const mit = erdbauStapelVon(stand, 'DGM1', { rezeptNach, historie });
        expect(mit.vorgaenge.map(v => v.ableitung)).toEqual([aushub.nachher.ableitung]);
        expect(mit.anzeige?.globalId).toBe(neueAnzeige.globalId);
    });

    it('der Aushub ist wieder ableitbar — ohne Historie „nicht ableitbar"', async () => {
        const lauf = (h) => neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(),
                                                 hoehenversatz: 300, historie: h });
        const vorher = await lauf(null).baue(aushub.globalId);
        expect(vorher.ok).toBe(false);
        expect((vorher.fehler ?? []).join(' ')).toMatch(/nicht ableitbar/);
        const nachher = await lauf(historie).baue(aushub.globalId);
        expect(nachher.ok).toBe(true);
        expect(nachher.leer).toBeFalsy();
    });

    it('der Wirt im Paket ist das Ur, nicht die tote Kennung', () => {
        expect(wirtVon(aushub.nachher, stand, new Set())).toBe(TOT);
        expect(wirtVon(aushub.nachher, stand, new Set(), historie)).toBe('DGM1');
    });
});

describe('Eine Anzeige je Gelände', () => {
    it('eine Anzeige, die das Ur direkt nennt, verdrängt die über die Kette — allein wird keine verdrängt', () => {
        const [direkt] = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 1 }, name: 'Ur' });
        const mitDirekt = new Map([...stand, [direkt.globalId, direkt.nachher]]);
        expect([...verdraengteAnzeigen(mitDirekt, { rezeptNach, historie })]).toEqual([[neueAnzeige.globalId, direkt.globalId]]);
        expect(verdraengteAnzeigen(stand, { rezeptNach, historie }).size).toBe(0);
    });
});

describe('Eingetragen wird nur, was auf das Ur zeigt', () => {
    it('zurückgenommene Quelle und Anzeigeform werden abgewiesen, das Ur nicht', () => {
        const pruefe = (gelaende) => pruefeBezuege({ quellen: { gelaende }, globalId: 'cde-neu', stand, historie, rezeptNach });
        expect(pruefe(TOT).join(' ')).toMatch(/zurückgenommen/);
        expect(pruefe(neueAnzeige.globalId).join(' ')).toMatch(/Anzeigeform/);
        expect(pruefe('DGM1')).toEqual([]);
    });
});

describe('Die Diagnose vor dem Verbund', () => {
    it('jeder Plan auf der toten Quelle ist lösbar — ohne Historie wäre keiner es', () => {
        const d = eigenbauDiagnose({ stand, historie, rezeptNach });
        expect(d.toteQuellen.map(t => t.globalId).sort()).toEqual(aufToterQuelle);
        expect(d.toteQuellen.every(t => t.loesbar && t.ur === 'DGM1')).toBe(true);
        expect(d.unloesbar).toEqual([]);
        expect(eigenbauDiagnose({ stand, rezeptNach }).unloesbar).toHaveLength(aufToterQuelle.length);
    });

    it('Ausgeblendetes zählt nicht', () => {
        expect(eigenbauDiagnose({ stand, rezeptNach, verdeckt: new Set(aufToterQuelle) }).toteQuellen).toEqual([]);
    });
});
