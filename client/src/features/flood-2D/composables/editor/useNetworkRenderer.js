// Rendert das importierte Kanalnetz (Schächte + Haltungen) in die MapEditor3D-Szene.
// Self-contained wie useLayerRenderer: eigener Group, eigener Watch auf useNetworkStore.
// Nutzt den geteilten Welt→Szene-Transform getLocalPos (aus useLayerRenderer), damit das
// Netz exakt auf Terrain/Nodes ausgerichtet ist. Read-only (G2); Editieren folgt (G3).

import * as THREE from 'three';
import { watch } from 'vue';
import { RENDER_ORDER } from './renderLayers.js';
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore.js';

const ROLE_COLOR = {
    manhole: 0x3b82f6, inlet: 0x22c55e, outfall: 0xef4444,
    storage: 0xa855f7, junction: 0x38bdf8, weir: 0xf59e0b, orifice: 0xf97316, pump: 0xeab308,
};
const CONDUIT_COLOR = 0x94a3b8;   // Rohr (covered)
const CHANNEL_COLOR = 0x06b6d4;   // offenes Gerinne (open)
const SELECT_COLOR  = 0xa3e635;   // SaintV-Lime

/**
 * @param {THREE.Scene} scene
 * @param {(x:number,y:number,z:number)=>THREE.Vector3} getLocalPos  aus useLayerRenderer
 */
export function useNetworkRenderer(scene, getLocalPos) {
    const net = useNetworkStore();

    const group = new THREE.Group();
    group.name = 'Layer_Network';
    group.renderOrder = RENDER_ORDER.NETWORK;
    scene.add(group);

    const disposeChild = (o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); };
    const clear = () => {
        for (let i = group.children.length - 1; i >= 0; i--) { const c = group.children[i]; disposeChild(c); group.remove(c); }
    };

    const nodePos = (n, atRim = false) =>
        getLocalPos(n.x, n.y, atRim ? n.rim : n.invert);

    function renderNode(n) {
        const top = nodePos(n, true);
        const bot = nodePos(n, false);
        const h = Math.max(top.y - bot.y, 0.5);
        const r = Math.max((n.attrs?.diameter ?? 1.0) / 2, 0.4);
        const geo = new THREE.CylinderGeometry(r, r, h, 12);
        const selected = net.selectedId === n.id;
        const mat = new THREE.MeshStandardMaterial({
            color: selected ? SELECT_COLOR : (ROLE_COLOR[n.role] ?? 0x64748b),
            roughness: 0.7, metalness: 0.1,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(top.x, (top.y + bot.y) / 2, top.z);
        mesh.renderOrder = RENDER_ORDER.NETWORK;
        mesh.userData = { networkId: n.id, networkKind: 'node' };
        group.add(mesh);
    }

    function renderLink(l) {
        const from = net.nodeById.get(l.fromNodeId);
        const to   = net.nodeById.get(l.toNodeId);
        if (!from || !to) return;   // dangling — von der Validierung ohnehin gemeldet
        // Polylinie: eigene Stützpunkte, sonst gerade Sohl-Verbindung.
        let pts;
        if (Array.isArray(l.points) && l.points.length >= 2) {
            pts = l.points.map(p => getLocalPos(p.x, p.y, p.z));
        } else {
            pts = [nodePos(from, false), nodePos(to, false)];
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const radius = Math.max((l.profile?.height ?? 0.3) / 2, 0.12);
        const geo = new THREE.TubeGeometry(curve, Math.max(pts.length * 4, 8), radius, 8, false);
        const selected = net.selectedId === l.id;
        const base = l.conveyance === 'open' ? CHANNEL_COLOR : CONDUIT_COLOR;
        const mat = new THREE.MeshStandardMaterial({ color: selected ? SELECT_COLOR : base, roughness: 0.6, metalness: 0.2 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = RENDER_ORDER.NETWORK;
        mesh.userData = { networkId: l.id, networkKind: 'link' };
        group.add(mesh);
    }

    function render() {
        clear();
        if (!net.hasNetwork) return;
        for (const l of net.links) renderLink(l);   // Haltungen zuerst (unter den Schächten)
        for (const n of net.nodes) renderNode(n);
    }

    // Reaktiv: Import, Selektion, Terrain-Zentrierung.
    watch(() => [net.nodes, net.links, net.selectedId], render, { deep: true, immediate: true });

    /** Aus Raycaster-Intersects den getroffenen Netz-Eintrag lesen (für Picking). */
    function pickFromIntersects(intersects) {
        for (const hit of intersects) {
            let o = hit.object;
            while (o && !o.userData?.networkId) o = o.parent;
            if (o?.userData?.networkId) return { id: o.userData.networkId, kind: o.userData.networkKind };
        }
        return null;
    }

    function dispose() { clear(); scene.remove(group); }

    return { group, render, pickFromIntersects, dispose };
}
