
// Core Enums
import { ProfilGeometrie, SystemType } from '../types.js';

// Logic Modules
import { GeometryCalculator } from '../logic/GeometryCalculator.js';
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
    const categoriesFound = new Set();
    for (const n of flatNodes) {
        categoriesFound.add(n.category);
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

        // Resolve Standard Heights using Calculator
        // Convert to temp shape obj for calc
        const calcShape = { height: height };
        const hRes = GeometryCalculator.resolveNodeHeight(n.coords, calcShape);

        nodes.set(n.id, {
            id: n.id,
            type: type,
            pos: pos,
            geometry: {
                width: n.shape.dim1,
                length: n.shape.dim2 || n.shape.dim1,
                height: hRes.height,
                coverZ: hRes.coverZ,
                bottomZ: hRes.bottomZ,
                shape: n.shape.type // 'Box' or 'Cylinder'
            },
            attributes: {
                material: n.meta.material,
                year: n.meta.baujahr,
                subType: n.meta.subType || n.meta.kennung, // PumpwerkID or 'RR'
                systemType: n.meta.kanalart || SystemType.Mischwasser,
                status: n.meta.Status // CRITICAL: Expose Status for visualizer
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
    console.log("[FixData] Node Categories:", Array.from(categoriesFound));

    // --- EDGES ---
    for (const e of flatEdges) {
        if (!nodes.has(e.source) || !nodes.has(e.target)) {
            console.warn(`[FixData] Skipping edge ${e.id}: Node missing. Src: '${e.source}', Tgt: '${e.target}'`);
            // Debug: print some node IDs to compare
            if (stats.edgesTotal === 0 && nodes.size > 0) {
                console.log("Available Nodes sample:", Array.from(nodes.keys()).slice(0, 5));
            }
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
            // Map Kanalart to SystemType (or pass raw string if unknown)
            // SystemType enum might need to be expanded, or we treat this as a string.
            // Let's pass the raw string for GeometryFactory to handle (flexibility).
            systemType: e.meta.kanalart || SystemType.Mischwasser,
            status: e.meta.Status,
            year: e.meta.baujahr || 0,

            // New Hydraulic & Geometry Props
            sohleZulauf: e.meta.sohleZulauf,
            sohleAblauf: e.meta.sohleAblauf,
            intermediatePoints: e.geometry ? e.geometry.waypoints : [],

            // Calculated Geometry (Persisted for Export)
            geometry: GeometryCalculator.calculateEdgeGeometry(
                e.meta, // Pass raw meta for Sohle
                nodes.get(e.source),
                nodes.get(e.target)
            ),

            warnings: []
        });
        stats.edgesTotal++;
    }

    return { nodes, edges, stats };
};
