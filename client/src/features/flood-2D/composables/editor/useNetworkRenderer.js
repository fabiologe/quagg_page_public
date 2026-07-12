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

// Ergebnis-Darstellung (Result-Viewer): Füllgrad-Färbung + Schacht-Wassersäule
const WATER_COLOR     = 0x38bdf8; // teilgefüllt
const SURCHARGE_COLOR = 0xef4444; // Vollfüllung/Überdruck (capacity ≥ 1)
const FLOOD_COLOR     = 0xff7043; // Schacht überstaut (flooding > 0)
const _waterC = new THREE.Color(WATER_COLOR);
const _tmpC = new THREE.Color();

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
    // Mesh-Register für die Ergebnis-Einfärbung (applyResults) — id → Mesh/Metadaten.
    const nodeMeshes = new Map();
    const linkMeshes = new Map();
    let lastState = null; // zuletzt angewandter Ergebnis-Zustand (überlebt re-render)
    const clear = () => {
        for (let i = group.children.length - 1; i >= 0; i--) { const c = group.children[i]; disposeChild(c); group.remove(c); }
        nodeMeshes.clear();
        linkMeshes.clear();
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
            transparent: true, opacity: 0.85, // Wassersäule im Schacht bleibt sichtbar
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(top.x, (top.y + bot.y) / 2, top.z);
        mesh.renderOrder = RENDER_ORDER.NETWORK;
        mesh.userData = { networkId: n.id, networkKind: 'node' };
        group.add(mesh);

        // Wassersäule (Result-Viewer): Einheits-Zylinder, per scale.y auf den
        // aktuellen Wasserstand gebracht (applyResults). Ohne Ergebnisse unsichtbar.
        const waterGeo = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 1, 10);
        const waterMat = new THREE.MeshStandardMaterial({
            color: WATER_COLOR, roughness: 0.3, metalness: 0.0,
            transparent: true, opacity: 0.9,
        });
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.visible = false;
        water.position.set(top.x, bot.y, top.z);
        water.renderOrder = RENDER_ORDER.NETWORK + 1;
        water.userData = { networkId: n.id, networkKind: 'node-water' };
        group.add(water);

        nodeMeshes.set(n.id, { mesh, water, botY: bot.y, h });
    }

    // Rohrsohle am Knoten: attrs.z1/z2 (absolute Haltungssohle, z. B. Einlauf 1.5 m ÜBER
    // der Schachtsohle — SWMM InOffset/OutOffset) gewinnt vor der Knotensohle.
    const linkEndZ = (l, node, key) => {
        const z = Number(l.attrs?.[key]);
        return Number.isFinite(z) ? z : node.invert;
    };

    // ISYBAU-Profile kommen teils in mm (DN600 = 600) — defensiv normalisieren und den
    // Radius klemmen: ein kaputter Wert machte sonst ein hunderte Meter dickes Rohr, in
    // dem die Kamera INNEN steckt (sichtbar als „zwei Schalen" statt rundem Rohr).
    const linkRadius = (l) => {
        let h = Number(l.profile?.height);
        if (!Number.isFinite(h) || h <= 0) h = 0.3;
        if (h > 10) h = h / 1000;                      // mm → m (kein Rohr ist > 10 m)
        return Math.min(Math.max(h / 2, 0.12), 2.5);
    };

    function renderLink(l) {
        const from = net.nodeById.get(l.fromNodeId);
        const to   = net.nodeById.get(l.toNodeId);
        if (!from || !to) return;   // dangling — von der Validierung ohnehin gemeldet
        // Polylinie: eigene Stützpunkte (nur mit endlichen Koordinaten), sonst gerade
        // Verbindung der Rohrsohlen (z1/z2-bewusst).
        let pts = null;
        if (Array.isArray(l.points) && l.points.length >= 2) {
            const clean = l.points.filter(p =>
                Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));
            if (clean.length >= 2) pts = clean.map(p => getLocalPos(p.x, p.y, p.z));
        }
        if (!pts) {
            pts = [
                getLocalPos(from.x, from.y, linkEndZ(l, from, 'z1')),
                getLocalPos(to.x,   to.y,   linkEndZ(l, to,   'z2')),
            ];
        }
        // GERADE Segmente statt CatmullRom: Rohre laufen gestreckt von Schacht zu Schacht —
        // die Spline hat zwischen den Stützpunkten über-/untergeschwungen (Beulen/Schalen).
        const path = new THREE.CurvePath();
        for (let i = 0; i < pts.length - 1; i++) {
            if (pts[i].distanceToSquared(pts[i + 1]) < 1e-8) continue;  // Doppelpunkt
            path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
        }
        if (path.curves.length === 0) return;   // degeneriert (Nulllänge)
        const radius = linkRadius(l);
        const geo = new THREE.TubeGeometry(path, Math.max(path.curves.length * 2, 2), radius, 16, false);
        const selected = net.selectedId === l.id;
        // Sonder-Link: Haltung, die von Pumpe/Wehr/Drossel ABGEHT, wird zum SWMM-
        // Sonderbauwerk (SwmmBuilder) — in der Rollenfarbe des Bauwerks markieren.
        const special = ['pump', 'weir', 'orifice'].includes(from.role);
        const base = special ? (ROLE_COLOR[from.role] ?? CONDUIT_COLOR)
            : (l.conveyance === 'open' ? CHANNEL_COLOR : CONDUIT_COLOR);
        // DoubleSide: die Tube ist an den Enden offen — einseitig gerendert sah man von
        // schräg oben durchs offene Ende die Innenwand als zweite „Schale".
        const mat = new THREE.MeshStandardMaterial({
            color: selected ? SELECT_COLOR : base, roughness: 0.6, metalness: 0.2,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = RENDER_ORDER.NETWORK;
        mesh.userData = { networkId: l.id, networkKind: 'link', baseColor: base };
        group.add(mesh);
        linkMeshes.set(l.id, mesh);
    }

    function render() {
        clear();
        if (!net.hasNetwork) return;
        for (const l of net.links) renderLink(l);   // Haltungen zuerst (unter den Schächten)
        for (const n of net.nodes) renderNode(n);
        if (lastState) applyResults(lastState);      // Ergebnis-Färbung übersteht re-render
    }

    /**
     * Ergebnis-Zustand aufs Netz malen (Result-Viewer, pro Frame):
     * Haltungen füllgrad-gefärbt (grau→wasserblau, Vollfüllung rot), Schächte mit
     * Wassersäule (invert→Wasserstand) und Überstau-Signalfarbe.
     * @param {{nodes:Map<string,{fill,flooded,depth}>, links:Map<string,{fill,surcharged,flow}>}|null} state
     *        aus useNetworkResults.stateAtFrame(frame); null = zurück zur Basis-Darstellung.
     */
    function applyResults(state) {
        lastState = state;
        for (const [id, rec] of nodeMeshes) {
            const s = state?.nodes?.get(id);
            const selected = net.selectedId === id;
            if (!s || s.fill <= 0.01) {
                rec.water.visible = false;
            } else {
                const hW = Math.max(s.fill * rec.h, 0.05);
                rec.water.visible = true;
                rec.water.scale.set(1, hW, 1);
                rec.water.position.y = rec.botY + hW / 2;
                rec.water.material.color.set(s.flooded ? FLOOD_COLOR : WATER_COLOR);
            }
            if (!selected) {
                rec.mesh.material.emissive.set(s?.flooded ? 0x7f1d1d : 0x000000);
            }
        }
        for (const [id, mesh] of linkMeshes) {
            if (net.selectedId === id) continue;     // Auswahl-Farbe gewinnt
            const s = state?.links?.get(id);
            if (!s) { mesh.material.color.set(mesh.userData.baseColor); continue; }
            if (s.surcharged) {
                mesh.material.color.set(SURCHARGE_COLOR);
            } else {
                _tmpC.set(mesh.userData.baseColor);
                _tmpC.lerp(_waterC, Math.min(s.fill / 0.9, 1));
                mesh.material.color.copy(_tmpC);
            }
        }
    }

    // Reaktiv: Import, Selektion, Terrain-Zentrierung.
    watch(() => [net.nodes, net.links, net.selectedId], render, { deep: true, immediate: true });

    /** Drag-Vorschau (NET_NODE): nur das Schacht-Mesh bewegen, ohne Store-Write —
     *  der Commit beim Drop triggert den Store-Watch und zieht die Haltungen nach. */
    function previewNodePosition(id, x, y, zRim) {
        const rec = nodeMeshes.get(id);
        if (!rec) return;
        const top = getLocalPos(x, y, zRim);
        rec.mesh.position.set(top.x, top.y - rec.h / 2, top.z);
        rec.water.visible = false;
        rec.water.position.x = top.x;
        rec.water.position.z = top.z;
    }

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

    return { group, render, applyResults, previewNodePosition, pickFromIntersects, dispose, getLocalPos };
}
