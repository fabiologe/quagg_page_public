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

// Colors - System types (Base)
const COL_RW_BASE = new THREE.Color(0x3498db); // Rain (Blue)
const COL_SW_BASE = new THREE.Color(0xd35400); // Waste (Brown/Orange)
const COL_MW_BASE = new THREE.Color(0x8e44ad); // Mixed (Purple)
const COL_DEFAULT = new THREE.Color(0x95a5a6); // Grey

// Helper: Color Factory
const ColorFactory = {
    // Base Colors by System (G101 / ISYBAU)
    bases: {
        // Rain (Regen) -> Blue
        'kr': new THREE.Color(0x3498db),
        'dr': new THREE.Color(0x3498db),
        'gr': new THREE.Color(0x3498db),
        'regen': new THREE.Color(0x3498db),
        'rw': new THREE.Color(0x3498db),

        // Waste (Schmutz) -> Brown/Orange
        'ks': new THREE.Color(0xd35400),
        'ds': new THREE.Color(0xd35400),
        'gs': new THREE.Color(0xd35400),
        'schmutz': new THREE.Color(0xd35400),
        'sw': new THREE.Color(0xd35400),

        // Mixed (Misch) -> Purple
        'km': new THREE.Color(0x8e44ad),
        'dm': new THREE.Color(0x8e44ad),
        'gm': new THREE.Color(0x8e44ad),
        'misch': new THREE.Color(0x8e44ad),
        'mw': new THREE.Color(0x8e44ad),

        // Water/River (Fließgewässer) -> Petrol/Teal
        'kw': new THREE.Color(0x008080), // Teal
        'gw': new THREE.Color(0x008080),
        'gewaesser': new THREE.Color(0x008080)
    },

    // Get Color
    getColor(systemType, status) {
        let col = COL_DEFAULT.clone();

        // 1. Resolve Base
        if (systemType) {
            // Clean input: "KR" -> "kr", "1" -> ?? (If numerical codes used, need map)
            // Assuming string codes "KR", "KS" primarily.
            const low = String(systemType).toLowerCase().trim();

            // Direct Match
            if (this.bases[low]) {
                col = this.bases[low].clone();
            } else {
                // Partial Check (e.g. "Schmutzwasserkanal")
                for (const [key, val] of Object.entries(this.bases)) {
                    if (low.includes(key)) {
                        col = val.clone();
                        break;
                    }
                }
            }
        }

        // 2. Apply Status Logic (The "Switch")
        // Status 1 = Planned (Geplant) -> Pastel / Lighter
        if (status === 1) {
            col.lerp(new THREE.Color(0xffffff), 0.5);
        }
        // Status 2 (Fictive) -> Light Green
        else if (status === 2) {
            col.setHex(0x2ecc71); // Bright Light Green
        }
        // Status 3 (Stillgelegt) -> Dark Grey
        else if (status === 3) {
            col.setHex(0x555555);
        }
        // Status 4 (Verdämmt) -> Concrete/Earth
        else if (status === 4) {
            col.setHex(0x8b7d6b); // Earthy concrete
        }
        // Status 5 (Sonstige) -> Magenta (Attention)
        else if (status === 5) {
            col.setHex(0xd90368);
        }
        // Status 6 (Rückgebaut) -> Red
        else if (status === 6) {
            col.setHex(0xe74c3c);
        }

        return col;
    }
};

/**
 * Determines color based on SystemType and Status
 */
const getElementColor = (type, status) => {
    return ColorFactory.getColor(type, status);
};

// Material Factories
const getMaterial = (isTransparent = false, isRect = false) => {
    const params = {
        shininess: 30,
        specular: 0x222222,
        flatShading: isRect // Flat shading for boxes/trapez
    };

    if (isTransparent) {
        params.transparent = true;
        params.opacity = 0.4;
        params.depthWrite = false; // Prevents Z-fighting for internal ghosts
    }

    return new THREE.MeshPhongMaterial(params);
};

export const GeometryFactory = {

    /**
     * Builds the entire scene using InstancedMesh.
     */
    buildScene(graph) {
        const root = new THREE.Group();
        const instanceMap = new Map();

        if (!graph.nodes || graph.nodes.size === 0) return { root, instanceMap, origin: { x: 0, y: 0 } };

        // 1. CALCULATE ORIGIN
        const first = graph.nodes.values().next().value;
        const originX = first.pos.x;
        const originNorth = first.pos.z;
        ORIGIN.set(originX, 0, originNorth);

        // 2. PREPARE BUCKETS
        const buckets = {
            manhole: [],
            manholeRect: [],
            manholeTransparent: [],      // Status 3, 6
            manholeRectTransparent: [],  // Status 3, 6 (Rect)
            manholeFictive: [],          // Status 2 (Circle)

            connector: [],
            structure: [],

            pipeCircle: [],
            pipeCircleTransparent: [],   // Status 3, 6
            pipeRect: [],
            pipeRectTransparent: [],     // Status 3, 6
            pipeTrapez: [],
            pipeTrapezTransparent: []    // Status 3, 6
        };

        // Helper Checks
        const isFictive = (s) => s == 2; // Loose equality for safety
        const isTransparent = (s) => s == 3 || s == 6; // Abandoned or Demolished

        // --- NODES ---
        const statusCounts = {};
        for (const node of graph.nodes.values()) {
            const status = node.attributes?.status ?? node.status ?? 0;
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            const isRect = (node.geometry?.shape === 'Box' || node.geometry?.shape === 'Rect');

            if (node.type === 'Manhole' || node.type === 'Schacht') {
                if (isFictive(status)) {
                    buckets.manholeFictive.push(node);
                }
                else if (isRect) {
                    if (isTransparent(status)) buckets.manholeRectTransparent.push(node);
                    else buckets.manholeRect.push(node);
                } else {
                    if (isTransparent(status)) buckets.manholeTransparent.push(node);
                    else buckets.manhole.push(node);
                }
            } else if (node.type === 'Connector' || node.type === 'Anschlusspunkt') {
                buckets.connector.push(node);
            } else {
                buckets.structure.push(node);
            }
        }


        // --- EDGES ---
        for (const edge of graph.edges) {
            const status = edge.status || 0;
            const shape = edge.profile?.type;

            const isRect = (shape === 'Rect' || shape === 3 || shape === 5);
            const isTrapez = (shape === 'Trapezoid' || shape === 8 || shape === 9);

            if (isRect) {
                if (isTransparent(status)) buckets.pipeRectTransparent.push(edge);
                else buckets.pipeRect.push(edge);
            } else if (isTrapez) {
                if (isTransparent(status)) buckets.pipeTrapezTransparent.push(edge);
                else buckets.pipeTrapez.push(edge);
            } else {
                if (isTransparent(status)) buckets.pipeCircleTransparent.push(edge);
                else buckets.pipeCircle.push(edge);
            }
        }

        // 3. BUILD INSTANCED MESHES

        // Helper to Create Mesh
        const createMesh = (geometry, bucket, isTransparent = false, isRect = false, transformFn) => {
            if (bucket.length === 0) return;

            const mat = getMaterial(isTransparent, isRect);
            const mesh = new THREE.InstancedMesh(geometry, mat, bucket.length);
            mesh.castShadow = !isTransparent;
            mesh.receiveShadow = !isTransparent;

            bucket.forEach((item, i) => {
                transformFn(mesh, i, item);

                // Color
                const type = item.systemType || item.attributes?.systemType; // Node vs Edge
                const status = item.status || item.attributes?.status || 0;
                const col = getElementColor(type, status);

                mesh.setColorAt(i, col);
                instanceMap.set(`${mesh.uuid}:${i}`, item.id);
            });

            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

            root.add(mesh);
        };

        // A. MANHOLES (Cylinder)
        const manholeGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16);
        manholeGeom.translate(0, 0.5, 0);

        createMesh(manholeGeom, buckets.manhole, false, false, (m, i, n) => this._setNodeTransform(m, i, n));
        createMesh(manholeGeom, buckets.manholeTransparent, true, false, (m, i, n) => this._setNodeTransform(m, i, n));

        // A.2 FICTIVE MANHOLES (2D Circle)
        // Status 2 -> Flat Circle at BottomZ
        const fictiveGeom = new THREE.CircleGeometry(0.5, 32);
        fictiveGeom.rotateX(-Math.PI / 2); // Rotate flat on XZ plane

        createMesh(fictiveGeom, buckets.manholeFictive, true, false, (m, i, n) => this._setFictiveTransform(m, i, n));
        // Note: Rect Ghosts are handled in A.3 if Solid, but what about Fictive Rects? 
        // Previously we routed RectGhost -> Fictive.
        // But manholeRectGhost now contains TRANSPARENT Rects (Status 3,6).
        // Fictive (Status 2) Rects are in manholeFictive (Circle).
        // So we just need Transparent Rect Logic next.
        // So ALL ghosts -> Circle. Even Rectangular ones?
        // Let's route RectGhost to Fictive Circle too for compliance.

        // A.3 MANHOLES (Box/Rect) - Real only
        const manholeRectGeom = new THREE.BoxGeometry(1, 1, 1);
        manholeRectGeom.translate(0, 0.5, 0);

        createMesh(manholeRectGeom, buckets.manholeRect, false, true, (m, i, n) => this._setNodeTransform(m, i, n));
        createMesh(manholeRectGeom, buckets.manholeRectTransparent, true, true, (m, i, n) => this._setNodeTransform(m, i, n));

        // B. CONNECTORS (Sphere)
        if (buckets.connector.length > 0) {
            const geom = new THREE.SphereGeometry(0.25, 8, 8);
            const mat = getMaterial(false, false);
            const mesh = new THREE.InstancedMesh(geom, mat, buckets.connector.length);

            buckets.connector.forEach((node, i) => {
                const x = node.pos.x - ORIGIN.x;
                const y = node.pos.y;
                const z = node.pos.z - ORIGIN.z;

                TMP_POS.set(x, y, z);
                TMP_QUAT.identity();
                TMP_SCALE.set(1, 1, 1);
                TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);

                mesh.setMatrixAt(i, TMP_MATRIX);
                mesh.setColorAt(i, new THREE.Color(0xff0000));
                instanceMap.set(`${mesh.uuid}:${i}`, node.id);
            });
            root.add(mesh);
        }

        // C. PIPES CIRCLE
        const pipeCircleGeom = new THREE.CylinderGeometry(0.5, 0.5, 1.0, 12);
        pipeCircleGeom.translate(0, 0.5, 0);

        createMesh(pipeCircleGeom, buckets.pipeCircle, false, false, (m, i, e) => this._setPipeTransform(m, i, e, graph.nodes));
        createMesh(pipeCircleGeom, buckets.pipeCircleTransparent, true, false, (m, i, e) => this._setPipeTransform(m, i, e, graph.nodes));

        // D. PIPES RECT
        const pipeRectGeom = new THREE.BoxGeometry(1, 1, 1);
        pipeRectGeom.translate(0, 0.5, 0);

        createMesh(pipeRectGeom, buckets.pipeRect, false, true, (m, i, e) => this._setRectPipeTransform(m, i, e, graph.nodes));
        createMesh(pipeRectGeom, buckets.pipeRectTransparent, true, true, (m, i, e) => this._setRectPipeTransform(m, i, e, graph.nodes));

        // E. PIPES TRAPEZ [NEW] - Individual Meshes for correct Slope (W/H ratio independence)
        // User requested exact logic from IsybauViewer3D (Slope 1.5)

        // E. PIPES TRAPEZ [NEW]
        if (buckets.pipeTrapez.length > 0 || buckets.pipeTrapezTransparent.length > 0) {
            const processTrapez = (edge, isTransparent) => {
                // ... (Logic same as before, just updated arg name)

                // 1. Calculate Start/End (Geometry)
                let start, end;
                const src = graph.nodes.get(edge.sourceId);
                const tgt = graph.nodes.get(edge.targetId);
                if (!src || !tgt) return;

                if (edge.geometry && edge.geometry.startPoint && edge.geometry.endPoint) {
                    start = new THREE.Vector3(edge.geometry.startPoint.x - ORIGIN.x, edge.geometry.startPoint.y, edge.geometry.startPoint.z - ORIGIN.z);
                    end = new THREE.Vector3(edge.geometry.endPoint.x - ORIGIN.x, edge.geometry.endPoint.y, edge.geometry.endPoint.z - ORIGIN.z);
                } else {
                    const sx = src.pos.x - ORIGIN.x;
                    const nodeZ = src.geometry?.bottomZ ?? src.pos.y;
                    let sy = edge.sohleZulauf;
                    if (sy === null || sy === undefined || (Math.abs(sy) < 0.01 && Math.abs(nodeZ) > 10)) sy = nodeZ;

                    const sz = src.pos.z - ORIGIN.z;
                    const tx = tgt.pos.x - ORIGIN.x;
                    const nodeZ2 = tgt.geometry?.bottomZ ?? tgt.pos.y;
                    let ty = edge.sohleAblauf;
                    if (ty === null || ty === undefined || (Math.abs(ty) < 0.01 && Math.abs(nodeZ2) > 10)) ty = nodeZ2;
                    const tz = tgt.pos.z - ORIGIN.z;
                    start = new THREE.Vector3(sx, sy, sz);
                    end = new THREE.Vector3(tx, ty, tz);
                }

                const length = start.distanceTo(end);
                if (length < 0.01) return;

                // 2. Create Shape (Slope 1.5)
                const h = edge.profile?.height || 0.3;
                const w = edge.profile?.width || 0.3;

                const shape = new THREE.Shape();
                const slope = 1.5;
                const rot = (x, y) => [-y, x];

                const topH = h / 2;
                const botH = -h / 2;
                const botW = w / 2;
                const topW = w / 2 + slope * h;

                shape.moveTo(...rot(-topW, topH));
                shape.lineTo(...rot(-botW, botH));
                shape.lineTo(...rot(botW, botH));
                shape.lineTo(...rot(topW, topH));
                shape.closePath();

                // 3. Extrude
                const curvePath = new THREE.LineCurve3(start, end);
                const settings = { steps: 2, extrudePath: curvePath, bevelEnabled: false };
                const geometry = new THREE.ExtrudeGeometry(shape, settings);

                // 4. Material
                const mat = getMaterial(isTransparent, true);
                const mesh = new THREE.Mesh(geometry, mat);
                mesh.castShadow = !isTransparent;
                mesh.receiveShadow = !isTransparent;

                // Color
                const col = getElementColor(edge.systemType, edge.status);
                mesh.material.color = col;

                instanceMap.set(`${mesh.uuid}:`, edge.id);
                instanceMap.set(mesh.uuid, edge.id);

                root.add(mesh);
            };

            buckets.pipeTrapez.forEach(e => processTrapez(e, false));
            buckets.pipeTrapezTransparent.forEach(e => processTrapez(e, true));
        }

        // STRUCTURES (Simple Box fallback)
        if (buckets.structure.length > 0) {
            const geom = new THREE.BoxGeometry(1, 1, 1);
            geom.translate(0, 0.5, 0);
            const mat = getMaterial(false, true);
            const mesh = new THREE.InstancedMesh(geom, mat, buckets.structure.length);

            buckets.structure.forEach((node, i) => {
                const x = node.pos.x - ORIGIN.x;
                const bottomZ = node.geometry?.bottomZ ?? node.pos.y;
                const z = node.pos.z - ORIGIN.z;

                const w = node.geometry?.width || 5;
                const l = node.geometry?.length || 5;
                const h = node.geometry?.height || 3;

                TMP_POS.set(x, bottomZ, z);
                TMP_QUAT.identity();
                TMP_SCALE.set(w, h, l);
                TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);

                mesh.setMatrixAt(i, TMP_MATRIX);
                mesh.setColorAt(i, getElementColor(node.attributes?.systemType, node.attributes?.status));
                instanceMap.set(`${mesh.uuid}:${i}`, node.id);
            });
            root.add(mesh);
        }

        return { root, instanceMap, origin: { x: originX, y: originNorth } };
    },

    // --- HELPERS ---

    _setNodeTransform(mesh, index, node) {
        // Coords: Map X -> X, Map Y -> -Z
        // Note: node.pos.z is already inverted (-North) from FixData.
        // So simple difference is correct.
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
        // FixData provides: geometry.width directly (not nested in dimensions)
        const width = node.geometry?.width || node.geometry?.dimensions?.width || 1.0;
        const length = node.geometry?.length || width; // Support Rectangular

        // Debug First Node
        if (index === 0 && mesh.geometry.type.includes('Box')) {
            console.log('[GeoFactory] DEBUG Node Rect:', {
                id: node.id,
                posRaw: node.pos,
                origin: ORIGIN,
                calc: { x, y, z, width, length, height }
            });
        }
        if (index === 0 && mesh.geometry.type.includes('Cylinder')) {
            console.log('[GeoFactory] DEBUG Node Cylinder:', {
                id: node.id,
                posRaw: node.pos,
                origin: ORIGIN,
                calc: { x, y, z, width, length, height }
            });
        }

        TMP_POS.set(x, y, z);
        TMP_QUAT.identity();
        TMP_SCALE.set(width, height, length);

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
        let start, end;

        // Use Pre-calculated Geometry if available (ISYIFC V3 Persistence)
        if (edge.geometry && edge.geometry.startPoint && edge.geometry.endPoint) {
            start = new THREE.Vector3(
                edge.geometry.startPoint.x - ORIGIN.x,
                edge.geometry.startPoint.y,
                edge.geometry.startPoint.z - ORIGIN.z
            );
            end = new THREE.Vector3(
                edge.geometry.endPoint.x - ORIGIN.x,
                edge.geometry.endPoint.y,
                edge.geometry.endPoint.z - ORIGIN.z
            );
        } else {
            // Fallback Logic
            const sx = src.pos.x - ORIGIN.x;
            // Smart Fallback for Elevation: Ignore 0 if Node is High (>10m)
            const nodeZ = src.geometry?.bottomZ ?? src.pos.y;
            let sy = edge.sohleZulauf;
            if (sy === null || sy === undefined || (Math.abs(sy) < 0.01 && Math.abs(nodeZ) > 10)) {
                sy = nodeZ;
            }

            const sz = src.pos.z - ORIGIN.z;

            const tx = tgt.pos.x - ORIGIN.x;
            const nodeZ2 = tgt.geometry?.bottomZ ?? tgt.pos.y;
            let ty = edge.sohleAblauf;
            if (ty === null || ty === undefined || (Math.abs(ty) < 0.01 && Math.abs(nodeZ2) > 10)) {
                ty = nodeZ2;
            }
            const tz = tgt.pos.z - ORIGIN.z;

            start = new THREE.Vector3(sx, sy, sz);
            end = new THREE.Vector3(tx, ty, tz);
        }

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
        // Egg/Mouth Support: Height might differ from Width
        const height = edge.profile?.height || width;

        TMP_SCALE.set(width, length, height); // Scale Y is length (Cylinder axis)

        TMP_POS.copy(start);

        TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
        mesh.setMatrixAt(index, TMP_MATRIX);
    }
    ,

    _setRectPipeTransform(mesh, index, edge, nodesMap) {
        const src = nodesMap.get(edge.sourceId);
        const tgt = nodesMap.get(edge.targetId);

        if (!src || !tgt) {
            mesh.setMatrixAt(index, new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0)));
            return;
        }

        let start, end;

        if (edge.geometry && edge.geometry.startPoint && edge.geometry.endPoint) {
            start = new THREE.Vector3(
                edge.geometry.startPoint.x - ORIGIN.x,
                edge.geometry.startPoint.y,
                edge.geometry.startPoint.z - ORIGIN.z
            );
            end = new THREE.Vector3(
                edge.geometry.endPoint.x - ORIGIN.x,
                edge.geometry.endPoint.y,
                edge.geometry.endPoint.z - ORIGIN.z
            );
        } else {
            const sx = src.pos.x - ORIGIN.x;
            const nodeZ = src.geometry?.bottomZ ?? src.pos.y;
            let sy = edge.sohleZulauf;
            if (sy === null || sy === undefined || (Math.abs(sy) < 0.01 && Math.abs(nodeZ) > 10)) {
                sy = nodeZ;
            }
            const sz = src.pos.z - ORIGIN.z;

            const tx = tgt.pos.x - ORIGIN.x;
            const nodeZ2 = tgt.geometry?.bottomZ ?? tgt.pos.y;
            let ty = edge.sohleAblauf;
            if (ty === null || ty === undefined || (Math.abs(ty) < 0.01 && Math.abs(nodeZ2) > 10)) {
                ty = nodeZ2;
            }
            const tz = tgt.pos.z - ORIGIN.z;

            start = new THREE.Vector3(sx, sy, sz);
            end = new THREE.Vector3(tx, ty, tz);
        }

        const length = start.distanceTo(end);

        if (length < 0.01) {
            mesh.setMatrixAt(index, new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0)));
            return;
        }

        // Quaternion (Y-Up to Direction)
        const dir = end.clone().sub(start).normalize();
        TMP_QUAT.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        const width = edge.profile?.width || 0.5;
        const height = edge.profile?.height || width; // Rect has height

        TMP_SCALE.set(width, length, height);

        TMP_POS.copy(start);

        TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
        mesh.setMatrixAt(index, TMP_MATRIX);
    },

    _setTrapezTransform(mesh, index, edge, nodesMap) {
        // Reuse Rect Logic largely, but with Trapez geometry
        this._setRectPipeTransform(mesh, index, edge, nodesMap);
        // Note: The geometry itself handles the shape. The transform scales it to W/H/L.
    },

    _setFictiveTransform(mesh, index, node) {
        // Coords
        const x = node.pos.x - ORIGIN.x;
        const z = node.pos.z - ORIGIN.z;
        const bottomZ = node.geometry?.bottomZ ?? node.pos.y;

        // Scale
        // Use Diameter/Width. Height is irrelevant for 2D.
        const width = node.geometry?.width || node.geometry?.dimensions?.width || 1.0;

        TMP_POS.set(x, bottomZ, z);
        TMP_QUAT.identity();
        TMP_SCALE.set(width, 1, width); // Scale X/Z by width. Y is flat.

        TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE);
        mesh.setMatrixAt(index, TMP_MATRIX);
    }
};
