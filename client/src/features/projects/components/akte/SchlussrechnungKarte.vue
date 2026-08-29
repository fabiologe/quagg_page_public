<template>
  <ProjektKarte titel="Schlussrechnung" icon="rechnung">
    <p v-if="!akte.auftraggeber_id" class="prj-hinweis">Für eine Rechnung braucht das Projekt einen Pedant-Auftraggeber (Übersicht → Stammdaten).</p>
    <template v-else-if="vorschau">
      <p v-if="!vorschau.positionen.length" class="prj-hinweis">Noch keine erbrachte Leistung — nichts abzurechnen.</p>
      <template v-else>
        <p class="prj-hinweis">Gesamtleistung <strong>{{ centAlsEuro(vorschau.summe_netto_cent) }}</strong> netto ({{ centAlsEuro(vorschau.summe_brutto_cent) }} brutto), abzüglich {{ vorschau.vorrechnungen.length }} gestellter Abschläge <strong>{{ centAlsEuro(vorschau.vorab_cent) }}</strong> → zahlbar <strong :class="{ 'prj-warn': vorschau.zahlbar_cent <= 0 }">{{ centAlsEuro(vorschau.zahlbar_cent) }}</strong>.</p>
        <ul class="prj-positionen">
          <li v-for="v in vorschau.vorrechnungen" :key="v.id"><span>Abschlag {{ v.rechnungsnummer }} · {{ datum(v.rechnungsdatum) }}</span><strong>− {{ centAlsEuro(v.brutto_cent) }}</strong></li>
        </ul>
        <form class="prj-zeile" @submit.prevent="anlegen">
          <label>Leistung von <input v-model="von" type="date" required /></label>
          <label>bis <input v-model="bis" type="date" /></label>
          <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!von || laeuft || vorschau.zahlbar_cent <= 0"><ProjektIcon :name="laeuft ? 'laden' : 'stellen'" :size="14" /> Schlussrechnung als Entwurf</button>
        </form>
        <p class="prj-dim">Die XRechnung trägt die Abschläge als Vorrechnungen (BG-3) und den Vorab-Betrag (BT-113); gebucht wird nur der zahlbare Rest.</p>
      </template>
      <p v-if="ergebnis" class="prj-erfolg">
        Entwurf angelegt: {{ ergebnis.positionen }} Positionen, {{ ergebnis.vorrechnungen }} Vorrechnungen, zahlbar {{ centAlsEuro(ergebnis.zahlbar_cent) }}.
        <router-link :to="`/intern/pedant?tab=rechnungen&rechnung=${ergebnis.rechnung_id}`">Im Pedanten prüfen und stellen</router-link>
      </p>
    </template>
  </ProjektKarte>
</template>

<script setup>
// SchlussrechnungKarte — Gesamtleistung minus gestellte Abschläge (Typ 380 + BG-3 + BT-113).
import { onMounted, ref, watch } from 'vue';
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import ProjekteApi from '../../services/ProjekteApi';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();
const vorschau = ref(null);
const von = ref('');
const bis = ref('');
const laeuft = ref(false);
const ergebnis = ref(null);

async function laden() {
  if (!props.akte.auftraggeber_id) return;
  try { vorschau.value = await ProjekteApi.schlussrechnungVorschau(props.akte.id); } catch (error) { vorschau.value = null; }
}
async function anlegen() {
  laeuft.value = true;
  try {
    ergebnis.value = await store.schlussrechnungAnlegen(props.akte.id, { leistung_von: von.value, leistung_bis: bis.value || null });
    if (ergebnis.value) await laden();
  } finally {
    laeuft.value = false;
  }
}
onMounted(laden);
watch(() => [props.akte.id, props.akte.fortschritt?.leistung_cent, props.akte.geld?.gestellt_netto_cent], laden);
</script>

<style scoped>
.prj-hinweis { margin: 0 0 0.6rem; font-size: 0.85rem; color: var(--prj-text-dim); }
.prj-warn { color: var(--prj-warn); }
.prj-positionen { list-style: none; margin: 0 0 0.6rem; padding: 0; }
.prj-positionen li { display: flex; justify-content: space-between; gap: 0.8rem; padding: 0.3rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.82rem; }
.prj-positionen strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.prj-zeile { display: flex; flex-wrap: wrap; align-items: end; gap: 0.6rem; }
.prj-zeile label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-zeile input { padding: 0.35rem 0.5rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); }
.prj-dim { margin: 0.5rem 0 0; font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-erfolg { margin: 0.8rem 0 0; padding: 0.55rem 0.8rem; border-radius: 6px; background: var(--prj-leistung-weich); color: var(--prj-leistung); font-size: 0.85rem; }
.prj-erfolg a { color: inherit; font-weight: 600; }
</style>
