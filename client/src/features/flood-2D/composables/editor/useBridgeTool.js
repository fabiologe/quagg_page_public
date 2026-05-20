import { ref } from 'vue';
import * as THREE from 'three';

export function useBridgeTool() {
    let cursorMesh    = null;
    let previewGroup  = null;
    let startPoint    = null;
    const previewPool = [];

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

    const activate = (scene) => {
        if (!cursorMesh)    cursorMesh   = createCursor();
        if (!previewGroup) {
            previewGroup = new THREE.Group();
            previewGroup.renderOrder = 998;
        }
        scene.add(cursorMesh);
        scene.add(previewGroup);
    };

    const deactivate = (scene) => {
        if (cursorMesh) { scene.remove(cursorMesh); cursorMesh.visible = false; }
        if (previewGroup) {
            scene.remove(previewGroup);
            while (previewGroup.children.length > 0) {
                const c = previewGroup.children[0];
                previewGroup.remove(c);
                previewPool.push(c);
            }
        }
        startPoint = null;
    };

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
            while (previewGroup.children.length > 0) {
                const c = previewGroup.children[0];
                previewGroup.remove(c);
                previewPool.push(c);
            }
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
    const onClick = ({ raycaster, camera, pointer, terrainMesh, parsedData }, bridgeParams = {}) => {
        if (!terrainMesh || !parsedData) return;

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
        while (previewGroup.children.length > 0) {
            const c = previewGroup.children[0];
            previewGroup.remove(c);
            previewPool.push(c);
        }
        cursorMesh.visible = false;
    };

    return { activate, deactivate, onMove, onClick };
}
