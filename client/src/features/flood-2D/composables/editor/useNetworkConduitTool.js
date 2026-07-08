// Haltungs-Werkzeug (Pattern B, im tools-Map registriert wie Weir/Bridge). Verbindet zwei
// bestehende Schächte zu einer Haltung. Snapping erfolgt gegen den Netz-Renderer (Picking
// der Schacht-Meshes), NICHT gegen das Terrain — daher eigene onClick-Logik.
//
// Singleton (Muster getWeir3DToolInstance): dieselbe Instanz teilen sich das UI-Panel
// (NetConduitTool.vue) und der tools-Map-Eintrag in MapEditor3D.

import { reactive } from 'vue';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

let _instance = null;

export function getNetworkConduitToolInstance() {
    if (_instance) return _instance;

    const net = useNetworkStore();
    const state = reactive({ active: false, fromId: null, conveyance: 'covered', count: 0 });
    let renderer = null;   // useNetworkRenderer-Instanz (group + pickFromIntersects)

    /** Vom MapEditor3D nach dem Erzeugen des Netz-Renderers gesetzt. */
    function setRenderer(r) { renderer = r; }

    function activate() { state.active = true; state.fromId = null; state.count = 0; }
    function deactivate() { state.active = false; state.fromId = null; }

    function pickNode(ctx) {
        if (!renderer || !ctx.raycaster || !ctx.camera) return null;
        ctx.raycaster.setFromCamera(ctx.pointer, ctx.camera);
        const hits = ctx.raycaster.intersectObjects(renderer.group.children, false);
        const p = renderer.pickFromIntersects(hits);
        return p && p.kind === 'node' ? p.id : null;
    }

    function onClick(ctx) {
        const nodeId = pickNode(ctx);
        if (!nodeId) return;                       // nur Schächte sind gültige Endpunkte
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

    function onMove() { /* Vorschau-Linie optional später */ }

    _instance = { state, setRenderer, activate, deactivate, onClick, onMove,
                  reset() { state.fromId = null; } };
    return _instance;
}
