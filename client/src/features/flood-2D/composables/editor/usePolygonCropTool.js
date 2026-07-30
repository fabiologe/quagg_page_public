/**
 * usePolygonCropTool.js
 * Phase 3b: Irregular-Polygon Terrain Masking Tool
 *
 * Interaction model (identical to BuildingTool drawing):
 *  - Each left-click adds a vertex to the polygon.
 *  - Moving the mouse shows a rubber-band preview line and a ghost cursor.
 *  - Click on the start vertex (snaps green) OR double-click → closes the polygon.
 *  - Right-click → cancel / reset.
 *
 * On close: every raster cell whose centre lies OUTSIDE the drawn polygon is
 * set to NODATA (-9999). The mesh is rebuilt via terrainVersion increment.
 *
 * Wraps useDrawTool for the visual heavy-lifting, exactly as useBuildingTool does.
 */

import { ref } from 'vue';
import { useDrawTool } from './useDrawTool.js';
import { useNetworkStore } from '../../stores/useNetworkStore.js';
import { pointInPolygon } from '../../utils/GridCropper.js';

export function usePolygonCropTool() {
    // Inner draw engine (reuses all rubber-band / snap / marker logic)
    const drawTool = useDrawTool({ isPolygon: true });

    // Expose to template for contextual hints
    const isDrawing = ref(false);
    let scene = null;

    // ── Tool lifecycle ────────────────────────────────────────────────────────

    function activate(threeScene) {
        if (threeScene) scene = threeScene; // cache for cancel-button path
        isDrawing.value = false;
        if (scene) drawTool.reset(scene);
    }

    function deactivate(threeScene) {
        const s = threeScene ?? scene;
        if (s) drawTool.reset(s);
        isDrawing.value = false;
    }

    // ── Internal helper ───────────────────────────────────────────────────────

    /**
     * Convert Three.js world coordinates (centred mesh) back to real-world CRS.
     * Three.js:  X → WorldX,  -Z → WorldY
     */
    function toWorldCoords(threeVec3, center) {
        return {
            x: threeVec3.x + center.x,
            y: -threeVec3.z + center.y,
        };
    }

    function _fireAndReset(ctx) {
        // Always prefer ctx.scene (provided by InteractionManager) over cached scene
        const s = ctx?.scene ?? scene;
        const pts = drawTool.getPoints();

        if (pts.length < 3) {
            if (s) drawTool.reset(s);
            isDrawing.value = false;
            return;
        }

        const pd = ctx.parsedData;
        if (!pd || !pd.center) {
            console.warn('[PolygonCropTool] No parsedData.center – aborting.');
            if (s) drawTool.reset(s);
            isDrawing.value = false;
            return;
        }

        // Convert Three.js scene coords → real-world polygon
        const worldPolygon = pts.map(v => toWorldCoords(v, pd.center));
        console.log('[PolygonCropTool] Masking with polygon:', worldPolygon.length, 'vertices');

        const geoStore = ctx.geoStore;
        if (geoStore?.maskTerrainByPolygon) {
            geoStore.maskTerrainByPolygon(worldPolygon);
            // Netz mit zuschneiden — EXAKT derselbe Punkt-in-Polygon-Test wie die
            // Raster-Maske (GridCropper), damit Raster und Netz deckungsgleich bleiben.
            const removed = useNetworkStore().cropOutside(
                (x, y) => pointInPolygon(x, y, worldPolygon),
                'Netz an Polygon-Maske angepasst');
            if (removed > 0) console.log(`[PolygonCropTool] Netz zugeschnitten: ${removed} Schächte außerhalb entfernt.`);
        } else {
            console.error('[PolygonCropTool] geoStore.maskTerrainByPolygon not available!');
        }

        if (s) drawTool.reset(s);
        isDrawing.value = false;
    }

    // ── Tool interface (forwarded to useInteractionManager) ───────────────────

    function onClick(ctx) {
        if (ctx.event.button !== 0) return;

        const result = drawTool.onClick(ctx);
        if (!result) return;

        if (result.action === 'FINISHED') {
            _fireAndReset(ctx);
        } else if (result.action === 'ADDED_POINT') {
            isDrawing.value = true;
        }
    }

    function onMove(ctx) {
        drawTool.onMove(ctx);
    }

    function onDoubleClick(ctx) {
        const result = drawTool.onDoubleClick(ctx);
        if (result?.action === 'FINISHED') {
            _fireAndReset(ctx);
        }
    }

    function onRightClick(ctx) {
        const s = ctx?.scene ?? scene;
        if (s) drawTool.reset(s);
        isDrawing.value = false;
        return { action: 'RESET' };
    }

    /** Safe cancel – can be called from template without passing scene. */
    function cancel() {
        if (scene) drawTool.reset(scene);
        isDrawing.value = false;
    }

    // ── Public API ────────────────────────────────────────────────────────────
    return {
        isDrawing,
        drawingPoints: drawTool.drawingPoints,
        onClick,
        onMove,
        onDoubleClick,
        onRightClick,
        activate,
        deactivate,
        cancel,  // safe no-arg cancel for template buttons
    };
}
