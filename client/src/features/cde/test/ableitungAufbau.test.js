/**
 * Der Aufbau einer Ableitung über den Autor (Teil XIV, G2) — mit der
 * fragments-Attrappe IN DER FORM DER BIBLIOTHEK (Editor am Manager). Zwei
 * Bauteile aus einem Bauplan-Paar, PredefinedType als Attribut, das leere
 * Teil entsteht nicht, und die Kennzahlen bleiben am Autor.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { IfcAutor, CDE_MODELL_ID } from '../services/IfcAutor.js';
import { ableitungsSchritte } from '../services/Bauteilrezepte.js';
import { erzeugeKernel } from '../services/geometrie/Kernel.js';
import { rasterAusMesh } from '../services/geometrie/ops/Raster.js';

function gelaende() {
    const h = (x, z) => 300 + 0.03 * x;
    const t = [];
    for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) {
        const a = [x, h(x, z), z], b = [x + 1, h(x + 1, z), z];
        const c = [x + 1, h(x + 1, z + 1), z + 1], d = [x, h(x, z + 1), z + 1];
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

describe('IfcAutor.baueErzeugte mit Ableitung', () => {
    it('baut Aushub und Anzeige, lässt den leeren Auftrag aus und trägt PredefinedType', async () => {
        const f = fakeFragments();
        const autor = new IfcAutor({
            getFragments: () => f.manager,
            holeQuellForm: async (gid, form, { cell } = {}) => (gid === 'DGM1' && form === 'raster'
                ? rasterAusMesh({ mesh: gelaende() }, { cell: cell ?? 1 }).ergebnis : null),
            kernel: erzeugeKernel(),
            getHoehenversatz: () => 300,
        });
        autor.verwirfEigenesModell = vi.fn(async () => {});
        autor.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));

        const schritte = ableitungsSchritte({ rezept: 'erdbau', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 },
            operationen: [{ art: 'gerinne', parameter: { achse: [{ x: 5, z: 15 }, { x: 25, z: 15 }],
                sohlbreite: 2, boeschung: 1.5, sohleAnfang: 598, sohleEnde: 597.8 } }], name: 'Ur' });
        // Stufe 1: das geformte Gelände ist die ANZEIGE des Ur (eigene Ableitung), kein Teil des Vorgangs.
        const anzeige = ableitungsSchritte({ rezept: 'anzeige', quellen: { gelaende: 'DGM1' }, raster: { cell: 0.5 }, name: 'Ur',
                                             vorgaenge: [{ ableitung: schritte[0].nachher.ableitung, art: 'erdbau', titel: 'Ur · Gelände formen' }] });
        schritte.push(anzeige[0]);
        const plan = schritte.map(s => ({ globalId: s.globalId, art: 'erzeugt', modell: 'cde', wert: s.nachher }));
        const r = await autor.baueErzeugte(plan);

        expect(r.misserfolge).toEqual([]);
        expect(r.leer).toEqual([schritte[1].globalId]);                // Auftrag: nichts
        expect([...r.karte.keys()]).toEqual([schritte[0].globalId, schritte[2].globalId]);
        expect(f.editor.createElements).toHaveBeenCalledTimes(2);
        const [aushubAufruf, dgmAufruf] = f.editor.createElements.mock.calls.map(c => c[1][0].attributes);
        expect(aushubAufruf._category.value).toBe('IFCEARTHWORKSCUT');
        expect(aushubAufruf.PredefinedType.value).toBe('TRENCH');
        expect(aushubAufruf._guid.value).toBe(schritte[0].globalId);
        expect(dgmAufruf._category.value).toBe('IFCGEOGRAPHICELEMENT');
        expect(dgmAufruf.PredefinedType.value).toBe('TERRAIN');
        // Geometrie ist eine echte BufferGeometry — Float32 erst hier, am Ausgang.
        const geo = f.editor.createElements.mock.calls[0][1][0].samples[0].representation;
        expect(geo).toBeInstanceOf(THREE.BufferGeometry);
        expect(geo.getAttribute('position').count).toBeGreaterThan(0);
        // Kennzahlen bleiben am Autor — nie im Journal.
        const a = autor.ableitungen.get(schritte[0].nachher.ableitung);
        expect(a.kennzahlen.aushubKoerper).toBeGreaterThan(10);
        expect(r.ableitungen).toBe(autor.ableitungen);
    });

    it('ein Rezept ohne Ableitung läuft wie bisher — der Lauf stört nicht', async () => {
        const f = fakeFragments();
        const autor = new IfcAutor({ getFragments: () => f.manager });
        autor.verwirfEigenesModell = vi.fn(async () => {});
        autor.eigenesModell = vi.fn(async () => ({ ok: true, modelId: CDE_MODELL_ID, neu: true }));
        const r = await autor.baueErzeugte([{ globalId: 'cde-l', art: 'erzeugt', modell: 'cde', wert: {
            rezept: 'linie', kategorie: 'IFCANNOTATION', name: 'L', bauform: 'linie',
            parameter: { punkte: [[0, 0, 0], [10, 0, 0]] } } }]);
        expect(r.misserfolge).toEqual([]);
        expect(r.karte.get('cde-l')).toBe(100);
        expect(r.ableitungen.size).toBe(0);
    });
});
