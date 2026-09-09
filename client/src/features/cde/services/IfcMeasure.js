/**
 * Streckenmessung im Raum (Sprint I, Stufe 5).
 *
 * Ausgelagert aus `IfcEngine` nach dem Hausmuster von `IfcCamera`. Fünf
 * exklusive Felder, keine geteilten; `probePoint` kommt wie bei den
 * Annotationen aus dem Picking und wird hereingereicht.
 *
 * OFFENE FRAGE — am Bildschirm zu klären:
 * Seit Sprint U/AP-U4 zeichnet das HUD (`CdeHudLayer`) die Messstrecken im
 * BILDSCHIRMRAUM als SVG-Linie zwischen den projizierten Punkten. Dieser
 * Dienst zeichnet zusätzlich eine 3D-Linie und Kugeln an den Endpunkten —
 * beides überlagert sich vermutlich. Dass `IfcViewer.deleteMeasurement` beim
 * Entfernen EINER Messung alle 3D-Marken wegwirft, ist ein Hinweis darauf,
 * dass hier schon länger niemand mehr hingesehen hat.
 *
 * Die Auslagerung ist deshalb bewusst VERHALTENSGLEICH: was gezeichnet wird,
 * ist eine Frage fürs Auge, nicht für die Entflechtung. Fällt die 3D-Linie
 * später weg, schrumpft dieser Dienst auf etwa ein Drittel.
 *
 * `_measurements` schreibt der Dienst, gelesen hat es zuletzt niemand — die
 * Liste, die zählt, ist die Vue-Ref in IfcViewer.
 */

import * as THREE from 'three';

export class IfcMeasure {
    /**
     * @param {object}   opt
     * @param {Function} opt.getWorld    () => World (lazy)
     * @param {Function} opt.probePoint  (clientX, clientY) => Promise<Vector3|null>
     */
    constructor({ getWorld, probePoint }) {
        this._getWorld = getWorld;
        this._probePoint = probePoint;
        this._measureGroup = null;
        this._measurePoints = [];
        this._measurements = [];
        this._hoverMarker = null;
        this._firstMarker = null;
    }

    /**
     * Enable interactive distance measurement. Each call to addMeasurePoint(x,y)
     * adds a point; on the 2nd point, a distance is computed and returned.
     */
    enableMeasureMode() {
        if (this._measureGroup) return;
        const world = this._getWorld();
        this._measureGroup = new THREE.Group();
        this._measureGroup.name = 'measurement-overlay';
        world.scene.three.add(this._measureGroup);
        this._measurePoints = [];   // Array<THREE.Vector3>
        this._measurements  = [];   // [{ p1, p2, dist, line, marker1, marker2 }]
    }

    disableMeasureMode() {
        if (!this._measureGroup) return;
        const world = this._getWorld();
        this._measureGroup.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        world.scene.three.remove(this._measureGroup);
        this._measureGroup  = null;
        this._measurePoints = [];
        this._measurements  = [];
        this._hoverMarker   = null;
        this._firstMarker   = null;
    }

    /**
     * Update the live hover-marker so the user sees exactly where the next
     * measure point would land. Call from a mousemove handler while in measure mode.
     */
    async updateMeasureHover(clientX, clientY) {
        if (!this._measureGroup) return null;
        const pt = await this._probePoint(clientX, clientY);
        return this.updateMeasureHoverAn(pt);
    }

    /**
     * Den Hover-Marker an einen SCHON BEKANNTEN Punkt setzen (Teil XVI): der
     * Zeiger-Stapel hat den Treffer bereits — ein zweiter Raycast je Bewegung
     * wäre ein zweiter Worker-Roundtrip für dieselbe Antwort.
     * @param {{x,y,z}|null} punkt
     */
    updateMeasureHoverAn(punkt) {
        if (!this._measureGroup) return null;
        const pt = (punkt && Number.isFinite(punkt.x)) ? new THREE.Vector3(punkt.x, punkt.y, punkt.z) : null;
        if (!pt) {
            if (this._hoverMarker) this._hoverMarker.visible = false;
            return null;
        }
        if (!this._hoverMarker) {
            const geo = new THREE.SphereGeometry(0.12, 14, 14);
            const mat = new THREE.MeshBasicMaterial({
                color: 0x00e5ff, transparent: true, opacity: 0.7, depthTest: false,
            });
            this._hoverMarker = new THREE.Mesh(geo, mat);
            this._hoverMarker.renderOrder = 1000;
            this._measureGroup.add(this._hoverMarker);
        }
        // Adapt marker size to camera distance so it stays roughly the same on screen
        const cam     = this._getWorld().camera.three;
        const camDist = cam.position.distanceTo(pt);
        const scale   = Math.max(0.3, camDist / 30);
        this._hoverMarker.scale.setScalar(scale);
        this._hoverMarker.position.copy(pt);
        this._hoverMarker.visible = true;
        return pt;
    }

    /**
     * Add a measurement point at screen coords. Uses OBC fragment raycast.
     * Returns { phase, dist?, p1?, p2? }.
     */
    async addMeasurePoint(clientX, clientY) {
        if (!this._measureGroup) return null;
        const hit = await this._probePoint(clientX, clientY);
        if (!hit) return { phase: 'no-hit' };

        this._measurePoints.push(hit);

        if (this._measurePoints.length < 2) {
            // First point: prominent pulsing marker
            this._addMeasureMarker(hit, /* isFirst */ true);
            return { phase: 'awaiting-second', p1: hit };
        }

        // Second point: convert the pending "first" marker to a regular one + draw line
        this._convertFirstMarkerToFinal();
        this._addMeasureMarker(hit, /* isFirst */ false);

        const [p1, p2] = this._measurePoints;
        const dist = p1.distanceTo(p2);
        this._addMeasureLine(p1, p2, dist);
        this._measurements.push({ p1, p2, dist });
        this._measurePoints = []; // ready for next measurement

        return { phase: 'complete', dist, p1, p2 };
    }

    _convertFirstMarkerToFinal() {
        if (!this._firstMarker) return;
        this._firstMarker.material.color.setHex(0xffeb3b);
        this._firstMarker.material.opacity = 1;
        this._firstMarker.material.transparent = false;
        this._firstMarker.userData.isFirst = false;
        this._firstMarker = null;
    }

    /** Remove all measurements but keep measure mode active. */
    clearMeasurements() {
        if (!this._measureGroup) return;
        while (this._measureGroup.children.length) {
            const c = this._measureGroup.children.pop();
            if (c.geometry) c.geometry.dispose();
            if (c.material) c.material.dispose();
            this._measureGroup.remove(c);
        }
        this._measurements  = [];
        this._measurePoints = [];
        this._hoverMarker   = null;
        this._firstMarker   = null;
    }

    _addMeasureMarker(point, isFirst = false) {
        // Camera-relative scale so markers stay visible at any zoom
        const cam     = this._getWorld().camera.three;
        const camDist = cam.position.distanceTo(point);
        const baseR   = Math.max(0.08, camDist / 200);

        const geo = new THREE.SphereGeometry(baseR, 14, 14);
        const mat = isFirst
            ? new THREE.MeshBasicMaterial({ color: 0xff4081, depthTest: false }) // pink for first
            : new THREE.MeshBasicMaterial({ color: 0xffeb3b, depthTest: false }); // yellow for set
        const sphere = new THREE.Mesh(geo, mat);
        sphere.position.copy(point);
        sphere.renderOrder = 999;
        sphere.userData.isFirst = isFirst;
        this._measureGroup.add(sphere);

        if (isFirst) {
            // Add a ring around it for extra prominence
            const ringGeo = new THREE.RingGeometry(baseR * 1.8, baseR * 2.4, 32);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0xff4081, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthTest: false,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(point);
            // face the camera
            ring.lookAt(cam.position);
            ring.renderOrder = 999;
            sphere.add(ring);
            this._firstMarker = sphere;
        }
    }

    _addMeasureLine(p1, p2, dist) {
        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const mat = new THREE.LineBasicMaterial({
            color: 0xffeb3b, linewidth: 2, depthTest: false,
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 999;
        this._measureGroup.add(line);
        // Label is rendered in the DOM by the Vue layer (3D HTML labels are heavy);
        // engine returns distance, UI shows it as a toast + sidebar list.
    }
}
