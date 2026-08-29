<template>
  <tr class="prj-abschnitt" :class="{ 'prj-abschnitt-inaktiv': !abschnitt.beauftragt || abschnitt.status === 'entfallen' }">
    <td class="prj-nr">{{ abschnitt.nr }}</td>
    <td>
      <div class="prj-bezeichnung">{{ abschnitt.bezeichnung }}</div>
      <div class="prj-meta">{{ artTitel }}<template v-if="abschnitt.lph"> · LPH {{ abschnitt.lph }}</template></div>
    </td>
    <td class="prj-geld">
      <button type="button" class="prj-inline" title="Honorar ändern (mit Grund)" @click="honorarAendern">{{ centAlsEuro(abschnitt.honorar_cent) }}</button>
    </td>
    <td class="prj-mitte"><input type="checkbox" :checked="abschnitt.beauftragt" title="beauftragt" @change="$emit('aendern', { beauftragt: $event.target.checked })" /></td>
    <td class="prj-fortschritt">
      <input type="range" min="0" max="100" step="5" :value="abschnitt.fortschritt_prozent" :disabled="!abschnitt.beauftragt" @change="$emit('aendern', { fortschritt_prozent: Number($event.target.value) })" />
      <span class="prj-prozent">{{ abschnitt.fortschritt_prozent }} %</span>
    </td>
    <td>
      <select :value="abschnitt.status" @change="$emit('aendern', { status: $event.target.value })">
        <option v-for="s in STATUS" :key="s.id" :value="s.id">{{ s.titel }}</option>
      </select>
    </td>
    <td class="prj-mitte">
      <button type="button" class="prj-knopf prj-knopf-klein" title="Entfernen (nur ohne Honorarhistorie)" @click="$emit('loeschen')">
        <ProjektIcon name="loeschen" :size="13" />
      </button>
    </td>
  </tr>
</template>

<script setup>
// AbschnittZeile — eine Zeile der Leistungstabelle; jede Änderung geht sofort an den Server.
import { computed } from 'vue';
import { centAlsEuro, euroZuCent } from '@/features/kleiner-pedant/services/Geld';
import ProjektIcon from '../ui/ProjektIcon.vue';

const ARTEN = { grund: 'Grundleistung', besondere: 'Besondere Leistung', nachtrag: 'Nachtrag', nebenkosten: 'Nebenkosten' };
const STATUS = [
  { id: 'offen', titel: 'offen' }, { id: 'laufend', titel: 'laufend' }, { id: 'fertig', titel: 'fertig' },
  { id: 'abgenommen', titel: 'abgenommen' }, { id: 'entfallen', titel: 'entfallen' },
];

const props = defineProps({ abschnitt: { type: Object, required: true } });
const emit = defineEmits(['aendern', 'loeschen']);

const artTitel = computed(() => ARTEN[props.abschnitt.art] || props.abschnitt.art);

function honorarAendern() {
  const eingabe = window.prompt('Neues Honorar (€ netto):', centAlsEuro(props.abschnitt.honorar_cent).replace(/\s?€/, ''));
  if (eingabe === null) return;
  const cent = euroZuCent(eingabe);
  if (cent === null || cent < 0) return;
  const grund = window.prompt('Grund der Änderung (Angebot, Auftrag, Nachtrag …):', '') ?? '';
  emit('aendern', { honorar_cent: cent, grund });
}
</script>

<style scoped>
.prj-abschnitt td { padding: 0.45rem 0.5rem; border-bottom: 1px solid var(--prj-rand); font-size: 0.85rem; vertical-align: middle; }
.prj-abschnitt-inaktiv { opacity: 0.6; }
.prj-nr { font-family: var(--prj-mono); color: var(--prj-text-dim); width: 2rem; }
.prj-bezeichnung { font-weight: 600; }
.prj-meta { font-size: 0.72rem; color: var(--prj-text-dim); }
.prj-geld { text-align: right; white-space: nowrap; }
.prj-inline { border: none; background: transparent; color: var(--prj-akzent); font: inherit; font-variant-numeric: tabular-nums; cursor: pointer; text-decoration: underline dotted; }
.prj-mitte { text-align: center; }
.prj-fortschritt { display: flex; align-items: center; gap: 0.4rem; min-width: 9rem; }
.prj-fortschritt input[type='range'] { flex: 1; accent-color: var(--prj-leistung); }
.prj-prozent { width: 3rem; text-align: right; font-variant-numeric: tabular-nums; }
select { padding: 0.25rem 0.4rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.8rem; }
.prj-knopf-klein { padding: 0.25rem 0.4rem; }
</style>
