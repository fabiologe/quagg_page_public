/**
 * Issue-Pins im Raum (Sprint I, Stufe 5).
 *
 * Ausgelagert aus `IfcEngine` nach dem Hausmuster von `IfcCamera`: ein
 * Optionsobjekt im Konstruktor, Abhängigkeiten als Getter-Closures (die World
 * gibt es erst nach `IfcEngine.init()`), der Besitzer behält 1:1-Delegationen.
 *
 * Zwei exklusive Felder, keine geteilten — deshalb ein sauberer Schnitt.
 * Vom Renderer weiß der Dienst nichts; die Kamera liest er nur, und nur für
 * den entfernungsabhängigen Radius der Marke.
 *
 * `probePoint` ist der einzige Baustein, der ihm nicht gehört: das Anlegen
 * eines Pins per Bildschirmklick braucht einen Weltpunkt, und der kommt aus
 * dem Picking. Er wird deshalb hereingereicht, statt hier nachgebaut zu
 * werden.
 *
 * WICHTIG: Die Wahrheit über die Issues liegt im Store (`useIfcStore`), nicht
 * hier. Seit Sprint I folgt die Anzeige ihm über eine Beobachtung in
 * IfcViewer — vorher spiegelte nur eine von sieben Store-Änderungen hierher,
 * und die Listen liefen beim Löschen auseinander.
 */

import * as THREE from 'three';

export class IfcAnnotations {
    /**
     * @param {object}   opt
     * @param {Function} opt.getWorld    () => World (lazy, siehe Kopf)
     * @param {Function} opt.probePoint  (clientX, clientY) => Promise<Vector3|null>
     * @param {Function} [opt.probeTreffer] (clientX, clientY) => Promise<{point, modelId}|null>
     *                   — sagt zusätzlich, WELCHES Modell der Strahl traf
     */
    constructor({ getWorld, probePoint, probeTreffer = null }) {
        this._getWorld = getWorld;
        this._probePoint = probePoint;
        this._probeTreffer = probeTreffer;
        this._annotationGroup = null;
        this._annotations = [];
    }

    enableAnnotationMode() {
        if (this._annotationGroup) return;
        const world = this._getWorld();
        this._annotationGroup = new THREE.Group();
        this._annotationGroup.name = 'annotation-overlay';
        world.scene.three.add(this._annotationGroup);
        // Existing persisted annotations get redrawn
        for (const a of (this._annotations ?? [])) this._drawAnnotationMarker(a);
    }

    disableAnnotationMode() {
        // Keep _annotations data; just remove visuals
        if (!this._annotationGroup) return;
        const world = this._getWorld();
        this._annotationGroup.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
        world.scene.three.remove(this._annotationGroup);
        this._annotationGroup = null;
    }

    /**
     * Annotation an einem bekannten WELT-Punkt anlegen (Sprint U): das
     * Kontextmenü am gewählten Bauteil kennt dessen Mittelpunkt bereits und
     * braucht keinen Bildschirm-Treffer.
     */
    addAnnotationAt(position, text, color = '#e91e63') {
        if (!Array.isArray(position) || position.length < 3) return null;
        if (!this._annotations) this._annotations = [];
        const ann = {
            id:   Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            position: [position[0], position[1], position[2]],
            text: (text ?? '').trim(),
            color,
            labelOffset: [40, -60],
            idx:  this._annotations.length + 1,
        };
        this._annotations.push(ann);
        if (this._annotationGroup) this._drawAnnotationMarker(ann);
        return ann;
    }

    async addAnnotation(clientX, clientY, text, color = '#e91e63') {
        // EIN Strahl, der Punkt UND Modell nennt: das Issue gehört dem Modell,
        // an dem es sitzt (Stufe 4, nachgereicht) — nicht dem zuerst geladenen.
        const t = this._probeTreffer ? await this._probeTreffer(clientX, clientY) : null;
        const pt = this._probeTreffer ? t?.point : await this._probePoint(clientX, clientY);
        if (!pt) return null;
        if (!this._annotations) this._annotations = [];

        const ann = {
            id:   Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            position: [pt.x, pt.y, pt.z],
            text: (text ?? '').trim(),
            color,
            labelOffset: [40, -60], // px offset of speech bubble from the pin in screen-space
            idx:  this._annotations.length + 1,
            modelId: t?.modelId ?? null,    // sitzungsgebunden — `useAnnotationen` macht daraus den Modell-Key
        };
        this._annotations.push(ann);

        if (this._annotationGroup) this._drawAnnotationMarker(ann);
        return ann;
    }

    /** Update an annotation in place. Provide any subset of { text, color, labelOffset, position }. */
    updateAnnotation(id, patch) {
        if (!this._annotations) return false;
        const a = this._annotations.find(x => x.id === id);
        if (!a) return false;
        Object.assign(a, patch);
        if (patch.color !== undefined && this._annotationGroup) {
            // Redraw to pick up the new color
            this.setAnnotations(this._annotations);
        }
        return true;
    }

    removeAnnotation(id) {
        if (!this._annotations) return;
        this._annotations = this._annotations.filter(a => a.id !== id);
        // Renumber
        this._annotations.forEach((a, i) => { a.idx = i + 1; });
        // Re-draw all
        if (this._annotationGroup) {
            const world = this._getWorld();
            this._annotationGroup.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            while (this._annotationGroup.children.length) {
                this._annotationGroup.remove(this._annotationGroup.children[0]);
            }
            for (const a of this._annotations) this._drawAnnotationMarker(a);
        }
    }

    clearAnnotations() {
        this._annotations = [];
        if (this._annotationGroup) {
            this._annotationGroup.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            while (this._annotationGroup.children.length) {
                this._annotationGroup.remove(this._annotationGroup.children[0]);
            }
        }
    }

    /** Replace the entire annotation list (used when loading from localStorage). */
    setAnnotations(arr) {
        this._annotations = (arr ?? []).map((a, i) => ({ ...a, idx: i + 1 }));
        if (this._annotationGroup) {
            this._annotationGroup.traverse(o => {
                if (o.geometry) o.geometry.dispose();
                if (o.material) o.material.dispose();
            });
            while (this._annotationGroup.children.length) {
                this._annotationGroup.remove(this._annotationGroup.children[0]);
            }
            for (const a of this._annotations) this._drawAnnotationMarker(a);
        }
    }

    getAnnotations() { return [...(this._annotations ?? [])]; }

    _drawAnnotationMarker(ann) {
        const cam     = this._getWorld().camera.three;
        const pos     = new THREE.Vector3().fromArray(ann.position);
        const camDist = cam.position.distanceTo(pos);
        const r       = Math.max(0.12, camDist / 150);

        // Outer ring for visibility against any background
        const ringGeo = new THREE.SphereGeometry(r * 1.4, 14, 14);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(pos);
        ring.renderOrder = 999;

        // Inner pin in the annotation's color
        const colorHex = ann.color ? new THREE.Color(ann.color).getHex() : 0xe91e63;
        const pinGeo = new THREE.SphereGeometry(r, 14, 14);
        const pinMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
        const pin    = new THREE.Mesh(pinGeo, pinMat);
        pin.position.copy(pos);
        pin.renderOrder = 1000;
        pin.userData.annotationId = ann.id;
        pin.userData.idx          = ann.idx;

        this._annotationGroup.add(ring);
        this._annotationGroup.add(pin);
    }
}
