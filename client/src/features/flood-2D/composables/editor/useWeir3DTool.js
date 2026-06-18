/**
 * useWeir3DTool — Wehr als editierbare Polylinie (zeichnen + Ecken ziehen).
 *
 * Workflow (analog zum 3D-Brückentool, aber offene Linie):
 *   DRAW → Punkte aufs Terrain klicken (Enter schließt ab, ≥ 2 Punkte)
 *   EDIT → Vertex-Handles in der Terrain-Ebene ziehen (generisches cpe-Modul);
 *          die Linie wird live neu auf das Raster diskretisiert.
 *
 * Quelle der Wahrheit ist die Polylinie (geoStore.weirLines); die abgeleiteten
 * Wehr-Zellen (lineId) liegen in geoStore.weirs für den LISFLOOD-Export.
 */
import { reactive } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useToolStateMachine } from './useToolStateMachine.js';
import { useControlPointEditor } from './useControlPointEditor.js';
import { discretizeWeirPolyline, clampOpening, crestZAt, openingSoffit } from '../../utils/weirGeometry.js';
import { buildWeirWall, buildWeirWallWire, buildWeirOpenings } from '../../utils/weirWall.js';
import { sampleGridZ } from '../../utils/BridgeMeshLattice.js';

const HANDLE_COLOR = 0x3498db;

export const weir3DState = reactive({
    mode: 'LINE',      // 'LINE' (klassisch, 2-Klick) | 'POLYLINE' (editierbar)
    phase: 'IDLE',     // IDLE | DRAW | EDIT
    draftPoints: [],   // [{x,y}] während des Zeichnens
    editingId: null,
    dragging: false,
});

let scene_ref = null;
let draftLine = null, draftDots = null, previewLine = null;
let editGroup = null, wallMesh = null, wallWire = null, guideGroup = null, openingGroup = null;
const cpe = useControlPointEditor();
let vDrag = null; // { snap:{points,openings}, next:{points,openings} } während eines Drags

/** GIS → Terrain-lokal, exakt (ohne den +0.5-Lift von realToWorld). */
function toLocalExact(x, y, z, terrain) {
    return new THREE.Vector3(x - terrain.center.x, (z ?? terrain.minZ) - terrain.minZ, -(y - terrain.center.y));
}

/** Text-Sprite (Canvas) für Maß-Labels (kompakte Kopie aus useBridge3DTool). */
function makeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 34px sans-serif';
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = 'rgba(15,25,35,0.8)'; ctx.fillRect((256 - w) / 2, 6, w, 52);
    ctx.fillStyle = '#5dade2'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 33);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
    sprite.scale.set(6, 1.5, 1); sprite.renderOrder = 1001;
    return sprite;
}

// ── Koordinaten (identisch zum Brückentool) ─────────────────────────────────
function worldToReal(worldPt, terrain) {
    return { x: worldPt.x + terrain.center.x, y: -worldPt.z + terrain.center.y };
}
function realToWorld(x, y, z, terrain) {
    return new THREE.Vector3(x - terrain.center.x, (z ?? terrain.minZ) - terrain.minZ + 0.5, -(y - terrain.center.y));
}
function headerFromTerrain(terrain) {
    return {
        ncols: terrain.ncols, nrows: terrain.nrows, cellsize: terrain.cellsize,
        xll: terrain.center.x - (terrain.ncols - 1) * terrain.cellsize / 2,
        yll: terrain.center.y - (terrain.nrows - 1) * terrain.cellsize / 2,
    };
}

function removeObj(obj) {
    if (!obj || !scene_ref) return;
    scene_ref.remove(obj);
    obj.traverse?.(c => { c.geometry?.dispose(); c.material?.dispose(); });
    obj.geometry?.dispose(); obj.material?.dispose();
}

function buildPolyline(points, terrain, color, dashed = false) {
    if (points.length < 2) return null;
    const pos = [];
    for (const p of points) {
        const z = sampleGridZ(headerFromTerrain(terrain), terrain.gridData, p.x, p.y) ?? terrain.minZ;
        const w = realToWorld(p.x, p.y, z, terrain);
        pos.push(w.x, w.y, w.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 1.5, gapSize: 1, depthTest: false })
        : new THREE.LineBasicMaterial({ color, depthTest: false });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 997;
    return line;
}

function buildDots(points, terrain, color) {
    const group = new THREE.Group();
    for (const p of points) {
        const z = sampleGridZ(headerFromTerrain(terrain), terrain.gridData, p.x, p.y) ?? terrain.minZ;
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
        dot.position.copy(realToWorld(p.x, p.y, z, terrain));
        dot.renderOrder = 999;
        group.add(dot);
    }
    return group;
}

export function useWeir3DTool() {
    const geoStore = useGeoStore();
    const sm = useToolStateMachine();

    const getLine = () => geoStore.weirLines.find(l => l.id === weir3DState.editingId);
    const terrainZAt = (x, y) => sampleGridZ(headerFromTerrain(geoStore.terrain), geoStore.terrain.gridData, x, y) ?? geoStore.terrain.minZ;
    const cells = (points, openings) => discretizeWeirPolyline(points, headerFromTerrain(geoStore.terrain), geoStore.terrain.gridData, { openings: openings || [] });

    /** Linienrichtung (world dx,dy) am nächstgelegenen Segment zu (x,y). */
    const lineDir = (line, x, y) => {
        let bestD = Infinity, dir = { dx: 1, dy: 0 };
        const pts = line.points || [];
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            const vx = b.x - a.x, vy = b.y - a.y, len = Math.hypot(vx, vy) || 1, len2 = len * len;
            let t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len2));
            const d = Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
            if (d < bestD) { bestD = d; dir = { dx: vx / len, dy: vy / len }; }
        }
        return dir;
    };

    /** Greifpunkte: pro Ecke Basis (XY) + Krone (Z); pro Öffnung Basis + Soffit;
     *  polygonale Öffnungen zusätzlich pro Querschnitts-Ecke (PLANE im Wandprofil). */
    const editHandles = (line) => {
        const terrain = geoStore.terrain;
        const out = [];
        const UP = new THREE.Vector3(0, 1, 0);
        const horiz = (x, y) => { const d = lineDir(line, x, y); return new THREE.Vector3(d.dx, 0, -d.dy).normalize(); };
        (line.points || []).forEach((p, i) => {
            const tz = terrainZAt(p.x, p.y);
            const cz = Number.isFinite(p.z) ? p.z : (line.hc ?? tz + 1);
            out.push({ key: `b${i}`, axes: 'XY', gizmo: 'arrow', dir: horiz(p.x, p.y), color: 0x3498db, pos: toLocalExact(p.x, p.y, tz, terrain) });
            out.push({ key: `c${i}`, axes: 'Z', gizmo: 'arrow', dir: UP, color: 0x5dade2, pos: toLocalExact(p.x, p.y, cz, terrain) });
        });
        (line.openings || []).forEach((o, k) => {
            const tz = terrainZAt(o.x, o.y);
            out.push({ key: `ob${k}`, axes: 'XY', gizmo: 'arrow', dir: horiz(o.x, o.y), color: 0xe67e22, pos: toLocalExact(o.x, o.y, tz, terrain) });
            out.push({ key: `os${k}`, axes: 'Z', gizmo: 'arrow', dir: UP, color: 0xf39c12, pos: toLocalExact(o.x, o.y, openingSoffit(o), terrain) });
            if (o.type === 'poly' && o.points?.length) {
                const dir = lineDir(line, o.x, o.y);
                const normal = new THREE.Vector3(-dir.dy, 0, -dir.dx).normalize(); // Wand-Profil-Ebene
                o.points.forEach((v, j) => {
                    const wx = o.x + dir.dx * v.s, wy = o.y + dir.dy * v.s;
                    out.push({ key: `pv${k}_${j}`, axes: 'PLANE', normal, color: 0xf5b041, pos: toLocalExact(wx, wy, v.z, terrain) });
                });
            }
        });
        return out;
    };

    // ── Zeichnen ──────────────────────────────────────────────────────────────
    const startDrawing = () => {
        cancelEdit();
        weir3DState.draftPoints = [];
        weir3DState.phase = 'DRAW';
        rebuildDraft();
    };
    const rebuildDraft = () => {
        const terrain = geoStore.terrain;
        if (!scene_ref || !terrain?.center) return;
        removeObj(draftLine); draftLine = null;
        removeObj(draftDots); draftDots = null;
        const pts = weir3DState.draftPoints;
        if (!pts.length) return;
        draftLine = buildPolyline(pts, terrain, HANDLE_COLOR);
        draftDots = buildDots(pts, terrain, HANDLE_COLOR);
        if (draftLine) scene_ref.add(draftLine);
        scene_ref.add(draftDots);
    };
    const clearDraft = () => {
        removeObj(draftLine); draftLine = null;
        removeObj(draftDots); draftDots = null;
        removeObj(previewLine); previewLine = null;
    };

    /** Polylinie abschließen → Wehr-Linie committen, ins Editing wechseln. */
    const finishDrawing = () => {
        if (weir3DState.phase !== 'DRAW' || weir3DState.draftPoints.length < 2) return;
        const terrain = geoStore.terrain;
        const hdr = headerFromTerrain(terrain);
        let maxZ = -Infinity;
        for (const p of weir3DState.draftPoints) { const z = sampleGridZ(hdr, terrain.gridData, p.x, p.y); if (z != null && z > maxZ) maxZ = z; }
        if (!Number.isFinite(maxZ)) maxZ = terrain.minZ;
        const crest = Math.round((maxZ + 0.5) * 100) / 100; // flache Krone 0,5 m über höchstem Terrainpunkt
        // per-Ecke-Kronenhöhe z (anfangs flach), danach pro Ecke ziehbar
        const points = weir3DState.draftPoints.map(p => ({ x: p.x, y: p.y, z: crest }));
        const line = {
            id: `weir_${Date.now()}`,
            points, openings: [],
            hc: crest, Cd: 1.704, m: 0.667, w: terrain.cellsize,
            width: Math.max(1, Math.round(terrain.cellsize)), // 3D-Wanddicke (wie Brücke), editierbar
            label: `Wehr-Polylinie ${geoStore.weirLines.length + 1}`,
        };
        geoStore.addWeirLine(line, cells(points, []));
        weir3DState.draftPoints = [];
        clearDraft();
        startEdit(line.id);
    };

    // ── Editieren ─────────────────────────────────────────────────────────────
    const startEdit = (id) => {
        const line = geoStore.weirLines.find(l => l.id === id);
        if (!line) return;
        weir3DState.editingId = id;
        weir3DState.phase = 'EDIT';
        rebuildEditVisuals(line);
    };
    const buildWall = (line) => {
        const terrain = geoStore.terrain;
        const wg = buildWeirWall(line, terrain);
        if (wg) {
            wallMesh = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthTest: false }));
            wallMesh.renderOrder = 997; editGroup.add(wallMesh);
        }
        const ww = buildWeirWallWire(line, terrain);
        if (ww) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(ww, 3));
            wallWire = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf1c40f, depthTest: false }));
            wallWire.renderOrder = 998; editGroup.add(wallWire);
        }
        buildOpenings(line);
    };
    /** Öffnungskörper (rund/rechteckig/polygonal, quer durch die Wand) — bei jedem Drag neu. */
    const buildOpenings = (line) => {
        if (openingGroup && editGroup) { editGroup.remove(openingGroup); openingGroup.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); }); }
        openingGroup = new THREE.Group();
        for (const geo of buildWeirOpenings(line, geoStore.terrain)) {
            const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2c3e50, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
            m.renderOrder = 999;
            openingGroup.add(m);
        }
        if (editGroup) editGroup.add(openingGroup);
    };
    const rebuildEditVisuals = (line) => {
        const terrain = geoStore.terrain;
        if (!scene_ref || !terrain?.center) return;
        clearEditVisuals();
        editGroup = new THREE.Group();
        editGroup.name = 'Weir3D_Edit';
        buildWall(line);
        scene_ref.add(editGroup);
        cpe.setHandles(editGroup, editHandles(line));
    };
    const refreshEditVisuals = (line) => {
        const terrain = geoStore.terrain;
        if (wallMesh) { const wg = buildWeirWall(line, terrain); if (wg) { wallMesh.geometry.dispose(); wallMesh.geometry = wg; } }
        if (wallWire) {
            const ww = buildWeirWallWire(line, terrain);
            if (ww) { wallWire.geometry.dispose(); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(ww, 3)); wallWire.geometry = g; }
        }
        buildOpenings(line);
        cpe.syncPositions(editHandles(line).map(h => ({ key: h.key, pos: h.pos })));
    };
    const disposeGuides = () => {
        if (guideGroup && editGroup) { editGroup.remove(guideGroup); guideGroup.traverse(c => { c.geometry?.dispose(); c.material?.map?.dispose(); c.material?.dispose(); }); }
        guideGroup = null;
    };
    /** Maß-Label beim Krone/Soffit-Ziehen: Höhe über Gelände an der Ecke. */
    const showHeightGuide = (line, x, y, z) => {
        disposeGuides();
        if (!editGroup) return;
        const terrain = geoStore.terrain;
        const tz = terrainZAt(x, y);
        const top = toLocalExact(x, y, z, terrain), bot = toLocalExact(x, y, tz, terrain);
        guideGroup = new THREE.Group();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([top.x, top.y, top.z, bot.x, bot.y, bot.z], 3));
        const ln = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x5dade2, dashSize: 0.6, gapSize: 0.4, depthTest: false }));
        ln.computeLineDistances(); ln.renderOrder = 1001; guideGroup.add(ln);
        const label = makeLabel(`${(z - tz).toFixed(2)} m`);
        label.position.set(top.x, (top.y + bot.y) / 2, top.z);
        guideGroup.add(label);
        editGroup.add(guideGroup);
    };
    /** Maß-Label beim Links-Rechts-Verschieben: zurückgelegte Strecke. */
    const showMoveGuide = (a, b, dist) => {
        disposeGuides();
        if (!editGroup) return;
        guideGroup = new THREE.Group();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z], 3));
        const ln = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x5dade2, dashSize: 0.6, gapSize: 0.4, depthTest: false }));
        ln.computeLineDistances(); ln.renderOrder = 1001; guideGroup.add(ln);
        const label = makeLabel(`${dist.toFixed(1)} m`);
        label.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.6, (a.z + b.z) / 2);
        guideGroup.add(label);
        editGroup.add(guideGroup);
    };
    const clearEditVisuals = () => {
        disposeGuides();
        cpe.dispose();
        removeObj(editGroup);
        editGroup = wallMesh = wallWire = openingGroup = null;
    };
    const finishEdit = () => cancelEdit();
    const cancelEdit = () => {
        weir3DState.editingId = null;
        weir3DState.dragging = false;
        vDrag = null;
        clearEditVisuals();
        if (weir3DState.phase === 'EDIT') weir3DState.phase = 'IDLE';
    };

    const deleteCurrent = () => {
        const id = weir3DState.editingId;
        cancelEdit();
        if (id) geoStore.removeWeirLine(id);
    };

    /** Wanddicke [m] setzen (3D-Breite, wie Brücke). */
    const setWidth = (width) => {
        const line = getLine();
        if (!line || !Number.isFinite(width) || width <= 0) return;
        geoStore.updateWeirLine(line.id, { width }, cells(line.points, line.openings), 'Wehr-Breite');
        rebuildEditVisuals(getLine());
    };

    /** Kronenhöhe ALLER Ecken auf hc setzen (flaches Profil, Panel-Komfort). */
    const setCrest = (hc) => {
        const line = getLine();
        if (!line || !Number.isFinite(hc)) return;
        const points = line.points.map(p => ({ ...p, z: hc }));
        geoStore.updateWeirLine(line.id, { points, hc }, cells(points, line.openings), 'Kronenhöhe (alle)');
        rebuildEditVisuals(getLine());
    };

    // ── Öffnungen (rund / rechteckig / polygonal, „durch das Wehr") ──────────────
    /** Verfügbare halbe Öffnungsbreite [m] um (x,y) entlang der Linie (bis zu den Enden). */
    const lineExtentAround = (line, x, y) => {
        const pts = line.points; let acc = 0, sBest = 0, bestD = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], vx = b.x - a.x, vy = b.y - a.y, len = Math.hypot(vx, vy) || 1;
            const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (len * len)));
            const d = Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
            if (d < bestD) { bestD = d; sBest = acc + t * len; }
            acc += len;
        }
        return Math.max(0.2, Math.min(sBest, acc - sBest));
    };
    const lineLen = (line) => { const p = line.points; let t = 0; for (let i = 0; i < p.length - 1; i++) t += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y); return t; };
    const arcOf = (line, x, y) => {
        const p = line.points; let acc = 0, sBest = 0, bestD = Infinity;
        for (let i = 0; i < p.length - 1; i++) {
            const a = p[i], b = p[i + 1], vx = b.x - a.x, vy = b.y - a.y, len = Math.hypot(vx, vy) || 1;
            const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (len * len)));
            const d = Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
            if (d < bestD) { bestD = d; sBest = acc + t * len; }
            acc += len;
        }
        return sBest;
    };
    const pointAtArc = (line, arc) => {
        const p = line.points; let acc = 0;
        for (let i = 0; i < p.length - 1; i++) {
            const a = p[i], b = p[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            if (arc <= acc + len || i === p.length - 2) { const t = Math.max(0, Math.min(1, (arc - acc) / len)); return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }; }
            acc += len;
        }
        return { x: p[0].x, y: p[0].y };
    };
    /** Mitte der größten freien Lücke (für neue Öffnungen → nicht stapeln). */
    const freeArc = (line) => {
        const total = lineLen(line);
        const arcs = (line.openings || []).map(o => arcOf(line, o.x, o.y)).sort((a, b) => a - b);
        const bounds = [0, ...arcs, total]; let best = total / 2, bestGap = -1;
        for (let i = 0; i < bounds.length - 1; i++) { const g = bounds[i + 1] - bounds[i]; if (g > bestGap) { bestGap = g; best = (bounds[i] + bounds[i + 1]) / 2; } }
        return best;
    };
    /** Öffnung gegen Krone/Gelände/Linienlänge beschneiden (bleibt IM Wehr). */
    const clampO = (line, o) => {
        const pts = line.points.map(p => ({ x: p.x, y: p.y, z: Number.isFinite(p.z) ? p.z : (line.hc ?? terrainZAt(p.x, p.y) + 1) }));
        const crest = crestZAt(pts, o.x, o.y) ?? (line.hc ?? terrainZAt(o.x, o.y) + 1);
        return clampOpening(o, crest, terrainZAt(o.x, o.y), lineExtentAround(line, o.x, o.y));
    };
    const commitOpenings = (line, openings, label) => {
        geoStore.updateWeirLine(line.id, { openings }, cells(line.points, openings), label);
        rebuildEditVisuals(getLine());
    };
    /** Neue Öffnung (type: 'round'|'rect'|'poly') in der Linienmitte, geklemmt. */
    const addOpening = (type = 'round') => {
        const line = getLine();
        if (!line || line.points.length < 2) return;
        // Spawn in die GRÖSSTE freie Lücke entlang der Linie (nicht stapeln → sichtbar)
        const { x, y } = pointAtArc(line, freeArc(line));
        const tz = terrainZAt(x, y);
        const ptsZ = line.points.map(p => ({ x: p.x, y: p.y, z: Number.isFinite(p.z) ? p.z : (line.hc ?? terrainZAt(p.x, p.y) + 1) }));
        const crest = crestZAt(ptsZ, x, y) ?? (line.hc ?? tz + 1);
        const soffit = Math.round(Math.max(tz + 0.4, (tz + crest) / 2) * 100) / 100;
        const cs = geoStore.terrain.cellsize;
        let o = { x, y, type, soffit, width: Math.max(1, cs * 1.5), height: Math.max(0.5, soffit - tz) };
        if (type === 'poly') {
            // Default: einfacher Bogen (Trapez mit Spitze) im Wandprofil
            const w = o.width / 2, base = tz + 0.2, top = soffit;
            o.points = [{ s: -w, z: base }, { s: w, z: base }, { s: w, z: (base + top) / 2 }, { s: 0, z: top }, { s: -w, z: (base + top) / 2 }];
        }
        o = clampO(line, o);
        commitOpenings(line, [...(line.openings || []), o], 'Wehr-Öffnung hinzugefügt');
    };
    const removeOpening = (k) => {
        const line = getLine();
        if (!line) return;
        commitOpenings(line, (line.openings || []).filter((_, i) => i !== k), 'Wehr-Öffnung entfernt');
    };
    const setOpeningSoffit = (k, soffit) => {
        const line = getLine();
        if (!line || !Number.isFinite(soffit)) return;
        const openings = (line.openings || []).map((o, i) => i === k ? clampO(line, { ...o, soffit }) : o);
        commitOpenings(line, openings, 'Öffnungs-Soffit');
    };
    const setOpeningWidth = (k, width) => {
        const line = getLine();
        if (!line || !Number.isFinite(width)) return;
        const openings = (line.openings || []).map((o, i) => i === k ? clampO(line, { ...o, width }) : o);
        commitOpenings(line, openings, 'Öffnungs-Breite');
    };
    const setOpeningHeight = (k, height) => {
        const line = getLine();
        if (!line || !Number.isFinite(height)) return;
        const openings = (line.openings || []).map((o, i) => i === k ? clampO(line, { ...o, height }) : o);
        commitOpenings(line, openings, 'Öffnungs-Höhe');
    };

    /** Nächstgelegene Wehr-Linie zu einem Weltpunkt (Real-Koord.) innerhalb tol [m]. */
    const pickLine = (real, tol) => {
        let best = null, bestD = tol;
        for (const line of geoStore.weirLines) {
            for (let i = 0; i < line.points.length - 1; i++) {
                const d = distToSegment(real, line.points[i], line.points[i + 1]);
                if (d < bestD) { bestD = d; best = line.id; }
            }
        }
        return best;
    };

    // ── Pointer-Events ──────────────────────────────────────────────────────────
    const raycastTerrainReal = (ctx) => {
        const terrain = geoStore.terrain;
        if (!ctx.terrainMesh || !terrain?.center) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObject(ctx.terrainMesh, false);
        return hits.length ? worldToReal(hits[0].point, terrain) : null;
    };

    const onMouseDown = (ctx) => {
        if (weir3DState.phase === 'DRAW') {
            const pt = raycastTerrainReal(ctx);
            if (pt) { weir3DState.draftPoints.push(pt); rebuildDraft(); }
            return;
        }
        if (weir3DState.phase === 'EDIT') {
            const line = getLine();
            if (!line) return;
            const k = cpe.beginDrag(ctx);
            if (k) {
                vDrag = { snap: { points: line.points.map(p => ({ ...p })), openings: (line.openings || []).map(o => ({ ...o })) }, next: null };
                weir3DState.dragging = true;
                return;
            }
            const real = raycastTerrainReal(ctx);
            if (real) {
                const id = pickLine(real, Math.max(2, geoStore.terrain.cellsize * 2));
                if (id && id !== weir3DState.editingId) startEdit(id);
            }
        }
    };

    const onMove = (ctx) => {
        const terrain = geoStore.terrain;
        if (weir3DState.phase === 'DRAW') {
            removeObj(previewLine); previewLine = null;
            const pts = weir3DState.draftPoints;
            const cur = raycastTerrainReal(ctx);
            if (!cur || !pts.length) return;
            previewLine = buildPolyline([pts[pts.length - 1], cur], terrain, HANDLE_COLOR, true);
            if (previewLine) scene_ref.add(previewLine);
            return;
        }
        if (weir3DState.phase === 'EDIT') {
            if (weir3DState.dragging && vDrag) {
                const dd = cpe.dragDelta(ctx);
                if (!dd) return;
                const snap = vDrag.snap;
                const points = snap.points.map(p => ({ ...p }));
                let openings = snap.openings.map(o => ({ ...o, points: o.points ? o.points.map(v => ({ ...v })) : undefined }));
                // Welt-Delta → Real (world.x=realX−cx, world.z=−(realY−cy)); axes 'Z' → delta.y
                let mB, mC, mOB, mOS, mPV;
                if ((mB = /^b(\d+)$/.exec(dd.key))) { const i = +mB[1]; points[i].x = snap.points[i].x + dd.delta.x; points[i].y = snap.points[i].y - dd.delta.z; }
                else if ((mC = /^c(\d+)$/.exec(dd.key))) { const i = +mC[1]; const tz = terrainZAt(points[i].x, points[i].y); points[i].z = Math.max(tz + 0.1, (snap.points[i].z ?? tz + 1) + dd.delta.y); }
                else if ((mOB = /^ob(\d+)$/.exec(dd.key))) { const k = +mOB[1]; const pr = projectOntoPolyline(snap.points, snap.openings[k].x + dd.delta.x, snap.openings[k].y - dd.delta.z); openings[k].x = pr.x; openings[k].y = pr.y; }
                else if ((mOS = /^os(\d+)$/.exec(dd.key))) {
                    const k = +mOS[1], so = snap.openings[k], dz = dd.delta.y;
                    if (so.type === 'poly' && so.points) openings[k].points = so.points.map(v => ({ s: v.s, z: v.z + dz }));
                    else openings[k].soffit = (so.soffit ?? 0) + dz;
                }
                else if ((mPV = /^pv(\d+)_(\d+)$/.exec(dd.key))) {
                    const k = +mPV[1], j = +mPV[2], so = snap.openings[k];
                    const dir = lineDir(getLine(), so.x, so.y);
                    const ds = dd.delta.x * dir.dx + dd.delta.z * (-dir.dy); // Delta entlang der Linie (lokal)
                    openings[k].points = so.points.map((v, idx) => idx === j ? { s: v.s + ds, z: v.z + dd.delta.y } : { ...v });
                }
                else return;
                // Bedingung: jede Öffnung bleibt IM Wehr (Krone/Gelände/Linienlänge)
                let wline = { ...getLine(), points };
                openings = openings.map(o => clampO(wline, o));
                wline = { ...wline, openings };
                vDrag.next = { points, openings };
                refreshEditVisuals(wline);
                if (mC) { const i = +mC[1]; showHeightGuide(wline, points[i].x, points[i].y, points[i].z); }
                else if (mOS || mPV) { const k = +(mOS ? mOS[1] : mPV[1]); showHeightGuide(wline, openings[k].x, openings[k].y, openingSoffit(openings[k])); }
                else if (mB) { const i = +mB[1]; const s = snap.points[i], n = points[i]; const a = toLocalExact(s.x, s.y, terrainZAt(s.x, s.y), terrain), b = toLocalExact(n.x, n.y, terrainZAt(n.x, n.y), terrain); showMoveGuide(a, b, Math.hypot(b.x - a.x, b.z - a.z)); }
                else if (mOB) { const k = +mOB[1]; const s = snap.openings[k], n = openings[k]; const a = toLocalExact(s.x, s.y, terrainZAt(s.x, s.y), terrain), b = toLocalExact(n.x, n.y, terrainZAt(n.x, n.y), terrain); showMoveGuide(a, b, Math.hypot(b.x - a.x, b.z - a.z)); }
                else disposeGuides();
                return;
            }
            cpe.applyHover(cpe.raycast(ctx));
        }
    };

    const onMouseUp = () => {
        if (weir3DState.phase === 'EDIT' && cpe.state.dragging) {
            cpe.endDrag();
            weir3DState.dragging = false;
            const line = getLine();
            if (line && vDrag?.next) {
                geoStore.updateWeirLine(line.id, { points: vDrag.next.points, openings: vDrag.next.openings }, cells(vDrag.next.points, vDrag.next.openings), 'Wehr-Linie geformt');
                rebuildEditVisuals(getLine());
            }
            vDrag = null;
        }
    };

    const onClick = () => {};

    // ── Lebenszyklus ────────────────────────────────────────────────────────────
    const activate = (scene) => {
        scene_ref = scene;
        if (weir3DState.phase === 'IDLE') startDrawing();
        sm.attachShortcuts({
            onCancel: () => cancel(),
            onConfirm: () => { if (weir3DState.phase === 'DRAW') finishDrawing(); else if (weir3DState.phase === 'EDIT') finishEdit(); },
            onUndo: () => { if (weir3DState.phase === 'DRAW') { weir3DState.draftPoints.pop(); rebuildDraft(); } },
        });
    };
    const deactivate = () => {
        sm.detachShortcuts();
        weir3DState.draftPoints = [];
        clearDraft();
        cancelEdit();
        weir3DState.phase = 'IDLE';
        scene_ref = null;
    };
    const cancel = () => {
        if (weir3DState.phase === 'DRAW') { weir3DState.draftPoints = []; clearDraft(); weir3DState.phase = 'IDLE'; }
        else if (weir3DState.phase === 'EDIT') finishEdit();
    };

    return {
        activate, deactivate, onMouseDown, onMove, onMouseUp, onClick,
        startDrawing, finishDrawing, startEdit, finishEdit, deleteCurrent, setCrest, setWidth, cancel,
        addOpening, removeOpening, setOpeningSoffit, setOpeningWidth, setOpeningHeight,
    };
}

/** Nächster Punkt auf der Polylinie zu (x,y) — Öffnungen bleiben so auf der Wand. */
function projectOntoPolyline(points, x, y) {
    let best = { d: Infinity, x, y };
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
        let t = len2 > 1e-9 ? ((x - a.x) * vx + (y - a.y) * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * vx, py = a.y + t * vy;
        const d = Math.hypot(x - px, y - py);
        if (d < best.d) best = { d, x: px, y: py };
    }
    return best;
}

/** Abstand Punkt→Segment in der Ebene (Real-Koord.). */
function distToSegment(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 1e-12 ? (wx * vx + wy * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + t * vx), dy = p.y - (a.y + t * vy);
    return Math.hypot(dx, dy);
}

let _instance = null;
export function getWeir3DToolInstance() {
    if (!_instance) _instance = useWeir3DTool();
    return _instance;
}
