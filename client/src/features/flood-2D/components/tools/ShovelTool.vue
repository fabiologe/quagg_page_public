<template>
  <div class="shovel-tool-ui">
    <!-- Optional UI: Settings for Brush Size / Strength -->
    <div class="tool-panel">
        <div class="panel-header">Shovel Settings</div>
        <div class="control-row">
            <label>Depth:</label>
            <span>-0.5m</span>
        </div>
        <div class="hint">Click to Dig</div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue';
import * as THREE from 'three';

const props = defineProps({
  context: { type: Object, required: true }, // { scene, terrainMesh, parsedData, camera, canvas }
  active: Boolean
});

// Internal State
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Intersection Plane

const onClick = (event) => {
    if (!props.active || !props.context.parsedData) return;
    
    const { canvas, camera, terrainMesh, parsedData } = props.context;
    const rect = canvas.getBoundingClientRect();
    
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(pointer, camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    
    if (target) {
        const { minZ, cellsize, ncols, nrows, gridData, bounds } = parsedData;
        const localX = target.x + bounds.width / 2;
        const localY = -target.z + bounds.height / 2;
        
        const col = Math.round(localX / cellsize);
        const geomRow = Math.round(localY / cellsize);
        const gridRow = (nrows - 1) - geomRow;
        
        if (col >= 0 && col < ncols && gridRow >= 0 && gridRow < nrows) {
            const idx = gridRow * ncols + col;
            
            // Perform Dig
            let currentZ = minZ;
            if (gridData[idx] > -9000) currentZ = gridData[idx];
            
            const newZ = currentZ - 0.5;
            gridData[idx] = newZ;
            
            // Update Mesh
            // Map idx to geometry vertex
            if (terrainMesh && terrainMesh.geometry) {
                 const attr = terrainMesh.geometry.attributes.position;
                 attr.setZ(idx, (newZ - minZ));
                 attr.needsUpdate = true;
            }
        }
    }
};

onMounted(() => {
    window.addEventListener('click', onClick);
});

onUnmounted(() => {
    window.removeEventListener('click', onClick);
});
</script>

<style scoped>
.shovel-tool-ui {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    pointer-events: none; /* Let clicks pass through to canvas? No, canvas is behind. */
    /* Actually we need to click the canvas. So UI should not block canvas clicks unless on the UI itself. */
}

.tool-panel {
    background: rgba(44, 62, 80, 0.8);
    color: white;
    padding: 10px 15px;
    border-radius: 6px;
    pointer-events: auto;
    font-size: 0.9rem;
    backdrop-filter: blur(4px);
}
.panel-header { font-weight: bold; margin-bottom: 5px; color: #dcdcdc; }
.hint { font-size: 0.8rem; opacity: 0.7; margin-top: 5px; }
</style>
