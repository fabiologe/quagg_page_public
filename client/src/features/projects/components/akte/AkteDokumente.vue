<template>
  <div class="prj-dokumente">
    <LeerHinweis v-if="!akte.ordner_vorhanden" text="Kein Projektordner auf der StorageBox — Dateien gibt es erst nach dem Abgleich." />
    <template v-else>
      <p class="prj-pfad-hinweis">
        Am Netzlaufwerk: <code>{{ laufwerkPfad }}</code>
        <button type="button" class="prj-knopf prj-knopf-klein" title="Pfad kopieren" @click="kopieren"><ProjektIcon name="extern" :size="13" /> kopieren</button>
        <span class="prj-dim">(Einrichtung: features/projects/NETZLAUFWERK.md)</span>
      </p>
      <div class="prj-dok-spalten">
        <div class="prj-spalte">
          <FileExplorer :key="explorerSchluessel" :initial-path="pfad" @open-file="datei = $event" />
        </div>
        <div class="prj-spalte">
          <SucheKarte :akte="akte" @oeffnen="oeffneRelativ" />
          <VorlagenKarte :akte="akte" @oeffnen="oeffneRelativ" @erzeugt="explorerSchluessel += 1" />
        </div>
      </div>
      <DateiDialog v-if="datei" :datei="datei" :akte="akte" :konfiguration="konfiguration" @schliessen="datei = null" />
    </template>
  </div>
</template>

<script setup>
// AkteDokumente — Ordner-Browser, Volltextsuche, Vorlagen; Dateien öffnen sich im
// DateiDialog (Vorschau + Office-Links); ONLYOFFICE läuft im eigenen Tab (/office, Muster PDF-Editor).
import { computed, onMounted, ref } from 'vue';
import ProjekteApi from '../../services/ProjekteApi';
import FileExplorer from '../FileExplorer.vue';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import DateiDialog from './DateiDialog.vue';
import SucheKarte from './SucheKarte.vue';
import VorlagenKarte from './VorlagenKarte.vue';

const props = defineProps({ akte: { type: Object, required: true } });
const datei = ref(null);
const konfiguration = ref(null);
const explorerSchluessel = ref(0);

const pfad = computed(() => `${props.akte.phase}/${props.akte.ordnername}`);
const laufwerkPfad = computed(() => `P:\\${props.akte.phase}\\${props.akte.ordnername}`);

function oeffneRelativ(rel) {
  datei.value = { name: rel.split('/').pop(), path: `${pfad.value}/${rel}` };
}

async function kopieren() {
  try {
    await navigator.clipboard.writeText(laufwerkPfad.value);
  } catch (error) {
    console.warn('projekte pfad kopieren:', error);
  }
}

onMounted(async () => {
  try { konfiguration.value = await ProjekteApi.konfiguration(); } catch (error) { konfiguration.value = null; }
});
</script>

<style scoped>
.prj-dokumente { min-height: 20rem; display: flex; flex-direction: column; gap: 0.6rem; }
.prj-pfad-hinweis { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0; font-size: 0.82rem; }
.prj-pfad-hinweis code { font-family: var(--prj-mono); background: var(--prj-flaeche-2); padding: 0.1rem 0.4rem; border-radius: 4px; }
.prj-dim { color: var(--prj-text-dim); font-size: 0.76rem; }
.prj-knopf-klein { padding: 0.2rem 0.45rem; }
.prj-dok-spalten { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; align-items: start; }
.prj-spalte { display: flex; flex-direction: column; gap: 1rem; }
@media (max-width: 60rem) { .prj-dok-spalten { grid-template-columns: minmax(0, 1fr); } }
</style>
