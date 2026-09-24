/**
 * Schnittebene mit Greifer (Sprint I, Stufe 5).
 *
 * Der letzte und aufwendigste Schnitt der Engine-Entflechtung. Acht eigene
 * Felder — aber `_planePivot` wurde von DREI fremden Belangen direkt
 * angefasst: `gotoStorey` legte den Schnitt auf ein Geschoss, `captureView`
 * las seine Lage, `applyView` schrieb sie zurueck. Solange fremde Stellen in
 * ein Feld greifen, ist ein Belang nicht auslagerbar.
 *
 * Deshalb bekam der Schnitt zuerst drei Methoden — `getSectionState`,
 * `applySectionState`, `placeSectionAt` — und die drei Stellen rufen seither
 * nur noch. Erst danach war dieser Schnitt moeglich. Das ist die Reihenfolge,
 * die bei jedem verflochtenen Belang funktioniert: erst die Naht, dann der
 * Schnitt.
 *
 * Abhaengigkeiten wie bei `IfcCamera`: `getWorld` und `getBounds` als
 * Getter-Closures, weil die World erst nach `IfcEngine.init()` existiert.
 *
 * `_hideSectionVisuals`/`_restoreSectionVisuals` gehoeren hierher, obwohl sie
 * der Schnappschuss braucht: sie wissen, was zum Schnitt gehoert. Die Engine
 * ruft sie als Paar.
 */

import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export class IfcSection {
    /**
     * @param {object}   opt
     * @param {Function} opt.getWorld   () => World (lazy)
     * @param {Function} opt.getBounds  () => THREE.Box3|null
     */
    constructor({ getWorld, getBounds, sperreKamera = null }) {
        this._getWorld = getWorld;
        this._getBounds = getBounds;
        /** Die Kamera anhalten — über den EINEN Besitzer, mit Marke (K2). */
        this._sperreKamera = sperreKamera;
        this._clippingPlane = null;
        this._sectionRenderHook = null;
        this._planePivot = null;
        this._tcHelper = null;
        this._transformControls = null;
        this._sectionChangeCallback = null;
        this._onTcMouseDown = null;
        this._onTcMouseUp = null;
    }

    /**
     * Create an interactive clipping plane with a TransformControls gizmo.
     * The gizmo renders directly in the 3D scene — no sliders needed.
     * Initial orientation: horizontal (plane faces up, clips geometry above pivot).
     */
    createSectionCut() {
        const world  = this._getWorld();
        const bounds = this._getBounds();
        const center = bounds?.center ?? new THREE.Vector3();
        const size   = bounds?.size   ?? new THREE.Vector3(100, 100, 100);
        // 2.2× ensures the plane visually covers the full model footprint with margin
        const planeSize = Math.max(size.x, size.z) * 2.2;

        // ── Gizmo pivot Object3D ──────────────────────────────────────────
        this._planePivot = new THREE.Object3D();
        this._planePivot.position.copy(center);
        // PlaneGeometry normal = local +Z. We want world normal = (0,-1,0) (clips y > center.y).
        // rotation.x = +π/2 → local +Z becomes (0,-1,0) [geprueft]
        this._planePivot.rotation.x = Math.PI / 2;
        world.scene.three.add(this._planePivot);

        // ── Visual plane mesh (semi-transparent quad) ─────────────────────
        const planeMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(planeSize, planeSize),
            new THREE.MeshBasicMaterial({
                color: 0x2196f3, transparent: true, opacity: 0.07,
                side: THREE.DoubleSide, depthWrite: false,
                // polygonOffset pushes the plane slightly toward the camera to avoid
                // Z-fighting with scene geometry at the same depth during orbit
                polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
            })
        );
        planeMesh.renderOrder = 1;
        this._planePivot.add(planeMesh);

        // ── Border edge ───────────────────────────────────────────────────
        const edgeGeo  = new THREE.EdgesGeometry(new THREE.PlaneGeometry(planeSize, planeSize));
        const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
            color: 0x42a5f5, transparent: true, opacity: 0.55,
        }));
        this._planePivot.add(edgeLine);

        // ── Crosshair lines ───────────────────────────────────────────────
        const h = planeSize / 2;
        const chPts = new Float32Array([-h,0,0, h,0,0,  0,-h,0, 0,h,0]);
        const chGeo = new THREE.BufferGeometry();
        chGeo.setAttribute('position', new THREE.BufferAttribute(chPts, 3));
        this._planePivot.add(new THREE.LineSegments(chGeo, new THREE.LineBasicMaterial({
            color: 0x42a5f5, transparent: true, opacity: 0.22,
        })));

        // ── TransformControls (r163+ API: getHelper()) ────────────────────
        const tc = new TransformControls(world.camera.three, world.renderer.three.domElement);
        tc.attach(this._planePivot);
        tc.setMode('translate');
        tc.setSpace('world');
        tc.setSize(1.1);

        const helper = tc.getHelper?.() ?? tc;
        world.scene.three.add(helper);
        this._tcHelper = helper;

        // Interlock: die Kamera steht, solange am Gizmo gezogen wird — über den
        // EINEN Besitzer, mit eigener Marke (K2). Hier steht bewusst KEIN
        // Rückfall auf `controls.enabled`: ein direktes Freigeben nähme auch
        // einem laufenden Griff-Zug die Sperre weg, und zwei Wege zu derselben
        // Sache sind genau der Fehler, den die Marke behebt.
        this._onTcMouseDown = () => this._sperreKamera?.(true);
        this._onTcMouseUp   = () => this._sperreKamera?.(false);
        tc.addEventListener('mouseDown', this._onTcMouseDown);
        tc.addEventListener('mouseUp',   this._onTcMouseUp);

        this._transformControls = tc;

        // ── Native Three.js clipping plane ────────────────────────────────
        this._clippingPlane = new THREE.Plane();
        world.renderer.three.localClippingEnabled = true;
        world.renderer.three.clippingPlanes = [this._clippingPlane];

        // Per-frame hook: syncs clipping plane from pivot's world matrix BEFORE each render.
        // Using onBeforeUpdate (not TC 'change') ensures the plane is applied exactly once per
        // frame and runs AFTER any OBC component updates that might clear clippingPlanes.
        this._sectionRenderHook = () => this._updateClippingFromPivot();
        world.renderer.onBeforeUpdate.add(this._sectionRenderHook);

        return {};
    }

    /** Set TransformControls mode: 'translate' | 'rotate' */
    setSectionMode(mode) {
        this._transformControls?.setMode(mode);
    }

    /** Recompute native clipping plane from the pivot's current world transform. */
    _updateClippingFromPivot() {
        if (!this._clippingPlane || !this._planePivot) return;

        this._planePivot.updateWorldMatrix(true, false);

        // Plane normal = local +Z (PlaneGeometry normal) transformed to world space
        const normal = new THREE.Vector3(0, 0, 1)
            .transformDirection(this._planePivot.matrixWorld);
        const point = new THREE.Vector3()
            .setFromMatrixPosition(this._planePivot.matrixWorld);

        this._clippingPlane.setFromNormalAndCoplanarPoint(normal, point);

        this._sectionChangeCallback?.();
    }

    setSectionChangeCallback(fn) { this._sectionChangeCallback = fn; }

    getSectionPosition() {
        if (!this._planePivot) return null;
        const p = this._planePivot.position;
        return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
    }

    /** Snap section pivot to one of three cardinal orientations. */
    snapSectionTo(axis) {
        if (!this._planePivot) return;
        this._planePivot.rotation.set(0, 0, 0);
        if      (axis === 'horizontal') this._planePivot.rotation.x = Math.PI / 2;
        else if (axis === 'x')          this._planePivot.rotation.y = -Math.PI / 2;
        // axis === 'z': no rotation → local +Z stays world +Z
        this._planePivot.updateWorldMatrix(true, false);
        this._updateClippingFromPivot();
    }

    /** Reset section pivot to model center, horizontal. */
    resetSection() {
        if (!this._planePivot) return;
        const bounds = this._getBounds();
        const center = bounds?.center ?? new THREE.Vector3();
        this._planePivot.position.copy(center);
        this._planePivot.rotation.set(Math.PI / 2, 0, 0);
        this._planePivot.updateWorldMatrix(true, false);
        this._updateClippingFromPivot();
    }

    deleteSectionCuts() {
        const world = this._getWorld();

        if (this._sectionRenderHook) {
            world.renderer.onBeforeUpdate.remove(this._sectionRenderHook);
            this._sectionRenderHook = null;
        }

        if (this._transformControls) {
            // Remove named listeners before dispose to prevent memory leaks
            if (this._onTcMouseDown) this._transformControls.removeEventListener('mouseDown', this._onTcMouseDown);
            if (this._onTcMouseUp)   this._transformControls.removeEventListener('mouseUp',   this._onTcMouseUp);
            this._onTcMouseDown = null;
            this._onTcMouseUp   = null;
            this._transformControls.detach();
            this._transformControls.dispose();
            this._transformControls = null;
        }
        if (this._tcHelper) {
            world.scene.three.remove(this._tcHelper);
            this._tcHelper = null;
        }
        if (this._planePivot) {
            this._planePivot.clear();
            world.scene.three.remove(this._planePivot);
            this._planePivot = null;
        }

        world.renderer.three.clippingPlanes      = [];
        world.renderer.three.localClippingEnabled = false;
        this._clippingPlane = null;
    }

    /** Return the active clipping plane (used by vector plotter for section contour). */
    getSectionCutPlane() { return this._clippingPlane ?? null; }

    /**
     * Lage der Schnittebene lesen — Position und Drehung als einfache Arrays.
     *
     * Zusammen mit `applySectionState` und `placeSectionAt` ersetzt das die
     * drei Stellen, die bisher `_planePivot` direkt anfassten (gotoStorey,
     * captureView, applyView). Solange fremde Belange in ein Feld greifen,
     * ist der Schnitt nicht auslagerbar — mit Methoden schon.
     *
     * @returns {{position: number[], rotation: number[]}|null}
     */
    getSectionState() {
        if (!this._planePivot) return null;
        return {
            position: this._planePivot.position.toArray(),
            rotation: this._planePivot.rotation.toArray().slice(0, 3),
        };
    }

    /** Gegenstueck zu getSectionState. Legt den Schnitt bei Bedarf erst an. */
    applySectionState(state) {
        if (!state) { if (this._planePivot) this.deleteSectionCuts(); return; }
        if (!this._planePivot) this.createSectionCut();
        if (!this._planePivot) return;
        this._planePivot.position.fromArray(state.position);
        this._planePivot.rotation.set(...state.rotation);
        this._planePivot.updateWorldMatrix(true, false);
        this._updateClippingFromPivot();
    }

    /** Waagerechter Schnitt auf einer bestimmten Hoehe ueber einem Punkt. */
    placeSectionAt(center, y) {
        if (!this._planePivot) return;
        this._planePivot.position.set(center.x, y, center.z);
        this._planePivot.rotation.set(Math.PI / 2, 0, 0);
        this._planePivot.updateWorldMatrix(true, false);
        this._updateClippingFromPivot();
    }

    /** Show or hide the TransformControls gizmo without removing the clip plane. */
    setSectionGizmoVisible(visible) {
        if (this._tcHelper)          this._tcHelper.visible          = visible;
        if (this._transformControls) this._transformControls.enabled = visible;
    }

    /**
     * Hide section-cut visual helpers (gizmo + plane mesh) for an export snapshot.
     * The actual clipping plane stays active — only the visual overlays are hidden.
     * Returns an array of objects to restore via _restoreSectionVisuals().
     */
    _hideSectionVisuals() {
        const hidden = [];
        if (this._tcHelper && this._tcHelper.visible) {
            hidden.push(this._tcHelper);
            this._tcHelper.visible = false;
        }
        if (this._planePivot && this._planePivot.visible) {
            hidden.push(this._planePivot);
            this._planePivot.visible = false;
        }
        return hidden;
    }

    _restoreSectionVisuals(hidden) {
        for (const obj of hidden) obj.visible = true;
    }
}
