/**
 * IfcAutor (Stufe 9.2) — der Kanal zur Editor-API.
 *
 * Was hier geprüft wird, sind die reinen Teile und das VERHALTEN gegenüber
 * einer Attrappe: dass ein fehlender Editor gemeldet und nicht geworfen wird,
 * dass ein Zug unter der Bautoleranz gar nicht erst ausgeführt wird, und dass
 * kein Misserfolg still verschwindet.
 *
 * Was hier NICHT geprüft wird — und das gehört gesagt: ob `getMeshes` /
 * `setMeshes` / `createElements` am echten Modell tun, was die Typdefinition
 * verspricht. Das braucht WebGL und eine geladene Datei. `getFragments` ist
 * genau deshalb hereingereicht.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
    CDE_MODELL_ID, IfcAutor, ankerAusBox, istNennenswert, zielVersatz,
} from '../services/IfcAutor.js';

const box = (min, max) => new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max));

describe('ankerAusBox', () => {
    it('nimmt die Mitte der Hülle', () => {
        expect(ankerAusBox(box([0, 0, 0], [10, 4, 2]))).toEqual({ x: 5, y: 2, z: 1 });
    });

    it('gibt ein schlichtes Objekt zurück, keinen Vector3', () => {
        // Der Wert geht ins Journal und durch JSON. Ein Vector3 käme als
        // nacktes Objekt zurück — dieselbe Größe läge in zwei Gestalten vor.
        const a = ankerAusBox(box([0, 0, 0], [2, 2, 2]));
        expect(a).not.toBeInstanceOf(THREE.Vector3);
        expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    });

    it('meldet null bei leerer oder fehlender Hülle', () => {
        expect(ankerAusBox(new THREE.Box3())).toBe(null);
        expect(ankerAusBox(null)).toBe(null);
        expect(ankerAusBox({})).toBe(null);
    });
});

describe('zielVersatz und istNennenswert', () => {
    it('rechnet den Weg zum Ziel', () => {
        expect(zielVersatz({ x: 1, y: 2, z: 3 }, { x: 4, y: 2, z: 0 }))
            .toEqual({ dx: 3, dy: 0, dz: -3 });
    });

    it('gibt null, wenn eine Seite fehlt', () => {
        expect(zielVersatz(null, { x: 1, y: 1, z: 1 })).toBe(null);
    });

    it('hält einen Zug unter 0,1 mm für keinen', () => {
        expect(istNennenswert({ dx: 5e-5, dy: 0, dz: 0 })).toBe(false);
        expect(istNennenswert({ dx: 0.001, dy: 0, dz: 0 })).toBe(true);
        expect(istNennenswert(null)).toBe(false);
    });
});

// ── Attrappen ───────────────────────────────────────────────────────────────

function fakeElement(localId) {
    const gruppe = new THREE.Group();
    return {
        localId,
        gruppe,
        getMeshes: vi.fn(async () => gruppe),
        setMeshes: vi.fn(async () => {}),
    };
}

function fakeFragments({ modelId = 'm1', boxen = new Map(), mitEditor = true } = {}) {
    const elemente = new Map();
    const editor = {
        getElements: vi.fn(async (_mid, ids) => ids.map((id) => {
            if (!elemente.has(id)) elemente.set(id, fakeElement(id));
            return elemente.get(id);
        })),
        createElements: vi.fn(async () => [fakeElement(99)]),
        deleteElements: vi.fn(),
        applyChanges: vi.fn(async () => []),
    };
    const modell = {
        modelId,
        editor: mitEditor ? editor : undefined,
        getBoxes: vi.fn(async (ids) => ids.map(id => boxen.get(id) ?? new THREE.Box3())),
        getBuffer: vi.fn(async () => new ArrayBuffer(8)),
    };
    return {
        manager: { list: new Map([[modelId, modell]]), core: { load: vi.fn(async () => {}) } },
        modell, editor, elemente,
    };
}

describe('Ein Viewer ohne Editor stürzt nicht ab', () => {
    it('meldet „kein_editor", statt zu werfen', async () => {
        const f = fakeFragments({ mitEditor: false });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        expect(autor.istBearbeitbar('m1')).toBe(false);
        expect(await autor.setzeAnker('m1', 1, { x: 0, y: 0, z: 0 }))
            .toEqual({ ok: false, grund: 'kein_editor' });
    });

    it('erträgt einen Manager, den es noch gar nicht gibt', async () => {
        const autor = new IfcAutor({ getFragments: () => null });
        expect(autor.istBearbeitbar('m1')).toBe(false);
        expect((await autor.ankerVon('m1', [1])).size).toBe(0);
        expect(await autor.alsPuffer('m1')).toBe(null);
    });
});

describe('ankerVon — der eingefrorene Lieferstand', () => {
    it('liest die Mitten der angefragten Bauteile', async () => {
        const f = fakeFragments({ boxen: new Map([[1, box([0, 0, 0], [10, 4, 2])]]) });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const anker = await autor.ankerVon('m1', [1]);
        expect(anker.get(1)).toEqual({ x: 5, y: 2, z: 1 });
    });

    it('lässt Bauteile ohne Hülle weg, statt Nullen zu erfinden', async () => {
        const f = fakeFragments({ boxen: new Map() });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        expect((await autor.ankerVon('m1', [1, 2])).size).toBe(0);
    });

    it('fragt bei leerer Liste gar nicht erst', async () => {
        const f = fakeFragments();
        const autor = new IfcAutor({ getFragments: () => f.manager });
        await autor.ankerVon('m1', []);
        expect(f.modell.getBoxes).not.toHaveBeenCalled();
    });
});

describe('setzeAnker', () => {
    const mitBox = () => fakeFragments({ boxen: new Map([[1, box([0, 0, 0], [10, 4, 2])]]) });

    it('verschiebt die Netze um den Weg zum Ziel', async () => {
        const f = mitBox();
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const r = await autor.setzeAnker('m1', 1, { x: 6, y: 2, z: 1 });
        expect(r.ok).toBe(true);
        expect(r.versatz).toEqual({ dx: 1, dy: 0, dz: 0 });
        expect(f.elemente.get(1).gruppe.position.x).toBe(1);
        expect(f.elemente.get(1).setMeshes).toHaveBeenCalled();
    });

    it('führt einen Zug unter der Bautoleranz GAR NICHT aus', async () => {
        // Sonst kostete ein Rundungsrest ein Neuzeichnen des Modells für nichts.
        const f = mitBox();
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const r = await autor.setzeAnker('m1', 1, { x: 5 + 1e-6, y: 2, z: 1 });
        expect(r).toEqual({ ok: true, versatz: null });
        expect(f.editor.getElements).not.toHaveBeenCalled();
    });

    it('meldet ein Bauteil ohne Hülle, statt es blind zu verschieben', async () => {
        const f = fakeFragments({ boxen: new Map() });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        expect((await autor.setzeAnker('m1', 1, { x: 1, y: 1, z: 1 })).grund)
            .toBe('bauteil_ohne_huelle');
    });

    it('fängt einen werfenden Editor und gibt den Grund weiter', async () => {
        const f = mitBox();
        f.editor.getElements = vi.fn(async () => { throw new Error('kaputt'); });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const r = await autor.setzeAnker('m1', 1, { x: 9, y: 2, z: 1 });
        expect(r.ok).toBe(false);
        expect(r.grund).toMatch(/editor_fehler: kaputt/);
    });
});

describe('eigenesModell — die Herkunft wird strukturell', () => {
    it('legt es einmal an und nennt sich beim zweiten Mal nicht neu', async () => {
        const f = fakeFragments({ modelId: 'anderes' });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const erst = await autor.eigenesModell();
        expect(erst).toEqual({ ok: true, modelId: CDE_MODELL_ID, neu: true });

        f.manager.list.set(CDE_MODELL_ID, { modelId: CDE_MODELL_ID });
        expect(await autor.eigenesModell()).toEqual({ ok: true, modelId: CDE_MODELL_ID, neu: false });
        expect(f.manager.core.load).toHaveBeenCalledTimes(1);
    });
});

describe('erzeuge und loesche', () => {
    it('weist eine Erzeugung ohne Geometrie ab', async () => {
        const f = fakeFragments();
        const autor = new IfcAutor({ getFragments: () => f.manager });
        expect((await autor.erzeuge('m1', { kategorie: 'IFCPIPESEGMENT' })).grund).toBe('ohne_geometrie');
    });

    it('gibt die localId des erzeugten Bauteils zurück', async () => {
        const f = fakeFragments();
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const r = await autor.erzeuge('m1', {
            kategorie: 'IFCPIPESEGMENT', geometrie: new THREE.BufferGeometry(),
        });
        expect(r).toEqual({ ok: true, localId: 99 });
    });

    it('meldet ein nicht gefundenes Bauteil beim Löschen', async () => {
        const f = fakeFragments();
        f.editor.getElements = vi.fn(async () => []);
        const autor = new IfcAutor({ getFragments: () => f.manager });
        expect((await autor.loesche('m1', 1)).grund).toBe('bauteil_nicht_gefunden');
    });
});

describe('wendeAn — kein Misserfolg verschwindet still', () => {
    it('meldet einen Schritt ohne localId, statt ihn zu übergehen', async () => {
        // Sonst sähe der Nutzer ein Modell, das seine Festlegungen scheinbar
        // verloren hat, ohne dass irgendwo stünde, warum.
        const f = fakeFragments({ boxen: new Map([[1, box([0, 0, 0], [2, 2, 2])]]) });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const plan = {
            modelId: 'm1',
            anzuwenden: [{ art: 'lage', globalId: 'unbekannt', wert: { x: 9, y: 9, z: 9 } }],
        };
        const { misserfolge } = await autor.wendeAn(plan, { globalIdZuLocalId: new Map() });
        expect(misserfolge).toHaveLength(1);
        expect(misserfolge[0].grund).toBe('keine_localId');
    });

    it('wendet einen sauberen Schritt an und meldet nichts', async () => {
        const f = fakeFragments({ boxen: new Map([[1, box([0, 0, 0], [2, 2, 2])]]) });
        const autor = new IfcAutor({ getFragments: () => f.manager });
        const plan = {
            modelId: 'm1',
            anzuwenden: [{ art: 'lage', globalId: 'H12', wert: { x: 3, y: 1, z: 1 } }],
        };
        const { misserfolge } = await autor.wendeAn(plan, { globalIdZuLocalId: new Map([['H12', 1]]) });
        expect(misserfolge).toHaveLength(0);
        expect(f.elemente.get(1).gruppe.position.x).toBe(2);
    });
});
