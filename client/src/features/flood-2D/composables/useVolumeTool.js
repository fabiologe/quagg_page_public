/**
 * src/features/flood-2D/composables/useVolumeTool.js
 * 
 * Manages the logic for drawing a polygon area on the 3D terrain
 * to measure impounded water volumes.
 */

import { ref, onUnmounted } from 'vue';
import * as THREE from 'three';

export function useVolumeTool({ scene, camera, renderer, getTerrainMesh, onPolygonDrawn, onDrawStart, onDrawEnd }) {
    const isActive = ref(false);
    const isFinished = ref(false);

    // Array of THREE.Vector3 points forming the *active* polygon
    const drawnPoints = ref([]);

    // Map to store completed meshes by their unique id
    const completedPolygons = new Map();

    // Three.js objects for the *active* drawing
    let lineMesh = null;
    let tempLineMesh = null;
    let pointMarkers = [];

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function enable() {
        if (isActive.value) return;
        isActive.value = true;

        // Use window listeners to ensure we catch events even if the canvas doesn't cleanly propagate them
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('dblclick', onDoubleClick);
    }

    function disable() {
        if (!isActive.value) return;
        isActive.value = false;

        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('dblclick', onDoubleClick);

        // Cleanup temporary drawing geometry if we disabled while drawing
        if (tempLineMesh || drawnPoints.value.length > 0) {
            if (onDrawEnd) onDrawEnd();
        }

        if (tempLineMesh) {
            scene.remove(tempLineMesh);
            tempLineMesh.geometry.dispose();
            tempLineMesh = null;
        }
    }

    function getIntersection(event) {
        const tMesh = getTerrainMesh();
        if (!tMesh) {
            console.log('[useVolumeTool] no terrain mesh');
            return null;
        }

        const domEl = renderer?.value?.domElement || renderer?.domElement;
        if (!domEl) return null;

        const rect = domEl.getBoundingClientRect();

        // Ensure event is inside canvas
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) {
            return null;
        }

        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(tMesh);

        return hits.length > 0 ? hits[0].point : null;
    }

    function renderLines() {
        // Base Polygon Line
        if (lineMesh) {
            scene.remove(lineMesh);
            lineMesh.geometry.dispose();
            lineMesh = null;
        }

        if (drawnPoints.value.length > 1) {
            const material = new THREE.LineBasicMaterial({
                color: 0x00e5ff, // Cyan
                linewidth: 3,
                depthTest: false,
                transparent: true,
                opacity: 0.8
            });

            const geometry = new THREE.BufferGeometry().setFromPoints(drawnPoints.value);
            lineMesh = new THREE.Line(geometry, material);

            lineMesh.renderOrder = 999;
            scene.add(lineMesh);
        }

        // Points visualization
        pointMarkers.forEach(p => scene.remove(p));
        pointMarkers = [];

        const pMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
        const pGeometry = new THREE.CircleGeometry(0.5, 16);

        drawnPoints.value.forEach(pt => {
            const marker = new THREE.Mesh(pGeometry, pMaterial);
            marker.position.copy(pt);
            marker.position.y += 0.5; // Slightly above terrain
            marker.rotation.x = -Math.PI / 2;
            marker.renderOrder = 1000;
            scene.add(marker);
            pointMarkers.push(marker);
        });
    }

    function onPointerDown(event) {
        if (!isActive.value || isFinished.value) return;

        // Ignore middle/right mouse buttons
        if (event.button !== 0) return;

        // Prevent drawing when clicking on UI panels overlaying the canvas
        // (DOM target will be an HTML element inside our viewer, not the canvas)
        if (event.target.tagName.toLowerCase() !== 'canvas') {
            return;
        }

        const hitPoint = getIntersection(event);
        if (!hitPoint) return;

        drawnPoints.value.push(hitPoint.clone());
        if (drawnPoints.value.length === 1 && onDrawStart) {
            onDrawStart();
        }

        renderLines();
    }

    function onPointerMove(event) {
        if (!isActive.value || isFinished.value || drawnPoints.value.length === 0) return;

        const hitPoint = getIntersection(event);
        if (!hitPoint) return;

        const lastPoint = drawnPoints.value[drawnPoints.value.length - 1];

        if (!tempLineMesh) {
            const material = new THREE.LineDashedMaterial({
                color: 0x00e5ff,
                linewidth: 2,
                dashSize: 2,
                gapSize: 1,
                depthTest: false,
                opacity: 0.5,
                transparent: true
            });
            const geometry = new THREE.BufferGeometry().setFromPoints([lastPoint, hitPoint]);
            tempLineMesh = new THREE.Line(geometry, material);
            tempLineMesh.computeLineDistances(); // Required for dashed lines
            tempLineMesh.renderOrder = 998;
            scene.add(tempLineMesh);
        } else {
            tempLineMesh.geometry.setFromPoints([lastPoint, hitPoint]);
            tempLineMesh.computeLineDistances();
        }
    }

    function onDoubleClick(event) {
        if (!isActive.value || drawnPoints.value.length < 3) return;

        // Remove temporary line
        if (tempLineMesh) {
            scene.remove(tempLineMesh);
            tempLineMesh.geometry.dispose();
            tempLineMesh = null;
        }

        // Emit to parent and get back ID and Color for the committed polygon
        if (onPolygonDrawn) {
            const polyInfo = onPolygonDrawn(drawnPoints.value);
            if (polyInfo) {
                // Create the permanent LineLoop Mesh
                const material = new THREE.LineBasicMaterial({
                    color: new THREE.Color(polyInfo.color),
                    linewidth: 3,
                    depthTest: false,
                    transparent: true,
                    opacity: 0.8
                });
                const geometry = new THREE.BufferGeometry().setFromPoints(drawnPoints.value);
                const finalMesh = new THREE.LineLoop(geometry, material);
                finalMesh.renderOrder = 999;
                scene.add(finalMesh);

                completedPolygons.set(polyInfo.id, finalMesh);
            }
        }

        // Reset the active drawing state so the user can immediately draw another polygon
        drawnPoints.value = [];
        if (lineMesh) {
            scene.remove(lineMesh);
            lineMesh.geometry.dispose();
            lineMesh = null;
        }
        pointMarkers.forEach(p => scene.remove(p));
        pointMarkers = [];

        if (onDrawEnd) onDrawEnd();
    }

    function removePolygonMesh(id) {
        const mesh = completedPolygons.get(id);
        if (mesh) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            completedPolygons.delete(id);
        }
    }

    function clearPolygon() {
        drawnPoints.value = [];

        if (lineMesh) {
            scene.remove(lineMesh);
            lineMesh.geometry.dispose();
            lineMesh = null;
        }
        if (tempLineMesh) {
            scene.remove(tempLineMesh);
            tempLineMesh.geometry.dispose();
            tempLineMesh = null;
        }
        pointMarkers.forEach(p => scene.remove(p));
        pointMarkers = [];

        // Also clear all completed polygon meshes
        for (const [id, mesh] of completedPolygons.entries()) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        }
        completedPolygons.clear();
    }

    onUnmounted(() => {
        disable();
        clearPolygon();
    });

    return {
        isActive,
        drawnPoints,
        enable,
        disable,
        clearPolygon,
        removePolygonMesh
    };
}
