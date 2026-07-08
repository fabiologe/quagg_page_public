// Unified Geometry Engine — NetworkModel (G0).
// Single Source of Truth für das Kanalnetz als Entities + Topologie. Kompiliert nach
// SWMM (1D) über toSwmmStore() und liefert die Geometrie für Kopplung/Render.

import { makeNode, makeLink, isNode, isLink, NODE_ROLES } from './entities.js';

// Rollen → SWMM-Bauwerkstyp (bauwerkstyp), damit der portierte SwmmBuilder klassifiziert.
// (SwmmBuilder: 3/4/5=Outfall, 1/2/12/13=Storage, 6=Pumpe,7=Wehr,8=Drossel,9=Schieber.)
const ROLE_TO_BTYP = { outfall: 3, storage: 1, pump: 6, weir: 7, orifice: 8 };

export class NetworkModel {
    constructor() {
        this.nodes = new Map();   // id → node-entity
        this.links = new Map();   // id → link-entity
    }

    addNode(spec) { const n = isNode(spec) ? spec : makeNode(spec); this.nodes.set(n.id, n); return n; }
    addLink(spec) { const l = isLink(spec) ? spec : makeLink(spec); this.links.set(l.id, l); return l; }

    get nodeList() { return [...this.nodes.values()]; }
    get linkList() { return [...this.links.values()]; }

    /** Topologie: Nachbarknoten (über Links) eines Knotens. */
    neighbors(nodeId) {
        const out = [];
        for (const l of this.links.values()) {
            if (l.refs.fromNodeId === nodeId && l.refs.toNodeId) out.push(l.refs.toNodeId);
            else if (l.refs.toNodeId === nodeId && l.refs.fromNodeId) out.push(l.refs.fromNodeId);
        }
        return out;
    }

    /** Basis-Validierung: Links mit fehlenden Endknoten, isolierte Knoten. */
    validate() {
        const issues = [];
        for (const l of this.links.values()) {
            if (!l.refs.fromNodeId || !this.nodes.has(l.refs.fromNodeId))
                issues.push({ level: 'error', id: l.id, msg: `Haltung ${l.id}: Anfangsknoten fehlt/unbekannt` });
            if (!l.refs.toNodeId || !this.nodes.has(l.refs.toNodeId))
                issues.push({ level: 'error', id: l.id, msg: `Haltung ${l.id}: Endknoten fehlt/unbekannt` });
        }
        return issues;
    }

    /**
     * 1D-Compiler-Adapter: liefert ein store-artiges Objekt, das der portierte
     * SwmmBuilder (services/swmm/SwmmBuilder.js) direkt konsumiert.
     */
    toSwmmStore() {
        const swmmNodes = this.nodeList
            .filter(n => NODE_ROLES.has(n.role))
            .map(n => {
                const depth = Math.max(0, n.geom.rim - n.geom.invert);
                return {
                    id: n.id, x: n.geom.x, y: n.geom.y,
                    z: n.geom.invert, coverZ: n.geom.rim, depth,
                    isManhole: n.role !== 'junction' ? (n.attrs.isManhole ?? true) : (n.attrs.isManhole ?? false),
                    canOverflow: n.attrs.canOverflow ?? true,
                    is_sink: n.role === 'outfall',
                    type: n.attrs.type ?? n.role,
                    volume: num0(n.attrs.volume),
                    bauwerkstyp: n.attrs.bauwerkstyp ?? ROLE_TO_BTYP[n.role] ?? null,
                    constantInflow: num0(n.attrs.constantInflow),
                };
            });
        const swmmEdges = this.linkList
            .filter(l => l.conveyance !== 'open')   // offene Gerinne gehen NICHT nach SWMM (→ SGC/2D)
            .map(l => ({
                id: l.id, fromNodeId: l.refs.fromNodeId, toNodeId: l.refs.toNodeId,
                length: l.geom.length ?? 0,
                roughness: num0(l.attrs.kSt ?? l.attrs.roughness),
                z1: l.attrs.z1, z2: l.attrs.z2,
                profile: { type: l.geom.profile.shape, height: l.geom.profile.height, width: l.geom.profile.width },
            }));
        return { getAllNodes: swmmNodes, getAllEdges: swmmEdges, edges: swmmEdges, areas: [] };
    }
}

function num0(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
