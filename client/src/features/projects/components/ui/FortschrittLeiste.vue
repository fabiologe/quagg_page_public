<template>
  <div class="prj-leiste" :class="{ 'prj-leiste-kompakt': kompakt }" :title="titel">
    <div v-if="!segs.length" class="prj-leiste-leer">
      <span v-if="!kompakt">Noch keine Abschnitte — Leistungsstand nicht messbar.</span>
    </div>
    <div v-else class="prj-segmente">
      <div
        v-for="s in segs"
        :key="s.id"
        class="prj-seg"
        :class="{ 'prj-seg-nicht': !s.zaehlt, [`prj-seg-${s.art}`]: true }"
        :style="{ flex: s.anteil }"
        :title="`${s.bezeichnung}: ${s.zaehlt ? `${s.fortschritt} %` : 'nicht beauftragt'}`"
      >
        <div v-if="s.zaehlt" class="prj-seg-fuell" :style="{ width: `${s.fortschritt}%` }"></div>
        <span v-if="!kompakt && s.anteil >= 0.06" class="prj-seg-lbl">{{ s.titel }}</span>
      </div>
    </div>
    <template v-if="!kompakt && segs.length">
      <div v-if="abgerechnetCent !== null" class="prj-marker" title="abgerechnet">
        <div class="prj-marker-abgerechnet" :style="{ width: `${anteil(abgerechnetCent)}%` }"></div>
      </div>
      <div v-if="bezahltCent !== null" class="prj-marker" title="bezahlt">
        <div class="prj-marker-bezahlt" :style="{ width: `${anteil(bezahltCent)}%` }"></div>
      </div>
    </template>
  </div>
</template>

<script setup>
/**
 * FortschrittLeiste — die Level-Bar. Segmente ∝ Honorar, Füllung = Fortschritt,
 * nicht beauftragte Abschnitte schraffiert. Die Marker-Schichten abgerechnet/
 * bezahlt erscheinen erst, wenn Werte kommen (Stufe 4).
 */
import { computed } from 'vue';
import { leistung, segmente } from '../../services/Fortschritt';

const props = defineProps({
  abschnitte: { type: Array, default: () => [] },
  abgerechnetCent: { type: Number, default: null },
  bezahltCent: { type: Number, default: null },
  kompakt: { type: Boolean, default: false },
});

const segs = computed(() => segmente(props.abschnitte));
const kennzahlen = computed(() => leistung(props.abschnitte));
const titel = computed(() => (segs.value.length ? `Leistung ${kennzahlen.value.prozent} %` : ''));

function anteil(cent) {
  const basis = kennzahlen.value.honorar_beauftragt_cent;
  return basis ? Math.min(100, (cent / basis) * 100) : 0;
}
</script>

<style scoped>
.prj-leiste { display: flex; flex-direction: column; gap: 3px; }
.prj-segmente { display: flex; gap: 2px; height: 1.9rem; }
.prj-leiste-kompakt .prj-segmente { height: 0.5rem; gap: 1px; }
.prj-seg {
  position: relative;
  min-width: 2px;
  background: var(--prj-leistung-weich);
  overflow: hidden;
  border-radius: 2px;
}
.prj-seg-fuell { position: absolute; inset: 0 auto 0 0; background: var(--prj-leistung); }
.prj-seg-nachtrag, .prj-seg-besondere { outline: 1px dashed var(--prj-akzent); outline-offset: -1px; }
.prj-seg-nicht {
  background: repeating-linear-gradient(135deg, var(--prj-flaeche-3) 0 4px, var(--prj-flaeche) 4px 8px);
}
.prj-seg-lbl {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--prj-mono);
  font-size: 0.68rem;
  color: var(--prj-text);
  pointer-events: none;
}
.prj-marker { position: relative; height: 0.4rem; background: var(--prj-flaeche-2); border-radius: 2px; overflow: hidden; }
.prj-marker-abgerechnet { height: 100%; background: var(--prj-akzent); }
.prj-marker-bezahlt { height: 100%; background: var(--prj-text); }
.prj-leiste-leer { font-size: 0.78rem; color: var(--prj-text-dim); }
.prj-leiste-kompakt .prj-leiste-leer { height: 0.5rem; border-radius: 2px; background: var(--prj-flaeche-2); }
</style>
