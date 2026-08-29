<template>
  <ProjektKarte titel="Rechnung aus Stunden" icon="stellen">
    <p v-if="!akte.stundensatz_cent" class="prj-hinweis">Dafür braucht das Projekt einen Stundensatz (Übersicht → Stammdaten, Honorarmodell Stunden).</p>
    <p v-else-if="!akte.auftraggeber_id" class="prj-hinweis">Dafür braucht das Projekt einen Pedant-Auftraggeber (Übersicht → Stammdaten).</p>
    <template v-else>
      <p v-if="vorschau && !vorschau.positionen.length" class="prj-hinweis">Keine unabgerechnete, abrechenbare Zeit.</p>
      <template v-else-if="vorschau">
        <ul class="prj-positionen">
          <li v-for="p in vorschau.positionen" :key="String(p.abschnitt_id)"><span>{{ p.bezeichnung }}</span><strong>{{ centAlsEuro(p.betrag_cent) }}</strong></li>
        </ul>
        <p class="prj-hinweis">Summe netto <strong>{{ centAlsEuro(vorschau.summe_netto_cent) }}</strong> zu {{ centAlsEuro(vorschau.stundensatz_cent) }}/h · {{ vorschau.buchungen.length }} Buchungen werden nach dem Anlegen eingefroren.</p>
        <form class="prj-zeile" @submit.prevent="anlegen">
          <label>Leistung von <input v-model="von" type="date" required /></label>
          <label>bis <input v-model="bis" type="date" /></label>
          <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!von || laeuft"><ProjektIcon :name="laeuft ? 'laden' : 'stellen'" :size="14" /> Entwurf im Pedanten anlegen</button>
        </form>
      </template>
      <p v-if="ergebnis" class="prj-erfolg">
        Entwurf angelegt ({{ ergebnis.positionen }} Positionen, {{ centAlsEuro(ergebnis.netto_cent) }} netto).
        <router-link :to="`/intern/pedant?tab=rechnungen&rechnung=${ergebnis.rechnung_id}`">Im Pedanten prüfen und stellen</router-link>
      </p>
    </template>
  </ProjektKarte>
</template>

<script setup>
// StundenRechnungKarte — unabgerechnete Zeit → Rechnungs-ENTWURF (HUR) im Pedanten.
import { onMounted, ref, watch } from 'vue';
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import ProjekteApi from '../../services/ProjekteApi';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();
const vorschau = ref(null);
const von = ref('');
const bis = ref('');
const laeuft = ref(false);
const ergebnis = ref(null);

async function laden() {
  if (!props.akte.stundensatz_cent || !props.akte.auftraggeber_id) return;
  try {
    vorschau.value = await ProjekteApi.stundenrechnungVorschau(props.akte.id);
  } catch (error) {
    console.warn('projekte stundenrechnung:', error);
    vorschau.value = null;
  }
}
async function anlegen() {
  laeuft.value = true;
  try {
    ergebnis.value = await store.stundenrechnungAnlegen(props.akte.id, { leistung_von: von.value, leistung_bis: bis.value || null });
    if (ergebnis.value) await laden();
  } finally {
    laeuft.value = false;
  }
}
onMounted(laden);
watch(() => [props.akte.id, store.zeiten?.summen?.minuten_unabgerechnet], laden);
</script>

<style scoped>
.prj-hinweis { margin: 0 0 0.6rem; font-size: 0.85rem; color: var(--prj-text-dim); }
.prj-positionen { list-style: none; margin: 0 0 0.6rem; padding: 0; }
.prj-positionen li { display: flex; justify-content: space-between; gap: 0.8rem; padding: 0.35rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.82rem; }
.prj-positionen strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.prj-zeile { display: flex; flex-wrap: wrap; align-items: end; gap: 0.6rem; }
.prj-zeile label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-zeile input { padding: 0.35rem 0.5rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); }
.prj-erfolg { margin: 0.8rem 0 0; padding: 0.55rem 0.8rem; border-radius: 6px; background: var(--prj-leistung-weich); color: var(--prj-leistung); font-size: 0.85rem; }
.prj-erfolg a { color: inherit; font-weight: 600; }
</style>
