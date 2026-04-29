import * as THREE from 'three';
import { watch, onUnmounted, ref } from 'vue';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useHydraulicStore } from '../../stores/useHydraulicStore.js';

/**
 * useLayerRenderer
 * Manages the visualization of Store data (Nodes, Features) in the 3D Scene.
 * Handles Coordinate Systems: GIS (UTM) -> Three.js (Local).
 * 
 * @param {THREE.Scene} scene - The main Three.js scene
 * @param {Object} [geoStoreArg] - Optional: The Geo Store. If null, it will be retrieved internally.
 * @param {Ref} gridRef - Optional Ref to current terrain grid (parsing preview or store)
 * @param {Object} [simStoreArg] - Optional: Simulation Store reference for selection highlight
 */
export function useLayerRenderer(scene, geoStoreArg = null, gridRef = null, simStoreArg = null) {

    const geoStore = geoStoreArg || useGeoStore();
    const hydraulicStore = useHydraulicStore();
    // NEW: Access Sim Store for Selection
    // Ideally passed as arg, but fallback to import if needed.
    // However, store access inside composable usually works if inside setup context.
    // We'll rely on simStoreArg or import if not provided.
    // Since we didn't import useSimulationStore, and prompt implies "Extend useLayerRenderer",
    // we should import it if we want to watch it properly.
    // Let's DYNAMICALLY import or rely on ARG. 
    // Wait, the Prompt 2 says "Context: ... We use useSimulationStore".
    // Let's add the import.


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

    const hydraulicGroup = new THREE.Group();
    hydraulicGroup.name = 'Layer_Hydraulics';
    scene.add(hydraulicGroup);

    const weirGroup = new THREE.Group();
    weirGroup.name = 'Layer_Weirs';
    scene.add(weirGroup);

    // NEW: Selection Layer
    const selectionGroup = new THREE.Group();
    selectionGroup.name = 'Layer_Selection';
    scene.add(selectionGroup);

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

    const weirMatBidi = new THREE.MeshPhysicalMaterial({
        color: 0x3498db, // Light blue
        transparent: true,
        opacity: 0.7,
        roughness: 0.2,
        transmission: 0.5
    });

    const weirMatUni = new THREE.MeshStandardMaterial({
        color: 0xe67e22, // Orange for warning / one-way
        roughness: 0.5
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
            // BUGFIX: Wir erstellen die Geometrie für jeden Knoten neu,
            // da clearGroup() andernfalls unsere global geteilte Geometrie sofort zerstört (.dispose),
            // was dazu führt, dass THREE.js sie beim nächsten Re-Render ignoriert!
            const dynNodeGeom = new THREE.SphereGeometry(3.0, 16, 16);
            const mesh = new THREE.Mesh(dynNodeGeom, nodeMaterial);

            // Pos: Beachte, dass alte Nodes "cover_level" hatten, neue Tools (Culvert/NodeTool) setzen "z".
            const nodeZ = node.z !== undefined && node.z !== null ? node.z : node.cover_level;
            const pos = getLocalPos(node.x, node.y, nodeZ);
            mesh.position.copy(pos);

            if (first) {
                console.log(`[LayerRenderer] Node[0] Local Pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
                first = false;
            }

            // Metadata
            mesh.userData = {
                id: node.id,
                type: 'node',
                data: node,
                selectable: true
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
                        feature: feature,
                        selectable: true // NEW: Enable Raycasting
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
                        feature: feature,
                        selectable: true // NEW: Enable Raycasting
                    };

                    boundaryGroup.add(line);
                });
            }
        });

        console.log(`[LayerRenderer] Rendered ${buildingGroup.children.length} buildings, ${boundaryGroup.children.length} boundaries.`);
    };

    // --- HYDRAULIC VISUALIZATION (INSTANCED) ---

    // Cache Geometries & Materials
    const userArrowShaftGeo = new THREE.CylinderGeometry(1, 1, 15, 8); // Height 15
    const userArrowHeadGeo = new THREE.ConeGeometry(2.5, 5, 16);     // Height 5
    // Rotate geometry to base state: Pointing UP (Y+)
    userArrowShaftGeo.translate(0, 7.5, 0); // Center at base (0,0,0) -> (0,15,0)
    userArrowHeadGeo.translate(0, 17.5, 0); // Base at 15 -> Tip at 20. Center at 17.5

    // Materials (Shared)
    const arrowMatBlue = new THREE.MeshBasicMaterial({ color: 0x0000FF });
    const arrowMatRed = new THREE.MeshBasicMaterial({ color: 0xFF0000 });

    let instancedShaftMesh = null;
    let instancedHeadMesh = null;

    const renderHydraulics = () => {
        // Clear previous instances
        if (instancedShaftMesh) {
            hydraulicGroup.remove(instancedShaftMesh);
            instancedShaftMesh.dispose();
            instancedShaftMesh = null;
        }
        if (instancedHeadMesh) {
            hydraulicGroup.remove(instancedHeadMesh);
            instancedHeadMesh.dispose();
            instancedHeadMesh = null;
        }

        // Also clear legacy children just in case
        clearGroup(hydraulicGroup);

        if (!hydraulicStore.assignments) return;

        // 1. Collect all transforms & colors
        const instances = []; // { position: Vector3, color: Color, dir: 1/-1 }

        const getVisualConfig = (type) => {
            if (!type) return null;
            if (type.includes('INFLOW') || type.includes('BOUNDARY_INFLOW')) return { color: new THREE.Color(0x0000FF), dir: 1 };
            if (type.includes('OUTFLOW') || type.includes('HFIX') || type.includes('SINK')) return { color: new THREE.Color(0xFF0000), dir: -1 };
            return null;
        };

        // Helper to push instance
        const addInstance = (pos, viz) => {
            instances.push({ pos, color: viz.color, dir: viz.dir });
        };

        // A. NODES
        if (geoStore.nodes) {
            geoStore.nodes.forEach(node => {
                const config = hydraulicStore.assignments[node.id];
                if (config) {
                    const viz = getVisualConfig(config.type);
                    if (viz) addInstance(getLocalPos(node.x, node.y, node.cover_level), viz);
                }
            });
        }

        // B. BOUNDARIES
        if (geoStore.boundaries && geoStore.boundaries.features) {
            const grid = getActiveGrid();
            const gridData = getActiveData();

            geoStore.boundaries.features.forEach(feature => {
                const config = hydraulicStore.assignments[feature.id];
                const viz = config ? getVisualConfig(config.type) : null;
                if (!viz) return;

                const type = feature.geometry.type;
                if (type === 'LineString' || type === 'MultiLineString') {
                    const lines = (type === 'LineString') ? [feature.geometry.coordinates] : feature.geometry.coordinates;

                    lines.forEach(lineCoords => {
                        if (!grid) {
                            // Fallback
                            lineCoords.forEach(pt => addInstance(getLocalPos(pt[0], pt[1], 0), viz));
                            return;
                        }
                        const { cellsize, ncols, nrows, bounds } = grid;
                        const spacing = cellsize || 1.0;

                        for (let i = 0; i < lineCoords.length - 1; i++) {
                            const start = lineCoords[i];
                            const end = lineCoords[i + 1];
                            const dx = end[0] - start[0];
                            const dy = end[1] - start[1];
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            const steps = Math.max(1, Math.floor(dist / spacing));

                            for (let step = 0; step <= steps; step++) {
                                if (step === steps && i < lineCoords.length - 2) continue; // Avoid duplicate at joints

                                const t = (steps > 0) ? step / steps : 0;
                                const tx = start[0] + dx * t;
                                const ty = start[1] + dy * t;

                                // Sample Z
                                let z = 0;
                                if (gridData) {
                                    const localX = tx - grid.center.x;
                                    const inputZ = -(ty - grid.center.y);
                                    const c = Math.round((localX + bounds.width / 2) / cellsize);
                                    const r = Math.round((bounds.height / 2 - inputZ) / cellsize);
                                    if (c >= 0 && c < ncols && r >= 0 && r < nrows) z = gridData[r * ncols + c] > -9000 ? gridData[r * ncols + c] : 0;
                                }
                                addInstance(getLocalPos(tx, ty, z), viz);
                            }
                        }
                    });
                }
            });
        }

        if (instances.length === 0) return;

        // 2. Create Instanced Meshes
        // We use one material (white) and instanceColor to tint it? 
        // Or MeshBasicMaterial with vertexColors? 
        // InstancedMesh supports .setColorAt(i, color). Material usually needs vertexColors: true?
        // Actually MeshBasicMaterial doesn't support vertex colors in the same way for Instancing without custom shader usually?
        // Wait, standard Three.js InstancedMesh + MeshBasicMaterial works if we set color.

        instancedShaftMesh = new THREE.InstancedMesh(userArrowShaftGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), instances.length);
        instancedHeadMesh = new THREE.InstancedMesh(userArrowHeadGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), instances.length);

        const dummy = new THREE.Object3D();

        instances.forEach((inst, i) => {
            dummy.position.copy(inst.pos);

            // Lift arrows above terrain surface
            if (inst.dir === -1) {
                // OUTFLOW: arrow points down — raise base so tip touches terrain
                dummy.position.y += 22;
                dummy.rotation.set(Math.PI, 0, 0);
            } else {
                // INFLOW: arrow points up — small lift to clear surface
                dummy.position.y += 2;
                dummy.rotation.set(0, 0, 0);
            }

            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();

            instancedShaftMesh.setMatrixAt(i, dummy.matrix);
            instancedHeadMesh.setMatrixAt(i, dummy.matrix);

            instancedShaftMesh.setColorAt(i, inst.color);
            instancedHeadMesh.setColorAt(i, inst.color);
        });

        instancedShaftMesh.instanceMatrix.needsUpdate = true;
        instancedShaftMesh.instanceColor.needsUpdate = true;
        instancedHeadMesh.instanceMatrix.needsUpdate = true;
        instancedHeadMesh.instanceColor.needsUpdate = true;

        hydraulicGroup.add(instancedShaftMesh);
        hydraulicGroup.add(instancedHeadMesh);
    };

    // --- WEIR LOGIC ---
    const getEdgeOffset = (dir, cellSize) => {
        let ox = 0; let oz = 0;
        if (dir.startsWith('N')) oz = -cellSize / 2; // Three.js -z is North
        if (dir.startsWith('S')) oz = cellSize / 2;
        if (dir.startsWith('E')) ox = cellSize / 2;
        if (dir.startsWith('W')) ox = -cellSize / 2;
        return { ox, oz };
    };

    const renderWeirs = () => {
        clearGroup(weirGroup);
        updateWorldOffset();

        if (!geoStore.weirs || geoStore.weirs.length === 0) return;

        const grid = getActiveGrid();
        const cellSize = grid ? grid.cellsize : 1.0; 
        const terrainMinZ = grid ? grid.minZ : 0;

        geoStore.weirs.forEach(weir => {
            const isOneWay = weir.direction.includes('F');
            const mat = isOneWay ? weirMatUni : weirMatBidi;
            
            // Die visuelle Höhe = hc - minZ. Wir zeichnen eine Mauer, die bis zu dieser Höhe reicht.
            const visualHc = weir.hc - terrainMinZ;
            const displayHeight = visualHc > 0 ? visualHc : 1.0;
            const thickness = 0.5;

            // BoxGeometry(width along x, height along y, depth along z)
            const geom = new THREE.BoxGeometry(weir.w, displayHeight, thickness);
            const mesh = new THREE.Mesh(geom, mat);

            // Basis-Position & Rotation ermitteln
            const basePos = getLocalPos(weir.x, weir.y, 0); 
            const { ox, oz } = getEdgeOffset(weir.direction, cellSize);
            const isHorizontal = weir.direction.startsWith('E') || weir.direction.startsWith('W');

            if (isHorizontal) {
                mesh.rotation.y = Math.PI / 2;
            }

            mesh.position.set(basePos.x + ox, displayHeight / 2, basePos.z + oz);

            // --- NEU: Boden-Anker (Base footprint) gegen Parallaxen-Irritation in 3D ---
            // Dieser "Teppich" liegt strikt flach auf dem Terrain und verschiebt sich visuell nie.
            const footMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
            const footGeom = new THREE.PlaneGeometry(weir.w, thickness + 1.0); // Etwas dicker als die Wand, damit es auffällt
            const footMesh = new THREE.Mesh(footGeom, footMat);
            footMesh.rotation.x = -Math.PI / 2; // Flach auf den Boden legen
            if (isHorizontal) footMesh.rotation.z = Math.PI / 2;
            footMesh.position.set(basePos.x + ox, 0.1, basePos.z + oz); // 10cm über Terrain, gegen Z-Fighting
            weirGroup.add(footMesh);

            // Pfeile zur Visualisierung der Fließrichtung anheften
            const arrowDir = new THREE.Vector3();
            if (weir.direction.startsWith('N')) arrowDir.set(0, 0, -1);
            if (weir.direction.startsWith('S')) arrowDir.set(0, 0, 1);
            if (weir.direction.startsWith('E')) arrowDir.set(1, 0, 0);
            if (weir.direction.startsWith('W')) arrowDir.set(-1, 0, 0);
            
            const arrowColor = isOneWay ? 0xffffff : 0xecf0f1;
            const yHover = displayHeight / 2 + 0.5;
            
            // Lokale Rotation der Parent-Mesh kompensieren, da ArrowHelper lokal hinzugefügt wird, 
            // aber wir Vector in der Welt verwenden, ist es besser Arrow global oder invertiert lokal zu machen.
            // Einfacher: Arrow nicht im Mesh anhängen, sondern einfach ins weirGroup mit Positions-Offset
            const arrowPos = mesh.position.clone().add(new THREE.Vector3(0, displayHeight/2 + 0.5, 0));
            const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowPos, 2.0, arrowColor, 0.8, 0.5);
            weirGroup.add(arrowHelper);
            
            if (!isOneWay) {
                const arrowHelper2 = new THREE.ArrowHelper(arrowDir.clone().negate(), arrowPos, 2.0, arrowColor, 0.8, 0.5);
                weirGroup.add(arrowHelper2);
            }

            mesh.userData = {
                id: weir.id,
                type: 'weir',
                data: weir,
                selectable: true
            };

            weirGroup.add(mesh);
        });
        
        console.log(`[LayerRenderer] Rendered ${geoStore.weirs.length} weirs.`);
    };

    // --- SELECTION HIGHLIGHT ---
    const renderSelectionHighlight = (simStore) => {
        if (!simStore) return;
        clearGroup(selectionGroup);

        const idsToHighlight = new Set();
        if (simStore.selection) idsToHighlight.add(simStore.selection);
        if (simStore.multiSelection && simStore.multiSelection.size > 0) {
            simStore.multiSelection.forEach(id => idsToHighlight.add(id));
        }

        if (idsToHighlight.size === 0) return;

        // Find objects in other groups
        // We need lookup maps for efficient access, but looping scene groups is ok for small N.
        const searchGroups = [nodeGroup, buildingGroup, boundaryGroup];

        searchGroups.forEach(group => {
            group.children.forEach(child => {
                if (child.userData && idsToHighlight.has(child.userData.id)) {
                    // Create Ring
                    // Geometry: Ring or Torus. Ring is 2D, Torus is 3D.
                    // Let's use Torus for better visibility from low angles.
                    const bounds = new THREE.Box3().setFromObject(child);
                    const size = bounds.getSize(new THREE.Vector3());
                    const center = bounds.getCenter(new THREE.Vector3());

                    // Radius depends on object size
                    const radius = Math.max(size.x, size.z) / 2 + 1.0;

                    const ringGeo = new THREE.TorusGeometry(radius, 0.3, 8, 32);
                    const ringMat = new THREE.MeshBasicMaterial({
                        color: 0xffff00, // Yellow
                        transparent: true,
                        opacity: 0.8
                    });
                    const ring = new THREE.Mesh(ringGeo, ringMat);

                    // Position: Center x/z, but slightly above ground/object base
                    // If object is building, bottom is at min Y.
                    ring.position.set(center.x, bounds.min.y + 0.5, center.z);
                    ring.rotation.x = Math.PI / 2; // Flat on ground

                    selectionGroup.add(ring);
                }
            });
        });
    };


    // --- WATCHERS ---

    // EXAKTER WATCHER FÜR REAKTIVITÄT
    // Nutzt deep: true, um push() auf das Array abzufangen.
    watch(
        () => geoStore.nodes, 
        () => {
            renderNodes();
            // Optional: Wenn kein rAF-Loop existiert, müsste man hier renderer.render() callen.
            // Der Editor3D nutzt aber controls.update() im animate-Loop!
        }, 
        { deep: true, immediate: true }
    );

    // Watch both buildings and boundaries
    watch([() => geoStore.buildings.features, () => geoStore.boundaries.features], () => renderBuildings(), { deep: true, immediate: true });

    // Watch Weirs
    watch(() => geoStore.weirs, () => renderWeirs(), { deep: true, immediate: true });

    // Watch Grid for offset updates (Store OR Preview)
    if (gridRef) {
        watch(gridRef, () => {
            updateWorldOffset();
            renderNodes();
            renderBuildings();
            renderHydraulics();
            renderWeirs();
        }, { deep: true });
    }

    watch(() => geoStore.terrain, () => {
        updateWorldOffset();
        renderNodes();
        renderBuildings();
        renderHydraulics();
        renderWeirs();
    }, { deep: true });

    // Watch Hydraulic Assignments
    watch(() => hydraulicStore.assignments, () => {
        renderHydraulics();
    }, { deep: true, immediate: true });

    // NEW: Watch Selection
    if (simStoreArg) {
        watch(
            [() => simStoreArg.selection, () => simStoreArg.multiSelection], // Watch both
            () => {
                renderSelectionHighlight(simStoreArg);
            },
            { deep: true, immediate: true }
        );
    }

    // --- CLEANUP ---
    onUnmounted(() => {
        scene.remove(nodeGroup);
        scene.remove(buildingGroup);
        scene.remove(boundaryGroup);
        scene.remove(hydraulicGroup);
        scene.remove(weirGroup);
        clearGroup(nodeGroup);
        clearGroup(buildingGroup);
        clearGroup(boundaryGroup);
        clearGroup(hydraulicGroup);
        clearGroup(weirGroup);
        nodeGeometry.dispose();
        nodeMaterial.dispose();
        buildingMaterial.dispose();
    });

    return {
        nodeGroup,
        buildingGroup,
        boundaryGroup,
        weirGroup,
        renderNodes,
        renderBuildings,
        renderHydraulics,
        renderWeirs,
        hydraulicGroup,
        selectionGroup // Export group
    };
}
