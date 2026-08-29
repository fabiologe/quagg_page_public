<template>
  <span class="ped-geld" :class="klasse">{{ text }}</span>
</template>

<script setup>
// GeldBetrag — die EINE Stelle, an der Cent zu "1.234,56 €" werden.
// richtung faerbt: 'plus' (Zufluss), 'minus' (Abfluss), 'neutral'.
import { computed } from 'vue';
import { centAlsEuro } from '../../services/Geld';

const props = defineProps({
  cent: { type: Number, default: null },
  richtung: {
    type: String,
    default: 'neutral',
    validator: (wert) => ['neutral', 'plus', 'minus'].includes(wert),
  },
});

const text = computed(() => centAlsEuro(props.cent));
const klasse = computed(() => (props.richtung === 'neutral' ? '' : `ped-geld-${props.richtung}`));
</script>

<style scoped>
.ped-geld {
  font-family: var(--ped-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ped-geld-plus { color: var(--ped-plus); }
.ped-geld-minus { color: var(--ped-minus); }
</style>
