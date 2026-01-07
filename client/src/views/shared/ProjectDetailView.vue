<template>
  <div class="project-detail">
    <div v-if="loading">
      <BaseSpinner message="Projekt wird geladen..." />
    </div>
    <div v-else-if="error">
      {{ error }}
    </div>
    <div v-else-if="project">
      <h1>{{ project.name }}</h1>
      <p><strong>Kunde:</strong> {{ project.client }}</p>
      <p><strong>Beschreibung:</strong> {{ project.description }}</p>
      <p><strong>Status:</strong> {{ project.active_phase }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { projectApi } from '@/features/projects/services/projectApi'
import BaseSpinner from '@/components/base/BaseSpinner.vue'

const route = useRoute()
const project = ref(null)
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  loading.value = true
  try {
    project.value = await projectApi.getById(route.params.id)
  } catch (err) {
    error.value = 'Fehler beim Laden des Projekts'
    console.error(err)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.project-detail {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  background: white;
  border-radius: 8px;
}

.project-detail h1 {
  margin-bottom: 1.5rem;
  color: #2c3e50;
}

.project-detail p {
  margin-bottom: 1rem;
  line-height: 1.6;
}
</style>

