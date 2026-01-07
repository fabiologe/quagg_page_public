import { ref } from 'vue';
import * as THREE from 'three';

/**
 * useDrawTool.js
 * Encapsulates the logic for drawing polygons/lines on the terrain.
 * Handles raycasting, visual feedback (markers, rubber band), and state.
 */
export function useDrawTool(config = { isPolygon: true }) {

    // State
    const drawingPoints = ref([]); // Array of THREE.Vector3
    const isDrawing = ref(false);

    // Internal Three.js Objects (not reactive)
    let rubberBandLine = null;
    let drawingLineMesh = null;
    let markerMeshes = [];
    const tempPointer = new THREE.Vector2();

    // --- HELPER: Smart Raycast ---
    const getIntersect = (pointer, raycaster, camera, context) => {
        raycaster.setFromCamera(pointer, camera);

        // 1. Try Terrain
        if (context.terrainMesh) {
            const intersects = raycaster.intersectObject(context.terrainMesh);
            if (intersects.length > 0) {
                return intersects[0].point;
            }
        }

        // 2. Fallback: Plane
        const target = new THREE.Vector3();
        const plane = context.interactionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.ray.intersectPlane(plane, target);
        return target;
    };

    // --- VISUALS ---
    // --- HELPER: Snap to Start ---
    const getSnappedPosition = (hit, threshold = 4.0) => {
        // Only snap to start if we are drawing a polygon
        if (config.isPolygon && drawingPoints.value.length > 2) {
            const startPoint = drawingPoints.value[0];
            if (hit.distanceTo(startPoint) < threshold) {
                return { pos: startPoint, snapped: true };
            }
        }
        return { pos: hit, snapped: false };
    };

    // --- VISUALS ---
    let ghostMarker = null;

    const updateVisuals = (scene) => {
        // Update Static Line
        if (drawingLineMesh) {
            scene.remove(drawingLineMesh);
            drawingLineMesh.geometry.dispose();
            drawingLineMesh.material.dispose();
            drawingLineMesh = null;
        }

        if (drawingPoints.value.length > 0) {
            const geometry = new THREE.BufferGeometry().setFromPoints(drawingPoints.value);
            const material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
            drawingLineMesh = new THREE.Line(geometry, material);
            scene.add(drawingLineMesh);
        }
    };

    const updateGhostMarker = (position, scene, isSnapped) => {
        if (!ghostMarker) {
            ghostMarker = new THREE.Mesh(
                new THREE.SphereGeometry(isSnapped ? 1.0 : 0.6, 16, 16), // Larger if snapped
                new THREE.MeshBasicMaterial({ color: isSnapped ? 0x00ff00 : 0xff0000, transparent: true, opacity: 0.8 })
            );
            scene.add(ghostMarker);
        }
        ghostMarker.position.copy(position);
        ghostMarker.material.color.set(isSnapped ? 0x00ff00 : 0xff0000);
        ghostMarker.scale.setScalar(isSnapped ? 1.5 : 1.0);
        ghostMarker.visible = true;
    };

    const addMarker = (position, scene) => {
        const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        marker.position.copy(position);
        scene.add(marker);
        markerMeshes.push(marker);
    };

    // --- API HANDLERS ---

    const onClick = ({ event, raycaster, scene, camera, pointer, ...context }) => {
        let hit = getIntersect(pointer, raycaster, camera, context);

        if (hit) {
            // Apply Snap Logic
            const { pos, snapped } = getSnappedPosition(hit);

            if (snapped) {
                // Close the loop implies finish
                return { action: 'FINISHED', points: [...drawingPoints.value] };
            }

            drawingPoints.value.push(pos);
            addMarker(pos, scene);
            updateVisuals(scene);
            return { action: 'ADDED_POINT', point: pos };
        }
        return { action: 'NONE' };
    };

    const onMove = ({ event, raycaster, scene, camera, pointer, ...context }) => {
        const hit = getIntersect(pointer, raycaster, camera, context);

        if (hit) {
            // Check Snap
            const { pos, snapped } = getSnappedPosition(hit);

            // Ghost Cursor
            updateGhostMarker(pos, scene, snapped);

            // Rubber Band
            if (drawingPoints.value.length > 0) {
                const lastPoint = drawingPoints.value[drawingPoints.value.length - 1];
                const points = [lastPoint, pos];

                if (!rubberBandLine) {
                    const geo = new THREE.BufferGeometry().setFromPoints(points);
                    const mat = new THREE.LineDashedMaterial({
                        color: snapped ? 0x00ff00 : 0xff0000, // Green if closing
                        dashSize: 0.5, gapSize: 0.5
                    });
                    rubberBandLine = new THREE.Line(geo, mat);
                    rubberBandLine.computeLineDistances();
                    scene.add(rubberBandLine);
                } else {
                    rubberBandLine.geometry.setFromPoints(points);
                    rubberBandLine.computeLineDistances();
                    rubberBandLine.material.color.set(snapped ? 0x00ff00 : 0xff0000);
                    rubberBandLine.visible = true;
                }
            } else if (rubberBandLine) {
                rubberBandLine.visible = false;
            }

            return { action: 'HOVER', point: pos };
        } else {
            if (ghostMarker) ghostMarker.visible = false;
        }
    };

    const reset = (scene) => {
        drawingPoints.value = [];
        if (drawingLineMesh) { scene.remove(drawingLineMesh); drawingLineMesh = null; }
        if (rubberBandLine) { scene.remove(rubberBandLine); rubberBandLine = null; }
        if (ghostMarker) { scene.remove(ghostMarker); ghostMarker = null; }
        markerMeshes.forEach(m => scene.remove(m));
        markerMeshes.length = 0;
    };

    // Special method to finalize and return Shape/GeoJSON
    // Helper to get raw points
    const getPoints = () => drawingPoints.value;

    const onRightClick = ({ scene }) => {
        // Cancel / Reset
        reset(scene);
        return { action: 'RESET' };
    };

    const onDoubleClick = ({ scene }) => {
        // Force Finish
        if (drawingPoints.value.length > 2) {
            return { action: 'FINISHED', points: [...drawingPoints.value] };
        }
        return { action: 'NONE' };
    };

    const addPoint = (pos, scene) => {
        drawingPoints.value.push(pos);
        addMarker(pos, scene);
        updateVisuals(scene);
    };

    return {
        drawingPoints,
        onClick,
        onMove,
        onRightClick,
        onDoubleClick,
        reset,
        getPoints,
        // Exposed for wrappers that implement custom snapping
        addPoint,
        updateVisuals
    };
}
