<template>
  <tr :class="{ 'ped-zeile-storno': istStorno }">
    <td class="ped-zelle-zahl">{{ buchung.lfd_nr }}</td>
    <td>{{ datumText }}</td>
    <td>
      {{ buchung.buchungstext }}
      <span v-if="istStorno" class="ped-storno-marke">
        <PedantIcon name="storno" :size="12" />
        Storno zu {{ buchung.stornoreferenz }}
      </span>
    </td>
    <td class="ped-zelle-konto">{{ buchung.sollkonto }}</td>
    <td class="ped-zelle-konto">{{ buchung.habenkonto }}</td>
    <td class="ped-zelle-zahl">
      <GeldBetrag :cent="buchung.betrag_cent" :richtung="istStorno ? 'minus' : 'neutral'" />
    </td>
    <td v-if="mitAktionen" class="ped-zelle-aktion">
      <button
        v-if="!istStorno"
        class="ped-storno-knopf"
        type="button"
        title="Buchung per Gegenbuchung stornieren"
        @click="$emit('storno', buchung)"
      >
        <PedantIcon name="storno" :size="13" />
      </button>
    </td>
  </tr>
</template>

<script setup>
// BuchungsZeile — eine Journalzeile, bewusst dumm: zeigt an, meldet Klicks.
import { computed } from 'vue';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';

const props = defineProps({
  buchung: { type: Object, required: true },
  mitAktionen: { type: Boolean, default: false },
});

defineEmits(['storno']);

const istStorno = computed(() => props.buchung.stornoreferenz !== null);
const datumText = computed(() =>
  new Date(props.buchung.buchungsdatum).toLocaleDateString('de-DE'));
</script>

<style scoped>
.ped-zeile-storno td {
  color: var(--ped-text-dim);
}
.ped-storno-marke {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-left: 0.4rem;
  font-size: 0.72rem;
  color: var(--ped-warn);
}
.ped-zelle-zahl {
  text-align: right;
  font-family: var(--ped-mono);
  font-variant-numeric: tabular-nums;
}
.ped-zelle-konto {
  font-family: var(--ped-mono);
}
.ped-zelle-aktion {
  text-align: center;
  width: 2.2rem;
}
.ped-storno-knopf {
  display: inline-flex;
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--ped-rand);
  border-radius: 5px;
  background: var(--ped-flaeche);
  color: var(--ped-text-dim);
  cursor: pointer;
}
.ped-storno-knopf:hover {
  color: var(--ped-fehler);
  border-color: var(--ped-fehler);
}
</style>
