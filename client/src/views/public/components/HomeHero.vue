<template>
  <section class="hero">
    <div class="hero-content">
      <h1 class="hero-title">
        <span class="highlight">Vertrauen.</span>
        <span class="highlight">Leidenschaft.</span>
        <span class="highlight">Innovation.</span>
      </h1>
      <p class="hero-subtitle">
        Ihr Partner für Entwässerungsplanung und Tiefbauplanung (LPH 1-4).
        <br />
        Wir gestalten die Infrastruktur von morgen.
      </p>
      <div class="hero-actions">
        <BaseButton @click="$router.push('/login')" class="cta-button">
          Projekt starten
        </BaseButton>
        <BaseButton @click="$emit('scrollToServices')" variant="secondary" class="secondary-button">
          Leistungen ansehen
        </BaseButton>
      </div>
    </div>
    <div class="hero-background">
      <div class="shape shape-1"></div>
      <div class="shape shape-2"></div>
    </div>
  </section>
</template>

<script setup>
import BaseButton from '@/components/base/BaseButton.vue'

defineEmits(['scrollToServices'])
</script>

<style scoped>
.hero {
  position: relative;
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4rem 2rem;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  overflow: hidden;
  
  /* Variables fallback if not provided by parent */
  --primary: #3498db;
  --secondary: #2c3e50;
  --accent: #00d2ff;
}

.hero-content {
  position: relative;
  z-index: 2;
  max-width: 800px;
}

.hero-title {
  font-size: 3.5rem;
  font-weight: 800;
  line-height: 1.2;
  margin-bottom: 1.5rem;
  color: var(--secondary);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

@media (min-width: 768px) {
  .hero-title {
    flex-direction: row;
    justify-content: center;
    gap: 1rem;
  }
}

.hero-title .highlight {
  background: linear-gradient(120deg, var(--primary), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: #555;
  margin-bottom: 2.5rem;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.cta-button {
  font-size: 1.1rem;
  padding: 0.8rem 2rem;
}

/* Abstract Background Shapes */
.hero-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
}

.shape-1 {
  top: -10%;
  left: -10%;
  width: 500px;
  height: 500px;
  background: var(--primary);
  animation: float 20s infinite ease-in-out;
}

.shape-2 {
  bottom: -10%;
  right: -10%;
  width: 600px;
  height: 600px;
  background: var(--accent);
  animation: float 25s infinite ease-in-out reverse;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(50px, 50px); }
}
</style>
