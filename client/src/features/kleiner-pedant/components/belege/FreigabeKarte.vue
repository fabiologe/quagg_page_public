<template>
  <div class="ped-freigabe">
    <h4><PedantIcon name="freigeben" :size="14" /> Freigeben und buchen</h4>
    <p class="ped-freigabe-satz">
      Bucht <GeldBetrag :cent="beleg.brutto_cent" /> brutto
      (Steuerschlüssel {{ schluesselText }}) — danach unveränderlich.
    </p>
    <div class="ped-freigabe-reihe">
      <FormFeld name="Sollkonto (Aufwand/Anlage)">
        <KontoAuswahl v-model="sollkonto" :konten="journal.konten" />
      </FormFeld>
      <FormFeld name="Geldkonto (Haben)">
        <select v-model="geldkonto">
          <option value="1800">1800 Bank</option>
          <option value="1600">1600 Kasse</option>
          <option value="3300">3300 Verbindlichkeiten L+L</option>
          <option value="1550">1550 Forderungen Gesellschafter</option>
        </select>
      </FormFeld>
    </div>
    <p v-if="fehler" class="ped-freigabe-fehler">{{ fehler }}</p>
    <button
      class="ped-freigabe-knopf" type="button"
      :disabled="!sollkonto || arbeitet" @click="freigeben"
    >
      <PedantIcon :name="arbeitet ? 'laden' : 'freigeben'" :size="15" />
      {{ arbeitet ? 'Bucht…' : 'Freigeben' }}
    </button>
  </div>
</template>

<script setup>
// FreigabeKarte — der letzte Schritt: Kontenwahl + Freigabe. Der GWG-Vorschlag
// (6260) wird vorbelegt, entschieden wird hier — Vorschlag, kein Automatismus.
import { computed, ref, watch } from 'vue';
import { belegVorschlag } from '../../composables/useBelegPlausibilitaet';
import { useBelegStore } from '../../stores/useBelegStore';
import { useJournalStore } from '../../stores/useJournalStore';
import KontoAuswahl from '../journal/KontoAuswahl.vue';
import FormFeld from '../ui/FormFeld.vue';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';

const props = defineProps({
  beleg: { type: Object, required: true },
});

const store = useBelegStore();
const journal = useJournalStore();
const sollkonto = ref('');
const geldkonto = ref('1800');
const arbeitet = ref(false);
const fehler = ref('');

watch(() => props.beleg.id, () => {
  sollkonto.value = belegVorschlag(props.beleg.netto_cent).kontoVorschlag || '';
  geldkonto.value = '1800';
  fehler.value = '';
}, { immediate: true });

const schluesselText = computed(() => (
  { 19: '9 (19 % VSt)', 7: '8 (7 % VSt)', 0: 'ohne' }[props.beleg.steuersatz] || '—'
));

async function freigeben() {
  arbeitet.value = true;
  fehler.value = '';
  try {
    await store.freigeben(props.beleg.id, {
      sollkonto: sollkonto.value,
      geldkonto: geldkonto.value,
    });
  } catch (grund) {
    fehler.value = grund.message;
  } finally {
    arbeitet.value = false;
  }
}
</script>

<style scoped>
.ped-freigabe {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem;
  border: 1px solid var(--ped-akzent);
  border-radius: 8px;
  background: var(--ped-akzent-weich);
}
.ped-freigabe h4 {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.85rem;
  color: var(--ped-akzent);
}
.ped-freigabe-satz {
  margin: 0;
  font-size: 0.8rem;
  color: var(--ped-text);
}
.ped-freigabe-reihe {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
}
.ped-freigabe-fehler {
  margin: 0;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
  background: var(--ped-fehler-weich);
  color: var(--ped-fehler);
  font-size: 0.8rem;
}
.ped-freigabe-knopf {
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
.ped-freigabe-knopf:hover { background: var(--ped-akzent-hover); }
.ped-freigabe-knopf:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
