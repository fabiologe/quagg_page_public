<template>
  <section class="ped-karte">
    <header v-if="titel" class="ped-karte-kopf">
      <h2 class="ped-karte-titel">
        <PedantIcon v-if="icon" :name="icon" :size="15" />
        {{ titel }}
      </h2>
      <div class="ped-karte-aktionen"><slot name="aktionen" /></div>
    </header>
    <div class="ped-karte-inhalt"><slot /></div>
  </section>
</template>

<script setup>
// PedantKarte — der eine Karten-Rahmen des Features.
import PedantIcon from './PedantIcon.vue';

defineProps({
  titel: { type: String, default: '' },
  icon: { type: String, default: '' },
});
</script>

<style scoped>
.ped-karte {
  background: var(--ped-flaeche);
  border: 1px solid var(--ped-rand);
  border-radius: 8px;
  box-shadow: var(--ped-schatten);
  overflow: hidden;
}
.ped-karte-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  background: var(--ped-flaeche-2);
  border-bottom: 1px solid var(--ped-rand);
}
.ped-karte-titel {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--ped-text);
}
.ped-karte-aktionen {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.ped-karte-inhalt {
  padding: 0.9rem;
}
</style>
