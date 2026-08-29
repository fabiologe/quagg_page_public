<template>
  <ProjektKarte titel="Auswertung" icon="diagramm">
    <dl class="prj-kennwerte">
      <div><dt>Gesamt</dt><dd>{{ minutenAlsText(s.minuten_gesamt) }}</dd></div>
      <div><dt>Abrechenbar</dt><dd>{{ minutenAlsText(s.minuten_abrechenbar) }}</dd></div>
      <div><dt>Noch nicht abgerechnet</dt><dd :class="{ 'prj-warn': s.minuten_unabgerechnet > 0 }">{{ minutenAlsText(s.minuten_unabgerechnet) }}</dd></div>
      <div v-if="budget"><dt>Budget</dt><dd :class="{ 'prj-fehler': ueberBudget }">{{ prozent }} % von {{ budget }} h</dd></div>
    </dl>
    <div v-if="budget" class="prj-budget"><div class="prj-budget-fuell" :class="{ 'prj-budget-ueber': ueberBudget }" :style="{ width: `${Math.min(100, prozent)}%` }"></div></div>
    <h4 v-if="s.je_abschnitt?.length">Je Abschnitt</h4>
    <ul class="prj-verteilung">
      <li v-for="a in s.je_abschnitt || []" :key="String(a.abschnitt_id)"><span>{{ abschnittNamen[a.abschnitt_id] || 'ohne Abschnitt' }}</span><strong>{{ minutenAlsText(a.minuten) }}</strong></li>
    </ul>
    <h4 v-if="s.je_monat?.length">Je Monat</h4>
    <ul class="prj-verteilung">
      <li v-for="m in (s.je_monat || []).slice(0, 12)" :key="m.monat"><span>{{ m.monat }}</span><strong>{{ minutenAlsText(m.minuten) }}</strong></li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// ZeitAuswertung — Summen, Budget (Stundenprojekte), Verteilung je Abschnitt/Monat.
import { computed } from 'vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { minutenAlsText } from '../../services/Zeit';

const props = defineProps({ akte: { type: Object, required: true }, summen: { type: Object, default: null }, abschnittNamen: { type: Object, default: () => ({}) } });
const LEER = { minuten_gesamt: 0, minuten_abrechenbar: 0, minuten_unabgerechnet: 0, je_abschnitt: [], je_monat: [] };
const s = computed(() => props.summen || props.akte.zeit || LEER);
const budget = computed(() => (props.akte.honorarmodell === 'stunden' ? props.akte.budget_stunden : null));
const prozent = computed(() => (budget.value ? Math.round((s.value.minuten_gesamt / 60 / budget.value) * 1000) / 10 : 0));
const ueberBudget = computed(() => prozent.value > 100);
</script>

<style scoped>
.prj-kennwerte { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.6rem; margin: 0; }
.prj-kennwerte dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-kennwerte dd { margin: 0; font-size: 1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.prj-warn { color: var(--prj-warn); }
.prj-fehler { color: var(--prj-fehler); }
.prj-budget { height: 0.5rem; margin-top: 0.6rem; border-radius: 2px; background: var(--prj-leistung-weich); overflow: hidden; }
.prj-budget-fuell { height: 100%; background: var(--prj-leistung); }
.prj-budget-ueber { background: var(--prj-fehler); }
h4 { margin: 0.9rem 0 0.3rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-verteilung { list-style: none; margin: 0; padding: 0; }
.prj-verteilung li { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.82rem; }
.prj-verteilung strong { font-variant-numeric: tabular-nums; }
</style>
