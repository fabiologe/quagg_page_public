
// Core Enums
import { ProfilGeometrie, SystemType } from '../types.js';

/**
 * FIXDATA.JS (Zero-Centering Logic)
 * 
 * Normalizes all coordinates to a local 0,0 origin to prevent floating point jitter in Three.js.
 * Returns the valid Global Origin for Georeferencing (IFC Export).
 */

export const normalizeGraph = (workerData) => {
    const { nodes: flatNodes, edges: flatEdges } = workerData;

    /** @type {Map<string, import('../types.js').INode>} */
    const nodes = new Map();
    /** @type {import('../types.js').IEdge[]} */
    const edges = [];

    // 1. CALCULATE WORLD ORIGIN (MinX, MinY)
    let minX = Infinity;
    let minY = Infinity;
    let validNodes = 0;

    for (const n of flatNodes) {
        if (n.coords && n.coords.x !== null && n.coords.y !== null) {
            if (n.coords.x < minX) minX = n.coords.x;
            if (n.coords.y < minY) minY = n.coords.y;
            validNodes++;
        }
    }

    // Fallback if empty
    if (minX === Infinity) { minX = 0; minY = 0; }

    // Round to integers for clean IFC Header
    const WORLD_ORIGIN = { x: Math.floor(minX), y: Math.floor(minY), z: 0 };
    console.log(`[FixData] World Origin calculated:`, WORLD_ORIGIN);

    // 2. NORMALIZE NODES
    for (const n of flatNodes) {
        if (!n.coords || n.coords.x === null) continue;

        // Type Determination
        let type = 'Structure';
        if (n.category === 'Schacht') type = 'Manhole';
        else if (n.category === 'Anschlusspunkt') type = 'Connector';
        else if (n.category === 'Bauwerk') type = 'Structure';

        // COORDINATE TRANSFORMATION (ISYBAU -> LOCAL STORE)
        // Store System: X = Easting(Local), Y = Elevation(Height), Z = -Northing(Local)

        const localX = n.coords.x - WORLD_ORIGIN.x;
        const localNorth = n.coords.y - WORLD_ORIGIN.y;

        const zDeckel = n.coords.z_deckel !== null ? n.coords.z_deckel : 0;
        const zSohle = n.coords.z_sohle !== null ? n.coords.z_sohle : (zDeckel - 2);

        // Store Position (LOCAL)
        const pos = {
            x: localX,
            y: zSohle,      // Y is UP
            z: -localNorth  // Z is -North
        };

        const dim1 = n.shape.dim1 || 1.0;
        const dim2 = n.shape.dim2 || dim1;
        const height = Math.abs(zDeckel - zSohle) || 2.0;

        nodes.set(n.id, {
            id: n.id,
            type: type,
            pos: pos, // LOCAL COORDINATES for Viewer
            geometry: {
                width: dim1,
                length: dim2,
                height: height,
                coverZ: zDeckel,
                bottomZ: zSohle,
                shape: n.shape.type
            },
            attributes: {
                material: n.meta.material,
                year: n.meta.baujahr,
                subType: n.meta.subType || n.meta.kennung,
                status: n.meta.Status,
                systemType: n.meta.kanalart || SystemType.Mischwasser
            },
            // RAW DATA for IFC Export (Geo-Reference restoration)
            data: {
                rw: n.coords.x, // Real World X
                hw: n.coords.y, // Real World Y
                coverZ: zDeckel,
                bottomZ: zSohle
            },
            warnings: []
        });
    }

    // 3. PROCESS EDGES
    for (const e of flatEdges) {
        const src = nodes.get(e.source);
        const tgt = nodes.get(e.target);
        if (!src || !tgt) continue;

        // Code Mapping
        let pType = ProfilGeometrie.Kreis;
        if (e.shape.type === 'Rect') pType = ProfilGeometrie.Rechteck;
        else if (e.shape.type === 'Trapez') pType = ProfilGeometrie.Trapez;

        // Height Logic
        const zStart = (e.meta.sohleZulauf !== null) ? e.meta.sohleZulauf : src.geometry.bottomZ;
        const zEnd = (e.meta.sohleAblauf !== null) ? e.meta.sohleAblauf : tgt.geometry.bottomZ;

        // Calculate Pipe Geometry
        // We calculate explicit Start/End points in Local Space for the Viewer/Factory

        edges.push({
            id: e.id,
            sourceId: e.source,
            targetId: e.target,
            profile: {
                type: pType,
                width: e.shape.dim1 || 0.3,
                height: e.shape.dim2 || 0.3
            },
            geometry: {
                // Explicit Local Start/End Points
                startPoint: { x: src.pos.x, y: zStart, z: src.pos.z },
                endPoint: { x: tgt.pos.x, y: zEnd, z: tgt.pos.z },
                // Calc length
                length: Math.sqrt(
                    Math.pow(tgt.pos.x - src.pos.x, 2) +
                    Math.pow(zEnd - zStart, 2) +
                    Math.pow(tgt.pos.z - src.pos.z, 2)
                )
            },
            attributes: {
                material: e.meta.material,
                status: e.meta.Status,
                systemType: e.meta.kanalart || SystemType.Mischwasser,
                year: e.meta.baujahr
            },
            sohleZulauf: e.meta.sohleZulauf,
            sohleAblauf: e.meta.sohleAblauf,
            warnings: []
        });
    }

    // Return Data structure compatible with Store action 'setGraphData'
    return {
        nodes,
        edges,
        origin: WORLD_ORIGIN, // IMPLICITLY RETURNED ORIGIN
        stats: {
            nodesTotal: nodes.size,
            edgesTotal: edges.length
        }
    };
};
