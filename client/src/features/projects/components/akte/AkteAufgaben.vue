<template>
  <ProjektKarte titel="Aufgaben" icon="aufgaben">
    <template #aktionen>
      <label class="prj-schalter"><input v-model="mitErledigten" type="checkbox" /> erledigte zeigen</label>
    </template>
    <form class="prj-neu" @submit.prevent="anlegen">
      <input v-model.trim="entwurf.titel" type="text" placeholder="Neue Aufgabe" required />
      <input v-model="entwurf.faellig_am" type="date" title="Fällig am" />
      <select v-model="entwurf.abschnitt_id">
        <option :value="null">ohne Abschnitt</option>
        <option v-for="a in akte.abschnitte || []" :key="a.id" :value="a.id">{{ a.bezeichnung }}</option>
      </select>
      <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!entwurf.titel">Anlegen</button>
    </form>
    <LeerHinweis v-if="!sichtbar.length" text="Keine offenen Aufgaben." />
    <ul v-else class="prj-liste">
      <li v-for="a in sichtbar" :key="a.id" :class="{ 'prj-erledigt': a.status === 'erledigt' }">
        <input type="checkbox" :checked="a.status === 'erledigt'" title="erledigt" @change="umschalten(a, $event.target.checked)" />
        <span class="prj-titel">{{ a.titel }}<small v-if="a.quelle === 'ki'"> · KI</small></span>
        <span class="prj-abschnitt">{{ abschnittName(a.abschnitt_id) }}</span>
        <span class="prj-datum" :class="a.status !== 'erledigt' && `prj-termin-${dringlichkeit(a.faellig_am)}`">{{ datum(a.faellig_am) }}</span>
        <select :value="a.status" @change="store.aufgabeAendern(akte.id, a.id, { status: $event.target.value })">
          <option value="offen">offen</option><option value="laufend">laufend</option><option value="erledigt">erledigt</option>
        </select>
        <button type="button" class="prj-knopf prj-knopf-klein" title="Entfernen" @click="store.aufgabeLoeschen(akte.id, a.id)">
          <ProjektIcon name="loeschen" :size="13" />
        </button>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// AkteAufgaben — schlanke Liste (kein Kanban): Titel, Frist, Abschnitt, Status.
import { computed, reactive, ref } from 'vue';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum, dringlichkeit } from '../../services/Phasen';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();
const mitErledigten = ref(false);
const entwurf = reactive({ titel: '', faellig_am: '', abschnitt_id: null });

const sichtbar = computed(() => (props.akte.aufgaben || []).filter((a) => mitErledigten.value || a.status !== 'erledigt'));

function abschnittName(id) {
  return (props.akte.abschnitte || []).find((a) => a.id === id)?.bezeichnung || '';
}

async function anlegen() {
  if (!entwurf.titel) return;
  const ok = await store.aufgabeAnlegen(props.akte.id, {
    titel: entwurf.titel, faellig_am: entwurf.faellig_am || null, abschnitt_id: entwurf.abschnitt_id,
  });
  if (ok) { entwurf.titel = ''; entwurf.faellig_am = ''; }
}

function umschalten(a, erledigt) {
  store.aufgabeAendern(props.akte.id, a.id, { status: erledigt ? 'erledigt' : 'offen' });
}
</script>

<style scoped>
.prj-schalter { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-neu { display: grid; grid-template-columns: 1fr 10rem 12rem auto; gap: 0.4rem; margin-bottom: 0.8rem; }
.prj-neu input, .prj-neu select, .prj-liste select {
  padding: 0.35rem 0.5rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px;
  background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.82rem;
}
.prj-liste { list-style: none; margin: 0; padding: 0; }
.prj-liste li { display: grid; grid-template-columns: auto 1fr 10rem 6rem auto auto; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.85rem; }
.prj-erledigt { opacity: 0.55; }
.prj-erledigt .prj-titel { text-decoration: line-through; }
.prj-titel { font-weight: 600; }
.prj-titel small { font-weight: 400; color: var(--prj-akzent); }
.prj-abschnitt { font-size: 0.74rem; color: var(--prj-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prj-datum { font-variant-numeric: tabular-nums; }
.prj-termin-ueberfaellig { color: var(--prj-fehler); font-weight: 600; }
.prj-termin-bald { color: var(--prj-warn); font-weight: 600; }
.prj-knopf-klein { padding: 0.25rem 0.4rem; }
@media (max-width: 60rem) { .prj-neu, .prj-liste li { grid-template-columns: 1fr 1fr; } }
</style>
