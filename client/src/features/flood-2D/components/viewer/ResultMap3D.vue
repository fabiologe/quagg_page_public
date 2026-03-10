<template>
  <div ref="container" class="result-map-3d"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, toRaw } from 'vue';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { useVolumeTool } from '@/features/flood-2D/composables/useVolumeTool';
import { useSectionTool } from '@/features/flood-2D/composables/useSectionTool';
import { useAnalysisStore } from '@/features/flood-2D/stores/useAnalysisStore';

const props = defineProps({
  terrain: { type: Object, default: null },
  depthData: { type: Object, default: null }, // Float32Array or null
  maxWaterDepth: { type: Number, default: 1.0 },
  bciContent: { type: String, default: null },
  activeTool: { type: String, default: null }
});

const emit = defineEmits(['cellProbed', 'sectionDrawn']);

const container = ref(null);

let renderer, scene, camera, controls;
let terrainMesh = null;
let waterMesh = null;
let boundaryMesh = null;
const highlightMeshes = new Map(); // Track multiple polygon highlight meshes
const probeMarkers = new Map(); // Track multiple probe markers by ID
let animationId;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Store/Composable
const analysisStore = useAnalysisStore();
let volumeToolState = null;
let sectionToolState = null;

// --- SHADERS ---

const terrainVertexShader = `
  attribute float aValid;
  varying float vZ;
  varying float vValid;
  varying vec2 vPlanePos;
  void main() {
    vZ = position.z;
    vValid = aValid;
    vPlanePos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const terrainFragmentShader = `
  varying float vZ;
  varying float vValid;
  varying vec2 vPlanePos;
  uniform float uMinZ;
  uniform float uMaxZ;
  uniform vec3 uColorLow;
  uniform vec3 uColorMid;
  uniform vec3 uColorHigh;
  uniform vec2 uBounds;
  uniform float uCellSize;

  void main() {
    // Discard NODATA cells
    if (vValid < 0.5) discard;

    float range = uMaxZ - uMinZ;
    if (range < 0.1) range = 1.0;
    float h = vZ / range;
    vec3 col;
    if (h < 0.2) col = mix(uColorLow, uColorMid, h / 0.2);
    else col = mix(uColorMid, uColorHigh, (h - 0.2) / 0.8);

    // Contour lines
    float contourInterval = 1.0;
    float dist = abs(fract(vZ) - 0.5);
    float lineIntensity = 1.0 - smoothstep(0.45, 0.48, dist);
    col = mix(col, vec3(0.0), lineIntensity * 0.25);

    // Darken slightly for viewer aesthetic
    col *= 0.85;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const waterVertexShader = `
  varying float vDepth;
  uniform sampler2D uDepthMap;

  void main() {
     vec2 texUV = uv;
     float d = texture2D(uDepthMap, texUV).r;
     vDepth = d;

     vec3 pos = position;
     if (d > 0.005) {
         // Lift water surface above terrain by depth + small offset
         pos.z += d + 0.35;
     }
     // Dry cells: keep pos.z at terrain elevation (unchanged).
     // The fragment shader discards them via vDepth < 0.005.
     // This prevents giant triangles from stretching below terrain.

     gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waterFragmentShader = `
  varying float vDepth;
  uniform vec3 uColorShallow;
  uniform vec3 uColorMid;
  uniform vec3 uColorDeep;
  uniform float uMaxDepth;

  void main() {
      if (vDepth < 0.005) discard;

      // Dynamic normalization — key improvement!
      float maxD = max(uMaxDepth, 0.01);
      float t = clamp(vDepth / maxD, 0.0, 1.0);

      // Three-stop gradient: Shallow → Mid → Deep
      vec3 col;
      if (t < 0.5) {
          col = mix(uColorShallow, uColorMid, t * 2.0);
      } else {
          col = mix(uColorMid, uColorDeep, (t - 0.5) * 2.0);
      }

      // Depth-dependent opacity
      float alpha = mix(0.45, 0.92, t);

      gl_FragColor = vec4(col, alpha);
  }
`;

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
    if (props.depthData) updateWater(props.depthData);
    if (props.bciContent) buildBoundaries(props.bciContent, props.terrain);
  }
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
  }
  if (controls) controls.dispose();
  window.removeEventListener('resize', onResize);
});

function initScene() {
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;
  console.log('[ResultMap3D] initScene', w, 'x', h);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);

  camera = new THREE.PerspectiveCamera(55, w / h, 5.0, 20000);
  camera.position.set(0, 500, 500);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.value.appendChild(renderer.domElement);

  controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 5;
  controls.maxPolarAngle = Math.PI / 2.15;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight.position.set(200, 600, 200);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0x4fc3f7, 0.15);
  fillLight.position.set(-200, 100, -200);
  scene.add(fillLight);

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

        const samples = computeSectionData(startPt, endPt);
        if (samples && samples.length > 0) {
          emit('sectionDrawn', { id, color, samples });
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

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  animate();
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
  const { ncols, nrows, cellsize, gridData, minZ, xllcorner, yllcorner } = props.terrain;
  const bounds = props.terrain.bounds || {
    width: (ncols - 1) * (cellsize || 1),
    height: (nrows - 1) * (cellsize || 1)
  };

  const fracX = (localPt.x + bounds.width / 2) / bounds.width;
  const fracY = (localPt.y + bounds.height / 2) / bounds.height;
  const col = Math.floor(fracX * ncols);
  const geomRow = Math.floor((1 - fracY) * nrows);
  const gridRow = (nrows - 1) - geomRow;

  if (col < 0 || col >= ncols || gridRow < 0 || gridRow >= nrows) return;

  const gridIdx = gridRow * ncols + col;
  const terrainZ = gridData[gridIdx];
  if (terrainZ <= -9000) return;

  const worldX = xllcorner + (col + 0.5) * cellsize;
  const worldY = yllcorner + (gridRow + 0.5) * cellsize;

  // --- PROBE TOOL ---
  if (props.activeTool === 'probe') {
    const id = Math.random().toString(36).substring(2, 9);
    const cellInfo = { id, col, row: gridRow, terrainZ, worldX, worldY, cellsize };
    emit('cellProbed', cellInfo);
    // Fix probe marker Z positioning manually to avoid intersection glitches
    placeProbeMarker(localPt, terrainZ - minZ, cellsize, id);
    return;
  }

  // --- PROBE TOOL ---
  if (props.activeTool === 'probe') {
    const id = Math.random().toString(36).substring(2, 9);
    const cellInfo = { id, col, row: gridRow, terrainZ, worldX, worldY, cellsize };
    emit('cellProbed', cellInfo);
    // Fix probe marker Z positioning manually to avoid intersection glitches
    placeProbeMarker(localPt, terrainZ - minZ, cellsize, id);
    return;
  }
}

function computeSectionData(startPtWorld, endPtWorld) {
  if (!props.terrain) return;
  const { ncols, nrows, cellsize, gridData, xllcorner, yllcorner, minZ } = props.terrain;
  
  // Transform world points to local terrain space (where Z is up, X/Y are flat)
  const localStart = terrainMesh.worldToLocal(startPtWorld.clone());
  const localEnd = terrainMesh.worldToLocal(endPtWorld.clone());

  // We actually need the world real-world XY coordinates to map back to grid
  // The local plane is centered at 0,0. width spans (-w/2 to w/2).
  const bounds = props.terrain.bounds || {
    width: (ncols - 1) * cellsize,
    height: (nrows - 1) * cellsize
  };

  // Convert local Plane coordinates back to real-world Geo coordinates
  const realStartX = xllcorner + (localStart.x + bounds.width / 2);
  const realStartY = yllcorner + (localStart.y + bounds.height / 2); // local Y maps directly to Northing in Plane
  
  const realEndX = xllcorner + (localEnd.x + bounds.width / 2);
  const realEndY = yllcorner + (localEnd.y + bounds.height / 2);

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
    console.log(`[ResultMap3D] Sampled ${samples.length} points for Cross-Section`);
    return samples;
  }
  return null;
}

function placeProbeMarker(localPt, normalizedZ, cellsize, id) {
  const ringGeo = new THREE.RingGeometry(cellsize * 0.3, cellsize * 0.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff4444,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthTest: false
  });
  const marker = new THREE.Mesh(ringGeo, ringMat);
  marker.rotation.x = -Math.PI / 2; // this is INSIDE the already-rotated parent space
  scene.add(marker);

  // Position in world space: terrain mesh is rotated -PI/2 around X
  // local (x, y, z) → world (x, z, -y)
  // But we set position directly in world space:
  marker.position.set(localPt.x, normalizedZ + 0.3, -localPt.y);
  marker.visible = true;
  
  probeMarkers.set(id, marker);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

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
  if (!container.value || !renderer) return;
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

// --- TERRAIN BUILDING ---

// Watch for terrain changes AFTER scene is ready
watch(() => props.terrain, (t) => {
  if (t && scene) {
    console.log('[ResultMap3D] Terrain prop changed — building');
    buildTerrain(t);
    if (props.bciContent) buildBoundaries(props.bciContent, t);
  }
});

function buildTerrain(t) {
  if (!scene) {
    console.warn('[ResultMap3D] buildTerrain called but scene not ready');
    return;
  }
  const { ncols, nrows, gridData, minZ, maxZ, cellsize } = t;
  console.log('[ResultMap3D] buildTerrain:', ncols, 'x', nrows, 'minZ:', minZ, 'maxZ:', maxZ);

  // Compute bounds if missing (fallback)
  const bounds = t.bounds || {
    width: (ncols - 1) * (cellsize || 1),
    height: (nrows - 1) * (cellsize || 1)
  };

  const geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, ncols - 1, nrows - 1);
  const count = geometry.attributes.position.count;

  // Per-vertex validity flag: 1.0 = real data, 0.0 = NODATA
  const validArray = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const col = i % ncols;
    const geomRow = Math.floor(i / ncols);
    const gridRow = (nrows - 1) - geomRow;
    const idx = gridRow * ncols + col;
    let zVal = minZ;
    let valid = 0.0;
    if (idx >= 0 && idx < gridData.length) {
      const val = gridData[idx];
      if (val > -9000) {
        zVal = val;
        valid = 1.0;
      }
    }
    geometry.attributes.position.setZ(i, zVal - minZ);
    validArray[i] = valid;
  }
  geometry.setAttribute('aValid', new THREE.BufferAttribute(validArray, 1));
  geometry.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMinZ: { value: 0 },
      uMaxZ: { value: maxZ - minZ },
      uColorLow: { value: new THREE.Color(0x2d5f3f) },   // Dark green
      uColorMid: { value: new THREE.Color(0x8b7355) },    // Earth
      uColorHigh: { value: new THREE.Color(0xd4c5a9) },   // Light stone
      uBounds: { value: new THREE.Vector2(bounds.width, bounds.height) },
      uCellSize: { value: cellsize || 1.0 }
    },
    vertexShader: terrainVertexShader,
    fragmentShader: terrainFragmentShader,
    side: THREE.DoubleSide
  });

  if (terrainMesh) {
    scene.remove(terrainMesh);
    terrainMesh.geometry.dispose();
    terrainMesh.material.dispose();
  }

  terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.rotation.x = -Math.PI / 2;
  scene.add(terrainMesh);

  // Fit camera
  const maxDim = Math.max(bounds.width, bounds.height);
  camera.position.set(0, maxDim * 0.7, maxDim * 0.7);
  controls.target.set(0, 0, 0);
  controls.update();
  console.log('[ResultMap3D] Terrain mesh added ✅ bounds:', bounds.width, 'x', bounds.height);
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
    const row = Math.floor(idx / ncols); // top-down index from VolumeAnalyzer
    
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

// --- WATER LAYER ---

watch(() => props.depthData, (data) => {
  if (data && props.terrain) {
    updateWater(data);
  } else if (waterMesh) {
    waterMesh.visible = false;
  }
});

watch(() => props.maxWaterDepth, (newMax) => {
  if (waterMesh && waterMesh.material.uniforms) {
    waterMesh.material.uniforms.uMaxDepth.value = newMax;
  }
});

function updateWater(depthData) {
  if (!terrainMesh || !props.terrain) return;
  const { ncols, nrows } = props.terrain;

  const rawData = depthData instanceof Float32Array ? depthData : new Float32Array(depthData);

  // Create DataTexture
  const texture = new THREE.DataTexture(rawData, ncols, nrows, THREE.RedFormat, THREE.FloatType);
  texture.flipY = true;
  texture.needsUpdate = true;

  if (!waterMesh) {
    const geometry = terrainMesh.geometry.clone();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uDepthMap: { value: texture },
        uMaxDepth: { value: props.maxWaterDepth || 1.0 },
        uColorShallow: { value: new THREE.Color(0x00e5ff) },
        uColorMid: { value: new THREE.Color(0x0078d7) },
        uColorDeep: { value: new THREE.Color(0x00008b) },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    waterMesh = new THREE.Mesh(geometry, material);
    waterMesh.rotation.x = -Math.PI / 2;
    scene.add(waterMesh);
  } else {
    const mat = waterMesh.material;
    if (mat.uniforms.uDepthMap.value) mat.uniforms.uDepthMap.value.dispose();
    mat.uniforms.uDepthMap.value = texture;
    mat.uniforms.uMaxDepth.value = props.maxWaterDepth || 1.0;
    waterMesh.visible = true;
  }
}

// --- BOUNDARY LAYER ---

watch(() => props.bciContent, (content) => {
  if (content && props.terrain && scene) {
    buildBoundaries(content, props.terrain);
  } else if (boundaryMesh) {
    boundaryMesh.visible = false;
  }
});

function buildBoundaries(bciContent, t) {
  if (!scene || !t || !bciContent) return;

  // Clean up previous boundary objects
  if (boundaryMesh) {
    scene.remove(boundaryMesh);
    boundaryMesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    boundaryMesh = null;
  }

  // Parse BCI lines — content has real newlines (\n), not escaped
  const lines = bciContent.split('\n');
  const points = [];
  
  for (const line of lines) {
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    
    const type = p[0];
    if (type === 'P') {
      const x = parseFloat(p[1]);
      const y = parseFloat(p[2]);
      const bType = p[3];
      if (!isNaN(x) && !isNaN(y)) {
        points.push({ x, y, type: bType });
      }
    } else if (['N', 'S', 'E', 'W'].includes(type)) {
      const start = parseFloat(p[1]);
      const end = parseFloat(p[2]);
      const bType = p[3];
      if (isNaN(start) || isNaN(end)) continue;

      const { cellsize, xllcorner, yllcorner, ncols, nrows } = t;
      const numCells = Math.max(1, Math.round(Math.abs(end - start) / cellsize));
      const step = (end - start) / numCells;

      for (let i = 0; i < numCells; i++) {
        const val = start + i * step + step / 2;
        let x, y;
        if (type === 'N') { x = val; y = yllcorner + nrows * cellsize - cellsize / 2; }
        else if (type === 'S') { x = val; y = yllcorner + cellsize / 2; }
        else if (type === 'E') { x = xllcorner + ncols * cellsize - cellsize / 2; y = val; }
        else if (type === 'W') { x = xllcorner + cellsize / 2; y = val; }
        points.push({ x, y, type: bType });
      }
    }
  }

  if (points.length === 0) {
    console.warn('[ResultMap3D] No boundary points parsed from BCI content');
    return;
  }

  const { ncols, nrows, cellsize, gridData, xllcorner, yllcorner, minZ } = t;

  // Arrow geometry: cone (arrowhead) + cylinder (shaft)
  const arrowHeight = cellsize * 3;
  const shaftHeight = arrowHeight * 0.65;
  const coneHeight = arrowHeight * 0.35;
  const shaftRadius = cellsize * 0.12;
  const coneRadius = cellsize * 0.35;

  const coneGeom = new THREE.ConeGeometry(coneRadius, coneHeight, 8);
  coneGeom.translate(0, shaftHeight + coneHeight / 2, 0); // position on top of shaft

  const shaftGeom = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 6);
  shaftGeom.translate(0, shaftHeight / 2, 0); // position from base upward

  // Rotate both from Y-up to Z-up in local space.
  // After boundaryMesh.rotation.x = -PI/2, local Z maps to world Y (up).
  coneGeom.rotateX(Math.PI / 2);
  shaftGeom.rotateX(Math.PI / 2);

  // Merge into single geometry
  const mergedGeom = new THREE.BufferGeometry();
  const conePos = coneGeom.attributes.position;
  const shaftPos = shaftGeom.attributes.position;
  const totalVerts = conePos.count + shaftPos.count;
  const positions = new Float32Array(totalVerts * 3);
  for (let i = 0; i < conePos.count; i++) {
    positions[i * 3] = conePos.getX(i);
    positions[i * 3 + 1] = conePos.getY(i);
    positions[i * 3 + 2] = conePos.getZ(i);
  }
  for (let i = 0; i < shaftPos.count; i++) {
    const off = (conePos.count + i) * 3;
    positions[off] = shaftPos.getX(i);
    positions[off + 1] = shaftPos.getY(i);
    positions[off + 2] = shaftPos.getZ(i);
  }
  mergedGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Merge indices
  const coneIdx = coneGeom.index;
  const shaftIdx = shaftGeom.index;
  const totalIdx = coneIdx.count + shaftIdx.count;
  const indices = new Uint32Array(totalIdx);
  for (let i = 0; i < coneIdx.count; i++) indices[i] = coneIdx.getX(i);
  for (let i = 0; i < shaftIdx.count; i++) indices[coneIdx.count + i] = shaftIdx.getX(i) + conePos.count;
  mergedGeom.setIndex(new THREE.BufferAttribute(indices, 1));
  mergedGeom.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    shininess: 60
  });

  boundaryMesh = new THREE.InstancedMesh(mergedGeom, material, points.length);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  const cInflow = new THREE.Color(0x2196f3);  // Blue for QVAR
  const cOutflow = new THREE.Color(0xff5722); // Orange-Red for HFIX/FREE
  const cStage = new THREE.Color(0x9c27b0);   // Purple for HVAR
  const cUnknown = new THREE.Color(0x888888);

  const cx = xllcorner + (ncols * cellsize) / 2;
  const cy = yllcorner + (nrows * cellsize) / 2;

  points.forEach((pt, i) => {
    const localX = pt.x - cx;
    const localY = pt.y - cy;

    // Look up terrain Z at this boundary location
    // gridData is bottom-up (row 0 = south/minY)
    const col = Math.round((pt.x - xllcorner) / cellsize);
    const row = Math.round((pt.y - yllcorner) / cellsize); // bottom-up
    let terrainZ = 0;
    if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
      const idx = row * ncols + col;
      const val = gridData[idx];
      if (val > -9000) terrainZ = val - minZ;
    }

    dummy.position.set(localX, localY, terrainZ);

    // Outflow arrows point DOWN, inflow arrows point UP
    const isOutflow = (pt.type === 'HFIX' || pt.type === 'FREE');
    dummy.rotation.set(isOutflow ? Math.PI : 0, 0, 0);

    dummy.updateMatrix();
    boundaryMesh.setMatrixAt(i, dummy.matrix);

    if (pt.type === 'QVAR') color.copy(cInflow);
    else if (isOutflow) color.copy(cOutflow);
    else if (pt.type === 'HVAR') color.copy(cStage);
    else color.copy(cUnknown);

    boundaryMesh.setColorAt(i, color);
  });

  boundaryMesh.instanceMatrix.needsUpdate = true;
  if (boundaryMesh.instanceColor) boundaryMesh.instanceColor.needsUpdate = true;

  // Terrain is rotated -PI/2 around X (PlaneGeometry XY → world XZ)
  // Apply same rotation so our arrow Y-up becomes world Y-up after rotation
  boundaryMesh.rotation.x = -Math.PI / 2;
  
  scene.add(boundaryMesh);

  // Cleanup temp geometries
  coneGeom.dispose();
  shaftGeom.dispose();

  console.log(`[ResultMap3D] 🔵 Rendered ${points.length} boundary arrows (BCI debug).`);
}

defineExpose({ 
  onResize, 
  clearProbe(id) {
    if (id) {
      const marker = probeMarkers.get(id);
      if (marker) {
        scene.remove(marker);
        marker.geometry.dispose();
        marker.material.dispose();
        probeMarkers.delete(id);
      }
    } else {
      for (const marker of probeMarkers.values()) {
        scene.remove(marker);
        marker.geometry.dispose();
        marker.material.dispose();
      }
      probeMarkers.clear();
    }
  }, 
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
