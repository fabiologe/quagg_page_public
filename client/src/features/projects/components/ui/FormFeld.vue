<template>
  <label class="prj-formfeld">
    <span class="prj-formfeld-name">
      {{ name }} <small v-if="optional">(optional)</small>
    </span>
    <slot />
    <em v-if="fehler" class="prj-formfeld-fehler">{{ fehler }}</em>
  </label>
</template>

<script setup>
// FormFeld — Label + Eingabeelement (Slot) + Fehlerzeile.
defineProps({
  name: { type: String, required: true },
  fehler: { type: String, default: '' },
  optional: { type: Boolean, default: false },
});
</script>

<style scoped>
.prj-formfeld {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--prj-text-dim);
}
.prj-formfeld :deep(input),
.prj-formfeld :deep(select),
.prj-formfeld :deep(textarea) {
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--prj-rand-stark);
  border-radius: 6px;
  background: var(--prj-flaeche);
  color: var(--prj-text);
  font-size: 0.85rem;
  font-family: inherit;
}
.prj-formfeld :deep(input:focus),
.prj-formfeld :deep(select:focus),
.prj-formfeld :deep(textarea:focus) {
  outline: 2px solid var(--prj-akzent-weich);
  border-color: var(--prj-akzent);
}
.prj-formfeld-fehler {
  color: var(--prj-fehler);
  font-style: normal;
}
</style>
