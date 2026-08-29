<template>
  <label class="ped-formfeld">
    <span class="ped-formfeld-name">
      {{ name }} <small v-if="optional">(optional)</small>
    </span>
    <slot />
    <em v-if="fehler" class="ped-formfeld-fehler">{{ fehler }}</em>
  </label>
</template>

<script setup>
// FormFeld — Label + beliebiges Eingabeelement (Slot) + Fehlerzeile,
// damit jedes Formular im Feature gleich aussieht.
defineProps({
  name: { type: String, required: true },
  fehler: { type: String, default: '' },
  optional: { type: Boolean, default: false },
});
</script>

<style scoped>
.ped-formfeld {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--ped-text-dim);
}
.ped-formfeld :deep(input),
.ped-formfeld :deep(select),
.ped-formfeld :deep(textarea) {
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.82rem;
}
.ped-formfeld :deep(input:focus),
.ped-formfeld :deep(select:focus),
.ped-formfeld :deep(textarea:focus) {
  outline: 2px solid var(--ped-akzent-weich);
  border-color: var(--ped-akzent);
}
.ped-formfeld-fehler {
  font-style: normal;
  font-size: 0.72rem;
  color: var(--ped-fehler);
}
</style>
