<template>
  <PublicLayout>
    <div class="projects-page">
      <div class="page-header">
        <div class="container">
          <h1>Unsere Projekte</h1>
          <p>Einblicke in unsere Arbeit und Referenzen.</p>
        </div>
      </div>
      
      <!-- Reuse the HomeProjects component but maybe we can expand it later -->
      <!-- For now, we'll render the same content but in a dedicated page context -->
      <HomeProjects class="projects-section-override" />
      
      <div class="container more-projects">
        <p>Dies ist nur ein Auszug. Kontaktieren Sie uns für eine vollständige Referenzliste.</p>
      </div>
    </div>
  </PublicLayout>
</template>

<script setup>
import PublicLayout from '@/components/layout/PublicLayout.vue'
import HomeProjects from '@/views/public/components/HomeProjects.vue'
</script>

<style scoped>
.projects-page {
  background-color: #fff;
}

.page-header {
  background: var(--secondary, #2c3e50);
  color: white;
  padding: 4rem 0;
  text-align: center;
}

.page-header h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.page-header p {
  font-size: 1.2rem;
  opacity: 0.9;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* Override some styles from the reused component if needed */
:deep(.projects) {
  padding-top: 4rem;
  background: white;
}

.more-projects {
  text-align: center;
  padding: 2rem 0 4rem;
  color: #666;
  font-style: italic;
}
</style>
