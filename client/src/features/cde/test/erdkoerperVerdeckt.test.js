/**
 * Welcher Erdbau-Vorgang wird von einem späteren überdeckt? (Teil XXI, E3)
 *
 * Fabio 2026-09-17: nach einer Auffüllung stehen Aushub, Auffüllung und Netz
 * übereinander, „wodurch es zittert und überlappt und unklar wird, was was
 * ist". Seine Entscheidung: im Raum steht der JÜNGERE Vorgang; ein älterer,
 * den ein späterer wieder überformt hat, kommt nur über sein Auge zurück.
 * Die MENGEN bleiben beide — verdeckt heisst nicht ungültig.
 *
 * Gemessen wird die Regel selbst: die Wirkfläche eines Vorgangs sind die
 * Knoten, an denen ER das Gelände geändert hat; ein späterer verdeckt ihn,
 * wenn er mehr als die Hälfte davon erneut ändert.
 */
import { describe, expect, it } from 'vitest';
import { VERDECKT_AB, neuerAbleitungslauf } from '../services/ableitung/Ableitungslauf.js';
import { ableitungsSchritte, rezeptNach } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

function gelaende() {
    const h = (x, z) => 300 + 0.02 * x - 0.01 * z;
    const t = [];
    for (let x = 0; x < 60; x++) for (let z = 0; z < 60; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}
const NETZ = gelaende();
const hNn = (x, z) => 600 + 0.02 * x - 0.01 * z;

const holeQuellForm = async (gid, form, opts = {}) => (gid === 'DGM1' && form === 'raster'
    ? rasterAusMesh({ mesh: NETZ }, { cell: opts.cell ?? 2, bereich: opts.bereich ?? null,
                                      gitter: opts.gitter ?? null }).ergebnis : null);

const vorgang = (ops, name) => ableitungsSchritte({
    rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 2 }, operationen: ops, name });
const anzeige = (vorgaenge) => ableitungsSchritte({
    rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 2 }, name: 'Ur', vorgaenge });
const idVon = (s) => s[0].nachher.ableitung;

const ring = (pts) => pts.map(([x, z]) => ({ x, y: hNn(x, z), z }));
const GRUBE = { art: 'grube', parameter: {
    umriss: ring([[14, 14], [34, 14], [34, 34], [14, 34]]), sohle: 597.5, neigung: 1.5 } };
const FUELLEN = { art: 'schuettung', parameter: {
    umriss: ring([[14, 14], [34, 14], [34, 34], [14, 34]]), ziel: 'ur', hoehe: 0, neigung: 1.5 } };
// Ein Gerinne, das nur eine Ecke der Grube streift — klein gegen ihre Fläche.
const GERINNE_ECKE = { art: 'gerinne', parameter: {
    achse: [{ x: 30, z: 6 }, { x: 52, z: 30 }], sohlbreite: 2, boeschung: 1.5,
    sohleAnfang: 599.3, sohleEnde: 599.1 } };

async function lauf(vorgaenge) {
    const schritte = vorgaenge.flatMap(v => v.schritte);
    const Z = anzeige(vorgaenge.map(v => ({ ableitung: idVon(v.schritte), art: 'erdbau', titel: v.titel })));
    const stand = new Map([...schritte, ...Z].map(s => [s.globalId, s.nachher]));
    const l = neuerAbleitungslauf({ stand, rezeptNach, holeQuellForm, kernel: erzeugeKernel(), hoehenversatz: 300 });
    await l.baue(Z[0].globalId);                      // die Anzeige faltet ALLE Vorgänge
    return l;
}

describe('verdeckungen — wer steht im Raum, wenn zwei Vorgänge denselben Boden meinen', () => {
    it('die Auffüllung bis GOK verdeckt die Grube darunter — die Grube nicht die Auffüllung', async () => {
        const A = vorgang([GRUBE], 'Ur'), B = vorgang([FUELLEN], 'Ur');
        const l = await lauf([{ schritte: A, titel: 'Ausheben' }, { schritte: B, titel: 'Auffüllen' }]);
        const v = await l.verdeckungen();

        expect(v.get(idVon(A)).map(x => x.ableitung)).toEqual([idVon(B)]);
        expect(v.get(idVon(A))[0].anteil).toBeGreaterThan(0.95);      // dieselben Knoten, alle
        expect(v.get(idVon(B))).toEqual([]);                          // nach ihr kommt nichts
        // Die Kennzahl steht am Vorgang — dort liest sie die Engine.
        expect(l.ableitungen.get(idVon(A)).kennzahlen.verdecktVon).toEqual(v.get(idVon(A)));
        // Und die MENGEN bleiben beide: verdeckt heisst nicht ungültig.
        expect(l.ableitungen.get(idVon(A)).kennzahlen.aushubRaster).toBeGreaterThan(10);
        expect(l.ableitungen.get(idVon(B)).kennzahlen.auftragRaster).toBeGreaterThan(10);
    });

    it('ein Gerinne durch eine Ecke verdeckt die Grube NICHT — es trifft zu wenig', async () => {
        const A = vorgang([GRUBE], 'Ur'), C = vorgang([GERINNE_ECKE], 'Ur');
        const l = await lauf([{ schritte: A, titel: 'Ausheben' }, { schritte: C, titel: 'Gerinne' }]);
        const v = await l.verdeckungen();
        expect(v.get(idVon(A))).toEqual([]);
        expect(v.get(idVon(C))).toEqual([]);
    });

    it('die Reihenfolge entscheidet: nur ein SPÄTERER Vorgang verdeckt', async () => {
        const B = vorgang([FUELLEN], 'Ur'), A = vorgang([GRUBE], 'Ur');
        // Erst füllen, dann graben — jetzt ist die Grube die jüngere.
        const l = await lauf([{ schritte: B, titel: 'Auffüllen' }, { schritte: A, titel: 'Ausheben' }]);
        const v = await l.verdeckungen();
        expect(v.get(idVon(A))).toEqual([]);
        // Die Füllung auf unberührtem Ur hebt nichts an (`ziel: 'ur'` füllt nur
        // bis zum Ur) — ohne Wirkfläche kann sie niemand verdecken.
        expect(v.get(idVon(B))).toEqual([]);
    });

    it('drei Vorgänge: die Grube nennt jeden späteren, der sie überformt', async () => {
        const A = vorgang([GRUBE], 'Ur'), B = vorgang([FUELLEN], 'Ur'), C = vorgang([GRUBE], 'Ur');
        const l = await lauf([{ schritte: A, titel: 'Ausheben' }, { schritte: B, titel: 'Auffüllen' },
                              { schritte: C, titel: 'Nochmal ausheben' }]);
        const v = await l.verdeckungen();
        expect(v.get(idVon(A)).map(x => x.ableitung).sort()).toEqual([idVon(B), idVon(C)].sort());
        expect(v.get(idVon(B)).map(x => x.ableitung)).toEqual([idVon(C)]);
        expect(v.get(idVon(C))).toEqual([]);
    });

    it('die Schwelle ist eine Zahl, kein Gefühl — und sie steht an EINER Stelle', () => {
        expect(VERDECKT_AB).toBe(0.5);
    });
});
