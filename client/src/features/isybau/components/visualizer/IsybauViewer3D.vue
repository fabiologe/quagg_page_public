<template>
  <div class="isybau-viewer-3d" ref="container">
    <div v-if="!nodes.size" class="empty-state">
      No network data to display.
    </div>
    <div v-else class="canvas-container" ref="canvasContainer"></div>
    
    <div class="controls">
      <button @click="resetView" title="Reset View">↺</button>
    </div>

    <!-- Info Window (Reused style) -->
    <Transition name="slide-up">
      <div v-if="selectedElement" class="info-window">
        <div class="info-header">
          <h3>{{ selectedElement.type === 'Haltung' || selectedElement.type === 'Leitung' ? 'Kante' : 'Knoten' }} (3D)</h3>
          <button @click="selectedElement = null" class="close-btn">×</button>
        </div>
        <div class="info-content">
          <div class="info-row">
            <span class="label">ID:</span>
            <span class="value">{{ selectedElement.id }}</span>
          </div>
          <template v-if="selectedElement.profile">
            <div class="info-row">
              <span class="label">Profil:</span>
              <span class="value">{{ getProfileName(selectedElement.profile.type) }}</span>
            </div>
            <div class="info-row">
              <span class="label">Dimension:</span>
              <span class="value">{{ (selectedElement.profile.height * 1000).toFixed(0) }} mm</span>
            </div>
          </template>
          <template v-else>
            <div class="info-row">
              <span class="label">Sohlhöhe (SH):</span>
              <span class="value">{{ selectedElement.z?.toFixed(2) }} m</span>
            </div>
            <div class="info-row" v-if="selectedElement.coverZ">
              <span class="label">Deckelhöhe (DH):</span>
              <span class="value">{{ selectedElement.coverZ?.toFixed(2) }} m</span>
            </div>
            <div class="info-row">
              <span class="label">Tiefe:</span>
              <span class="value">{{ selectedElement.depth?.toFixed(2) }} m</span>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const props = defineProps({
  nodes: { type: Map, required: true },
  edges: { type: Map, required: true },
  areas: { type: Array, default: () => [] }
});

const container = ref(null);
const canvasContainer = ref(null);
const selectedElement = ref(null);

let scene, camera, renderer, controls, raycaster, mouse;
let animationId;
const objectsMap = new Map(); // Mesh -> Data

// Profile Types
const PROFILE_CIRCLE = 0;
const PROFILE_TRAPEZOID = 1; // Assuming 1 for now, adjust if needed

const getProfileName = (type) => {
  if (type === PROFILE_CIRCLE) return 'Kreis';
  if (type === PROFILE_TRAPEZOID) return 'Trapez';
  return 'Unbekannt';
};

// Calculate Bounds and Center
const bounds = computed(() => {
  if (!props.nodes.size) return { minX: 0, minY: 0, minZ: 0, centerX: 0, centerY: 0, centerZ: 0 };
  
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const node of props.nodes.values()) {
    if (Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z)) {
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.z < minZ) minZ = node.z;
        if (node.x > maxX) maxX = node.x;
        if (node.y > maxY) maxY = node.y;
        if (node.z > maxZ) maxZ = node.z;
    }
  }

  // Fallback if no valid nodes
  if (minX === Infinity) {
      return { minX: 0, minY: 0, minZ: 0, centerX: 0, centerY: 0, centerZ: 0 };
  }

  return {
    minX, minY, minZ,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2
  };
});

const initThree = () => {
  if (!canvasContainer.value) return;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f2f5);
  scene.fog = new THREE.Fog(0xf0f2f5, 10, 500);

  // Camera
  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(0, 50, 50);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  canvasContainer.value.appendChild(renderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(50, 100, 50);
  dirLight.castShadow = true;
  scene.add(dirLight);

  // Raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Event Listeners
  window.addEventListener('resize', onResize);
  canvasContainer.value.addEventListener('click', onClick);

  buildScene();
  animate();
};

const buildScene = () => {
  // Clear existing
  while(scene.children.length > 0){ 
    scene.remove(scene.children[0]); 
  }
  objectsMap.clear();

  // Re-add lights (lazy way, better to keep them in separate group)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(50, 100, 50);
  scene.add(dirLight);

  // Ground Plane
  const planeGeometry = new THREE.PlaneGeometry(1000, 1000);
  const planeMaterial = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.8 });
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -5; // Slightly below lowest point
  scene.add(plane);

  const b = bounds.value;

  // Nodes (Manholes)
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
  const fictiveMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c }); // Red for Fictive
  const outfallMat = new THREE.MeshStandardMaterial({ color: 0x27ae60 }); // Green for Outfall
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, side: THREE.DoubleSide }); // Grey for missing diameter

  for (const node of props.nodes.values()) {
    const x = node.x - b.centerX;
    const z = -(node.y - b.centerY); 
    const bottomY = (node.z - b.minZ);
    
    // Determine Top Y
    let topY = bottomY;
    if (node.coverZ !== null && node.coverZ !== undefined) {
        topY = (node.coverZ - b.minZ);
    } else if (node.depth) {
        topY = bottomY + node.depth;
    } else {
        topY = bottomY + 2; 
    }
    const height = Math.max(0.1, topY - bottomY);
    const yCenter = bottomY + height / 2;

    const isFictive = node.status === 2; // Explicit Fictive
    const isOutfall = node.type == 5;    // Outfall
    const hasDiameter = !!node.diameter && node.diameter > 0;

    let mesh;

    if (isFictive) {
        // Fictive: Red Sphere Marker (no physical height usually, just a point)
        const radius = 0.3;
        const geometry = new THREE.SphereGeometry(radius, 16, 16);
        mesh = new THREE.Mesh(geometry, fictiveMat);
        mesh.position.set(x, bottomY + radius, z); // Sit on invert

    } else if (isOutfall) {
        // Outfall: Green Cone (Marker)
        const geometry = new THREE.ConeGeometry(0.5, 1.5, 16);
        mesh = new THREE.Mesh(geometry, outfallMat);
        mesh.position.set(x, bottomY + 0.75, z); // Sit on invert

    } else if (!hasDiameter) {
        // Real Node but undefined diameter: Flat Circle at Invert (Sohlhöhe)
        // Replaces the "Grey Box" which was misleading
        const radius = 0.4; // 80cm standard logic
        const geometry = new THREE.CircleGeometry(radius, 32);
        mesh = new THREE.Mesh(geometry, boxMat);
        mesh.rotation.x = -Math.PI / 2; // Lie flat
        mesh.position.set(x, bottomY + 0.05, z); // Slightly above bottom to avoid z-fighting

    } else {
        // Standard Round Manhole
        const radius = node.diameter / 2;
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
        mesh = new THREE.Mesh(geometry, nodeMat);
        mesh.position.set(x, yCenter, z);
    }

    if (mesh) {
        scene.add(mesh);
        objectsMap.set(mesh, node);
    }
  }

  // Edges (Pipes)
  for (const edge of props.edges.values()) {
    // Use Domain Model properties (fromNodeId/toNodeId) with fallback for legacy objects
    const fromId = edge.fromNodeId || edge.from;
    const toId = edge.toNodeId || edge.to;
    
    const from = props.nodes.get(fromId);
    const to = props.nodes.get(toId);

    if (!from || !to) continue;

    // Determine Geometry Params FIRST to calculate Offset (put pipe ON Sohlhöhe, not centered)
    const profile = edge.profile || { type: 0, height: 0.3, width: 0.3 };
    const pType = profile.type;
    const h = Math.max(0.1, profile.height || 0.3);
    const w = Math.max(0.1, profile.width || h);
    const offsetY = h / 2; // Move center up so bottom matches SH

    // Determine Path Points
    let curvePath;
    if (edge.coords && edge.coords.length > 1) {
        // Reference Logic: Use p.z from parser if available, otherwise interpolate
        const startZ = (edge.z1 !== undefined && edge.z1 !== null && edge.z1 > -9000) ? edge.z1 : from.z;
        const endZ = (edge.z2 !== undefined && edge.z2 !== null && edge.z2 > -9000) ? edge.z2 : to.z;
        const count = edge.coords.length;

        const points = edge.coords.map((p, i) => {
             // ThreeJS Y = Elevation (Z)
             let elevation = p.z;
             if (elevation === undefined || elevation === null || isNaN(elevation)) {
                 // Fallback interpolation
                 const progress = i / (count - 1);
                 elevation = startZ + (endZ - startZ) * progress; // Using real Z space
             }
             
             // Apply OffsetY to lift pipe bottom to SH
             return new THREE.Vector3(p.x - b.centerX, (elevation - b.minZ) + offsetY, -(p.y - b.centerY));
        });

        if (count > 2) {
             curvePath = new THREE.CatmullRomCurve3(points);
        } else {
             curvePath = new THREE.LineCurve3(points[0], points[points.length - 1]);
        }
    } else {
         // Fallback calculation (straight line from Nodes)
         const startZ = (edge.z1 !== undefined && edge.z1 > -9000) ? edge.z1 : from.z;
         const endZ = (edge.z2 !== undefined && edge.z2 > -9000) ? edge.z2 : to.z;
         
         const p1 = new THREE.Vector3(from.x - b.centerX, (startZ - b.minZ) + offsetY, -(from.y - b.centerY));
         const p2 = new THREE.Vector3(to.x - b.centerX, (endZ - b.minZ) + offsetY, -(to.y - b.centerY));
         curvePath = new THREE.LineCurve3(p1, p2);
    }

    // Determine Geometry based on Profile
    let geometry;
    // (Params h, w defined above)

    // Extrusion Settings
    const extrudeSettings = {
        steps: 10,
        extrudePath: curvePath,
        bevelEnabled: false
    };

    const createShape = () => new THREE.Shape();

    // Helper to rotate shape 90 degrees (fix orientation for ExtrudeGeometry)
    // Often Extrude aligns Shape Y to Side. We need Up to be Up.
    // Rotate +90 degrees: x' = -y, y' = x
    const rot = (x, y) => [-y, x];

    if (pType === 8 || pType === 4) { // Trapez
        const shape = createShape();
        const slope = 1.5; 
        const t = 0.05; 
        
        // Define Upright first
        const topH = h / 2;
        const botH = -h / 2;
        const botW = w / 2;
        const topW = w / 2 + slope * h;

        // Apply Rotation
        shape.moveTo(...rot(-topW, topH));
        shape.lineTo(...rot(-botW, botH));
        shape.lineTo(...rot(botW, botH));
        shape.lineTo(...rot(topW, topH));
        shape.closePath();

        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    } else if (pType === 3 || pType === 'Rechteckprofil') { // Rect Closed
        // Closed box usually doesn't matter if rotated 90 deg IF width=height, but for w!=h it matters.
        // Let's assume Box is fine or also needs rotation? 
        // If Trapez is sideways, Box is likely sideways too (Width is vertical).
        // Let's safe-guard by using the same rotation if w != h.
        // Actually Box is easier to see orientation. Let's rotate it too to be consistent.
        const shape = createShape();
        const hw = w / 2;
        const hh = h / 2;
        
        shape.moveTo(...rot(-hw, hh));
        shape.lineTo(...rot(-hw, -hh));
        shape.lineTo(...rot(hw, -hh));
        shape.lineTo(...rot(hw, hh));
        shape.closePath();
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    } else if (pType === 5) { // Rect Open
        const shape = createShape();
        const hw = w / 2;
        const hh = h / 2;
        
        // Outer U
        shape.moveTo(...rot(-hw, hh));
        shape.lineTo(...rot(-hw, -hh));
        shape.lineTo(...rot(hw, -hh));
        shape.lineTo(...rot(hw, hh));
        // Simple line U for open channel
        // shape.lineTo(...rot(hw, hh)); // End point
        // Extrude requires Loop for solid? 
        // Drawing a U-curve in Shape usually results in a thin wall if bevel? No.
        // Let's close it as a solid block for now, consistent with Closed Rect but logic implies U.
        // Since we are fixing orientation, let's keep it Closed Box visual for simplicity but rotated.
        shape.closePath();
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    } else if (pType === 1 || pType === 'Egg') { // Egg Profile
        const shape = createShape();
        // Eiprofil Rotate
        // Points generation
        const curve = new THREE.EllipseCurve(0, 0, w/2, h/2, 0, 2 * Math.PI, false, 0);
        const points = curve.getPoints(12);
        // Rotate points
        const rotatedPoints = points.map(p => new THREE.Vector2(...rot(p.x, p.y)));
        shape.setFromPoints(rotatedPoints);
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
    } else {
        // Circle (Tube)
        const radius = Math.max(0.1, h / 2);
        geometry = new THREE.TubeGeometry(curvePath, 12, radius, 8, false);
    }

    const material = new THREE.MeshStandardMaterial({ 
        color: (pType === 8 || pType === 4) ? 0x95a5a6 : (pType === 5 || pType === 3) ? 0x8e44ad : 0x3498db, 
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    scene.add(mesh);
    objectsMap.set(mesh, edge);
  }

  // Areas (Polygons)
  for (const area of props.areas) {
    if (!area.points || area.points.length < 3) continue;

    const shape = new THREE.Shape();
    const first = area.points[0];
    shape.moveTo(first.x - b.centerX, -(first.y - b.centerY));

    for (let i = 1; i < area.points.length; i++) {
      const p = area.points[i];
      shape.lineTo(p.x - b.centerX, -(p.y - b.centerY));
    }
    // Close shape automatically

    const geometry = new THREE.ShapeGeometry(shape);
    // Rotate to lie flat on XZ plane
    geometry.rotateX(Math.PI / 2);
    
    // Position slightly above ground but below pipes
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x3498db, 
      side: THREE.DoubleSide, 
      transparent: true, 
      opacity: 0.3 
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = -2; // Below manholes

    scene.add(mesh);
    objectsMap.set(mesh, area);
  }
};

const animate = () => {
  animationId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

const onResize = () => {
  if (!canvasContainer.value || !camera || !renderer) return;
  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};

const onClick = (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    const obj = intersects.find(i => objectsMap.has(i.object));
    if (obj) {
      selectedElement.value = objectsMap.get(obj.object);
      // Highlight?
    } else {
      selectedElement.value = null;
    }
  } else {
    selectedElement.value = null;
  }
};

const resetView = () => {
  if (controls) controls.reset();
};

onMounted(() => {
  initThree();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', onResize);
  if (renderer) renderer.dispose();
});

watch(() => props.nodes, buildScene, { deep: true });

</script>

<style scoped>
.isybau-viewer-3d {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f0f2f5;
}

.canvas-container {
  width: 100%;
  height: 100%;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.controls {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
}

.controls button {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

/* Info Window (Copied from 2D viewer) */
.info-window {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 300px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  z-index: 20;
}

.info-header {
  background: linear-gradient(135deg, #8e44ad, #9b59b6); /* Different color for 3D */
  color: white;
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  opacity: 0.8;
}

.info-content {
  padding: 1rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
}

.label { color: #7f8c8d; font-weight: 500; }
.value { color: #2c3e50; font-weight: 600; text-align: right; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(20px); opacity: 0; }
</style>
