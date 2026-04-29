import { ref } from 'vue';
import * as THREE from 'three';

export function useWeirTool() {
    let cursorMesh = null;
    let previewGroup = null;
    let startPoint = null;
    const previewPool = [];

    const createCursor = (size = 1.0, color = 0x3498db) => {
        const geometry = new THREE.PlaneGeometry(1.0, 1.0);
        const material = new THREE.MeshBasicMaterial({
            color: color,      
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            wireframe: false,
            depthTest: false      
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.renderOrder = 999;
        mesh.visible = false;
        return mesh;
    };

    const activate = (scene) => {
        if (!cursorMesh) {
            cursorMesh = createCursor(1.0);
        }
        if (!previewGroup) {
            previewGroup = new THREE.Group();
            previewGroup.renderOrder = 998;
        }
        scene.add(cursorMesh);
        scene.add(previewGroup);
    };

    const deactivate = (scene) => {
        if (cursorMesh) {
            scene.remove(cursorMesh);
            cursorMesh.visible = false;
        }
        if (previewGroup) {
            scene.remove(previewGroup);
            while(previewGroup.children.length > 0){ 
                const c = previewGroup.children[0];
                previewGroup.remove(c); 
                previewPool.push(c);
            }
        }
        startPoint = null;
    };

    // Bresenham-based 4-connected line
    function getLineCells(c0, r0, c1, r1) {
        const dx = Math.abs(c1 - c0);
        const dy = -Math.abs(r1 - r0);
        const sx = c0 < c1 ? 1 : -1;
        const sy = r0 < r1 ? 1 : -1;
        let err = dx + dy;
        let c = c0;
        let r = r0;
        const cells = [];
        
        while (true) {
            cells.push({ col: c, row: r });
            if (c === c1 && r === r1) break;
            const e2 = 2 * err;
            
            if (e2 > dy && e2 < dx) {
                err += dy;
                c += sx;
                cells.push({ col: c, row: r });
                err += dx;
                r += sy;
            } else if (e2 > dy) {
                err += dy;
                c += sx;
            } else if (e2 < dx) {
                err += dx;
                r += sy;
            }
        }
        return cells;
    }

    const onMove = ({ event, raycaster, camera, pointer, scene, terrainMesh, parsedData }) => {
        if (!terrainMesh || !parsedData) return;
        
        if (!cursorMesh && scene) {
            activate(scene);
        }

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(terrainMesh, false);

        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;
            const { cellsize, ncols, nrows } = parsedData;

            const gridWidth = (ncols - 1) * cellsize;
            const gridHeight = (nrows - 1) * cellsize;
            const offsetX = gridWidth / 2;
            const offsetY = gridHeight / 2;

            const localPoint = terrainMesh.worldToLocal(hitPoint.clone());
            const centerCol = Math.floor((localPoint.x + offsetX + (cellsize * 0.5)) / cellsize);
            const centerRow = Math.floor((localPoint.y + offsetY + (cellsize * 0.5)) / cellsize);

            if (centerCol >= 0 && centerCol < ncols && centerRow >= 0 && centerRow < nrows) {
                
                if (startPoint) {
                    // Draw preview line
                    cursorMesh.visible = false;
                    
                    while(previewGroup.children.length > 0) {
                        const child = previewGroup.children[0];
                        previewGroup.remove(child);
                        previewPool.push(child);
                    }

                    const cells = getLineCells(startPoint.col, startPoint.row, centerCol, centerRow);
                    
                    cells.forEach(cell => {
                        let mesh = previewPool.length > 0 ? previewPool.pop() : createCursor(cellsize, 0xf39c12);
                        
                        const cX = (cell.col * cellsize) - offsetX;
                        const cY = (cell.row * cellsize) - offsetY;
                        const idx = cell.row * ncols + cell.col;
                        let elemZ = parsedData.gridData[idx];
                        if (elemZ < -9000) elemZ = parsedData.minZ;
                        
                        const snappedLocal = new THREE.Vector3(cX, cY, elemZ - parsedData.minZ);
                        const snappedWorld = terrainMesh.localToWorld(snappedLocal);
                        
                        mesh.position.copy(snappedWorld);
                        mesh.position.y += 0.3;
                        mesh.scale.set(cellsize, cellsize, 1);
                        mesh.visible = true;
                        
                        previewGroup.add(mesh);
                    });
                } else {
                    // Draw single cursor
                    const cellX_local = (centerCol * cellsize) - offsetX;
                    const cellY_local = (centerRow * cellsize) - offsetY;
                    
                    const idx = centerRow * ncols + centerCol;
                    let elemZ = parsedData.gridData[idx];
                    if (elemZ < -9000) elemZ = parsedData.minZ;

                    const snappedLocal = new THREE.Vector3(cellX_local, cellY_local, elemZ - parsedData.minZ);
                    const snappedWorld = terrainMesh.localToWorld(snappedLocal);

                    cursorMesh.position.copy(snappedWorld);
                    cursorMesh.position.y += 0.3;
                    cursorMesh.scale.set(cellsize, cellsize, 1);
                    cursorMesh.visible = true;
                }
            } else {
                cursorMesh.visible = false;
            }
        } else {
            if (cursorMesh) cursorMesh.visible = false;
        }
    };

    const onClick = ({ raycaster, camera, pointer, terrainMesh, parsedData }) => {
        if (!terrainMesh || !parsedData) return;

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(terrainMesh, false);

        if (intersects.length > 0) {
            const hitPoint = intersects[0].point;
            const { cellsize, ncols, nrows, center, minZ, gridData } = parsedData;

            const gridWidth = (ncols - 1) * cellsize;
            const gridHeight = (nrows - 1) * cellsize;
            const offsetX = gridWidth / 2;
            const offsetY = gridHeight / 2;

            const localPoint = terrainMesh.worldToLocal(hitPoint.clone());
            const centerCol = Math.floor((localPoint.x + offsetX + (cellsize * 0.5)) / cellsize);
            const centerRow = Math.floor((localPoint.y + offsetY + (cellsize * 0.5)) / cellsize);

            if (centerCol >= 0 && centerCol < ncols && centerRow >= 0 && centerRow < nrows) {
                
                if (!startPoint) {
                    startPoint = { col: centerCol, row: centerRow };
                } else {
                    const cells = getLineCells(startPoint.col, startPoint.row, centerCol, centerRow);
                    const segments = [];

                    for (let i = 0; i < cells.length; i++) {
                        const cell = cells[i];
                        const cX = (cell.col * cellsize) - offsetX;
                        const cY = (cell.row * cellsize) - offsetY;
                        const idx = cell.row * ncols + cell.col;
                        let elemZ = gridData[idx];
                        if (elemZ < -9000) elemZ = minZ;

                        const snappedLocal = new THREE.Vector3(cX, cY, elemZ - minZ);
                        const snappedHit = terrainMesh.localToWorld(snappedLocal.clone());

                        const realX = snappedHit.x + center.x + cellsize / 2;
                        const realY = -snappedHit.z + center.y + cellsize / 2;

                        let direction = 'S';
                        if (i > 0) {
                            const prev = cells[i-1];
                            if (cell.row !== prev.row) direction = 'E'; // vertical wall blocks E-W
                            else direction = 'S'; // horizontal wall blocks N-S
                        } else if (cells.length > 1) {
                            const next = cells[1];
                            if (next.row !== cell.row) direction = 'E';
                            else direction = 'S';
                        }

                        segments.push({
                            col: cell.col,
                            row: cell.row,
                            x: realX,
                            y: realY,
                            z: elemZ,
                            direction: direction
                        });
                    }

                    window.dispatchEvent(new CustomEvent('weir-line-click', { 
                        detail: { segments } 
                    }));

                    // Reset tool
                    startPoint = null;
                    while(previewGroup.children.length > 0) {
                        const c = previewGroup.children[0];
                        previewGroup.remove(c);
                        previewPool.push(c);
                    }
                    cursorMesh.visible = false;
                }
            }
        }
    };

    return { activate, deactivate, onMove, onClick };
}
