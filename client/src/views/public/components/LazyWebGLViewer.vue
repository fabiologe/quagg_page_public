<template>
  <div class="webgl-viewer-container" ref="containerRef">
    <div v-if="!isVisible" class="placeholder">
      <div class="spinner"></div>
      <p>Lade interaktives 3D-Modell...</p>
    </div>
    
    <TresCanvas v-if="isVisible" alpha>
      <TresPerspectiveCamera :position="[5, 5, 5]" :look-at="[0, 0, 0]" />
      
      <!-- Enable OrbitControls for user interaction -->
      <OrbitControls />

      <TresScene>
        <TresAmbientLight :intensity="0.8" />
        <TresDirectionalLight :position="[10, 20, 10]" :intensity="1.5" cast-shadow />
        
        <!-- Load custom GLTF Model if provided -->
        <Suspense v-if="modelUrl">
          <GLTFModel :path="modelUrl" draco />
        </Suspense>

        <!-- Fallback: Abstract Pit / Manhole visualization -->
        <TresGroup v-else>
          <!-- Outer cylinder (shaft) -->
          <TresMesh :position="[0, 0, 0]">
            <TresCylinderGeometry :args="[1.5, 1.5, 4, 32, 1, true]" />
            <TresMeshStandardMaterial color="#7f8c8d" side="DoubleSide" wireframe />
          </TresMesh>
          
          <!-- Inner water level -->
          <TresMesh :position="[0, waterLevel, 0]">
            <TresCylinderGeometry :args="[1.48, 1.48, 0.1, 32]" />
            <TresMeshStandardMaterial color="#3498db" transparent :opacity="0.8" />
          </TresMesh>
          
          <!-- Base -->
          <TresMesh :position="[0, -2, 0]">
            <TresCylinderGeometry :args="[1.5, 1.5, 0.2, 32]" />
            <TresMeshStandardMaterial color="#95a5a6" />
          </TresMesh>
        </TresGroup>
      </TresScene>
    </TresCanvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { OrbitControls, GLTFModel } from '@tresjs/cientos'

const props = defineProps({
  modelUrl: {
    type: String,
    default: '' // Optional URL to a .glb or .gltf file
  }
})

const containerRef = ref(null)
const isVisible = ref(false)
let observer = null

onMounted(() => {
  // LAZY LOADING IMPLEMENTATION
  // Only mount the WebGL context when the component enters the viewport
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      isVisible.value = true
      // We can stop observing once it's loaded to save performance
      observer.disconnect()
    }
  }, {
    threshold: 0.1 // Trigger when 10% visible
  })
  
  if (containerRef.value) {
    observer.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})
</script>

<style scoped>
.webgl-viewer-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
  background: #111b2b;
  border-radius: 12px;
  overflow: hidden;
}

.placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #888;
  font-family: monospace;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255,255,255,0.1);
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
