<template>
  <PedantKarte titel="Belegeingang" icon="beleg">
    <template #aktionen>
      <button class="ped-neu-laden" type="button" @click="store.ladeBelege()">
        <PedantIcon name="aktualisieren" :size="14" />
      </button>
    </template>

    <div class="ped-filter">
      <button
        v-for="chip in FILTER"
        :key="chip.wert ?? 'alle'"
        type="button"
        class="ped-chip"
        :class="{ 'ped-chip-aktiv': store.filter === chip.wert }"
        @click="store.setzeFilter(chip.wert)"
      >
        {{ chip.titel }}
      </button>
    </div>

    <PedantTabelle
      :spalten="SPALTEN"
      :leer="store.belege.length === 0"
      leer-text="Noch keine Belege — rechts hochladen oder fotografieren"
    >
      <BelegZeile
        v-for="beleg in store.belege"
        :key="beleg.id"
        :beleg="beleg"
        @oeffnen="store.oeffne(beleg.id)"
      />
    </PedantTabelle>
  </PedantKarte>
</template>

<script setup>
// BelegListe — Container: Filter-Chips + Tabelle, Daten aus dem Store.
import { useBelegStore } from '../../stores/useBelegStore';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantTabelle from '../ui/PedantTabelle.vue';
import BelegZeile from './BelegZeile.vue';

const FILTER = [
  { wert: null, titel: 'Alle' },
  { wert: 'erfasst', titel: 'Offen' },
  { wert: 'geprueft', titel: 'Geprüft' },
  { wert: 'gebucht', titel: 'Gebucht' },
  { wert: 'verworfen', titel: 'Verworfen' },
];

const SPALTEN = [
  { key: 'belegnummer', titel: 'Nummer' },
  { key: 'datum', titel: 'Datum' },
  { key: 'lieferant', titel: 'Lieferant' },
  { key: 'brutto', titel: 'Brutto', zahl: true },
  { key: 'status', titel: 'Status' },
];

const store = useBelegStore();
</script>

<style scoped>
.ped-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.7rem;
}
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
