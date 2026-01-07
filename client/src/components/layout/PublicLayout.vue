<template>
  <div class="public-layout">
    <header class="public-header">
      <div class="header-content">
        <h1>Quagg Engineering</h1>
        <nav class="public-nav">
          <router-link to="/home">Startseite</router-link>
          <router-link to="/projects">Projekte</router-link>
          <router-link to="/tools" class="highlight">Taschenrechner</router-link>
          <router-link to="/contact">Kontakt</router-link>
          <router-link to="/login">Login</router-link>
        </nav>
      </div>
    </header>
    <main class="public-main">
      <slot />
    </main>
    <PublicFooter />
  </div>
</template>

<script setup>
import PublicFooter from '@/components/layout/PublicFooter.vue'
</script>

<style>
/* Global Variables for Public Layout */
:root {
  --primary: #3498db;
  --secondary: #2c3e50;
  --accent: #00d2ff;
  --text: #333;
  --bg-light: #f8f9fa;
}
</style>

<style scoped>
.public-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.public-header {
  padding: 0 2rem;
  background-color: #fff;
  border-bottom: 1px solid #eee;
  height: 64px;
  display: flex;
  align-items: center;
}

.header-content {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.public-nav {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.public-nav a {
  text-decoration: none;
  color: #666;
  font-weight: 500;
  transition: color 0.2s;
}

.public-nav a:hover, .public-nav a.router-link-active {
  color: #3498db;
}

/* Der Button-Look für das Tool */
.public-nav a.highlight {
  background-color: #3498db;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 4px;
}

.public-nav a.highlight:hover {
  background-color: #2980b9;
  color: white;
}

.public-main {
  flex: 1;
  /* Entferne padding/center, damit die Karte den Platz nutzen kann */
  display: block; 
}

@media (max-width: 768px) {
  .public-header {
    height: auto;
    padding: 1rem;
  }

  .header-content {
    flex-direction: column;
    gap: 1rem;
  }

  .public-nav {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
  }
  
  .public-nav a {
    font-size: 0.9rem;
  }
}
</style>