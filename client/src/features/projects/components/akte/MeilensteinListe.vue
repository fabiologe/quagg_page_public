<template>
  <ProjektKarte titel="Termine und Fristen" icon="termin">
    <template #aktionen>
      <label class="prj-schalter"><input v-model="mitErledigten" type="checkbox" /> erledigte zeigen</label>
      <button type="button" class="prj-knopf" @click="neu = !neu"><ProjektIcon name="plus" :size="13" /> Termin</button>
    </template>
    <form v-if="neu" class="prj-zeile-form" @submit.prevent="anlegen">
      <select v-model="entwurf.art">
        <option v-for="a in MEILENSTEIN_ARTEN" :key="a.id" :value="a.id">{{ a.titel }}</option>
      </select>
      <input v-model.trim="entwurf.bezeichnung" type="text" placeholder="Bezeichnung" required />
      <input v-model="entwurf.faellig_am" type="date" required />
      <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!entwurf.bezeichnung || !entwurf.faellig_am">Anlegen</button>
    </form>
    <LeerHinweis v-if="!sichtbar.length" text="Keine offenen Termine." />
    <ul v-else class="prj-liste">
      <li v-for="m in sichtbar" :key="m.id" :class="{ 'prj-erledigt': m.erledigt_am }">
        <span class="prj-art">{{ artTitel(m.art) }}</span>
        <span class="prj-bezeichnung">{{ m.bezeichnung }}</span>
        <span class="prj-datum" :class="!m.erledigt_am && `prj-termin-${dringlichkeit(m.faellig_am)}`">{{ datum(m.faellig_am) }}</span>
        <button
          v-if="!m.erledigt_am"
          type="button"
          class="prj-knopf prj-knopf-klein"
          title="Als erledigt markieren"
          @click="$emit('erledigen', m.id)"
        ><ProjektIcon name="ok" :size="13" /></button>
        <span v-else class="prj-erledigt-am">erledigt {{ datum(m.erledigt_am) }}</span>
        <button type="button" class="prj-knopf prj-knopf-klein" title="Entfernen" @click="$emit('loeschen', m.id)">
          <ProjektIcon name="loeschen" :size="13" />
        </button>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// MeilensteinListe — Termine, Abgaben, Bindefristen; Dringlichkeit färbt das Datum.
import { computed, reactive, ref } from 'vue';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { MEILENSTEIN_ARTEN, artTitel, datum, dringlichkeit } from '../../services/Phasen';

const props = defineProps({ meilensteine: { type: Array, default: () => [] } });
const emit = defineEmits(['anlegen', 'erledigen', 'loeschen']);

const neu = ref(false);
const mitErledigten = ref(false);
const entwurf = reactive({ art: 'termin', bezeichnung: '', faellig_am: '' });

const sichtbar = computed(() => props.meilensteine.filter((m) => mitErledigten.value || !m.erledigt_am));

function anlegen() {
  if (!entwurf.bezeichnung || !entwurf.faellig_am) return;
  emit('anlegen', { ...entwurf });
  entwurf.bezeichnung = '';
  entwurf.faellig_am = '';
  neu.value = false;
}
</script>

<style scoped>
.prj-schalter { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-zeile-form {
  display: grid;
  grid-template-columns: 9rem 1fr 10rem auto;
  gap: 0.4rem;
  margin-bottom: 0.7rem;
}
.prj-zeile-form input, .prj-zeile-form select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--prj-rand-stark);
  border-radius: 6px;
  background: var(--prj-flaeche);
  color: var(--prj-text);
  font-size: 0.82rem;
}
.prj-liste { list-style: none; margin: 0; padding: 0; }
.prj-liste li {
  display: grid;
  grid-template-columns: 9rem 1fr auto auto auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px dashed var(--prj-rand);
  font-size: 0.85rem;
}
.prj-erledigt { opacity: 0.6; }
.prj-art { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-bezeichnung { font-weight: 600; }
.prj-datum { font-variant-numeric: tabular-nums; }
.prj-termin-ueberfaellig { color: var(--prj-fehler); font-weight: 600; }
.prj-termin-bald { color: var(--prj-warn); font-weight: 600; }
.prj-erledigt-am { font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-knopf-klein { padding: 0.25rem 0.4rem; }
</style>
