/**
 * useControlPointEditor — generischer Greifpunkt-Editor (three.js).
 *
 * Verwaltet Handle-Kugeln, Picking, Hover und das Ziehen entlang erlaubter Achsen.
 * Modell-AGNOSTISCH: der Host liefert die Punkte (setHandles) und interpretiert den
 * gelieferten Welt-Delta selbst (dragDelta → applyDrag im Host) und committet.
 *
 * Punkt-Format: { key:string, pos:THREE.Vector3 (terrain-lokal), axes:'XY'|'Z', color:number }
 *   axes 'Z'  → Drag in der Höhe (vertikale, zur Kamera ausgerichtete Ebene)
 *   axes 'XY' → Drag in der Terrain-Ebene (horizontal)
 *
 * Wird zunächst für die Pfeiler-Box genutzt; Brücken-Knoten und Weir docken
 * später über dieselbe Schnittstelle an.
 */
import { reactive } from 'vue';
import * as THREE from 'three';

const HOVER_SCALE = 1.5;

export function useControlPointEditor() {
    const state = reactive({ dragging: false, hoverKey: null });
    let group = null;                 // THREE.Group der Handle-Kugeln
    const axesByKey = new Map();
    const plane = new THREE.Plane();
    let drag = null;                  // { key, axes, startHit:Vector3 }

    function dispose() {
        if (group) {
            group.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
            group.parent?.remove(group);
        }
        group = null;
        axesByKey.clear();
        drag = null;
        state.dragging = false;
        state.hoverKey = null;
    }

    /** Handles neu aufbauen und in parent (THREE.Object3D) einhängen. */
    function setHandles(parent, points) {
        dispose();
        if (!points?.length || !parent) return;
        group = new THREE.Group();
        group.name = 'ControlPoints';
        for (const pt of points) {
            const m = pt.gizmo === 'arrow'
                ? makeDoubleArrow(pt.dir ?? new THREE.Vector3(0, 1, 0), pt.color ?? 0xf39c12)
                : new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 12), new THREE.MeshBasicMaterial({ color: pt.color ?? 0xf39c12, depthTest: false }));
            m.position.copy(pt.pos);
            m.renderOrder = 1000; // über Knoten-Handles
            m.userData.cpKey = pt.key;
            if (pt.normal) m.userData.cpNormal = pt.normal.clone(); // für axes:'PLANE'
            group.add(m);
            axesByKey.set(pt.key, pt.axes);
        }
        parent.add(group);
    }

    /** Doppelpfeil-Gizmo (Schaft + 2 Spitzen) entlang `dir` (lokal). */
    function makeDoubleArrow(dir, color) {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
        const len = 2.2;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, len, 8), mat);
        g.add(shaft);
        const tip = (sign) => {
            const c = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 12), mat);
            c.position.y = sign * (len / 2 + 0.3);
            if (sign < 0) c.rotation.x = Math.PI;
            return c;
        };
        g.add(tip(1), tip(-1));
        const d = dir.clone(); if (d.lengthSq() < 1e-9) d.set(0, 1, 0);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); // Y → dir
        for (const c of g.children) { c.renderOrder = 1000; c.userData.cpArrow = true; }
        return g;
    }

    /** Handle-Positionen nachführen (nach applyDrag), key→Vector3. */
    function syncPositions(points) {
        if (!group || !points) return;
        const byKey = new Map(points.map(p => [p.key, p.pos]));
        for (const c of group.children) {
            const p = byKey.get(c.userData.cpKey);
            if (p) c.position.copy(p);
        }
    }

    /** Getroffener Handle-Key oder null. */
    function raycast(ctx) {
        if (!group) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObjects(group.children, true); // auch Pfeil-Untermeshes
        if (!hits.length) return null;
        let o = hits[0].object;
        while (o && o.userData.cpKey === undefined) o = o.parent; // bis zum Handle hochlaufen
        return o ? o.userData.cpKey : null;
    }

    /** Hover-Highlight (Vergrößern) setzen. */
    function applyHover(key) {
        if (key === state.hoverKey) return;
        state.hoverKey = key;
        if (!group) return;
        for (const c of group.children) c.scale.setScalar(c.userData.cpKey === key ? HOVER_SCALE : 1);
    }

    /** Drag starten, wenn ein Handle getroffen wird. → key oder null. */
    function beginDrag(ctx) {
        const key = raycast(ctx);
        if (!key) return null;
        const obj = group.children.find(c => c.userData.cpKey === key);
        const axes = axesByKey.get(key);
        if (axes === 'PLANE' && obj.userData.cpNormal) {
            // freie 2D-Bewegung in einer vorgegebenen Ebene (z.B. Wand-Profil)
            plane.setFromNormalAndCoplanarPoint(obj.userData.cpNormal, obj.position);
        } else if (axes === 'Z') {
            const n = new THREE.Vector3();
            ctx.camera.getWorldDirection(n); n.y = 0;
            if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
            n.normalize();
            plane.setFromNormalAndCoplanarPoint(n, obj.position);
        } else { // 'XY' — horizontale Terrain-Ebene
            plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), obj.position);
        }
        const hit = new THREE.Vector3();
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        if (!ctx.raycaster.ray.intersectPlane(plane, hit)) return null;
        drag = { key, axes, startHit: hit.clone() };
        state.dragging = true;
        return key;
    }

    /** Aktueller Welt-Delta seit Drag-Start (auf erlaubte Achsen beschränkt) oder null. */
    function dragDelta(ctx) {
        if (!drag) return null;
        const hit = new THREE.Vector3();
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        if (!ctx.raycaster.ray.intersectPlane(plane, hit)) return null;
        const d = hit.sub(drag.startHit);
        if (drag.axes === 'Z') { d.x = 0; d.z = 0; }       // nur Höhe
        else if (drag.axes === 'PLANE') { /* voller Delta in der Ebene */ }
        else { d.y = 0; }                                   // 'XY' nur horizontal
        return { key: drag.key, delta: d };
    }

    function endDrag() {
        const was = !!drag;
        drag = null;
        state.dragging = false;
        return was;
    }

    return {
        state, setHandles, syncPositions, raycast, applyHover,
        beginDrag, dragDelta, endDrag, dispose,
        get group() { return group; },
    };
}
