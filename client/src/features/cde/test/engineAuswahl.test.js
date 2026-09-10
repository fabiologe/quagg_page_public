/**
 * Auswahl, Schweben, Fang und Rahmen in der Engine (Teil XVI, S1) — gegen die
 * ECHTEN Methodenkörper (`IfcEngine.prototype.<m>.call`), mit einer Attrappe
 * in der Form der Bibliothek: `fragments.raycast/highlight/resetHighlight`
 * am OBC-Manager, `raycastWithSnapping`/`rectangleRaycast` je Modell.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as FRAGS from '@thatopen/fragments';
import { IfcEngine, SELECTION_STYLE } from '../services/IfcEngine.js';

function attrappe({ treffer = null, snaps = [], rechteck = [] } = {}) {
    const modell = {
        modelId: 'm',
        raycast: vi.fn(async () => treffer),
        raycastWithSnapping: vi.fn(async () => snaps),
        rectangleRaycast: vi.fn(async () => (rechteck.length ? { localIds: rechteck, fragments: modell } : null)),
    };
    const fragments = {
        list: new Map([['m', modell]]),
        raycast: vi.fn(async () => treffer),
        highlight: vi.fn(async () => {}),
        resetHighlight: vi.fn(async () => {}),
        getData: vi.fn(async () => [{ _localId: { value: 7 }, _guid: { value: 'g7' } }]),
    };
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 1000);
    camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const world = { camera: { three: camera }, renderer: { three: { domElement: canvas } } };
    const engine = Object.create(IfcEngine.prototype);
    Object.assign(engine, {
        components: { get: () => fragments },
        _getWorld: () => world,
        _canvas: canvas,
        _selectedItems: null, _selectedKey: null, _hoveredKey: null, _hoverInFlight: false,
        _faerbungen: new Map(),
        _lastHitPoint: null, _lastHitModelId: null,
        _coordOffsets: new Map([['m', new THREE.Vector3(1000, 0, 2000)]]),
        _coordinationOffset: new THREE.Vector3(),
        camera: { orbitAroundSelection: vi.fn(async () => {}) },
        _parseItemData: () => ({ globalId: 'g7', name: 'Rohr' }),
        _globalIdVon: async () => 'g7',
        overlay: null,
    });
    return { engine, fragments, modell, camera };
}

const treffer = (localId, p = [0, 0, 0]) => ({
    localId, distance: 5, point: new THREE.Vector3(...p), normal: new THREE.Vector3(0, 1, 0),
    fragments: { modelId: 'm' },
});

describe('pickElement', () => {
    it('raycastet ZUERST und rührt bei demselben Schlüssel nichts an', async () => {
        const t = attrappe({ treffer: treffer(7) });
        t.engine._selectedKey = 'm:7';
        t.engine._selectedItems = { m: [7] };
        const r = await t.engine.pickElement(10, 10);
        expect(r).toMatchObject({ gleich: true, key: 'm:7', modelId: 'm', localId: 7 });
        expect(t.fragments.resetHighlight).not.toHaveBeenCalled();
        expect(t.fragments.highlight).not.toHaveBeenCalled();
        expect(t.engine.camera.orbitAroundSelection).not.toHaveBeenCalled();
        expect(t.fragments.getData).not.toHaveBeenCalled();
        expect(t.engine._selectedItems).toEqual({ m: [7] });
    });

    it('ein NEUES Bauteil: alte Auswahl zurück, neue an, Orbit, Merkmale', async () => {
        const t = attrappe({ treffer: treffer(7, [1, 2, 3]) });
        t.engine._selectedKey = 'm:3';
        t.engine._selectedItems = { m: [3] };
        const r = await t.engine.pickElement(10, 10);
        expect(t.fragments.resetHighlight).toHaveBeenCalledWith({ m: [3] });
        expect(t.fragments.highlight).toHaveBeenCalledTimes(1);
        expect(t.engine.camera.orbitAroundSelection).toHaveBeenCalledWith('m', 7);
        expect(r).toMatchObject({ modelId: 'm', localId: 7, globalId: 'g7', point: { x: 1, y: 2, z: 3 } });
        expect(t.engine._selectedKey).toBe('m:7');
    });

    it('`orbit: false` lässt die Kamera stehen', async () => {
        const t = attrappe({ treffer: treffer(7) });
        await t.engine.pickElement(10, 10, { orbit: false });
        expect(t.engine.camera.orbitAroundSelection).not.toHaveBeenCalled();
    });

    it('kein Treffer: null, und die alte Auswahl BLEIBT (der Aufrufer entscheidet)', async () => {
        const t = attrappe({ treffer: null });
        t.engine._selectedKey = 'm:3';
        t.engine._selectedItems = { m: [3] };
        expect(await t.engine.pickElement(10, 10)).toBeNull();
        expect(t.fragments.resetHighlight).not.toHaveBeenCalled();
        expect(t.engine._selectedKey).toBe('m:3');
    });
});

describe('hoverElement / probeTreffer', () => {
    it('liefert Daten statt eines Cursors — Schlüssel, Punkt, Normale, Modell', async () => {
        const t = attrappe({ treffer: treffer(4, [1, 2, 3]) });
        const h = await t.engine.hoverElement(10, 10);
        expect(h).toEqual({ key: 'm:4', point: { x: 1, y: 2, z: 3 }, normal: { x: 0, y: 1, z: 0 }, modelId: 'm', localId: 4, fang: null });
        expect(t.engine.getHitPoint()).toMatchObject({ x: 1, y: 2, z: 3, ox: 1001, oz: 2003, modelId: 'm' });
        expect(t.modell.raycastWithSnapping).not.toHaveBeenCalled();
    });

    it('mit `fang` fragt sie die Bibliothek nach Ecken und Kanten und nimmt die nächste im Radius', async () => {
        const t = attrappe({
            treffer: treffer(4, [0, 0, 0]),
            snaps: [
                { point: new THREE.Vector3(0.05, 0, 0), snappingClass: FRAGS.SnappingClass.LINE,
                  snappedEdgeP1: new THREE.Vector3(0, 0, 0), snappedEdgeP2: new THREE.Vector3(1, 0, 0) },
                { point: new THREE.Vector3(0.02, 0.02, 0), snappingClass: FRAGS.SnappingClass.POINT },
                { point: new THREE.Vector3(5, 5, 0), snappingClass: FRAGS.SnappingClass.POINT },   // weit weg
            ],
        });
        const h = await t.engine.hoverElement(10, 10, { fang: true });
        expect(h.fang.art).toBe('ecke');
        expect(h.fang.punkt).toEqual({ x: 0.02, y: 0.02, z: 0 });
        expect(t.modell.raycastWithSnapping.mock.calls[0][0].snappingClasses)
            .toEqual([FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE]);
    });

    it('eine Kante bringt ihre Endpunkte mit', async () => {
        const t = attrappe({
            treffer: treffer(4, [0, 0, 0]),
            snaps: [{ point: new THREE.Vector3(0.05, 0, 0), snappingClass: FRAGS.SnappingClass.LINE,
                      snappedEdgeP1: new THREE.Vector3(0, 0, 0), snappedEdgeP2: new THREE.Vector3(1, 0, 0) }],
        });
        const h = await t.engine.probeTreffer(10, 10, { fang: true });
        expect(h.fang.art).toBe('kante');
        expect(h.fang.kante).toEqual([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
    });

    it('`modelId` beschränkt den Raycast auf EIN Modell — und ein unbekanntes gibt null', async () => {
        const t = attrappe({ treffer: treffer(4) });
        await t.engine.probeTreffer(10, 10, { modelId: 'm' });
        expect(t.modell.raycast).toHaveBeenCalledTimes(1);
        expect(t.fragments.raycast).not.toHaveBeenCalled();
        expect(await t.engine.probeTreffer(10, 10, { modelId: 'gibtsnicht' })).toBeNull();
    });

    it('während eines laufenden Raycasts meldet hoverElement „überholt" (undefined)', async () => {
        const t = attrappe({ treffer: treffer(4) });
        t.engine._hoverInFlight = true;
        expect(await t.engine.hoverElement(10, 10)).toBeUndefined();
    });

    it('clearHover räumt auch die Modellkennung (Landmine aus Teil VI)', async () => {
        const t = attrappe({ treffer: treffer(4) });
        await t.engine.hoverElement(10, 10);
        t.engine.clearHover();
        expect(t.engine._lastHitModelId).toBeNull();
        expect(t.engine.getHitPoint()).toBeNull();
    });

    it('_probeWorldPoint bleibt der Punkt-Kanal für Messen und Notizen', async () => {
        const t = attrappe({ treffer: treffer(4, [1, 2, 3]) });
        const p = await t.engine._probeWorldPoint(10, 10);
        expect(p).toBeInstanceOf(THREE.Vector3);
        expect(p.toArray()).toEqual([1, 2, 3]);
    });
});

describe('rechteckAuswahl', () => {
    it('lässt die Bibliothek je Modell rechnen und macht die Treffer zur Auswahl', async () => {
        const t = attrappe({ rechteck: [3, 5, 8] });
        t.engine._selectedItems = { m: [1] };
        const r = await t.engine.rechteckAuswahl({ x0: 50, y0: 40, x1: 10, y1: 20 }, { fullyIncluded: false });
        const d = t.modell.rectangleRaycast.mock.calls[0][0];
        expect(d.topLeft.toArray()).toEqual([10, 20]);
        expect(d.bottomRight.toArray()).toEqual([50, 40]);
        expect(d.fullyIncluded).toBe(false);
        expect(r).toEqual({ items: { m: [3, 5, 8] }, count: 3 });
        expect(t.fragments.resetHighlight).toHaveBeenCalledWith({ m: [1] });
        expect(t.fragments.highlight).toHaveBeenCalledTimes(1);
        expect(t.engine._selectedItems).toEqual({ m: [3, 5, 8] });
        expect(t.engine._selectedKey).toBeNull();
    });

    it('ein leerer Rahmen leert die Auswahl, ohne zu werfen', async () => {
        const t = attrappe({ rechteck: [] });
        t.engine._selectedItems = { m: [1] };
        const r = await t.engine.rechteckAuswahl({ x0: 0, y0: 0, x1: 10, y1: 10 });
        expect(r).toEqual({ items: {}, count: 0 });
        expect(t.engine._selectedItems).toBeNull();
        expect(t.fragments.highlight).not.toHaveBeenCalled();
    });
});

describe('Färbe-Stapel und waehleOrt (S2)', () => {
    it('faerbe hebt je Rolle hervor, ersetzt die Rolle beim zweiten Aufruf und weist Unbekanntes ab', async () => {
        const t = attrappe();
        expect(await t.engine.faerbe('dimmen', [{ modelId: 'm', localId: 3 }, { modelId: 'm', localId: 4 }])).toBe(2);
        expect(t.fragments.highlight).toHaveBeenLastCalledWith(expect.objectContaining({ opacity: 0.25 }), { m: [3, 4] });
        await t.engine.faerbe('dimmen', [{ modelId: 'm', localId: 9 }]);
        expect(t.fragments.resetHighlight).toHaveBeenCalledWith({ m: [3, 4] });
        expect(t.engine._faerbungen.get('dimmen')).toEqual({ m: [9] });
        await expect(t.engine.faerbe('lila', [])).rejects.toThrow(/unbekannte Rolle/);
    });

    it('entfaerbe stellt die Auswahl wieder her — das Dimmen hatte sie überschrieben', async () => {
        const t = attrappe();
        t.engine._selectedItems = { m: [7] };
        await t.engine.faerbe('dimmen', [{ modelId: 'm', localId: 7 }]);
        t.fragments.highlight.mockClear();
        expect(await t.engine.entfaerbe('dimmen')).toBe(true);
        expect(t.fragments.resetHighlight).toHaveBeenLastCalledWith({ m: [7] });
        // Wiederhergestellt mit DEM Auswahlstil — erkannt an der Identität, nicht an einer
        // Farbe: die war bis 2026-09-10 deckend grün und ist jetzt ein leichter Schimmer.
        expect(t.fragments.highlight).toHaveBeenCalledWith(SELECTION_STYLE, { m: [7] });
        expect(await t.engine.entfaerbe('dimmen')).toBe(false);
    });

    it('entfaerbeAlle räumt jede Rolle; leere Orte räumen die Rolle statt zu färben', async () => {
        const t = attrappe();
        await t.engine.faerbe('ziel', [{ modelId: 'm', localId: 1 }]);
        await t.engine.faerbe('kandidat', [{ modelId: 'm', localId: 2 }]);
        await t.engine.entfaerbeAlle();
        expect(t.engine._faerbungen.size).toBe(0);
        expect(await t.engine.faerbe('ziel', [])).toBe(0);
        expect(t.engine._faerbungen.has('ziel')).toBe(false);
    });

    it('waehleOrt wählt per Kennung ohne Kamerafahrt und setzt den Schlüssel', async () => {
        const t = attrappe();
        expect(await t.engine.waehleOrt('m', 7)).toBe(true);
        expect(t.engine._selectedKey).toBe('m:7');
        expect(t.engine._selectedItems).toEqual({ m: [7] });
        expect(t.engine.camera.orbitAroundSelection).not.toHaveBeenCalled();
        expect(await t.engine.waehleOrt('gibtsnicht', 1)).toBe(false);
    });
});
