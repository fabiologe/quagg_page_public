import * as THREE from 'three';

export class GeometryFactory {
    constructor() {
        // 1. Manholes (Pivot at Bottom)
        const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 32);
        cylinderGeo.translate(0, 0.5, 0);
        this.geoCylinder = cylinderGeo;

        // 2. Pipes (Pivot at Center - Standard)
        // Better for rotation/placement logic (Midpoint)
        this.geoPipe = new THREE.CylinderGeometry(1, 1, 1, 16);
        // No translation -> Center pivot

        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        boxGeo.translate(0, 0.5, 0);
        this.geoBox = boxGeo;

        // Materials
        this.matManhole = new THREE.MeshLambertMaterial({ color: 0x808080 });
        this.matPipe = new THREE.MeshLambertMaterial({ color: 0x8B4513 });

        // Helper
        this.dummy = new THREE.Object3D();
    }

    /**
     * Builds the complete 3D scene from the graph.
     */
    buildScene(nodes, edges) {
        const group = new THREE.Group();

        // --- A. MANHOLES ---
        const manholes = Array.from(nodes.values()).filter(n => n.type === 'Manhole');
        if (manholes.length > 0) {
            const mesh = new THREE.InstancedMesh(this.geoCylinder, this.matManhole, manholes.length);

            manholes.forEach((node, i) => {
                if (!node.pos) return;

                // Position (Already Local)
                this.dummy.position.set(node.pos.x, node.pos.y, node.pos.z);
                this.dummy.rotation.set(0, 0, 0);

                // Scale (Radius, Height)
                const width = node.geometry.width || 1.0;
                const radius = width / 2;
                const height = node.geometry.height || 2.0;

                this.dummy.scale.set(radius, height, radius);
                this.dummy.updateMatrix();
                mesh.setMatrixAt(i, this.dummy.matrix);
            });

            mesh.instanceMatrix.needsUpdate = true;
            group.add(mesh);
        }

        // --- B. PIPES ---
        if (edges.length > 0) {
            // Use geoPipe (Center Pivot)
            const mesh = new THREE.InstancedMesh(this.geoPipe, this.matPipe, edges.length);

            edges.forEach((edge, i) => {
                // Determine Start/End
                let start, end;
                if (edge.geometry && edge.geometry.startPoint) {
                    const sp = edge.geometry.startPoint;
                    const ep = edge.geometry.endPoint;
                    start = new THREE.Vector3(sp.x, sp.y, sp.z);
                    end = new THREE.Vector3(ep.x, ep.y, ep.z);
                } else {
                    const src = nodes.get(edge.sourceId);
                    const tgt = nodes.get(edge.targetId);
                    if (!src || !tgt) return;
                    start = new THREE.Vector3(src.pos.x, src.pos.y, src.pos.z);
                    end = new THREE.Vector3(tgt.pos.x, tgt.pos.y, tgt.pos.z);
                }

                // Math: Midpoint & Rotation
                const distance = start.distanceTo(end);
                const mid = start.clone().add(end).multiplyScalar(0.5);

                this.dummy.position.copy(mid);

                const up = new THREE.Vector3(0, 1, 0);
                const dir = end.clone().sub(start).normalize();

                // Handle vertical pipe singularity
                if (Math.abs(dir.y) > 0.999) {
                    // Parallel to Y axis
                    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
                    this.dummy.setRotationFromQuaternion(quaternion);
                } else {
                    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
                    this.dummy.setRotationFromQuaternion(quaternion);
                }

                const width = edge.profile?.width || 0.3;
                const radius = width / 2;
                this.dummy.scale.set(radius, distance, radius);

                this.dummy.updateMatrix();
                mesh.setMatrixAt(i, this.dummy.matrix);
            });

            mesh.instanceMatrix.needsUpdate = true;
            group.add(mesh);
        }

        return group;
    }
}
