// Kleiner Hover-Ring auf dem Terrain — Klick-Feedback für die Netz-Werkzeuge
// (NET_NODE/NET_CONDUIT): zeigt, WO der Klick landet, und wechselt die Farbe,
// wenn ein Objekt unterm Cursor gesnappt würde. Lazy erzeugt, depthTest aus
// (bleibt auf Kuppen/in Senken sichtbar), von jedem Tool selbst entsorgt.

import * as THREE from 'three';

export function createTerrainCursor({ color = 0x8b5cf6, snapColor = 0xa3e635 } = {}) {
    let ring = null;

    function ensure(scene) {
        if (!ring) {
            const geo = new THREE.RingGeometry(0.45, 0.72, 28);
            geo.rotateX(-Math.PI / 2);
            ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.9,
                depthTest: false, side: THREE.DoubleSide,
            }));
            ring.renderOrder = 1000;
            ring.visible = false;
        }
        if (ring.parent !== scene) scene.add(ring);
        return ring;
    }

    /** Ring am Terrain-Treffer positionieren (Raycaster muss gesetzt sein).
     *  snap=true → Snap-Farbe (Objekt unterm Cursor, Klick trifft es). */
    function update(ctx, { snap = false } = {}) {
        if (!ctx?.scene || !ctx.terrainMesh || !ctx.raycaster) { hide(); return; }
        const hits = ctx.raycaster.intersectObject(ctx.terrainMesh);
        if (!hits.length) { hide(); return; }
        const r = ensure(ctx.scene);
        r.position.copy(hits[0].point);
        r.position.y += 0.15;
        r.material.color.set(snap ? snapColor : color);
        r.visible = true;
    }

    function hide() { if (ring) ring.visible = false; }

    function dispose() {
        if (!ring) return;
        ring.parent?.remove(ring);
        ring.geometry?.dispose?.();
        ring.material?.dispose?.();
        ring = null;
    }

    return { update, hide, dispose };
}
