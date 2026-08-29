<template>
  <PedantKarte titel="Letzte Buchungen" icon="journal">
    <PedantTabelle
      :spalten="SPALTEN"
      :leer="zeilen.length === 0"
      leer-text="Noch keine Buchungen"
    >
      <BuchungsZeile
        v-for="buchung in zeilen"
        :key="buchung.lfd_nr"
        :buchung="buchung"
      />
    </PedantTabelle>
  </PedantKarte>
</template>

<script setup>
// LetzteBuchungen — die zehn juengsten Journalzeilen, ohne Aktionen.
import { computed } from 'vue';
import { useJournalStore } from '../../stores/useJournalStore';
import BuchungsZeile from '../journal/BuchungsZeile.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantTabelle from '../ui/PedantTabelle.vue';

const SPALTEN = [
  { key: 'lfd_nr', titel: 'Nr.', zahl: true },
  { key: 'buchungsdatum', titel: 'Datum' },
  { key: 'buchungstext', titel: 'Text' },
  { key: 'sollkonto', titel: 'Soll' },
  { key: 'habenkonto', titel: 'Haben' },
  { key: 'betrag_cent', titel: 'Betrag', zahl: true },
];

const store = useJournalStore();
const zeilen = computed(() => store.buchungen.slice(0, 10));
</script>
