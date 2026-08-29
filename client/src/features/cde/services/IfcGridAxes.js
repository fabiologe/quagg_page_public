/**
 * Trassen und Achsenraster des Modells (Sprint I, Stufe 5).
 *
 * Ausgelagert aus `IfcEngine` nach dem Hausmuster. Ein exklusives Feld
 * (`_ifcGridGroups`) und keine geteilten — der sauberste Schnitt nach dem
 * zustandslosen `IfcItemData`.
 *
 * Zwei Dinge, die leicht zu verwechseln sind:
 *   `ladeAchsen`  — horizontale Trassen (Alignments) einer Tiefbau-Planung.
 *                   Sie werden nur in die Szene gehaengt, nicht verwaltet.
 *   `ladeRaster`  — das DIN-Achsenraster (IfcGrid). Das wird gemerkt, weil es
 *                   ein- und ausblendbar ist und der Planexport seine Achsen
 *                   als Linien braucht.
 *
 * Nicht zu verwechseln mit `_sceneGrid` in der Engine — das ist das
 * Bezugsraster des Viewers, kein Modellinhalt.
 */

import * as THREE from 'three';

export class IfcGridAxes {
    constructor() {
        /** THREE.Group je geladenem Achsenraster. Lazy — viele Modelle haben keines. */
        this._ifcGridGroups = null;
    }

    async ladeAchsen(model, world) {
        try {
            const g = await model.getHorizontalAlignments();
            if (g?.children?.length) world.scene.three.add(g);
        } catch (_) { /* model has no alignments */ }
    }

    async ladeRaster(model, world) {
        try {
            const g = await model.getGrids();
            if (g?.children?.length) {
                g.userData.isIfcGridContainer = true;
                world.scene.three.add(g);
                if (!this._ifcGridGroups) this._ifcGridGroups = [];
                this._ifcGridGroups.push(g);
            }
        } catch (_) { /* model has no grids */ }
    }

    /** Toggle the visibility of all IFC structural grids (the IfcGrid axes). */
    setIfcGridsVisible(visible) {
        for (const g of (this._ifcGridGroups ?? [])) g.visible = !!visible;
    }

    /**
     * Extract IfcGrid axis lines in world space for the vector PDF plot.
     * Returns [{ name, start: {x, z}, end: {x, z} }] — top-view (XZ projection).
     */
    getIfcGridAxes() {
        const out = [];
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();
        for (const g of (this._ifcGridGroups ?? [])) {
            g.updateWorldMatrix(true, true);
            g.traverse(obj => {
                const pos = obj.geometry?.attributes?.position;
                if (!pos) return;
                const name = obj.name || obj.userData?.name || '';
                const isSeg = obj.isLineSegments === true;
                const isLine = obj.isLine === true || obj.type === 'Line';
                if (!isSeg && !isLine) return;
                const step = isSeg ? 2 : 1;
                for (let i = 0; i + 1 < pos.count; i += step) {
                    v1.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
                    v2.fromBufferAttribute(pos, i + 1).applyMatrix4(obj.matrixWorld);
                    out.push({
                        name,
                        start: { x: v1.x, z: v1.z },
                        end:   { x: v2.x, z: v2.z },
                    });
                }
            });
        }
        return out;
    }
}
