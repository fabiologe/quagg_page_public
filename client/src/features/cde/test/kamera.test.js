/**
 * @vitest-environment jsdom
 *
 * Die Kamera kippt nicht mehr (Kur K1, Fabio 2026-09-20: „dreht man an einem
 * Objekt und kommt unter das Gelände, dreht sich die Kamera um 180 Grad und
 * alles ist auf dem Kopf").
 *
 * Geprüft wird an der ECHTEN `camera-controls`-Instanz, nicht an einer
 * Attrappe — der Fehler lebte genau in deren Rechnung: der Orbit-Raum
 * (`_yAxisUpSpace`) entsteht einmal im Konstruktor aus `camera.up`, die
 * Orientierung kommt aber aus dem jeweils aktuellen `up`. Wer `up` verbiegt,
 * ohne `updateCameraUp()` zu rufen, hat zwei Wahrheiten. Eine Attrappe hätte
 * das nie gezeigt.
 *
 * Gemessen wird EINE Grösse — `weltObenImBild`, die y-Komponente der lokalen
 * Y-Achse der Kamera. Negativ heisst „auf dem Kopf". Dieselbe Zahl liest die
 * Browserprobe im laufenden Viewer (M1).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(import.meta.url).replace(/test[\/][^\/]+$/, '');
import { IfcCamera, MINDEST_ELEVATION_GRAD, POL_ABSTAND_RAD, draufsichtPose, drehpunktAufSehstrahl, positionMitElevation, weltObenImBild } from '../services/IfcCamera.js';

CameraControls.install({ THREE });

const BOUNDS = () => {
    const box = new THREE.Box3(new THREE.Vector3(-50, -5, -50), new THREE.Vector3(50, 5, 50));
    const center = new THREE.Vector3();
    box.getCenter(center);
    return { box, center, size: new THREE.Vector3(100, 10, 100), maxDim: 100 };
};

/** Eine Welt wie die Engine sie baut — echte Kamera, echte Controls. */
function welt() {
    const three = new THREE.PerspectiveCamera(60, 4 / 3, 0.05, 100000);
    const el = document.createElement('div');
    const controls = new CameraControls(three, el);
    return { camera: { three, controls } };
}

function baue() {
    const w = welt();
    const kamera = new IfcCamera({ getWorld: () => w, getBounds: BOUNDS, components: { get: () => null } });
    kamera.configure();
    return { kamera, cam: w.camera.three, ctrls: w.camera.controls };
}

/** Ein Schritt der Steuerung, wie ihn die Maus auslöst, samt Übernahme ins Bild. */
function dreheUmRad(ctrls, cam, dTheta, dPhi) {
    ctrls.rotate(dTheta, dPhi, false);
    ctrls.update(1 / 60);
    cam.updateMatrixWorld(true);
}

/**
 * Ein animiertes Preset abwarten.
 *
 * `resetView` und `zoomToFit` überblenden (`enableTransition = true`), und
 * camera-controls löst ihr Versprechen erst bei „rest" auf — das kommt nur,
 * wenn jemand `update()` tickt. Im Browser tut das der Renderer, im Test
 * niemand. Also tickt der Test.
 */
async function fertig(ctrls, versprechen) {
    let offen = true;
    const p = Promise.resolve(versprechen).finally(() => { offen = false; });
    for (let i = 0; i < 600 && offen; i += 1) {
        ctrls.update(1 / 60);
        await Promise.resolve();
    }
    return p;
}

describe('weltObenImBild — die gemessene Grösse', () => {
    it('ist dieselbe Zahl wie die echte lokale Y-Achse der Kamera', () => {
        const cam = new THREE.PerspectiveCamera(60, 1, 1, 1000);
        for (const eye of [[10, 10, 10], [10, -2, 10], [0.001, -10, 0], [0, 10, 1e-5]]) {
            cam.up.set(0, 1, 0);
            cam.position.set(...eye);
            cam.lookAt(0, 0, 0);
            cam.updateMatrixWorld(true);
            const echt = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).y;
            expect(weltObenImBild(cam)).toBeCloseTo(echt, 9);
            // dieselbe Zahl, die die Browserprobe aus der Weltmatrix liest
            expect(weltObenImBild(cam)).toBeCloseTo(cam.matrixWorld.elements[5], 9);
        }
    });
});

describe('K1 — die Kamera steht nie auf dem Kopf', () => {
    let kamera, cam, ctrls;
    beforeEach(() => { ({ kamera, cam, ctrls } = baue()); });

    it('setzt die Polgrenze und lässt den Nadir nicht zu', async () => {
        expect(ctrls.maxPolarAngle).toBeCloseTo(Math.PI - POL_ABSTAND_RAD, 9);
        expect(ctrls.minPolarAngle).toBe(0);           // die Draufsicht steht genau dort

        await kamera.viewFront();
        // Dauerzug nach unten, weit über den Pol hinaus
        for (let i = 0; i < 200; i += 1) dreheUmRad(ctrls, cam, 0, 0.05);
        expect(ctrls.polarAngle).toBeLessThanOrEqual(Math.PI - POL_ABSTAND_RAD + 1e-9);
        expect(weltObenImBild(cam)).toBeGreaterThan(0);
    });

    it('bleibt beim Schwenk von der Draufsicht unter das Gelände aufrecht', async () => {
        await kamera.viewTop();
        ctrls.update(1 / 60);
        cam.updateMatrixWorld(true);

        let min = weltObenImBild(cam);
        // einmal ganz herum unter das Modell und wieder hinauf
        for (let i = 0; i < 120; i += 1) {
            dreheUmRad(ctrls, cam, 0.05, 0.03);
            min = Math.min(min, weltObenImBild(cam));
        }
        expect(min).toBeGreaterThanOrEqual(0);
    });

    it('GEGENPROBE: mit der alten verbogenen Achse kippt genau dieselbe Folge', async () => {
        await kamera.viewTop();
        // der alte Stand: up = (0,0,-1), ohne updateCameraUp — so stand es bis 2026-09-20
        cam.up.set(0, 0, -1);
        ctrls.update(1 / 60);
        cam.updateMatrixWorld(true);

        let min = weltObenImBild(cam);
        for (let i = 0; i < 120; i += 1) {
            dreheUmRad(ctrls, cam, 0.05, 0.03);
            min = Math.min(min, weltObenImBild(cam));
        }
        expect(min).toBeLessThan(0);                   // der Fehler, den die Regel misst
    });

    it('hält up auf (0,1,0) — durch jedes Preset und durch gespeicherte Ansichten', async () => {
        const istAufrecht = () => [cam.up.x, cam.up.y, cam.up.z];

        for (const preset of ['viewTop', 'viewFront', 'viewSide', 'resetView', 'zoomToFit']) {
            cam.up.set(0, 0, -1);                      // wie ein Altstand ihn hinterlassen hätte
            await fertig(ctrls, kamera[preset]());
            expect(istAufrecht(), preset).toEqual([0, 1, 0]);
        }

        // Eine Ansicht aus der Zeit davor darf die Kamera nicht mehr vergiften.
        await fertig(ctrls, kamera.applyState({ position: [10, 10, 10], target: [0, 0, 0], up: [0, 0, -1] }));
        expect(istAufrecht()).toEqual([0, 1, 0]);
        // gespeichert wird sie weiterhin (BCF liest sie)
        expect(kamera.captureState().up).toEqual([0, 1, 0]);
    });

    it('zeigt in der Draufsicht Norden oben und Osten rechts — ohne verbogenes up', async () => {
        await kamera.viewTop();
        ctrls.update(1 / 60);
        cam.updateMatrixWorld(true);

        const bildOben = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
        const bildRechts = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
        expect(bildOben.z).toBeCloseTo(-1, 4);         // Papier-Oben = Welt −Z (Nord-Konvention)
        expect(bildRechts.x).toBeCloseTo(1, 4);        // rechts = Welt +X (Ost)
        expect(cam.position.y).toBeGreaterThan(BOUNDS().center.y);
    });

    it('draufsichtPose beschreibt genau diese Stelle', () => {
        const p = draufsichtPose(BOUNDS());
        expect(p.position).toEqual({ x: 0, y: 200, z: 0 });
        expect(p.ziel).toEqual({ x: 0, y: 0, z: 0 });
        expect(draufsichtPose(null)).toBeNull();
    });
});

describe('K2 — eine Auswahl wählt, sie fährt nicht', () => {
    let kamera, cam, ctrls;
    beforeEach(() => { ({ kamera, cam, ctrls } = baue()); });

    it('drehpunktAufSehstrahl legt die Tiefe um, nicht die Richtung', () => {
        const pos = { x: 0, y: 0, z: 0 };
        const ziel = { x: 10, y: 0, z: 0 };
        // Ein Punkt seitlich vom Strahl: sein Fusspunkt liegt auf dem Strahl.
        expect(drehpunktAufSehstrahl(pos, ziel, { x: 4, y: 7, z: -3 })).toEqual({ x: 4, y: 0, z: 0 });
        // Hinter der Kamera gibt es keinen Drehpunkt — dann bleibt alles.
        expect(drehpunktAufSehstrahl(pos, ziel, { x: -5, y: 0, z: 0 })).toBeNull();
        // Entartete Blickrichtung ebenso.
        expect(drehpunktAufSehstrahl(pos, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
    });

    it('lässt Position und Blickrichtung bitgleich stehen', async () => {
        await fertig(ctrls, kamera.zoomToFit());
        ctrls.update(1 / 60);
        cam.updateMatrixWorld(true);

        const vorherPos = cam.position.clone();
        const vorherQ = cam.quaternion.clone();
        const vorherRadius = ctrls.distance;

        await kamera.drehpunktAuf(new THREE.Vector3(30, -4, 12));
        ctrls.update(1 / 60);
        cam.updateMatrixWorld(true);

        expect(cam.position.distanceTo(vorherPos)).toBeLessThan(1e-6);
        expect(cam.quaternion.angleTo(vorherQ)).toBeLessThan(1e-6);
        expect(ctrls.distance).not.toBeCloseTo(vorherRadius, 3);   // nur die Tiefe hat sich gelegt
    });

    it('hebt die Kamera nicht mehr auf 20° — der alte Sprung ist weg', async () => {
        // Kamera flach und UNTER dem Ziel: genau die Lage, die vorher sprang.
        await fertig(ctrls, Promise.resolve(ctrls.setLookAt(40, -10, 0, 0, 0, 0, false)));
        ctrls.update(1 / 60);
        cam.updateMatrixWorld(true);
        const vorher = cam.position.clone();

        await kamera.drehpunktAuf(new THREE.Vector3(5, 0, 0));
        ctrls.update(1 / 60);
        expect(cam.position.distanceTo(vorher)).toBeLessThan(1e-6);
        // Zum Vergleich: der alte Weg hätte die Kamera über die Waagerechte gehoben.
        expect(positionMitElevation(vorher, { x: 5, y: 0, z: 0 }).y).toBeGreaterThan(vorher.y);
    });

    it('sperrt die Kamera nach Marken — frei erst, wenn niemand mehr hält', () => {
        expect(ctrls.enabled).toBe(true);
        kamera.sperren(true, 'griff');
        kamera.sperren(true, 'schnitt');
        expect(ctrls.enabled).toBe(false);
        kamera.sperren(false, 'griff');
        expect(ctrls.enabled, 'der Schnitt hält noch').toBe(false);
        expect(kamera.sperrenVon()).toEqual(['schnitt']);
        kamera.sperren(false, 'schnitt');
        expect(ctrls.enabled).toBe(true);
        // Zweimal freigeben schadet nicht.
        kamera.sperren(false, 'schnitt');
        expect(ctrls.enabled).toBe(true);
    });
});

describe('K7 — was man bearbeitet, wird nicht verdeckt', () => {
    const viewer = readFileSync(join(WURZEL, 'components/IfcViewer.vue'), 'utf8');
    const hud = readFileSync(join(WURZEL, 'components/CdeHudLayer.vue'), 'utf8');

    it('Rahmen, Marke und Modus-Meldung liegen ÜBER dem Bild', () => {
        // Gemessen 2026-09-20: `.canvas-root` hat z-index 10, die drei lagen
        // bei 6–8 — nach dem Druck auf „Bearbeiten" war im Bild nichts zu
        // sehen, `elementsFromPoint` führte den WebGL-Canvas über der Marke.
        const zIndexVon = (klasse) => {
            const i = viewer.indexOf(`.${klasse} {`);
            const treffer = /z-index:\s*(\d+)/.exec(viewer.slice(i, i + 400));
            return treffer ? Number(treffer[1]) : null;
        };
        const canvas = zIndexVon('canvas-root');
        expect(canvas).toBe(10);
        for (const k of ['bearb-rahmen', 'bearb-marke', 'bearb-sperre']) {
            expect(zIndexVon(k), k).toBeGreaterThan(canvas);
        }
    });

    it('die Zeiger-Pille weicht der Kontextleiste aus', () => {
        expect(hud).toMatch(/const zeigerHoch = computed/);
        expect(hud).toMatch(/hud-zeiger--hoch/);
        // Sie klappt NACH OBEN, nicht einfach weg.
        expect(hud).toMatch(/\.hud-zeiger--hoch \{ transform: translate\(14px, calc\(-100% - 14px\)\); \}/);
    });
});
