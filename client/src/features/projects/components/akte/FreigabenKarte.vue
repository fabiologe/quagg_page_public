<template>
  <ProjektKarte titel="Kundenportal" icon="beteiligte">
    <p class="prj-dim">Freigegebene Portal-Nutzer sehen Phase, Leistungsstand und Termine dieses Projekts — nie Geld.</p>
    <form class="prj-zeile" @submit.prevent="freigeben">
      <select v-model="auswahl">
        <option :value="''">Portal-Nutzer wählen…</option>
        <option v-for="n in kandidaten" :key="n.username" :value="n.username">{{ n.username }}</option>
      </select>
      <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!auswahl">Freigeben</button>
    </form>
    <LeerHinweis v-if="!freigaben.length" text="Noch niemand freigegeben." />
    <ul v-else class="prj-liste">
      <li v-for="f in freigaben" :key="f.username">
        <span>{{ f.username }}</span>
        <small class="prj-dim">seit {{ datum(String(f.angelegt_am).slice(0, 10)) }} · {{ f.von }}</small>
        <button type="button" class="prj-knopf prj-knopf-klein" title="Freigabe entziehen" @click="entziehen(f.username)"><ProjektIcon name="schliessen" :size="13" /></button>
      </li>
    </ul>
    <p v-if="fehler" class="prj-fehler">{{ fehler }}</p>
  </ProjektKarte>
</template>

<script setup>
// FreigabenKarte — welche CLIENT-Nutzer dieses Projekt im Kundenportal sehen.
import { computed, onMounted, ref, watch } from 'vue';
import ProjekteApi from '../../services/ProjekteApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';

const props = defineProps({ akte: { type: Object, required: true } });
const nutzer = ref([]);
const freigaben = ref([]);
const auswahl = ref('');
const fehler = ref('');
const kandidaten = computed(() => nutzer.value.filter((n) => !freigaben.value.some((f) => f.username === n.username)));

async function laden() {
  try {
    [nutzer.value, freigaben.value] = await Promise.all([ProjekteApi.portalNutzer(), ProjekteApi.freigaben(props.akte.id)]);
  } catch (error) { fehler.value = 'Freigaben konnten nicht geladen werden.'; }
}
async function freigeben() {
  fehler.value = '';
  try {
    freigaben.value = await ProjekteApi.freigeben(props.akte.id, auswahl.value);
    auswahl.value = '';
  } catch (error) { fehler.value = error?.response?.data?.detail || 'Freigabe fehlgeschlagen.'; }
}
async function entziehen(username) {
  try { freigaben.value = await ProjekteApi.freigabeEntziehen(props.akte.id, username); } catch (error) { fehler.value = 'Entziehen fehlgeschlagen.'; }
}
onMounted(laden);
watch(() => props.akte.id, laden);
</script>

<style scoped>
.prj-dim { font-size: 0.78rem; color: var(--prj-text-dim); margin: 0 0 0.5rem; }
.prj-zeile { display: flex; gap: 0.4rem; margin-bottom: 0.6rem; }
.prj-zeile select { flex: 1; padding: 0.35rem 0.5rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.82rem; }
.prj-liste { list-style: none; margin: 0; padding: 0; }
.prj-liste li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.6rem; padding: 0.35rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.85rem; }
.prj-knopf-klein { padding: 0.25rem 0.4rem; }
</style>
