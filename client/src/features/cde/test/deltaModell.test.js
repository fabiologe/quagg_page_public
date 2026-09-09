/**
 * Das DELTA-MODELL des fragments-Editors (Nachprüfung Teil XVI, 2026-09-08).
 *
 * `applyChanges` legt je Modell ein `…-DELTA-MODEL-…` in dieselbe Liste; die
 * Basis blendet das bearbeitete Bauteil aus, das Delta zeichnet es am neuen
 * Ort. Im echten Browser gemessen: der Raycast auf ein verschobenes Rohr kam
 * mit der Delta-Kennung, `getBoxes` der Basis stand am Lieferort, und
 * `setzeAnker` rechnete gegen den Lieferort und addierte auf die schon
 * verschobenen Netze — doppelt. Hier stehen die Verträge der CDE dazu.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import { IfcEngine, DELTA_MARKE, basisModelId, istDeltaModell } from '../services/IfcEngine.js';
import { IfcAutor } from '../services/IfcAutor.js';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
const BASIS = 'm.ifc';
const DELTA = `m.ifc${DELTA_MARKE}123.4`;

function box(min, max) { return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)); }
const LEER = () => new THREE.Box3();   // min +∞ / max −∞ — so meldet das Delta „nicht hier"

function welt() {
    return {
        camera: { three: new THREE.PerspectiveCamera() },
        renderer: { three: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } } },
    };
}

/** Eine Engine-Attrappe in der Form der Wirklichkeit: Basis + Delta in EINER Liste. */
function attrappe({ trefferAuf = DELTA } = {}) {
    const basis = { modelId: BASIS, name: 'm', deltaModelId: DELTA, raycast: vi.fn(async () => null), rectangleRaycast: vi.fn(async () => ({ localIds: [7] })) };
    const delta = { modelId: DELTA, name: DELTA, deltaModelId: null, raycast: vi.fn(async () => null), rectangleRaycast: vi.fn(async () => ({ localIds: [7, 8] })) };
    const list = new Map([[BASIS, basis], [DELTA, delta]]);
    const treffer = { localId: 7, distance: 1, point: new THREE.Vector3(1, 2, 3), fragments: list.get(trefferAuf) };
    const fragments = {
        list,
        raycast: vi.fn(async () => treffer),
        highlight: vi.fn(async () => {}),
        resetHighlight: vi.fn(async () => {}),
        getData: vi.fn(async () => [{ _localId: { value: 7 }, _guid: { value: 'g7' } }]),
    };
    const hider = { set: vi.fn(async () => {}) };
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, {
        components: { get: (K) => (K === OBC.Hider ? hider : fragments) },
        _getWorld: () => welt(), _canvas: welt().renderer.three.domElement,
        _selectedItems: null, _selectedKey: null, _hoveredKey: null, _faerbungen: new Map(),
        camera: { orbitAroundSelection: vi.fn(async () => {}) },
        _parseItemData: () => ({ globalId: 'g7', name: 'Rohr' }),
        _globalIdVon: async () => 'g7',
    });
    return { e, fragments, hider, basis, delta };
}

describe('basisModelId', () => {
    it('bildet die Delta-Kennung auf die Basis ab und lässt alles andere stehen', () => {
        expect(basisModelId(DELTA)).toBe(BASIS);
        expect(basisModelId(BASIS)).toBe(BASIS);
        expect(basisModelId(null)).toBeNull();
        expect(istDeltaModell(DELTA)).toBe(true);
        expect(istDeltaModell(BASIS)).toBe(false);
    });
});

describe('Engine: das Delta ist kein Modell', () => {
    it('getModelList zählt es nicht', () => {
        const { e } = attrappe();
        expect(e.getModelList().map(m => m.modelId)).toEqual([BASIS]);
    });

    it('pickElement: ein Treffer auf dem Delta kommt mit der BASIS-Kennung — und die Auswahl färbt beide', async () => {
        const { e, fragments } = attrappe({ trefferAuf: DELTA });
        const r = await e.pickElement(10, 10, { orbit: false });
        expect(r.modelId).toBe(BASIS);
        expect(r.localId).toBe(7);
        expect(e._selectedKey).toBe(`${BASIS}:7`);
        expect(fragments.highlight).toHaveBeenCalledWith(expect.anything(), { [BASIS]: [7], [DELTA]: [7] });
        expect(fragments.getData).toHaveBeenCalledWith({ [BASIS]: [7] }, expect.anything());
    });

    it('probeTreffer normiert die Kennung; die Rahmenauswahl sammelt Delta-Treffer unter der Basis, jeden einmal', async () => {
        const { e } = attrappe({ trefferAuf: DELTA });
        const t = await e.probeTreffer(10, 10);
        expect(t.modelId).toBe(BASIS);
        expect(t.key).toBe(`${BASIS}:7`);
        const { items, count } = await e.rechteckAuswahl(0, 0, 50, 50);
        expect(items).toEqual({ [BASIS]: [7, 8] });
        expect(count).toBe(2);
    });

    it('Verstecken nimmt das Delta mit — sonst bliebe die verschobene Kopie stehen', async () => {
        const { e, hider } = attrappe();
        e._selectedItems = { [BASIS]: [7] };
        await e.hideSelected();
        expect(hider.set).toHaveBeenCalledWith(false, { [BASIS]: [7], [DELTA]: [7] });
    });
});

describe('IfcAutor: Hülle und Anker lesen den AKTUELLEN Ort', () => {
    function autor({ deltaBox }) {
        const basis = { modelId: BASIS, deltaModelId: DELTA, getBoxes: vi.fn(async () => [box([0, 0, 0], [2, 2, 2])]) };
        const delta = { modelId: DELTA, getBoxes: vi.fn(async () => [deltaBox]) };
        const list = new Map([[BASIS, basis], [DELTA, delta]]);
        const a = Object.create(IfcAutor.prototype);
        Object.assign(a, { _getFragments: () => ({ list, core: { editor: null } }) });
        return { a, basis, delta };
    }
    it('die Delta-Box gewinnt, wo es eine gibt', async () => {
        const { a } = autor({ deltaBox: box([10, 0, 0], [12, 2, 2]) });
        const h = (await a.huellenVon(BASIS, [7])).get(7);
        expect(h.anker.x).toBeCloseTo(11);
        const b = (await a.boxenVon(BASIS, [7])).get(7);
        expect(b.min.x).toBe(10);
    });
    it('ein leeres Delta (Bauteil nie bearbeitet) lässt die Basis gelten', async () => {
        const { a } = autor({ deltaBox: LEER() });
        expect((await a.huellenVon(BASIS, [7])).get(7).anker.x).toBeCloseTo(1);
    });
    it('setzeAnker rechnet den Versatz gegen den AKTUELLEN Ort — zweimal dasselbe Ziel bewegt nichts mehr', async () => {
        let lage = box([0, 0, 0], [2, 2, 2]);
        const basis = { modelId: BASIS, deltaModelId: DELTA, getBoxes: vi.fn(async () => [box([0, 0, 0], [2, 2, 2])]) };
        const delta = { modelId: DELTA, getBoxes: vi.fn(async () => [lage]) };
        const list = new Map([[BASIS, basis], [DELTA, delta]]);
        const gruppe = new THREE.Group();
        const element = { getMeshes: async () => gruppe, setMeshes: async (g) => { lage = lage.clone().translate(g.position); gruppe.position.set(0, 0, 0); } };
        const editor = { getElements: async () => [element], applyChanges: vi.fn(async () => []) };
        const a = Object.create(IfcAutor.prototype);
        Object.assign(a, { _getFragments: () => ({ list, core: { editor, update: async () => {} } }) });
        const r1 = await a.setzeAnker(BASIS, 7, { x: 11, y: 1, z: 1 });
        expect(r1).toMatchObject({ ok: true, versatz: { dx: 10, dy: 0, dz: 0 } });
        const r2 = await a.setzeAnker(BASIS, 7, { x: 11, y: 1, z: 1 });
        expect(r2).toEqual({ ok: true, versatz: null });
        expect(editor.applyChanges).toHaveBeenCalledTimes(1);
    });
});

describe('Vertrag gegen die Bibliothek', () => {
    it('die Bibliothek führt Geometrie und Elemente mit dem Delta zusammen — Boxen und Raycast NICHT (deshalb tut es die CDE)', () => {
        const mjs = fs.readFileSync(WURZEL + '../../../node_modules/@thatopen/fragments/dist/index.mjs', 'utf8');
        expect(mjs).toContain('"-DELTA-MODEL-"');
        expect(/getItemsGeometry\(t,e,s\)\{[^}]*deltaModelId/.test(mjs)).toBe(true);
        expect(/async getBoxes\(t\)\{return this\._boxManager\.getBoxes\(this,t\)\}/.test(mjs)).toBe(true);
        const dts = fs.readFileSync(WURZEL + '../../../node_modules/@thatopen/fragments/dist/index.d.ts', 'utf8');
        expect(/deltaModelId:\s*string\s*\|\s*null/.test(dts)).toBe(true);
    });
    it('die Engine ruft Färbung und Hider nur noch über die Delta-Hüllen', () => {
        const e = fs.readFileSync(WURZEL + 'services/IfcEngine.js', 'utf8');
        const rumpf = e.slice(e.indexOf('export class IfcEngine'));
        expect(rumpf.match(/fragments\.highlight\(/g)?.length).toBe(2);        // nur in _highlight (Versuch + Rückfall)
        expect(rumpf.match(/fragments\.resetHighlight\(/g)?.length).toBe(2);
        expect(rumpf.match(/hider\.set\(/g)?.length).toBe(2);
    });
});

describe('Kamera und Engine lesen den AKTUELLEN Ort (DeltaBoxen)', () => {
    it('orbitAroundSelection kreist um die Delta-Box, nicht um den Lieferort', async () => {
        const { IfcCamera } = await import('../services/IfcCamera.js');
        const basis = { modelId: BASIS, deltaModelId: DELTA, getBoxes: vi.fn(async () => [box([0, 0, 0], [2, 2, 2])]) };
        const delta = { modelId: DELTA, getBoxes: vi.fn(async () => [box([10, 0, 0], [12, 2, 2])]) };
        const list = new Map([[BASIS, basis], [DELTA, delta]]);
        const cam = Object.create(IfcCamera.prototype);
        const orbit = vi.fn(async () => {});
        Object.assign(cam, { _components: { get: () => ({ list }) }, orbitAroundPoint: orbit });
        expect(await cam.orbitAroundSelection(BASIS, 7)).toBe(true);
        expect(orbit.mock.calls[0][0].x).toBeCloseTo(11);
    });
    it('engine.getBoxes liefert die Delta-Box — und die Basis, wo das Delta leer ist', async () => {
        const basis = { modelId: BASIS, deltaModelId: DELTA, getBoxes: vi.fn(async (ids) => ids.map(() => box([0, 0, 0], [2, 2, 2]))) };
        const delta = { modelId: DELTA, getBoxes: vi.fn(async (ids) => ids.map(id => (id === 7 ? box([10, 0, 0], [12, 2, 2]) : LEER()))) };
        const list = new Map([[BASIS, basis], [DELTA, delta]]);
        const e = Object.create(IfcEngine.prototype);
        Object.assign(e, { components: { get: () => ({ list }) } });
        const b = await e.getBoxes([7, 8], BASIS);
        expect(b[0].min.x).toBe(10);
        expect(b[1].min.x).toBe(0);
    });
});

describe('Die GlobalId eines EIGENEN Bauteils steht nur im Delta (gemessen 2026-09-09)', () => {
    /**
     * Das CDE-Modell führt den GUID-RÜCKWÄRTSINDEX nicht: `getLocalIdsByGuids`
     * findet ein selbst erzeugtes Bauteil in der Basis, `getGuidsByLocalIds`
     * gibt dort nichts zurück. Weil der Raycast auf die Basis normiert, kam
     * jedes eigene Bauteil OHNE GlobalId an — und ohne die findet der Store
     * keinen Bauplan: keine Eigen-Werkzeuge, keine Stützpunkt-Griffe.
     */
    function engineMitIndex({ basisGuid = null, deltaGuid = 'cde-1', deltaZurueck = 7 } = {}) {
        const basis = { modelId: BASIS, deltaModelId: DELTA,
            getGuidsByLocalIds: vi.fn(async () => [basisGuid]),
            getLocalIdsByGuids: vi.fn(async () => [null]) };          // die Basis kann NICHT zurückrechnen
        const delta = { modelId: DELTA, deltaModelId: null,
            getGuidsByLocalIds: vi.fn(async () => [deltaGuid]),
            getLocalIdsByGuids: vi.fn(async () => [deltaZurueck]) };
        const list = new Map([[BASIS, basis], [DELTA, delta]]);
        const e = Object.create(IfcEngine.prototype);
        e.components = { get: () => ({ list }) };
        return { e, basis, delta };
    }

    it('fehlt sie in der Basis, kommt sie aus dem Delta — mit Gegenprobe IM Delta', async () => {
        const { e, basis, delta } = engineMitIndex();
        expect(await e._globalIdVon(basis, 7)).toBe('cde-1');
        expect(delta.getLocalIdsByGuids).toHaveBeenCalledWith(['cde-1']);
        // Die Basis wird NICHT zur Gegenprobe befragt — sie führt den Index nicht.
        expect(basis.getLocalIdsByGuids).not.toHaveBeenCalled();
    });

    it('die Gegenprobe schützt vor einer FREMDEN Kennung', async () => {
        const { e, basis } = engineMitIndex({ deltaZurueck: 99 });     // zeigt auf ein anderes Bauteil
        expect(await e._globalIdVon(basis, 7)).toBe('');
    });

    it('wo die Basis den Index führt (geliefertes Modell), bleibt es beim direkten Weg', async () => {
        const { e, basis, delta } = engineMitIndex({ basisGuid: 'ifc-guid' });
        expect(await e._globalIdVon(basis, 7)).toBe('ifc-guid');
        expect(delta.getGuidsByLocalIds).not.toHaveBeenCalled();
    });

    it('ohne Delta gibt es nichts zu holen — und keinen Absturz', async () => {
        const { e } = engineMitIndex();
        const ohne = { modelId: BASIS, deltaModelId: null, getGuidsByLocalIds: vi.fn(async () => [null]) };
        expect(await e._globalIdVon(ohne, 7)).toBe('');
    });
});
