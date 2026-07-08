import * as THREE from 'three';
import { watch, onUnmounted, ref } from 'vue';
import { useGeoStore } from '../../stores/useGeoStore.js';
import { useHydraulicStore } from '../../stores/useHydraulicStore.js';
import { RENDER_ORDER } from './renderLayers.js';
import { InputGenerator } from '../../middleware/InputGenerator.js';
import { useBoundaryArrows } from '../viewer/useBoundaryArrows.js';
import { buildBridge3DGeometry, buildPierGeometry } from '../../utils/Bridge3DGeometry.js';
import { buildWeirWall, buildWeirWallWire, buildWeirOpenings } from '../../utils/weirWall.js';
import { weir3DState } from './useWeir3DTool.js';
import { bridge3DState } from './useBridge3DTool.js';

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


    // --- GROUPS --- (renderOrder zentral aus renderLayers.js)
    const nodeGroup = new THREE.Group();
    nodeGroup.name = 'Layer_Nodes';
    nodeGroup.renderOrder = RENDER_ORDER.NODES;
    scene.add(nodeGroup);

    const buildingGroup = new THREE.Group();
    buildingGroup.name = 'Layer_Buildings';
    buildingGroup.renderOrder = RENDER_ORDER.BUILDINGS;
    scene.add(buildingGroup);

    const boundaryGroup = new THREE.Group();
    boundaryGroup.name = 'Layer_Boundaries';
    boundaryGroup.renderOrder = RENDER_ORDER.BOUNDARY_LINES;
    scene.add(boundaryGroup);

    const hydraulicGroup = new THREE.Group();
    hydraulicGroup.name = 'Layer_Hydraulics';
    hydraulicGroup.renderOrder = RENDER_ORDER.BOUNDARY_ARROWS;
    scene.add(hydraulicGroup);

    const weirGroup = new THREE.Group();
    weirGroup.name = 'Layer_Weirs';
    weirGroup.renderOrder = RENDER_ORDER.WEIRS;
    scene.add(weirGroup);

    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'Layer_Bridges';
    bridgeGroup.renderOrder = RENDER_ORDER.BRIDGES; // feste Geometrie unter dem Wasser
    scene.add(bridgeGroup);

    // NEW: Selection Layer
    const selectionGroup = new THREE.Group();
    selectionGroup.name = 'Layer_Selection';
    selectionGroup.renderOrder = RENDER_ORDER.SELECTION;
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

    // Unlit (MeshBasic): unabhängig von der Beleuchtung — so können die Brücken im
    // Result-Viewer nicht durch Lichtverhältnisse "verschluckt" werden.
    const bridgeOpenMat = new THREE.MeshBasicMaterial({
        color: 0x1abc9c,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
    });
    const bridgeDeckMat = new THREE.MeshBasicMaterial({
        color: 0x7f8c8d,
        side: THREE.DoubleSide,
    });
    const bridgePierMat = new THREE.MeshBasicMaterial({
        color: 0x8b5a2b, // braun: solider Pfeiler (wie die Brücke, wenn das Werkzeug nicht aktiv ist)
        side: THREE.DoubleSide,
        // Kopf liegt bündig an der Soffitte → polygonOffset gegen Z-Fighting (statt Spalt).
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });

    // Dunkle Kantenlinien für Brückenkörper + Pfeiler — macht die 3D-Form im Viewer
    // erkennbar (sonst wirkt das unlit-Mesh wie eine flache Fläche). Default-Tiefenprüfung
    // (wie weirWallLineMat), damit die Kanten nicht durch Terrain/Wasser röntgen.
    const bridgeEdgeMat = new THREE.LineBasicMaterial({ color: 0x1c2833 });

    // Grau wie das Brückendeck, unlit (MeshBasic) → konsistente Darstellung, beleuchtungsunabhängig.
    const weirMatBidi = new THREE.MeshBasicMaterial({
        color: 0x7f8c8d,
        side: THREE.DoubleSide,
    });

    const weirMatUni = new THREE.MeshBasicMaterial({
        color: 0x7f8c8d,
        side: THREE.DoubleSide,
    });
    const weirWallLineMat = new THREE.LineBasicMaterial({ color: 0xbdc3c7 });
    const weirOpeningMat = new THREE.MeshBasicMaterial({ color: 0x2c3e50, side: THREE.DoubleSide }); // dunkles Rohr

    // Geteilte (langlebige) Materialien: dürfen beim Gruppen-Clear NICHT disposed
    // werden (sonst sind sie nach dem ersten Render-Durchgang kaputt). clearGroup
    // disposed nur Geometrien + Materialien, die NICHT hier drin sind (per-Render erzeugte).
    const sharedMaterials = new Set([
        nodeMaterial, buildingMaterial, boundaryMaterial,
        bridgeOpenMat, bridgeDeckMat, bridgePierMat, bridgeEdgeMat,
        weirMatBidi, weirMatUni, weirWallLineMat, weirOpeningMat,
    ]);

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

    // Geometrisches Zentrum DIREKT aus dem Grid-Header (xll + (ncols-1)*cs/2). Das ist
    // exakt die Zentrierung des Terrain-Meshes (bounds = (ncols-1)*cs, um Szene-0 gespiegelt)
    // in BEIDEN Ansichten. Es DECKELT ein veraltetes/fehlendes grid.center — genau die Ursache
    // dafür, dass die Schächte im Ergebnis-Viewer (props.terrain.center = null → früher
    // Fallback auf den ersten Knoten) nicht zum Editor passten.
    const geometricCenter = (g) => {
        if (!g || !g.cellsize || !g.ncols || !g.nrows) return null;
        const xll = g.xllcorner ?? g.xll;
        const yll = g.yllcorner ?? g.yll;
        if (xll == null || yll == null) return null;
        return { x: xll + (g.ncols - 1) * g.cellsize / 2, y: yll + (g.nrows - 1) * g.cellsize / 2 };
    };

    const updateWorldOffset = () => {
        const grid = getActiveGrid();
        const gc = geometricCenter(grid);
        if (gc) { worldOffset.value = gc; return; }
        if (grid && grid.center) { worldOffset.value = grid.center; return; }
        if (geoStore.nodes && geoStore.nodes.length > 0 && !worldOffset.value) {
            // Letzter Fallback (kein Grid): Offset aus dem ersten Knoten.
            worldOffset.value = { x: geoStore.nodes[0].x, y: geoStore.nodes[0].y };
            console.log("[LayerRenderer] World Offset from first Node (no grid header):", worldOffset.value);
        }
    };

    const getLocalPos = (x, y, z) => {
        // IMMER frisch aus dem aktuellen Grid ableiten (nicht cachen) — im Ergebnis-Viewer
        // trifft das Terrain async ein; ein veralteter Offset würde Knoten/Netz verschieben.
        updateWorldOffset();
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

    // Terrain-Höhe (absolut, NHN) an einer Weltkoordinate aus gridData samplen.
    // gridData ist bottom-up (row 0 = Süden). Liefert null außerhalb/NoData.
    const sampleTerrainZ = (wx, wy) => {
        const g = getActiveGrid();
        const data = getActiveData();
        if (!g || !data || !g.center || !g.cellsize) return null;
        const width  = (g.ncols - 1) * g.cellsize;
        const height = (g.nrows - 1) * g.cellsize;
        const col  = Math.round((wx - (g.center.x - width / 2)) / g.cellsize);
        const rowS = Math.round((wy - (g.center.y - height / 2)) / g.cellsize);
        if (col < 0 || col >= g.ncols || rowS < 0 || rowS >= g.nrows) return null;
        const z = data[rowS * g.ncols + col];
        return (z > -9000) ? z : null;
    };

    // --- CLEANUP HELPER ---
    // REKURSIV: traversiert JEDES Kind (auch verschachtelte wie THREE.ArrowHelper,
    // der intern Line + Cone enthält) und disposed Geometrien + per-Render-Materialien.
    // Geteilte Materialien (sharedMaterials) bleiben erhalten. Behebt schwebende
    // Geister-Objekte (Wehr-Pfeile), deren innere Geometrien sonst nie freigegeben wurden.
    const disposeMaterial = (mat) => {
        if (!mat || sharedMaterials.has(mat)) return;
        if (Array.isArray(mat)) { mat.forEach(disposeMaterial); return; }
        mat.dispose?.();
    };
    const clearGroup = (group) => {
        for (let i = group.children.length - 1; i >= 0; i--) {
            const child = group.children[i];
            child.traverse?.((o) => {
                o.geometry?.dispose?.();
                disposeMaterial(o.material);
            });
            group.remove(child);
        }
    };

    // WICHTIG: In three.js wird renderOrder NICHT von der Group an die Kinder vererbt — der
    // Renderer sortiert die einzelnen Meshes nach ihrem EIGENEN renderOrder (Default 0).
    // Daher muss die Layer-Reihenfolge auf jedes Mesh gesetzt werden, sonst rendern alle
    // Bauwerke auf renderOrder 0 (vor dem Wasser-Tiefen-Prepass) und scheinen durchs Wasser.
    const applyChildOrder = (group, order) => {
        for (const c of group.children) c.renderOrder = order;
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

        applyChildOrder(nodeGroup, RENDER_ORDER.NODES);
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

        applyChildOrder(buildingGroup, RENDER_ORDER.BUILDINGS);
        applyChildOrder(boundaryGroup, RENDER_ORDER.BOUNDARY_LINES);
        console.log(`[LayerRenderer] Rendered ${buildingGroup.children.length} buildings, ${boundaryGroup.children.length} boundaries.`);
    };

    // --- HYDRAULIC / BOUNDARY VISUALIZATION ---
    // Einheitliche Boundary-Pfeile über den GETEILTEN Renderer (gleicher Stil + NoData-Filter wie der
    // Viewer). Quelle ist derselbe BCI wie für den Solver (InputGenerator.buildBci) → Pre = Post.
    // Mesh wird in hydraulicGroup gehängt (Layer-Toggle bleibt funktionsfähig).
    const boundaryArrows = useBoundaryArrows(() => hydraulicGroup, () => null);

    const renderHydraulics = () => {
        const grid = getActiveGrid();
        const data = getActiveData();
        if (!grid || !data) { boundaryArrows.build('', grid); return; }

        // Szenario aus den Stores (gleiche Form wie im Flood2DSolverRunner) → BCI bauen.
        const scenario = {
            boundaries: geoStore.boundaries?.features || [],
            manholes: (geoStore.nodes || []).map(n => ({
                type: 'Feature',
                id: n.id,
                geometry: { type: 'Point', coordinates: [n.x, n.y] },
                properties: { name: n.displayName || `Node_${n.id}` }
            })),
            assignments: hydraulicStore.assignments || {},
            ganglinien: hydraulicStore.ganglinien || {},
            globalBoundaryType: hydraulicStore.globalBoundaryType,
            globalBoundaryHfix: hydraulicStore.globalBoundaryHfix,
        };

        let bci = '';
        try {
            const { bciContent } = new InputGenerator().buildBci(scenario, grid, data);
            bci = bciContent || '';
        } catch (e) {
            console.warn('[LayerRenderer] buildBci preview failed:', e);
        }

        // Leerer BCI → vorhandene Pfeile entfernen.
        if (!bci) { boundaryArrows.build('', grid); return; }
        boundaryArrows.build(bci, grid);
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

        if ((!geoStore.weirs || geoStore.weirs.length === 0) && (!geoStore.weirLines || geoStore.weirLines.length === 0)) return;

        const grid = getActiveGrid();
        const cellSize = grid ? grid.cellsize : 1.0; 
        const terrainMinZ = grid ? grid.minZ : 0;

        // Polylinien-Wehre rendern als glatte Wand (unten), nicht als Zellen-Boxen.
        const polyIds = new Set((geoStore.weirLines || []).map(l => l.id));
        geoStore.weirs.forEach(weir => {
            if (weir.lineId && polyIds.has(weir.lineId)) return; // glatte Wand statt Treppe
            const isOneWay = weir.direction.includes('F');
            const mat = isOneWay ? weirMatUni : weirMatBidi;
            
            // Mauer am LOKALEN Geländeboden verankern (nicht am globalen Minimum!).
            // Boden = Terrainhöhe am Wehr-Standort; Höhe = Krone (hc) ÜBER diesem Boden.
            const bedZ = sampleTerrainZ(weir.x, weir.y) ?? terrainMinZ;
            const baseLocal = bedZ - terrainMinZ;                  // lokale Bodenhöhe (Y)
            const displayHeight = Math.max(weir.hc - bedZ, 0.3);   // Mauerhöhe über dem Boden
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

            mesh.position.set(basePos.x + ox, baseLocal + displayHeight / 2, basePos.z + oz);

            // --- NEU: Boden-Anker (Base footprint) gegen Parallaxen-Irritation in 3D ---
            // Dieser "Teppich" liegt strikt flach auf dem Terrain und verschiebt sich visuell nie.
            const footMat = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
            const footGeom = new THREE.PlaneGeometry(weir.w, thickness + 1.0); // Etwas dicker als die Wand, damit es auffällt
            const footMesh = new THREE.Mesh(footGeom, footMat);
            footMesh.rotation.x = -Math.PI / 2; // Flach auf den Boden legen
            if (isHorizontal) footMesh.rotation.z = Math.PI / 2;
            footMesh.position.set(basePos.x + ox, baseLocal + 0.1, basePos.z + oz); // 10cm über lokalem Boden
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

        // Polylinien-Wehre als glatte freie Wand + Öffnungs-Marker (Rohr)
        if (grid?.center) {
            (geoStore.weirLines || []).forEach(line => {
                if (weir3DState.editingId === line.id) return; // Edit-Tool zeigt eigene Vorschau
                const wallGeom = buildWeirWall(line, grid);
                if (wallGeom) weirGroup.add(new THREE.Mesh(wallGeom, weirMatBidi));
                const wire = buildWeirWallWire(line, grid);
                if (wire) {
                    const wgeo = new THREE.BufferGeometry();
                    wgeo.setAttribute('position', new THREE.BufferAttribute(wire, 3));
                    weirGroup.add(new THREE.LineSegments(wgeo, weirWallLineMat));
                }
                for (const geo of buildWeirOpenings(line, grid)) {
                    weirGroup.add(new THREE.Mesh(geo, weirOpeningMat)); // rund/rechteckig/polygonal, quer durch die Wand
                }
            });
        }

        applyChildOrder(weirGroup, RENDER_ORDER.WEIRS);
        // DIAGNOSE: Bauwerks-Höhe vs. Terrain — verrät, ob das Wehr über dem Wasser herausragt
        // oder "schwebt" (Y deutlich über terrMaxZ-terrMinZ). Auch Test, ob neuer Code läuft.
        if (geoStore.weirs.length && weirGroup.children[0]) {
            const m = weirGroup.children[0];
            const h = m.geometry?.parameters?.height;
            const terrMaxZ = grid ? grid.maxZ : 0;
            console.log(`[LayerRenderer][DIAG] Weir[0] Y=${m.position.y.toFixed(2)} boxH=${typeof h === 'number' ? h.toFixed(2) : '?'} | Terrain lokal 0..${(terrMaxZ - terrainMinZ).toFixed(2)} (minZ=${terrainMinZ}, maxZ=${terrMaxZ})`);
        }
        console.log(`[LayerRenderer] Rendered ${geoStore.weirs.length} weirs.`);
    };

    const renderBridge3D = (bridge, grid) => {
        if (!grid?.center) return;
        const geom = buildBridge3DGeometry(bridge, grid);
        if (!geom) return;
        const mesh = new THREE.Mesh(geom, bridgeDeckMat);
        mesh.userData = { id: bridge.id, type: 'bridge', selectable: true };
        // Während des Vertex-Editings rendert das Tool seinen eigenen Preview-Body —
        // das Layer-Duplikat ausblenden, sonst flackern zwei Körper übereinander.
        const editing = bridge3DState.editingId === bridge.id;
        if (editing) mesh.visible = false;
        bridgeGroup.add(mesh);

        // Silhouetten-Kanten des Körpers als Linien → 3D-Form bleibt erkennbar.
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 25), bridgeEdgeMat);
        edges.userData = { id: bridge.id, type: 'bridge' };
        if (editing) edges.visible = false;
        bridgeGroup.add(edges);

        // Pfeiler (lattice.piers): solide Box wie die Brücke (Werkzeug nicht aktiv).
        // Der transparente Wireframe-Look gilt nur im Edit-Modus (useBridge3DTool).
        const pierGeom = buildPierGeometry(bridge, grid);
        if (pierGeom) {
            const pierMesh = new THREE.Mesh(pierGeom, bridgePierMat);
            pierMesh.userData = { id: bridge.id, type: 'bridge' };
            if (editing) pierMesh.visible = false;
            bridgeGroup.add(pierMesh);

            // Kantenlinien der Pfeiler-Boxen (gleiche Silhouetten-Logik).
            const pierEdges = new THREE.LineSegments(new THREE.EdgesGeometry(pierGeom, 25), bridgeEdgeMat);
            pierEdges.userData = { id: bridge.id, type: 'bridge' };
            if (editing) pierEdges.visible = false;
            bridgeGroup.add(pierEdges);
        }
    };

    const renderBridges = () => {
        clearGroup(bridgeGroup);
        updateWorldOffset();

        if (!geoStore.bridges || geoStore.bridges.length === 0) return;

        const grid      = getActiveGrid();
        const cellSize  = grid ? grid.cellsize : 1.0;
        const terrMinZ  = grid ? grid.minZ : 0;

        geoStore.bridges.forEach(bridge => {
            // 3D-Brückenkörper: Volumenmesh aus Footprint + Lattice statt Box-Paaren.
            if (bridge.kind === 'mesh3d') {
                renderBridge3D(bridge, grid);
                return;
            }
            const cells = bridge.cells || [];
            cells.forEach(cell => {
                // Z-Anker robust aufs Terrain legen: lokale Geländehöhe der Zelle als Basis.
                // Verhindert "vergrabene" Brücken, wenn z_sohle fehlt oder fälschlich 0/unter Terrain ist.
                const terr = cell.z ?? bridge.z_sohle ?? 0;
                let z_sohle = cell.z_sohle ?? bridge.z_sohle;
                if (z_sohle == null || z_sohle < terr - 0.01) z_sohle = terr;
                let soffit = cell.soffit ?? bridge.soffit ?? (z_sohle + 2.0);
                if (soffit < z_sohle + 0.1) soffit = z_sohle + 2.0;
                let deck = cell.deck ?? bridge.deck ?? (soffit + 1.0);
                if (deck < soffit + 0.1) deck = soffit + 1.0;
                const width   = bridge.width ?? 5.0;
                const dir     = cell.direction || 'S';

                const openH = Math.max(soffit - z_sohle, 0.1);
                const deckH = Math.max(deck   - soffit,  0.1);

                const basePos  = getLocalPos(cell.x, cell.y, 0);
                const { ox, oz } = getEdgeOffset(dir, cellSize);
                const isHoriz  = dir.startsWith('E') || dir.startsWith('W');

                // Öffnungs-Box (cyan, semi-transparent)
                const openGeom = new THREE.BoxGeometry(width, openH, 0.4);
                const openMesh = new THREE.Mesh(openGeom, bridgeOpenMat);
                if (isHoriz) openMesh.rotation.y = Math.PI / 2;
                const openY = (z_sohle - terrMinZ) + openH / 2;
                openMesh.position.set(basePos.x + ox, openY, basePos.z + oz);
                openMesh.userData = { id: bridge.id, type: 'bridge', selectable: true };
                bridgeGroup.add(openMesh);

                // Deck-Box (grau, solid)
                const deckGeom = new THREE.BoxGeometry(width, deckH, cellSize * 0.8);
                const deckMesh = new THREE.Mesh(deckGeom, bridgeDeckMat);
                if (isHoriz) deckMesh.rotation.y = Math.PI / 2;
                const deckY = (soffit - terrMinZ) + deckH / 2;
                deckMesh.position.set(basePos.x + ox, deckY, basePos.z + oz);
                deckMesh.userData = { id: bridge.id, type: 'bridge' };
                bridgeGroup.add(deckMesh);
            });
        });

        const firstMesh = bridgeGroup.children[0];
        const firstPos = firstMesh ? `(${firstMesh.position.x.toFixed(1)}, ${firstMesh.position.y.toFixed(1)}, ${firstMesh.position.z.toFixed(1)})` : 'none';
        applyChildOrder(bridgeGroup, RENDER_ORDER.BRIDGES);
        console.log(`[LayerRenderer] Rendered ${geoStore.bridges.length} bridge(s) → ${bridgeGroup.children.length} meshes, firstPos=${firstPos}, gridCenter=${getActiveGrid()?.center ? 'ok' : 'MISSING'}`);
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
        applyChildOrder(selectionGroup, RENDER_ORDER.SELECTION);
    };


    // --- WATCHERS ---

    // EXAKTER WATCHER FÜR REAKTIVITÄT — deep:true fängt In-Place-push()/Property-Edits ab.
    // Render-Koaleszenz: mehrere Watcher-Treffer in EINEM Tick (Terrain-Change → alle Layer,
    // Node-Edit → Nodes+Hydraulik, schnelles Punkt-Ziehen) werden zu EINEM Rebuild je Layer
    // zusammengefasst. Teuer war nicht das Tracking, sondern das mehrfache Clear+Rebuild der
    // Three.js-Gruppen pro Edit.
    let _disposed = false;
    const _pendingRenders = new Set();
    let _flushScheduled = false;
    function schedule(...keys) {
        for (const k of keys) _pendingRenders.add(k);
        if (_flushScheduled) return;
        _flushScheduled = true;
        queueMicrotask(() => {
            _flushScheduled = false;
            if (_disposed) { _pendingRenders.clear(); return; }
            const jobs = new Set(_pendingRenders);
            _pendingRenders.clear();
            if (jobs.has('offset'))     updateWorldOffset();   // zuerst: Layer-Positionen hängen daran
            if (jobs.has('nodes'))      renderNodes();
            if (jobs.has('buildings'))  renderBuildings();
            if (jobs.has('hydraulics')) renderHydraulics();
            if (jobs.has('weirs'))      renderWeirs();
            if (jobs.has('bridges'))    renderBridges();
            if (jobs.has('selection') && simStoreArg) renderSelectionHighlight(simStoreArg);
        });
    }

    watch(() => geoStore.nodes, () => schedule('nodes'), { deep: true, immediate: true });

    // Buildings + Boundaries (Footprints)
    watch([() => geoStore.buildings.features, () => geoStore.boundaries.features],
          () => schedule('buildings'), { deep: true, immediate: true });

    // Weirs
    watch(() => geoStore.weirs,        () => schedule('weirs'), { deep: true, immediate: true });
    watch(() => geoStore.weirLines,    () => schedule('weirs'), { deep: true });
    watch(() => weir3DState.editingId, () => schedule('weirs')); // Edit-Linie aus-/einblenden
    // Bridges
    watch(() => geoStore.bridges,      () => schedule('bridges'), { deep: true, immediate: true });

    // Grid-Offset (Store ODER Preview) → alle Layer neu positionieren
    if (gridRef) {
        watch(gridRef, () => schedule('offset', 'nodes', 'buildings', 'hydraulics', 'weirs', 'bridges'), { deep: true });
    }
    watch(() => geoStore.terrain, () => schedule('offset', 'nodes', 'buildings', 'hydraulics', 'weirs', 'bridges'), { deep: true });

    // Hydraulik (Pfeil-Vorschau): Assignments, globale BC-Einstellung, Boundaries, Nodes
    watch(() => hydraulicStore.assignments, () => schedule('hydraulics'), { deep: true, immediate: true });
    watch(() => [hydraulicStore.globalBoundaryType, hydraulicStore.globalBoundaryHfix], () => schedule('hydraulics'));
    watch(() => geoStore.boundaries, () => schedule('hydraulics'), { deep: true });
    watch(() => geoStore.nodes,      () => schedule('hydraulics'), { deep: true });

    // Selektion
    if (simStoreArg) {
        watch([() => simStoreArg.selection, () => simStoreArg.multiSelection],
              () => schedule('selection'), { deep: true, immediate: true });
    }

    // --- CLEANUP ---
    onUnmounted(() => {
        _disposed = true;
        scene.remove(nodeGroup);
        scene.remove(buildingGroup);
        scene.remove(boundaryGroup);
        scene.remove(hydraulicGroup);
        scene.remove(weirGroup);
        scene.remove(bridgeGroup);
        clearGroup(nodeGroup);
        clearGroup(buildingGroup);
        clearGroup(boundaryGroup);
        clearGroup(hydraulicGroup);
        clearGroup(weirGroup);
        clearGroup(bridgeGroup);
        nodeGeometry.dispose();
        // Beim endgültigen Unmount auch die geteilten Materialien freigeben.
        for (const m of sharedMaterials) m.dispose?.();
    });

    return {
        nodeGroup,
        buildingGroup,
        boundaryGroup,
        weirGroup,
        bridgeGroup,
        renderNodes,
        renderBuildings,
        renderHydraulics,
        renderWeirs,
        renderBridges,
        hydraulicGroup,
        selectionGroup,
        // Welt→Szene-Transform, damit weitere Layer (z. B. Kanalnetz) dieselbe Zentrierung nutzen.
        getLocalPos,
        worldOffset,
    };
}
