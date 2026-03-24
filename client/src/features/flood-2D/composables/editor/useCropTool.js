/**
 * useCropTool.js
 * Phase 3: Interactive Bounding-Box Crop Tool
 *
 * Interaction model:
 *  - First click  → anchors the start corner
 *  - Mouse move   → dynamically updates a visible rectangle (LineLoop)
 *  - Second click → finalises the bounding box, calls geoStore.cropTerrain()
 *  - Right click  → cancels current selection
 *
 * The composable exposes the same interface as every other editor composable
 * so it integrates seamlessly with useInteractionManager and the tools-map
 * in MapEditor3D.vue:
 *   { onClick, onMove, onRightClick, activate, deactivate }
 */

import { ref } from 'vue';
import * as THREE from 'three';

export function useCropTool() {
    // ── Public reactive state ─────────────────────────────────────────────────
    const isDrawing = ref(false);  // true after first click, before second

    // ── Internal Three.js helpers ─────────────────────────────────────────────
    let startWorld = null;        // THREE.Vector3 – first click world position
    let rectMesh = null;        // LineLoop – the live rectangle preview
    let scene = null;        // cached scene ref (set in activate)

    // ── Raycasting helper ─────────────────────────────────────────────────────
    /**
     * Casts from the current camera/pointer into the terrain mesh and
     * returns the hit world position, or null.
     */
    function getWorldPoint(context) {
        const { raycaster, camera, terrainMesh, pointer } = context;
        if (!raycaster || !camera || !terrainMesh) return null;

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(terrainMesh, false);
        return hits.length > 0 ? hits[0].point.clone() : null;
    }

    // ── Rectangle overlay helpers ─────────────────────────────────────────────
    function buildRect(A, B) {
        // Build a flat rectangle at a fixed Y (slightly above terrain)
        const y = Math.max(A.y, B.y) + 1.0; // hover above terrain surface
        const pts = [
            new THREE.Vector3(A.x, y, A.z),
            new THREE.Vector3(B.x, y, A.z),
            new THREE.Vector3(B.x, y, B.z),
            new THREE.Vector3(A.x, y, B.z),
        ];
        return pts;
    }

    function createRectMesh(A, B) {
        const pts = buildRect(A, B);
        const geometry = new THREE.BufferGeometry().setFromPoints(pts);
        const material = new THREE.LineBasicMaterial({
            color: 0xff4500,      // vivid orange-red — clearly visible crop border
            linewidth: 2,
            depthTest: false,
        });
        const loop = new THREE.LineLoop(geometry, material);
        loop.renderOrder = 999;
        return loop;
    }

    function updateRectMesh(A, B) {
        if (!rectMesh) return;
        const pts = buildRect(A, B);
        rectMesh.geometry.setFromPoints(pts);
    }

    function removeRectMesh() {
        if (rectMesh && scene) {
            scene.remove(rectMesh);
            rectMesh.geometry.dispose();
            rectMesh.material.dispose();
            rectMesh = null;
        }
    }

    // ── Tool interface ────────────────────────────────────────────────────────

    /**
     * Called by the tool-lifecycle watcher when CROP becomes active.
     * Receives the Three.js scene so we can add/remove overlay meshes.
     */
    function activate(threeScene) {
        scene = threeScene;
        // Make sure any stale state from a previous activation is cleaned up
        cancel();
    }

    /**
     * Called when another tool is activated (or tool is toggled off).
     */
    function deactivate(threeScene) {
        cancel();
        scene = threeScene ?? scene;
    }

    /**
     * Left-click handler routed by useInteractionManager.
     * @param {Object} ctx – { event, pointer, raycaster, camera, terrainMesh, parsedData, geoStore, ... }
     */
    function onClick(ctx) {
        if (ctx.event.button !== 0) return;

        const hit = getWorldPoint(ctx);
        if (!hit) return; // missed terrain – ignore

        if (!isDrawing.value) {
            // ── First click: set anchor ───────────────────────────────────
            startWorld = hit;
            isDrawing.value = true;

            // Create the preview rectangle (degenerate at this point)
            rectMesh = createRectMesh(startWorld, startWorld);
            scene?.add(rectMesh);

        } else {
            // ── Second click: commit crop ─────────────────────────────────
            const endWorld = hit;

            // Derive axis-aligned bounding box in world space.
            // Three.js world: X = East, Z = North (inverted → South when positive Z)
            // The terrain is centred at (0,0,0). To get real-world coords we need
            // parsedData.center. The geoStore header already holds raw world coords,
            // so we convert via: realWorldX = worldX + center.x, realWorldY = -worldZ + center.y
            const pd = ctx.parsedData;
            if (!pd || !pd.center) {
                console.warn('[CropTool] No parsedData.center – cannot compute real-world coords.');
                cancel();
                return;
            }

            const cx = pd.center.x;
            const cy = pd.center.y;

            // Three.js scene: X → World X,  -Z → World Y
            const wx1 = startWorld.x + cx;
            const wy1 = -startWorld.z + cy;
            const wx2 = endWorld.x + cx;
            const wy2 = -endWorld.z + cy;

            const boundingBox = {
                minX: Math.min(wx1, wx2),
                maxX: Math.max(wx1, wx2),
                minY: Math.min(wy1, wy2),
                maxY: Math.max(wy1, wy2),
            };

            console.log('[CropTool] Firing cropTerrain with:', boundingBox);

            // Call the store action (Phase 2)
            const geoStore = ctx.geoStore;
            if (geoStore?.cropTerrain) {
                geoStore.cropTerrain(boundingBox);
            } else {
                console.error('[CropTool] geoStore.cropTerrain not available!');
            }

            // Clean up overlay and reset state
            cancel();
        }
    }

    /**
     * Mouse-move handler: updates the live rectangle preview.
     */
    function onMove(ctx) {
        if (!isDrawing.value || !startWorld) return;

        const hit = getWorldPoint(ctx);
        if (!hit) return;

        updateRectMesh(startWorld, hit);
    }

    /**
     * Right-click or Escape: cancel the current selection.
     */
    function onRightClick(_ctx) {
        cancel();
    }

    function cancel() {
        isDrawing.value = false;
        startWorld = null;
        removeRectMesh();
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        isDrawing,   // reactive – used by template to show the "click to finish" hint
        onClick,
        onMove,
        onRightClick,
        activate,
        deactivate,
        cancel,
    };
}
