import { useDrawTool } from './useDrawTool.js';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore.js';

export function useBuildingTool() {

    const drawTool = useDrawTool();
    const geoStore = useGeoStore();

    // --- LOGIC: INPUT ONLY ---
    const createBuilding = (points, context) => {
        const { parsedData } = context;

        if (points.length < 3 || !parsedData) {
            console.warn("Cannot create building: Missing points or data");
            return;
        }

        // Convert Visual Points to Real World Coordinates (GeoJSON format)
        // Note: The store expects coordinates in the format [x, y], relative to map projection or local grid center.
        const coords = points.map(p => {
            const realX = p.x + parsedData.center.x;
            const realY = -p.z + parsedData.center.y; // ThreeJS Z is -Y in many GIS mappings, keeping consistent with old code
            return [realX, realY];
        });

        // Close the polygon
        coords.push(coords[0]);

        // "Bake" request payload
        const geometry = {
            type: "Polygon",
            coordinates: [coords]
        };

        const properties = {
            height: 10.0, // Default height
            elevation_mode: "relative"
        };

        // Submit to store - NO direct raster modification here!
        geoStore.addModification('BUILDING', geometry, properties);
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
