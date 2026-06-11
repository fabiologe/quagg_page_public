import * as OBC from '@thatopen/components';
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
        this._lastPlotFrustum = null;
        this._auxRT        = null;

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

    /** Pan in pixel-deltas (camera-controls wandelt selbst in Weltkoordinaten um). */
    truck(dx, dy) {
        this._getWorld()?.camera?.controls?.truck(dx, dy, false);
    }

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
        try { boxes = await model.getBoxes([localId]); } catch { return false; }
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
                const boxes = await model.getBoxes(ids);
                for (const b of boxes) if (!b.isEmpty()) union.union(b);
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
        await ctrls.setLookAt(
            cam.position.x, cam.position.y, cam.position.z,
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
        try { boxes = await model.getBoxes([localId]); } catch { return false; }
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

    /**
     * Rendert die Live-Szene durch eine beliebige Kamera in ein 2D-Canvas.
     * Reuse-Pattern (Render-Target), damit der Overview-Tab des PDF-Modals bei
     * 30 fps nicht den GPU-Speicher flutet.
     *
     * Hidden-Helpers (TC-Gizmo + Section-Plane-Mesh) müssen vom Aufrufer
     * versteckt werden (Engine.withSectionVisualsHidden umschließt diesen Call).
     */
    renderToCanvas(canvas2d, camera, { onBeforeRender, onAfterRender } = {}) {
        const world = this._getWorld();
        if (!world || !canvas2d || !camera) return false;
        const renderer = world.renderer.three;
        const scene    = world.scene.three;
        const w = canvas2d.width;
        const h = canvas2d.height;
        if (!w || !h) return false;

        if (!this._auxRT || this._auxRT.width !== w || this._auxRT.height !== h) {
            if (this._auxRT) this._auxRT.dispose();
            this._auxRT = new THREE.WebGLRenderTarget(w, h, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format:    THREE.RGBAFormat,
            });
        }
        const rt = this._auxRT;

        onBeforeRender?.();
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        onAfterRender?.();

        const pixels = new Uint8ClampedArray(w * h * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);

        const ctx = canvas2d.getContext('2d');
        const imageData = ctx.createImageData(w, h);
        const stride = w * 4;
        for (let y = 0; y < h; y++) {
            const src = (h - 1 - y) * stride;
            imageData.data.set(pixels.subarray(src, src + stride), y * stride);
        }
        ctx.putImageData(imageData, 0, 0);
        return true;
    }

    /**
     * Off-screen ortho render in ein RenderTarget mit Papier-Aspect.
     * Shared zwischen getScaleSnapshot und getOverviewSnapshot.
     *
     * `onBeforeRender` / `onAfterRender` werden um den eigentlichen renderer.render()
     * Aufruf gelegt — dort kann die Engine z. B. Section-Visuals ausblenden.
     */
    _renderOrthoOffscreen(target, halfW, halfH, viewDir, rtW, rtH, hooks = {}) {
        const world    = this._getWorld();
        const renderer = world.renderer.three;
        const scene    = world.scene.three;
        const mainCam  = world.camera.three;

        const rt = new THREE.WebGLRenderTarget(rtW, rtH, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format:    THREE.RGBAFormat,
        });

        const ortho = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -100000, 100000);
        if (viewDir === 'front') {
            ortho.position.set(target.x, target.y, target.z + 10000);
            ortho.up.set(0, 1, 0);
        } else if (viewDir === 'side') {
            ortho.position.set(target.x + 10000, target.y, target.z);
            ortho.up.set(0, 1, 0);
        } else {
            // top view: Z points "north" on paper
            ortho.position.set(target.x, target.y + 10000, target.z);
            ortho.up.set(0, 0, -1);
        }
        ortho.lookAt(target.x, target.y, target.z);
        ortho.updateProjectionMatrix();

        hooks.onBeforeRender?.();
        renderer.setRenderTarget(rt);
        renderer.render(scene, ortho);
        renderer.setRenderTarget(null);
        hooks.onAfterRender?.();

        const pixels = new Uint8ClampedArray(rtW * rtH * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, rtW, rtH, pixels);
        rt.dispose();

        const out = document.createElement('canvas');
        out.width = rtW; out.height = rtH;
        const ctx = out.getContext('2d');
        for (let y = 0; y < rtH; y++) {
            const row = new Uint8ClampedArray(pixels.buffer, (rtH - 1 - y) * rtW * 4, rtW * 4);
            ctx.putImageData(new ImageData(row, rtW, 1), 0, y);
        }

        renderer.render(scene, mainCam);
        return { dataUrl: out.toDataURL('image/png', 0.92), ortho };
    }

    /**
     * Maßstabs-genauer Ortho-Snapshot (PDF-Export Plot-Bereich).
     * `hooks.onBeforeRender/onAfterRender` für Section-Visual-Hide.
     */
    getScaleSnapshot(scaleRatio, drawWidthMm, drawHeightMm, viewDir = 'top', pxPerMm = 10, panX = 0, panZ = 0, hooks = {}) {
        const world = this._getWorld();
        if (!world) return null;

        const halfW = (drawWidthMm  / 1000 * scaleRatio) / 2;
        const halfH = (drawHeightMm / 1000 * scaleRatio) / 2;
        const rtW   = Math.round(drawWidthMm  * pxPerMm);
        const rtH   = Math.round(drawHeightMm * pxPerMm);

        const target = new THREE.Vector3();
        world.camera.controls.getTarget(target);
        target.x += panX;
        target.z += panZ;

        const { dataUrl, ortho } = this._renderOrthoOffscreen(target, halfW, halfH, viewDir, rtW, rtH, hooks);

        this._lastPlotFrustum = {
            left:     ortho.left,
            right:    ortho.right,
            top:      ortho.top,
            bottom:   ortho.bottom,
            position: ortho.position.toArray(),
            target:   [target.x, target.y, target.z],
            up:       ortho.up.toArray(),
            viewDir,
            scaleRatio,
            drawWidthMm,
            drawHeightMm,
        };

        return dataUrl;
    }

    /**
     * Top-Down Übersichts-Snapshot für die PDF-Modal-Thumbnail.
     *   getOverviewSnapshot(w, h)          — fit-all (Modell-Bbox + 10 % Padding)
     *   getOverviewSnapshot(w, h, bounds)  — explizite XZ-Extent (Wheel-Zoom)
     */
    getOverviewSnapshot(widthPx = 240, heightPx = 160, viewBounds = null, hooks = {}) {
        const world = this._getWorld();
        if (!world) return null;
        const modelBounds = this._getBounds();
        if (!modelBounds) return null;

        const canvasAspect = widthPx / heightPx;
        let halfW, halfH, target;

        if (viewBounds) {
            const reqW = viewBounds.maxX - viewBounds.minX;
            const reqD = viewBounds.maxZ - viewBounds.minZ;
            const reqAspect = reqW / reqD;
            if (reqAspect > canvasAspect) {
                halfW = reqW / 2;
                halfH = halfW / canvasAspect;
            } else {
                halfH = reqD / 2;
                halfW = halfH * canvasAspect;
            }
            target = new THREE.Vector3(
                (viewBounds.minX + viewBounds.maxX) / 2,
                modelBounds.center.y,
                (viewBounds.minZ + viewBounds.maxZ) / 2,
            );
        } else {
            const pad = 1.10;
            const worldW = modelBounds.size.x * pad;
            const worldD = modelBounds.size.z * pad;
            const worldAspect = worldW / worldD;
            if (worldAspect > canvasAspect) {
                halfW = worldW / 2;
                halfH = halfW / canvasAspect;
            } else {
                halfH = worldD / 2;
                halfW = halfH * canvasAspect;
            }
            target = modelBounds.center.clone();
        }

        const { dataUrl } = this._renderOrthoOffscreen(target, halfW, halfH, 'top', widthPx, heightPx, hooks);
        return {
            dataUrl,
            bounds: {
                minX: target.x - halfW, maxX: target.x + halfW,
                minZ: target.z - halfH, maxZ: target.z + halfH,
            },
        };
    }

    getLastPlotFrustum() { return this._lastPlotFrustum ?? null; }

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
}
