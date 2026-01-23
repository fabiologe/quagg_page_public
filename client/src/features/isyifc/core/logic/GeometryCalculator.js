/**
 * GeometryCalculator.js
 * 
 * Pure Math Layer for ISYBAU.
 * Calculates Position, Rotation (Quaternion), and Scale for all network elements.
 * Dependencies: NONE (No Three.js, No Ifc.js).
 * Output: Plain JS Objects for Store/Export.
 */

export class GeometryCalculator {

    static calculateWorldOrigin(nodes) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let count = 0;

        for (const node of nodes.values()) {
            const x = node.data?.rw ?? node.pos?.x;
            const y = node.data?.hw ?? (node.pos?.z ? -node.pos.z : 0);

            if (x && x < minX) minX = x;
            if (y && y < minY) minY = y;
            count++;
        }

        if (count === 0) return { x: 0, y: 0, z: 0 };

        return {
            x: Math.floor(minX / 100) * 100,
            y: Math.floor(minY / 100) * 100,
            z: 0
        };
    }

    // --- NODE CALCULATION ---

    static calculateNodeTransform(node, origin) {
        if (!origin) origin = { x: 0, y: 0, z: 0 };

        const rw = node.data?.rw ?? 0;
        const hw = node.data?.hw ?? 0;
        const coverZ = node.data?.coverZ ?? 0;
        const bottomZ = node.data?.bottomZ ?? (coverZ - 2);

        // 1. Position (Local to Origin)
        // System: X=East, Y=Up, Z=-North 
        const x = rw - origin.x;
        const y = bottomZ;
        const z = -(hw - origin.y);

        // 2. Scale (Dimensions)
        const height = Math.abs(coverZ - bottomZ);
        const width = node.geometry?.width || 1.0;

        const isRect = (node.geometry?.shape === 'Box' || node.geometry?.shape === 'Rect');
        const shapeType = isRect ? 'Box' : 'Cylinder';

        return {
            pos: { x, y, z },
            rot: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: width, y: height, z: width },
            shape: shapeType,
            meta: {
                height: height,
                width: width,
                radius: width / 2
            }
        };
    }

    // --- EDGE CALCULATION ---

    static calculateEdgeTransform(edge, nodeA, nodeB, origin) {
        if (!nodeA || !nodeB) return null;

        const startRW = nodeA.data?.rw ?? 0;
        const startHW = nodeA.data?.hw ?? 0;
        const startZ = nodeA.data?.bottomZ ?? 0;

        const endRW = nodeB.data?.rw ?? 0;
        const endHW = nodeB.data?.hw ?? 0;
        const endZ = nodeB.data?.bottomZ ?? 0;

        const ax = startRW - origin.x;
        const ay = startZ;
        const az = -(startHW - origin.y);

        const bx = endRW - origin.x;
        const by = endZ;
        const bz = -(endHW - origin.y);

        const midX = (ax + bx) / 2;
        const midY = (ay + by) / 2;
        const midZ = (az + bz) / 2;

        const dx = bx - ax;
        const dy = by - ay;
        const dz = bz - az;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        const rot = this.orientToVector(dx, dy, dz);
        const width = edge.data?.width || 0.3;

        return {
            pos: { x: midX, y: midY, z: midZ },
            rot: rot,
            scale: { x: width, y: length, z: width },
            shape: 'Cylinder',
            meta: {
                length,
                width,
                delta: { x: dx, y: dy, z: dz }
            }
        };
    }

    static orientToVector(dx, dy, dz) {
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 0.0001) return { x: 0, y: 0, z: 0, w: 1 };

        const vx = dx / len;
        const vy = dy / len;
        const vz = dz / len;

        const ux = 0, uy = 1, uz = 0;
        const dot = uy * vy;

        if (dot > 0.9999) return { x: 0, y: 0, z: 0, w: 1 };
        if (dot < -0.9999) return { x: 1, y: 0, z: 0, w: 0 };

        const cx = uy * vz - uz * vy;
        const cy = uz * vx - ux * vz;
        const cz = ux * vy - uy * vx;

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
