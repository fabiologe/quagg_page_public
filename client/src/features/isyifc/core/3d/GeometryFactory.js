import * as THREE from 'three';
// Assuming types might be needed, or we adapt to dynamic js
// import { ProfilGeometrie, KnotenTyp } from '../types';

export class GeometryFactory {
    constructor() {
        // 1. Shared Geometries (Reuse!)
        // Unit Cylinder: Height 1, Radius 1, Pivot at BOTTOM (y=0)
        // We scale it later to real dimensions.
        const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 32);
        cylinderGeo.translate(0, 0.5, 0); // Shift Pivot to bottom
        this.geoCylinder = cylinderGeo;

        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        boxGeo.translate(0, 0.5, 0); // Shift Pivot to bottom
        this.geoBox = boxGeo;

        // Materials
        this.matManhole = new THREE.MeshLambertMaterial({ color: 0x808080 }); // Grey
        this.matPipe = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown
        this.matWater = new THREE.MeshLambertMaterial({ color: 0x0000FF }); // Blue

        // Helper object for matrix calculations
        this.dummy = new THREE.Object3D();
    }

    /**
     * Builds the complete 3D scene from the graph.
     * Uses InstancedMesh for Performance (1 DrawCall instad of 5000).
     * @param {Map} nodes - The node store
     * @param {Array} edges - The edge store
     * @param {Object} originOffset - {x,y,z} Global Origin
     */
    buildScene(nodes, edges, originOffset) {
        const group = new THREE.Group();

        // --- A. MANHOLES ---
        const manholes = Array.from(nodes.values()).filter(n => n.type === 'Manhole');
        if (manholes.length > 0) {
            const mesh = new THREE.InstancedMesh(this.geoCylinder, this.matManhole, manholes.length);

            manholes.forEach((node, i) => {
                if (!node.pos || !node.geometry) return;

                // 1. Position (Relative to Origin, Y is Up!)
                const x = node.pos.x - originOffset.x;
                // Logic check: Is node.pos already shifted? 
                // User prompt implies Viewer logic assumes raw node.pos and does shift here.
                // If LogicCalculator runs BEFORE this, node.pos might be transform.pos?
                // Let's assume input is standard node structure with Global Coords in node.pos/data

                // Use logic from prompt:
                const y = node.geometry.bottomZ ?? node.data?.bottomZ ?? 0; // Sohle
                const z = -(node.pos.y - originOffset.y); // North = -Z (User prompt logic: -(pos.y - off.y))
                // Wait, normally GIS: x=East, y=North. Three: x=East, z=-North.
                // User Prompt: "z = -(node.pos.y - originOffset.y)" implies node.pos.y is North. 
                // Let's stick strictly to User Code provided.

                this.dummy.position.set(x, y, z);
                this.dummy.rotation.set(0, 0, 0);

                // 2. Scale
                // XML Width -> Radius? User Code: radius = width / 2.
                // geoCylinder has radius 1. Scale X/Z by intended Radius.
                const width = node.geometry.dimensions?.width || node.geometry.width || 1.0;
                const radius = width / 2;
                const height = node.geometry.height || 2.0; // Extrusion Height

                this.dummy.scale.set(radius, height, radius);

                this.dummy.updateMatrix();
                mesh.setMatrixAt(i, this.dummy.matrix);
            });

            mesh.instanceMatrix.needsUpdate = true;
            group.add(mesh);
        }

        // --- B. PIPES ---
        if (edges.length > 0) {
            const mesh = new THREE.InstancedMesh(this.geoCylinder, this.matPipe, edges.length);

            edges.forEach((edge, i) => {
                const src = nodes.get(edge.sourceId);
                const tgt = nodes.get(edge.targetId);

                if (!src || !tgt) return;

                // Start & End (Local Coords relative to Origin)
                // User Code logic:
                const startX = src.pos.x - originOffset.x;
                const startY = edge.sohleZulauf ?? src.geometry?.bottomZ ?? 0;
                const startZ = -(src.pos.y - originOffset.y);

                const endX = tgt.pos.x - originOffset.x;
                const endY = edge.sohleAblauf ?? tgt.geometry?.bottomZ ?? 0;
                const endZ = -(tgt.pos.y - originOffset.y);

                const start = new THREE.Vector3(startX, startY, startZ);
                const end = new THREE.Vector3(endX, endY, endZ);

                // Math: Position & Rotation
                const distance = start.distanceTo(end);

                // Position at Start (Pivot is at bottom of cylinder)
                this.dummy.position.copy(start);

                // Rotation: Align Y-Up to direction vector
                const up = new THREE.Vector3(0, 1, 0); // Cylinder Default Axis
                const dir = end.clone().sub(start).normalize();
                const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
                this.dummy.setRotationFromQuaternion(quaternion);

                // Scale
                // Radius = Width / 2
                const width = edge.profile?.width || 0.3;
                const radius = width / 2;
                this.dummy.scale.set(radius, distance, radius); // Y-Scale is Length

                this.dummy.updateMatrix();
                mesh.setMatrixAt(i, this.dummy.matrix);
            });

            mesh.instanceMatrix.needsUpdate = true;
            group.add(mesh);
        }

        return group;
    }
}
