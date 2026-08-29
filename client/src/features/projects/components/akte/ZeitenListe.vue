<template>
  <ProjektKarte titel="Zeitbuchungen" icon="zeit">
    <template #aktionen>
      <button type="button" class="prj-knopf" :disabled="!buchungen.length" @click="$emit('export', 'xlsx')"><ProjektIcon name="tabelle" :size="13" /> Stundennachweis xlsx</button>
      <button type="button" class="prj-knopf" :disabled="!buchungen.length" @click="$emit('export', 'csv')">CSV</button>
    </template>
    <LeerHinweis v-if="!buchungen.length" text="Noch keine Zeit gebucht." />
    <div v-else class="prj-tabelle-huelle">
      <table class="prj-tabelle">
        <thead><tr><th>Datum</th><th>Tätigkeit</th><th>Abschnitt</th><th class="prj-rechts">Dauer</th><th>abr.</th><th></th></tr></thead>
        <tbody>
          <tr v-for="z in buchungen" :key="z.id" :class="{ 'prj-abgerechnet': z.rechnung_id }">
            <td class="prj-datum">{{ datum(z.datum) }}</td>
            <td>{{ z.taetigkeit }}</td>
            <td class="prj-dim">{{ abschnittNamen[z.abschnitt_id] || '' }}</td>
            <td class="prj-rechts prj-datum">{{ minutenAlsText(z.dauer_min) }}</td>
            <td><input type="checkbox" :checked="z.abrechenbar" :disabled="Boolean(z.rechnung_id)" @change="$emit('aendern', z.id, { abrechenbar: $event.target.checked })" /></td>
            <td>
              <span v-if="z.rechnung_id" class="prj-dim" :title="`abgerechnet in Rechnung #${z.rechnung_id}`"><ProjektIcon name="rechnung" :size="13" /></span>
              <button v-else type="button" class="prj-knopf prj-knopf-klein" title="Entfernen" @click="$emit('loeschen', z.id)"><ProjektIcon name="loeschen" :size="13" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </ProjektKarte>
</template>

<script setup>
// ZeitenListe — Buchungen der Akte; abgerechnete Zeilen sind eingefroren.
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';
import { minutenAlsText } from '../../services/Zeit';

defineProps({ buchungen: { type: Array, default: () => [] }, abschnittNamen: { type: Object, default: () => ({}) } });
defineEmits(['aendern', 'loeschen', 'export']);
</script>

<style scoped>
.prj-tabelle-huelle { overflow-x: auto; }
.prj-tabelle { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.prj-tabelle th { text-align: left; padding: 0.4rem 0.5rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); border-bottom: 1px solid var(--prj-rand-stark); }
.prj-tabelle td { padding: 0.4rem 0.5rem; border-bottom: 1px dashed var(--prj-rand); vertical-align: middle; }
.prj-abgerechnet td { opacity: 0.7; }
.prj-rechts { text-align: right; }
.prj-datum { font-variant-numeric: tabular-nums; white-space: nowrap; }
.prj-dim { color: var(--prj-text-dim); font-size: 0.78rem; }
.prj-knopf-klein { padding: 0.25rem 0.4rem; }
</style>
