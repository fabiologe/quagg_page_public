/**
 * Teil XXXII, R2 — der Verschiebe-Gizmo bei flachem Blick.
 *
 * Tabletlauf T9: von der Seite gesehen schrumpften der Pfeil, der in die Tiefe zeigt, und das waagerechte
 * Ebenenquadrat fast auf null — man traf einen Punkt, ohne zu sehen, wohin er zieht. Jetzt verschwindet der
 * Tiefenpfeil (die zwei sichtbaren Achsen bleiben), und das Quadrat stellt sich zur Kamera.
 *
 * Gemessen wie auf dem Schirm: die echten Gizmo-Teile (`gizmoTeile`), dieselbe Kamera, die Fläche des Quadrats in px².
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { IfcOverlay, GRIFF_PX, gizmoImBlick } from '../services/IfcOverlay.js';
import { gizmoTeile } from '../services/Griffe.js';

const B = 820, H = 955;

function aufbau() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, B / H, 0.1, 100000);
    const dom = { clientHeight: H, getBoundingClientRect: () => ({ left: 0, top: 0, width: B, height: H }) };
    const overlay = new IfcOverlay({ getWorld: () => ({ scene: { three: scene }, camera: { three: camera }, renderer: { three: { domElement: dom } } }) });
    const renderer = { domElement: dom };
    const blick = (von) => { camera.position.set(...von); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true); };
    const zeichne = () => {
        scene.updateMatrixWorld(true);
        scene.traverseVisible(o => { if (o.isMesh || o.isLine) o.onBeforeRender?.(renderer, scene, camera, o.geometry, o.material, null); });
        scene.updateMatrixWorld(true);
    };
    const zuPx = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * B, y: (1 - p.y) / 2 * H }; };
    return { overlay, blick, zeichne, zuPx };
}
const TEILE = gizmoTeile({ traeger: 'lage', globalId: 'cde-W', pos: { x: 0, y: 0, z: 0 }, werkzeug: 'verschieben' });

/** Die Fläche des Quadrats auf dem Schirm (px²) — die vier Ecken seiner Fläche projiziert. */
function quadratPx(t) {
    const e = t.overlay._griffe.get('lage:ebene');
    const flaeche = e.kugel.children[0];
    const pos = flaeche.geometry.attributes.position;
    const ecken = [0, 1, 3, 2].map(i => t.zuPx(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(flaeche.matrixWorld)));
    let a = 0;
    for (let i = 0; i < 4; i++) { const p = ecken[i], q = ecken[(i + 1) % 4]; a += p.x * q.y - q.x * p.y; }
    return Math.abs(a) / 2;
}

describe('R2 — der Gizmo bei flachem Blick', () => {
    it('die Regel: ein Pfeil fast in Blickrichtung ist unsichtbar, das Quadrat kippt unter ~20° Blickneigung', () => {
        expect(gizmoImBlick({ x: 0, y: -0.07, z: -1 }, { x: 0, y: 0, z: -1 }).sichtbar).toBe(false);
        expect(gizmoImBlick({ x: 0, y: -0.07, z: -1 }, { x: 1, y: 0, z: 0 }).sichtbar).toBe(true);
        expect(gizmoImBlick({ x: 0, y: -1, z: -0.01 }, { x: 0, y: 0, z: -1 }).sichtbar).toBe(true);   // von oben: alle drei
        expect(gizmoImBlick({ x: 0, y: -0.07, z: -1 }).flach).toBe(true);
        expect(gizmoImBlick({ x: 0, y: -0.7, z: -0.7 }).flach).toBe(false);
    });

    it('nach Norden geschaut, 4° geneigt: der Nord-Pfeil ist weg und nicht zu treffen, Ost und Höhe bleiben', () => {
        const t = aufbau();
        t.blick([0, 1.5, 20]);
        t.overlay.zeigeGriffe(TEILE, { radius: 'auto' });
        t.zeichne();
        const v = (k) => !t.overlay._griffe.get(k).versteckt;
        expect([v('lage:ost'), v('lage:nord'), v('lage:hoehe')]).toEqual([true, false, true]);
        // Mitten auf den Ursprung getippt: nie der unsichtbare Nord-Pfeil.
        const m = t.zuPx(new THREE.Vector3(0, 0, 0));
        expect(t.overlay.griffUnter(m.x, m.y)).not.toBe('lage:nord');
        // Von oben: Ost und Nord wieder da — jetzt zeigt der Höhenpfeil in die Tiefe (gezogen wird die Höhe von der Seite).
        t.blick([0, 20, 0.5]);
        t.zeichne();
        expect([v('lage:ost'), v('lage:nord'), v('lage:hoehe')]).toEqual([true, true, false]);
        // Schräg (45°): alle drei.
        t.blick([10, 14, 10]);
        t.zeichne();
        expect([v('lage:ost'), v('lage:nord'), v('lage:hoehe')]).toEqual([true, true, true]);
    });

    it('das Quadrat: flach gesehen gestellt — sichtbar wie von oben, statt einer Linie; von oben unverändert', () => {
        const t = aufbau();
        t.blick([0, 20, 0.5]);
        t.overlay.zeigeGriffe(TEILE, { radius: 'auto' });
        t.zeichne();
        const vonOben = quadratPx(t);
        // Seitenlänge GIZMO_LAENGE · 0,34 Griffradien = 2,04 · 12 px ≈ 24,5 px → ≈ 600 px².
        expect(vonOben).toBeGreaterThan(0.8 * (2.04 * GRIFF_PX) ** 2);
        t.blick([0, 1.5, 20]);
        t.zeichne();
        const flach = quadratPx(t);
        expect(flach).toBeGreaterThan(0.8 * vonOben);
        // Getroffen wird es in seiner gestellten Lage: die Mitte der Fläche auf dem Schirm.
        const e = t.overlay._griffe.get('lage:ebene');
        const mitte = t.zuPx(e.kugel.children[0].getWorldPosition(new THREE.Vector3()));
        expect(t.overlay.griffUnter(mitte.x, mitte.y)).toBe('lage:ebene');
        // Zurück nach oben: liegt wieder.
        t.blick([0, 20, 0.5]);
        t.zeichne();
        expect(quadratPx(t)).toBeCloseTo(vonOben, 0);
    });
});
