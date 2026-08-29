<template>
  <section class="prj-karte">
    <header v-if="titel" class="prj-karte-kopf">
      <h2 class="prj-karte-titel">
        <ProjektIcon v-if="icon" :name="icon" :size="15" />
        {{ titel }}
      </h2>
      <div class="prj-karte-aktionen"><slot name="aktionen" /></div>
    </header>
    <div class="prj-karte-inhalt"><slot /></div>
  </section>
</template>

<script setup>
// ProjektKarte — der eine Karten-Rahmen des Features.
import ProjektIcon from './ProjektIcon.vue';

defineProps({
  titel: { type: String, default: '' },
  icon: { type: String, default: '' },
});
</script>

<style scoped>
.prj-karte {
  background: var(--prj-flaeche);
  border: 1px solid var(--prj-rand);
  border-radius: 8px;
  box-shadow: var(--prj-schatten);
  overflow: hidden;
}
.prj-karte-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  background: var(--prj-flaeche-2);
  border-bottom: 1px solid var(--prj-rand);
}
.prj-karte-titel {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--prj-text);
}
.prj-karte-aktionen {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.prj-karte-inhalt {
  padding: 0.9rem;
}
</style>
