import * as THREE from 'three';
import { useDrawTool } from './useDrawTool.js';
import { useScenarioStore } from '@/stores/scenarioStore';

/**
 * useBuildingTool.js
 * Wrapper around useDrawTool that handles Building-specific logic:
 * - Intercepts 'FINISHED' from DrawTool
 * - clear/reset
 * - Executes Scanline Algorithm to find terrain intersection
 * - Creates 3D Extruded Mesh
 * - Updates Scenario Store
 */
export function useBuildingTool() {

    const drawTool = useDrawTool();
    const store = useScenarioStore();

    // --- LOGIC: SCANLINE & EXTRUSION ---
    const createBuilding = (points, context) => {
        const { scene, parsedData } = context;

        if (points.length < 3 || !parsedData) {
            console.warn("Cannot create building: Missing points or data");
            return;
        }

        // 1. Calculate Raster-Based Minimum Elevation (True Terrain Intersection)
        const { cellsize, ncols, nrows, gridData, bounds } = parsedData;

        // Convert Polygon Points to Local Grid Coordinates
        const polygon = points.map(p => ({
            c: Math.round((p.x + bounds.width / 2) / cellsize),
            r: Math.round((bounds.height / 2 - p.z) / cellsize)
        }));

        // Bounding Box
        let minC = ncols, maxC = 0, minR = nrows, maxR = 0;
        polygon.forEach(pt => {
            if (pt.c < minC) minC = pt.c;
            if (pt.c > maxC) maxC = pt.c;
            if (pt.r < minR) minR = pt.r;
            if (pt.r > maxR) maxR = pt.r;
        });

        // Clamp
        minC = Math.max(0, minC); maxC = Math.min(ncols - 1, maxC);
        minR = Math.max(0, minR); maxR = Math.min(nrows - 1, maxR);

        let trueMinEle = Infinity;
        let trueMaxEle = -Infinity;
        let hitCount = 0;

        // Point-in-Polygon
        const isInside = (c, r, poly) => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].c, yi = poly[i].r;
                const xj = poly[j].c, yj = poly[j].r;
                const intersect = ((yi > r) !== (yj > r)) && (c < (xj - xi) * (r - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        };

        // Scan Box
        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (isInside(c, r, polygon)) {
                    const idx = r * ncols + c;
                    if (idx >= 0 && idx < gridData.length) {
                        const val = gridData[idx];
                        if (val > -9000) { // Valid Data
                            if (val < trueMinEle) trueMinEle = val;
                            if (val > trueMaxEle) trueMaxEle = val;
                            hitCount++;
                        }
                    }
                }
            }
        }

        // Fallback: Use Vertex Min/Max if scan missed
        if (hitCount === 0 || trueMinEle === Infinity) {
            trueMinEle = Infinity;
            trueMaxEle = -Infinity;
            points.forEach(p => {
                // p.y is Visual (Real - MinZ). Convert to Real.
                const absZ = p.y + parsedData.minZ;
                if (absZ < trueMinEle) trueMinEle = absZ;
                if (absZ > trueMaxEle) trueMaxEle = absZ;
            });
        }

        // 2. Extrusion Parameters
        const globalMinZ = parsedData.minZ;
        const desiredHeight = 10;
        const safetyMargin = 0.5;

        // Real World Elevations
        const realBaseEle = trueMinEle - safetyMargin;
        const realRoofEle = trueMaxEle + desiredHeight;
        const totalDepth = Math.max(1, realRoofEle - realBaseEle);

        // Visual Elevation
        const visualBaseEle = realBaseEle - globalMinZ;

        // 3. Mesh Creation
        const shape = new THREE.Shape();
        shape.moveTo(points[0].x, -points[0].z);
        for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, -points[i].z);
        }
        shape.closePath();

        const geometry = new THREE.ExtrudeGeometry(shape, { steps: 1, depth: totalDepth, bevelEnabled: false });
        const material = new THREE.MeshLambertMaterial({ color: 0x8e44ad });
        const mesh = new THREE.Mesh(geometry, material);

        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = visualBaseEle;
        scene.add(mesh);

        // 4. Store Update
        const coords = points.map(p => {
            const realX = p.x + parsedData.center.x;
            const realY = -p.z + parsedData.center.y;
            return [realX, realY];
        });
        coords.push(coords[0]); // Close LineString

        const feature = {
            type: "Feature",
            id: crypto.randomUUID(),
            properties: { type: "BUILDING", height: totalDepth, bottom_elevation: realBaseEle },
            geometry: { type: "Polygon", coordinates: [coords] }
        };
        store.addFeature(feature);
    };

    // --- PROXY HANDLERS ---

    const onClick = (context) => {
        // Delegate to DrawTool
        const res = drawTool.onClick(context);

        if (res.action === 'FINISHED') {
            createBuilding(res.points, context);
            drawTool.reset(context.scene);
            return { action: 'BUILT' };
        }
        return res;
    };

    const onDoubleClick = (context) => {
        const res = drawTool.onDoubleClick(context);
        if (res.action === 'FINISHED') {
            createBuilding(res.points, context);
            drawTool.reset(context.scene);
            return { action: 'BUILT' };
        }
        return res;
    };

    const onRightClick = (context) => {
        return drawTool.onRightClick(context);
    };

    const onMove = (context) => {
        return drawTool.onMove(context);
    };

    const reset = (scene) => drawTool.reset(scene);

    return {
        onClick,
        onMove,
        onRightClick,
        onDoubleClick,
        reset,
        // Expose underlying draw points for UI if needed
        getPoints: drawTool.getPoints
    };
}
