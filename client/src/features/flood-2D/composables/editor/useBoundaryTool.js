import * as THREE from 'three';
import { useDrawTool } from './useDrawTool.js';
import { useToolStateMachine, TOOL_STATE } from './useToolStateMachine.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { snapToNearestEdge } from '@/features/flood-2D/utils/boundarySegments.js';

export function useBoundaryTool() {

    // Initialize DrawTool in "Polyline" mode (no auto-close)
    const drawTool = useDrawTool({ isPolygon: false });
    const geoStore = useGeoStore();

    // Lifecycle state machine (IDLE → DRAWING → REVIEW)
    const sm = useToolStateMachine();

    // Visuals
    let ghostMarker = null;
    let previewMesh = null;        // Vorschau-Rasterzellen während REVIEW

    // Cached context for keyboard callbacks (which carry no event context)
    let sceneRef = null;
    let pendingParsedData = null;  // für commit() benötigte Geo-Metadaten

    // --- HELPER: Grid Snapping ---
    // Liefert null, wenn der Punkt außerhalb des Rasters liegt.
    const getGridSnap = (point, parsedData, terrainMesh = null) => {
        if (!parsedData) return point;

        const { cellsize, bounds, ncols, nrows } = parsedData;

        // 1. World to Grid Index
        // Mesh-lokal rechnen, damit ein verschobenes/skaliertes Terrain-Mesh
        // nicht zu falschen Indizes führt. Mesh ist um -PI/2 (X) rotiert:
        // local.x = world.x, local.y = -world.z (solange Mesh im Ursprung).
        let lx, ly;
        if (terrainMesh) {
            const lp = terrainMesh.worldToLocal(point.clone());
            lx = lp.x;
            ly = lp.y;
        } else {
            lx = point.x;
            ly = -point.z;
        }

        const localX = lx + bounds.width / 2;
        const localY = ly + bounds.height / 2;

        const col = Math.round(localX / cellsize);
        const row = Math.round(localY / cellsize);

        // Punkte außerhalb des Rasters ablehnen (z. B. Plane-Fallback-Treffer
        // neben dem Gelände) — sonst landen ungültige Zellen im Store.
        if (col < 0 || col >= ncols || row < 0 || row >= nrows) return null;

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
        // Während REVIEW keine neuen Punkte annehmen
        if (sm.state.value === TOOL_STATE.REVIEW) return { action: 'NONE' };

        // Custom Raycast & Snap
        const { raycaster, camera, pointer, scene, parsedData, terrainMesh, interactionPlane } = context;
        sceneRef = scene;
        if (parsedData) pendingParsedData = parsedData; // für Enter-Taste / commit cachen
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
            const snapped = getGridSnap(hitPoint, parsedData, terrainMesh);
            if (!snapped) return { action: 'NONE' }; // außerhalb des Rasters

            // Delegate to DrawTool state
            drawTool.addPoint(snapped, scene);
            sm.setDrawing();

            return { action: 'ADDED_POINT', point: snapped };
        }
        return { action: 'NONE' };
    };

    const onMove = (context) => {
        // Während REVIEW keine Hover-Vorschau zeichnen
        if (sm.state.value === TOOL_STATE.REVIEW) return;

        // Preview Snap
        const { raycaster, camera, pointer, scene, parsedData, terrainMesh, interactionPlane } = context;
        sceneRef = scene;
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
            const snapped = getGridSnap(hitPoint, parsedData, terrainMesh);
            if (!snapped) {
                if (ghostMarker) ghostMarker.visible = false;
                return;
            }
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

    const onRightClick = (context) => {
        sceneRef = context?.scene || sceneRef;
        cancelOrAbort();
        return { action: 'RESET' };
    };

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
        return mesh;
    };

    // --- LIFECYCLE TRANSITIONS (IDLE → DRAWING → REVIEW → IDLE) ---

    // Schließt das Zeichnen ab und wechselt in die Vorschau (REVIEW).
    // Schreibt NICHT in den Store — das passiert erst bei commit().
    const enterReview = (context) => {
        if (sm.state.value !== TOOL_STATE.DRAWING) return { action: 'NONE' };
        const points = drawTool.getPoints();
        if (points.length < 2) return { action: 'NONE' };

        const scene = context?.scene || sceneRef;
        const parsedData = context?.parsedData || pendingParsedData;
        if (!scene || !parsedData) return { action: 'NONE' };

        sceneRef = scene;
        pendingParsedData = parsedData;

        // Vorschau-Rasterzellen aufbauen (gemerkt, damit cancel sie entfernen kann)
        if (previewMesh) { scene.remove(previewMesh); previewMesh = null; }
        previewMesh = createBoundaryVisuals(points, scene, parsedData);
        if (ghostMarker) ghostMarker.visible = false;

        sm.setReview();
        return { action: 'REVIEW' };
    };

    // Übernimmt die Vorschau: Feature in den Store schreiben, Vorschau bleibt als
    // persistente Visualisierung stehen, Tool zurück auf IDLE.
    const commit = () => {
        if (sm.state.value !== TOOL_STATE.REVIEW || !pendingParsedData) return;
        const points = drawTool.getPoints();
        if (points.length < 2) { cancel(); return; }

        let coords = points.map(p => {
            const realX = p.x + pendingParsedData.center.x;
            const realY = -p.z + pendingParsedData.center.y;
            return [realX, realY];
        });

        // Auto-Snap an die nächste Rasterkante: liegt die Linie nahe genug an einer
        // Modellkante, wird sie zum Kanten-SEGMENT (properties.edge) → nativer
        // N/S/E/W-Rand mit Impuls. Sonst edge=null = richtungslose Innenquelle.
        // Header-Konvention konsistent zu getGridSnap: xll = center.x - width/2.
        const { cellsize, bounds, ncols, nrows } = pendingParsedData;
        const header = {
            ncols, nrows, cellsize,
            xllcorner: pendingParsedData.center.x - bounds.width / 2,
            yllcorner: pendingParsedData.center.y - bounds.height / 2,
        };
        const { edge, snappedCoords } = snapToNearestEdge(coords, header, 1.5);
        if (edge) coords = snappedCoords;

        const feature = {
            type: "Feature",
            id: crypto.randomUUID(),
            properties: {
                type: "BOUNDARY",
                boundary_type: 'INFLOW',
                name: edge ? `Boundary (Kante ${edge})` : `Boundary (innen)`,
                edge, // 'N'|'S'|'E'|'W' = Kanten-Segment; null = Innenquelle
            },
            geometry: { type: "LineString", coordinates: coords }
        };

        geoStore.addBoundary(feature);

        // Vorschau-Mesh bleibt in der Szene (wird zur persistenten Anzeige);
        // Feature-ID taggen, damit es beim Löschen der Boundary auffindbar ist.
        if (previewMesh) previewMesh.userData.boundaryFeatureId = feature.id;
        previewMesh = null;
        if (sceneRef) drawTool.reset(sceneRef);
        cleanupGhost();
        pendingParsedData = null;
        sm.setIdle();
    };

    // Verwirft die Vorschau ohne zu speichern, Tool zurück auf IDLE.
    const cancel = () => {
        const scene = sceneRef;
        if (previewMesh && scene) {
            scene.remove(previewMesh);
            previewMesh.geometry?.dispose?.();
            previewMesh.material?.dispose?.();
        }
        previewMesh = null;
        if (scene) drawTool.reset(scene);
        cleanupGhost();
        pendingParsedData = null;
        sm.setIdle();
    };

    // Bricht eine laufende Zeichnung (DRAWING) ab, ohne in REVIEW zu gehen.
    const abortDrawing = () => {
        if (sceneRef) drawTool.reset(sceneRef);
        cleanupGhost();
        sm.setIdle();
    };

    // Escape: im REVIEW verwerfen, im DRAWING abbrechen
    const cancelOrAbort = () => {
        if (sm.state.value === TOOL_STATE.REVIEW) cancel();
        else if (sm.state.value === TOOL_STATE.DRAWING) abortDrawing();
    };

    const cleanupGhost = () => {
        if (ghostMarker && sceneRef) sceneRef.remove(ghostMarker);
        ghostMarker = null;
    };

    const onDoubleClick = (context) => {
        sceneRef = context.scene;
        return enterReview(context);
    };

    const reset = (scene) => {
        const s = scene || sceneRef;
        if (s) drawTool.reset(s);
        if (previewMesh && s) {
            s.remove(previewMesh);
            previewMesh.geometry?.dispose?.();
            previewMesh.material?.dispose?.();
        }
        previewMesh = null;
        if (ghostMarker && s) { s.remove(ghostMarker); }
        ghostMarker = null;
        pendingParsedData = null;
        sm.setIdle();
    };

    // --- LIFECYCLE: activate / deactivate (vom MapEditor3D-Watcher aufgerufen) ---

    const activate = (scene) => {
        sceneRef = scene;
        sm.setIdle();
        sm.attachShortcuts({
            onCancel: cancelOrAbort,
            onConfirm: () => enterReview(),
            onUndo: () => drawTool.removeLastPoint(sceneRef),
        });
    };

    const deactivate = (scene) => {
        sm.detachShortcuts();
        reset(scene);
    };

    return {
        state: sm.state,
        onClick,
        onMove,
        onRightClick,
        onDoubleClick,
        activate,
        deactivate,
        commit,
        cancel,
        reset,
        getPoints: drawTool.getPoints
    };
}
