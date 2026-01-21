import { KnotenTyp, ProfilGeometrie, SystemType } from '../types.js';
import { parseNodeGeometry } from '../logic/GeometryUtils.js';
import { parseIsyValue, UNIT_MATRIX } from '../logic/UnitMatrix.js';

// FixData.js - Logic Version 3.0 (Raw Input)
/**
 * @param {{ rawNodes: import('../types.js').IsyRawNode[], rawEdges: import('../types.js').IsyRawEdge[] }} rawData
 */
export const normalizeGraph = (rawData) => {
    /** @type {Map<string, import('../types.js').INode>} */
    const nodes = new Map();
    /** @type {import('../types.js').IEdge[]} */
    const edges = [];

    // Check input presence
    if (!rawData || !rawData.rawNodes || !rawData.rawEdges) {
        return { nodes, edges, stats: { nodesTotal: 0, edgesTotal: 0, badGeometryCount: 0 }, errors: ["Invalid Raw Data Input"] };
    }

    const { rawNodes, rawEdges } = rawData;
    const stats = { nodesTotal: 0, edgesTotal: 0, badGeometryCount: 0 };
    const globalErrors = [];

    // Map SystemType Helper (Duplicated or imported? Logic is simple enough to keep)
    const resolveSystemType = (val) => {
        if (!val) return SystemType.Sonstige;
        const s = String(val).toLowerCase();
        if (s.includes('schmutz') || s === 'sw' || s === 's') return SystemType.SW;
        if (s.includes('regen') || s === 'rw' || s === 'r') return SystemType.RW;
        if (s.includes('misch') || s === 'mw' || s === 'm') return SystemType.MW;
        return SystemType.Sonstige;
    };

    // --- PROCESS EDGES ---
    console.log(`[FixData] Processing ${rawEdges.length} raw edges...`);
    let debuggedEdges = 0;

    for (const e of rawEdges) {
        if (!e.source || !e.target) {
            if (debuggedEdges < 5) {
                console.warn(`[FixData] Skipping Edge ${e.id}: Missing Source/Target`, { source: e.source, target: e.target, raw: e.raw });
                debuggedEdges++;
            }
            continue;
        }

        // Profile Mapping (G205 Code handled in FixData logic)
        // Worker returns: typeCode, width (m), height (m)
        const pCode = parseIsyValue('Profilart', e.profile.typeCode);
        // Note: Worker already normalized? 
        // Worker code: `typeCode: profil?.Profilart`. No parseIsyValue there.
        // Worker code: `width: parseIsyValue(...)`. Yes normalized.

        let pType = ProfilGeometrie.Unbekannt;

        // Mapping
        if ([0, 1, 2, 4, 6, 7, 23].includes(pCode)) pType = ProfilGeometrie.Kreis;
        else if ([3, 5].includes(pCode)) pType = ProfilGeometrie.Rechteck;
        else if ([8, 9].includes(pCode)) pType = ProfilGeometrie.Trapez;
        // Text fallback (check raw)
        else if (String(e.profile.typeCode).toLowerCase().includes('rechteck')) pType = ProfilGeometrie.Rechteck;
        else if (String(e.profile.typeCode).toLowerCase().includes('trapez')) pType = ProfilGeometrie.Trapez;
        else pType = ProfilGeometrie.Kreis;

        edges.push({
            id: String(e.id),
            sourceId: e.source,
            targetId: e.target,
            profile: {
                type: pType,
                width: e.profile.width || 0.3,
                height: e.profile.height || 0.3,
            },
            material: e.material || 'Concrete',
            systemType: resolveSystemType(e.raw?.Entwaesserungsart),
            year: parseIsyValue('Baujahr', e.raw?.Baujahr),
            warnings: []
        });
        stats.edgesTotal++;
    }

    // --- PROCESS NODES ---
    for (const n of rawNodes) {
        const id = n.id;
        if (!id) continue;

        // Geometry Extraction (Point Fusion)
        const geo = parseNodeGeometry(n); // Merges Points + Depth/CoverZ hint
        if (!geo) {
            stats.badGeometryCount++;
            continue;
        }

        stats.nodesTotal++;

        // Determine Type (Worker already populated kType and normalized geometry)
        let type = 'Structure';

        if (n.kType === 0) type = 'Manhole';
        else if (n.kType === 1) type = 'Connector';
        else if (n.kType === 2) type = 'Structure';

        // Dimensions (Already normalized in Worker)
        const dim = {
            width: n.geometry.width,
            length: n.geometry.length
        };

        nodes.set(id, {
            id: id,
            type: type,
            pos: { x: geo.x, y: geo.y, z: geo.z },
            geometry: {
                coverZ: geo.coverZ, // Calculated from Points or Attribute
                bottomZ: geo.bottomZ,
                height: geo.height,
                shape: n.geometry.shape,
                dimensions: dim
            },
            attributes: {
                material: n.attributes.material,
                subType: n.attributes.subType,
                systemType: resolveSystemType(n.raw?.Entwaesserungsart),
                year: parseIsyValue('Baujahr', n.raw?.Baujahr),
                status: n.raw?.Status || n.raw?.StatusKanal
            },
            // Metadata for UI
            data: {
                rw: geo.x,
                hw: -geo.z,
                coverZ: geo.coverZ,
                bottomZ: geo.bottomZ,
                raw: n.raw // Full Metadata dump
            },
            warnings: []
        });
    }

    return { nodes, edges, stats, errors: globalErrors };
};
