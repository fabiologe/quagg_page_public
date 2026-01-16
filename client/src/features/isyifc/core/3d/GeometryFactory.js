import * as THREE from 'three';
import { IsybauCodes } from '../domain/IsybauCodes.js';

/**
 * GeometryFactory.js
 * Converts logical ISYIFC Graph objects (Nodes, Edges) into Three.js Meshes.
 * Handles Profile logic, positioning, and material assignment.
 */

// Materials (Shared/Reused)
const MAT_PIPE = new THREE.MeshLambertMaterial({ color: 0x888888 }); // Gray
const MAT_MANHOLE = new THREE.MeshLambertMaterial({ color: 0xaaaaaa }); // Light Gray
const MAT_CONNECT = new THREE.MeshLambertMaterial({ color: 0xff0000 }); // Red
const MAT_STRUCT = new THREE.MeshLambertMaterial({ color: 0x0000ff, transparent: true, opacity: 0.4 }); // Blue Transparent

export const GeometryFactory = {

    /**
     * Creates a Mesh for a Node.
     * @param {Object} nodeData - The node object from FixData ({id, pos, deckel, dim, type...})
     * @returns {THREE.Mesh} The created mesh.
     */
    createNodeMesh(nodeData) {
        let mesh;
        const { x, y, z } = nodeData.pos; // Note: FixData coords (Absolute)
        const deckel = nodeData.deckel || (z + 2.5);
        const { width, length } = nodeData.dim;

        // Type Switching
        if (nodeData.type === 'Schacht' || nodeData.isManhole) {
            // Manhole: Cylinder from Sohle (z) to Deckel.
            // Height = deckel - z
            const h = Math.max(0.1, deckel - z);
            const radius = width ? width / 2 : 0.5; // Default 1m diam

            const geom = new THREE.CylinderGeometry(radius, radius, h, 16);
            mesh = new THREE.Mesh(geom, MAT_MANHOLE);

            // Position: Cylinder origin is center.
            // We want bottom at 'z'. Center Y = z + h/2.
            // Remapping Coord System:
            // World X = Node X
            // World Y = Elevation (Z + h/2)
            // World Z = - Node Y (North)

            // We assume the Caller has NOT transformed coordinates yet? 
            // Or we return a mesh that needs to be positioned?
            // "Apply the calculated Transform" suggests we do it.
            // But usually we build logic in local space and set position.

            // Wait, Master Prompt says: 
            // "Three.js X = Data X ... Three.js Y = Data Z ... Three.js Z = - Data Y"
            // We will set position here assuming "Global Group" context (or relative to offset).
            // Let's assume input params (nodeData.pos) are already "Global Data Coordinates".
            // The Viewer will likely subtract the OFFSET. 
            // Actually, we should return the raw mesh and let the viewer position it?
            // "Apply the calculated Transform (Pos/Rot)." -> Factory handles it.

            // HOWEVER: We don't know the CenterOffset here.
            // Strategy: We create the mesh at (0,0,0) and set .position to the *relative* coords if we knew them.
            // OR: We return Mesh and Helper function `getPosition(data, offset)`?

            // Let's assume the Viewer passes 'pos' that is ALREADY adjusted (Data-Center)? 
            // Or we assume the Viewer manages the `position.set`.

            // Re-reading Step 1: "Input: edgeData, startPos, endPos" for Edges.
            // For Nodes: "Input: nodeData". imply nodeData has position.

            // To keep Factory pure:
            // It should probably take `position` as separate arg? or assume nodeData.pos is absolute.
            // Let's assume we return a Mesh with `position` set to the Values. The Viewer handles parent group offset.

            mesh.position.set(x, z + h / 2, -y); // Y-Up conversion

        } else if (nodeData.type === 'Anschlusspunkt' || nodeData.status === 2) { // 2 = Planned/Virtual? Or Connection?
            // Sphere
            const geom = new THREE.SphereGeometry(0.25, 8, 8);
            mesh = new THREE.Mesh(geom, MAT_CONNECT);
            mesh.position.set(x, z, -y);

        } else {
            // Bauwerk / Structure / Default
            // Box
            const w = width || 5;
            const l = length || 5;
            const h = 3; // Default height

            const geom = new THREE.BoxGeometry(w, h, l);
            // Anchor at bottom? Box is centered.
            mesh = new THREE.Mesh(geom, MAT_STRUCT);
            mesh.position.set(x, z + h / 2, -y);
        }

        // Check userData
        mesh.userData = { id: nodeData.id, type: nodeData.type };

        return mesh;
    },

    /**
     * Creates a Mesh for an Edge (Pipe).
     * @param {Object} edgeData - Edge data from Store.
     * @param {THREE.Vector3} startPos - Start Position (Three.js Space).
     * @param {THREE.Vector3} endPos - End Position (Three.js Space).
     * @returns {THREE.Mesh}
     */
    createPipeMesh(edgeData, startPos, endPos) {
        const { length, center, quaternion } = this.calculatePipeTransform(startPos, endPos);
        const profil = edgeData.profile || {};

        // Dimensions
        // Note: Length is calculated from geometry distances, but data.length exists too.
        // We use geometric distance for visualization to close gaps.

        let geometry;
        const pType = profil.type; // integer code? "Rechteck"?
        // ISYBAU Codes: 0=Kreis, 1=Ei, 2=Rechteck, ... (Need to check mapping, assuming string or mapped int)
        // Prompt says: "IF ProfilArt == 'Rechteck'..."

        // Map integer to String if needed, or check values.
        // Let's assume normalized 'type' string or check both.
        // 0: Kreis, 1: Ei, 2: Rechteck, 5: Trapez ...

        const isRect = pType === 2 || String(pType).toLowerCase() === 'rechteck';
        const isTrap = pType === 5 || String(pType).toLowerCase() === 'trapez';

        const h = profil.height || 0.3;
        const w = profil.width || 0.3;

        if (isRect) {
            // BoxGeometry(width, height, depth)
            // We align along Y axis (Pipe Transform Standard).
            // So Width=w, Height=length, Depth=h? No.
            // Cylinder is radius-based. Box definition:
            // If we rotate a Box(w, length, h) with the same quaternion as Cylinder?
            // Cylinder defaults to Y-UP.
            geometry = new THREE.BoxGeometry(w, length, h);

        } else if (isTrap) {
            // Using Shape + Extrude
            const shape = new THREE.Shape();
            // Draw Trapezoid profile (centered)
            const topW = w;
            const botW = w * 0.7; // arbitrary trapezoid factor? or standard?
            // Let's make a simple one.
            shape.moveTo(-topW / 2, h / 2);
            shape.lineTo(topW / 2, h / 2);
            shape.lineTo(botW / 2, -h / 2);
            shape.lineTo(-botW / 2, -h / 2);
            shape.closePath();

            const extrudeSettings = {
                steps: 1,
                depth: length,
                bevelEnabled: false
            };
            geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            // Fix Origin: Extrude starts at 0 and goes to 'depth' along Z.
            // We need to center it along Z (length/2) and then rotate to align Y?
            // Default Extrude is along Z axis.
            // Our transform expects Y axis alignment.
            geometry.center(); // Centers geometry bounding box at (0,0,0)

            // Now orient: Extrude is along Z. We need it along Y.
            geometry.rotateX(Math.PI / 2);

        } else {
            // Circle / Default
            const radius = h / 2; // Diameter = height
            geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
        }

        const mesh = new THREE.Mesh(geometry, MAT_PIPE);

        // Apply Transform
        mesh.position.copy(center);
        mesh.quaternion.copy(quaternion);

        // Metadata
        mesh.userData = { id: edgeData.id, type: 'edge' }; // 'Haltung' or 'Leitung'

        return mesh;
    },

    /**
     * Calculates Position and Rotation to align a default Y-Axis object
     * between two points.
     * @param {THREE.Vector3} v1 
     * @param {THREE.Vector3} v2 
     */
    calculatePipeTransform(v1, v2) {
        // Distance
        const length = v1.distanceTo(v2);

        // Center
        const center = v1.clone().add(v2).multiplyScalar(0.5);

        // Rotation (Quaternion)
        // Cylinder default is Y-Up (0, 1, 0)
        // We want to rotate (0, 1, 0) to match (v2 - v1).normalized()

        const dir = v2.clone().sub(v1).normalize();

        const quaternion = new THREE.Quaternion();
        const axis = new THREE.Vector3(0, 1, 0); // Default Cylinder Axis

        quaternion.setFromUnitVectors(axis, dir);

        return { length, center, quaternion };
    }
};
