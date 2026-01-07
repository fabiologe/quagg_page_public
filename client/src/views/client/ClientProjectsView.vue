<template>
  <ClientLayout>
    <div class="client-projects">
      <h1>Meine Projekte</h1>
      <ProjectList />
    </div>
  </ClientLayout>
</template>

<script setup>
import ClientLayout from '@/components/layout/ClientLayout.vue'
import ProjectList from '@/features/projects/components/ProjectList.vue'
</script>

<style scoped>
.client-projects {
  max-width: 1200px;
  margin: 0 auto;
}
</style>

