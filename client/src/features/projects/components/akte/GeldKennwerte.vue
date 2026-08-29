<template>
  <ProjektKarte titel="Leistung · Abgerechnet · Bezahlt (netto)" icon="geld">
    <FortschrittLeiste :abschnitte="akte.abschnitte || []" :abgerechnet-cent="s.gestellt_netto_cent" :bezahlt-cent="s.bezahlt_netto_cent" />
    <dl class="prj-kennwerte">
      <div><dt>Beauftragt</dt><dd>{{ centAlsEuro(f.honorar_beauftragt_cent) }}</dd></div>
      <div><dt>Leistung ({{ f.prozent }} %)</dt><dd>{{ centAlsEuro(f.leistung_cent) }}</dd></div>
      <div><dt>Gestellt</dt><dd>{{ centAlsEuro(s.gestellt_netto_cent) }}</dd></div>
      <div><dt>Bezahlt</dt><dd>{{ centAlsEuro(s.bezahlt_netto_cent) }}</dd></div>
      <div><dt>Unabgerechnet</dt><dd :class="{ 'prj-warn': s.unabgerechnet_cent > 0 }">{{ centAlsEuro(s.unabgerechnet_cent) }}</dd></div>
      <div><dt>Fremdkosten (brutto)</dt><dd>{{ centAlsEuro(s.fremdkosten_brutto_cent) }}</dd></div>
    </dl>
    <p v-if="geld?.planzeile" class="prj-planzeile">
      Planzeile im Pedanten: <strong>{{ centAlsEuro(geld.planzeile.betrag_cent) }}</strong> brutto,
      davon gestellt {{ centAlsEuro(geld.planzeile.bereits_gestellt_cent) }} · Status {{ geld.planzeile.status }} · erwartet {{ datum(geld.planzeile.erwartet_am) }}
    </p>
    <p v-else class="prj-planzeile">Noch keine Planzeile im Pedanten — sie entsteht, sobald Abschnitte mit Honorar beauftragt sind.</p>
  </ProjektKarte>
</template>

<script setup>
// GeldKennwerte — drei Schichten auf einem Balken; Zahlen netto, Planzeile brutto (Pedant).
import { computed } from 'vue';
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import FortschrittLeiste from '../ui/FortschrittLeiste.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';

const props = defineProps({ akte: { type: Object, required: true }, geld: { type: Object, default: null } });
const LEER = { gestellt_netto_cent: 0, bezahlt_netto_cent: 0, entwurf_netto_cent: 0, fremdkosten_brutto_cent: 0, unabgerechnet_cent: 0 };
const s = computed(() => props.geld?.summen || props.akte.geld || LEER);
const f = computed(() => props.akte.fortschritt || { honorar_beauftragt_cent: 0, leistung_cent: 0, prozent: 0 });
</script>

<style scoped>
.prj-kennwerte { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.6rem; margin: 0.9rem 0 0; }
.prj-kennwerte dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-kennwerte dd { margin: 0; font-size: 1rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.prj-warn { color: var(--prj-warn); }
.prj-planzeile { margin: 0.8rem 0 0; font-size: 0.8rem; color: var(--prj-text-dim); }
</style>
