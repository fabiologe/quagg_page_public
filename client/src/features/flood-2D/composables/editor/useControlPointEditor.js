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
const BASE_R = 0.42; // Referenzradius, auf den die Pfeil-Gizmo-Proportionen kalibriert sind
const HIT_RADIUS_FACTOR = 1.1; // Trefferfläche (Klick/Touch) 10% größer als die sichtbare Geometrie

/**
 * Greifpunkt-Radius rein aus der Raster-Auflösung ableiten (Nutzer-Vorgabe):
 * Kugel-Durchmesser = 20% der Zellweite — 1×1-Raster → 0.2 m Ø, 10×10-Raster → 2 m Ø.
 * `spacing` (typischer Abstand zum Nachbarpunkt: Segmentlänge, Gitterdichte, Pfeiler-Ecken …)
 * wirkt nur als Deckel, damit dicht stehende Punkte nie verschmelzen — er vergrößert nie.
 */
export function handleRadius(cellsize, spacing) {
    const cs = Number.isFinite(cellsize) && cellsize > 0 ? cellsize : 1;
    let r = cs * 0.1;
    if (Number.isFinite(spacing) && spacing > 0) r = Math.min(r, spacing * 0.4);
    return Math.max(r, 0.02); // technische Untergrenze gegen Degenerierung, kein UX-Floor
}

export function useControlPointEditor() {
    const state = reactive({ dragging: false, hoverKey: null });
    let group = null;                 // THREE.Group der Handle-Kugeln
    const axesByKey = new Map();
    const plane = new THREE.Plane();
    let drag = null;                  // { key, axes, startHit:Vector3 }
    let groundSampler = null;         // (x,z) → y (terrain-lokal) — vom Host für den Drop-Shadow gesetzt
    let shadowGroup = null;           // Boden-Scheibe + Lotlinie unter dem aktiv gezogenen Handle
    let currentRadius = BASE_R;
    let pendingTouch = null;          // { key, startX, startY, timer } — Touch hält auf einem Handle

    function dispose() {
        if (group) {
            group.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
            group.parent?.remove(group);
        }
        group = null;
        shadowGroup = null;
        axesByKey.clear();
        drag = null;
        state.dragging = false;
        state.hoverKey = null;
        cancelTouchPress();
    }

    /** Laufendes Halten abbrechen (Bewegung zu groß, Loslassen, Neuaufbau der Handles). */
    function cancelTouchPress() {
        if (pendingTouch) { clearTimeout(pendingTouch.timer); pendingTouch = null; }
    }

    const TOUCH_HOLD_MS = 380;       // Haltezeit, bevor ein getroffenes Handle "scharf" wird
    const TOUCH_MOVE_CANCEL_PX = 14; // Toleranz — mehr Bewegung während der Haltezeit gilt als Kamera-Schwenk-Versuch

    /**
     * Touch-Einstieg: ein getroffenes Handle wird NICHT sofort gegriffen (kollidiert sonst mit
     * dem Ein-Finger-Kameraschwenk) — erst nach kurzem Halten ohne nennenswerte Bewegung.
     * Host ruft dies bei `event.pointerType==='touch'` in onMouseDown statt beginDrag() direkt;
     * `onArm(key)` feuert nach Ablauf der Haltezeit — dort startet der Host den echten Drag
     * (i.d.R. `beginDrag(ctx)`). Rückgabe: true = Handle getroffen, Halten läuft (Host sollte
     * die Kamera bis zum Ausgang von onArm/Abbruch sperren) | false = daneben getroffen.
     */
    function beginTouchPress(ctx, onArm) {
        const key = raycast(ctx);
        if (!key) return false;
        cancelTouchPress();
        pendingTouch = {
            key,
            startX: ctx.event?.clientX ?? 0,
            startY: ctx.event?.clientY ?? 0,
            timer: setTimeout(() => {
                pendingTouch = null;
                applyHover(key);
                onArm(key);
            }, TOUCH_HOLD_MS),
        };
        return true;
    }

    /** Während der Haltezeit bei jeder Fingerbewegung aufrufen. Bricht ab (→ false), wenn die
     *  Bewegung zu groß wird (dann war es ein Schwenk-Versuch, kein Greifen). */
    function updateTouchPress(ctx) {
        if (!pendingTouch) return false;
        const x = ctx.event?.clientX ?? pendingTouch.startX, y = ctx.event?.clientY ?? pendingTouch.startY;
        if (Math.hypot(x - pendingTouch.startX, y - pendingTouch.startY) > TOUCH_MOVE_CANCEL_PX) {
            cancelTouchPress();
            return false;
        }
        return true;
    }

    /** Terrain-Höhensampler (lokale Koord.) für den Drop-Shadow während des Ziehens. */
    function setGroundSampler(fn) { groundSampler = fn; }

    /** Boden-Scheibe + gestrichelte Lotlinie: zeigt, wo das gezogene Handle auf dem Raster aufsetzt. */
    function buildShadow(radius) {
        const g = new THREE.Group();
        g.name = 'DropShadow';
        const disc = new THREE.Mesh(
            new THREE.CircleGeometry(radius * 1.4, 16),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.renderOrder = 996;
        g.add(disc);
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: 0x000000, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.5, depthTest: false }));
        line.renderOrder = 996;
        g.add(line);
        g.userData.disc = disc;
        g.userData.line = line;
        return g;
    }

    /** Schatten unter `pos` (aktuell gezogenes Handle, terrain-lokal) nachführen. */
    function updateShadow(pos) {
        if (!groundSampler || !group) return;
        const gy = groundSampler(pos.x, pos.z);
        if (!Number.isFinite(gy)) { if (shadowGroup) shadowGroup.visible = false; return; }
        if (!shadowGroup) {
            shadowGroup = buildShadow(currentRadius);
            group.add(shadowGroup);
        }
        shadowGroup.userData.disc.position.set(pos.x, gy + 0.02, pos.z); // leichter Lift gegen Z-Fighting
        const posAttr = shadowGroup.userData.line.geometry.attributes.position;
        posAttr.array.set([pos.x, pos.y, pos.z, pos.x, gy, pos.z]);
        posAttr.needsUpdate = true;
        shadowGroup.userData.line.computeLineDistances();
        shadowGroup.visible = true;
    }

    /** Handles neu aufbauen und in parent (THREE.Object3D) einhängen.
     *  `radius` (m) skaliert Kugeln 1:1 und Pfeil-Gizmos proportional dazu — siehe handleRadius(). */
    function setHandles(parent, points, radius = BASE_R) {
        dispose();
        if (!points?.length || !parent) return;
        group = new THREE.Group();
        group.name = 'ControlPoints';
        currentRadius = radius;
        const scale = radius / BASE_R;
        const hitRadius = radius * HIT_RADIUS_FACTOR;
        for (const pt of points) {
            const m = pt.gizmo === 'arrow'
                ? makeDoubleArrow(pt.dir ?? new THREE.Vector3(0, 1, 0), pt.color ?? 0xf39c12, scale)
                : new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 12), new THREE.MeshBasicMaterial({ color: pt.color ?? 0xf39c12, depthTest: false }));
            m.position.copy(pt.pos);
            m.renderOrder = 1000; // über Knoten-Handles
            m.userData.cpKey = pt.key;
            if (pt.normal) m.userData.cpNormal = pt.normal.clone(); // für axes:'PLANE'
            group.add(m);
            axesByKey.set(pt.key, pt.axes);

            // Unsichtbare, etwas größere Trefferkugel NUR fürs Raycasting (Fat-Finger/Touch):
            // `visible = false` unterdrückt die Ausgabe im Renderer, three.js überspringt
            // unsichtbare Objekte beim Raycasting aber NICHT (Object3D.raycast prüft kein
            // `.visible`) — Standardtrick für eine Hitbox, die größer ist als die sichtbare
            // Geometrie. Bewegt sich über syncPositions()/applyHover() automatisch mit, da
            // beide generisch über alle group.children nach userData.cpKey matchen.
            const hit = new THREE.Mesh(new THREE.SphereGeometry(hitRadius, 8, 6), new THREE.MeshBasicMaterial());
            hit.visible = false;
            hit.position.copy(pt.pos);
            hit.userData.cpKey = pt.key;
            group.add(hit);
        }
        parent.add(group);
    }

    /** Doppelpfeil-Gizmo (Schaft + 2 Spitzen) entlang `dir` (lokal), proportional zu `scale` (1 = BASE_R).
     *  Schaft bewusst kräftig (nicht linien-dünn) — muss sich klar von den dünnen, gestrichelten
     *  Maß-Führungslinien (dimensionLabel.js) unterscheiden lassen. */
    function makeDoubleArrow(dir, color, scale = 1) {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
        const len = 2.2 * scale;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * scale, 0.28 * scale, len, 8), mat);
        g.add(shaft);
        const tip = (sign) => {
            const c = new THREE.Mesh(new THREE.ConeGeometry(0.5 * scale, 0.7 * scale, 12), mat);
            c.position.y = sign * (len / 2 + 0.35 * scale);
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
            if (c === shadowGroup) continue;
            const p = byKey.get(c.userData.cpKey);
            if (p) c.position.copy(p);
        }
        if (drag) {
            const dragged = byKey.get(drag.key);
            if (dragged) updateShadow(dragged);
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
        if (shadowGroup) shadowGroup.visible = false;
        return was;
    }

    return {
        state, setHandles, syncPositions, raycast, applyHover,
        beginDrag, dragDelta, endDrag, dispose, setGroundSampler,
        beginTouchPress, updateTouchPress, cancelTouchPress,
        get group() { return group; },
    };
}
