<template>
  <InternLayout>
    <div class="intern-dashboard">
      <h1>Internes Dashboard</h1>
      <p>Willkommen im internen Bereich</p>
      <ProjectList />
    </div>
  </InternLayout>
</template>

<script setup>
import InternLayout from '@/components/layout/InternLayout.vue'
</script>

<style scoped>
.intern-dashboard {
  max-width: 1200px;
  margin: 0 auto;
}
</style>

