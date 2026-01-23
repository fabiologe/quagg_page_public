/**
 * GeometryFactory.js - Phase 2 Core Engine
 * 
 * High-Performance Geometry Generation using THREE.InstancedMesh.
 * Solves "World Origin" jittering by normalizing coordinates.
 */

import * as THREE from 'three';
import { IsybauCodes } from '../domain/IsybauCodes.js';

// --- CONSTANTS ---
const ORIGIN = new THREE.Vector3(); // Will be set per build
const TMP_MATRIX = new THREE.Matrix4();
const TMP_POS = new THREE.Vector3();
const TMP_QUAT = new THREE.Quaternion();
const TMP_SCALE = new THREE.Vector3();

// Colors
const COL_MANHOLE = new THREE.Color(0xaaaaaa);
const COL_CONNECTOR = new THREE.Color(0xff0000); // Red for AP
const COL_STRUCTURE = new THREE.Color(0x0000ff); // Blue Base
const COL_PIPE_DEFAULT = new THREE.Color(0x888888);

// System Type Colors
const COL_SYS_RW = new THREE.Color(0x3498db); // Rain (Blue)
const COL_SYS_SW = new THREE.Color(0xd35400); // Waste (Brown/Orange)
const COL_SYS_MW = new THREE.Color(0x8e44ad); // Mixed (Purple)

const getSystemColor = (type) => {
    if (!type) return COL_PIPE_DEFAULT;
    const t = type.toLowerCase();
    if (t.includes('regen') || t === 'rw') return COL_SYS_RW;
    if (t.includes('schmutz') || t === 'sw') return COL_SYS_SW;
    if (t.includes('misch') || t === 'mw') return COL_SYS_MW;
    return COL_PIPE_DEFAULT;
};

export const GeometryFactory = {

    /**
     * Builds the entire scene using InstancedMesh.
     * @param {Object} graph - { nodes: Map, edges: Array }
     * @returns {Object} { root: THREE.Group, instanceMap: Map<uuid+id, String>, origin: {x,y} }
     */
    buildScene(graph) {
        const root = new THREE.Group();
        const instanceMap = new Map(); // Key: `${meshUuid}:${instanceId}` -> Value: objectId

        if (!graph.nodes || graph.nodes.size === 0) return { root, instanceMap, origin: { x: 0, y: 0 } };

        // 1. CALCULATE ORIGIN (Anti-Jitter)
        // Find rough center or min point
        const first = graph.nodes.values().next().value;
        const originX = first.pos.x;
        const originY = -first.pos.z; // -North

        // We set our module-level ORIGIN to subtract from all coords
        // Store uses: x=RW, y=Elevation, z=-HW
        // We want localX = RW - originX.
        // localZ = -HW - (-originY) = -HW + originY.

        ORIGIN.set(originX, 0, -originY); // We shift X and Z. Y (Elevation) stays absolute (usually small enough, < 1000m)

        // 2. PREPARE BUCKETS
        // We need to count instances for each geometry type
        const buckets = {
            manhole: [],
            connector: [],
            structure: [], // Fallback for simple boxes
            pipeCircle: [],
            pipeRect: [], // TODO: Separate instancing or fallback
        };

        // --- NODES ---
        for (const node of graph.nodes.values()) {
            if (node.type === 'Manhole' || node.type === 'Schacht') {
                buckets.manhole.push(node);
            } else if (node.type === 'Connector' || node.type === 'Anschlusspunkt') {
                buckets.connector.push(node);
            } else {
                buckets.structure.push(node);
            }
        }

        // --- EDGES ---
        // TODO: Edges logic
        // For now, put all edges in pipeCircle bucket or specialized
        for (const edge of graph.edges) {
            // Check if profile is weird? For now, standard pipes
            buckets.pipeCircle.push(edge);
        }

        // 3. BUILD INSTANCED MESHES

        // A. MANHOLES (Unit Cylinder)
        if (buckets.manhole.length > 0) {
            const geom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16);
            geom.translate(0, 0.5, 0); // Pivot at bottom
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff }); // White, tinted by instance color
            const mesh = new THREE.InstancedMesh(geom, mat, buckets.manhole.length);
            mesh.userData = { type: 'manhole' };

            buckets.manhole.forEach((node, i) => {
                this._setNodeTransform(mesh, i, node);
                mesh.setColorAt(i, COL_MANHOLE);
                instanceMap.set(`${mesh.uuid}:${i}`, node.id);
            });
            root.add(mesh);
        }

        // B. CONNECTORS (Unit Sphere)
        if (buckets.connector.length > 0) {
            const geom = new THREE.SphereGeometry(0.25, 8, 8);
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            const mesh = new THREE.InstancedMesh(geom, mat, buckets.connector.length);

            buckets.connector.forEach((node, i) => {
                const x = node.pos.x - ORIGIN.x;
                const y = node.pos.y;
                const z = node.pos.z - ORIGIN.z; // node.pos.z is already -HW. ORIGIN.z is -originY.

                TMP_POS.set(x, y, z);
                TMP_QUAT.identity();
                TMP_SCALE.set(1, 1, 1);
                TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);

                mesh.setMatrixAt(i, TMP_MATRIX);
                mesh.setColorAt(i, COL_CONNECTOR);
                instanceMap.set(`${mesh.uuid}:${i}`, node.id);
            });
            root.add(mesh);
        }

        // C. PIPES
        if (buckets.pipeCircle.length > 0) {
            const geom = new THREE.CylinderGeometry(1, 1, 1, 8); // Radius 1, Height 1
            geom.translate(0, 0.5, 0); // Pivot Bottom (Start) to Top (End)?
            // Default Cylinder is Y-Up. Center at 0. Height 1 -> -0.5 to 0.5.
            // If we pivot at 0 (Bottom), then scaling Y extends it towards +Y.

            // Re-create geometry with pivot at bottom (0,0,0) -> growing up Y
            // CylinderGeometry(rTop, rBottom, height)
            // Default creates center at (0,0,0).
            // We want base at (0,0,0).

            const pipeGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 8); // Base radius 0.5 (Diameter 1)
            pipeGeom.translate(0, 0.5, 0); // Shift so bottom is at 0,0,0

            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            const mesh = new THREE.InstancedMesh(pipeGeom, mat, buckets.pipeCircle.length);

            buckets.pipeCircle.forEach((edge, i) => {
                this._setPipeTransform(mesh, i, edge, graph.nodes);

                // Color by SystemType
                // We need to check Source/Target node system type OR Edge attribute?
                // Edge has systemType in V2
                const col = getSystemColor(edge.systemType);
                mesh.setColorAt(i, col);

                instanceMap.set(`${mesh.uuid}:${i}`, edge.id);
            });
            root.add(mesh);
        }

        // STRUCTURES (Simple Box fallback)
        if (buckets.structure.length > 0) {
            const geom = new THREE.BoxGeometry(1, 1, 1);
            geom.translate(0, 0.5, 0);
            const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
            const mesh = new THREE.InstancedMesh(geom, mat, buckets.structure.length);

            buckets.structure.forEach((node, i) => {
                // Similar to Node
                const x = node.pos.x - ORIGIN.x;
                const bottomZ = node.geometry?.bottomZ ?? node.pos.y;
                const z = node.pos.z - ORIGIN.z;

                const w = node.geometry?.dimensions?.width || 5;
                const l = node.geometry?.dimensions?.length || 5;
                const h = node.geometry?.height || 3;

                TMP_POS.set(x, bottomZ, z);
                TMP_QUAT.identity();
                TMP_SCALE.set(w, h, l); // Box(1,1,1) -> Scaled
                TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);

                mesh.setMatrixAt(i, TMP_MATRIX);
                mesh.setColorAt(i, COL_STRUCTURE);
                instanceMap.set(`${mesh.uuid}:${i}`, node.id);
            });
            root.add(mesh);
        }


        return { root, instanceMap, origin: { x: originX, y: originY } };
    },

    // --- HELPERS ---

    _setNodeTransform(mesh, index, node) {
        // Coords
        const x = node.pos.x - ORIGIN.x;
        const z = node.pos.z - ORIGIN.z;

        // Vertical Logic
        const coverZ = node.geometry?.coverZ ?? (node.pos.y + 2);
        const bottomZ = node.geometry?.bottomZ ?? node.pos.y;
        let height = Math.abs(coverZ - bottomZ);

        // Exception: Height 0
        if (height < 0.05) height = 0.1;

        // Position: Bottom
        const y = bottomZ;

        // Scale
        // Unit Cylinder has Radius 0.5 (Dia 1.0) and Height 1.0
        // We want Width (Diameter) and Height.
        const width = node.geometry?.dimensions?.width || 1.0;

        // Scale X/Z by width (Diameter). Since Unit Dia is 1, Scale is width.
        // Scale Y by height.

        TMP_POS.set(x, y, z);
        TMP_QUAT.identity();
        TMP_SCALE.set(width, height, width);

        TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
        mesh.setMatrixAt(index, TMP_MATRIX);
    },

    _setPipeTransform(mesh, index, edge, nodesMap) {
        const src = nodesMap.get(edge.sourceId);
        const tgt = nodesMap.get(edge.targetId);

        if (!src || !tgt) {
            // Collapse to 0
            mesh.setMatrixAt(index, new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0)));
            return;
        }

        // Logic: Start at Source (Hydraulic Z), Look at Target
        // Origin Shift
        const sx = src.pos.x - ORIGIN.x;
        const sy = (edge.sohleZulauf ?? src.geometry?.bottomZ ?? src.pos.y);
        const sz = src.pos.z - ORIGIN.z;

        const tx = tgt.pos.x - ORIGIN.x;
        const ty = (edge.sohleAblauf ?? tgt.geometry?.bottomZ ?? tgt.pos.y);
        const tz = tgt.pos.z - ORIGIN.z;

        const start = new THREE.Vector3(sx, sy, sz);
        const end = new THREE.Vector3(tx, ty, tz);

        const length = start.distanceTo(end);

        if (length < 0.01) {
            mesh.setMatrixAt(index, new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0)));
            return;
        }

        // Rotation
        // Cylinder default (with our pivot fix) is Y-Up.
        // We construct a matrix that looks at target.
        // LookAt makes Z point to target. We need Y to point to target.
        // Standard trick: lookAt(end, start, up). Then rotate X -90?

        // Alternative: Quaternion from (0,1,0) to Direction.
        const dir = end.clone().sub(start).normalize();
        TMP_QUAT.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        // Scale
        // Unit Pipe has Dia 1.
        // We want width.
        const width = edge.profile?.width || 0.3;
        TMP_SCALE.set(width, length, width); // Scale Y is length

        TMP_POS.copy(start);

        TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
        mesh.setMatrixAt(index, TMP_MATRIX);
    }
};
