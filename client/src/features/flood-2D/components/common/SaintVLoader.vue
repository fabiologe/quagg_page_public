<template>
  <div class="sv-loading">
    <img :src="loaderSrc" alt="Lädt…" />
    <span v-if="text" class="sv-loading-text">{{ text }}</span>
  </div>
</template>

<script setup>
// Wiederverwendbare SaintV-2D-Ladeanimation (selbst-animierendes SVG).
defineProps({
  text: { type: String, default: '' },
});

// Datei liegt in public/ → über Root-URL referenzieren (Leerzeichen encodiert).
const loaderSrc = '/construction%20animations/Loading%20Icon%20-%20Plan.svg';
</script>
