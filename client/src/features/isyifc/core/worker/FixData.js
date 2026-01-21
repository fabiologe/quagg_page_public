
// Core Enums
import { ProfilGeometrie, SystemType } from '../types.js';

// Logic Modules
import { parseNodeGeometry } from '../logic/GeometryUtils.js';
// Note: GeometryUtils might need update if we want to reuse it, but Worker did the heavy lifting.
// Actually, Worker returns { coords: {x,y,z...} }. We can use that directly.

/**
 * FIXDATA.JS (V3 - Helper for Flat Parser)
 * 
 * Consumes the "Flat 4-Type" output from IsybauParser.worker.js
 * and converts it to the final App Store format (INode/IEdge).
 */

export const normalizeGraph = (workerData) => {
    const { nodes: flatNodes, edges: flatEdges } = workerData;

    /** @type {Map<string, import('../types.js').INode>} */
    const nodes = new Map();
    /** @type {import('../types.js').IEdge[]} */
    const edges = [];
    const stats = { nodesTotal: 0, edgesTotal: 0, badGeometryCount: 0 };

    console.log(`[FixData] Normalizing ${flatNodes.length} nodes, ${flatEdges.length} edges...`);

    // --- NODES ---
    for (const n of flatNodes) {
        if (!n.coords || n.coords.x === null || n.coords.y === null) {
            stats.badGeometryCount++;
            continue;
        }

        // Map Category to Internal Type
        let type = 'Structure';
        if (n.category === 'Schacht') type = 'Manhole';
        else if (n.category === 'Anschlusspunkt') type = 'Connector';
        else if (n.category === 'Bauwerk') type = 'Structure';

        // Calculate Height
        const coverZ = n.coords.z_deckel;
        const bottomZ = n.coords.z_sohle;
        // Default height if missing
        const height = (coverZ !== null && bottomZ !== null)
            ? Math.abs(coverZ - bottomZ)
            : 2.5;

        // Position (Three.js: Y is Up)
        // Adjust for Three.js coordinates if needed (usually handled in GeometryFactory, but let's standardize here)
        // Store expects: x, y (Elevation), z (-North) usually. 
        // But let's check GeometryFactory usage.
        // Previously: pos.x, pos.y, pos.z.
        // IsyIfc usually stores: x=Easting, y=Elevation, z=Northing (inverted?).
        // Actually, standard Three: X=Right, Y=Up, Z=Forward.
        // GIS: X=East, Y=North, Z=Up.
        // Let's store GIS coordinates in `data` and translated in `pos`?
        // Current App Standard seems to be: pos = { x, y: Elevation, z: -North }

        const pos = {
            x: n.coords.x,
            y: bottomZ !== null ? bottomZ : (coverZ || 0), // Base pos at bottom
            z: -n.coords.y // Flip North to Z
        };

        nodes.set(n.id, {
            id: n.id,
            type: type,
            pos: pos,
            geometry: {
                shape: n.shape.type,
                width: n.shape.dim1,
                length: n.shape.dim2 || n.shape.dim1,
                height: height,
                coverZ: coverZ,
                bottomZ: bottomZ
            },
            attributes: {
                material: n.meta.material,
                year: n.meta.baujahr,
                subType: n.meta.subType || n.meta.kennung, // PumpwerkID or 'RR'
                systemType: SystemType.Mischwasser // Default for now
            },
            data: {
                rw: n.coords.x,
                hw: n.coords.y, // GIS North
                coverZ: coverZ,
                bottomZ: bottomZ,
                raw: n.meta // Light metadata
            },
            warnings: []
        });
        stats.nodesTotal++;
    }

    // --- EDGES ---
    for (const e of flatEdges) {
        if (!nodes.has(e.source) || !nodes.has(e.target)) {
            // console.warn(`Skipping edge ${e.id}: Node missing`);
            continue;
        }

        // Map Profil Code to Enum
        let pType = ProfilGeometrie.Kreis;
        if (e.shape.type === 'Rect') pType = ProfilGeometrie.Rechteck;
        else if (e.shape.type === 'Trapez') pType = ProfilGeometrie.Trapez;

        edges.push({
            id: e.id,
            sourceId: e.source,
            targetId: e.target,
            profile: {
                type: pType,
                width: e.shape.dim1,
                height: e.shape.dim2
            },
            material: e.meta.material,
            systemType: SystemType.Mischwasser,
            year: e.meta.baujahr || 0,
            warnings: []
        });
        stats.edgesTotal++;
    }

    return { nodes, edges, stats };
};
