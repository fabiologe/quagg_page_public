import { ref } from 'vue';
import * as THREE from 'three';
import { useToolStateMachine } from './useToolStateMachine.js';

export function useBridgeTool() {
    let cursorMesh    = null;
    let previewGroup  = null;
    let startPoint    = null;
    let sceneRef      = null;
    const previewPool = [];

    // Lifecycle state machine: IDLE → DRAWING (Startpunkt gesetzt) → IDLE (2. Klick)
    const sm = useToolStateMachine();

    const createCursor = (color = 0xe74c3c) => {
        const geometry = new THREE.PlaneGeometry(1.0, 1.0);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.65,
            side: THREE.DoubleSide,
            wireframe: false,
            depthTest: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    };

    // Vorschau-Zellen ins Pool zurücklegen (wiederverwendet)
    const recyclePreview = () => {
        if (!previewGroup) return;
        while (previewGroup.children.length > 0) {
            const c = previewGroup.children[0];
            previewGroup.remove(c);
            previewPool.push(c);
        }
    };

    // Laufende Achse abbrechen → zurück nach IDLE (Escape / Backspace / reset)
    const clearAxis = () => {
        startPoint = null;
        recyclePreview();
        if (cursorMesh) cursorMesh.visible = false;
        sm.setIdle();
    };

    const activate = (scene) => {
        sceneRef = scene;
        if (!cursorMesh)    cursorMesh   = createCursor();
        if (!previewGroup) {
            previewGroup = new THREE.Group();
            previewGroup.renderOrder = 998;
        }
        scene.add(cursorMesh);
        scene.add(previewGroup);
        sm.setIdle();
        // Escape/Backspace brechen die halb gezeichnete Achse ab
        sm.attachShortcuts({ onCancel: clearAxis, onUndo: clearAxis });
    };

    const deactivate = (scene) => {
        sm.detachShortcuts();
        if (cursorMesh) { scene.remove(cursorMesh); cursorMesh.visible = false; }
        if (previewGroup) {
            scene.remove(previewGroup);
            recyclePreview();
        }
        startPoint = null;
        sm.setIdle();
    };

    const reset = (scene) => { sceneRef = scene || sceneRef; clearAxis(); };

    // Bresenham 4-connected line (identical to useWeirTool)
    function getLineCells(c0, r0, c1, r1) {
        const dx = Math.abs(c1 - c0);
        const dy = -Math.abs(r1 - r0);
        const sx = c0 < c1 ? 1 : -1;
        const sy = r0 < r1 ? 1 : -1;
        let err = dx + dy;
        let c = c0, r = r0;
        const cells = [];
        while (true) {
            cells.push({ col: c, row: r });
            if (c === c1 && r === r1) break;
            const e2 = 2 * err;
            if (e2 > dy && e2 < dx) {
                err += dy; c += sx;
                cells.push({ col: c, row: r });
                err += dx; r += sy;
            } else if (e2 > dy) {
                err += dy; c += sx;
            } else if (e2 < dx) {
                err += dx; r += sy;
            }
        }
        return cells;
    }

    const onMove = ({ raycaster, camera, pointer, scene, terrainMesh, parsedData }) => {
        if (!terrainMesh || !parsedData) return;
        sceneRef = scene || sceneRef;
        if (!cursorMesh && scene) activate(scene);

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(terrainMesh, false);
        if (!intersects.length) { if (cursorMesh) cursorMesh.visible = false; return; }

        const hitPoint = intersects[0].point;
        const { cellsize, ncols, nrows } = parsedData;
        const offsetX = ((ncols - 1) * cellsize) / 2;
        const offsetY = ((nrows - 1) * cellsize) / 2;

        const local = terrainMesh.worldToLocal(hitPoint.clone());
        const col = Math.floor((local.x + offsetX + cellsize * 0.5) / cellsize);
        const row = Math.floor((local.y + offsetY + cellsize * 0.5) / cellsize);

        if (col < 0 || col >= ncols || row < 0 || row >= nrows) {
            cursorMesh.visible = false;
            return;
        }

        if (startPoint) {
            cursorMesh.visible = false;
            recyclePreview();
            const cells = getLineCells(startPoint.col, startPoint.row, col, row);
            cells.forEach(cell => {
                let mesh = previewPool.length > 0 ? previewPool.pop() : createCursor(0xe74c3c);
                const cX = cell.col * cellsize - offsetX;
                const cY = cell.row * cellsize - offsetY;
                const idx = cell.row * ncols + cell.col;
                let z = parsedData.gridData[idx];
                if (z < -9000) z = parsedData.minZ;

                const world = terrainMesh.localToWorld(new THREE.Vector3(cX, cY, z - parsedData.minZ));
                mesh.position.copy(world);
                mesh.position.y += 0.4;
                mesh.scale.set(cellsize, cellsize, 1);
                mesh.visible = true;
                previewGroup.add(mesh);
            });
        } else {
            const cX = col * cellsize - offsetX;
            const cY = row * cellsize - offsetY;
            const idx = row * ncols + col;
            let z = parsedData.gridData[idx];
            if (z < -9000) z = parsedData.minZ;

            const world = terrainMesh.localToWorld(new THREE.Vector3(cX, cY, z - parsedData.minZ));
            cursorMesh.position.copy(world);
            cursorMesh.position.y += 0.4;
            cursorMesh.scale.set(cellsize, cellsize, 1);
            cursorMesh.visible = true;
        }
    };

    /**
     * @param {object} ctx
     * @param {object} bridgeParams - { soffit, deck, width, Cd, z_sohle }
     */
    const onClick = ({ raycaster, camera, pointer, scene, terrainMesh, parsedData }, bridgeParams = {}) => {
        if (!terrainMesh || !parsedData) return;
        sceneRef = scene || sceneRef;

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(terrainMesh, false);
        if (!intersects.length) return;

        const hitPoint = intersects[0].point;
        const { cellsize, ncols, nrows, center, minZ, gridData } = parsedData;
        const offsetX = ((ncols - 1) * cellsize) / 2;
        const offsetY = ((nrows - 1) * cellsize) / 2;

        const local = terrainMesh.worldToLocal(hitPoint.clone());
        const col = Math.floor((local.x + offsetX + cellsize * 0.5) / cellsize);
        const row = Math.floor((local.y + offsetY + cellsize * 0.5) / cellsize);

        if (col < 0 || col >= ncols || row < 0 || row >= nrows) return;

        if (!startPoint) {
            startPoint = { col, row };
            sm.setDrawing();
            return;
        }

        const cells = getLineCells(startPoint.col, startPoint.row, col, row);
        const lineId = `bridge_${Date.now()}`;
        const segments = [];

        for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const cX = cell.col * cellsize - offsetX;
            const cY = cell.row * cellsize - offsetY;
            const idx = cell.row * ncols + cell.col;
            let elemZ = gridData[idx];
            if (elemZ < -9000) elemZ = minZ;

            const world = terrainMesh.localToWorld(new THREE.Vector3(cX, cY, elemZ - minZ));
            const realX = world.x + center.x + cellsize / 2;
            const realY = -world.z + center.y + cellsize / 2;

            let direction = 'S';
            if (i > 0) {
                direction = cells[i].row !== cells[i - 1].row ? 'E' : 'S';
            } else if (cells.length > 1) {
                direction = cells[1].row !== cell.row ? 'E' : 'S';
            }

            segments.push({
                lineId,
                col:     cell.col,
                row:     cell.row,
                x:       realX,
                y:       realY,
                z:       elemZ,
                direction,
                soffit:  bridgeParams.soffit  ?? (elemZ + 2.0),
                deck:    bridgeParams.deck    ?? (elemZ + 3.0),
                width:   bridgeParams.width   ?? 5.0,
                Cd:      bridgeParams.Cd      ?? 1.704,
                z_sohle: bridgeParams.z_sohle ?? elemZ,
            });
        }

        window.dispatchEvent(new CustomEvent('bridge-axis-click', { detail: { segments } }));

        startPoint = null;
        recyclePreview();
        cursorMesh.visible = false;
        sm.setIdle();
    };

    return { state: sm.state, activate, deactivate, onMove, onClick, reset };
}

/**
 * Convert two world-coordinate points (UTM) to a Bresenham cell array on the flood grid.
 * Used by BridgeTool when importing axis from IFC clipboard data.
 *
 * @param {{ x: number, y: number }} p1 - Start point (world coords)
 * @param {{ x: number, y: number }} p2 - End point (world coords)
 * @param {object} parsedData - terrain header { xll/xllcorner, yll/yllcorner, cellsize, ncols, nrows }
 * @returns {Array<{col:number, row:number}>}
 */
export function computeAxisFromWorldPoints(p1, p2, parsedData) {
    const xll      = parsedData.xll      ?? parsedData.xllcorner ?? 0;
    const yll      = parsedData.yll      ?? parsedData.yllcorner ?? 0;
    const cellsize = parsedData.cellsize ?? 1;
    const ncols    = parsedData.ncols    ?? 0;
    const nrows    = parsedData.nrows    ?? 0;

    const toCell = (pt) => ({
        col: Math.max(0, Math.min(ncols - 1, Math.floor((pt.x - xll) / cellsize))),
        row: Math.max(0, Math.min(nrows - 1, (nrows - 1) - Math.floor((pt.y - yll) / cellsize))),
    });

    // Re-use the local Bresenham function inline (can't call it from outside useBridgeTool scope)
    const c0 = toCell(p1), c1 = toCell(p2);
    const dx = Math.abs(c1.col - c0.col);
    const dy = -Math.abs(c1.row - c0.row);
    const sx = c0.col < c1.col ? 1 : -1;
    const sy = c0.row < c1.row ? 1 : -1;
    let err = dx + dy, c = c0.col, r = c0.row;
    const cells = [];
    while (true) {
        cells.push({ col: c, row: r });
        if (c === c1.col && r === c1.row) break;
        const e2 = 2 * err;
        if (e2 > dy && e2 < dx) { err += dy; c += sx; cells.push({ col: c, row: r }); err += dx; r += sy; }
        else if (e2 > dy) { err += dy; c += sx; }
        else if (e2 < dx) { err += dx; r += sy; }
    }
    return cells;
}
