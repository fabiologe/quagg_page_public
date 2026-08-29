<template>
  <ProjektKarte titel="Beteiligte" icon="beteiligte">
    <template #aktionen>
      <button type="button" class="prj-knopf" @click="neu = !neu"><ProjektIcon name="plus" :size="13" /> Hinzufügen</button>
    </template>
    <form v-if="neu" class="prj-zeile-form" @submit.prevent="anlegen">
      <select v-model="entwurf.rolle">
        <option v-for="r in ROLLEN" :key="r.id" :value="r.id">{{ r.titel }}</option>
      </select>
      <input v-model.trim="entwurf.name" type="text" placeholder="Name" required />
      <input v-model.trim="entwurf.kontakt" type="text" placeholder="Kontakt (E-Mail, Telefon)" />
      <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!entwurf.name">Anlegen</button>
    </form>
    <LeerHinweis v-if="!beteiligte.length" text="Noch keine Beteiligten — Bauherr, Auftraggeber, Behörden." />
    <ul v-else class="prj-liste">
      <li v-for="b in beteiligte" :key="b.id">
        <span class="prj-rolle">{{ rolleTitel(b.rolle) }}</span>
        <span class="prj-name">{{ b.name }}</span>
        <span class="prj-kontakt">{{ b.kontakt }}</span>
        <button type="button" class="prj-knopf prj-knopf-klein" title="Entfernen" @click="$emit('loeschen', b.id)">
          <ProjektIcon name="loeschen" :size="13" />
        </button>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// BeteiligteListe — Rollen am Projekt; Bauherr ≠ Auftraggeber ≠ Rechnungsempfänger.
import { reactive, ref } from 'vue';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { ROLLEN, rolleTitel } from '../../services/Phasen';

defineProps({ beteiligte: { type: Array, default: () => [] } });
const emit = defineEmits(['anlegen', 'loeschen']);

const neu = ref(false);
const entwurf = reactive({ rolle: 'auftraggeber', name: '', kontakt: '' });

function anlegen() {
  if (!entwurf.name) return;
  emit('anlegen', { ...entwurf });
  entwurf.name = '';
  entwurf.kontakt = '';
  neu.value = false;
}
</script>

<style scoped>
.prj-zeile-form {
  display: grid;
  grid-template-columns: 9rem 1fr 1fr auto;
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
  grid-template-columns: 9rem 1fr 1fr auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px dashed var(--prj-rand);
  font-size: 0.85rem;
}
.prj-rolle { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-name { font-weight: 600; }
.prj-kontakt { color: var(--prj-text-dim); overflow-wrap: anywhere; }
.prj-knopf-klein { padding: 0.25rem 0.4rem; }
</style>
