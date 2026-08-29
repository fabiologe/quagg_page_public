<template>
  <div class="ped-bank">
    <p v-if="store.fehler && !store.aktiveBewegung" class="ped-bank-fehler">{{ store.fehler }}</p>

    <PedantKarte titel="Kontoabgleich" icon="bank">
      <template #aktionen>
        <button class="ped-bank-knopf" type="button" :disabled="arbeitet" @click="dateiwahl.click()">
          <PedantIcon name="hochladen" :size="14" /> CSV/CAMT importieren
        </button>
        <button class="ped-bank-knopf" type="button" :disabled="arbeitet" @click="auto">
          <PedantIcon name="zuordnen" :size="14" /> Auto-Abgleich
        </button>
      </template>
      <input
        ref="dateiwahl" type="file" class="ped-versteckt"
        accept=".csv,.xml,.camt,text/csv,application/xml" @change="importiere"
      />

      <p v-if="store.letzterImport" class="ped-bank-info">
        Import: {{ store.letzterImport.neu }} neu,
        {{ store.letzterImport.uebersprungen }} bereits bekannt.
      </p>
      <p v-if="autoErgebnis" class="ped-bank-info">
        Auto-Abgleich: {{ autoErgebnis.zugeordnet }} von {{ autoErgebnis.geprueft }} sicher zugeordnet.
      </p>

      <div class="ped-filter">
        <button
          v-for="chip in FILTER" :key="chip.wert ?? 'alle'" type="button"
          class="ped-chip" :class="{ 'ped-chip-aktiv': store.filter === chip.wert }"
          @click="store.filter = chip.wert"
        >
          {{ chip.titel }}
        </button>
      </div>

      <PedantTabelle
        :spalten="SPALTEN"
        :leer="store.gefiltert.length === 0"
        leer-text="Nichts da — Kontoauszug (CSV oder CAMT) importieren"
      >
        <tr
          v-for="zeile in store.gefiltert" :key="zeile.id"
          class="ped-bank-zeile" @click="store.oeffne(zeile.id)"
        >
          <td class="ped-mono">{{ datumText(zeile.buchungsdatum) }}</td>
          <td class="ped-bank-zweck">
            <strong v-if="zeile.gegen_name">{{ zeile.gegen_name }} · </strong>{{ zeile.verwendungszweck || '—' }}
          </td>
          <td class="ped-zahl">
            <GeldBetrag :cent="zeile.betrag_cent" :richtung="zeile.betrag_cent > 0 ? 'plus' : 'minus'" />
          </td>
          <td><StatusPille :zustand="PILLE[zeile.status]" :text="zeile.status" /></td>
        </tr>
      </PedantTabelle>
    </PedantKarte>

    <BankZuordnen v-if="store.aktiveBewegung" :bewegung="store.aktiveBewegung" />
  </div>
</template>

<script setup>
// BankBereich — Tab-Wurzel Phase 5: Import, Filter, Liste, Klaerdialog.
import { onMounted, ref } from 'vue';
import { useBankStore } from '../../stores/useBankStore';
import { useBelegStore } from '../../stores/useBelegStore';
import { useRechnungStore } from '../../stores/useRechnungStore';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantTabelle from '../ui/PedantTabelle.vue';
import StatusPille from '../ui/StatusPille.vue';
import BankZuordnen from './BankZuordnen.vue';

const FILTER = [
  { wert: 'unabgeglichen', titel: 'Offen' },
  { wert: 'zugeordnet', titel: 'Zugeordnet' },
  { wert: 'ignoriert', titel: 'Ignoriert' },
  { wert: null, titel: 'Alle' },
];
const SPALTEN = [
  { key: 'datum', titel: 'Datum' },
  { key: 'zweck', titel: 'Gegenseite / Verwendungszweck' },
  { key: 'betrag', titel: 'Betrag', zahl: true },
  { key: 'status', titel: 'Status' },
];
const PILLE = { unabgeglichen: 'warnung', zugeordnet: 'ok', ignoriert: 'fehler' };

const store = useBankStore();
const rechnungen = useRechnungStore();
const belege = useBelegStore();
const dateiwahl = ref(null);
const arbeitet = ref(false);
const autoErgebnis = ref(null);

function datumText(wert) {
  return new Date(wert).toLocaleDateString('de-DE');
}

onMounted(() => {
  store.lade();
  // fuer die manuelle Zuordnung im Dialog
  if (!rechnungen.rechnungen.length) rechnungen.ladeRechnungen();
  if (!belege.belege.length) belege.ladeBelege();
});

async function importiere(ereignis) {
  const datei = ereignis.target.files?.[0];
  ereignis.target.value = '';
  if (!datei) return;
  arbeitet.value = true;
  try {
    await store.importiere(datei);
  } catch { /* store.fehler wird gezeigt */ } finally {
    arbeitet.value = false;
  }
}

async function auto() {
  arbeitet.value = true;
  try {
    autoErgebnis.value = await store.autoAbgleich();
  } catch { /* store.fehler wird gezeigt */ } finally {
    arbeitet.value = false;
  }
}
</script>

<style scoped>
.ped-bank { display: flex; flex-direction: column; gap: 1rem; }
.ped-bank-fehler {
  margin: 0; padding: 0.5rem 0.7rem; border-radius: 6px;
  background: var(--ped-fehler-weich); color: var(--ped-fehler); font-size: 0.82rem;
}
.ped-bank-knopf {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.3rem 0.65rem; border: 1px solid var(--ped-rand-stark);
  border-radius: 6px; background: var(--ped-flaeche);
  color: var(--ped-text); font-size: 0.78rem; cursor: pointer;
}
.ped-bank-knopf:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-bank-knopf:disabled { opacity: 0.6; }
.ped-versteckt { display: none; }
.ped-bank-info { margin: 0 0 0.5rem; font-size: 0.78rem; color: var(--ped-text-dim); }
.ped-filter { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.7rem; }
.ped-chip {
  padding: 0.25rem 0.7rem; border: 1px solid var(--ped-rand);
  border-radius: 999px; background: var(--ped-flaeche);
  color: var(--ped-text-dim); font-size: 0.76rem; cursor: pointer;
}
.ped-chip-aktiv {
  border-color: var(--ped-akzent); background: var(--ped-akzent-weich);
  color: var(--ped-akzent); font-weight: 600;
}
.ped-bank-zeile { cursor: pointer; }
.ped-bank-zweck { max-width: 28rem; }
.ped-mono { font-family: var(--ped-mono); white-space: nowrap; }
.ped-zahl { text-align: right; }
</style>
