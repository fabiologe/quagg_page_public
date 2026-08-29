<template>
  <div class="prj-kennzahlen">
    <button
      v-for="k in karten"
      :key="k.id"
      type="button"
      class="prj-kennzahl"
      :class="{ 'prj-kennzahl-aktiv': aktiv === k.id, 'prj-kennzahl-warn': k.warn }"
      @click="$emit('filter', k.id)"
    >
      <span class="prj-kennzahl-wert" :class="{ 'prj-kennzahl-klein': k.klein }">{{ k.wert }}</span>
      <span class="prj-kennzahl-titel">{{ k.titel }}</span>
    </button>
  </div>
</template>

<script setup>
// KennzahlenLeiste — echte Zahlen aus /projekte/kennzahlen; Klick filtert das Portfolio.
import { computed } from 'vue';
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import { PHASEN } from '../../services/Phasen';

const props = defineProps({
  kennzahlen: { type: Object, default: null },
  aktiv: { type: String, default: 'alle' },
});
defineEmits(['filter']);

const karten = computed(() => {
  const kz = props.kennzahlen;
  const jePhase = kz?.je_phase || {};
  return [
    { id: 'alle', titel: 'Projekte', wert: kz?.gesamt ?? '–' },
    ...PHASEN.slice(0, 4).map((p) => ({ id: p.id, titel: p.titel, wert: jePhase[p.id] ?? '–' })),
    { id: 'faellig', titel: `Fällig (${kz?.faellig_horizont_tage ?? 14} Tage)`,
      wert: kz?.faellig ?? '–', warn: (kz?.faellig ?? 0) > 0 },
    { id: 'aufgaben', titel: 'Aufgaben überfällig', wert: kz?.aufgaben_ueberfaellig ?? '–',
      warn: (kz?.aufgaben_ueberfaellig ?? 0) > 0 },
    { id: 'vorschlaege', titel: 'KI-Vorschläge', wert: kz?.vorschlaege_offen ?? '–',
      warn: (kz?.vorschlaege_offen ?? 0) > 0 },
    { id: 'unabgerechnet', titel: 'Unabgerechnet (netto)', klein: true,
      wert: kz ? centAlsEuro(kz.unabgerechnet_cent ?? 0) : '–', warn: (kz?.unabgerechnet_cent ?? 0) > 0 },
  ];
});
</script>

<style scoped>
.prj-kennzahlen {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
  gap: 0.6rem;
}
.prj-kennzahl {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--prj-rand);
  border-radius: 8px;
  background: var(--prj-flaeche);
  color: var(--prj-text);
  cursor: pointer;
  text-align: left;
}
.prj-kennzahl:hover { background: var(--prj-flaeche-2); }
.prj-kennzahl-aktiv { border-color: var(--prj-akzent); box-shadow: inset 0 0 0 1px var(--prj-akzent); }
.prj-kennzahl-warn .prj-kennzahl-wert { color: var(--prj-warn); }
.prj-kennzahl-wert {
  font-size: 1.5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.prj-kennzahl-klein { font-size: 1.05rem; }
.prj-kennzahl-titel {
  font-size: 0.74rem;
  color: var(--prj-text-dim);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
</style>
