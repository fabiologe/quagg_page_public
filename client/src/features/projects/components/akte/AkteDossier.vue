<template>
  <ProjektKarte titel="Dossier — die Akte als Text (für Menschen und die KI)" icon="dossier">
    <template #aktionen>
      <button type="button" class="prj-knopf" :disabled="laedt" @click="laden">
        <ProjektIcon :name="laedt ? 'laden' : 'aktualisieren'" :size="13" /> Neu erzeugen
      </button>
    </template>
    <p class="prj-dossier-hinweis">
      Wird bei jedem Aufruf frisch erzeugt und als <code>_akte/DOSSIER.md</code> im Projektordner abgelegt.
      Dieselbe Akte bekommt Claude über den Projekt-Connector (<code>projekt_dossier</code>).
    </p>
    <p v-if="fehler" class="prj-fehler">{{ fehler }}</p>
    <pre v-else-if="text" class="prj-dossier">{{ text }}</pre>
    <LeerHinweis v-else text="Noch nicht erzeugt." />
  </ProjektKarte>
</template>

<script setup>
// AkteDossier — zeigt das Markdown-Dossier roh (Monospace); ein Renderer ist bewusst nicht im Spiel.
import { onMounted, ref, watch } from 'vue';
import ProjekteApi from '../../services/ProjekteApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';

const props = defineProps({ akte: { type: Object, required: true } });
const text = ref('');
const laedt = ref(false);
const fehler = ref('');

async function laden() {
  laedt.value = true;
  fehler.value = '';
  try {
    text.value = await ProjekteApi.dossier(props.akte.id);
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Dossier konnte nicht erzeugt werden.';
  } finally {
    laedt.value = false;
  }
}

onMounted(laden);
watch(() => props.akte.id, laden);
</script>

<style scoped>
.prj-dossier-hinweis { margin: 0 0 0.8rem; font-size: 0.8rem; color: var(--prj-text-dim); }
.prj-dossier {
  margin: 0;
  padding: 0.9rem 1rem;
  border: 1px solid var(--prj-rand);
  border-radius: 6px;
  background: var(--prj-flaeche-2);
  font-family: var(--prj-mono);
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 70vh;
  overflow: auto;
}
</style>
