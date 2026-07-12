// Haltungs-Werkzeug (Pattern B, im tools-Map registriert wie Weir/Bridge). Verbindet zwei
// Schächte zu einer Haltung. Snapping erfolgt gegen den Netz-Renderer (Picking der
// Schacht-Meshes); Klick auf leeres Gelände legt automatisch einen neuen Schacht an
// (Auto-Schacht, E3) und verbindet dorthin. Während der Kette zeigt eine gestrichelte
// Rubber-Band-Linie vom Startschacht zum Cursor (gesnappt = Lime, sonst Conveyance-Farbe).
//
// Singleton (Muster getWeir3DToolInstance): dieselbe Instanz teilen sich das UI-Panel
// (NetConduitTool.vue) und der tools-Map-Eintrag in MapEditor3D.

import * as THREE from 'three';
import { reactive } from 'vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { createTerrainCursor } from './useTerrainCursor.js';

const AUTO_NODE_DEPTH = 2.0;      // Standardtiefe [m] für Auto-Schächte (Deckel = Gelände)
const SNAP_COLOR = 0xa3e635;      // Cursor rastet auf Schacht ein
const CONDUIT_COLOR = 0x94a3b8;   // Vorschau Rohr (covered)
const CHANNEL_COLOR = 0x06b6d4;   // Vorschau offenes Gerinne (open)

let _instance = null;

export function getNetworkConduitToolInstance() {
    if (_instance) return _instance;

    const net = useNetworkStore();
    const geo = useGeoStore();
    const state = reactive({ active: false, fromId: null, conveyance: 'covered', count: 0 });
    let renderer = null;   // useNetworkRenderer-Instanz (group + pickFromIntersects + getLocalPos)
    let previewLine = null;
    const cursor = createTerrainCursor();  // Hover-Ring: zeigt den Klickpunkt (Lime = Schacht-Snap)

    /** Vom MapEditor3D nach dem Erzeugen des Netz-Renderers gesetzt. */
    function setRenderer(r) { renderer = r; }

    function activate() { state.active = true; state.fromId = null; state.count = 0; }
    function deactivate() { state.active = false; state.fromId = null; removePreview(); cursor.hide(); }

    function pickNode(ctx) {
        if (!renderer || !ctx.raycaster || !ctx.camera) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObjects(renderer.group.children, false);
        const p = renderer.pickFromIntersects(hits);
        return p && p.kind === 'node' ? p.id : null;
    }

    /** Terrain-Treffer unter dem Cursor in Szenen-Koordinaten (Raycaster muss gesetzt sein). */
    function pickTerrainLocal(ctx) {
        if (!ctx.terrainMesh || !ctx.raycaster) return null;
        const hits = ctx.raycaster.intersectObject(ctx.terrainMesh);
        return hits.length ? hits[0].point : null;
    }

    /** Szene → Welt (Umkehrung des useInteractionManager-Transforms). */
    function toWorld(p) {
        const grid = geo.terrain;
        if (!grid?.center) return null;
        return { x: p.x + grid.center.x, y: -p.z + grid.center.y, z: p.y + grid.minZ };
    }

    function removePreview() {
        if (previewLine) {
            previewLine.parent?.remove(previewLine);
            previewLine.geometry?.dispose?.();
            previewLine.material?.dispose?.();
            previewLine = null;
        }
    }

    function updatePreview(a, b, color) {
        if (!renderer) return;
        // renderer.render() räumt die Gruppe komplett — verwaiste Linie neu aufbauen.
        if (previewLine && !previewLine.parent) removePreview();
        const lift = 0.4; // leicht über Terrain gegen Z-Fighting
        const pts = [a.clone(), b.clone()];
        pts[0].y += lift; pts[1].y += lift;
        if (!previewLine) {
            previewLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineDashedMaterial({ color, dashSize: 1.6, gapSize: 0.9, transparent: true, opacity: 0.95 })
            );
            previewLine.renderOrder = 999;
            renderer.group.add(previewLine);
        } else {
            previewLine.geometry.setFromPoints(pts);
            previewLine.material.color.set(color);
        }
        previewLine.computeLineDistances();
    }

    function onClick(ctx) {
        let nodeId = pickNode(ctx);
        if (!nodeId) {
            // Auto-Schacht: Klick auf leeres Gelände legt den Endpunkt gleich an
            // (Deckel = Gelände, Standardtiefe) — kein Werkzeugwechsel nötig.
            const local = pickTerrainLocal(ctx);
            const w = local ? toWorld(local) : null;
            if (!w) return;
            nodeId = net.addNode({ role: 'manhole', x: w.x, y: w.y, rim: w.z, invert: w.z - AUTO_NODE_DEPTH });
        }
        if (!state.fromId) {
            state.fromId = nodeId;                 // 1. Klick = Anfangsknoten
            net.select(nodeId);
            return;
        }
        if (nodeId === state.fromId) return;       // gleicher Knoten → ignorieren
        net.addLink({ fromNodeId: state.fromId, toNodeId: nodeId, conveyance: state.conveyance });
        state.count++;
        state.fromId = nodeId;                     // Kette fortsetzen (kontinuierliches Zeichnen)
    }

    function onMove(ctx) {
        const snapId = pickNode(ctx);              // setzt den Raycaster (auch für den Cursor)
        cursor.update(ctx, { snap: !!snapId });

        if (!state.fromId || !renderer) { removePreview(); return; }
        const from = net.nodeById.get(state.fromId);
        if (!from) { removePreview(); return; }
        let target = null;
        let color = state.conveyance === 'open' ? CHANNEL_COLOR : CONDUIT_COLOR;
        if (snapId && snapId !== state.fromId) {
            const t = net.nodeById.get(snapId);
            if (t) { target = renderer.getLocalPos(t.x, t.y, t.rim); color = SNAP_COLOR; }
        }
        if (!target) target = pickTerrainLocal(ctx);
        if (!target) { removePreview(); return; }
        updatePreview(renderer.getLocalPos(from.x, from.y, from.rim), target, color);
    }

    _instance = { state, setRenderer, activate, deactivate, onClick, onMove,
                  reset() { state.fromId = null; removePreview(); cursor.hide(); } };
    return _instance;
}
