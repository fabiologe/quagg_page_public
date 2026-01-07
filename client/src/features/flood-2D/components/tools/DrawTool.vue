<template>
  <div class="draw-tool-ui">
    <!-- UI Overlays if needed (e.g. Finish Polygon button) -->
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as THREE from 'three';

const props = defineProps({
  context: { type: Object, required: true }, 
  active: Boolean,
  mode: { type: String, default: 'LINE' } // LINE, POLY, POINT
});

// State
const points = ref([]);
let drawMesh = null;

// ThreeJS Utils
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const updateVisuals = () => {
    const { scene } = props.context;
    if (drawMesh) {
        scene.remove(drawMesh);
        if(drawMesh.geometry) drawMesh.geometry.dispose();
        if(drawMesh.material) drawMesh.material.dispose();
        drawMesh = null;
    }
    
    if (points.value.length < 1) return;

    if (props.mode === 'POINT') {
         // Render Points
         // Ideally instanced mesh, but for editor loop simplified:
         // Just rely on the "added" list in parent? 
         // Wait, parent MapEditor manages 'drawingPoints'.
         // If we move logic here, we must manage it here or emit.
         // Let's manage 'current drawing' here and emit 'commit' when done?
         // For now, let's just replicate the 'visual feedback' 
    }
    else if (points.value.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points.value);
        const material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 3 });
        drawMesh = new THREE.Line(geometry, material);
        scene.add(drawMesh);
    }
};

const onClick = (event) => {
    if (!props.active || !props.context.parsedData) return;
    
    const { canvas, camera, parsedData } = props.context;
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
             let zVal = minZ;
             if (gridData[idx] > -9000) zVal = gridData[idx];
             
             const pWorld = new THREE.Vector3(target.x, (zVal - minZ), target.z);
             points.value.push(pWorld);
             updateVisuals();
             
             // Emit?
             // emit('add-point', pWorld);
        }
    }
};

onMounted(() => {
    window.addEventListener('click', onClick);
});

onUnmounted(() => {
    window.removeEventListener('click', onClick);
    const { scene } = props.context;
    if (drawMesh) scene.remove(drawMesh);
});
</script>
