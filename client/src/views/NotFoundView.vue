<template>
  <div class="not-found-view">
    <h1>404</h1>
    <p>Seite nicht gefunden</p>
    <BaseButton @click="$router.push('/home')">Zur Startseite</BaseButton>
  </div>
</template>

<script setup>
import BaseButton from '@/components/base/BaseButton.vue'
</script>

<style scoped>
.not-found-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  text-align: center;
}

.not-found-view h1 {
  font-size: 6rem;
  color: #3498db;
  margin-bottom: 1rem;
}

.not-found-view p {
  font-size: 1.5rem;
  color: #666;
  margin-bottom: 2rem;
}
</style>

