<template>
  <tr class="ped-belegzeile" @click="$emit('oeffnen', beleg)">
    <td class="ped-zelle-mono">{{ beleg.belegnummer }}</td>
    <td>{{ datumText }}</td>
    <td>{{ beleg.lieferant || '—' }}</td>
    <td class="ped-zelle-zahl">
      <GeldBetrag v-if="beleg.brutto_cent" :cent="beleg.brutto_cent" />
      <span v-else class="ped-offen">offen</span>
    </td>
    <td>
      <StatusPille :zustand="pillenZustand" :text="beleg.status" />
    </td>
  </tr>
</template>

<script setup>
// BelegZeile — eine Zeile der Belegliste, dumm; Klick meldet nach oben.
import { computed } from 'vue';
import GeldBetrag from '../ui/GeldBetrag.vue';
import StatusPille from '../ui/StatusPille.vue';

const props = defineProps({
  beleg: { type: Object, required: true },
});
defineEmits(['oeffnen']);

const pillenZustand = computed(() => ({
  erfasst: 'warnung',
  erkannt: 'warnung',
  geprueft: 'ok',
  gebucht: 'ok',
  verworfen: 'fehler',
}[props.beleg.status] || 'warnung'));

const datumText = computed(() => {
  const datum = props.beleg.belegdatum || props.beleg.erfasst_am;
  return datum ? new Date(datum).toLocaleDateString('de-DE') : '—';
});
</script>

<style scoped>
.ped-belegzeile {
  cursor: pointer;
}
.ped-zelle-mono {
  font-family: var(--ped-mono);
  white-space: nowrap;
}
.ped-zelle-zahl {
  text-align: right;
}
.ped-offen {
  color: var(--ped-text-dim);
  font-size: 0.78rem;
}
</style>
