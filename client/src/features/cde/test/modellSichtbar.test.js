/**
 * Das Auge je Modell (Abnahme 2026-09-12, A6/A7).
 *
 * Fabio: kein Auge je Modell, und der Eigenbau liess sich nicht ausblenden.
 * Ein Modell verbirgt sich über sein Szenenobjekt — die Sichtbarkeit je
 * Bauteil trägt schon, was der Verlauf ausblendet (das Ur-Gelände unter der
 * Anzeige), und ein „alles ein" hätte es wieder gezeigt. Geprüft am echten
 * `IfcEngine` und `IfcAutor`; die Bibliothek als Attrappe in ihrer Form
 * (das Delta hängt unter dem Objekt der Basis, fragments `editor.load`).
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { IfcEngine, DELTA_MARKE } from '../services/IfcEngine.js';
import { IfcAutor, CDE_MODELL_ID } from '../services/IfcAutor.js';

function engineMitModell() {
    const basis = { modelId: 'm.ifc', object: new THREE.Group(), deltaModelId: `m.ifc${DELTA_MARKE}1` };
    const delta = { modelId: `m.ifc${DELTA_MARKE}1`, object: new THREE.Group() };
    basis.object.add(delta.object);
    const fragments = { list: new Map([[basis.modelId, basis], [delta.modelId, delta]]),
                        core: { update: vi.fn(async () => {}) }, raycast: vi.fn(async () => null) };
    const e = Object.create(IfcEngine.prototype);
    Object.assign(e, { components: { get: () => fragments } });
    return { e, basis, delta, fragments };
}

describe('setzeModellSichtbar', () => {
    it('verbirgt das Modell samt Delta und merkt es sich — auch für das Delta gefragt', async () => {
        const { e, basis, delta } = engineMitModell();
        await e.setzeModellSichtbar('m.ifc', false);
        expect(basis.object.visible).toBe(false);                 // das Delta hängt darunter
        expect(e.modellSichtbar('m.ifc')).toBe(false);
        expect(e.modellSichtbar(delta.modelId)).toBe(false);
        await e.setzeModellSichtbar('m.ifc', true);
        expect(basis.object.visible).toBe(true);
        expect(e.modellSichtbar(delta.modelId)).toBe(true);
    });

    it('ein verborgenes Modell wird nicht getroffen', async () => {
        const { e, basis, fragments } = engineMitModell();
        fragments.raycast = vi.fn(async () => ({ localId: 7, distance: 1, point: new THREE.Vector3(), fragments: basis }));
        e._getWorld = () => ({ camera: { three: new THREE.PerspectiveCamera() }, renderer: { three: { domElement: {} } } });
        await e.setzeModellSichtbar('m.ifc', false);
        expect(await e.pickElement(10, 10)).toBe(null);          // vorher: das verborgene Bauteil
        expect(fragments.raycast).toHaveBeenCalled();
    });
});

describe('ein Neuaufbau des Eigenbaus bleibt verborgen', () => {
    it('eigenesModell fragt die Engine und legt das Modell unsichtbar an', async () => {
        const modelle = new Map();
        const core = { load: vi.fn(async (_p, { modelId }) => {
            const m = { modelId, object: new THREE.Group(), useCamera: vi.fn() };
            modelle.set(modelId, m);
            return m;
        }) };
        const autor = new IfcAutor({ getFragments: () => ({ list: modelle, core }), istVerborgen: (id) => id === CDE_MODELL_ID });
        await autor.eigenesModell();
        expect(modelle.get(CDE_MODELL_ID).object.visible).toBe(false);   // vorher: nach jedem Aufbau wieder da
    });
});
