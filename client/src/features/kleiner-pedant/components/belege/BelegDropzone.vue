<template>
  <PedantKarte titel="Beleg hochladen" icon="hochladen">
    <div
      class="ped-dropzone"
      :class="{ 'ped-dropzone-aktiv': schwebt }"
      @click="dateiwahl.click()"
      @dragover.prevent="schwebt = true"
      @dragleave.prevent="schwebt = false"
      @drop.prevent="beiDrop"
    >
      <PedantIcon name="beleg" :size="26" />
      <p>Foto oder PDF hierher ziehen<br />oder klicken zum Auswählen</p>
    </div>

    <div class="ped-dropzone-knoepfe">
      <button class="ped-knopf" type="button" @click="dateiwahl.click()">
        <PedantIcon name="hochladen" :size="14" /> Datei wählen
      </button>
      <button class="ped-knopf" type="button" @click="kamera.click()">
        <PedantIcon name="kamera" :size="14" /> Foto aufnehmen
      </button>
    </div>

    <!-- ZWEI Inputs: capture auf dem einzigen Input wuerde auf Mobilgeraeten
         die Galerie-Auswahl verbauen — deshalb Kamera getrennt. -->
    <input
      ref="dateiwahl"
      type="file"
      class="ped-versteckt"
      accept="image/*,application/pdf"
      @change="beiAuswahl"
    />
    <input
      ref="kamera"
      type="file"
      class="ped-versteckt"
      accept="image/*"
      capture="environment"
      @change="beiAuswahl"
    />

    <div v-if="vorschauUrl" class="ped-dropzone-vorschau">
      <img v-if="istBild" :src="vorschauUrl" alt="Beleg-Vorschau" />
      <p v-else class="ped-dropzone-pdfname">
        <PedantIcon name="pdf" :size="14" /> {{ dateiname }}
      </p>
    </div>

    <button
      v-if="datei"
      class="ped-knopf ped-knopf-primaer"
      type="button"
      :disabled="store.laedtHoch"
      @click="hochladen"
    >
      <PedantIcon :name="store.laedtHoch ? 'laden' : 'ok'" :size="14" />
      {{ store.laedtHoch ? 'Lädt hoch…' : 'Hochladen' }}
    </button>
  </PedantKarte>
</template>

<script setup>
// BelegDropzone — waehlt/fotografiert eine Datei, zeigt die Vorschau und
// laesst den Store hochladen. Vorschau ueber createObjectURL (sparsamer als
// DataURL bei MB-Fotos), revoke bei Wechsel und Unmount.
import { computed, onUnmounted, ref } from 'vue';
import { useBelegStore } from '../../stores/useBelegStore';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';

const store = useBelegStore();
const dateiwahl = ref(null);
const kamera = ref(null);
const schwebt = ref(false);
const datei = ref(null);
const vorschauUrl = ref('');

const istBild = computed(() => datei.value?.type?.startsWith('image/'));
const dateiname = computed(() => datei.value?.name || '');

function setzeDatei(neue) {
  if (!neue) return;
  if (vorschauUrl.value) URL.revokeObjectURL(vorschauUrl.value);
  datei.value = neue;
  vorschauUrl.value = URL.createObjectURL(neue);
}

function beiAuswahl(ereignis) {
  setzeDatei(ereignis.target.files?.[0]);
  ereignis.target.value = '';
}

function beiDrop(ereignis) {
  schwebt.value = false;
  setzeDatei(ereignis.dataTransfer.files?.[0]);
}

async function hochladen() {
  try {
    await store.hochladen(datei.value);
    if (vorschauUrl.value) URL.revokeObjectURL(vorschauUrl.value);
    datei.value = null;
    vorschauUrl.value = '';
  } catch {
    // Meldung steht in store.fehler und wird in der View gezeigt.
  }
}

onUnmounted(() => {
  if (vorschauUrl.value) URL.revokeObjectURL(vorschauUrl.value);
});
</script>

<style scoped>
.ped-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1.4rem 1rem;
  border: 2px dashed var(--ped-rand-stark);
  border-radius: 8px;
  color: var(--ped-text-dim);
  text-align: center;
  cursor: pointer;
}
.ped-dropzone:hover,
.ped-dropzone-aktiv {
  border-color: var(--ped-akzent);
  color: var(--ped-akzent);
  background: var(--ped-akzent-weich);
}
.ped-dropzone p {
  margin: 0;
  font-size: 0.8rem;
}
.ped-dropzone-knoepfe {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.7rem;
}
.ped-knopf {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--ped-rand-stark);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text);
  font-size: 0.8rem;
  cursor: pointer;
}
.ped-knopf:hover {
  border-color: var(--ped-akzent);
  color: var(--ped-akzent);
}
.ped-knopf-primaer {
  margin-top: 0.7rem;
  width: 100%;
  justify-content: center;
  border: none;
  background: var(--ped-akzent);
  color: var(--ped-akzent-kontrast);
  font-weight: 600;
}
.ped-knopf-primaer:hover {
  background: var(--ped-akzent-hover);
  color: var(--ped-akzent-kontrast);
}
.ped-knopf-primaer:disabled {
  opacity: 0.6;
  cursor: wait;
}
.ped-versteckt {
  display: none;
}
.ped-dropzone-vorschau {
  margin-top: 0.7rem;
}
.ped-dropzone-vorschau img {
  max-width: 100%;
  max-height: 14rem;
  border-radius: 6px;
  border: 1px solid var(--ped-rand);
}
.ped-dropzone-pdfname {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  font-size: 0.8rem;
  color: var(--ped-text);
}
</style>
