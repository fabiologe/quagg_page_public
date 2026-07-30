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
import { useNetworkStore } from '@/features/flood-2D/stores/useNetworkStore';
import { makeResultCoords } from '@/features/flood-2D/composables/viewer/useResultCoords';
import { useResultScene } from '@/features/flood-2D/composables/viewer/useResultScene';
import { useFlowArrows } from '@/features/flood-2D/composables/viewer/useFlowArrows';
import { useFlowStreamlines } from '@/features/flood-2D/composables/viewer/useFlowStreamlines';
import { useDangerMarkers } from '@/features/flood-2D/composables/viewer/useDangerMarkers';
import { findSectionStructures } from '@/features/flood-2D/utils/sectionStructures';
import { findSectionNetworkCrossings } from '@/features/flood-2D/utils/sectionNetwork';
import { useResultProbes } from '@/features/flood-2D/composables/viewer/useResultProbes';
import { useTerrainLayer } from '@/features/flood-2D/composables/viewer/useTerrainLayer';
import { useWaterSurface } from '@/features/flood-2D/composables/viewer/useWaterSurface';
import { collectBridgeCells } from '@/features/flood-2D/utils/BridgeMeshLattice.js';
import { collectWeirCrestCells } from '@/features/flood-2D/utils/weirGeometry.js';
import { buildPierGeometry } from '@/features/flood-2D/utils/pierFlowDeflection.js';
import { buildJetGeometry } from '@/features/flood-2D/utils/weirJetFlow.js';
import { flipRow, flippedIndex } from '@/features/flood-2D/utils/gridIndex.js';

const props = defineProps({
  terrain: { type: Object, default: null },
  depthData: { type: Object, default: null }, // Float32Array or null
  elevData: { type: Object, default: null }, // Wasserspiegel .elev des Frames (Float32Array) — exakte Solver-Oberfläche
  maxWaterDepth: { type: Number, default: 1.0 },
  layerMode: { type: Number, default: 0 }, // 0=depth (realistisch beleuchtet), 1=velocity, 2=max/hazard
  bciContent: { type: String, default: null },
  activeTool: { type: String, default: null },
  flowData: { type: Object, default: null },     // { vx: Float32Array, vy: Float32Array } | null (zell-zentriert)
  qFluxData: { type: Object, default: null },    // { qx: Float32Array, qy: Float32Array } | null (m³/s, zell-zentriert) — Impuls-Quelle der Wasser-Advektion
  showFlow: { type: Boolean, default: false },   // Fließpfeil-Layer aktiv?
  showStreamlines: { type: Boolean, default: false }, // animierte Strömungslinien-Layer aktiv?
  detectSpikes: { type: Boolean, default: true },     // Tiefen-Dorne kappen + als Gefahr markieren (nur Tiefen-Layer)
  depthField: { type: Object, default: null },   // aktuelles Tiefen-Frame (Float32Array) für Nass-Gating/Höhe
  velocityData: { type: Object, default: null }, // Geschwindigkeits-Betrag-Frame (Float32Array) für die Heatmap
  velocityMin: { type: Number, default: 0.0 },   // unteres Ende der Velocity-Farbskala (Bereichsregler)
  velocityMax: { type: Number, default: 1.0 },   // oberes Ende der Velocity-Farbskala (Bereichsregler)
  flowDensity: { type: Number, default: 0.5 },   // 0..1 Dichte der Fließpfeile
  waterOpacity: { type: Number, default: 0.85 }, // globale Wasser-Deckkraft 0..1
  networkState: { type: Object, default: null }, // 1D-Netz-Zustand des Frames (useNetworkResults.stateAtFrame)
  showNetwork: { type: Boolean, default: true },       // Netz-Layer sichtbar?
  networkColorMode: { type: String, default: 'capacity' } // 'capacity' | 'flow' | 'velocity'
});

const emit = defineEmits(['cellProbed', 'sectionDrawn', 'waterStats', 'sectionDraftChanged']);

const container = ref(null);

// Store/Composable
const analysisStore = useAnalysisStore();
const geoStore = useGeoStore(); // Needed for layer renderer + Gebäudemaske
const networkStore = useNetworkStore(); // 3D-Pick → Auswahl (NetworkResultsPanel folgt)

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

// Wehr-Zellen ändern sich, wenn eine Öffnung an derselben Zelle wächst/schrumpft, OHNE
// dass sich deren "col,row,direction"-basierte id ändert — Cache-Keys, die von
// geoStore.weirs abhängen, müssen deshalb explizit die orifice-Belegung mit hashen.
function weirCacheKey(weirs) {
  return weirs.map(w => `${w.id}${w.orifice ? '1' : '0'}`).join(',');
}

// Hindernis-Maske fürs Velocity-Overlay: Gebäudemaske (top-down, <128) + volles
// Brücken-Bauwerk (Deck-Slab läuft durchgehend über die Fläche, auch über Pfeiler) +
// Wehr-Krone. Diese Bauwerke sind solide 3D-Meshes im Ergebnis-Viewer; Pfeile/
// Streamlines (depthTest:false) liefen sonst sichtbar hindurch. Durchlässe (Wehr-
// Öffnungen) werden bewusst NICHT aufgenommen — die bekommen stattdessen die Jet-
// Überlagerung (siehe jetGeometryList). Gemerkt, bis sich Bauwerke/Terrain ändern.
let _obstacleCache = { key: null, mask: null };
function obstacleMask() {
  const t = props.terrain;
  if (!t) return terrainApi.getMask();
  const { ncols, nrows } = t;
  const base = terrainApi.getMask(); // kann null sein (vor Terrain-Build)
  const bridges = geoStore.bridges || [];
  const weirs = geoStore.weirs || [];
  const key = `${ncols}x${nrows}|${base ? 'm' : '0'}|${bridges.map(b => b.id).join(',')}|${weirCacheKey(weirs)}`;
  if (_obstacleCache.key === key) return _obstacleCache.mask;

  const bridgeCells = collectBridgeCells(bridges, t); // "col,row", row bottom-up (row 0 = Süd)
  const weirCrest = collectWeirCrestCells(weirs, t);
  if (bridgeCells.size === 0 && weirCrest.size === 0) { _obstacleCache = { key, mask: base }; return base; }

  const out = base ? base.slice() : new Uint8Array(ncols * nrows).fill(255);
  const stamp = (set) => {
    for (const k of set) {
      const ci = k.indexOf(',');
      const col = +k.slice(0, ci), rS = +k.slice(ci + 1);
      const rTop = flipRow(rS, nrows); // Maske ist top-down wie das Velocity-Raster
      if (col >= 0 && col < ncols && rTop >= 0 && rTop < nrows) out[rTop * ncols + col] = 0;
    }
  };
  stamp(bridgeCells); stamp(weirCrest);
  _obstacleCache = { key, mask: out };
  return out;
}

// Pfeiler-Geometrie (Grid-Index-Koordinaten) für die analytische Umströmungs-Deflection
// im Ring um jeden Pfeiler (a≤r≤R) — ergänzt obstacleMask(), die nur das Innere (r<a)
// abdeckt. Gemerkt wie obstacleMask, bis sich Brücken/Terrain ändern.
let _pierGeomCache = { key: null, geoms: [] };
function pierGeometryList() {
  const t = props.terrain;
  if (!t) return [];
  const bridges = geoStore.bridges || [];
  const key = `${t.ncols}x${t.nrows}x${t.cellsize}|${bridges.map(b => b.id).join(',')}`;
  if (_pierGeomCache.key === key) return _pierGeomCache.geoms;
  const geoms = buildPierGeometry(bridges, t);
  _pierGeomCache = { key, geoms };
  return geoms;
}

// Durchlass-Geometrie (Grid-Index-Koordinaten) für die analytische Kontraktions-/
// Freistrahl-Überlagerung an Wehr-Öffnungen — ergänzt obstacleMask(), die Durchlässe
// bewusst ausspart. Gemerkt wie obstacleMask, bis sich Wehre/Terrain ändern.
let _jetGeomCache = { key: null, geoms: [] };
function jetGeometryList() {
  const t = props.terrain;
  if (!t) return [];
  const weirs = geoStore.weirs || [];
  const key = `${t.ncols}x${t.nrows}x${t.cellsize}|${weirCacheKey(weirs)}`;
  if (_jetGeomCache.key === key) return _jetGeomCache.geoms;
  const geoms = buildJetGeometry(weirs, t);
  _jetGeomCache = { key, geoms };
  return geoms;
}

// Fließpfeil-Overlay (gerichtete Velocity-Pfeile) — eigenes Composable
const flowApi = useFlowArrows(() => scene, obstacleMask, pierGeometryList, jetGeometryList);
// Strömungslinien-Overlay (integrierte, animierte CFD-Linien) — eigenes Composable
const streamApi = useFlowStreamlines(() => scene, obstacleMask, pierGeometryList, jetGeometryList); // Gebäude + Bauwerke ausblenden, Umströmung/Jet an Pfeilern/Durchlässen

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
    // Schacht-Snap: Kandidaten in Szene-Weltkoordinaten (gleicher Transform wie
    // networkRenderer/terrainMesh — layerRenderer entsteht erst nach diesem
    // Setup-Aufruf, daher lazy über den Closure-Zugriff auf die äußere Variable).
    getSnapNodes: () => {
      if (!layerRenderer) return [];
      return networkStore.nodes.map(n => {
        const p = layerRenderer.getLocalPos(n.x, n.y, n.rim);
        return { id: n.id, x: p.x, y: p.y, z: p.z };
      });
    },
    onSectionDrawn: (startPt, endPt) => {
      if (props.terrain && terrainMesh) {
        const id = Math.random().toString(36).substring(2, 9);
        const polyColors = ['#ffeb3b', '#ff4081', '#76ff03', '#00e5ff', '#e040fb', '#ff9800', '#18ffff'];
        const color = polyColors[Math.floor(Math.random() * polyColors.length)];

        const res = computeSectionData(startPt, endPt);
        if (res && res.samples && res.samples.length > 0) {
          emit('sectionDrawn', {
            id, color, samples: res.samples,
            structures: res.structures, network: res.network,
          });
          return { id, color };
        }
      }
      return null;
    },
    onDrawStart: () => {
      if (controls) controls.enabled = false;
      emit('sectionDraftChanged', true);
    },
    onDrawEnd: () => {
      if (controls) controls.enabled = true;
      emit('sectionDraftChanged', false);
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
  networkRenderer.setColorMode(props.networkColorMode);
  networkRenderer.setVisible(props.showNetwork);
  if (props.networkState) networkRenderer.applyResults(props.networkState);
  // TERRAIN-NACHZÜGLER: getLocalPos speist sich hier aus props.terrain (nicht aus dem
  // geoStore wie im Editor). Rendert der Netz-Renderer, bevor die Prop propagiert ist
  // (IndexedDB-Hydration setzt Netz + Terrain im selben Tick), liegen ALLE Schächte/
  // Haltungen bei (0,0,0) — ein unsichtbarer Klumpen, den keine Store-Revision mehr
  // repariert („Kanalnetz im Ergebnis-Viewer verschwunden", Fund 2026-07-29). Sobald
  // das Terrain wirklich da ist bzw. wechselt: kompletter Neuaufbau mit korrektem
  // Welt→Szene-Transform; die Ergebnis-Färbung (lastState) übersteht das im Renderer.
  watch(() => props.terrain, (t) => { if (t) networkRenderer?.rebuild?.(); });

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
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  // Pre-Render: Refraktions-RT des Wassers befüllen (nur aktiv im Tiefen-Modus).
  // Kamera unter dem Gelände (y<0 = unter minZ, Terrain ist auf minZ→0 normiert):
  // Wasserhaut ausblenden — sie ist für Draufsicht gebaut, von unten nur Artefakte.
  sceneApi.start((r, s, c) => {
    waterApi.setBelowGround(c.position.y < 0);
    waterApi.renderRefraction(r, s, c);
  });
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

// Klick-vs-Orbit-Drag: Pick nur, wenn der Zeiger zwischen down und up kaum wandert.
let _downPt = null;

function onPointerDown(event) {
  _downPt = { x: event.clientX, y: event.clientY };
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

// --- 1D-NETZ-PICKING (Klick auf Schacht/Haltung → Auswahl, Panel folgt) ---

function onPointerUp(event) {
  if (!_downPt) return;
  const moved = Math.hypot(event.clientX - _downPt.x, event.clientY - _downPt.y);
  _downPt = null;
  if (moved > 5) return;        // Orbit-Drag, kein Klick
  if (props.activeTool) return; // Probe/Section/Volume haben Vorrang
  pickNetwork(event);
}

function pickNetwork(event) {
  if (!networkRenderer || !networkRenderer.group.visible) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(networkRenderer.group.children, false);
  const picked = networkRenderer.pickFromIntersects(hits);
  // Treffer wählt das Element (Panel folgt über net.selectedId); Klick ins Leere hebt
  // nur das 3D-Highlight auf — die Panel-Auswahl bleibt (Watch ignoriert null).
  networkStore.select(picked ? picked.id : null);
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
    // Kanalnetz-Durchstoßpunkte (Haltungen/Schächte) — Ergebnisse (Füllstand je Frame)
    // reichert ResultViewerMain aus dem networkFrameState an.
    let network = [];
    try {
      network = findSectionNetworkCrossings(
        realStartX, realStartY, realEndX, realEndY,
        networkStore.nodes, networkStore.links
      );
    } catch (e) {
      console.warn('[ResultMap3D] Netz-Schnitt fehlgeschlagen:', e);
    }
    console.log(`[ResultMap3D] Sampled ${samples.length} points, ${structures.length} Bauwerk(e), `
      + `${network.length} Netz-Element(e) for Cross-Section`);
    return { samples, structures, network };
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


// 1D-Netz-Ergebnisse: Füllgrad/Wasserstand des aktuellen Frames aufs Netz malen.
watch(() => props.networkState, (s) => { networkRenderer?.applyResults?.(s); });
// Netz-Layer-Sichtbarkeit + Färbmodus (Füllgrad/Q/v) aus dem ViewerControlPanel.
watch(() => props.showNetwork, (v) => { networkRenderer?.setVisible?.(v); });
watch(() => props.networkColorMode, (m) => { networkRenderer?.setColorMode?.(m); });

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
    const terrainIdx = flippedIndex(row, col, ncols, nrows);
    
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
  confirmSection() {
      if (sectionToolState) sectionToolState.confirmDrawing();
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
