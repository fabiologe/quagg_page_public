<template>
  <div class="ped-tabelle-rahmen">
    <table class="ped-tabelle">
      <thead>
        <tr>
          <th
            v-for="spalte in spalten"
            :key="spalte.key"
            :class="{ 'ped-th-zahl': spalte.zahl }"
          >
            {{ spalte.titel }}
          </th>
        </tr>
      </thead>
      <tbody>
        <slot />
      </tbody>
    </table>
    <LeerHinweis v-if="leer" :text="leerText" />
  </div>
</template>

<script setup>
// PedantTabelle — Tabellen-Rahmen: Kopf aus der Spaltenliste, Zeilen per Slot
// (BuchungsZeile & Co.). Wer sie nutzt, erfindet keine eigene Tabelle mehr.
import LeerHinweis from './LeerHinweis.vue';

defineProps({
  // [{ key, titel, zahl?: true }] — zahl = rechtsbündig (Beträge, Nummern)
  spalten: { type: Array, required: true },
  leer: { type: Boolean, default: false },
  leerText: { type: String, default: 'Noch keine Einträge' },
});
</script>

<style scoped>
.ped-tabelle-rahmen {
  overflow-x: auto;
}
.ped-tabelle {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  color: var(--ped-text);
}
.ped-tabelle th {
  text-align: left;
  padding: 0.45rem 0.6rem;
  background: var(--ped-flaeche-2);
  border-bottom: 1px solid var(--ped-rand-stark);
  font-weight: 600;
  white-space: nowrap;
  color: var(--ped-text-dim);
}
.ped-th-zahl {
  text-align: right;
}
.ped-tabelle :deep(td) {
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--ped-rand);
  vertical-align: top;
}
.ped-tabelle :deep(tr:hover td) {
  background: var(--ped-flaeche-2);
}
</style>
