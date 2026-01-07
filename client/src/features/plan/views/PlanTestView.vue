<template>
  <div class="plan-test-view">
    <PlanViewer src="/sample.pdf" />
  </div>
</template>

<script setup>
import PlanViewer from '../components/PlanViewer.vue'
</script>

<style scoped>
.plan-test-view {
  width: 100vw;
  height: 100vh;
}
</style>
