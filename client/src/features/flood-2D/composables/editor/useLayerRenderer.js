import * as THREE from 'three';
import { watch, onUnmounted, ref } from 'vue';
import { useGeoStore } from '../../stores/useGeoStore.js';

/**
 * useLayerRenderer
 * Manages the visualization of Store data (Nodes, Features) in the 3D Scene.
 * Handles Coordinate Systems: GIS (UTM) -> Three.js (Local).
 * 
 * @param {THREE.Scene} scene - The main Three.js scene
 * @param {Object} [geoStoreArg] - Optional: The Geo Store. If null, it will be retrieved internally.
 * @param {Ref} gridRef - Optional Ref to current terrain grid (parsing preview or store)
 */
export function useLayerRenderer(scene, geoStoreArg = null, gridRef = null) {

    const geoStore = geoStoreArg || useGeoStore();

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
    // If 'geoStore.terrain' exists, we use its center.
    // If not, we calculate it from the first imported point.

    const worldOffset = ref(null);

    const getActiveGrid = () => {
        // Priority: Passed Ref (Preview) > Store (Accepted)
        if (gridRef && gridRef.value) return gridRef.value;
        return geoStore.terrain;
    };

    const getActiveData = () => {
        // If gridRef (Preview) has data, use it.
        const grid = getActiveGrid();
        if (grid && grid.gridData) return grid.gridData;
        // Otherwise use store raw data? GeoStore puts everything in 'terrain' object.
        if (geoStore.terrain && geoStore.terrain.gridData) return geoStore.terrain.gridData;
        return null;
    };

    const updateWorldOffset = () => {
        const grid = getActiveGrid();
        if (grid && grid.center) {
            worldOffset.value = grid.center;
        } else if (geoStore.nodes && geoStore.nodes.length > 0 && !worldOffset.value) {
            // Fallback: Initialize offset from first node
            worldOffset.value = { x: geoStore.nodes[0].x, y: geoStore.nodes[0].y };
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

        if (!geoStore.nodes || geoStore.nodes.length === 0) return;

        let first = true;
        geoStore.nodes.forEach(node => {
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

        console.log(`[LayerRenderer] Rendered ${geoStore.nodes.length} nodes.`);
    };

    const renderBuildings = () => {
        clearGroup(buildingGroup);
        clearGroup(boundaryGroup); // Clear boundaries too
        updateWorldOffset();

        // GeoStore stores buildings as FeatureCollection in 'buildings' ref
        // And boundaries in 'boundaries' ref
        // We render both here for now? Similar to original code watching store.geoJson

        // Render Buildings (Polygon)
        const buildingFeatures = geoStore.buildings.features || [];
        const boundaryFeatures = geoStore.boundaries.features || [];

        const allFeatures = [...buildingFeatures, ...boundaryFeatures];

        if (!allFeatures.length) return;

        const grid = getActiveGrid();
        const gridData = getActiveData();

        allFeatures.forEach(feature => {
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
                    mesh.rotation.x = -Math.PI / 2; // -90 deg

                    // Base Level set via sampling above
                    mesh.position.set(0, baseZ, 0);

                    mesh.userData = {
                        id: feature.id || 'building',
                        type: 'building',
                        feature: feature
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

    watch(() => geoStore.nodes, () => renderNodes(), { deep: true, immediate: true });

    // Watch both buildings and boundaries
    watch([() => geoStore.buildings.features, () => geoStore.boundaries.features], () => renderBuildings(), { deep: true, immediate: true });

    // Watch Grid for offset updates (Store OR Preview)
    if (gridRef) {
        watch(gridRef, () => {
            updateWorldOffset();
            renderNodes();
            renderBuildings();
        }, { deep: true });
    }

    watch(() => geoStore.terrain, () => {
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
        boundaryGroup,
        renderNodes,
        renderBuildings
    };
}
