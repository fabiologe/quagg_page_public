import * as THREE from 'three';
import { watch, onUnmounted, ref } from 'vue';

/**
 * useLayerRenderer
 * Manages the visualization of Store data (Nodes, Features) in the 3D Scene.
 * Handles Coordinate Systems: GIS (UTM) -> Three.js (Local).
 * 
 * @param {THREE.Scene} scene - The main Three.js scene
 * @param {Object} store - The Pinia Scenario Store
 * @param {Ref} gridRef - Optional Ref to current terrain grid (parsing preview or store)
 */
export function useLayerRenderer(scene, store, gridRef = null) {

    // --- GROUPS ---
    const nodeGroup = new THREE.Group();
    nodeGroup.name = 'Layer_Nodes';
    scene.add(nodeGroup);

    const buildingGroup = new THREE.Group();
    buildingGroup.name = 'Layer_Buildings';
    scene.add(buildingGroup);

    const boundaryGroup = new THREE.Group();
    boundaryGroup.name = 'Layer_Boundaries';
    scene.add(boundaryGroup);

    // Reuse Geometries/Materials for performance
    // Increased size for visibility (0.4 -> 3.0 for debugging)
    const nodeGeometry = new THREE.SphereGeometry(3.0, 16, 16);
    const nodeMaterial = new THREE.MeshStandardMaterial({
        color: 0xff00ff, // Magenta for high visibility
        roughness: 0.4,
        metalness: 0.1
    });

    const buildingMaterial = new THREE.MeshStandardMaterial({
        color: 0xbdc3c7, // Light Grey
        roughness: 0.8
    });

    const boundaryMaterial = new THREE.LineBasicMaterial({
        color: 0xf1c40f, // Yellow
        linewidth: 2
    });

    // --- COORDINATE SYSTEM ---
    // We need a stable reference point (World Offset) to handle large UTM coordinates.
    // If 'store.demGrid' exists, we use its center.
    // If not, we calculate it from the first imported point.

    const worldOffset = ref(null);

    const getActiveGrid = () => {
        // Priority: Passed Ref (Preview) > Store (Accepted)
        if (gridRef && gridRef.value) return gridRef.value;
        return store.demGrid;
    };

    const getActiveData = () => {
        // If gridRef (Preview) has data, use it.
        const grid = getActiveGrid();
        if (grid && grid.gridData) return grid.gridData;
        // Otherwise use store raw data
        return store.demData;
    };

    const updateWorldOffset = () => {
        const grid = getActiveGrid();
        if (grid && grid.center) {
            worldOffset.value = grid.center;
        } else if (store.nodes && store.nodes.length > 0 && !worldOffset.value) {
            // Fallback: Initialize offset from first node
            worldOffset.value = { x: store.nodes[0].x, y: store.nodes[0].y };
            console.log("[LayerRenderer] World Offset initialized from first Node (No Grid):", worldOffset.value);
        }
    };

    const getLocalPos = (x, y, z) => {
        if (!worldOffset.value) updateWorldOffset();
        if (!worldOffset.value) return new THREE.Vector3(0, 0, 0); // Should not happen if data exists

        const grid = getActiveGrid();
        const center = worldOffset.value;
        const terrainMinZ = grid ? grid.minZ : 0;

        // X: Easting
        const wx = x - center.x;

        // Y: Elevation (Three.js Up)
        // GIS Z is absolute. Terrain logic often subtracts minZ to keep numbers small.
        // Assuming 'cover_level' is absolute.
        const wy = (z !== undefined && z !== null) ? z - terrainMinZ : 0;

        // Z: Northing (Three.js -Z)
        // GIS Y increases North. Three.js -Z is "forward/North".
        // World 0,0 is Center.
        // If GIS_Y > CenterY -> Should be negative Z (North of center).
        // -(GIS_Y - CenterY) = CenterY - GIS_Y.
        const wz = -(y - center.y);

        return new THREE.Vector3(wx, wy, wz);
    };

    // --- CLEANUP HELPER ---
    const clearGroup = (group) => {
        // Loop backwards
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            if (child.geometry) child.geometry.dispose();
            // Don't dispose shared materials if we want to reuse them, 
            // but if we created unique ones, dispose.
            // Here nodeMaterial is shared constant so we don't dispose it.
            // But if we cloned or made new ones for buildings?
            // current buildingMaterial is shared.
            group.remove(child);
        }
    };

    // --- RENDERERS ---

    const renderNodes = () => {
        clearGroup(nodeGroup);
        updateWorldOffset();

        if (!store.nodes || store.nodes.length === 0) return;

        let first = true;
        store.nodes.forEach(node => {
            const mesh = new THREE.Mesh(nodeGeometry, nodeMaterial);

            // Pos
            const pos = getLocalPos(node.x, node.y, node.cover_level);
            mesh.position.copy(pos);

            if (first) {
                console.log(`[LayerRenderer] Node[0] Local Pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
                first = false;
            }

            // Metadata
            mesh.userData = {
                id: node.id,
                type: 'node',
                data: node
            };

            nodeGroup.add(mesh);
        });

        console.log(`[LayerRenderer] Rendered ${store.nodes.length} nodes.`);
    };

    const renderBuildings = () => {
        clearGroup(buildingGroup);
        clearGroup(boundaryGroup); // Clear boundaries too
        updateWorldOffset();

        if (!store.geoJson || !store.geoJson.features) return;

        const grid = getActiveGrid();
        const gridData = getActiveData();

        store.geoJson.features.forEach(feature => {
            // Check properties logic? For now assume all valid features are buildings or context
            // Prompt says: "Beobachte store.features" (implies all)
            // But "BuildingGroup" implies buildings. Strict filter inside?
            const props = feature.properties || {};

            // Accept Polygon/MultiPolygon OR LineString/MultiLineString
            const type = feature.geometry.type;
            const isPolygon = type === 'Polygon' || type === 'MultiPolygon';
            const isLine = type === 'LineString' || type === 'MultiLineString';

            if (!isPolygon && !isLine) return;

            // --- POLYGON / BUILDING LOGIC ---
            if (isPolygon) {

                // Initial height (might be overridden by dynamic calculation below)
                let dynamicHeight = props.height !== undefined ? parseFloat(props.height) : 5.0;

                const polygons = (feature.geometry.type === 'Polygon')
                    ? [feature.geometry.coordinates]
                    : feature.geometry.coordinates;

                polygons.forEach(rings => {
                    const outerRing = rings[0];
                    if (!outerRing || outerRing.length < 3) return;

                    // --- Calculate Elevation ---
                    // Priority: 1. Existing property (Drawn buildings) 2. Sampling (Imported)
                    let baseZ = 0;

                    // If the feature already has a calculated bottom_elevation (from DrawTool), use it.
                    // Note: properties.bottom_elevation is usually absolute.
                    // terrainMinZ is the offset we subtract for visual local pos.
                    const terrainMinZ = grid ? grid.minZ : 0; // Needed for visual offset

                    if (props.bottom_elevation !== undefined && props.bottom_elevation !== null) {
                        baseZ = props.bottom_elevation - terrainMinZ;
                    }
                    else if (grid && gridData) {
                        // Sample Terrain for Imported Buildings
                        let foundMin = Infinity;
                        let foundMax = -Infinity;
                        const { cellsize, ncols, nrows, bounds, minZ } = grid;

                        outerRing.forEach(pt => {
                            const localX = pt[0] - grid.center.x;
                            const localY = pt[1] - grid.center.y;

                            const c = Math.round((localX + bounds.width / 2) / cellsize);
                            const inputZ = -(pt[1] - grid.center.y);
                            const r = Math.round((bounds.height / 2 - inputZ) / cellsize);

                            if (c >= 0 && c < ncols && r >= 0 && r < nrows) {
                                const idx = r * ncols + c;
                                const val = gridData[idx];
                                if (val > -9000) {
                                    if (val < foundMin) foundMin = val;
                                    if (val > foundMax) foundMax = val;
                                }
                            }
                        });

                        if (foundMin !== Infinity && foundMax !== -Infinity) {
                            // Dynamic Height Calculation:
                            // Ensure roof is 10m above the HIGHEST point of terrain under the building.
                            // Base is at LOWEST point.
                            const desiredRoof = foundMax + 10.0;
                            const calcHeight = desiredRoof - foundMin;

                            // Persist
                            feature.properties.bottom_elevation = foundMin;
                            feature.properties.height = calcHeight;

                            baseZ = foundMin - minZ;
                            dynamicHeight = calcHeight;
                        } else {
                            // Fallback
                            baseZ = (props.base_level !== undefined) ? (props.base_level - minZ) : 0;
                            dynamicHeight = (props.height !== undefined) ? parseFloat(props.height) : 5.0;
                        }
                    }

                    const shape = new THREE.Shape();

                    // First point
                    const p0 = getLocalPos(outerRing[0][0], outerRing[0][1], 0);
                    // We draw the shape on the X-Z plane logic
                    // Shape X = World X
                    // Shape Y = World -Z (Standard "Top Down" Shape)
                    // Wait.
                    // If we extrude, we usually define shape on XY, rotate X-90.
                    // Let's use: Shape X = World X. Shape Y = World Z (North/South component).

                    // p0.z is correct North coordinate (negative if North).
                    // Let's map coordinates exactly as they appear in World Space (referenced to center).
                    // However, `getLocalPos` returns Z = -(GIS_Y - CenterY).
                    // So Z is already "inverted GIS Y".
                    // Let's ensure consistent North orientation.
                    // If `p0.z` is coordinate in 3D scene Z-axis.
                    // We want visual consistency.

                    // Let's assume standard Plane Geometry orientation.
                    shape.moveTo(p0.x, -p0.z);
                    for (let i = 1; i < outerRing.length; i++) {
                        const p = getLocalPos(outerRing[i][0], outerRing[i][1], 0);
                        shape.lineTo(p.x, -p.z);
                    }

                    // Holes
                    for (let h = 1; h < rings.length; h++) {
                        const holeRing = rings[h];
                        if (holeRing && holeRing.length > 2) {
                            const holePath = new THREE.Path();
                            const h0 = getLocalPos(holeRing[0][0], holeRing[0][1], 0);
                            holePath.moveTo(h0.x, -h0.z);
                            for (let j = 1; j < holeRing.length; j++) {
                                const hp = getLocalPos(holeRing[j][0], holeRing[j][1], 0);
                                holePath.lineTo(hp.x, -hp.z);
                            }
                            shape.holes.push(holePath);
                        }
                    }

                    const extrudeSettings = {
                        steps: 1,
                        depth: dynamicHeight,
                        bevelEnabled: false
                    };

                    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                    const mesh = new THREE.Mesh(geometry, buildingMaterial);

                    // Rotation Fix
                    // ExtrudeGeometry extrudes along +Z (local).
                    // Our Shape was drawn in World (X, Z).
                    // If we don't rotate: 
                    //   Mesh X = World X
                    //   Mesh Y = World Z ?? No, Shape Y is Mesh Y.
                    //   Mesh Z = Extrusion.
                    // result: A flat building standing on X-Y plane, thick in Z. Wrong.

                    // We want: 
                    //   Mesh X = World X
                    //   Mesh Z = World Z (Shape Y)
                    //   Mesh Y = Extrusion (Height)

                    // Standard Rotation -90deg X:
                    //   Mesh X -> World X.
                    //   Mesh Y -> World Z? (Rotated Y maps to Z).
                    //   Mesh Z -> World -Y? (Thickness becomes Down).

                    // If Shape Y was p0.z (World Z).
                    // And we Rotate X -90.
                    // Then Shape Y (Local Y) becomes World Z?
                    //   Let's check rotation matrix for -90 X:
                    //   y' = z
                    //   z' = -y
                    // So Local Y (Shape Y) becomes Global Z. Correct.
                    // Local Z (Extrusion) becomes Global -Y (Down).

                    // So if we extrude +Height, it goes DOWN. 
                    // We want UP. 
                    // So we should extrude -Height? Or rotate +90?
                    // If we rotate +90 (PI/2):
                    //   y' = -z
                    //   z' = y
                    // Then Local Z (Extrusion) becomes Global Y (Up). Correct.
                    // But Local Y (Shape Y) becomes Global -Z.
                    // Our p0.z is Global Z.
                    // So we need Shape Y to be (-Global Z) if we rotate +90.

                    // Let's stick to Rot X -90 (Standard for "Shape on Floor"):
                    // Local Y -> Global Z. (Consistent).
                    // Local Z -> Global -Y. (Extrusion goes down).
                    // Solution: Set depth: -Height? Or Position Offset?
                    // If we set depth -height, it goes "Up" in global Y (since Local -Z is Global +Y).
                    // Let's try depth = height, but rotate X = 90 deg?

                    // Let's rely on standard logic used in Terrain:
                    // Terrain is Plane(X,Y). Rotated -90 -> Plane(X,Z). Normal (Z) becomes Y (Up).
                    // Extrusion Direction IS the Normal Direction.
                    // So if we create Shape(x,y) representing (World X, World Z? NO, World Y is mapped to Z in rotation).

                    // Okay, let's look at MapEditor3D: `terrainMesh.rotation.x = -Math.PI / 2;`
                    // This maps Plane(X,Y) to World(X,Z).
                    // And +Z (height) to +Y (Up).
                    // This means Shape X should be World X.
                    // Shape Y should be World -Z. (Because +Y maps to -Z? wait).
                    //   y_world = z_local. z_world = -y_local.
                    //   So z_world = -ShapeY. => ShapeY = -z_world.

                    // So shape.moveTo(p0.x, -p0.z).

                    // Let's try:
                    // 1. In Shape, use (x, -z).
                    // 2. Extrude +Height.
                    // 3. Rotate Mesh -90 X.
                    // Result:
                    //   Dim0 (X) -> World X.
                    //   Dim1 (Y/Shape) -> World Z? (-(-z) = z?).
                    //      y_global = z_local? No.
                    //      With RotX(-90): y_global = z_local (Extrusion). z_global = -y_local (ShapeY).
                    //      We want Extrusion to be Up (y_global). So Extrusion = Height maps to y_global. Check.
                    //      We want ShapeY to be z_global.
                    //      z_global = -ShapeY.
                    //      So ShapeY MUST be -z_global.

                    // Correct Logic:
                    // Shape X = World X
                    // Shape Y = -World Z
                    // Extrude = Height
                    // Mesh.rotation.x = -Math.PI / 2
                    // Mesh.position.y = BaseZ

                    // Implementation:
                    // p0.z contains World Z (already computed relative to center).
                    // We use -p0.z.

                    mesh.rotation.x = -Math.PI / 2; // -90 deg

                    // Base Level set via sampling above
                    mesh.position.set(0, baseZ, 0);

                    mesh.userData = {
                        id: feature.id || 'building',
                        type: 'building', // Interaction type (lowercase usually for pointer check)
                        feature: feature  // Link data
                    };
                    buildingGroup.add(mesh);
                }); // End rings.forEach
            } // End Polygon

            // --- LINE / BOUNDARY LOGIC ---
            if (isLine) {
                const lines = (type === 'LineString')
                    ? [feature.geometry.coordinates]
                    : feature.geometry.coordinates;

                lines.forEach(lineCoords => {
                    // lineCoords is array of [x,y] points
                    if (!lineCoords || lineCoords.length < 2) return;

                    const points = [];
                    lineCoords.forEach(pt => {
                        // Get Local Pos (using existing logic, z=0 if not provided)
                        // Boundaries usually sit on ground (0 relative to minZ? or Sampled?)
                        // Let's sample if possible, or assume 0 relative.
                        // But lines can climb hills!
                        // If we want them clamped to terrain, we need to segment them heavily or just use vertex points.
                        // For now, use vertex points.

                        // Sampling Z for each point
                        let z = 0;
                        if (grid && gridData) {
                            const { cellsize, ncols, nrows, bounds, minZ } = grid;
                            const localX = pt[0] - grid.center.x;
                            const inputZ = -(pt[1] - grid.center.y);

                            const c = Math.round((localX + bounds.width / 2) / cellsize);
                            const r = Math.round((bounds.height / 2 - inputZ) / cellsize);

                            if (c >= 0 && c < ncols && r >= 0 && r < nrows) {
                                const idx = r * ncols + c;
                                const val = gridData[idx];
                                if (val > -9000) z = val;
                            }
                        }

                        // getLocalPos handles subtract minZ
                        const vec = getLocalPos(pt[0], pt[1], z);
                        points.push(vec);
                    });

                    const geometry = new THREE.BufferGeometry().setFromPoints(points);
                    const line = new THREE.Line(geometry, boundaryMaterial);

                    // No rotation needed for lines if we used getLocalPos Correctly?
                    // getLocalPos returns: x=wx, y=wy(Height), z=wz(North).
                    // THREE.Line uses these coordinates directly.

                    line.userData = {
                        id: feature.id || 'boundary',
                        type: 'boundary',
                        feature: feature
                    };

                    boundaryGroup.add(line);
                });
            }
        });

        console.log(`[LayerRenderer] Rendered ${buildingGroup.children.length} buildings, ${boundaryGroup.children.length} boundaries.`);
    };

    // --- WATCHERS ---

    watch(() => store.nodes, () => renderNodes(), { deep: true, immediate: true });

    // We can also watch geoJson.features length to optimize
    watch(() => store.geoJson.features, () => renderBuildings(), { deep: true, immediate: true });

    // Watch Grid for offset updates (Store OR Preview)
    // We watch the computed getter or explicit triggers
    // Just watch store.demGrid and gridRef if it exists
    if (gridRef) {
        watch(gridRef, () => {
            updateWorldOffset();
            renderNodes();
            renderBuildings();
        }, { deep: true });
    }

    watch(() => store.demGrid, () => {
        updateWorldOffset();
        renderNodes();
        renderBuildings();
    }, { deep: true });

    // --- CLEANUP ---
    onUnmounted(() => {
        scene.remove(nodeGroup);
        scene.remove(buildingGroup);
        scene.remove(boundaryGroup);
        clearGroup(nodeGroup);
        clearGroup(buildingGroup);
        clearGroup(boundaryGroup);
        nodeGeometry.dispose();
        nodeMaterial.dispose();
        buildingMaterial.dispose();
    });

    return {
        nodeGroup,
        buildingGroup,
        renderNodes,
        renderBuildings
    };
}
