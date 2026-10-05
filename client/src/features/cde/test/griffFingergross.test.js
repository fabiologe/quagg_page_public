/**
 * Teil XXXI, T2 — Griffe in Fingergrösse.
 *
 * Tabletlauf T0 (2026-10-05, iPad hochkant): ein Griff mass 3 px in der Übersicht und 14 px auf die Wand gezoomt — der
 * Radius war 1/70 des Kameraabstands, höchstens 50 cm, und wurde nur beim Anzeigen gerechnet. Jetzt: GRIFF_PX auf dem
 * Schirm in jeder Zoomstufe (das Bild rechnet den Massstab vor jeder Ausgabe), Trefferfläche TREFFER_PX; überlappen
 * zwei Hülsen, gewinnt der Griff, der auf dem Schirm näher am Finger liegt.
 *
 * Gemessen wird wie auf dem Schirm: Weltpunkte mit derselben Kamera in Pixel projiziert, Treffer über `griffUnter`
 * mit Bildschirmkoordinaten.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { IfcOverlay, GRIFF_PX, TREFFER_PX } from '../services/IfcOverlay.js';

const B = 820, H = 519;                                   // die Zeichenfläche hochkant aus T0

function aufbau() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, B / H, 0.1, 100000);
    const dom = { clientHeight: H, getBoundingClientRect: () => ({ left: 0, top: 0, width: B, height: H }) };
    const overlay = new IfcOverlay({ getWorld: () => ({ scene: { three: scene }, camera: { three: camera }, renderer: { three: { domElement: dom } } }) });
    const renderer = { domElement: dom };
    const blickeAuf = (abstand) => {
        camera.position.set(0, abstand, 0.001);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld(true);
    };
    /** Ein Bild ausgeben — jeder sichtbare Teil ruft seinen `onBeforeRender` wie im WebGLRenderer. */
    const zeichne = () => {
        scene.updateMatrixWorld(true);
        scene.traverseVisible(o => { if (o.isMesh || o.isLine) o.onBeforeRender?.(renderer, scene, camera, o.geometry, o.material, null); });
    };
    const zuPx = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * B, y: (1 - p.y) / 2 * H }; };
    return { overlay, camera, blickeAuf, zeichne, zuPx };
}

/** Durchmesser eines Kugelgriffs auf dem Schirm: Mitte und Rand (quer zur Blickrichtung) projiziert. */
function durchmesserPx(t, key) {
    const e = t.overlay._griffe.get(key);
    const mitte = e.kugel.getWorldPosition(new THREE.Vector3());
    const r = e.halter.scale.x * e.kugel.geometry.parameters.radius;
    const rechts = new THREE.Vector3(1, 0, 0).applyQuaternion(t.camera.quaternion);
    const a = t.zuPx(mitte), b = t.zuPx(mitte.clone().addScaledVector(rechts, r));
    return 2 * Math.hypot(b.x - a.x, b.y - a.y);
}

const KUGEL = (key, x, y = 0, z = 0) => ({ key, pos: { x, y, z } });

describe('ein Griff hat in jeder Zoomstufe GRIFF_PX auf dem Schirm', () => {
    it('Übersicht (800 m) und nah (8 m): je 2·GRIFF_PX Durchmesser — vorher 3 px und 14 px', () => {
        const t = aufbau();
        t.blickeAuf(800);
        t.overlay.zeigeGriffe([KUGEL('a', 0)], { radius: 'auto' });
        t.zeichne();
        expect(durchmesserPx(t, 'a')).toBeCloseTo(2 * GRIFF_PX, 1);
        expect(2 * GRIFF_PX).toBeGreaterThanOrEqual(24);
        // Zoomen OHNE neu anzuzeigen — vorher blieb die Grösse vom Anzeigen stehen.
        t.blickeAuf(8);
        t.zeichne();
        expect(durchmesserPx(t, 'a')).toBeCloseTo(2 * GRIFF_PX, 1);
    });

    it('die Trefferfläche hat TREFFER_PX Radius, ≥ 44 px Durchmesser — getroffen über `griffUnter` am Schirm', () => {
        const t = aufbau();
        t.blickeAuf(200);
        t.overlay.zeigeGriffe([KUGEL('a', 0)], { radius: 'auto' });
        t.zeichne();
        expect(2 * TREFFER_PX).toBeGreaterThanOrEqual(44);
        const m = t.zuPx(new THREE.Vector3(0, 0, 0));
        expect(t.overlay.griffUnter(m.x + TREFFER_PX - 2, m.y)).toBe('a');
        expect(t.overlay.griffUnter(m.x, m.y - (TREFFER_PX - 2))).toBe('a');
        expect(t.overlay.griffUnter(m.x + TREFFER_PX + 3, m.y)).toBe(null);
        // Nach dem Zoom gilt dieselbe Pixelzahl — die Hülse hängt am selben Halter.
        t.blickeAuf(20);
        t.zeichne();
        expect(t.overlay.griffUnter(m.x + TREFFER_PX - 2, m.y)).toBe('a');
        expect(t.overlay.griffUnter(m.x + TREFFER_PX + 3, m.y)).toBe(null);
    });

    it('auch der Gizmo-Pfeil wächst mit: seine Hülse ist so breit wie die eines Kugelgriffs', () => {
        const t = aufbau();
        t.blickeAuf(500);
        t.overlay.zeigeGriffe([{ key: 'ost', form: 'pfeil', richtung: { x: 1, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } }], { radius: 'auto' });
        t.zeichne();
        const ursprung = t.zuPx(new THREE.Vector3(0, 0, 0));
        const proPx = t.overlay._griffe.get('ost').halter.scale.x / GRIFF_PX;      // Meter je Pixel
        const mitte = t.zuPx(new THREE.Vector3(3 * GRIFF_PX * proPx, 0, 0));          // halbe Pfeillänge
        expect(Math.abs(mitte.x - ursprung.x)).toBeCloseTo(3 * GRIFF_PX, 0);
        expect(t.overlay.griffUnter(mitte.x, mitte.y + TREFFER_PX - 3)).toBe('ost');
        expect(t.overlay.griffUnter(mitte.x, mitte.y + TREFFER_PX + 4)).toBe(null);
    });

    it('ein fester Radius (Tests, Plan) bleibt fest — kein Bild verändert ihn', () => {
        const t = aufbau();
        t.blickeAuf(800);
        t.overlay.zeigeGriffe([KUGEL('a', 0)], { radius: 0.2 });
        t.zeichne();
        expect(t.overlay._griffe.get('a').halter.scale.x).toBe(0.2);
    });
});

describe('überlappende Hülsen: der Griff, der auf dem SCHIRM näher liegt', () => {
    it('zwei Griffe 30 px auseinander, der hintere näher am Finger — vorher gewann die vordere Hülse', () => {
        const t = aufbau();
        t.blickeAuf(100);
        // B liegt 10 m höher (näher an der Kamera), 30 px neben A.
        const proPx = (100 * 2 * Math.tan(Math.PI / 6)) / H;
        t.overlay.zeigeGriffe([KUGEL('A', 0, 0, 0), KUGEL('B', 30 * proPx * 0.9, 10, 0)], { radius: 'auto' });
        t.zeichne();
        const a = t.zuPx(new THREE.Vector3(0, 0, 0));
        const b = t.zuPx(t.overlay._griffe.get('B').kugel.getWorldPosition(new THREE.Vector3()));
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(2 * GRIFF_PX);       // sichtbar getrennt
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(2 * TREFFER_PX);        // Hülsen überlappen
        // Zwischen den Kugeln, aber näher an A: A — obwohl die Hülse von B vorn liegt.
        const amRand = { x: a.x + (b.x - a.x) * 0.45, y: a.y + (b.y - a.y) * 0.45 };
        expect(t.overlay.griffUnter(amRand.x, amRand.y)).toBe('A');
        const naeherB = { x: a.x + (b.x - a.x) * 0.55, y: a.y + (b.y - a.y) * 0.55 };
        expect(t.overlay.griffUnter(naeherB.x, naeherB.y)).toBe('B');
        // Direkt auf einer Kugel gilt die Kugel.
        expect(t.overlay.griffUnter(a.x, a.y)).toBe('A');
    });
});
