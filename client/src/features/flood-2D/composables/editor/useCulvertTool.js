import * as THREE from 'three';
import { useDrawTool } from './useDrawTool.js';
import { useScenarioStore } from '@/stores/scenarioStore';
import { createCulvertMesh } from '../../utils/CulvertGeometry.js';

export function useCulvertTool() {

    const drawTool = useDrawTool();
    const store = useScenarioStore();

    // --- LOGIC: CREATE CULVERT ---
    const createCulvert = (points, context) => {
        const { scene, parsedData } = context;

        if (points.length < 3 || !parsedData) return;

        // 1. Scanline for Elevation (Reuse from Building logic)
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
                        if (val > -9000) {
                            if (val < trueMinEle) trueMinEle = val;
                            if (val > trueMaxEle) trueMaxEle = val;
                            hitCount++;
                        }
                    }
                }
            }
        }

        // Fallback
        if (hitCount === 0 || trueMinEle === Infinity) {
            trueMinEle = Infinity;
            trueMaxEle = -Infinity;
            points.forEach(p => {
                const absZ = p.y + parsedData.minZ;
                if (absZ < trueMinEle) trueMinEle = absZ;
                if (absZ > trueMaxEle) trueMaxEle = absZ;
            });
        }

        // 2. Extrusion Parameters (Specific to Culvert)
        const globalMinZ = parsedData.minZ;
        const desiredHeight = 4.0; // Culverts might be lower than buildings?
        const safetyMargin = 0.5;

        // Real World Elevations
        const realBaseEle = trueMinEle - safetyMargin;
        const realRoofEle = trueMaxEle + desiredHeight;
        const totalDepth = Math.max(1, realRoofEle - realBaseEle);

        // Visual Elevation
        const visualBaseEle = realBaseEle - globalMinZ;

        // 3. Mesh Creation (Delegate to Geometry Helper)
        const mesh = createCulvertMesh(points, visualBaseEle, totalDepth);
        scene.add(mesh);

        // 4. Store Update
        const coords = points.map(p => {
            const realX = p.x + parsedData.center.x;
            const realY = -p.z + parsedData.center.y;
            return [realX, realY];
        });
        coords.push(coords[0]); // Close

        const feature = {
            type: "Feature",
            id: crypto.randomUUID(),
            properties: { type: "CULVERT", height: totalDepth, bottom_elevation: realBaseEle },
            geometry: { type: "Polygon", coordinates: [coords] }
        };
        store.addFeature(feature);
    };

    // --- PROXY HANDLERS ---

    const onClick = (context) => {
        const res = drawTool.onClick(context);
        if (res.action === 'FINISHED') {
            createCulvert(res.points, context);
            drawTool.reset(context.scene);
            return { action: 'BUILT_CULVERT' };
        }
        return res;
    };

    const onDoubleClick = (context) => {
        const res = drawTool.onDoubleClick(context);
        if (res.action === 'FINISHED') {
            createCulvert(res.points, context);
            drawTool.reset(context.scene);
            return { action: 'BUILT_CULVERT' };
        }
        return res;
    };

    const onRightClick = (context) => drawTool.onRightClick(context);
    const onMove = (context) => drawTool.onMove(context);
    const reset = (scene) => drawTool.reset(scene);

    return {
        onClick,
        onMove,
        onRightClick,
        onDoubleClick,
        reset,
        getPoints: drawTool.getPoints
    };
}
