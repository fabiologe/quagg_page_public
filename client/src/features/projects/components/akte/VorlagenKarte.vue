<template>
  <ProjektKarte titel="Aus Vorlage erzeugen" icon="pdf">
    <div class="prj-vorlagen">
      <button v-for="v in vorlagen" :key="v.id" type="button" class="prj-knopf" :disabled="laeuft === v.id" @click="erzeugen(v)">
        <ProjektIcon :name="laeuft === v.id ? 'laden' : (v.typ === 'xlsx' ? 'tabelle' : 'pdf')" :size="14" /> {{ v.titel }}
      </button>
    </div>
    <p v-if="ergebnis" class="prj-erfolg">
      Erzeugt: <span class="prj-mono">{{ ergebnis.pfad }}</span>
      <button type="button" class="prj-inline" @click="$emit('oeffnen', ergebnis.pfad)">öffnen</button>
    </p>
    <p v-if="fehler" class="prj-fehler">{{ fehler }}</p>
    <p class="prj-dim">Die Dateien landen im Projektordner (Schriftverkehr, Rechnungen, Vertrag) und werden dort in Word/Excel weiterbearbeitet.</p>
  </ProjektKarte>
</template>

<script setup>
// VorlagenKarte — docx/xlsx mit Projektdaten befüllen (docxtpl/openpyxl im Backend).
import { onMounted, ref } from 'vue';
import ProjekteApi from '../../services/ProjekteApi';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';

const props = defineProps({ akte: { type: Object, required: true } });
const emit = defineEmits(['oeffnen', 'erzeugt']);
const vorlagen = ref([]);
const laeuft = ref('');
const ergebnis = ref(null);
const fehler = ref('');

async function erzeugen(v) {
  laeuft.value = v.id;
  fehler.value = '';
  try {
    ergebnis.value = await ProjekteApi.vorlageErzeugen(props.akte.id, v.id);
    emit('erzeugt', ergebnis.value);
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Vorlage konnte nicht erzeugt werden.';
  } finally {
    laeuft.value = '';
  }
}

onMounted(async () => {
  try { vorlagen.value = await ProjekteApi.vorlagen(); } catch (error) { vorlagen.value = []; }
});
</script>

<style scoped>
.prj-vorlagen { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.6rem; }
.prj-erfolg { margin: 0 0 0.4rem; padding: 0.45rem 0.7rem; border-radius: 6px; background: var(--prj-leistung-weich); color: var(--prj-leistung); font-size: 0.82rem; }
.prj-mono { font-family: var(--prj-mono); }
.prj-inline { margin-left: 0.4rem; border: none; background: transparent; color: inherit; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
.prj-dim { margin: 0; font-size: 0.76rem; color: var(--prj-text-dim); }
</style>
