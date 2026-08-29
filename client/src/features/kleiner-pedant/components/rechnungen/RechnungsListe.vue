<template>
  <PedantKarte titel="Rechnungen" icon="rechnung">
    <template #aktionen>
      <button class="ped-neu" type="button" @click="$emit('neu')">
        <PedantIcon name="plus" :size="14" /> Neue Rechnung
      </button>
    </template>

    <div class="ped-filter">
      <button
        v-for="chip in FILTER"
        :key="chip.wert ?? 'alle'"
        type="button"
        class="ped-chip"
        :class="{ 'ped-chip-aktiv': store.filter === chip.wert }"
        @click="store.filter = chip.wert"
      >
        {{ chip.titel }}
      </button>
    </div>

    <PedantTabelle
      :spalten="SPALTEN"
      :leer="store.gefiltert.length === 0"
      leer-text="Noch keine Rechnungen"
    >
      <tr
        v-for="rechnung in store.gefiltert"
        :key="rechnung.id"
        class="ped-zeile"
        @click="store.oeffne(rechnung.id)"
      >
        <td class="ped-mono">{{ rechnung.rechnungsnummer || 'Entwurf' }}<small v-if="rechnung.rechnungstyp === '326'" class="ped-typ"> Abschlag</small><small v-else-if="rechnung.vorab_cent" class="ped-typ"> Schluss</small></td>
        <td>{{ datumText(rechnung.rechnungsdatum) }}</td>
        <td>{{ stammdaten.auftraggeberName(rechnung.auftraggeber_id) }}</td>
        <td class="ped-zahl"><GeldBetrag :cent="rechnung.brutto_cent" /></td>
        <td>
          <StatusPille :zustand="pillen(rechnung).zustand" :text="pillen(rechnung).text" />
        </td>
      </tr>
    </PedantTabelle>
  </PedantKarte>
</template>

<script setup>
// RechnungsListe — Filter-Chips (ueberfaellig ist ABGELEITET, kein DB-Status).
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantTabelle from '../ui/PedantTabelle.vue';
import StatusPille from '../ui/StatusPille.vue';
import { useRechnungStore } from '../../stores/useRechnungStore';
import { useStammdatenStore } from '../../stores/useStammdatenStore';

const FILTER = [
  { wert: null, titel: 'Alle' },
  { wert: 'entwurf', titel: 'Entwürfe' },
  { wert: 'gestellt', titel: 'Gestellt' },
  { wert: 'ueberfaellig', titel: 'Überfällig' },
  { wert: 'bezahlt', titel: 'Bezahlt' },
];

const SPALTEN = [
  { key: 'nummer', titel: 'Nummer' },
  { key: 'datum', titel: 'Datum' },
  { key: 'auftraggeber', titel: 'Auftraggeber' },
  { key: 'brutto', titel: 'Brutto', zahl: true },
  { key: 'status', titel: 'Status' },
];

const store = useRechnungStore();
const stammdaten = useStammdatenStore();
defineEmits(['neu']);

function datumText(wert) {
  return wert ? new Date(wert).toLocaleDateString('de-DE') : '—';
}

function pillen(rechnung) {
  const heute = new Date().toISOString().slice(0, 10);
  if (rechnung.status === 'gestellt' && rechnung.faellig_am < heute) {
    return { zustand: 'fehler', text: 'überfällig' };
  }
  return {
    zustand: { entwurf: 'warnung', gestellt: 'ok', bezahlt: 'ok', verworfen: 'fehler' }[rechnung.status] || 'warnung',
    text: rechnung.status,
  };
}
</script>

<style scoped>
.ped-typ { font-family: inherit; color: var(--ped-text-dim); }
.ped-neu {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.65rem;
  border: none;
  border-radius: 6px;
  background: var(--ped-akzent);
  color: var(--ped-akzent-kontrast);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.ped-neu:hover { background: var(--ped-akzent-hover); }
.ped-filter { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.7rem; }
.ped-chip {
  padding: 0.25rem 0.7rem;
  border: 1px solid var(--ped-rand);
  border-radius: 999px;
  background: var(--ped-flaeche);
  color: var(--ped-text-dim);
  font-size: 0.76rem;
  cursor: pointer;
}
.ped-chip-aktiv {
  border-color: var(--ped-akzent);
  background: var(--ped-akzent-weich);
  color: var(--ped-akzent);
  font-weight: 600;
}
.ped-zeile { cursor: pointer; }
.ped-mono { font-family: var(--ped-mono); white-space: nowrap; }
.ped-zahl { text-align: right; }
</style>
