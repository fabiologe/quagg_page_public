import { ref, reactive, watch, toRefs } from 'vue';
import * as THREE from 'three';

// --- MODULE LEVEL HELPERS (Pure Functions) ---

const getEffectiveRadius = (radius, cellsize) => {
    const safeCellSize = cellsize || 1.0;
    const minRadius = safeCellSize * 1.2;
    return Math.max(radius, minRadius);
};

/**
 * Calculates which grid cells are affected by the tool.
 * @param {THREE.Vector3} localPoint - The point in MESH LOCAL space (X, Y=North, Z=Elevation).
 * @param {Object} brushSettings - Contains { brushShape, radius, width, height }.
 * @param {Object} gridMetadata - Contains { cellsize, nrows, ncols, xllcorner, yllcorner }.
 * @returns {Array<{col: number, row: number, factor: number}>} List of affected cells with influence factor.
 */
export const calculateImpact = (localPoint, brushSettings, gridMetadata) => {
    const { cellsize, nrows, ncols } = gridMetadata;
    const { brushShape, radius, width: rectW, height: rectH } = brushSettings;

    // Dimensions based on Grid extent
    const gridWidth = (ncols - 1) * cellsize;
    const gridHeight = (nrows - 1) * cellsize;

    // Determine bounds for optimization
    let boundW, boundH;
    let effectiveR = 0;

    if (brushShape === 'SQUARE') {
        boundW = rectW / 2;
        boundH = rectH / 2;
    } else {
        // CIRCLE
        effectiveR = getEffectiveRadius(radius, cellsize);
        boundW = effectiveR;
        boundH = effectiveR;
    }

    // Offset Logic (Center -> Corner)
    // Plane is at 0,0. Grid Origin (0,0) is Bottom-Left (-w/2, -h/2)
    const offsetX = gridWidth / 2;
    const offsetY = gridHeight / 2;

    const centerCol = Math.floor((localPoint.x + offsetX + (cellsize * 0.5)) / cellsize);
    const centerRow = Math.floor((localPoint.y + offsetY + (cellsize * 0.5)) / cellsize);

    // Bounding Box
    const cellsW = Math.ceil(boundW / cellsize);
    const cellsH = Math.ceil(boundH / cellsize);

    const cMin = Math.max(0, centerCol - cellsW);
    const cMax = Math.min(ncols - 1, centerCol + cellsW);
    const rMin = Math.max(0, centerRow - cellsH);
    const rMax = Math.min(nrows - 1, centerRow + cellsH);

    // Pre-calc Square properties
    const rSq = effectiveR * effectiveR;

    const affected = [];

    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            // Cell Position in Local Space (center of the cell)
            // Index 0 = -offsetX + 0.5 * cellsize
            const cellX = (c * cellsize) - offsetX + (cellsize * 0.5);
            const cellY = (r * cellsize) - offsetY + (cellsize * 0.5);

            const dx = Math.abs(cellX - localPoint.x);
            const dy = Math.abs(cellY - localPoint.y);

            let isInside = false;

            if (brushShape === 'SQUARE') {
                // Rectangle Logic (width/height)
                // Check Max Distance (half-width)
                if (dx <= boundW && dy <= boundH) {
                    isInside = true;
                }
            } else {
                // Circle Logic
                if ((dx * dx + dy * dy) <= rSq) {
                    isInside = true;
                }
            }

            if (isInside) {
                // Engineering Standard: Factor 1.0 (Hard Edge)
                affected.push({ col: c, row: r, factor: 1.0 });
            }
        }
    }

    console.log(`[Shovel] Affected Cells: ${affected.length}`);
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

    if (affectedCells.length > 0) {
        console.log('[computeDisplacement] Debug:', { mode, isRaise, intensity });
    }

    // Safety: Ensure intensity is positive
    const absIntensity = Math.abs(intensity);

    for (let i = 0; i < affectedCells.length; i++) {
        const cell = affectedCells[i];
        const idx = cell.row * ncols + cell.col;

        // Safety check
        if (idx < 0 || idx >= originalData.length) continue;

        let oldZ = originalData[idx];
        // Handle NoData / Floor
        if (oldZ < -9000) oldZ = minZ;

        const delta = absIntensity * cell.factor;
        let newZ = oldZ;

        if (isRaise) {
            newZ += delta;
        } else {
            newZ -= delta;
        }

        changes.push({ idx, oldZ, newZ });

        if (i === 0) {
            console.log('[computeDisplacement] First Cell:', { idx, oldZ, delta, newZ });
        }
    }

    return changes;
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

// --- SINGLETON STATE (Fix Split-Brain) ---
const settings = reactive({
    radius: 5.0,
    width: 10.0,
    height: 10.0,
    intensity: 0.2,
    mode: 'LOWER', // 'RAISE' | 'LOWER'
    brushShape: 'CIRCLE' // 'CIRCLE' | 'SQUARE' | 'POLYGON'
});

const state = ref('AIMING'); // 'AIMING' | 'REVIEW'
const pendingChanges = ref(null);
const polygonPoints = ref([]);
const isDrawingPolygon = ref(false);

// --- INTERNAL GLOBALS (Visuals) ---
let cursorMesh = null;
let previewMesh = null;
let polygonLine = null;
let currentPointer = null;
let contextRef = null;

export function useShovelTool() {

    // --- GEOMETRY HELPERS ---
    const createCursor = () => {
        let geometry;
        const isSquare = settings.brushShape === 'SQUARE';

        if (isSquare) {
            geometry = new THREE.PlaneGeometry(settings.width, settings.height);
        } else {
            geometry = new THREE.RingGeometry(0, settings.radius, 32);
        }

        const material = new THREE.MeshBasicMaterial({
            color: 0x3498db,
            transparent: true,
            opacity: isSquare ? 0.6 : 0.4,
            side: THREE.DoubleSide,
            wireframe: isSquare,
            depthTest: false // Overlay Style
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 999; // Ensure visibility on top
        mesh.visible = false;
        return mesh;
    };

    const updateCursorGeometry = () => {
        if (!cursorMesh || isDrawingPolygon.value) return;

        cursorMesh.geometry.dispose();
        const isSquare = settings.brushShape === 'SQUARE';

        if (isSquare) {
            cursorMesh.geometry = new THREE.PlaneGeometry(settings.width, settings.height);
            cursorMesh.material.wireframe = true;
            cursorMesh.material.opacity = 0.6;
        } else {
            cursorMesh.geometry = new THREE.RingGeometry(0, settings.radius, 32);
            cursorMesh.material.wireframe = false;
            cursorMesh.material.opacity = 0.4;
        }
    };

    const createPreviewMesh = (changes, context, overrideColor = null) => {
        if (!context.scene || !context.terrainMesh) return;

        // Remove old preview if exists
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

        // Dimensions
        const width = (ncols - 1) * cellsize;
        const height = (nrows - 1) * cellsize;

        // Offset Logic (Center -> Corner)
        const offsetX = width / 2;
        const offsetY = height / 2;

        changes.forEach(change => {
            const idx = change.idx;
            const r = Math.floor(idx / ncols);
            const c = idx % ncols;

            // Matches calculateImpact (Bottom-Up)
            // Center of cell
            const localX = (c * cellsize) - offsetX + (cellsize * 0.5);
            const localY = (r * cellsize) - offsetY + (cellsize * 0.5);

            // VISUALIZATION FIX:
            const isRaise = settings.mode === 'RAISE';
            // If overrideColor is set (Hover Mode), we want to show SURFACE (oldZ)
            // If overrideColor is NOT set (Review Mode), we show RESULT (newZ/oldZ based on mode)
            let visualZ = change.oldZ; // Default to surface

            if (!overrideColor) { // Review Mode
                visualZ = isRaise ? change.newZ : change.oldZ;
            }

            // Z: Elevation (delta from minZ + small offset)
            const localZ = visualZ - minZ + 0.05;

            vertices.push(localX, localY, localZ);
        });

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        // Color Logic
        let colorCode;
        if (overrideColor) {
            colorCode = overrideColor;
        } else {
            colorCode = settings.mode === 'RAISE' ? 0x00ff00 : 0xff0000;
        }

        const material = new THREE.PointsMaterial({
            color: colorCode,
            size: cellsize * 0.8,
            sizeAttenuation: true,
            depthTest: false // Ensure visibility
        });

        previewMesh = new THREE.Points(geometry, material);
        previewMesh.renderOrder = 998;
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

    watch(() => [settings.radius, settings.brushShape], () => {
        if (state.value === 'REVIEW') return;

        if (settings.brushShape !== 'POLYGON') {
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
        if (settings.brushShape !== 'POLYGON') updateCursorGeometry();
    };

    const updateCursorScale = () => {
        if (!cursorMesh || !contextRef || settings.brushShape === 'POLYGON') return;
        const { cellsize } = contextRef.parsedData;
        const effectiveRadius = getEffectiveRadius(settings.radius, cellsize);

        // Geom is built with settings.radius.
        // Scale up if effectiveRadius is larger (Auto-Snap).
        if (settings.radius > 0) {
            const s = effectiveRadius / settings.radius;
            cursorMesh.scale.set(s, s, 1);
        }
    };

    // --- ACTIONS ---

    const commit = () => {
        if (state.value !== 'REVIEW' || !pendingChanges.value || !contextRef) return;

        const { terrainMesh, parsedData } = contextRef;
        const { gridData, minZ, nrows, ncols } = parsedData;
        const positions = terrainMesh.geometry.attributes.position;
        let modified = false;

        // Apply changes
        pendingChanges.value.forEach(change => {
            const { idx, newZ } = change;

            // 1. Update Grid Data (Bottom-Up)
            gridData[idx] = newZ;

            // 2. Update Mesh Vertex (Top-Down) - MAPPING REQUIRED
            // idx = gridRow * ncols + col
            const gridRow = Math.floor(idx / ncols);
            const col = idx % ncols;

            // Map Grid Row (0=Bottom) to Vertex Row (0=Top)
            const vertexRow = (nrows - 1) - gridRow;
            const vertexIdx = vertexRow * ncols + col;

            positions.setZ(vertexIdx, newZ - minZ);

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

    // --- CLEANUP LOGIC ---
    const reset = () => {
        console.log('[ShovelTool] Resetting State (Cleanup)');

        // 1. Dispose Preview Mesh (The Green Shadow)
        if (previewMesh) {
            // Remove from parent (TerrainMesh) or Scene
            if (previewMesh.parent) {
                previewMesh.parent.remove(previewMesh);
            } else if (contextRef && contextRef.scene) {
                contextRef.scene.remove(previewMesh);
            }
            if (previewMesh.geometry) previewMesh.geometry.dispose();
            if (previewMesh.material) previewMesh.material.dispose();
            previewMesh = null;
        }

        // 2. Clear State
        pendingChanges.value = null;
        state.value = 'AIMING';

        // 3. Reset Visuals
        if (settings.brushShape !== 'POLYGON') {
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
        if (!cursorMesh && settings.brushShape !== 'POLYGON') cursorMesh = createCursor();
        if (cursorMesh) scene.add(cursorMesh);
        ensureCursor();
        window.addEventListener('keyup', handleGlobalKey);
    };

    const deactivate = (scene) => {
        // IMPORTANT: Calling reset ensures Preview Mesh handles are cleaned up
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

        if (state.value === 'REVIEW') return;

        const point = getIntersect(pointer, raycaster, camera, context);
        if (point) {
            contextRef = context;

            if (settings.brushShape === 'POLYGON') {
                isDrawingPolygon.value = true;
                polygonPoints.value.push(point);
                updatePolygonVisuals(context.scene);
            } else {
                // START REVIEW WORKFLOW
                if (!context.parsedData) return;

                // 2. Calculate Impact (Local Coordinates Fix)
                let localPoint = point;
                if (context.terrainMesh) {
                    localPoint = context.terrainMesh.worldToLocal(point.clone());
                }

                const affected = calculateImpact(localPoint, settings, context.parsedData);
                if (affected.length === 0) return;

                console.log('ShovelTool Inputs:', {
                    mode: settings.mode,
                    intensity: settings.intensity,
                    radius: settings.radius
                });

                const { gridData, minZ, ncols } = context.parsedData;
                // Force absolute intensity to ensure lower logic works (negative delta handled by mode)
                const SafeIntensity = Math.abs(settings.intensity);

                const changes = computeDisplacement(gridData, affected, settings.mode, SafeIntensity, minZ, ncols);

                if (changes.length > 0) {
                    console.log('ShovelTool Result (First):', changes[0]);
                }
                if (changes.length === 0) return;

                pendingChanges.value = changes;
                createPreviewMesh(changes, context);
                state.value = 'REVIEW';

                if (cursorMesh) cursorMesh.visible = false;
            }
        }
    };

    const onMouseUp = () => { };

    const onMove = ({ event, raycaster, camera, pointer, ...context }) => {
        if (state.value === 'REVIEW') return;

        const point = getIntersect(pointer, raycaster, camera, context);
        if (point) {
            contextRef = context;
            currentPointer = point;

            if (isDrawingPolygon.value && settings.brushShape === 'POLYGON') {
                updatePolygonVisuals(context.scene);
            }
            if (cursorMesh && settings.brushShape !== 'POLYGON') {
                // Ensure scene persistence (Singleton Fix)
                if (context.scene && !context.scene.children.includes(cursorMesh)) {
                    context.scene.add(cursorMesh);
                }

                // Auto-Snap Visuals (Update ring scale)
                updateCursorScale();

                cursorMesh.visible = true;
                cursorMesh.position.copy(point);
                cursorMesh.position.y += 0.2;

                // --- MAGIC BRUSH: Live Point Highlight ---
                if (context.terrainMesh && context.parsedData) {
                    const localPoint = context.terrainMesh.worldToLocal(point.clone());
                    // Use existing logic for calculation
                    const affected = calculateImpact(localPoint, settings, context.parsedData);

                    if (affected.length > 0) {
                        // Transform to "Change" format expected by createPreviewMesh
                        // We only need idx and oldZ for Highlight mode
                        const changes = affected.map(cell => {
                            const idx = cell.row * context.parsedData.ncols + cell.col;
                            // Safety Check
                            if (idx >= 0 && idx < context.parsedData.gridData.length) {
                                const oldZ = context.parsedData.gridData[idx];
                                return { idx, oldZ, newZ: oldZ };
                            }
                            return null;
                        }).filter(Boolean);

                        // Render Cyan Glow (0x00ffff)
                        createPreviewMesh(changes, context, 0x00ffff);
                    }
                }
            }
        } else {
            if (cursorMesh) cursorMesh.visible = false;
            // Clear Live Preview if off-terrain
            if (previewMesh) {
                if (previewMesh.parent) previewMesh.parent.remove(previewMesh);
                else if (context.scene) context.scene.remove(previewMesh);
                previewMesh.geometry.dispose();
                previewMesh.material.dispose();
                previewMesh = null;
            }
        }
    };

    return reactive({
        // Shared State
        settings,
        state,
        pendingChanges,
        polygonPoints,
        isDrawingPolygon,

        // Lifecycle & Actions
        activate,
        deactivate,
        onMove,
        onMouseDown,
        onMouseUp,
        commit,
        cancel,
        reset
    });
}
