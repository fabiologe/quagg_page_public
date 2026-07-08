<template>
  <div ref="container" class="result-map-3d"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import * as THREE from 'three';
import { useVolumeTool } from '@/features/flood-2D/composables/useVolumeTool';
import { useSectionTool } from '@/features/flood-2D/composables/useSectionTool';
import { useAnalysisStore } from '@/features/flood-2D/stores/useAnalysisStore';
import { useGeoStore } from '@/features/flood-2D/stores/useGeoStore';
import { useLayerRenderer } from '@/features/flood-2D/composables/editor/useLayerRenderer';
import { useNetworkRenderer } from '@/features/flood-2D/composables/editor/useNetworkRenderer';
import { makeResultCoords } from '@/features/flood-2D/composables/viewer/useResultCoords';
import { useResultScene } from '@/features/flood-2D/composables/viewer/useResultScene';
import { useFlowArrows } from '@/features/flood-2D/composables/viewer/useFlowArrows';
import { useFlowStreamlines } from '@/features/flood-2D/composables/viewer/useFlowStreamlines';
import { useDangerMarkers } from '@/features/flood-2D/composables/viewer/useDangerMarkers';
import { findSectionStructures } from '@/features/flood-2D/utils/sectionStructures';
import { useResultProbes } from '@/features/flood-2D/composables/viewer/useResultProbes';
import { useTerrainLayer } from '@/features/flood-2D/composables/viewer/useTerrainLayer';
import { useWaterSurface } from '@/features/flood-2D/composables/viewer/useWaterSurface';
import { collectPierCells } from '@/features/flood-2D/utils/BridgeMeshLattice.js';

const props = defineProps({
  terrain: { type: Object, default: null },
  depthData: { type: Object, default: null }, // Float32Array or null
  elevData: { type: Object, default: null }, // Wasserspiegel .elev des Frames (Float32Array) — exakte Solver-Oberfläche
  maxWaterDepth: { type: Number, default: 1.0 },
  layerMode: { type: Number, default: 0 }, // 0=depth, 1=velocity, 2=max/hazard
  bciContent: { type: String, default: null },
  activeTool: { type: String, default: null },
  flowData: { type: Object, default: null },     // { vx: Float32Array, vy: Float32Array } | null (zell-zentriert)
  showFlow: { type: Boolean, default: false },   // Fließpfeil-Layer aktiv?
  showStreamlines: { type: Boolean, default: false }, // animierte Strömungslinien-Layer aktiv?
  detectSpikes: { type: Boolean, default: true },     // Tiefen-Dorne kappen + als Gefahr markieren (nur Tiefen-Layer)
  depthField: { type: Object, default: null },   // aktuelles Tiefen-Frame (Float32Array) für Nass-Gating/Höhe
  velocityData: { type: Object, default: null }, // Geschwindigkeits-Betrag-Frame (Float32Array) für die Heatmap
  velocityMin: { type: Number, default: 0.0 },   // unteres Ende der Velocity-Farbskala (Bereichsregler)
  velocityMax: { type: Number, default: 1.0 },   // oberes Ende der Velocity-Farbskala (Bereichsregler)
  flowDensity: { type: Number, default: 0.5 },   // 0..1 Dichte der Fließpfeile
  waterOpacity: { type: Number, default: 0.85 }  // globale Wasser-Deckkraft 0..1
});

const emit = defineEmits(['cellProbed', 'sectionDrawn', 'waterStats']);

const container = ref(null);

// Store/Composable
const analysisStore = useAnalysisStore();
const geoStore = useGeoStore(); // Needed for layer renderer + Gebäudemaske

// Three.js-Infrastruktur (Szene/Kamera/Renderer/Controls/Loop/Dispose) lebt in useResultScene.
const sceneApi = useResultScene();
let renderer, scene, camera, controls; // Referenzen aus sceneApi.init() — von vielen Funktionen genutzt
let terrainMesh = null; // Read-only-Spiegel von terrainApi.getMesh() für Raycast/Tools

// Gelände-Mesh + Gebäudemaske (Besitzer der Maske). Die Boundary-Pfeile konsumieren die Maske per Accessor.
const terrainApi = useTerrainLayer({
  getScene: () => scene,
  geoStore,
});
// Gefahren-/Instabilitätsmarker (gekappte Tiefen-Dorne sichtbar halten).
const dangerApi = useDangerMarkers(() => scene);
// Wasser als 2D-Haut: klont die (gelochte) Terrain-Geometrie und displaced pro Frame nur das Z-Attribut.
// getWeirFaces liefert die Wehre, an deren Kanten die Wasserhaut aufgetrennt wird (kein Durchscheinen).
const waterApi = useWaterSurface({
  getScene: () => scene,
  getTerrainMesh: () => terrainApi.getMesh(),
  getWeirFaces: () => geoStore.weirs,
  props,
  // Pro Frame: erkannte Tiefen-Dorne als Marker setzen + Anzahl/Deckel an die UI melden.
  onStats: ({ robustMax, flagged }) => {
    dangerApi.rebuild(flagged, props.terrain, null, robustMax);
    dangerApi.setVisible(flagged.length > 0);
    emit('waterStats', { outlierCount: flagged.length, robustMax, outliers: flagged });
  },
});
const probeApi = useResultProbes(() => scene); // Probe-Ring-Marker

// Hindernis-Maske fürs Velocity-Overlay: Gebäudemaske (top-down, <128) + Brücken-PFEILER.
// Pfeiler sind nicht im 2D-Velocity-Raster (Physik blockt sie nur im SGC-Sub-Grid), daher
// laufen Linien/Pfeile sonst hindurch. Hier werden ihre Zellen wie Gebäude maskiert (rein
// optisch, passend zum 3D-Modell). Gemerkt, bis sich Brücken/Terrain ändern.
let _obstacleCache = { key: null, mask: null };
function obstacleMask() {
  const t = props.terrain;
  if (!t) return terrainApi.getMask();
  const { ncols, nrows } = t;
  const base = terrainApi.getMask(); // kann null sein (vor Terrain-Build)
  const bridges = geoStore.bridges || [];
  const key = `${ncols}x${nrows}|${base ? 'm' : '0'}|${bridges.map(b => b.id).join(',')}`;
  if (_obstacleCache.key === key) return _obstacleCache.mask;

  const piers = collectPierCells(bridges, t); // "col,row", row bottom-up (row 0 = Süd)
  if (piers.size === 0) { _obstacleCache = { key, mask: base }; return base; }

  const out = base ? base.slice() : new Uint8Array(ncols * nrows).fill(255);
  for (const k of piers) {
    const ci = k.indexOf(',');
    const col = +k.slice(0, ci), rS = +k.slice(ci + 1);
    const rTop = nrows - 1 - rS; // Maske ist top-down wie das Velocity-Raster
    if (col >= 0 && col < ncols && rTop >= 0 && rTop < nrows) out[rTop * ncols + col] = 0;
  }
  _obstacleCache = { key, mask: out };
  return out;
}

// Fließpfeil-Overlay (gerichtete Velocity-Pfeile) — eigenes Composable
const flowApi = useFlowArrows(() => scene, obstacleMask);
// Strömungslinien-Overlay (integrierte, animierte CFD-Linien) — eigenes Composable
const streamApi = useFlowStreamlines(() => scene, obstacleMask); // Gebäude + Pfeiler ausblenden

const highlightMeshes = new Map(); // Track multiple polygon highlight meshes
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let volumeToolState = null;
let sectionToolState = null;
let layerRenderer = null;
let networkRenderer = null;   // Kanalnetz im Ergebnis-Viewer (read-only)


// --- INIT ---

onMounted(() => {
  if (!container.value) return;
  initScene();

  // CRITICAL: Check if terrain was already set before scene was ready
  // The immediate watcher fires during setup() BEFORE onMounted,
  // so buildTerrain() would have returned early (scene was null).
  if (props.terrain && !terrainMesh) {
    console.log('[ResultMap3D] Terrain was waiting — building now after scene init');
    buildTerrain(props.terrain);
    if (props.depthData) waterApi.update(props.depthData);
    // Boundary-Pfeile NUR im Editor (ScenarioManager) — im Ergebnis-Viewer ausgeblendet.
  }

  // Memory Guard: purgeSimulationResults() dispatches this event to
  // trigger a full WebGL resource release without unmounting the component.
  window.addEventListener('flood-viewer-dispose', _handleViewerDispose);
});

onUnmounted(() => {
  streamApi.dispose();
  dangerApi.dispose();
  sceneApi.dispose();
  networkRenderer?.dispose?.();
  window.removeEventListener('resize', onResize);
  window.removeEventListener('flood-viewer-dispose', _handleViewerDispose);
});

/**
 * Handles the 'flood-viewer-dispose' CustomEvent dispatched by purgeSimulationResults().
 * Disposes all Three.js geometries, materials and textures currently in the scene
 * to release GPU memory without unmounting the Vue component.
 */
function _handleViewerDispose() {
  console.warn('[ResultMap3D] flood-viewer-dispose received — releasing WebGL resources.');
  sceneApi.releaseResources();
  // Mesh-Referenzen lösen, damit buildTerrain()/waterApi.update() frische Objekte erzeugen.
  terrainApi.reset();
  waterApi.reset();
  terrainMesh = null; // Spiegel ebenfalls leeren
  console.info('[ResultMap3D] ✅ WebGL resources disposed. Scene cleared.');
}

function initScene() {
  // Szene/Kamera/Renderer/Controls/Lichter aus dem Scene-Composable beziehen
  const s = sceneApi.init(container.value);
  scene = s.scene; camera = s.camera; renderer = s.renderer; controls = s.controls;

  // Setup Volume Tool Composable
  volumeToolState = useVolumeTool({
    scene,
    camera,
    renderer: { value: { domElement: renderer.domElement } }, // Ensure structure matches expected ref structure
    getTerrainMesh: () => terrainMesh,
    onPolygonDrawn: (points) => {
      // Points are in World Coordinates.
      // We must translate them to real-world grid space (EPSG coordinates).
      if (props.terrain && terrainMesh) {
        const { ncols, nrows, cellsize, xllcorner, yllcorner } = props.terrain;
        const bounds = props.terrain.bounds || {
          width: (ncols - 1) * cellsize,
          height: (nrows - 1) * cellsize
        };

        const geoPoints = points.map(pt => {
           const local = terrainMesh.worldToLocal(pt.clone());
           return {
             x: xllcorner + (local.x + bounds.width / 2),
             y: yllcorner + (local.y + bounds.height / 2)
           };
        });

        const id = Math.random().toString(36).substring(2, 9);
        const polyColors = ['#00e5ff', '#ffeb3b', '#ff4081', '#76ff03', '#e040fb', '#ff9800', '#18ffff'];
        const color = polyColors[Math.floor(Math.random() * polyColors.length)];

        analysisStore.addPolygon(geoPoints, props.terrain, id, color);

        return { id, color };
      }
      return null;
    },
    onDrawStart: () => {
      if (controls) controls.enabled = false;
    },
    onDrawEnd: () => {
      if (controls) controls.enabled = true;
    }
  });

  // Setup Section Tool Composable
  sectionToolState = useSectionTool({
    scene,
    camera,
    renderer: { value: { domElement: renderer.domElement } },
    getTerrainMesh: () => terrainMesh,
    onSectionDrawn: (startPt, endPt) => {
      if (props.terrain && terrainMesh) {
        const id = Math.random().toString(36).substring(2, 9);
        const polyColors = ['#ffeb3b', '#ff4081', '#76ff03', '#00e5ff', '#e040fb', '#ff9800', '#18ffff'];
        const color = polyColors[Math.floor(Math.random() * polyColors.length)];

        const res = computeSectionData(startPt, endPt);
        if (res && res.samples && res.samples.length > 0) {
          emit('sectionDrawn', { id, color, samples: res.samples, structures: res.structures });
          return { id, color };
        }
      }
      return null;
    },
    onDrawStart: () => {
      if (controls) controls.enabled = false;
    },
    onDrawEnd: () => {
      if (controls) controls.enabled = true;
    }
  });

  // Setup Layer Renderer (Buildings, Nodes, Boundaries)
  // We pass `scene`, `geoStore`, and a computed ref of the current terrain.
  // This is CRITICAL because the renderer needs the terrain's center point
  // to calculate the local coordinate offset for drawing features.
  layerRenderer = useLayerRenderer(scene, geoStore, computed(() => props.terrain));

  // Kanalnetz (useNetworkStore) auch im Ergebnis-Viewer rendern — self-contained, nutzt
  // denselben (geometrisch abgeleiteten) Welt→Szene-Transform wie der Editor, sodass die
  // Schächte/Haltungen exakt auf dem Ergebnis-Gelände liegen.
  networkRenderer = useNetworkRenderer(scene, layerRenderer.getLocalPos);

  if (geoStore.buildings?.features?.length > 0) {
      layerRenderer.renderBuildings();
  }
  
  // Watch for GeoStore hydration: The ResultViewer might load the terrain mesh
  // BEFORE the GeoStore has finished loading buildings/nodes from IndexedDB.
  // We must trigger the renderer when the data actually arrives.
  watch(() => geoStore.buildings?.features, (newFeatures) => {
    if (newFeatures && newFeatures.length > 0 && layerRenderer && terrainMesh) {
      console.log('[ResultMap3D] GeoStore buildings loaded, triggering render.');
      terrainApi.regenerateMask(props.terrain); // Maske aktualisieren, wenn Gebäude eintreffen
      layerRenderer.renderBuildings();
    }
  }, { deep: true });

  watch(() => geoStore.nodes, (newNodes) => {
    if (newNodes && newNodes.length > 0 && layerRenderer && terrainMesh) {
      console.log('[ResultMap3D] GeoStore nodes loaded, triggering render.');
      layerRenderer.renderNodes();
    }
  }, { deep: true });

  // Wehre im Result-Viewer darstellen
  if (geoStore.weirs?.length > 0) {
      layerRenderer.renderWeirs();
  }

  watch(() => geoStore.weirs, (newWeirs) => {
    if (newWeirs && newWeirs.length > 0 && layerRenderer && terrainMesh) {
      console.log('[ResultMap3D] GeoStore weirs loaded, triggering render.');
      layerRenderer.renderWeirs();
      waterApi.invalidate(); // Wasserhaut an den (neu geladenen) Wehr-Kanten auftrennen
    }
  }, { deep: true });

  // Brücken im Result-Viewer darstellen
  if (geoStore.bridges?.length > 0) {
      layerRenderer.renderBridges();
  }

  watch(() => geoStore.bridges, (newBridges) => {
    if (newBridges && newBridges.length > 0 && layerRenderer && terrainMesh) {
      console.log('[ResultMap3D] GeoStore bridges loaded, triggering render.');
      layerRenderer.renderBridges();
    }
  }, { deep: true });

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  sceneApi.start();
  console.log('[ResultMap3D] Scene initialized ✅');
}

const clearVolume = () => {
  if (volumeToolState) volumeToolState.clearPolygon();
};

const removeVolumePolygon = (id) => {
  if (volumeToolState) volumeToolState.removePolygonMesh(id);
};

// --- TOOLS / INTERACTION ---

function getIntersection(event) {
  if (!terrainMesh || !props.terrain) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(terrainMesh);
  if (hits.length === 0) return null;

  return hits[0]; // { point (world), object, etc }
}

function onPointerMove(event) {
  // Volume and Section tools handle pointer move via composable event listeners
}

function onPointerDown(event) {
  // Volume and Section tools handle pointer down via composable event listeners
  if (props.activeTool === 'volume' || props.activeTool === 'section') return;

  const hit = getIntersection(event);
  if (!hit) return;

  const localPt = terrainMesh.worldToLocal(hit.point.clone());
  const coords = makeResultCoords(props.terrain);
  const cell = coords.localHitToCell(localPt);
  if (!cell) return;

  // --- PROBE TOOL ---
  if (props.activeTool === 'probe') {
    const id = Math.random().toString(36).substring(2, 9);
    emit('cellProbed', {
      id, col: cell.col, row: cell.gridRow,
      terrainZ: cell.terrainZ, worldX: cell.worldX, worldY: cell.worldY,
      cellsize: coords.cellsize,
    });
    probeApi.place(localPt, cell.terrainZ - coords.minZ, coords.cellsize, id);
  }
}

function computeSectionData(startPtWorld, endPtWorld) {
  if (!props.terrain) return;
  const { ncols, nrows, cellsize, gridData, xllcorner, yllcorner } = props.terrain;

  // Transform world points to local terrain space (where Z is up, X/Y are flat)
  const localStart = terrainMesh.worldToLocal(startPtWorld.clone());
  const localEnd = terrainMesh.worldToLocal(endPtWorld.clone());

  // Convert local Plane coordinates back to real-world Geo coordinates (zentrale Konvertierung)
  const coords = makeResultCoords(props.terrain);
  const { x: realStartX, y: realStartY } = coords.localToReal(localStart.x, localStart.y);
  const { x: realEndX,   y: realEndY }   = coords.localToReal(localEnd.x,   localEnd.y);

  const dx = realEndX - realStartX;
  const dy = realEndY - realStartY;
  const totalDist = Math.sqrt(dx*dx + dy*dy);
  
  if (totalDist < cellsize * 0.1) return; // Too short
  
  // Sample a point every half cellsize
  const sampleCount = Math.max(10, Math.ceil(totalDist / (cellsize * 0.5)));
  const samples = [];

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const x = realStartX + t * dx;
    const y = realStartY + t * dy;
    const distance = t * totalDist;

    // Interpolate Grid Z
    // Grid indices:
    // col = (x - xll) / cellsize
    // row (bottom-up) = (y - yll) / cellsize
    const fx = (x - xllcorner) / cellsize;
    const fy = (y - yllcorner) / cellsize;

    // Bilinear Interpolation
    const col0 = Math.floor(fx);
    const col1 = col0 + 1;
    const row0 = Math.floor(fy);
    const row1 = row0 + 1;

    const wx = fx - col0;
    const wy = fy - row0;

    let z = null;
    let validPts = 0;
    let zSum = 0;
    let wSum = 0;

    // Helper to get grid val
    const getZ = (c, r, weight) => {
      if (c >= 0 && c < ncols && r >= 0 && r < nrows) {
        const val = gridData[r * ncols + c];
        if (val > -9000) {
          zSum += val * weight;
          wSum += weight;
        }
      }
    };

    getZ(col0, row0, (1-wx)*(1-wy));
    getZ(col1, row0, wx*(1-wy));
    getZ(col0, row1, (1-wx)*wy);
    getZ(col1, row1, wx*wy);

    if (wSum > 0.001) {
       z = zSum / wSum;
    }

    if (z !== null) {
      samples.push({
        distance,
        terrainZ: z,
        fx, // save fractional grid position for fast water lookup later
        fy
      });
    }
  }

  if (samples.length > 0) {
    // Bauwerke (Wehre/Brücken), die der Schnitt kreuzt — in Schnitt-Distanz projiziert.
    let structures = [];
    try {
      structures = findSectionStructures(
        realStartX, realStartY, realEndX, realEndY, cellsize,
        geoStore.weirs, geoStore.bridges, props.terrain
      );
    } catch (e) {
      console.warn('[ResultMap3D] Bauwerks-Schnitt fehlgeschlagen:', e);
    }
    console.log(`[ResultMap3D] Sampled ${samples.length} points, ${structures.length} Bauwerk(e) for Cross-Section`);
    return { samples, structures };
  }
  return null;
}



// Reaktion auf Layer-Wechsel / Frame-Wechsel / Dichteänderung
watch([() => props.showFlow, () => props.flowData, () => props.flowDensity], ([show, field]) => {
  if (show && field && field.vx && field.vy) {
    flowApi.rebuild(field, props.terrain, props.depthField, props.flowDensity);
    flowApi.setVisible(true);
  } else {
    flowApi.setVisible(false);
    flowApi.clear();
  }
});

// Strömungslinien (animiert) — gleiche Quelle wie Pfeile, eigener Layer.
watch([() => props.showStreamlines, () => props.flowData, () => props.flowDensity, () => props.depthField],
  ([show, field]) => {
    if (show && field && field.vx && field.vy) {
      streamApi.rebuild(field, props.terrain, props.depthField, props.flowDensity);
      streamApi.setVisible(true);
    } else {
      streamApi.setVisible(false);
      streamApi.clear();
    }
  });


watch(() => props.activeTool, (newTool) => {
  if (volumeToolState) {
    if (newTool === 'volume') volumeToolState.enable();
    else volumeToolState.disable();
  }
  
  if (sectionToolState) {
    if (newTool === 'section') {
        sectionToolState.enable();
    } else {
        sectionToolState.disable();
    }
  }
  
  // Make sure controls are re-enabled if tool is cancelled mid-draw
  if (controls) controls.enabled = true;
});

function onResize() {
  sceneApi.resize(container.value);
}

// --- TERRAIN BUILDING ---


// Watch for terrain changes AFTER scene is ready
watch(() => props.terrain, (t) => {
  if (t && scene) {
    console.log('[ResultMap3D] Terrain prop changed — building');
    buildTerrain(t);
    // Boundary-Pfeile im Ergebnis-Viewer ausgeblendet (nur Editor).
  }
});

// Terrain-Mesh + Gebäudemaske baut die Terrain-Schicht (useTerrainLayer); hier bleibt nur die
// Orchestrierung: Mesh-Spiegel aktualisieren, Kamera einpassen, Feature-Layer nachziehen.
function buildTerrain(t) {
  const res = terrainApi.build(t);
  terrainMesh = terrainApi.getMesh(); // Read-only-Spiegel für Raycast/Tools aktualisieren
  if (!res) return;
  const { bounds } = res;

  // Kamera auf das Gelände einpassen
  const maxDim = Math.max(bounds.width, bounds.height);
  camera.position.set(0, maxDim * 0.7, maxDim * 0.7);
  controls.target.set(0, 0, 0);
  controls.update();

  if (layerRenderer) {
      // Features auf Basis des nun solide geladenen Terrains (neu) rendern
      layerRenderer.renderBuildings();
      layerRenderer.renderNodes();
      if (geoStore.weirs?.length > 0) {
          layerRenderer.renderWeirs();
      }
      // Brücken analog zu den Wehren nach dem Terrain-Build rendern (sonst fehlt der
      // garantierte Post-Terrain-Render und die Brücken bleiben unsichtbar).
      if (geoStore.bridges?.length > 0) {
          layerRenderer.renderBridges();
          console.log(`[ResultMap3D] Rendered ${geoStore.bridges.length} bridge(s) after terrain build.`);
      }
  }
}

// --- POLYGON HIGHLIGHT LAYER ---

watch(() => analysisStore.polygons, (newPolygons) => {
  if (!scene || !props.terrain) return;

  const currentIds = newPolygons.map(p => p.id);
  
  // Remove deleted ones
  for (const [id, mesh] of highlightMeshes.entries()) {
    if (!currentIds.includes(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      highlightMeshes.delete(id);
    }
  }

  // Add new ones
  for (const poly of newPolygons) {
    if (!highlightMeshes.has(poly.id)) {
      const mesh = createHighlightMesh(poly, props.terrain);
      if (mesh) {
        mesh.rotation.x = -Math.PI / 2; // Match terrain Mesh rotation
        scene.add(mesh);
        highlightMeshes.set(poly.id, mesh);
      }
    }
  }
}, { deep: true });

function createHighlightMesh(polygon, terrain) {
  const { ncols, nrows, cellsize, gridData, minZ } = terrain;
  const activeSet = polygon.indices?.activeIndices;
  
  if (!activeSet || activeSet.length === 0) return null;
  
  const vertices = [];
  
  const bounds = terrain.bounds || {
    width: (ncols - 1) * cellsize,
    height: (nrows - 1) * cellsize
  };
  
  const halfW = bounds.width / 2;
  const halfH = bounds.height / 2;
  
  for (const idx of activeSet) {
    const col = idx % ncols;
    const row = Math.floor(idx / ncols); // top-down index (VolumeCalculator-Konvention)
    
    // Convert to bottom-up index to read terrain Z safely from Map3D gridData
    const gridRow = (nrows - 1) - row;
    const terrainIdx = gridRow * ncols + col;
    
    const zVal = gridData[terrainIdx];
    if (zVal <= -9000) continue; 
    
    const cx = col * cellsize - halfW;
    const cy = halfH - row * cellsize; // row 0 is top (+halfH)
    
    const zOffset = 0.5; // Hover well above terrain to prevent z-fighting
    const hcs = cellsize / 2;
    
    const x1 = cx - hcs, y1 = cy + hcs;
    const x2 = cx + hcs, y2 = cy + hcs;
    const x3 = cx - hcs, y3 = cy - hcs;
    const x4 = cx + hcs, y4 = cy - hcs;
    
    const finalZ = (zVal - minZ) + zOffset; 
    
    vertices.push(
      x1, y1, finalZ,
      x3, y3, finalZ,
      x2, y2, finalZ,
      
      x3, y3, finalZ,
      x4, y4, finalZ,
      x2, y2, finalZ
    );
  }
  
  if (vertices.length === 0) return null;
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  const material = new THREE.MeshBasicMaterial({
    color: polygon.color || '#76ff03',
    transparent: true,
    opacity: 0.4,
    depthTest: true,
    depthWrite: false, // Prevent overlapping semi-transparent meshes from clashing
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  
  return new THREE.Mesh(geometry, material);
}


// --- BOUNDARY LAYER ---
// Im Ergebnis-Viewer bewusst KEINE Randbedingungs-Pfeile (lenken von den
// Strömungspfeilen ab und sind redundant). Sie werden nur im Editor gezeigt.

defineExpose({ 
  onResize, 
  clearProbe(id) { probeApi.clear(id); },
  clearSection() { 
      if (sectionToolState) sectionToolState.clearAllSections(); 
  },
  removeSection(id) {
      if (sectionToolState) sectionToolState.removeSectionMesh(id);
  },
  clearVolume() { if (volumeToolState) volumeToolState.clearPolygon(); },
  removeVolumePolygon
});
</script>

<style scoped>
.result-map-3d {
  width: 100%;
  height: 100%;
}
</style>
