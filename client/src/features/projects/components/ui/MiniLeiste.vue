<template>
  <div class="prj-mini" :title="`Leistung ${prozent} %`">
    <div class="prj-mini-fuell" :style="{ width: `${prozent}%` }"></div>
  </div>
</template>

<script setup>
// MiniLeiste — Portfolio-Variante des Balkens aus EINER Kennzahl (ohne Segmente).
import { computed } from 'vue';

const props = defineProps({ fortschritt: { type: Object, default: null } });
const prozent = computed(() => Math.max(0, Math.min(100, Number(props.fortschritt?.prozent) || 0)));
</script>

<style scoped>
.prj-mini { height: 0.45rem; border-radius: 2px; background: var(--prj-leistung-weich); overflow: hidden; }
.prj-mini-fuell { height: 100%; background: var(--prj-leistung); }
</style>
