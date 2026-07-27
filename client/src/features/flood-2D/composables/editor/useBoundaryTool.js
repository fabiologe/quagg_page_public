import * as THREE from 'three';
import { ref } from 'vue';
import { useDrawTool } from './useDrawTool.js';
import { useToolStateMachine, TOOL_STATE } from './useToolStateMachine.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { snapToNearestEdge } from '@/features/flood-2D/utils/boundarySegments.js';
import { useOutflowPickerTool } from './useOutflowPickerTool.js';

const EDGE_LABEL = { N: 'Nord', S: 'Süd', E: 'Ost', W: 'West' };

/**
 * useBoundaryTool.js — EIN Tool/EIN Toolbar-Button für Zulauf UND Ablauf: `boundaryMode`
 * ('INFLOW'|'OUTFLOW') schaltet intern zwischen zwei komplett verschiedenen Mechaniken um —
 * Zulauf bleibt die Polylinie (Innenquelle mit optionaler Fließrichtung ODER echtes
 * Kanten-Segment), Ablauf nutzt den Klick-Picker aus useOutflowPickerTool.js (klickt echte
 * Rand-/Front-Zellen einzeln an, mit Einrast-Toleranz — kein Pinsel/Ziehen mehr). Die
 * Umschaltung passiert HIER im Composable (nicht in MapEditor3D.vue) — MapEditor3D.vue
 * sieht nur ein einziges Tool-Objekt, wie jedes andere Tool auch.
 */
export function useBoundaryTool() {

    // Initialize DrawTool in "Polyline" mode (no auto-close)
    const drawTool = useDrawTool({ isPolygon: false });
    const geoStore = useGeoStore();

    // Lifecycle state machine (IDLE → DRAWING → REVIEW) — nur für den Zulauf-Zweig.
    const sm = useToolStateMachine();

    // Ablauf-Klick-Picker (eigene Datei/eigener State — s. useOutflowPickerTool.js).
    const brush = useOutflowPickerTool();

    // Zulauf/Ablauf-Modus — persistiert über activate/deactivate.
    const boundaryMode = ref('INFLOW'); // 'INFLOW' | 'OUTFLOW'

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

    // --- ZULAUF-HANDLER (Polylinie) ---

    const onClickInflow = (context) => {
        // Während REVIEW keine neuen Punkte annehmen
        if (sm.state.value === TOOL_STATE.REVIEW) return { action: 'NONE' };

        // Custom Raycast & Snap
        const { raycaster, camera, pointer, scene, parsedData, terrainMesh, interactionPlane } = context;
        sceneRef = scene;
        if (parsedData) pendingParsedData = parsedData; // für Enter-Taste / commit cachen
        raycaster.setFromCamera(pointer, camera);

        let hitPoint = null;
        if (terrainMesh) {
            // Nur echte Terrain-Treffer zählen — kein Ebenen-Fallback, sonst
            // landen Punkte neben dem Raster oder in NODATA-Löchern im Store.
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) hitPoint = intersects[0].point;
        } else {
            const plane = interactionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, target)) hitPoint = target;
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

    const onMoveInflow = (context) => {
        // Während REVIEW keine Hover-Vorschau zeichnen
        if (sm.state.value === TOOL_STATE.REVIEW) return;

        // Preview Snap
        const { raycaster, camera, pointer, scene, parsedData, terrainMesh, interactionPlane } = context;
        sceneRef = scene;
        raycaster.setFromCamera(pointer, camera);

        let hitPoint = null;
        if (terrainMesh) {
            // Nur echte Terrain-Treffer (siehe onClick) — kein Ebenen-Fallback.
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) hitPoint = intersects[0].point;
        } else {
            const plane = interactionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            if (raycaster.ray.intersectPlane(plane, target)) hitPoint = target;
        }

        if (hitPoint) {
            const snapped = getGridSnap(hitPoint, parsedData, terrainMesh);
            if (!snapped) {
                if (ghostMarker) ghostMarker.visible = false;
                return;
            }
            updateGhost(snapped, scene);
            return { action: 'HOVER', point: snapped };
        }
        if (ghostMarker) ghostMarker.visible = false;
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

            dummy.position.set(wx, minZ + 2.0, wz); // Float 2m above base for now
            dummy.updateMatrix();
            mesh.setMatrixAt(idx++, dummy.matrix);
        });

        mesh.instanceMatrix.needsUpdate = true;
        scene.add(mesh);
        return mesh;
    };

    // --- ZULAUF-LIFECYCLE (IDLE → DRAWING → REVIEW → IDLE) ---

    // Schließt das Zeichnen ab und wechselt in die Vorschau (REVIEW).
    // Schreibt NICHT in den Store — das passiert erst bei commit().
    const enterReviewInflow = (context) => {
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
    const commitInflow = () => {
        if (sm.state.value !== TOOL_STATE.REVIEW || !pendingParsedData) return;
        const points = drawTool.getPoints();
        if (points.length < 2) { cancelInflow(); return; }

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

        const name = edge ? `Zulauf (Kante ${EDGE_LABEL[edge]})` : 'Zulauf (innen)';

        const feature = {
            type: "Feature",
            id: crypto.randomUUID(),
            properties: {
                type: "BOUNDARY",
                boundary_type: 'INFLOW', // Vorbelegung für BoundaryConfig.vue, frei änderbar
                name,
                edge, // 'N'|'S'|'E'|'W' = Kanten-Segment; null = Innenquelle
            },
            geometry: { type: "LineString", coordinates: coords }
        };

        geoStore.addBoundary(feature);

        // Vorschau-Mesh aus der Szene entfernen — die persistente, reload-feste Darstellung
        // übernimmt useLayerRenderer.js separat (eigene boundaryGroup) beim nächsten Rebuild.
        // VORHER (Bug, 2026-07-23): das Mesh wurde nur mit boundaryFeatureId getaggt und die
        // Referenz genullt, OHNE scene.remove()/dispose() — kein Aufräum-Pfad liest dieses Tag
        // je aus, das Mesh blieb für immer als Scene-Kind liegen (Speicherleck).
        if (previewMesh && sceneRef) {
            sceneRef.remove(previewMesh);
            previewMesh.geometry?.dispose?.();
            previewMesh.material?.dispose?.();
        }
        previewMesh = null;
        if (sceneRef) drawTool.reset(sceneRef);
        cleanupGhost();
        pendingParsedData = null;
        sm.setIdle();
    };

    // Verwirft die Vorschau ohne zu speichern, Tool zurück auf IDLE.
    const cancelInflow = () => {
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
    const abortDrawingInflow = () => {
        if (sceneRef) drawTool.reset(sceneRef);
        cleanupGhost();
        sm.setIdle();
    };

    // Escape: im REVIEW verwerfen, im DRAWING abbrechen
    const cancelOrAbortInflow = () => {
        if (sm.state.value === TOOL_STATE.REVIEW) cancelInflow();
        else if (sm.state.value === TOOL_STATE.DRAWING) abortDrawingInflow();
    };

    const cleanupGhost = () => {
        if (ghostMarker && sceneRef) sceneRef.remove(ghostMarker);
        ghostMarker = null;
    };

    const onDoubleClickInflow = (context) => {
        sceneRef = context.scene;
        return enterReviewInflow(context);
    };

    const onRightClickInflow = (context) => {
        sceneRef = context?.scene || sceneRef;
        cancelOrAbortInflow();
        return { action: 'RESET' };
    };

    const resetInflow = (scene) => {
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

    const activateInflow = (scene) => {
        sceneRef = scene;
        sm.setIdle();
        sm.attachShortcuts({
            onCancel: cancelOrAbortInflow,
            onConfirm: () => enterReviewInflow(),
            onUndo: () => drawTool.removeLastPoint(sceneRef),
        });
    };

    const deactivateInflow = (scene) => {
        sm.detachShortcuts();
        resetInflow(scene);
    };

    // --- ÖFFENTLICHE API: dispatcht je nach boundaryMode an Zulauf-Polylinie oder
    // Ablauf-Picker (useOutflowPickerTool.js). MapEditor3D.vue sieht nur DIESES eine Tool. ---

    const setBoundaryMode = (m) => {
        if (m !== 'INFLOW' && m !== 'OUTFLOW') return;
        if (boundaryMode.value === m) return;
        // Abbrechen, was im bisherigen Modus gerade in Arbeit war, und dessen Shortcuts lösen.
        if (boundaryMode.value === 'OUTFLOW') brush.deactivate(sceneRef);
        else deactivateInflow(sceneRef);
        boundaryMode.value = m;
        // Neuen Modus aktivieren (Shortcuts binden, Zustand auf IDLE).
        if (m === 'OUTFLOW') brush.activate(sceneRef);
        else activateInflow(sceneRef);
    };

    const onClick = (context) => (boundaryMode.value === 'OUTFLOW' ? brush.onClick(context) : onClickInflow(context));
    const onMove = (context) => (boundaryMode.value === 'OUTFLOW' ? brush.onMove(context) : onMoveInflow(context));
    const onMouseDown = (context) => (boundaryMode.value === 'OUTFLOW' ? brush.onMouseDown(context) : undefined);
    const onMouseUp = (context) => (boundaryMode.value === 'OUTFLOW' ? brush.onMouseUp(context) : undefined);
    const onRightClick = (context) => (boundaryMode.value === 'OUTFLOW' ? brush.onRightClick(context) : onRightClickInflow(context));
    const onDoubleClick = (context) => (boundaryMode.value === 'OUTFLOW' ? brush.onDoubleClick(context) : onDoubleClickInflow(context));
    const commit = () => (boundaryMode.value === 'OUTFLOW' ? brush.commit() : commitInflow());
    const cancel = () => (boundaryMode.value === 'OUTFLOW' ? brush.cancel() : cancelInflow());
    const reset = (scene) => { resetInflow(scene); brush.reset(scene); };
    const getPoints = () => (boundaryMode.value === 'OUTFLOW' ? brush.getPoints() : drawTool.getPoints());

    const activate = (scene) => {
        sceneRef = scene;
        if (boundaryMode.value === 'OUTFLOW') brush.activate(scene);
        else activateInflow(scene);
    };
    const deactivate = (scene) => {
        if (boundaryMode.value === 'OUTFLOW') brush.deactivate(scene);
        else deactivateInflow(scene);
    };

    return {
        get state() { return boundaryMode.value === 'OUTFLOW' ? brush.state : sm.state; },
        mode: boundaryMode,
        setMode: setBoundaryMode,
        get pointCount() { return brush.pointCount; },
        onClick,
        onMove,
        onMouseDown,
        onMouseUp,
        onRightClick,
        onDoubleClick,
        activate,
        deactivate,
        commit,
        cancel,
        reset,
        getPoints,
    };
}
