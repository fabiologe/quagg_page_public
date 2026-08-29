<template>
  <div class="prj-geld">
    <GeldKennwerte :akte="akte" :geld="store.geld" />
    <div class="prj-geld-spalten">
      <div class="prj-spalte">
        <AbschlagKarte :akte="akte" />
        <SchlussrechnungKarte :akte="akte" />
        <RechnungenListe :rechnungen="store.geld?.rechnungen || []" />
      </div>
      <div class="prj-spalte">
        <BelegeListe :akte="akte" :belege="store.geld?.belege || []" />
      </div>
    </div>
  </div>
</template>

<script setup>
// AkteGeld — Tab „Geld": Kennwerte + Balken-Schichten, Abschlag, Rechnungen, Belege.
// Alles Geld kommt aus dem Pedanten; hier wird verknüpft, nicht gebucht.
import { onMounted, watch } from 'vue';
import AbschlagKarte from './AbschlagKarte.vue';
import BelegeListe from './BelegeListe.vue';
import GeldKennwerte from './GeldKennwerte.vue';
import RechnungenListe from './RechnungenListe.vue';
import SchlussrechnungKarte from './SchlussrechnungKarte.vue';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();

onMounted(() => store.ladeGeld(props.akte.id));
watch(() => props.akte.id, (id) => store.ladeGeld(id));
</script>

<style scoped>
.prj-geld { display: flex; flex-direction: column; gap: 1rem; }
.prj-geld-spalten { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; }
.prj-spalte { display: flex; flex-direction: column; gap: 1rem; }
@media (max-width: 60rem) { .prj-geld-spalten { grid-template-columns: minmax(0, 1fr); } }
</style>
