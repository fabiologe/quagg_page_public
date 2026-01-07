<template>
  <div class="project-list">
    <h2>Projekte</h2>
    <div v-if="loading" class="loading">
      <BaseSpinner message="Projekte werden geladen..." />
    </div>
    <div v-else-if="error" class="error">
      {{ error }}
    </div>
    <div v-else-if="projects.length === 0" class="empty">
      Keine Projekte gefunden.
    </div>
    <ul v-else class="projects">
      <li v-for="project in projects" :key="project.id" class="project-item">
        <router-link :to="`/projects/${project.id}`">
          <h3>{{ project.name }}</h3>
          <p>{{ project.description }}</p>
          <span class="client">{{ project.client }}</span>
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { projectApi } from '../services/projectApi'
import BaseSpinner from '@/components/base/BaseSpinner.vue'

const projects = ref([])
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  loading.value = true
  try {
    projects.value = await projectApi.getAll()
  } catch (err) {
    error.value = 'Fehler beim Laden der Projekte'
    console.error(err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.project-list {
  max-width: 1200px;
  margin: 0 auto;
}

.projects {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.project-item {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
}

.project-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.project-item a {
  text-decoration: none;
  color: inherit;
  display: block;
}

.project-item h3 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.project-item p {
  margin: 0 0 1rem 0;
  color: #666;
}

.project-item .client {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background-color: #ecf0f1;
  border-radius: 12px;
  font-size: 0.875rem;
  color: #555;
}

.loading,
.error,
.empty {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.error {
  color: #e74c3c;
}
</style>

