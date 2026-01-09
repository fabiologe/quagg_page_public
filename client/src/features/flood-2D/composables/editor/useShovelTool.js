import { ref, watch, reactive } from 'vue';
import * as THREE from 'three';

// --- MODULE LEVEL HELPERS (Pure Functions) ---

// Precise Coordinate Mapping (Rescue Plan)
const sceneToGrid = (point, context) => {
    const { geoStore, parsedData } = context;
    if (!geoStore || !parsedData) return null;

    // Use Header Data for Precision
    const terrainHeader = geoStore.terrain ? geoStore.terrain.header : null;
    const xllcorner = (terrainHeader ? terrainHeader.xllcorner : parsedData.xllcorner) || 0;
    const yllcorner = (terrainHeader ? terrainHeader.yllcorner : parsedData.yllcorner) || 0;
    const cellsize = (terrainHeader ? terrainHeader.cellsize : parsedData.cellsize) || 1;
    const nrows = (terrainHeader ? terrainHeader.nrows : parsedData.nrows) || 0;
    const ncols = (terrainHeader ? terrainHeader.ncols : parsedData.ncols) || 0;

    // Calculate Real Coordinates based on Scene Center Logic
    // Scene (0,0,0) = Center of Terrain
    // CenterX = xllcorner + (ncols * cellsize) / 2
    // CenterY = yllcorner + (nrows * cellsize) / 2

    const centerX = xllcorner + (ncols * cellsize) / 2;
    const centerY = yllcorner + (nrows * cellsize) / 2;

    const realX = point.x + centerX;
    const realY = -point.z + centerY; // ThreeJS Z is GIS -Y

    // 2. Berechne Grid Index
    const col = Math.floor((realX - xllcorner) / cellsize);
    // Rescue Plan: GIS Y runs Bottom->Top, Array runs Top->Bottom
    const row = nrows - 1 - Math.floor((realY - yllcorner) / cellsize);

    // DEBUG LOG
    console.log(`[Shovel] Grid Mapping: Local(${point.x.toFixed(1)},${point.z.toFixed(1)}) -> Real(${realX.toFixed(1)},${realY.toFixed(1)}) -> Grid(${col},${row}) [Header: XL=${xllcorner}, YL=${yllcorner}, CS=${cellsize}]`);

    return { col, row };
};

const getIntersect = (pointer, raycaster, camera, context) => {
    raycaster.setFromCamera(pointer, camera);
    const intersects = [];

    // Rescue Plan: Check specifically against Terrain Mesh
    if (context.scene) {
        // Find terrain mesh by userData tag
        const terrain = context.scene.children.find(c => c.userData && c.userData.isTerrain);
        if (terrain) {
            raycaster.intersectObject(terrain, false, intersects);
        }
    }

    if (intersects.length > 0) return intersects[0].point;

    // Fallback: Interaction Plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, target)) return target;
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
    const mode = ref('LOWER');

    const brushShape = ref('CIRCLE');
    const polygonPoints = ref([]);
    const isDrawingPolygon = ref(false);

    // --- INTERNAL VISUALS & LOGIC ---
    let cursorMesh = null;
    let polygonLine = null;
    let isDigging = false;
    let currentPointer = null;
    let animationFrameId = null;
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


    const getAffectedCells = (centerPoint, context) => {
        const { parsedData } = context;
        if (!parsedData) return [];

        const gridPoint = sceneToGrid(centerPoint, context);
        if (!gridPoint) return [];

        const { col: centerCol, row: centerRow } = gridPoint;
        const { ncols, nrows, cellsize } = parsedData;
        const R = radius.value;
        const radiusCells = Math.ceil(R / cellsize);
        const cells = [];

        // Bounding Box
        const cMin = Math.max(0, centerCol - radiusCells);
        const cMax = Math.min(ncols - 1, centerCol + radiusCells);
        const rMin = Math.max(0, centerRow - radiusCells);
        const rMax = Math.min(nrows - 1, centerRow + radiusCells);

        for (let r = rMin; r <= rMax; r++) {
            for (let c = cMin; c <= cMax; c++) {
                // Metric Distance check
                const dx = (c - centerCol) * cellsize;
                const dy = (r - centerRow) * cellsize;

                let isInside = false;
                let factor = 1.0;

                if (brushShape.value === 'SQUARE') {
                    if (Math.abs(dx) <= R && Math.abs(dy) <= R) {
                        isInside = true;
                        factor = 1.0;
                    }
                } else {
                    const distSq = dx * dx + dy * dy;
                    if (distSq < R * R) {
                        isInside = true;
                        const dist = Math.sqrt(distSq);
                        factor = (Math.cos((dist / R) * Math.PI) + 1) / 2;
                    }
                }

                if (isInside) {
                    cells.push({ col: c, row: r, factor });
                }
            }
        }
        return cells;
    };


    // --- CORE LOGIC: APPLY (OPTIMIZED) ---

    const applyDig = () => {
        if (!isDigging || !currentPointer || !contextRef || !contextRef.parsedData) return;
        if (brushShape.value === 'POLYGON') return;

        // 1. Locate Mesh correctly
        const terrainMesh = contextRef.scene ? contextRef.scene.children.find(c => c.userData && c.userData.isTerrain) : null;
        if (!terrainMesh) return;

        const { minZ, ncols, gridData, nrows } = contextRef.parsedData;
        const STR = intensity.value;
        const isRaise = mode.value === 'RAISE';

        const affected = getAffectedCells(currentPointer, contextRef);
        console.log(`[Shovel] ApplyDig: ${mode.value} at ${currentPointer.x.toFixed(1)},${currentPointer.z.toFixed(1)} - Affected Cells: ${affected.length}`);

        const positions = terrainMesh.geometry.attributes.position;
        let modified = false;

        for (const cell of affected) {
            // 2. Map Row/Col to Buffer Index
            // sceneToGrid returns logical Row (0..nrows), but inverted Y.
            // If array is standard row-major (Top-Down), and sceneToGrid returns Bottom-Up index:
            // Then dataRow = (nrows - 1) - cell.row. (To flip back to Top-Down)
            // But WAIT: User prompt says: "row = nrows - 1 - floor(...)". 
            // This maps World Y to Array Row (0 = Top). 
            // IF sceneToGrid returns 0 as TOP row (due to inversion), then cell.row IS the array index.

            // Let's re-read sceneToGrid logic:
            // row = nrows - 1 - floor((realY - yllcorner));
            // yllcorner is Bottom. realY > yllcorner.
            // floor(...) increases as we go North (Up).
            // nrows - 1 - (Increasing) -> Decreases.
            // So North (Top) -> Small Row Index (0).
            // So cell.row IS the Data Row (Top-Down).

            const idx = cell.row * ncols + cell.col;
            if (idx < 0 || idx >= gridData.length) continue;

            const delta = STR * cell.factor;
            let oldZ = gridData[idx];
            if (oldZ < -9000) oldZ = minZ;

            let newZ = oldZ;
            if (isRaise) newZ += delta;
            else newZ -= delta;

            gridData[idx] = newZ;

            // 3. Direct Vertex Update
            // Assuming PlaneGeometry Topology matches Grid Layout (Top-Down).
            positions.setZ(idx, newZ - minZ);
            modified = true;
        }

        if (modified) {
            positions.needsUpdate = true;
            terrainMesh.geometry.computeVertexNormals();
        }

        if (isDigging) {
            animationFrameId = requestAnimationFrame(applyDig);
        }
    };

    const applyPolygonAction = () => {
        if (brushShape.value !== 'POLYGON' || !contextRef || polygonPoints.value.length < 3) return;

        const terrainMesh = contextRef.scene ? contextRef.scene.children.find(c => c.userData && c.userData.isTerrain) : null;
        if (!terrainMesh) return;

        const { minZ, ncols, nrows, gridData } = contextRef.parsedData;
        const STR = intensity.value;
        const isRaise = mode.value === 'RAISE';

        const localPoly = polygonPoints.value.map(p => {
            return sceneToGrid(p, contextRef);
        }).filter(p => p !== null);

        if (localPoly.length < 3) return;

        let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
        localPoly.forEach(p => {
            if (p.col < minC) minC = p.col; if (p.col > maxC) maxC = p.col;
            if (p.row < minR) minR = p.row; if (p.row > maxR) maxR = p.row;
        });

        minC = Math.max(0, minC); maxC = Math.min(ncols - 1, maxC);
        minR = Math.max(0, minR); maxR = Math.min(nrows - 1, maxR);

        const positions = terrainMesh.geometry.attributes.position;
        let modified = false;

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (isPointInPolygon({ x: c, y: r }, localPoly)) {
                    const idx = r * ncols + c;
                    if (idx < 0 || idx >= gridData.length) continue;

                    let oldZ = gridData[idx];
                    if (oldZ < -9000) oldZ = minZ;

                    let newZ = oldZ;
                    if (isRaise) newZ += STR;
                    else newZ -= STR;

                    gridData[idx] = newZ;
                    positions.setZ(idx, newZ - minZ);
                    modified = true;
                }
            }
        }

        if (modified) {
            positions.needsUpdate = true;
            terrainMesh.geometry.computeVertexNormals();
        }

        reset();
    };


    // --- LIFECYCLE ---
    const handleGlobalKey = (e) => {
        if (e.key === 'Enter' && isDrawingPolygon.value && polygonPoints.value.length >= 3) {
            finishPolygon();
        }
        if (e.key === 'Escape' && isDrawingPolygon.value) {
            reset();
        }
    };

    const activate = (scene) => {
        if (!cursorMesh && brushShape.value !== 'POLYGON') cursorMesh = createCursor();
        if (cursorMesh) scene.add(cursorMesh);
        window.addEventListener('keyup', handleGlobalKey);
    };

    const deactivate = (scene) => {
        stopDigging();
        if (cursorMesh) scene.remove(cursorMesh);
        if (polygonLine) scene.remove(polygonLine);
        polygonPoints.value = [];
        isDrawingPolygon.value = false;
        window.removeEventListener('keyup', handleGlobalKey);
    };

    // --- EVENTS ---
    const startDigging = (point, context) => {
        isDigging = true;
        currentPointer = point;
        contextRef = context;
        applyDig();
    };

    const stopDigging = () => {
        isDigging = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };

    const onMouseDown = ({ event, raycaster, camera, pointer, ...context }) => {
        if (event.button !== 0) return;
        const point = getIntersect(pointer, raycaster, camera, context);
        if (point) {
            contextRef = context;
            if (brushShape.value === 'POLYGON') {
                isDrawingPolygon.value = true;
                polygonPoints.value.push(point);
                updatePolygonVisuals(context.scene);
            } else {
                startDigging(point, context);
            }
        }
    };

    const onMouseUp = () => {
        if (brushShape.value !== 'POLYGON') stopDigging();
    };

    const onMove = ({ event, raycaster, camera, pointer, ...context }) => {
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

    // Explicit Finish Action
    const finishPolygon = (overrideMode = null) => {
        if (overrideMode) mode.value = overrideMode;
        applyPolygonAction();
    };

    const reset = () => {
        deactivate(contextRef ? contextRef.scene : window.scene);
        if (polygonLine && contextRef) {
            contextRef.scene.remove(polygonLine);
            polygonLine = null;
        }
        polygonPoints.value = [];
        isDrawingPolygon.value = false;
        isDigging = false;
    };

    return {
        radius,
        intensity,
        mode,
        brushShape,
        polygonPoints,
        isDrawingPolygon,

        activate,
        deactivate,
        onMove,
        onMouseDown,
        onMouseUp,

        finishPolygon,
        reset
    };
}
