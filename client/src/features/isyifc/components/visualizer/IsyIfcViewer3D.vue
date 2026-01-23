<template>
  <div class="isyifc-viewer-3d" ref="container">
    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
      <p>Building 3D Scene...</p>
    </div>
    
    <div v-if="!hasData" class="empty-state">
      <p>No network data loaded.</p>
    </div>
    
    <div class="canvas-container" ref="canvasContainer"></div>
    
    <div class="controls">
      <button @click="resetView" title="Reset View">↺</button>
    </div>

    <!-- Info Window (Linked to Store Selection) -->
    <Transition name="slide-up">
      <div v-if="selectedElement" class="info-window">
        <div class="info-header">
          <h3>{{ getElementType(selectedElement) }}</h3>
          <button @click="clearSelection" class="close-btn">×</button>
        </div>
        <div class="info-content">
          <div class="info-row">
            <span class="label">ID:</span>
            <span class="value">{{ selectedElement.id }}</span>
          </div>
          
          <!-- Node Specifics -->
          <template v-if="isNode(selectedElement)">
             <div class="info-row">
               <span class="label">Type:</span>
               <span class="value">{{ selectedElement.type }}</span>
             </div>
             <div class="info-row">
                <span class="label">Deckel:</span>
                <span class="value">{{ selectedElement.deckel?.toFixed(2) }} m</span>
             </div>
             <div class="info-row">
                <span class="label">Sohle:</span>
                <span class="value">{{ selectedElement.pos?.z?.toFixed(2) }} m</span>
             </div>
          </template>

          <!-- Edge Specifics -->
          <template v-if="isEdge(selectedElement)">
            <div class="info-row">
                <span class="label">Profil:</span>
                <span class="value">{{ resolveCode(IsybauCodes.Profilart, selectedElement.profile?.type) }}</span>
            </div>
            <div class="info-row">
                <span class="label">Material:</span>
                <span class="value">{{ resolveCode(IsybauCodes.Material, selectedElement.material) || '-' }}</span>
            </div>
            <div class="info-row">
                <span class="label">Länge:</span>
                <span class="value">{{ selectedElement.length?.toFixed(2) }} m</span>
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
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useIsyIfcStore } from '../../store/index.js';
import { GeometryFactory } from '../../core/3d/GeometryFactory.js';
import { IsybauCodes } from '../../core/domain/IsybauCodes.js';
import { storeToRefs } from 'pinia';

// Helper to resolve codes
const resolveCode = (table, val) => {
    if (val === undefined || val === null) return '-';
    // Check if table exists and has value
    if (table && table[val]) return table[val];
    return val; // Return original if no mapping found
};

// Store
const store = useIsyIfcStore();
const { graph, isProcessing } = storeToRefs(store);

// UI State
const container = ref(null);
const canvasContainer = ref(null);
const loading = ref(false);

const hasData = computed(() => graph.value.nodes && graph.value.nodes.size > 0);

// Selected Element (Computed from Store ID)
const selectedElement = computed(() => {
    if (!store.selectedObjectId) return null;
    const n = store.nodeMap.get(store.selectedObjectId);
    if (n) return n;
    const e = store.edgeMap.get(store.selectedObjectId);
    if (e) return e;
    return { id: store.selectedObjectId, type: 'Unknown' };
});

const isNode = (el) => el && el.geometry; // Duck typing via new 'geometry' prop
const isEdge = (el) => el && el.sourceId; // via IEdge sourceId
const getElementType = (el) => isNode(el) ? (el.type) : 'Channel';

const clearSelection = () => store.clearSelection();

// Three.js Globals
let scene, camera, renderer, controls, raycaster, mouse;
let animationId;
const objectsMap = new Map(); // Mesh -> Data ID
let networkGroup = null;

// --- Initialization ---

const initThree = () => {
    if (!canvasContainer.value) return;
    
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f2f5);
    scene.fog = new THREE.Fog(0xf0f2f5, 100, 20000);

    // Camera
    const w = canvasContainer.value.clientWidth;
    const h = canvasContainer.value.clientHeight;
    camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100000);
    camera.position.set(0, 100, 100);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    canvasContainer.value.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxDistance = 50000;

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemi.position.set(0, 200, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(100, 200, 100);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 5000;
    // Tweak shadow frustum to cover typical sewer networks
    dir.shadow.camera.left = -500;
    dir.shadow.camera.right = 500;
    dir.shadow.camera.top = 500;
    dir.shadow.camera.bottom = -500;
    scene.add(dir);

    // Ground
    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(100000, 100000),
        new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.8 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -2;
    scene.add(plane);

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Events
    window.addEventListener('resize', onResize);
    canvasContainer.value.addEventListener('click', onClick);

    // Initial Build
    buildScene();
    animate();
};

// --- Scene Builder (The Pipeline) ---

const buildScene = () => {
    if (!scene) return;
    
    // 1. Clear old group
    if (networkGroup) {
        scene.remove(networkGroup);
        // Dispose meshes?
        networkGroup.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
                else o.material.dispose();
            }
        });
        networkGroup = null;
    }
    objectsMap.clear();

    if (!graph.value.nodes.size) return;

    loading.value = true;
    
    // Defer to next frame to show loading UI
    setTimeout(() => {
        // Phase 2: Instanced Build
        const { root, instanceMap, origin } = GeometryFactory.buildScene(graph.value);
        
        networkGroup = root;
        scene.add(networkGroup);
        
        // Store Instance Map for Raycasting
        // We use a global or module-level map? Better attached to the component instance but non-reactive
        // Let's store it in objectsMap references
        objectsMap.clear(); 
        for (const [key, val] of instanceMap.entries()) {
            objectsMap.set(key, val);
        }

        // Compute Bounding Box of the new Group
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Auto-Fit Camera
        const maxDim = Math.max(size.x, size.y, size.z) || 100;
        const fov = camera.fov * (Math.PI / 180);
        let cameraDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraDist *= 1.5; // Zoom out a bit

        // Position camera: Look at center, offset by distance
        // We want Top-Down or Isometric? Isometric is better for 3D.
        camera.position.set(center.x + cameraDist, center.y + cameraDist, center.z + cameraDist);
        controls.target.copy(center);
        
        console.log(`[Viewer] Built Scene. Origin: ${origin.x}, ${origin.y}`);
        console.log(`[Viewer] Auto-Fit: Center(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}) Size(${maxDim.toFixed(1)})`);

        loading.value = false;
        controls.update();
    }, 10);
};

// --- Interaction ---

const onClick = (e) => {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    // Intersect only network objects
    const intersects = raycaster.intersectObjects(networkGroup ? networkGroup.children : []);

    if (intersects.length > 0) {
        // Find first with mapped ID
        const hit = intersects.find(i => {
             // For InstancedMesh, we use UUID:InstanceID
             // For normal Mesh, we use UUID or ID.
             const key = i.object.uuid + ':' + (i.instanceId ?? '');
             if (objectsMap.has(key)) return true;
             // Legacy/Fallback (if we mix types)
             return objectsMap.has(i.object.id);
        });

        if (hit) {
            let id = objectsMap.get(hit.object.uuid + ':' + (hit.instanceId ?? ''));
            if (!id) id = objectsMap.get(hit.object.id);
            
            store.setSelected(id);
            return;
        }
    }
    store.clearSelection();
};

const resetView = () => {
    if (controls) {
        controls.target.set(0, 0, 0); // World Center (since we shifted Group)
        camera.position.set(0, 500, 500);
        controls.update();
    }
};

const onResize = () => {
    if (!canvasContainer.value || !camera || !renderer) return;
    const w = canvasContainer.value.clientWidth;
    const h = canvasContainer.value.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
};

const animate = () => {
    animationId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
};

// --- Lifecycle ---

watch(graph, () => {
    if (graph.value.nodes.size > 0) buildScene();
}, { deep: true });

onMounted(() => {
    initThree();
    if (graph.value.nodes.size > 0) buildScene();
});

onBeforeUnmount(() => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', onResize);
    canvasContainer.value?.removeEventListener('click', onClick);
    if (renderer) renderer.dispose();
});
</script>

<style scoped>
.isyifc-viewer-3d {
    width: 100%; height: 100%; position: relative;
    background: #f0f2f5;
}
.canvas-container { width: 100%; height: 100%; }
.loading-overlay {
    position: absolute; top:0; left:0; width:100%; height:100%;
    background: rgba(255,255,255,0.8); z-index: 10;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.spinner {
    border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
    border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;
}
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.controls { position: absolute; bottom: 1rem; right: 1rem; }
.controls button {
    width: 40px; height: 40px; background: white; border: 1px solid #ccc;
    border-radius: 50%; cursor: pointer; font-size: 1.2rem;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.empty-state {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    color: #888; font-size: 1.2rem;
}

.info-window {
    position: absolute; top: 1rem; left: 1rem; width: 280px;
    background: rgba(255,255,255,0.95); backdrop-filter: blur(10px);
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    overflow: hidden; font-family: sans-serif;
}
.info-header {
    background: #2c3e50; color: white; padding: 0.8rem;
    display: flex; justify-content: space-between; align-items: center;
}
.info-header h3 { margin: 0; font-size: 1rem; }
.close-btn { background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; }
.info-content { padding: 1rem; 
    max-height: 400px;
    overflow-y: auto;
}
.info-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.9rem; }
.label { color: #7f8c8d; }
.value { font-weight: 600; color: #2c3e50; text-align: right; }
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(20px); opacity: 0; }
</style>
