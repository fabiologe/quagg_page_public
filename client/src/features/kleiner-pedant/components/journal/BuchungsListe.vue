<template>
  <PedantKarte titel="Journal" icon="journal">
    <template #aktionen>
      <button class="ped-neu-laden" type="button" @click="store.ladeBuchungen()">
        <PedantIcon name="aktualisieren" :size="14" />
      </button>
    </template>

    <PedantTabelle
      :spalten="SPALTEN"
      :leer="store.buchungen.length === 0"
      leer-text="Noch keine Buchungen — die erste entsteht rechts im Formular"
    >
      <BuchungsZeile
        v-for="buchung in store.buchungen"
        :key="buchung.lfd_nr"
        :buchung="buchung"
        mit-aktionen
        @storno="stornoKandidat = $event"
      />
    </PedantTabelle>

    <StornoDialog
      v-if="stornoKandidat"
      :buchung="stornoKandidat"
      @schliessen="stornoKandidat = null"
    />
  </PedantKarte>
</template>

<script setup>
// BuchungsListe — Container des Journals: holt Daten aus dem Store,
// reicht Zeilen an BuchungsZeile durch, oeffnet den StornoDialog.
import { ref } from 'vue';
import { useJournalStore } from '../../stores/useJournalStore';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantTabelle from '../ui/PedantTabelle.vue';
import BuchungsZeile from './BuchungsZeile.vue';
import StornoDialog from './StornoDialog.vue';

const SPALTEN = [
  { key: 'lfd_nr', titel: 'Nr.', zahl: true },
  { key: 'buchungsdatum', titel: 'Datum' },
  { key: 'buchungstext', titel: 'Text' },
  { key: 'sollkonto', titel: 'Soll' },
  { key: 'habenkonto', titel: 'Haben' },
  { key: 'betrag_cent', titel: 'Betrag', zahl: true },
  { key: 'aktionen', titel: '' },
];

const store = useJournalStore();
const stornoKandidat = ref(null);
</script>

<style scoped>
.ped-neu-laden {
  display: inline-flex;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--ped-rand);
  border-radius: 5px;
  background: var(--ped-flaeche);
  color: var(--ped-text-dim);
  cursor: pointer;
}
.ped-neu-laden:hover {
  color: var(--ped-text);
  border-color: var(--ped-rand-stark);
}
</style>
