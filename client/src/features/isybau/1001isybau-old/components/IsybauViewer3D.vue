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
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.z < minZ) minZ = node.z;
    if (node.x > maxX) maxX = node.x;
    if (node.y > maxY) maxY = node.y;
    if (node.z > maxZ) maxZ = node.z;
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
  const nodeGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); // Default geometry reused if scaling
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
  const fictiveMat = new THREE.MeshBasicMaterial({ color: 0xe74c3c, side: THREE.DoubleSide });

  for (const node of props.nodes.values()) {
    const x = node.x - b.centerX;
    const z = -(node.y - b.centerY); 
    const bottomY = (node.z - b.minZ);
    
    // Check for Fictive Status (2) or missing/zero diameter
    const isFictive = node.status === 2 || !node.diameter;

    if (isFictive) {
        // Render as flat circle
        const radius = 0.1;
        const geometry = new THREE.CircleGeometry(radius, 16);
        geometry.rotateX(-Math.PI / 2); // Lay flat
        const mesh = new THREE.Mesh(geometry, fictiveMat);
        mesh.position.set(x, bottomY + 0.05, z); // Slightly above ground
        scene.add(mesh);
        objectsMap.set(mesh, node);
    } else {
        // Render as Volume (Cylinder)
        let topY = bottomY;
        if (node.coverZ !== null && node.coverZ !== undefined) {
            topY = (node.coverZ - b.minZ);
        } else if (node.depth) {
            topY = bottomY + node.depth;
        } else {
            topY = bottomY + 2; 
        }
        
        const height = Math.max(0.1, topY - bottomY);
        const y = bottomY + height / 2;
        const radius = node.diameter / 2; // Diameter is guaranteed > 0 here

        const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
        const mesh = new THREE.Mesh(geometry, nodeMat);
        mesh.position.set(x, y, z);
        
        scene.add(mesh);
        objectsMap.set(mesh, node);
    }
  }

  // Edges (Pipes)
  for (const edge of props.edges.values()) {
    const from = props.nodes.get(edge.from);
    const to = props.nodes.get(edge.to);

    if (!from || !to) continue;

    // Determine Path Points
    let curvePath;
    if (edge.coords && edge.coords.length > 1) {
        const points = edge.coords.map(p => new THREE.Vector3(p.x - b.centerX, p.z - b.minZ, -(p.y - b.centerY)));
        curvePath = new THREE.CatmullRomCurve3(points);
        // Or simple LineCurve3 segments if we want sharp corners
    } else {
        curvePath = new THREE.LineCurve3(p1, p2);
    }

    // Determine Geometry based on Profile
    let geometry;
    const profile = edge.profile || { type: 0, height: 0.3, width: 0.3 };
    
    // Type 8 = Trapezprofil, 4 = Trapezprofil
    if (profile.type === 8 || profile.type === 4) {
        // Trapezoid Open Channel Shape
        const shape = new THREE.Shape();
        const w = profile.width; // Bottom Width
        const h = profile.height;
        const slope = 1.5; // 1:1.5
        const t = 0.1; // Wall thickness

        // Shape definition (Rotated 90 degrees to fix orientation)
        // Original (Upright):
        // Top Left: (-w/2 - slope*h - t, h)
        // Bottom Left: (-w/2 - t, -t)
        // ...
        // Rotation 90 deg (x -> y, y -> -x) or similar?
        // Let's try swapping axes effectively.
        // If it was standing on side (X-axis up?), we want Y-axis up.
        // Let's try rotating -90 degrees: x' = y, y' = -x
        
        // Actually, let's just manually redefine points relative to new axes.
        // If Extrude path is horizontal, Shape X is usually Up? Or Y?
        // Trial: Rotate -90 degrees.
        
        // Trial: Rotate +90 degrees (180 from previous -90).
        
        const rot = (x, y) => ({ x: -y, y: x }); // +90 deg from original
        
        const p1 = rot(-w/2 - slope*h - t, h);
        const p2 = rot(-w/2 - t, -t);
        const p3 = rot(w/2 + t, -t);
        const p4 = rot(w/2 + slope*h + t, h);
        const p5 = rot(w/2 + slope*h, h);
        const p6 = rot(w/2, 0);
        const p7 = rot(-w/2, 0);
        const p8 = rot(-w/2 - slope*h, h);

        shape.moveTo(p1.x, p1.y); 
        shape.lineTo(p2.x, p2.y); 
        shape.lineTo(p3.x, p3.y); 
        shape.lineTo(p4.x, p4.y); 
        shape.lineTo(p5.x, p5.y); 
        shape.lineTo(p6.x, p6.y); 
        shape.lineTo(p7.x, p7.y); 
        shape.lineTo(p8.x, p8.y); 
        shape.closePath(); 

        const extrudeSettings = {
            steps: 20, // More steps for curve
            extrudePath: curvePath, // Extrude along the path!
            bevelEnabled: false
        };
        
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // No translation needed if using extrudePath? 
        // ExtrudePath aligns the shape to the curve.
    } else {
        // TubeGeometry for circular pipes along path
        const radius = Math.max(0.1, profile.height / 2);
        geometry = new THREE.TubeGeometry(curvePath, 20, radius, 8, false);
    }

    const material = new THREE.MeshStandardMaterial({ 
        color: (profile.type === 8 || profile.type === 4) ? 0x95a5a6 : 0x3498db, 
        side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);

    // No position/lookAt needed for Tube/ExtrudePath as coords are absolute
    // But wait, our coords are relative to bounds center.
    // TubeGeometry uses the points directly.
    
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
