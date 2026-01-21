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
        // FixData V2 provides Three.js coordinates in pos: { x, y: Elevation, z: -North }
        const { x, y, z } = nodeData.pos;

        // Use explicit geometry data if available
        const coverZ = nodeData.geometry?.coverZ ?? (y + 2.5); // Fallback
        const bottomZ = nodeData.geometry?.bottomZ ?? y;
        const height = nodeData.geometry?.height ?? Math.abs(coverZ - bottomZ);

        const { width, length } = nodeData.geometry?.dimensions || nodeData.dim || { width: 1, length: 1 };
        const shapeType = nodeData.geometry?.shape || 'Cylinder';

        // Type Switching
        if (nodeData.type === 'Manhole' || nodeData.type === 'Schacht') {
            // Manhole: Cylinder
            // Height = calculated height
            const h = Math.max(0.1, height);
            const radius = width ? width / 2 : 0.5;

            const geom = new THREE.CylinderGeometry(radius, radius, h, 16);
            mesh = new THREE.Mesh(geom, MAT_MANHOLE);

            // Pivot Adjustment: Cylinder origin is center.
            // pos.y is Bottom Elevation (Sohle).
            // We need center at Sohle + h/2.
            mesh.position.set(x, y + h / 2, z);

        } else if (nodeData.type === 'Connector' || nodeData.type === 'Anschlusspunkt') {
            // Sphere
            const geom = new THREE.SphereGeometry(0.25, 8, 8);
            mesh = new THREE.Mesh(geom, MAT_CONNECT);
            mesh.position.set(x, y, z); // Center at point

        } else {
            // Structure / Default
            // Box
            const w = width || 5;
            const l = length || 5;
            const h = height > 0.5 ? height : 3.0; // Minimal height for structures

            const geom = new THREE.BoxGeometry(w, h, l);
            // Pivot Adjustment: Box origin is center.
            // For structures, pos.y is usually bottom ? Or unknown. 
            // Let's assume bottom alignment.
            mesh = new THREE.Mesh(geom, MAT_STRUCT);
            mesh.position.set(x, y + h / 2, z);
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
        // Hydraulic Invert (Sohlhöhen) Correction
        // If exact Z is known, override the node-based position
        const sZ = edgeData.sohleZulauf;
        const eZ = edgeData.sohleAblauf;

        const effectiveStart = startPos.clone();
        const effectiveEnd = endPos.clone();

        // Three.js Y is UP (Elevation)
        if (sZ !== null && sZ !== undefined) effectiveStart.y = sZ;
        if (eZ !== null && eZ !== undefined) effectiveEnd.y = eZ;

        const { length, center, quaternion } = this.calculatePipeTransform(effectiveStart, effectiveEnd);
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
