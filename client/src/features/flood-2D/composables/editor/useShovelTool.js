import { ref, watch, reactive } from 'vue';
import * as THREE from 'three';

// --- MODULE LEVEL HELPERS (Pure Functions) ---

// Precise Coordinate Mapping
const sceneToGrid = (point, context) => {
    // Requirements: geoStore containing worldOffset, and terrain.header
    const { geoStore, parsedData } = context;
    if (!geoStore || !parsedData) return null;

    const terrainHeader = geoStore.terrain ? geoStore.terrain.header : null;
    // If not in header, try parsedData root props
    const xllcorner = (terrainHeader ? terrainHeader.xllcorner : parsedData.xllcorner) || 0;
    const yllcorner = (terrainHeader ? terrainHeader.yllcorner : parsedData.yllcorner) || 0;
    const cellsize = (terrainHeader ? terrainHeader.cellsize : parsedData.cellsize) || 1;
    const worldOffset = geoStore.worldOffset || { x: 0, y: 0 };

    // 1. Convert Three.js World (Offset) to Real World (UTM)
    // Three.js Point: x, y, z (where y is up)
    // Our Logic: x -> Easting, z -> Northing (Negative?)
    // Wait, usually standard displacement:
    // realX = point.x + worldOffset.x
    // realY = -point.z + worldOffset.y (assuming z is North-South reversed in Scene)

    // Let's rely on standard logic: 
    // If point.x is 5, and offset is 1000, realX is 1005.
    const realX = point.x + worldOffset.x;
    const realY = -point.z + worldOffset.y; // Standard WebGL mapping: -Z is North

    // 2. Map to Grid
    const col = Math.floor((realX - xllcorner) / cellsize);
    const row = Math.floor((realY - yllcorner) / cellsize);

    return { col, row };
};

const getIntersect = (pointer, raycaster, camera, context) => {
    raycaster.setFromCamera(pointer, camera);
    const intersects = [];
    if (context.terrainMesh) {
        raycaster.intersectObject(context.terrainMesh, false, intersects);
    }
    if (intersects.length > 0) return intersects[0].point;

    // Fallback
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

    // Shape Support
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
                // Distance in Metric
                const dx = (c - centerCol) * cellsize;
                const dy = (r - centerRow) * cellsize; // row vs y distinction doesn't matter for dist

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


    // --- CORE LOGIC: APPLY ---

    // Continuous Application (Circle/Square)
    const applyDig = () => {
        if (!isDigging || !currentPointer || !contextRef || !contextRef.parsedData) return;
        if (brushShape.value === 'POLYGON') return;

        const { minZ, ncols, minX, maxY, cellsize, gridData, nrows } = contextRef.parsedData;
        // Note: parsedData usually has cellsize, ncols, nrows. 
        // Need to ensure we write to correct index.
        const STR = intensity.value;
        const isRaise = mode.value === 'RAISE';

        const affected = getAffectedCells(currentPointer, contextRef);
        const positions = contextRef.terrainMesh.geometry.attributes.position;
        let modified = false;

        for (const cell of affected) {
            // Grid Index
            // NOTE: parsedData usually stores gridData row-major from Top-Left or Bottom-Left?
            // Usually standard ASCII Grid is Top-Left (Row 0 is Top).
            // But Map3D rendering logic often flips it.
            // Let's assume standard index: row * ncols + col.

            const idx = cell.row * ncols + cell.col;
            if (idx < 0 || idx >= gridData.length) continue;

            const delta = STR * cell.factor;

            let oldZ = gridData[idx];
            if (oldZ < -9000) oldZ = minZ;

            let newZ = oldZ;
            if (isRaise) newZ += delta;
            else newZ -= delta;

            gridData[idx] = newZ;

            // Visual Update: Map Grid Row/Col to Mesh Vertex Index.
            // Standard PlaneGeometry:
            // vertices are row-major from Top-Left.
            // Usually Grid Row 0 (Top) maps to Geometry Row 0.
            // If parsedData.gridData matches this, then vertIdx === idx.
            // Let's try direct mapping first.
            const vertIdx = idx;

            // Wait, previous logic had:
            // row = (nrows-1) - geomRow
            // implies gridData is Bottom-Up or Geometry vs Grid inversion.
            // If `sceneToGrid` returns correct logical Grid Row (0..nrows), 
            // and PlaneGeometry is 0..nrows, we just need to know if they align.
            // Standard PlaneGeometry is +Y to -Y (Top Down).
            // Standard ASC Grid is Top Down.
            // So direct mapping should work IF sceneToGrid returns Top-Down row.

            // sceneToGrid uses: floor((realY - yllcorner) / cellsize)
            // realY increases North. yllcorner is Bottom.
            // So this returns Row Index from Bottom (0 = Bottom).
            // So Logical Row is Bottom-Up.
            // Grid Data usually Top-Down?
            // If Grid Data is Top-Down, then index = (nrows - 1 - row) * ncols + col.

            // Let's assume Grid Data is correctly ordered 0..N where 0 is start.
            // If file was ASCII Grid, Row 0 is Top.
            // So we need to flip the Row index for data access.
            const dataRow = (nrows - 1) - cell.row;
            const dataIdx = dataRow * ncols + cell.col;

            // Wait, if sceneToGrid returns row 0 as Bottom.
            // And Grid Data (ASCII) has row 0 as Top.
            // Then yes: dataRow = (nrows - 1) - row.

            // Geometry: PlaneGeometry usually Top-Down.
            // So Geometry Row 0 is Top.
            // So Geometry Row matches Data Row.

            if (dataIdx >= 0 && dataIdx < gridData.length) {
                gridData[dataIdx] = newZ; // Update Store

                // Update Mesh (Vertices match Data Layout usually)
                positions.setZ(dataIdx, newZ - minZ);
                modified = true;
            }
        }

        if (modified) {
            positions.needsUpdate = true;
            contextRef.terrainMesh.geometry.computeVertexNormals();
        }

        if (isDigging) {
            animationFrameId = requestAnimationFrame(applyDig);
        }
    };

    // Discrete Application (Polygon)
    const applyPolygonAction = () => {
        if (brushShape.value !== 'POLYGON' || !contextRef || polygonPoints.value.length < 3) return;

        const { minZ, ncols, nrows, cellsize, gridData } = contextRef.parsedData;
        const STR = intensity.value;
        const isRaise = mode.value === 'RAISE';

        // Convert Polygon World Points to Grid Coords
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
        minR = Math.max(0, minR); maxR = Math.min(nrows - 1, maxR); // These are Bottom-Up Rows

        const positions = contextRef.terrainMesh.geometry.attributes.position;
        let modified = false;

        for (let r = minR; r <= maxR; r++) { // Iterate Bottom-Up Row Index
            for (let c = minC; c <= maxC; c++) {
                if (isPointInPolygon({ x: c, y: r }, localPoly)) {

                    // Convert to Data/Mesh Index (Top-Down)
                    const dataRow = (nrows - 1) - r;
                    const idx = dataRow * ncols + c;

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
            contextRef.terrainMesh.geometry.computeVertexNormals();
        }

        reset();
    };


    // --- EVENTS ---
    const handleGlobalKey = (e) => {
        if (e.key === 'Enter' && isDrawingPolygon.value && polygonPoints.value.length >= 3) {
            finishPolygon(); // Uses current mode by default
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
