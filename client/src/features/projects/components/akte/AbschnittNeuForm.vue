<template>
  <form class="prj-neu" @submit.prevent="absenden">
    <input v-model.trim="felder.bezeichnung" type="text" placeholder="Bezeichnung (z. B. Nachtrag 1, Vermessung)" required />
    <select v-model="felder.art">
      <option value="grund">Grundleistung</option>
      <option value="besondere">Besondere Leistung</option>
      <option value="nachtrag">Nachtrag</option>
      <option value="nebenkosten">Nebenkosten</option>
    </select>
    <select v-model="felder.lph">
      <option :value="null">ohne LPH</option>
      <option v-for="l in LEISTUNGSPHASEN" :key="l.nr" :value="l.nr">LPH {{ l.nr }}</option>
    </select>
    <input v-model="honorarText" type="text" inputmode="decimal" placeholder="Honorar € netto" />
    <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!felder.bezeichnung || honorarCent === null">Anlegen</button>
  </form>
</template>

<script setup>
// AbschnittNeuForm — freier Abschnitt (Pauschale, Nachtrag, Besondere Leistung, Nebenkosten).
import { computed, reactive, ref } from 'vue';
import { euroZuCent } from '@/features/kleiner-pedant/services/Geld';
import { LEISTUNGSPHASEN } from '../../services/Phasen';

const emit = defineEmits(['anlegen']);
const felder = reactive({ bezeichnung: '', art: 'grund', lph: null });
const honorarText = ref('');
const honorarCent = computed(() => (honorarText.value ? euroZuCent(honorarText.value) : 0));

function absenden() {
  if (!felder.bezeichnung || honorarCent.value === null || honorarCent.value < 0) return;
  emit('anlegen', { ...felder, honorar_cent: honorarCent.value });
  felder.bezeichnung = '';
  honorarText.value = '';
}
</script>

<style scoped>
.prj-neu { display: grid; grid-template-columns: 1fr 10rem 7rem 9rem auto; gap: 0.4rem; }
.prj-neu input, .prj-neu select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--prj-rand-stark);
  border-radius: 6px;
  background: var(--prj-flaeche);
  color: var(--prj-text);
  font-size: 0.82rem;
}
@media (max-width: 60rem) { .prj-neu { grid-template-columns: 1fr 1fr; } }
</style>
