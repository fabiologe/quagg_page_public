<template>
  <div ref="container" class="result-map-3d"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, toRaw } from 'vue';
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

const props = defineProps({
  terrain: { type: Object, default: null },
  depthData: { type: Object, default: null }, // Float32Array or null
  maxWaterDepth: { type: Number, default: 1.0 },
  bciContent: { type: String, default: null },
  probeActive: { type: Boolean, default: false }
});

const emit = defineEmits(['cellProbed']);

const container = ref(null);

let renderer, scene, camera, controls;
let terrainMesh, waterMesh, boundaryMesh, probeMarker;
let animationId;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

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
         pos.z += d + 0.2;
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

  camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 10000);
  camera.position.set(0, 500, 500);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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

  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('click', onCanvasClick);
  animate();
  console.log('[ResultMap3D] Scene initialized ✅');
}

// --- PROBE / CELL INSPECTOR ---

function onCanvasClick(event) {
  if (!props.probeActive || !terrainMesh || !props.terrain) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(terrainMesh);
  if (hits.length === 0) return;

  const hit = hits[0];
  // hit.point is in world space. Terrain mesh is rotated -PI/2 around X,
  // so local XY plane maps to world XZ. We need to get local-space coords.
  const localPt = terrainMesh.worldToLocal(hit.point.clone());

  const { ncols, nrows, cellsize, gridData, minZ, xllcorner, yllcorner } = props.terrain;
  const bounds = props.terrain.bounds || {
    width: (ncols - 1) * (cellsize || 1),
    height: (nrows - 1) * (cellsize || 1)
  };

  // PlaneGeometry goes from -width/2 to +width/2 in X, -height/2 to +height/2 in Y
  // localPt.x maps to column, localPt.y maps to geometry row
  const fracX = (localPt.x + bounds.width / 2) / bounds.width;
  const fracY = (localPt.y + bounds.height / 2) / bounds.height;

  // fracX 0=left col, fracY 0=bottom of plane (geomRow=nrows-1)
  // geomRow 0 = top of plane = fracY=1
  const col = Math.floor(fracX * ncols);
  const geomRow = Math.floor((1 - fracY) * nrows); // invert Y: top=0
  const gridRow = (nrows - 1) - geomRow; // grid row (ASC: 0=north)

  if (col < 0 || col >= ncols || gridRow < 0 || gridRow >= nrows) return;

  const gridIdx = gridRow * ncols + col;
  const terrainZ = gridData[gridIdx];
  if (terrainZ <= -9000) return; // NODATA

  // World coordinates
  const worldX = xllcorner + (col + 0.5) * cellsize;
  const worldY = yllcorner + (gridRow + 0.5) * cellsize;

  // Emit only static position info — water data is computed reactively per frame in parent
  const cellInfo = {
    col, row: gridRow,
    terrainZ,
    worldX, worldY,
    cellsize
  };

  emit('cellProbed', cellInfo);
  placeProbeMarker(localPt, terrainZ - minZ, cellsize);
}

function placeProbeMarker(localPt, normalizedZ, cellsize) {
  if (!probeMarker) {
    const ringGeo = new THREE.RingGeometry(cellsize * 0.3, cellsize * 0.5, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false
    });
    probeMarker = new THREE.Mesh(ringGeo, ringMat);
    probeMarker.rotation.x = -Math.PI / 2; // this is INSIDE the already-rotated parent space
    scene.add(probeMarker);
  }

  // Position in world space: terrain mesh is rotated -PI/2 around X
  // local (x, y, z) → world (x, z, -y)
  // But we set position directly in world space:
  probeMarker.position.set(localPt.x, normalizedZ + 0.3, -localPt.y);
  probeMarker.visible = true;
}

function animate() {
  animationId = requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

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
      depthWrite: false
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

defineExpose({ onResize, clearProbe() { if (probeMarker) probeMarker.visible = false; } });
</script>

<style scoped>
.result-map-3d {
  width: 100%;
  height: 100%;
}
</style>
