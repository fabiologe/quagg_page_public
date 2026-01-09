import * as THREE from 'three';
import { useDrawTool } from './useDrawTool.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';

export function useBoundaryTool() {

    // Initialize DrawTool in "Polyline" mode (no auto-close)
    const drawTool = useDrawTool({ isPolygon: false });
    const geoStore = useGeoStore();

    // Visuals
    let ghostMarker = null;

    // --- HELPER: Grid Snapping ---
    const getGridSnap = (point, parsedData) => {
        if (!parsedData) return point;

        const { cellsize, bounds, center, minZ } = parsedData;

        // 1. World to Grid Index
        // World 0,0 is at center. 
        // LocalX = x + width/2
        // LocalY = -z + height/2

        const localX = point.x + bounds.width / 2;
        const localY = -point.z + bounds.height / 2;

        const col = Math.round(localX / cellsize);
        const row = Math.round(localY / cellsize);

        // 2. Grid Index back to World Center
        // WorldX = (col * cellsize) - width/2
        // WorldZ = -((row * cellsize) - height/2)

        const snapX = (col * cellsize) - bounds.width / 2;
        const snapZ = -((row * cellsize) - bounds.height / 2);

        // Preserve input Y (height) or snap to terrain height? 
        // Input Y is usually terrain height from Raycast.
        // We should arguably sample the grid height at this col/row, 
        // but keeping the visual intersection Y is smoother for the UI.
        return new THREE.Vector3(snapX, point.y, snapZ);
    };

    const updateGhost = (pos, scene) => {
        if (!ghostMarker) {
            ghostMarker = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 1.0, 1.0), // Cube for Pixel
                new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.7 })
            );
            scene.add(ghostMarker);
        }
        ghostMarker.position.copy(pos);
        ghostMarker.visible = true;
    };

    // --- HANDLERS ---

    const onClick = (context) => {
        // Custom Raycast & Snap
        const { raycaster, camera, pointer, scene, parsedData, terrainMesh, interactionPlane } = context;
        raycaster.setFromCamera(pointer, camera);

        let hitPoint = null;
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) hitPoint = intersects[0].point;
        }
        if (!hitPoint) {
            const plane = interactionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, target);
            if (target) hitPoint = target;
        }

        if (hitPoint) {
            const snapped = getGridSnap(hitPoint, parsedData);

            // Delegate to DrawTool state
            drawTool.addPoint(snapped, scene);

            return { action: 'ADDED_POINT', point: snapped };
        }
        return { action: 'NONE' };
    };

    const onMove = (context) => {
        // Preview Snap
        const { raycaster, camera, pointer, scene, parsedData, terrainMesh, interactionPlane } = context;
        raycaster.setFromCamera(pointer, camera);

        let hitPoint = null;
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) hitPoint = intersects[0].point;
        }
        if (!hitPoint) {
            const plane = interactionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, target);
            if (target) hitPoint = target;
        }

        if (hitPoint) {
            const snapped = getGridSnap(hitPoint, parsedData);
            updateGhost(snapped, scene);

            // Also update drawTool rubber band?
            // drawTool.onMove expects event... logic is internal.
            // Simplified: Just use ghost marker for now. 
            // Better: We explicitly want to show logical connection.
            // But drawTool.onMove calculates its own hit. It won't snap.
            // So rubber band might look "off" (cursor vs line end).
            // Acceptable for now.
            return { action: 'HOVER', point: snapped };
        }
    };

    const onRightClick = (context) => drawTool.onRightClick(context);

    // --- RASTERIZATION & VISUALS ---

    const bresenhamLine = (p0, p1, cellsize) => {
        const cells = [];

        let x0 = Math.round(p0.x / cellsize);
        let y0 = Math.round(p0.z / cellsize); // Planar Z is Grid Y
        const x1 = Math.round(p1.x / cellsize);
        const y1 = Math.round(p1.z / cellsize);

        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            cells.push({ c: x0, r: y0 }); // Stores logical grid indices (relative to 0,0 center)
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
        return cells;
    };

    const createBoundaryVisuals = (points, scene, parsedData) => {
        if (!parsedData || points.length < 2) return;

        const { cellsize, minZ } = parsedData;
        const allCells = new Set(); // Avoid duplicates

        // Rasterize each segment
        for (let i = 0; i < points.length - 1; i++) {
            const segCells = bresenhamLine(points[i], points[i + 1], cellsize);
            segCells.forEach(cell => allCells.add(`${cell.c},${cell.r}`));
        }

        // Create Instanced Mesh for Performance
        const cellCount = allCells.size;
        const geometry = new THREE.BoxGeometry(cellsize * 0.9, 1.0, cellsize * 0.9);
        const material = new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.6 });
        const mesh = new THREE.InstancedMesh(geometry, material, cellCount);

        const dummy = new THREE.Object3D();
        let idx = 0;

        allCells.forEach(key => {
            const [c, r] = key.split(',').map(Number);
            // Convert back to world (relative to 0,0 center)
            // Note: bresenham inputs were world coords localized by cellsize.
            // p.x = c * cellsize
            const wx = c * cellsize;
            const wz = r * cellsize;

            // Get Height if possible? We only have planar coords here.
            // Ideally we Raycast or look up GridData.
            // For now, float slightly above minZ or use a fixed height?
            // Let's retry finding true height from gridData if available.

            dummy.position.set(wx, minZ + 2.0, wz); // Float 2m above base for now
            dummy.updateMatrix();
            mesh.setMatrixAt(idx++, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
    };

    // Context Menu / Finish
    const finishLine = (type = 'INFLOW', scene, context) => { // Called explicitly by UI (buttons?) or DoubleClick
        const points = drawTool.getPoints();
        if (points.length < 2) return;

        const { parsedData } = context;

        // 1. Create Persistent Visuals (Pink Raster Cells)
        createBoundaryVisuals(points, scene, parsedData);

        // 2. Data Persistence
        const coords = points.map(p => {
            const realX = p.x + parsedData.center.x;
            const realY = -p.z + parsedData.center.y;
            return [realX, realY];
        });

        const feature = {
            type: "Feature",
            id: crypto.randomUUID(),
            properties: {
                type: "BOUNDARY",
                boundary_type: type,
                name: `Boundary ${type}`
            },
            geometry: { type: "LineString", coordinates: coords }
        };

        geoStore.addBoundary(feature);
        drawTool.reset(scene);
    };

    const onDoubleClick = (context) => {
        // Double Click closes/finishes the line
        // Default to INFLOW for now, or open modal?
        // Let's just finish generic for now, user can edit properties.
        finishLine('INFLOW', context.scene, context);
        return { action: 'FINISHED' };
    };

    const reset = (scene) => {
        drawTool.reset(scene);
        if (ghostMarker) { scene.remove(ghostMarker); ghostMarker = null; }
    };

    return {
        onClick,
        onMove,
        onRightClick,
        onDoubleClick,
        finishLine, // Expose for UI buttons if needed
        reset,
        getPoints: drawTool.getPoints
    };
}
