import * as THREE from 'three';
import { ref } from 'vue';
import { useToolStateMachine, TOOL_STATE } from './useToolStateMachine.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';
import { computeExteriorMask, collectPerimeterCells, collectLiteralEdgeCells, findNearestPerimeterCell }
    from '@/features/flood-2D/utils/terrainFront.js';
import { buildOutflowBrushFeature } from '@/features/flood-2D/utils/outflowBrush.js';

// Toleranz beim Einrasten auf die nächste Randzelle (Zellen) — die literale Kante ist oft
// nur 1 Zelle breit, ein pixelgenauer Klick exakt darauf wäre kaum zu schaffen.
const SNAP_TOLERANCE_CELLS = 3;

/**
 * useOutflowPickerTool.js — Ablauf-Werkzeug als Klick-Picker (Vorbild: der bestehende
 * Zulauf-Ghost-Marker in useBoundaryTool.js, "eine Zelle leuchtet orange auf"), NICHT als
 * Pinsel. Ersetzt die frühere Kreis-Pinsel-Lösung (useOutflowBrushTool.js) komplett — die
 * InstancedMesh-Hover-Vorschau blieb trotz depthTest:false/frustumCulled:false unzuverlässig
 * genug, dass der Nutzer explizit zurück zum bewährten Einzel-Zellen-Picker wollte.
 *
 * Mechanik: Klick (oder Klick-und-Ziehen — beides fügt Punkte hinzu, "Polylinie durch
 * mehrere Randzellen") fügt Punkte hinzu, aber NUR wenn in der Nähe (SNAP_TOLERANCE_CELLS)
 * eine echte Rand-/Front-Zelle liegt (collectPerimeterCells) — jeder Treffer rastet auf GENAU
 * diese eine Zelle ein. Kein Kreis/Radius, keine InstancedMesh — jeder sichtbare Marker ist
 * ein einzelnes THREE.Mesh, exakt wie der bereits funktionierende Zulauf-Ghost (positioniert
 * an der ECHTEN Raycast-Trefferhöhe, nicht an einer flachen minZ+Offset-Höhe — deshalb kein
 * depthTest/frustumCulled-Sonderfall nötig).
 *
 * Kein eigenständiges Top-Level-Tool — wird intern von useBoundaryTool.js instanziiert und
 * bei Ablauf-Modus (boundaryMode==='OUTFLOW') durchgereicht. EIN Toolbar-Button ("Boundary"),
 * EIN Composable-Rückgabewert nach außen (BoundaryTool.vue).
 */
export function useOutflowPickerTool() {
    const geoStore = useGeoStore();
    const sm = useToolStateMachine();

    // Geklickte Randzellen — Array (Klick-Reihenfolge, für Undo/Feature-Geometrie) + Set
    // (O(1)-Membership, verhindert Doppel-Klicks auf dieselbe Zelle).
    let points = [];
    let pointKeys = new Set();
    const pointCount = ref(0);

    // Außen-NoData-Maske / Perimeter- / literale-Kanten-Menge — pro Terrain-Version einmal
    // berechnen (identisches Cache-Muster zu useBoundaryTool.js).
    let cachedMask = null, cachedMaskVersion = -1;
    let cachedPerimeter = null, cachedPerimeterVersion = -1;
    let cachedLiteralEdge = null, cachedLiteralEdgeVersion = -1;

    const getExteriorMask = (gridData, header) => {
        if (cachedMask && cachedMaskVersion === geoStore.terrainVersion) return cachedMask;
        cachedMask = computeExteriorMask(gridData, header);
        cachedMaskVersion = geoStore.terrainVersion;
        return cachedMask;
    };
    const getPaintableCells = (gridData, header) => {
        if (cachedPerimeter && cachedPerimeterVersion === geoStore.terrainVersion) return cachedPerimeter;
        const mask = getExteriorMask(gridData, header);
        cachedPerimeter = collectPerimeterCells(gridData, header, mask);
        cachedPerimeterVersion = geoStore.terrainVersion;
        return cachedPerimeter;
    };
    const getLiteralEdgeCells = (gridData, header) => {
        if (cachedLiteralEdge && cachedLiteralEdgeVersion === geoStore.terrainVersion) return cachedLiteralEdge;
        cachedLiteralEdge = collectLiteralEdgeCells(gridData, header);
        cachedLiteralEdgeVersion = geoStore.terrainVersion;
        return cachedLiteralEdge;
    };

    // Visuals — jeweils einzelne THREE.Mesh (kein InstancedMesh), wie der Zulauf-Ghost.
    let ghostMarker = null;       // Hover: die Zelle, die ein Klick JETZT hinzufügen würde
    let pointMarkers = [];        // Ein Mesh je bereits gesetztem Punkt
    let sceneRef = null;
    let pendingParsedData = null;
    let isDragging = false;       // gehaltene linke Taste: Ziehen fügt weitere Zellen an (Polylinie)

    const header = (parsedData) => {
        const { cellsize, bounds, ncols, nrows } = parsedData;
        return {
            ncols, nrows, cellsize,
            xllcorner: parsedData.center.x - bounds.width / 2,
            yllcorner: parsedData.center.y - bounds.height / 2,
        };
    };

    // Welt-/Mesh-lokaler Treffer → Rasterzelle (col,row). null = außerhalb des Rasters.
    // Identische Konvention zu useBoundaryTool.js getGridSnap (mesh-lokal ≈ world, s. dort).
    const getGridCell = (point, parsedData, terrainMesh) => {
        if (!parsedData) return null;
        const { cellsize, bounds, ncols, nrows } = parsedData;
        let lx, ly;
        if (terrainMesh) {
            const lp = terrainMesh.worldToLocal(point.clone());
            lx = lp.x; ly = lp.y;
        } else {
            lx = point.x; ly = -point.z;
        }
        const col = Math.round((lx + bounds.width / 2) / cellsize);
        const row = Math.round((ly + bounds.height / 2) / cellsize);
        if (col < 0 || col >= ncols || row < 0 || row >= nrows) return null;
        return { col, row };
    };

    // Rasterzelle → mesh-lokale Position (Zellzentrum). y wird vom Aufrufer übergeben (die
    // ECHTE Raycast-Trefferhöhe an dieser Stelle — kein flacher minZ-Offset).
    const cellToLocalPos = (col, row, parsedData, y) => {
        const { cellsize, bounds } = parsedData;
        const x = (col * cellsize) - bounds.width / 2;
        const z = -((row * cellsize) - bounds.height / 2);
        return new THREE.Vector3(x, y, z);
    };

    const raycastHit = ({ raycaster, camera, pointer, terrainMesh, interactionPlane }) => {
        raycaster.setFromCamera(pointer, camera);
        if (terrainMesh) {
            const intersects = raycaster.intersectObject(terrainMesh);
            if (intersects.length > 0) return intersects[0].point;
            return null; // kein Ebenen-Fallback — sonst Zellen neben dem Raster/in NoData
        }
        const plane = interactionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, target) ? target : null;
    };

    // Nächste Randzelle zu `cell`, aber nur wenn innerhalb der Einrast-Toleranz — sonst null
    // (Klick/Hover zu weit von jeder echten Rand-/Front-Zelle entfernt, wird ignoriert).
    const findSnapCell = (cell, paintable) => {
        const nearest = findNearestPerimeterCell(cell.col, cell.row, paintable);
        if (!nearest) return null;
        const dc = nearest.col - cell.col, dr = nearest.row - cell.row;
        if (dc * dc + dr * dr > SNAP_TOLERANCE_CELLS * SNAP_TOLERANCE_CELLS) return null;
        return nearest;
    };

    // --- Visuals ---

    const updateGhost = (pos, scene) => {
        if (!ghostMarker) {
            ghostMarker = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 1.0, 1.0),
                new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0.75 })
            );
            scene.add(ghostMarker);
        }
        if (ghostMarker.parent !== scene) scene.add(ghostMarker);
        ghostMarker.position.copy(pos);
        ghostMarker.visible = true;
    };
    const hideGhost = () => { if (ghostMarker) ghostMarker.visible = false; };

    const addPointMarker = (col, row, parsedData, scene, y) => {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(parsedData.cellsize * 0.9, 1.0, parsedData.cellsize * 0.9),
            new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.6 })
        );
        mesh.position.copy(cellToLocalPos(col, row, parsedData, y));
        scene.add(mesh);
        pointMarkers.push(mesh);
    };
    const removeLastPointMarker = (scene) => {
        const m = pointMarkers.pop();
        if (!m) return;
        (scene || sceneRef)?.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
    };
    const clearPointMarkers = (scene) => {
        for (const m of pointMarkers) {
            (scene || sceneRef)?.remove(m);
            m.geometry?.dispose?.();
            m.material?.dispose?.();
        }
        pointMarkers = [];
    };

    // --- HANDLERS ---

    // Gemeinsame "füge die gerade getroffene Randzelle hinzu"-Logik — von onClick UND
    // onMouseDown/onMove-während-Ziehen genutzt, damit sowohl Einzel-Klicks als auch ein
    // durchgehender Zug entlang des Randes ("Polylinie") funktionieren.
    const tryAddPoint = (context) => {
        const { scene, parsedData, terrainMesh } = context;
        sceneRef = scene;
        if (parsedData) pendingParsedData = parsedData;
        if (!parsedData?.gridData) return false;

        const hit = raycastHit(context);
        if (!hit) return false;
        const cell = getGridCell(hit, parsedData, terrainMesh);
        if (!cell) return false;

        const h = header(parsedData);
        const paintable = getPaintableCells(parsedData.gridData, h);
        const snapped = findSnapCell(cell, paintable);
        if (!snapped) return false; // keine Randzelle in der Nähe

        const key = `${snapped.col},${snapped.row}`;
        if (pointKeys.has(key)) return false; // schon gesetzt
        pointKeys.add(key);
        points.push(snapped);
        pointCount.value = points.length;
        addPointMarker(snapped.col, snapped.row, parsedData, scene, hit.y);
        sm.setDrawing();
        return true;
    };

    const onClick = (context) => {
        if (sm.state.value === TOOL_STATE.REVIEW) return { action: 'NONE' };
        return tryAddPoint(context) ? { action: 'ADDED_POINT' } : { action: 'NONE' };
    };

    const onMove = (context) => {
        if (sm.state.value === TOOL_STATE.REVIEW) return;
        const { scene, parsedData, terrainMesh, event } = context;
        sceneRef = scene;
        if (!parsedData?.gridData) { hideGhost(); return; }

        const hit = raycastHit(context);
        if (!hit) { hideGhost(); return; }
        const cell = getGridCell(hit, parsedData, terrainMesh);
        if (!cell) { hideGhost(); return; }

        const h = header(parsedData);
        const paintable = getPaintableCells(parsedData.gridData, h);
        const snapped = findSnapCell(cell, paintable);
        if (!snapped) { hideGhost(); return; } // Cursor zu weit von jeder Randzelle — kein Hover

        const pos = cellToLocalPos(snapped.col, snapped.row, parsedData, hit.y);
        updateGhost(pos, scene);

        // Gehaltene linke Taste: wie eine Polylinie weiterziehen — jede neu erreichte
        // Randzelle wird automatisch mit aufgenommen (kein Klick pro Zelle nötig).
        if (isDragging && event && (event.buttons & 1)) tryAddPoint(context);
    };

    const onMouseDown = (context) => {
        if (context?.event && context.event.button !== 0) return undefined;
        if (sm.state.value === TOOL_STATE.REVIEW) return undefined;
        isDragging = true;
        tryAddPoint(context);
        return undefined;
    };
    const onMouseUp = () => { isDragging = false; };

    const undoLast = () => {
        if (points.length === 0) return;
        const last = points.pop();
        pointKeys.delete(`${last.col},${last.row}`);
        pointCount.value = points.length;
        removeLastPointMarker(sceneRef);
        if (points.length === 0) sm.setIdle();
    };

    const cancelOrAbort = () => {
        isDragging = false;
        hideGhost();
        clearPointMarkers(sceneRef);
        points = [];
        pointKeys = new Set();
        pointCount.value = 0;
        sm.setIdle();
    };

    const onRightClick = (context) => {
        sceneRef = context?.scene || sceneRef;
        cancelOrAbort();
        return { action: 'RESET' };
    };

    const enterReview = () => {
        if (points.length === 0) return { action: 'NONE' };
        sm.setReview();
        return { action: 'REVIEW' };
    };
    const onDoubleClick = () => enterReview();

    const commit = () => {
        isDragging = false;
        if (sm.state.value !== TOOL_STATE.REVIEW || !pendingParsedData?.gridData) return;
        const h = header(pendingParsedData);
        const literalEdgeSet = getLiteralEdgeCells(pendingParsedData.gridData, h);
        const feature = buildOutflowBrushFeature(points, h, pendingParsedData.gridData, { literalEdgeSet });
        if (!feature) { cancel(); return; }

        geoStore.addBoundary(feature);
        // Vorschau-Marker aus der Szene entfernen — die persistente, reload-feste Darstellung
        // übernimmt useLayerRenderer.js separat (eigene boundaryGroup) beim nächsten Rebuild.
        // VORHER (Bug, 2026-07-23): hier stand nur `pointMarkers = []`, ohne scene.remove()/
        // dispose() — die Zellen-Boxen blieben für immer als Scene-Kinder liegen (Speicherleck;
        // bei breiten Selektionen sah der angesammelte Block wie eine feste Fläche/„Polygon" aus).
        clearPointMarkers(sceneRef);
        points = [];
        pointKeys = new Set();
        pointCount.value = 0;
        hideGhost();
        pendingParsedData = null;
        sm.setIdle();
    };

    const cancel = () => { cancelOrAbort(); pendingParsedData = null; };

    const reset = (scene) => {
        isDragging = false;
        const s = scene || sceneRef;
        if (s && ghostMarker) s.remove(ghostMarker);
        ghostMarker = null;
        clearPointMarkers(s);
        points = [];
        pointKeys = new Set();
        pointCount.value = 0;
        pendingParsedData = null;
        sm.setIdle();
    };

    const activate = (scene) => {
        sceneRef = scene;
        sm.setIdle();
        sm.attachShortcuts({
            onCancel: cancelOrAbort,
            onConfirm: enterReview,
            onUndo: undoLast,
        });
    };
    const deactivate = (scene) => {
        sm.detachShortcuts();
        reset(scene);
    };

    return {
        state: sm.state,
        pointCount,
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
        getPoints: () => points,
    };
}
