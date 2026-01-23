/**
 * GeometryCalculator.js
 * 
 * Central Logic for resolving 3D coordinates and hydraulic geometry.
 * Used by FixData (Worker) to persist accurate geometry to the Store.
 */

// Simple 3D Vector Math helper (to avoid importing heavy Three.js in Worker if possible, 
// though Three.js is often available. simpler to keep it pure JS here for generic usage)
const distance3D = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);

export const GeometryCalculator = {

    /**
     * Resolves the "Physical" Z-Levels of a Node.
     * @param {Object} coords - Raw Coords from Parser {x, y, z_deckel, z_sohle}
     * @param {Object} shape - Shape info {height...}
     * @returns {Object} { coverZ, bottomZ, height } normalized
     */
    resolveNodeHeight(coords, shape) {
        let coverZ = coords.z_deckel;
        let bottomZ = coords.z_sohle;
        let height = shape.height;

        // Fallbacks are already largely handled in Parser, but clean up here
        if (coverZ === null && bottomZ !== null) coverZ = bottomZ + (height || 2.0);
        if (bottomZ === null && coverZ !== null) bottomZ = coverZ - (height || 2.0);

        // Final Safety
        if (coverZ === null) coverZ = 0;
        if (bottomZ === null) bottomZ = 0;

        return { coverZ, bottomZ, height: Math.abs(coverZ - bottomZ) };
    },

    /**
     * Calculates precise 3D Start/End points for an Edge.
     * Logic: Uses explicit SohleZulauf/Ablauf if available, otherwise Node Bottom.
     * @param {Object} edge - The raw edge object
     * @param {Object} srcNode - The source node object
     * @param {Object} tgtNode - The target node object
     */
    calculateEdgeGeometry(edge, srcNode, tgtNode) {
        if (!srcNode || !tgtNode) return null;

        // 1. Coordinates (GIS uses X/Y, we map to 3D here?)
        // FixData usually maps: X -> x, Y -> z(North), Z -> y(Elevation)
        // Let's stick to the "Store Coordinate System": 
        // pos: { x: Easting, y: Elevation, z: -Northing } (Three.js standard in app)

        // Source
        const sx = srcNode.pos.x;
        const sz = srcNode.pos.z;
        // Hydraulic Z (Sohle) -> Priority: Edge Attribute -> Node Bottom
        const sy = (edge.sohleZulauf !== null && edge.sohleZulauf !== undefined)
            ? edge.sohleZulauf
            : srcNode.geometry.bottomZ;

        // Target
        const tx = tgtNode.pos.x;
        const tz = tgtNode.pos.z;
        const ty = (edge.sohleAblauf !== null && edge.sohleAblauf !== undefined)
            ? edge.sohleAblauf
            : tgtNode.geometry.bottomZ;

        const start = { x: sx, y: sy, z: sz };
        const end = { x: tx, y: ty, z: tz };

        const length = distance3D(start, end);

        // Slope (dh / dl) - Rise over Run (Approx length 2d?)
        // Usually hydraulic slope uses horizontal length
        const len2d = Math.hypot(tx - sx, tz - sz);
        const slope = len2d > 0.001 ? (ty - sy) / len2d : 0;

        return {
            startPoint: start,
            endPoint: end,
            length: length,
            length2d: len2d,
            slope: slope
        };
    }
};
