<template>
  <section class="hero-webgl">
    <div class="webgl-background">
      <TresCanvas alpha>
        <TresPerspectiveCamera :position="[0, 5, 10]" :look-at="[0, 0, 0]" />
        
        <TresScene>
          <TresAmbientLight :intensity="0.5" />
          <TresDirectionalLight :position="[10, 10, 10]" :intensity="1" />
          
          <TresMesh :position="[0, -2, 0]" :rotation="[-Math.PI / 2, 0, 0]">
            <TresPlaneGeometry :args="[50, 50, 64, 64]" />
            <TresMeshStandardMaterial 
              color="#3498db" 
              wireframe 
              transparent 
              :opacity="0.3"
            />
          </TresMesh>

          <!-- Floating abstract water particles -->
          <TresGroup ref="particlesRef">
            <TresMesh v-for="i in 100" :key="i" 
              :position="[Math.random() * 20 - 10, Math.random() * 10, Math.random() * 20 - 10]"
            >
              <TresSphereGeometry :args="[0.05, 8, 8]" />
              <TresMeshBasicMaterial color="#00d2ff" transparent :opacity="0.6" />
            </TresMesh>
          </TresGroup>

        </TresScene>
      </TresCanvas>
    </div>

    <div class="hero-content">
      <h1 class="hero-title">
        Hydrodynamische 2D-Modellierung <br/>
        <span class="highlight">& Starkregenvorsorge</span>
      </h1>
      <p class="hero-subtitle">
        Moderne Entwässerungskonzepte und tiefbauliche Präzision. <br/>
        Wir machen Wasser planbar – von der Simulation bis zur baulichen Umsetzung.
      </p>
      <div class="hero-actions">
        <BaseButton @click="$router.push('/contact')" class="cta-button primary-btn">
          Projekt anfragen
        </BaseButton>
        <BaseButton @click="$emit('scrollToServices')" variant="secondary" class="secondary-button text-white border-white">
          Expertise ansehen
        </BaseButton>
      </div>
    </div>
  </section>
</template>

<script setup>
import { shallowRef, watch, onMounted, onUnmounted } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'

defineEmits(['scrollToServices'])

const particlesRef = shallowRef(null)
let animationId = null

const animate = () => {
  if (particlesRef.value) {
    particlesRef.value.rotation.y += 0.01
    particlesRef.value.rotation.x += 0.005
    particlesRef.value.position.y = Math.sin(Date.now() * 0.001) * 0.5
  }
  animationId = requestAnimationFrame(animate)
}

onMounted(() => {
  animate()
})

onUnmounted(() => {
  if(animationId) cancelAnimationFrame(animationId)
})
</script>

<style scoped>
.hero-webgl {
  position: relative;
  min-height: 85vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  overflow: hidden;
  background: linear-gradient(to bottom, #111b2b, #1a2b45);
  color: white;
}

.webgl-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none; /* Let clicks pass through to content */
}

.hero-content {
  position: relative;
  z-index: 10;
  max-width: 900px;
  padding: 2rem;
  background: rgba(17, 27, 43, 0.4);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 20px 40px rgba(0,0,0,0.3);
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 1.5rem;
  text-shadow: 0 2px 10px rgba(0,0,0,0.5);
}

.hero-title .highlight {
  background: linear-gradient(120deg, #00d2ff, #3498db);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: #ddd;
  margin-bottom: 2.5rem;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.primary-btn {
  background: #3498db;
  border-color: #3498db;
  color: white;
  font-size: 1.1rem;
  padding: 0.8rem 2.5rem;
}

.primary-btn:hover {
  background: #2980b9;
  border-color: #2980b9;
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(52, 152, 219, 0.4);
}

@media (max-width: 768px) {
  .hero-title { font-size: 2.5rem; }
  .hero-subtitle { font-size: 1.1rem; }
  .webgl-background { opacity: 0.5; } /* Fade out on mobile for better legibility */
}
</style>
