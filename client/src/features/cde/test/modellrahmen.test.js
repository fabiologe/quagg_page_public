/**
 * Der MODELLRAHMEN beim Netz-Lesen (Teil XVII, Kanalgraben-Nachprüfung
 * 2026-09-09). Die Bibliothek liefert `getItemsGeometry` im eigenen Rahmen
 * des Modells und stellt ein ZWEITES Modell über `object.position` in die
 * gemeinsame Welt. Das erste Modell steht bei 0 — deshalb fiel es in keinem
 * Test und keinem Ein-Modell-Lauf auf. Ein Gelände aus einer zweiten Datei
 * lag im Raster um −489 / 183 m neben dem Netz: der Kanalgraben fand kein
 * Gelände unter dem Rohr („baugrube_ohne_treffer", Tiefe 0, Aushub 0,6 m³).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { collectElementTriangles, _modellRahmen } from '../services/ifcleser/MeshAcquire.js';

function modell({ position = null, transform = null } = {}) {
    const object = new THREE.Object3D();
    if (position) object.position.set(...position);
    object.updateMatrixWorld(true);
    return {
        object,
        getItemsGeometry: async () => [[{ positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 10]), indices: new Uint32Array([0, 1, 2]), transform }]],
    };
}

describe('collectElementTriangles hebt in die Welt', () => {
    it('erstes Modell (Position 0): unverändert, kein Rahmen', async () => {
        const m = modell();
        expect(_modellRahmen(m)).toBeNull();
        const r = await collectElementTriangles(m, [1]);
        expect(r.triCount).toBe(1);
        expect([...r.positions]).toEqual([0, 0, 0, 10, 0, 0, 0, 0, 10]);
    });
    it('zweites Modell (Position −489 / −33 / 183): jede Ecke wandert um die Position', async () => {
        const r = await collectElementTriangles(modell({ position: [-489.062, -33.386, 183.431] }), [1]);
        expect([...r.positions].map(v => Math.round(v * 1000) / 1000)).toEqual([-489.062, -33.386, 183.431, -479.062, -33.386, 183.431, -489.062, -33.386, 193.431]);
    });
    it('Element-Transform UND Modellrahmen wirken nacheinander', async () => {
        const t = new THREE.Matrix4().makeTranslation(1, 2, 3);
        const r = await collectElementTriangles(modell({ position: [100, 0, 0], transform: t }), [1]);
        expect([...r.positions].slice(0, 3)).toEqual([101, 2, 3]);
    });
    it('eine Attrappe ohne `object` (Tests, IfcQuelle-Wege) bleibt, wie sie ist', async () => {
        const r = await collectElementTriangles({ getItemsGeometry: async () => [[{ positions: new Float32Array([1, 1, 1, 2, 1, 1, 1, 1, 2]) }]] }, [1]);
        expect([...r.positions]).toEqual([1, 1, 1, 2, 1, 1, 1, 1, 2]);
    });
});
