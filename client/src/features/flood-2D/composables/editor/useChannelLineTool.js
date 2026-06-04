/**
 * useChannelLineTool.js
 *
 * Tool für das Zeichnen der Kanal-Mittellinie (Polylinie) im 3D-Viewer.
 * Tool-ID: 'CHANNEL_LINE'
 *
 * Architektur:
 * - channelLineState (reactive, singleton): zeigt an ob gerade gezeichnet wird
 *   und hält die Draft-Punkte der aktuellen Session
 * - bathyStore.channelPolyline: persistente, bestätigte Polylinie
 * - Rendering: persistente Linie aus Store + Draft-Overlay während des Zeichnens
 */
import { reactive } from 'vue';
import * as THREE from 'three';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useBathymetryStore } from '../../stores/useBathymetryStore.js';
import { useToolStateMachine } from './useToolStateMachine.js';

// ── Singleton state (importierbar von BathymetryModal) ────────────────────────
export const channelLineState = reactive({
    drawing: false,
    draftPoints: [],   // [{x, y, terrainZ}] — Echtkoordinaten + Terrain-Z für Rendering
});

// ── Modul-Level Three.js Objekte ──────────────────────────────────────────────
let scene_ref      = null;
let committedMesh  = null;   // persistente bestätigte Linie
let draftMesh      = null;   // aktive Draft-Linie (während Zeichnen)
let draftDots      = null;   // Punkte-Marker auf der Draft-Linie
let previewLine    = null;   // gestrichelte Linie Cursor → letzter Punkt

// ── Koordinaten-Konversion ────────────────────────────────────────────────────
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
        pt.terrainZ - terrain.minZ + 0.4,
        -(pt.y - terrain.center.y),
    );
}

// ── Three.js Linie aus Punkten ────────────────────────────────────────────────
function buildLine(points, terrain, color, dashed = false) {
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

// Pfeil-Marker in der Mitte jedes Segments (Fließrichtung)
function buildArrows(points, terrain) {
    const group = new THREE.Group();
    for (let i = 0; i < points.length - 1; i++) {
        const a = realToWorld(points[i],   terrain);
        const b = realToWorld(points[i+1], terrain);
        const mid = a.clone().lerp(b, 0.5);
        const dir = b.clone().sub(a).normalize();
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.4, 1.2, 8),
            new THREE.MeshBasicMaterial({ color: 0x00e5ff, depthTest: false }),
        );
        cone.position.copy(mid);
        const axis = new THREE.Vector3(0, 1, 0);
        cone.quaternion.setFromUnitVectors(axis, dir);
        cone.renderOrder = 998;
        group.add(cone);
    }
    return group;
}

// Dot-Marker für Draft-Punkte
function buildDots(points, terrain) {
    const group = new THREE.Group();
    for (const p of points) {
        const w = realToWorld(p, terrain);
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0x00e5ff, depthTest: false }),
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

// ── Committed-Linie neu zeichnen (aus Store) ──────────────────────────────────
function rebuildCommitted(scene, terrain, polyline) {
    removeMesh(scene, committedMesh);
    committedMesh = null;
    if (!polyline?.length || !terrain?.center) return;
    const group = new THREE.Group();
    const line  = buildLine(polyline, terrain, 0x00e5ff);
    if (line) group.add(line);
    const arrows = buildArrows(polyline, terrain);
    group.add(arrows);
    committedMesh = group;
    scene.add(committedMesh);
}

// ── Draft-Linie neu zeichnen ──────────────────────────────────────────────────
function rebuildDraft(scene, terrain) {
    removeMesh(scene, draftMesh);
    removeMesh(scene, draftDots);
    draftMesh = draftDots = null;
    const pts = channelLineState.draftPoints;
    if (!pts.length || !terrain?.center) return;
    draftMesh = buildLine(pts, terrain, 0xffaa00) ?? new THREE.Group();
    draftDots = buildDots(pts, terrain);
    scene.add(draftMesh);
    scene.add(draftDots);
}

// ── Composable ────────────────────────────────────────────────────────────────
export function useChannelLineTool() {
    const geoStore   = useGeoStore();
    const bathyStore = useBathymetryStore();
    const sm         = useToolStateMachine();

    // Nur den aktuellen Draft verwerfen (committed Linie bleibt) — Escape
    const abortDraft = () => {
        channelLineState.draftPoints = [];
        if (scene_ref) {
            removeMesh(scene_ref, previewLine); previewLine = null;
            rebuildDraft(scene_ref, geoStore.terrain);
        }
    };

    const activate = (scene) => {
        scene_ref = scene;
        channelLineState.drawing    = true;
        channelLineState.draftPoints = [];
        rebuildDraft(scene, geoStore.terrain);
        // Zeige committed Linie als Referenz
        rebuildCommitted(scene, geoStore.terrain, bathyStore.channelPolyline);
        // Einheitliche Tastatur: Esc = Draft verwerfen, Backspace = letzter Punkt, Enter = übernehmen
        sm.attachShortcuts({
            onCancel:  () => abortDraft(),
            onUndo:    () => undoLastPoint(),
            onConfirm: () => commitLine(),
        });
    };

    const deactivate = (scene) => {
        sm.detachShortcuts();
        channelLineState.drawing = false;
        removeMesh(scene, draftMesh);  draftMesh  = null;
        removeMesh(scene, draftDots);  draftDots  = null;
        removeMesh(scene, previewLine); previewLine = null;
        // Committed Linie bleibt sichtbar
        rebuildCommitted(scene, geoStore.terrain, bathyStore.channelPolyline);
        scene_ref = null;
    };

    const onMouseDown = (ctx) => {
        if (!channelLineState.drawing) return;
        const { raycaster, camera, pointer, terrainMesh, scene } = ctx;
        if (!terrainMesh) return;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (!hits.length) return;
        const terrain = geoStore.terrain;
        if (!terrain?.center) return;
        const pt = worldToReal(hits[0].point, terrain);
        channelLineState.draftPoints.push(pt);
        rebuildDraft(scene, terrain);
    };

    const onMove = (ctx) => {
        if (!channelLineState.drawing) return;
        const { raycaster, camera, pointer, terrainMesh, scene } = ctx;
        const terrain = geoStore.terrain;
        if (!terrainMesh || !terrain?.center) return;

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);

        removeMesh(scene, previewLine);
        previewLine = null;

        const pts = channelLineState.draftPoints;
        if (!hits.length || !pts.length) return;

        const cursorPt = worldToReal(hits[0].point, terrain);
        const preview  = buildLine([pts[pts.length - 1], cursorPt], terrain, 0xffaa00, true);
        if (preview) {
            previewLine = preview;
            scene.add(previewLine);
        }
    };

    const onMouseUp = () => {};

    // ── Aktionen (von BathymetryModal aufgerufen) ─────────────────────────────
    const undoLastPoint = () => {
        if (!channelLineState.draftPoints.length) return;
        channelLineState.draftPoints.pop();
        if (scene_ref) rebuildDraft(scene_ref, geoStore.terrain);
    };

    const commitLine = () => {
        if (channelLineState.draftPoints.length < 2) return;
        bathyStore.setChannelPolyline([...channelLineState.draftPoints]);
        channelLineState.drawing = false;
        if (scene_ref) {
            removeMesh(scene_ref, draftMesh);  draftMesh  = null;
            removeMesh(scene_ref, draftDots);  draftDots  = null;
            removeMesh(scene_ref, previewLine); previewLine = null;
            rebuildCommitted(scene_ref, geoStore.terrain, bathyStore.channelPolyline);
        }
    };

    const clearLine = () => {
        channelLineState.draftPoints = [];
        bathyStore.setChannelPolyline([]);
        if (scene_ref) {
            rebuildDraft(scene_ref, geoStore.terrain);
            rebuildCommitted(scene_ref, geoStore.terrain, []);
        }
    };

    return { activate, deactivate, onMouseDown, onMove, onMouseUp, undoLastPoint, commitLine, clearLine };
}

// Singleton-Instanz für Aktionen die außerhalb des Composables aufgerufen werden
let _instance = null;
export function getChannelLineToolInstance() {
    if (!_instance) _instance = useChannelLineTool();
    return _instance;
}
