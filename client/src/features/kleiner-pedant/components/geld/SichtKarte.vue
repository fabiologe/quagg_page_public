<template>
  <div class="ped-sicht" :style="{ '--sicht-farbe': `var(${farbe})` }">
    <div class="ped-sicht-kopf">
      <span class="ped-sicht-punkt" aria-hidden="true"></span>
      <span class="ped-sicht-titel">{{ titel }}</span>
    </div>
    <p class="ped-sicht-summe"><GeldBetrag :cent="summeCent" /></p>
    <p class="ped-sicht-detail">
      {{ anzahl }} {{ anzahl === 1 ? einzahl : mehrzahl }}<template v-if="detail"> · {{ detail }}</template>
    </p>
  </div>
</template>

<script setup>
// SichtKarte — eine der drei Geld-Kacheln (Hero-Zahl, kein Chart noetig).
// Die Serienfarbe traegt der Punkt; der Text bleibt in Text-Tokens.
import GeldBetrag from '../ui/GeldBetrag.vue';

defineProps({
  titel: { type: String, required: true },
  summeCent: { type: Number, default: 0 },
  anzahl: { type: Number, default: 0 },
  einzahl: { type: String, default: 'Posten' },
  mehrzahl: { type: String, default: 'Posten' },
  detail: { type: String, default: '' },
  farbe: { type: String, required: true },   // CSS-Token-Name, z. B. '--ped-chart-offen'
});
</script>

<style scoped>
.ped-sicht {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid var(--ped-rand);
  border-left: 4px solid var(--sicht-farbe);
  border-radius: 8px;
  background: var(--ped-flaeche);
  box-shadow: var(--ped-schatten);
}
.ped-sicht-kopf {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.ped-sicht-punkt {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--sicht-farbe);
}
.ped-sicht-titel {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ped-text-dim);
}
.ped-sicht-summe {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--ped-text);
}
.ped-sicht-detail {
  margin: 0;
  font-size: 0.75rem;
  color: var(--ped-text-dim);
}
</style>
