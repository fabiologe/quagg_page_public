/**
 * useChannelPolygonTool.js
 *
 * Tool für das Zeichnen des Flussschlauch-Polygons im 3D-Viewer.
 * Tool-ID: 'CHANNEL_POLYGON'
 *
 * Alle DEM-Zellen innerhalb des bestätigten Polygons werden aus den
 * Vermessungspunkten (IDW) befüllt — Laserscan-Werte (falsche Wasseroberfläche)
 * werden dadurch vollständig ersetzt.
 */
import { reactive } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';

// ── Singleton state ───────────────────────────────────────────────────────────
export const channelPolygonState = reactive({
    drawing:     false,
    draftPoints: [],   // [{x, y, terrainZ}] — Echtkoordinaten
});

// ── Modul-Level Three.js Objekte ──────────────────────────────────────────────
let scene_ref       = null;
let committedMesh   = null;
let draftMesh       = null;
let draftDots       = null;
let previewLine     = null;
let closingLine     = null;   // gestrichelt: letzter Punkt → erster Punkt (Schließvorschau)

// ── Koordinaten-Konversion (identisch zu useChannelLineTool) ──────────────────
function worldToReal(worldPt, terrain) {
    return {
        x:        worldPt.x + terrain.center.x,
        y:       -worldPt.z + terrain.center.y,
        terrainZ: worldPt.y  + terrain.minZ,
    };
}
function realToWorld(pt, terrain) {
    return new THREE.Vector3(
        pt.x - terrain.center.x,
        pt.terrainZ - terrain.minZ + 0.5,
        -(pt.y - terrain.center.y),
    );
}

// ── Three.js Hilfs-Builder ────────────────────────────────────────────────────
function buildPolyline(points, terrain, color, dashed = false) {
    if (points.length < 2) return null;
    const pos = [];
    for (const p of points) {
        const w = realToWorld(p, terrain);
        pos.push(w.x, w.y, w.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 1.5, gapSize: 1, linewidth: 1, depthTest: false })
        : new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    line.renderOrder = 997;
    return line;
}

function buildLoop(points, terrain, color) {
    if (points.length < 3) return null;
    const pos = [];
    for (const p of points) {
        const w = realToWorld(p, terrain);
        pos.push(w.x, w.y, w.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false });
    const loop = new THREE.LineLoop(geo, mat);
    loop.renderOrder = 997;
    return loop;
}

function buildDots(points, terrain, color = 0xf97316) {
    const group = new THREE.Group();
    for (const p of points) {
        const w = realToWorld(p, terrain);
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 8),
            new THREE.MeshBasicMaterial({ color, depthTest: false }),
        );
        dot.position.copy(w);
        dot.renderOrder = 999;
        group.add(dot);
    }
    return group;
}

function removeMesh(scene, obj) {
    if (!obj || !scene) return;
    scene.remove(obj);
    obj.traverse?.(child => { child.geometry?.dispose(); child.material?.dispose(); });
    obj.geometry?.dispose();
    obj.material?.dispose();
}

// ── Committed-Polygon neu aufbauen (aus Store) ────────────────────────────────
function rebuildCommitted(scene, terrain, polygon) {
    removeMesh(scene, committedMesh);
    committedMesh = null;
    if (!polygon?.length || !terrain?.center) return;
    const loop = buildLoop(polygon, terrain, 0xf97316);
    if (loop) {
        committedMesh = loop;
        scene.add(committedMesh);
    }
}

// ── Draft neu aufbauen ────────────────────────────────────────────────────────
function rebuildDraft(scene, terrain) {
    removeMesh(scene, draftMesh);
    removeMesh(scene, draftDots);
    draftMesh = draftDots = null;
    const pts = channelPolygonState.draftPoints;
    if (!pts.length || !terrain?.center) return;
    draftMesh = buildPolyline(pts, terrain, 0xfbbf24) ?? new THREE.Group();
    draftDots = buildDots(pts, terrain, 0xfbbf24);
    scene.add(draftMesh);
    scene.add(draftDots);
}

// ── Composable ────────────────────────────────────────────────────────────────
export function useChannelPolygonTool() {
    const geoStore   = useGeoStore();
    const bathyStore = useBathymetryStore();

    const activate = (scene) => {
        scene_ref = scene;
        channelPolygonState.drawing     = true;
        channelPolygonState.draftPoints = [];
        rebuildDraft(scene, geoStore.terrain);
        rebuildCommitted(scene, geoStore.terrain, bathyStore.channelPolygon);
    };

    const deactivate = (scene) => {
        channelPolygonState.drawing = false;
        removeMesh(scene, draftMesh);   draftMesh   = null;
        removeMesh(scene, draftDots);   draftDots   = null;
        removeMesh(scene, previewLine); previewLine = null;
        removeMesh(scene, closingLine); closingLine = null;
        rebuildCommitted(scene, geoStore.terrain, bathyStore.channelPolygon);
        scene_ref = null;
    };

    const onMouseDown = (ctx) => {
        if (!channelPolygonState.drawing) return;
        const { raycaster, camera, pointer, terrainMesh, scene } = ctx;
        if (!terrainMesh) return;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (!hits.length) return;
        const terrain = geoStore.terrain;
        if (!terrain?.center) return;
        const pt = worldToReal(hits[0].point, terrain);
        channelPolygonState.draftPoints.push(pt);
        rebuildDraft(scene, terrain);
    };

    const onMove = (ctx) => {
        if (!channelPolygonState.drawing) return;
        const { raycaster, camera, pointer, terrainMesh, scene } = ctx;
        const terrain = geoStore.terrain;
        if (!terrainMesh || !terrain?.center) return;

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);

        removeMesh(scene, previewLine); previewLine = null;
        removeMesh(scene, closingLine); closingLine = null;

        const pts = channelPolygonState.draftPoints;
        if (!hits.length || !pts.length) return;

        const cursorPt = worldToReal(hits[0].point, terrain);

        // Linie Cursor → letzter Punkt
        const prev = buildPolyline([pts[pts.length - 1], cursorPt], terrain, 0xfbbf24, true);
        if (prev) { previewLine = prev; scene.add(previewLine); }

        // Schließ-Vorschau: Cursor → erster Punkt (sobald ≥ 2 Punkte)
        if (pts.length >= 2) {
            const closing = buildPolyline([cursorPt, pts[0]], terrain, 0xf97316, true);
            if (closing) { closingLine = closing; scene.add(closingLine); }
        }
    };

    const onMouseUp = () => {};

    // ── Aktionen ──────────────────────────────────────────────────────────────
    const undoLastPoint = () => {
        if (!channelPolygonState.draftPoints.length) return;
        channelPolygonState.draftPoints.pop();
        if (scene_ref) rebuildDraft(scene_ref, geoStore.terrain);
    };

    const commitPolygon = () => {
        if (channelPolygonState.draftPoints.length < 3) return;
        // Nur {x,y} speichern — terrainZ nicht gebraucht für point-in-polygon
        const pts = channelPolygonState.draftPoints.map(p => ({ x: p.x, y: p.y }));
        bathyStore.setChannelPolygon(pts);
        channelPolygonState.drawing = false;
        if (scene_ref) {
            removeMesh(scene_ref, draftMesh);   draftMesh   = null;
            removeMesh(scene_ref, draftDots);   draftDots   = null;
            removeMesh(scene_ref, previewLine); previewLine = null;
            removeMesh(scene_ref, closingLine); closingLine = null;
            rebuildCommitted(scene_ref, geoStore.terrain, bathyStore.channelPolygon);
        }
    };

    const clearPolygon = () => {
        channelPolygonState.draftPoints = [];
        bathyStore.setChannelPolygon([]);
        if (scene_ref) {
            rebuildDraft(scene_ref, geoStore.terrain);
            rebuildCommitted(scene_ref, geoStore.terrain, []);
        }
    };

    return { activate, deactivate, onMouseDown, onMove, onMouseUp, undoLastPoint, commitPolygon, clearPolygon };
}

let _instance = null;
export function getChannelPolygonToolInstance() {
    if (!_instance) _instance = useChannelPolygonTool();
    return _instance;
}
