<template>
  <ProjektKarte titel="Volltextsuche im Projektordner" icon="suche">
    <template #aktionen>
      <span v-if="indexStand" class="prj-dim">{{ indexStand.eintraege }} Einträge</span>
      <button type="button" class="prj-knopf" :disabled="laeuft" @click="indexieren"><ProjektIcon :name="laeuft ? 'laden' : 'aktualisieren'" :size="13" /> Index aktualisieren</button>
    </template>
    <form class="prj-suche" @submit.prevent="suchen">
      <input v-model.trim="q" type="search" placeholder="Wort oder Wortanfang — pdf, docx, xlsx, Text, E-Mails" />
      <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="q.length < 2">Suchen</button>
    </form>
    <p v-if="bericht" class="prj-dim">Index: {{ bericht.neu }} neu, {{ bericht.entfernt }} entfernt, {{ bericht.mails_neu }} Mails, {{ bericht.dauer_s }} s</p>
    <LeerHinweis v-if="gesucht && !treffer.length" text="Kein Treffer." />
    <ul v-else class="prj-treffer">
      <li v-for="t in treffer" :key="t.pfad">
        <button v-if="t.typ === 'datei'" type="button" class="prj-treffer-titel" @click="$emit('oeffnen', t.pfad)">{{ t.pfad }}</button>
        <span v-else class="prj-treffer-titel prj-treffer-mail">{{ t.titel }}</span>
        <span class="prj-snippet" v-html="markiert(t.snippet)"></span>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// SucheKarte — FTS5-Index je Projekt (_akte/index.sqlite); Treffer öffnen die Datei.
import { onMounted, ref } from 'vue';
import ProjekteApi from '../../services/ProjekteApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';

const props = defineProps({ akte: { type: Object, required: true } });
defineEmits(['oeffnen']);
const q = ref('');
const treffer = ref([]);
const gesucht = ref(false);
const indexStand = ref(null);
const bericht = ref(null);
const laeuft = ref(false);

function markiert(snippet) {
  const sicher = String(snippet || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return sicher.replace(/\[([^\]]+)\]/g, '<mark>$1</mark>');
}

async function suchen() {
  if (q.value.length < 2) return;
  try {
    const r = await ProjekteApi.suche(props.akte.id, q.value);
    treffer.value = r.treffer;
    indexStand.value = r.index;
    gesucht.value = true;
  } catch (error) {
    console.warn('projekte suche:', error);
  }
}

async function indexieren() {
  laeuft.value = true;
  try {
    bericht.value = await ProjekteApi.indexAktualisieren(props.akte.id);
    indexStand.value = { eintraege: bericht.value.eintraege };
    if (gesucht.value) await suchen();
  } catch (error) {
    console.warn('projekte index:', error);
  } finally {
    laeuft.value = false;
  }
}

onMounted(async () => {
  try {
    indexStand.value = (await ProjekteApi.suche(props.akte.id, 'zz')).index;
  } catch (error) { indexStand.value = null; }
});
</script>

<style scoped>
.prj-suche { display: flex; gap: 0.4rem; margin-bottom: 0.6rem; }
.prj-suche input { flex: 1; padding: 0.4rem 0.55rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.85rem; }
.prj-dim { font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-treffer { list-style: none; margin: 0; padding: 0; }
.prj-treffer li { display: flex; flex-direction: column; gap: 0.15rem; padding: 0.4rem 0; border-bottom: 1px dashed var(--prj-rand); }
.prj-treffer-titel { border: none; background: transparent; padding: 0; text-align: left; color: var(--prj-akzent); font-weight: 600; font-size: 0.85rem; cursor: pointer; font-family: var(--prj-mono); }
.prj-treffer-mail { color: var(--prj-text); cursor: default; font-family: inherit; }
.prj-snippet { font-size: 0.8rem; color: var(--prj-text-dim); }
.prj-snippet :deep(mark) { background: var(--prj-warn-weich); color: var(--prj-text); padding: 0 0.1rem; }
</style>
