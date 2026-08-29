<template>
  <ProjektModal titel="Abschnitte aus Leistungsbild" icon="leistung" @schliessen="$emit('schliessen')">
    <div class="prj-form">
      <FormFeld name="Leistungsbild (HOAI 2021)">
        <select v-model="paragraf">
          <option v-for="b in bilder" :key="b.paragraf" :value="b.paragraf">§ {{ b.paragraf }} {{ b.titel }}</option>
        </select>
      </FormFeld>
      <FormFeld name="Volles Honorar (100 %, € netto)" :fehler="honorarFehler">
        <input v-model="honorarText" type="text" inputmode="decimal" placeholder="100.000,00" />
      </FormFeld>
      <fieldset class="prj-lph">
        <legend>Beauftragte Leistungsphasen</legend>
        <label v-for="ph in phasen" :key="ph.lph">
          <input v-model="beauftragt" type="checkbox" :value="ph.lph" />
          <span class="prj-lph-nr">LPH {{ ph.lph }}</span> {{ ph.bezeichnung }}
          <span class="prj-lph-prozent">{{ ph.prozent }} %</span>
          <span class="prj-lph-betrag">{{ betragFuer(ph) }}</span>
        </label>
      </fieldset>
      <p class="prj-summe">Beauftragt: <strong>{{ centAlsEuro(summeBeauftragt) }}</strong> von {{ centAlsEuro(honorarCent || 0) }}</p>
    </div>
    <template #fuss>
      <button type="button" class="prj-knopf" @click="$emit('schliessen')">Abbrechen</button>
      <button type="button" class="prj-knopf prj-knopf-primaer" :disabled="!gueltig" @click="anwenden">
        <ProjektIcon name="ok" :size="14" /> 9 Abschnitte anlegen
      </button>
    </template>
  </ProjektModal>
</template>

<script setup>
// VorlageDialog — HOAI-Gewichte auf ein volles Honorar verteilen; Teilbeauftragung per Häkchen.
import { computed, ref, watch } from 'vue';
import { centAlsEuro, euroZuCent } from '@/features/kleiner-pedant/services/Geld';
import FormFeld from '../ui/FormFeld.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektModal from '../ui/ProjektModal.vue';
import { verteile } from '../../services/Fortschritt';

const props = defineProps({
  bilder: { type: Array, default: () => [] },
  vorauswahl: { type: String, default: '43' },
});
const emit = defineEmits(['schliessen', 'anwenden']);

const paragraf = ref(props.vorauswahl);
const honorarText = ref('');
const beauftragt = ref([1, 2, 3, 4, 5, 6, 7, 8, 9]);

const bild = computed(() => props.bilder.find((b) => b.paragraf === paragraf.value) || null);
const phasen = computed(() => bild.value?.phasen || []);
const honorarCent = computed(() => (honorarText.value ? euroZuCent(honorarText.value) : null));
const honorarFehler = computed(() => (honorarText.value && !(honorarCent.value > 0) ? 'Bitte einen Betrag wie 100.000,00 eingeben' : ''));
const betraege = computed(() => (honorarCent.value > 0 ? verteile(honorarCent.value, phasen.value.map((p) => p.prozent)) : []));
const summeBeauftragt = computed(() => phasen.value.reduce(
  (s, ph, i) => (beauftragt.value.includes(ph.lph) ? s + (betraege.value[i] || 0) : s), 0));
const gueltig = computed(() => honorarCent.value > 0 && beauftragt.value.length > 0 && Boolean(bild.value));

watch(() => props.bilder, (b) => { if (!bild.value && b.length) paragraf.value = b[0].paragraf; }, { immediate: true });

function betragFuer(ph) {
  const i = phasen.value.indexOf(ph);
  return betraege.value[i] === undefined ? '' : centAlsEuro(betraege.value[i]);
}

function anwenden() {
  if (!gueltig.value) return;
  emit('anwenden', { paragraf: paragraf.value, honorar_cent: honorarCent.value, beauftragt: [...beauftragt.value].sort((a, b) => a - b) });
}
</script>

<style scoped>
.prj-form { display: flex; flex-direction: column; gap: 0.8rem; }
.prj-lph {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--prj-rand);
  border-radius: 6px;
  font-size: 0.84rem;
}
.prj-lph legend { font-size: 0.75rem; color: var(--prj-text-dim); padding: 0 0.3rem; }
.prj-lph label { display: grid; grid-template-columns: auto 4rem 1fr 3rem 7rem; align-items: center; gap: 0.5rem; }
.prj-lph-nr { font-family: var(--prj-mono); }
.prj-lph-prozent, .prj-lph-betrag { text-align: right; font-variant-numeric: tabular-nums; color: var(--prj-text-dim); }
.prj-summe { margin: 0; font-size: 0.85rem; }
</style>
