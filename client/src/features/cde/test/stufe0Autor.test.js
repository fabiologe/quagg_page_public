/**
 * Stufe 0, die Abnahme auf AUTOR-Ebene: das Bild aus dem Anlass, nachgestellt.
 *
 * Zwei Ableitungen auf demselben gelieferten Gelände — die erste ist
 * verborgen (ihr DGM-Teil wurde Quelle der zweiten), aber ihr `geloescht`
 * trägt KEINE Aussage `modell: 'cde'` (so schrieb es der Zeichenweg bis
 * Stufe 0). Vorher: der Autor baute BEIDE DGM-Teile (zwei TERRAIN im Raum)
 * und meldete `keine_localId` für das Ausblenden, weil er das eigene Teil im
 * gelieferten Modell suchte. Die Zahlen, die der Befund behauptet:
 *
 *     TERRAIN-Erzeugungen  = 1   (vorher 2)
 *     keine_localId        = 0   (vorher 1)
 *     verborgen            = [DGM-Teil der ersten Ableitung]
 */
import { describe, expect, it, vi } from 'vitest';
import { IfcAutor, CDE_MODELL_ID } from '../services/IfcAutor.js';
import { ableitungsSchritte } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

function gelaende() {
    const h = (x) => 300 + 0.03 * x;
    const t = [];
    for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) {
        const a = [x, h(x), z], b = [x + 1, h(x + 1), z];
        const c = [x + 1, h(x + 1), z + 1], d = [x, h(x), z + 1];
        t.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    return { positions: new Float64Array(t), triCount: t.length / 9 };
}

function fakeFragments() {
    let naechsteId = 100;
    const editor = {
        createElements: vi.fn(async () => [{ localId: naechsteId++ }]),
        applyChanges: vi.fn(async () => []),
        deleteElements: vi.fn(),
        getElements: vi.fn(async () => []),
    };
    const manager = {
        list: new Map([[CDE_MODELL_ID, { modelId: CDE_MODELL_ID, dispose: () => {} }]]),
        core: { editor, update: vi.fn(async () => {}), load: vi.fn(async () => {}), disposeModel: vi.fn(async () => {}) },
    };
    return { manager, editor };
}

function autorMit(f) {
    const autor = new IfcAutor({
        getFragments: () => f.manager,
        holeQuellForm: async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster'
            ? rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1 }).ergebnis : null),
        kernel: erzeugeKernel(),
        getHoehenversatz: () => 300,
    });
    autor.verwirfEigenesModell = vi.fn(async () => {});
    autor.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));
    return autor;
}

const OP = { art: 'gerinne', parameter: { achse: [{ x: 5, z: 15 }, { x: 25, z: 15 }],
    sohlbreite: 2, boeschung: 1.5, sohleAnfang: 598, sohleEnde: 597.8 } };

describe('Stufe 0 am Autor — ein Gelände im Raum, kein keine_localId', () => {
    it('ein verborgenes eigenes DGM ohne `modell`-Aussage wird NICHT gebaut und NICHT im gelieferten Modell gesucht', async () => {
        const f = fakeFragments();
        const autor = autorMit(f);
        // Die erste: ein Alt-Journal VOR Stufe 1 — mit dgm-Teil in der Klammer.
        const erste = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: [OP], name: 'Ur' });
        const altesDgm = 'cde-alt-dgm';
        erste.push({ art: 'erzeugt', globalId: altesDgm, modell: 'cde',
                     nachher: { ...erste[0].nachher, rolle: 'dgm', kategorie: 'IFCGEOGRAPHICELEMENT', bauform: 'hoehenfeld', predefinedType: 'TERRAIN', name: 'Ur (geformt)' } });
        // Die zweite (Stufe 1): ein Vorgang plus die EINE Anzeige des Ur.
        const zweite = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, operationen: [OP], name: 'Ur' });
        const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, name: 'Ur',
                                             vorgaenge: [{ ableitung: erste[0].nachher.ableitung }, { ableitung: zweite[0].nachher.ableitung }] });

        const anzuwenden = [
            { art: 'geloescht', globalId: 'DGM1', wert: true, modell: 'geliefert' },
            // GENAU der Eintrag aus dem Anlass: eigen, aber ohne Aussage.
            { art: 'geloescht', globalId: altesDgm, wert: true },
            ...[...erste, ...zweite, ...anzeige].map(s => ({ art: 'erzeugt', globalId: s.globalId, modell: 'cde', wert: s.nachher })),
        ];
        const r = await autor.wendeAn({ anzuwenden, vollstaendig: true, modelId: 'm1' },
                                      { globalIdZuLocalId: new Map([['DGM1', 7]]) });

        const kategorien = f.editor.createElements.mock.calls.map(c => c[1][0].attributes._category.value);
        expect(kategorien.filter(k => k === 'IFCGEOGRAPHICELEMENT')).toHaveLength(1);      // vorher 2 — jetzt: nur die Anzeige
        expect(r.misserfolge.filter(m => m.grund === 'keine_localId')).toHaveLength(0);     // vorher 1
        expect(r.auszublenden).toEqual([{ modelId: 'm1', localId: 7 }]);                    // das gelieferte, wie immer
        expect(r.misserfolge).toEqual([]);
    });
});
