/**
 * GeometryCalculator.js
 * 
 * Pure Math Layer for ISYBAU.
 * Calculates Position, Rotation (Quaternion), and Scale for all network elements.
 * Dependencies: NONE (No Three.js, No Ifc.js).
 * Output: Plain JS Objects for Store/Export.
 */

export class GeometryCalculator {

    static calculateOrigin(nodes) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let count = 0;

        for (const node of nodes.values()) {
            // Raw Coordinates (Rechtswert, Hochwert)
            // Use data if available, else pos (mock)
            const x = node.data?.rw ?? node.pos?.x;
            const y = node.data?.hw ?? (node.pos?.z ? -node.pos.z : 0);

            // For Origin, we only care about RW/HW (X/Y map coords)
            if (x && x < minX) minX = x;
            if (y && y < minY) minY = y;
            count++;
        }

        if (count === 0) return { x: 0, y: 0, z: 0 };

        // Round to nice numbers (e.g. nearest 100 or 1000) for clean offsets
        return {
            x: Math.floor(minX / 100) * 100,
            y: Math.floor(minY / 100) * 100,
            z: 0 // Sea level usually kept as 0 base
        };
    }

    // --- NODE CALCULATION ---

    /**
     * @param {Object} node - Input Node
     * @param {Object} origin - Global Origin {x,y,z}
     */
    static computeNodeTransform(node, origin) {
        if (!origin) origin = { x: 0, y: 0, z: 0 };

        const rw = node.data?.rw ?? 0;
        const hw = node.data?.hw ?? 0;
        const coverZ = node.data?.coverZ ?? 0;
        const bottomZ = node.data?.bottomZ ?? (coverZ - 2);

        // 1. Position (Local to Origin)
        // System: X=East, Y=Up, Z=-North (Three.js conventions usually)
        // BUT for Data Storage we might want pure Cartesian (X,Y,Z).
        // Let's stick to the visualizer convention for valid transforms: Y is UP.
        const x = rw - origin.x;
        const y = bottomZ; // Base of manhole
        const z = -(hw - origin.y); // Negative North for 3D

        // 2. Scale (Dimensions)
        const height = Math.abs(coverZ - bottomZ);
        const width = node.geometry?.width || 1.0;

        // Shape decision
        const isRect = (node.geometry?.shape === 'Box' || node.geometry?.shape === 'Rect');
        const shapeType = isRect ? 'Box' : 'Cylinder';

        return {
            pos: { x, y, z },
            // Quaternions: Identity for vertical cylinders (Three.js Cylinders are Y-up by default)
            rot: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: width, y: height, z: width },
            shape: shapeType,
            // Meta for IFC
            meta: {
                height: height,
                width: width,
                radius: width / 2
            }
        };
    }

    // --- EDGE CALCULATION ---

    static computeEdgeTransform(edge, nodeA, nodeB, origin) {
        if (!nodeA || !nodeB) return null;

        // Start/End Data (Real World)
        const startRW = nodeA.data?.rw ?? 0;
        const startHW = nodeA.data?.hw ?? 0;
        const startZ = nodeA.data?.bottomZ ?? 0;

        const endRW = nodeB.data?.rw ?? 0;
        const endHW = nodeB.data?.hw ?? 0;
        const endZ = nodeB.data?.bottomZ ?? 0;

        // Local Coords
        const ax = startRW - origin.x;
        const ay = startZ;
        const az = -(startHW - origin.y);

        const bx = endRW - origin.x;
        const by = endZ;
        const bz = -(endHW - origin.y);

        // Midpoint
        const midX = (ax + bx) / 2;
        const midY = (ay + by) / 2;
        const midZ = (az + bz) / 2;

        // Vector
        const dx = bx - ax;
        const dy = by - ay;
        const dz = bz - az;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Rotation (Quaternion)
        // Orient Y-axis (Cylinder default) to vector (dx, dy, dz)
        const rot = this.orientToVector(dx, dy, dz);

        const width = edge.data?.width || 0.3;

        return {
            pos: { x: midX, y: midY, z: midZ },
            rot: rot,
            scale: { x: width, y: length, z: width },
            shape: 'Cylinder', // Pipes are usually cylinders
            meta: {
                length,
                width,
                delta: { x: dx, y: dy, z: dz } // Useful for IFC Direction
            }
        };
    }

    // Helper: Orient Y-Up to Vector (Quaternion Calculation)
    // Based on "FromToRotation" logic, simplified.
    static orientToVector(dx, dy, dz) {
        // Normalize direction
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 0.0001) return { x: 0, y: 0, z: 0, w: 1 };

        const vx = dx / len;
        const vy = dy / len;
        const vz = dz / len;

        // Default Up (Y)
        const ux = 0, uy = 1, uz = 0;

        // Dot product
        const dot = uy * vy; // u . v

        // Cross product axis = u x v
        let cx = uy * vz - uz * vy; // 1*vz - 0 = vz
        let cy = uz * vx - ux * vz; // 0 - 0 = 0
        let cz = ux * vy - uy * vx; // 0 - 1*vx = -vx 
        // Simplified: axis = (vz, 0, -vx) ?? Wait vector math check:
        // u = (0,1,0). v = (vx, vy, vz).
        // x = uy*vz - uz*vy = vz
        // y = uz*vx - ux*vz = 0
        // z = ux*vy - uy*vx = -vx
        // Correct.

        // Quaternion construction (Axis-Angle)
        // If parallel (dot close to 1 or -1), handle singularities
        if (dot > 0.9999) return { x: 0, y: 0, z: 0, w: 1 };
        if (dot < -0.9999) {
            // 180 flip around X
            return { x: 1, y: 0, z: 0, w: 0 };
        }

        const s = Math.sqrt((1 + dot) * 2);
        const invS = 1 / s;

        return {
            x: cx * invS,
            y: cy * invS,
            z: cz * invS,
            w: 0.5 * s
        };
    }
}
