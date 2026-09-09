import * as OBC from '@thatopen/components';
import { boxenAktuell } from './DeltaBoxen.js';
import * as THREE from 'three';

/**
 * IfcCamera — alle Kamera-/Orbit-/View-Operationen für den IFC-Viewer.
 *
 * Wird von IfcEngine instanziiert und gehalten; bestehende Engine-Methoden
 * (viewTop, zoomToFit, lookAtPoint, …) delegieren 1:1 hierher, damit Vue-
 * Komponenten ohne Anpassung weiter funktionieren.
 *
 * Externe Abhängigkeit:
 *   getWorld()  → liefert die OBC.World (camera + controls + scene + renderer).
 *                 Lazy, weil World erst nach IfcEngine.init() existiert.
 *   getBounds() → liefert { box, center, size, maxDim } der geladenen Modelle
 *                 oder null. Wird für Framing-Operationen gebraucht.
 *   components  → die OBC.Components-Instanz (für FragmentsManager-Lookups
 *                 in fitToElement / fitToCategory).
 */
export class IfcCamera {
    constructor({ getWorld, getBounds, components }) {
        this._getWorld     = getWorld;
        this._getBounds    = getBounds;
        this._components   = components;

        // Zoom-Limits, die wir nach jedem fitToBox restoren (siehe _enforceZoomLimits).
        this._minDistance  = 0.01;
        this._minNear      = 0.001;
    }

    // ── Setup ────────────────────────────────────────────────────────────────

    /**
     * Initial-Konfiguration der camera-controls + Default-Pose.
     * Wird von IfcEngine.init() einmal aufgerufen, sobald die World existiert.
     */
    configure() {
        const world = this._getWorld();
        if (!world) return;

        // Near/Far + initiale Projection-Matrix
        world.camera.three.near = 0.05;
        world.camera.three.far  = 100000;
        world.camera.three.updateProjectionMatrix();

        // Default isometrische Pose
        const ctrls = world.camera.controls;
        ctrls.setLookAt(10, 10, 10, 0, 0, 0);

        // Dolly-Verhalten
        ctrls.dollySpeed    = 0.7;
        ctrls.dollyToCursor = true;
        ctrls.minDistance   = this._minDistance;
        ctrls.infinityDolly = true;

        // Maus-Belegung — Default von camera-controls ist:
        //   left = ROTATE, middle = DOLLY, right = TRUCK
        // Wir wollen CAD-Standard:
        //   left = ROTATE, middle = TRUCK (Pan, verschiebt Target mit), right = TRUCK
        // Pan/Truck bewegt Camera UND Orbit-Target parallel zur View-Ebene,
        // anders als Dolly (nur Distanz zur unveränderten Target-Position).
        this._applyMouseActions(ctrls, { middle: 'truck', right: 'truck' });

        // Watchdog: nach jeder User-Geste (Truck/Rotate/Wheel) Zoom-Limits restoren
        // UND das Target-Sanity prüfen — sonst driftet das Orbit-Target bei TRUCK
        // in den leeren Raum, weil die Truck-Geschwindigkeit mit distance(cam,target)
        // skaliert. Das macht später Wheel-Zoom "tot" (Δ zu winzig relativ zur Distanz).
        if (!this._controlEndHandler) {
            this._controlEndHandler = () => {
                this._enforceZoomLimits();
                this._sanitizeTarget();
            };
            ctrls.addEventListener?.('controlend', this._controlEndHandler);
        }
    }

    /**
     * Maus-Button-Belegung umkonfigurieren. Akzeptierte Aktions-Namen:
     *   'rotate' | 'truck' | 'offset' | 'dolly' | 'zoom' | 'none'
     * Beispiel: setMouseActions({ middle: 'dolly' })  — zurück zum camera-controls-Default
     */
    setMouseActions(map) {
        const ctrls = this._getWorld()?.camera?.controls;
        if (!ctrls) return;
        this._applyMouseActions(ctrls, map);
    }

    _applyMouseActions(ctrls, map) {
        // camera-controls stellt die ACTION-Enum am Konstruktor bereit
        const ACTION = ctrls?.constructor?.ACTION;
        if (!ACTION) return;
        const lookup = {
            rotate: ACTION.ROTATE,
            truck:  ACTION.TRUCK,
            offset: ACTION.OFFSET,
            dolly:  ACTION.DOLLY,
            zoom:   ACTION.ZOOM,
            none:   ACTION.NONE,
        };
        for (const [btn, action] of Object.entries(map)) {
            const a = lookup[action];
            if (a != null && ctrls.mouseButtons && btn in ctrls.mouseButtons) {
                ctrls.mouseButtons[btn] = a;
            }
        }
    }

    /** Direkter Zugriff für Picking/Raycasting (Engine-Layer braucht THREE-Camera). */
    /**
     * Die Bedienung sperren/freigeben — während ein Griff gezogen wird
     * (Teil XVI, S4). Dasselbe Muster wie der Schnitt-Gizmo (`controls.enabled`).
     */
    sperren(an) {
        const c = this.getControls();
        if (!c) return false;
        c.enabled = !an;
        return true;
    }

    getThree() {
        return this._getWorld()?.camera?.three ?? null;
    }

    /** Direkter Zugriff auf camera-controls — nur intern / für sehr spezielle Engine-Hooks. */
    getControls() {
        return this._getWorld()?.camera?.controls ?? null;
    }

    // ── View-Presets ─────────────────────────────────────────────────────────

    async zoomToFit() {
        const b = this._getBounds();
        if (!b) return;
        const d = b.maxDim * 1.5;
        const ctrls = this._getWorld().camera.controls;
        await ctrls.setLookAt(
            b.center.x + d * 0.6, b.center.y + d * 0.6, b.center.z + d * 0.6,
            b.center.x, b.center.y, b.center.z, true,
        );
        this._enforceZoomLimits();
    }

    async viewTop() {
        const b = this._getBounds();
        if (!b) return;
        const cam = this._getWorld().camera;
        // Looking straight down: default up=(0,1,0) is parallel to view direction → gimbal lock.
        // Set up=(0,0,-1) so the Z-axis points "north" on screen for a standard plan orientation.
        cam.three.up.set(0, 0, -1);
        await cam.controls.setLookAt(
            b.center.x, b.center.y + b.maxDim * 2, b.center.z,
            b.center.x, b.center.y,                b.center.z,
            false,  // immediate — no transition; PDF export needs final position right away
        );
        this._enforceZoomLimits();
    }

    async viewFront() {
        const b = this._getBounds();
        if (!b) return;
        const cam = this._getWorld().camera;
        cam.three.up.set(0, 1, 0);
        await cam.controls.setLookAt(
            b.center.x, b.center.y, b.center.z + b.maxDim * 2,
            b.center.x, b.center.y, b.center.z,
            false,
        );
        this._enforceZoomLimits();
    }

    async viewSide() {
        const b = this._getBounds();
        if (!b) return;
        const cam = this._getWorld().camera;
        cam.three.up.set(0, 1, 0);
        await cam.controls.setLookAt(
            b.center.x + b.maxDim * 2, b.center.y, b.center.z,
            b.center.x,                b.center.y, b.center.z,
            false,
        );
        this._enforceZoomLimits();
    }

    async resetView() {
        await this._getWorld().camera.controls.setLookAt(10, 10, 10, 0, 0, 0, true);
        this._enforceZoomLimits();
    }

    /** Switch between 'Perspective' and 'Orthographic'. */
    async setProjection(type) {
        const world = this._getWorld();
        if (world?.camera?.projection) {
            await world.camera.projection.set(type);
        }
    }

    // ── Bewegung / Animation ─────────────────────────────────────────────────


    /**
     * Kamera auf einen Welt-Punkt richten. Der Punkt wird damit auch zum neuen
     * Orbit-Target — Folge-Rotationen drehen um diesen Punkt.
     */
    async lookAtPoint(x, y, z, distance = 5) {
        const ctrls = this._getWorld()?.camera?.controls;
        if (!ctrls) return;
        await ctrls.setLookAt(x + distance, y + distance, z + distance, x, y, z, true);
        this._enforceZoomLimits();
    }

    /**
     * Generisches Fit-to-Box mit anschließendem Restore der Zoom-Limits.
     * Wird intern von fitToElement / fitToCategory / gotoStoreyBox genutzt.
     */
    async fitToBox(box, { padding = 0.5, padBoxScalar = 0 } = {}) {
        const ctrls = this._getWorld()?.camera?.controls;
        if (!ctrls || !box || box.isEmpty?.()) return false;

        if (padBoxScalar > 0) {
            // Kopie damit der Aufrufer-Box nicht mutiert
            const padded = box.clone();
            padded.expandByScalar(padBoxScalar);
            box = padded;
        }

        await ctrls.fitToBox(box, true, {
            paddingLeft:   padding,
            paddingRight:  padding,
            paddingTop:    padding,
            paddingBottom: padding,
        });
        this._enforceZoomLimits();
        return true;
    }

    /** Fit ein einzelnes Modell (initial nach Laden). Immediate (kein Tween). */
    async fitToModel(model) {
        const world = this._getWorld();
        if (!world) return;
        try {
            // Box source: model.box first, Three.js scene-graph fallback
            let box = model.box;
            if (!box || box.isEmpty()) box = new THREE.Box3().setFromObject(model.object);
            if (!box || box.isEmpty()) {
                box = new THREE.Box3(
                    new THREE.Vector3(-100, -100, -100),
                    new THREE.Vector3( 100,  100,  100),
                );
            }
            const center = new THREE.Vector3();
            const size   = new THREE.Vector3();
            box.getCenter(center);
            box.getSize(size);
            const d = Math.max(size.x, size.y, size.z) * 1.5;

            await world.camera.controls.setLookAt(
                center.x + d * 0.6, center.y + d * 0.6, center.z + d * 0.6,
                center.x, center.y, center.z, false,
            );
            this._enforceZoomLimits();
        } catch (e) {
            console.warn('[IfcCamera] Could not fit camera:', e);
        }
    }

    /**
     * Fit-to-Element by modelId+localId. Selection wird vom Engine-Layer
     * gemacht — diese Methode kümmert sich nur um die Kamera.
     */
    async fitToElement(modelId, localId, { padBoxScalar } = {}) {
        const fragments = this._components.get(OBC.FragmentsManager);
        const model     = fragments?.list?.get(modelId);
        if (!model) return false;

        let boxes;
        // Die AKTUELLE Box — ein verschobenes Bauteil steht im Delta-Modell.
        try { boxes = await boxenAktuell(model, [localId], (id) => fragments.list.get(id)); } catch { return false; }
        if (!boxes?.length || boxes[0].isEmpty()) return false;

        const box  = boxes[0];
        const size = new THREE.Vector3();
        box.getSize(size);
        const pad  = padBoxScalar ?? Math.max(size.x, size.y, size.z) * 0.2;

        return this.fitToBox(box, { padding: 0.5, padBoxScalar: pad });
    }

    /** Fit auf alle Elemente einer Kategorie (Union-Bbox). */
    async fitToCategory(categoryGroup) {
        if (!categoryGroup?.groupData?.get) return false;
        const map       = await categoryGroup.groupData.get();
        const fragments = this._components.get(OBC.FragmentsManager);

        const union = new THREE.Box3();
        union.makeEmpty();
        for (const [modelId, ids] of Object.entries(map)) {
            const model = fragments.list.get(modelId);
            if (!model || !ids?.length) continue;
            try {
                const boxes = await boxenAktuell(model, ids, (id) => fragments.list.get(id));
                for (const b of boxes) if (b && !b.isEmpty()) union.union(b);
            } catch { /* skip */ }
        }
        if (union.isEmpty()) return false;

        return this.fitToBox(union, { padding: 0.5 });
    }

    // ── Orbit-Modi (wiederverwendbar) ────────────────────────────────────────

    /**
     * Setzt das Orbit-Target auf einen Welt-Punkt OHNE die Kamera zu bewegen.
     * Folge-Maus-Rotationen kreisen ab jetzt um diesen Punkt. Standard-Pattern
     * für Mess-/Annotations-Workflows.
     */
    async orbitAroundPoint(point) {
        const ctrls = this._getWorld()?.camera?.controls;
        if (!ctrls || !point) return;
        const cam = this._getWorld().camera.three;
        // Mit MINDEST-ELEVATION (S7): ein Ziel auf Kamerahöhe ergab einen
        // waagerechten Blick, und jede waagerechte Ziehebene lag auf der Kante.
        const p = positionMitElevation(cam.position, point, MINDEST_ELEVATION_GRAD);
        await ctrls.setLookAt(
            p.x, p.y, p.z,
            point.x, point.y, point.z,
            true,
        );
    }

    /** Convenience: Orbit-Target = aktueller Messpunkt. */
    async orbitAroundMeasurePoint(point) {
        return this.orbitAroundPoint(point);
    }

    /**
     * Orbit-Target = Bbox-Center eines selektierten Elements (ohne Frame-Animation).
     * Praktisch wenn der User die Kamera-Distanz behalten will, nur die Drehachse
     * verschieben.
     */
    async orbitAroundSelection(modelId, localId) {
        const fragments = this._components.get(OBC.FragmentsManager);
        const model     = fragments?.list?.get(modelId);
        if (!model) return false;
        let boxes;
        // Um das Bauteil DORT kreisen, wo es steht — nach einem Zug im Delta-Modell,
        // nicht am Lieferort (Headless 2026-09-08: der Griff lag ausserhalb des Bilds).
        try { boxes = await boxenAktuell(model, [localId], (id) => fragments.list.get(id)); } catch { return false; }
        if (!boxes?.length || boxes[0].isEmpty()) return false;
        const center = new THREE.Vector3();
        boxes[0].getCenter(center);
        await this.orbitAroundPoint(center);
        return true;
    }

    // ── Saved-View State ─────────────────────────────────────────────────────

    /** Kamera-Pose abgreifen (für gespeicherte Ansichten). */
    captureState() {
        const world = this._getWorld();
        if (!world) return null;
        const cam    = world.camera.three;
        const ctrls  = world.camera.controls;
        const target = new THREE.Vector3();
        ctrls.getTarget(target);
        return {
            position: cam.position.toArray(),
            target:   target.toArray(),
            up:       cam.up.toArray(),
        };
    }

    /** Kamera-Pose wiederherstellen (animiert). */
    async applyState(state) {
        if (!state) return;
        const world = this._getWorld();
        if (!world) return;
        const cam   = world.camera.three;
        const ctrls = world.camera.controls;

        if (state.up) cam.up.fromArray(state.up);
        const p = state.position;
        const t = state.target;
        if (p && t) {
            await ctrls.setLookAt(p[0], p[1], p[2], t[0], t[1], t[2], true);
            this._enforceZoomLimits();
        }
    }

    /** Current orbit-target. Vom PDF-Modal genutzt um Pan-Offsets relativ zum
     *  Controls-Target auszudrücken. */
    getTarget() {
        const t = new THREE.Vector3();
        const ctrl = this._getWorld()?.camera?.controls;
        if (ctrl?.getTarget) ctrl.getTarget(t);
        return { x: t.x, y: t.y, z: t.z };
    }

    // ── Snapshot-Rendering (PDF export) ──────────────────────────────────────






    // ── Zoom-Limit Enforcement (Bug-Fix) ─────────────────────────────────────

    /**
     * camera-controls' fitToBox() / setLookAt() schreibt unter Umständen
     * `minDistance` / `boundary*` neu — danach lässt sich nicht mehr ganz nah
     * an das Modell ran-zoomen. Wir restoren die Limits nach jedem Framing
     * und passen `camera.three.near` an die aktuelle Target-Distanz an,
     * damit Near-Plane-Clipping nicht als "Zoom-Stop" wahrgenommen wird.
     */
    /**
     * Wenn das Orbit-Target nach einer User-Geste deutlich außerhalb des Modells
     * gelandet ist (typisch: Truck im leeren Raum bei großer Distance), snap es
     * an den nächsten sinnvollen Punkt heran. Die Kamera-Position bleibt
     * unverändert — der User sieht keinen Sprung, nur der Pivot wandert ans
     * Modell zurück, und Truck/Dolly werden wieder vernünftig.
     */
    _sanitizeTarget() {
        const bounds = this._getBounds?.();
        if (!bounds) return;
        const ctrls = this._getWorld()?.camera?.controls;
        const cam   = this._getWorld()?.camera?.three;
        if (!ctrls || !cam) return;

        const tgt = new THREE.Vector3();
        ctrls.getTarget?.(tgt);

        // Wenn das Target weiter als 5× die Modell-Diagonale vom Modell-Center
        // entfernt ist, ist Truck offensichtlich davongelaufen.
        const driftLimit = bounds.maxDim * 5;
        const drift      = tgt.distanceTo(bounds.center);
        if (drift <= driftLimit) return;

        // Wir wollen die Kamera-Pose erhalten — also nur das Target schubsen.
        // Strategie: Strahl von Kamera in Blickrichtung schneiden mit der Modell-
        // Bbox; falls kein Schnitt → einfach Modell-Center als Target setzen.
        const viewDir = new THREE.Vector3().subVectors(tgt, cam.position).normalize();
        const ray     = new THREE.Ray(cam.position, viewDir);
        const hit     = new THREE.Vector3();
        const newTarget = ray.intersectBox(bounds.box, hit) ? hit : bounds.center.clone();

        // setTarget mit enableTransition=false → kein Animations-Glitch
        ctrls.setTarget?.(newTarget.x, newTarget.y, newTarget.z, false);
    }

    _enforceZoomLimits() {
        const world = this._getWorld();
        if (!world) return;
        const ctrls = world.camera.controls;
        const cam   = world.camera.three;

        // Minimal-Distanz wieder runterziehen falls fitToBox sie hochgesetzt hat
        ctrls.minDistance   = this._minDistance;
        ctrls.infinityDolly = true;

        // Near dynamisch: 0.1 % der Target-Distanz, gekappt nach unten auf _minNear
        const tgt = new THREE.Vector3();
        ctrls.getTarget?.(tgt);
        const dist = cam.position.distanceTo(tgt);
        const targetNear = Math.max(this._minNear, dist * 0.001);
        if (Math.abs(cam.near - targetNear) > 1e-6) {
            cam.near = targetNear;
            cam.updateProjectionMatrix();
        }
    }

    /**
     * Aufraeumen. Der Offscreen-Puffer, den es hier zu befreien gab, ist mit
     * dem PDF-Modal entfallen (Sprint I/AP-11); die Methode bleibt als
     * Anlaufstelle des Besitzers — IfcEngine.dispose() ruft sie.
     */
    dispose() {}

}

/** Unter diesem Winkel über der Waagerechten schaut die Kamera nicht mehr auf ein Ziel (S7). */
export const MINDEST_ELEVATION_GRAD = 20;

/**
 * Die Kameraposition so heben, dass der Blick aufs Ziel mindestens `grad`
 * über der Waagerechten liegt — Abstand bleibt, Richtung im Grundriss bleibt.
 * Rein, damit es prüfbar ist.
 */
export function positionMitElevation(position, ziel, grad = MINDEST_ELEVATION_GRAD) {
    const d = { x: position.x - ziel.x, y: position.y - ziel.y, z: position.z - ziel.z };
    const abstand = Math.hypot(d.x, d.y, d.z);
    const flach = Math.hypot(d.x, d.z);
    if (!(abstand > 1e-9)) return { x: position.x, y: position.y, z: position.z };
    const winkel = Math.atan2(d.y, flach);
    const min = (grad * Math.PI) / 180;
    if (winkel >= min) return { x: position.x, y: position.y, z: position.z };
    // Richtung im Grundriss behalten (oder +x, wenn die Kamera senkrecht darunter stand)
    const ex = flach > 1e-9 ? d.x / flach : 1, ez = flach > 1e-9 ? d.z / flach : 0;
    return {
        x: ziel.x + ex * abstand * Math.cos(min),
        y: ziel.y + abstand * Math.sin(min),
        z: ziel.z + ez * abstand * Math.cos(min),
    };
}

