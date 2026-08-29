<template>
  <div class="prj-leer">
    <ProjektIcon name="leer" :size="22" />
    <p>{{ text }}</p>
  </div>
</template>

<script setup>
// LeerHinweis — der eine "Noch nichts da"-Zustand.
import ProjektIcon from './ProjektIcon.vue';

defineProps({
  text: { type: String, default: 'Noch keine Einträge' },
});
</script>

<style scoped>
.prj-leer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1.6rem 1rem;
  color: var(--prj-text-dim);
}
.prj-leer p {
  margin: 0;
  font-size: 0.82rem;
}
</style>
