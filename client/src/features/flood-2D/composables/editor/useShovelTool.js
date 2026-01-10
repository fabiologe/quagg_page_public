import { ref, watch, reactive } from 'vue';
import * as THREE from 'three';

// --- MODULE LEVEL HELPERS (Pure Functions) ---

/**
 * Calculates which grid cells are affected by the tool.
 * @param {THREE.Vector3} localPoint - The point in MESH LOCAL space (X, Y=North, Z=Elevation).
 * @param {number} radius - The tool radius in world units.
 * @param {Object} gridMetadata - Contains { cellsize, nrows, ncols, xllcorner, yllcorner }.
 * @returns {Array<{col: number, row: number, factor: number}>} List of affected cells with influence factor.
 */
export const calculateImpact = (localPoint, radius, gridMetadata) => {
    const { cellsize, nrows, ncols } = gridMetadata;
    const width = gridMetadata.bounds ? gridMetadata.bounds.width : (ncols - 1) * cellsize;
    const height = gridMetadata.bounds ? gridMetadata.bounds.height : (nrows - 1) * cellsize;

    // Local Coordinates (PlaneGeometry centered at 0,0)
    // minX (Left) = -width / 2
    // maxY (Top)  = height / 2
    const minX = -width / 2;
    const maxY = height / 2;

    // Grid Index via Rounding (Nearest Vertex)
    const centerCol = Math.round((localPoint.x - minX) / cellsize);
    const centerRow = Math.round((localPoint.y - maxY) / -cellsize);

    const affected = [];
    const radiusCells = Math.ceil(radius / cellsize);

    // Bounding Box
    const cMin = Math.max(0, centerCol - radiusCells);
    const cMax = Math.min(ncols - 1, centerCol + radiusCells);
    const rMin = Math.max(0, centerRow - radiusCells);
    const rMax = Math.min(nrows - 1, centerRow + radiusCells);

    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            // Metric Distance Check
            // Cell Position in Local Space
            const cellX = minX + c * cellsize;
            const cellY = maxY - r * cellsize;

            const dx = cellX - localPoint.x;
            const dy = cellY - localPoint.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= radius * radius) {
                const dist = Math.sqrt(distSq);
                // Cosine Falloff
                const factor = (Math.cos((dist / radius) * Math.PI) + 1) / 2;
                affected.push({ col: c, row: r, factor });
            }
        }
    }

    return affected;
};

/**
 * Computes the new Z values without mutating original data.
 * @param {Float32Array} originalData - The current elevation grid.
 * @param {Array} affectedCells - List of cells from calculateImpact.
 * @param {string} mode - 'RAISE' or 'LOWER'.
 * @param {number} intensity - Strength of the modification.
 * @param {number} minZ - Nodata value or minimum clamp.
 * @returns {Array<{idx: number, oldZ: number, newZ: number}>} List of changes.
 */
export const computeDisplacement = (originalData, affectedCells, mode, intensity, minZ, ncols) => {
    const changes = [];
    const isRaise = mode === 'RAISE';

    for (const cell of affectedCells) {
        const idx = cell.row * ncols + cell.col;

        // Safety check
        if (idx < 0 || idx >= originalData.length) continue;

        let oldZ = originalData[idx];
        // Handle NoData / Floor
        if (oldZ < -9000) oldZ = minZ;

        const delta = intensity * cell.factor;
        let newZ = oldZ;

        if (isRaise) {
            newZ += delta;
        } else {
            newZ -= delta;
        }

        changes.push({ idx, oldZ, newZ });
    }

    return changes;
};

// Precise Coordinate Mapping (Legacy / Reference - Unused by Tools internal logic now)
const sceneToGrid = (point, context) => {
    // Kept for compatibility if other components import it, otherwise could be removed.
    return null;
};

const getIntersect = (pointer, raycaster, camera, context) => {
    raycaster.setFromCamera(pointer, camera);
    const intersects = [];

    // Check specifically against Terrain Mesh
    if (context.scene) {
        const terrain = context.scene.children.find(c => c.userData && c.userData.isTerrain);
        if (terrain) {
            raycaster.intersectObject(terrain, false, intersects);
        }
    }

    if (intersects.length > 0) return intersects[0].point;
    return null;
};

const isPointInPolygon = (testPoint, points) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;

        const intersect = ((yi > testPoint.y) !== (yj > testPoint.y))
            && (testPoint.x < (xj - xi) * (testPoint.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};

export function useShovelTool() {

    // --- STATE ---
    const radius = ref(5.0);
    const intensity = ref(0.2);
    const mode = ref('LOWER'); // 'RAISE' or 'LOWER'

    const state = ref('AIMING'); // 'AIMING' | 'REVIEW'
    const pendingChanges = ref(null); // Stores result of computeDisplacement

    const brushShape = ref('CIRCLE');
    const polygonPoints = ref([]);
    const isDrawingPolygon = ref(false);

    // --- INTERNAL VISUALS & LOGIC ---
    let cursorMesh = null;
    let previewMesh = null; // New Preview Mesh
    let polygonLine = null;
    let currentPointer = null;

    let contextRef = null;

    // --- GEOMETRY HELPERS ---
    const createCursor = () => {
        let geometry;
        const R = radius.value;
        const isSquare = brushShape.value === 'SQUARE';

        if (isSquare) {
            geometry = new THREE.PlaneGeometry(R * 2, R * 2);
        } else {
            geometry = new THREE.RingGeometry(0, R, 32);
        }

        const material = new THREE.MeshBasicMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: isSquare ? 0.6 : 0.4,
            side: THREE.DoubleSide,
            wireframe: isSquare
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        return mesh;
    };

    const updateCursorGeometry = () => {
        if (!cursorMesh || isDrawingPolygon.value) return;

        cursorMesh.geometry.dispose();
        const R = radius.value;
        const isSquare = brushShape.value === 'SQUARE';

        if (isSquare) {
            cursorMesh.geometry = new THREE.PlaneGeometry(R * 2, R * 2);
            cursorMesh.material.wireframe = true;
            cursorMesh.material.opacity = 0.6;
        } else {
            cursorMesh.geometry = new THREE.RingGeometry(0, R, 32);
            cursorMesh.material.wireframe = false;
            cursorMesh.material.opacity = 0.4;
        }
    };

    const createPreviewMesh = (changes, context) => {
        if (!context.scene || !context.terrainMesh) return;

        // Remove old preview
        if (previewMesh) {
            if (previewMesh.parent) previewMesh.parent.remove(previewMesh);
            else context.scene.remove(previewMesh);
            previewMesh.geometry.dispose();
            previewMesh.material.dispose();
        }

        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const { parsedData } = context;
        const { ncols, nrows, cellsize, minZ } = parsedData;

        // Use Bounds from Metadata or derive
        const width = parsedData.bounds ? parsedData.bounds.width : (ncols - 1) * cellsize;
        const height = parsedData.bounds ? parsedData.bounds.height : (nrows - 1) * cellsize;

        const minX = -width / 2;
        const maxY = height / 2;

        changes.forEach(change => {
            const idx = change.idx;
            const r = Math.floor(idx / ncols);
            const c = idx % ncols;

            // Matches calculateImpact logic
            const localX = minX + c * cellsize;
            const localY = maxY - r * cellsize;

            // Z: Elevation (delta from minZ + small offset)
            const localZ = change.newZ - minZ + 0.05;

            vertices.push(localX, localY, localZ);
        });

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const color = mode.value === 'RAISE' ? 0x00ff00 : 0xff0000;

        const material = new THREE.PointsMaterial({
            color: color,
            size: cellsize * 0.8,
            sizeAttenuation: true
        });

        previewMesh = new THREE.Points(geometry, material);
        // Add to TerrainMesh as Child (Step 5 Requirement)
        context.terrainMesh.add(previewMesh);
    };

    const updatePolygonVisuals = (scene) => {
        if (polygonLine) {
            scene.remove(polygonLine);
            polygonLine.geometry.dispose();
            polygonLine.material.dispose();
            polygonLine = null;
        }

        if (polygonPoints.value.length > 0) {
            const points = [...polygonPoints.value];
            if (currentPointer && isDrawingPolygon.value) points.push(currentPointer);

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0xe74c3c, linewidth: 2 });
            polygonLine = new THREE.Line(geometry, material);
            polygonLine.position.y = 0.5;
            scene.add(polygonLine);
        }
    };

    watch([radius, brushShape], () => {
        if (state.value === 'REVIEW') return;

        if (brushShape.value !== 'POLYGON') {
            updateCursorGeometry();
            if (cursorMesh) cursorMesh.visible = true;
            if (polygonLine && contextRef) {
                contextRef.scene.remove(polygonLine);
                polygonLine = null;
            }
        } else {
            if (cursorMesh) cursorMesh.visible = false;
        }
    });

    const ensureCursor = () => {
        if (brushShape.value !== 'POLYGON') updateCursorGeometry();
    };

    // --- ACTIONS ---

    const commit = () => {
        if (state.value !== 'REVIEW' || !pendingChanges.value || !contextRef) return;

        const { terrainMesh, parsedData } = contextRef;
        const { gridData, minZ } = parsedData;
        const positions = terrainMesh.geometry.attributes.position;
        let modified = false;

        // Apply changes
        pendingChanges.value.forEach(change => {
            const { idx, newZ } = change;
            gridData[idx] = newZ;
            positions.setZ(idx, newZ - minZ);
            modified = true;
        });

        if (modified) {
            positions.needsUpdate = true;
            terrainMesh.geometry.computeVertexNormals();
        }

        reset(); // Back to AIMING
    };

    const cancel = () => {
        reset();
    };

    const reset = () => {
        // 1. Dispose Preview
        if (previewMesh) {
            if (previewMesh.parent) previewMesh.parent.remove(previewMesh);
            else if (contextRef && contextRef.scene) contextRef.scene.remove(previewMesh);
            previewMesh.geometry.dispose();
            previewMesh.material.dispose();
            previewMesh = null;
        }

        // 2. Clear State
        pendingChanges.value = null;
        state.value = 'AIMING';

        // 3. Reset Visuals
        if (brushShape.value !== 'POLYGON') {
            if (cursorMesh) cursorMesh.visible = true;
        }
    };

    // --- LIFECYCLE ---
    const handleGlobalKey = (e) => {
        if (e.key === 'Escape') {
            if (state.value === 'REVIEW') {
                cancel();
            } else if (isDrawingPolygon.value) {
                polygonPoints.value = [];
                isDrawingPolygon.value = false;
                if (polygonLine && contextRef) {
                    contextRef.scene.remove(polygonLine);
                    polygonLine = null;
                }
            }
        }
    };

    const activate = (scene) => {
        if (!cursorMesh && brushShape.value !== 'POLYGON') cursorMesh = createCursor();
        if (cursorMesh) scene.add(cursorMesh);
        ensureCursor(); // FORCE update on activate
        window.addEventListener('keyup', handleGlobalKey);
    };

    const deactivate = (scene) => {
        // Safety Cleanup: Ensure we don't leave ghosts
        reset();

        if (cursorMesh) scene.remove(cursorMesh);
        if (polygonLine) scene.remove(polygonLine);
        polygonPoints.value = [];
        isDrawingPolygon.value = false;
        window.removeEventListener('keyup', handleGlobalKey);
    };

    // --- EVENTS ---

    const onMouseDown = ({ event, raycaster, camera, pointer, ...context }) => {
        if (event.button !== 0) return;

        // Block interaction if in REVIEW mode (must use UI)
        if (state.value === 'REVIEW') {
            return;
        }

        const point = getIntersect(pointer, raycaster, camera, context);
        if (point) {
            contextRef = context;

            if (brushShape.value === 'POLYGON') {
                isDrawingPolygon.value = true;
                polygonPoints.value.push(point);
                updatePolygonVisuals(context.scene);
            } else {
                // START REVIEW WORKFLOW

                // 1. Guard Clauses
                if (!context.parsedData) return;

                // 2. Calculate Impact (Local Coordinates Fix)
                let localPoint = point;
                if (context.terrainMesh) {
                    localPoint = context.terrainMesh.worldToLocal(point.clone());
                }

                const affected = calculateImpact(localPoint, radius.value, context.parsedData);
                if (affected.length === 0) return; // Empty click guard

                // 3. Compute Displacement
                const { gridData, minZ, ncols } = context.parsedData;
                const changes = computeDisplacement(gridData, affected, mode.value, intensity.value, minZ, ncols);

                if (changes.length === 0) return;

                pendingChanges.value = changes;

                // 4. Create Preview
                createPreviewMesh(changes, context);

                // 5. Transition State
                state.value = 'REVIEW';

                // Hide cursor during review
                if (cursorMesh) cursorMesh.visible = false;
            }
        }
    };

    const onMouseUp = () => {
    };

    const onMove = ({ event, raycaster, camera, pointer, ...context }) => {
        // If reviewing, cursor is hidden/locked.
        if (state.value === 'REVIEW') return;

        const point = getIntersect(pointer, raycaster, camera, context);
        if (point) {
            currentPointer = point;
            if (isDrawingPolygon.value && brushShape.value === 'POLYGON') {
                updatePolygonVisuals(context.scene);
            }
            if (cursorMesh && brushShape.value !== 'POLYGON') {
                cursorMesh.visible = true;
                cursorMesh.position.copy(point);
                cursorMesh.position.y += 0.2;
            }
        } else {
            if (cursorMesh) cursorMesh.visible = false;
        }
    };

    return {
        radius,
        intensity,
        mode,
        state, // Export state
        pendingChanges, // Export for UI to check count

        brushShape,
        polygonPoints,
        isDrawingPolygon,

        activate,
        deactivate,
        onMove,
        onMouseDown,
        onMouseUp,

        commit, // Export Actions
        cancel,
        reset
    };
}
