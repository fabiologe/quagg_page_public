<template>
  <PedantKarte titel="Neue Buchung" icon="plus">
    <form class="ped-form" @submit.prevent="absenden">
      <div class="ped-form-reihe">
        <label class="ped-feld">
          <span>Buchungsdatum</span>
          <input v-model="form.buchungsdatum" type="date" required />
          <em v-if="zeigeFehler('buchungsdatum')">{{ fehler.buchungsdatum }}</em>
        </label>
        <label class="ped-feld">
          <span>Belegdatum</span>
          <input v-model="form.belegdatum" type="date" required />
          <em v-if="zeigeFehler('belegdatum')">{{ fehler.belegdatum }}</em>
        </label>
      </div>

      <div class="ped-form-reihe">
        <label class="ped-feld">
          <span>Sollkonto</span>
          <KontoAuswahl v-model="form.sollkonto" :konten="store.konten" />
          <em v-if="zeigeFehler('sollkonto')">{{ fehler.sollkonto }}</em>
        </label>
        <label class="ped-feld">
          <span>Habenkonto</span>
          <KontoAuswahl v-model="form.habenkonto" :konten="store.konten" />
          <em v-if="zeigeFehler('habenkonto')">{{ fehler.habenkonto }}</em>
        </label>
      </div>

      <div class="ped-form-reihe">
        <label class="ped-feld">
          <span>Betrag</span>
          <input
            v-model="betrag.text.value"
            type="text"
            inputmode="decimal"
            placeholder="z. B. 1.234,56"
            @blur="betrag.huebschMachen"
          />
          <em v-if="zeigeFehler('betrag')">{{ fehler.betrag }}</em>
        </label>
        <label class="ped-feld">
          <span>Belegreferenz <small>(optional)</small></span>
          <input v-model="form.belegreferenz" type="text" placeholder="RE-2027-001" />
        </label>
      </div>

      <label class="ped-feld">
        <span>Buchungstext</span>
        <input v-model="form.buchungstext" type="text" placeholder="Wofür?" />
        <em v-if="zeigeFehler('buchungstext')">{{ fehler.buchungstext }}</em>
      </label>

      <p v-if="serverFehler" class="ped-server-fehler">{{ serverFehler }}</p>

      <button class="ped-buchen" type="submit" :disabled="sendet">
        <PedantIcon :name="sendet ? 'laden' : 'ok'" :size="15" />
        {{ sendet ? 'Bucht…' : 'Buchen' }}
      </button>
    </form>
  </PedantKarte>
</template>

<script setup>
// BuchungsFormular — manuelle Buchung. Validiert lokal fuers schnelle
// Feedback; die Wahrheit spricht der Server (422 → serverFehler).
import { computed, reactive, ref } from 'vue';
import { useBuchungValidierung } from '../../composables/useBuchungValidierung';
import { useGeldFormat } from '../../composables/useGeldFormat';
import { useJournalStore } from '../../stores/useJournalStore';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import KontoAuswahl from './KontoAuswahl.vue';

const store = useJournalStore();
const betrag = useGeldFormat();

const heute = new Date().toISOString().slice(0, 10);
const form = reactive({
  buchungsdatum: heute,
  belegdatum: heute,
  sollkonto: '',
  habenkonto: '',
  betrag_cent: null,
  buchungstext: '',
  belegreferenz: '',
});
// Das Formular haelt Text, das Modell Cent — hier laufen beide zusammen.
const spiegel = computed(() => ({ ...form, betrag_cent: betrag.cent.value }));
const { fehler, gueltig } = useBuchungValidierung(spiegel);

const beruehrt = ref(false);
const sendet = ref(false);
const serverFehler = ref('');

function zeigeFehler(feld) {
  return beruehrt.value && fehler.value[feld];
}

async function absenden() {
  beruehrt.value = true;
  serverFehler.value = '';
  if (!gueltig.value) return;
  sendet.value = true;
  try {
    await store.bucheNeu({
      buchungsdatum: form.buchungsdatum,
      belegdatum: form.belegdatum,
      sollkonto: form.sollkonto,
      habenkonto: form.habenkonto,
      betrag_cent: betrag.cent.value,
      buchungstext: form.buchungstext.trim(),
      belegreferenz: form.belegreferenz.trim(),
    });
    form.buchungstext = '';
    form.belegreferenz = '';
    betrag.zuruecksetzen();
    beruehrt.value = false;
  } catch (error) {
    serverFehler.value = error.message;
  } finally {
    sendet.value = false;
  }
}
</script>

<style scoped>
.ped-form {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.ped-form-reihe {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
}
.ped-feld {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--ped-text-dim);
}
.ped-feld input {
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.82rem;
}
.ped-feld input:focus {
  outline: 2px solid var(--ped-akzent-weich);
  border-color: var(--ped-akzent);
}
.ped-feld em {
  font-style: normal;
  font-size: 0.72rem;
  color: var(--ped-fehler);
}
.ped-server-fehler {
  margin: 0;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  background: var(--ped-fehler-weich);
  color: var(--ped-fehler);
  font-size: 0.8rem;
}
.ped-buchen {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  background: var(--ped-akzent);
  color: var(--ped-akzent-kontrast);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.ped-buchen:hover { background: var(--ped-akzent-hover); }
.ped-buchen:disabled { opacity: 0.6; cursor: wait; }
</style>
