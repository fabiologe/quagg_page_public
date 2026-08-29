<template>
  <div class="ped-vorschau">
    <div v-if="laedt" class="ped-vorschau-laedt">
      <PedantIcon name="laden" :size="20" /> Lädt…
    </div>
    <VuePdfEmbed v-else-if="istPdf && quelle" :source="quelle" class="ped-vorschau-pdf" />
    <LeerHinweis v-else-if="istHeic" text="HEIC-Foto abgelegt — Browser können dieses Format nicht anzeigen" />
    <img v-else-if="quelle" :src="quelle" alt="Beleg" class="ped-vorschau-bild" />
    <LeerHinweis v-else text="Vorschau nicht verfügbar" />
  </div>
</template>

<script setup>
// BelegVorschau — laedt das Original als Blob (Bearer via Interceptor),
// zeigt PDF ueber vue-pdf-embed, Bilder als <img>. Object-URLs werden bei
// Belegwechsel und Unmount freigegeben (Muster views/intern/DocumentView.vue).
import { computed, onUnmounted, ref, watch } from 'vue';
import VuePdfEmbed from 'vue-pdf-embed';
import PedantApi from '../../services/PedantApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import PedantIcon from '../ui/PedantIcon.vue';

const props = defineProps({
  beleg: { type: Object, required: true },
});

const quelle = ref('');
const laedt = ref(false);
const istPdf = computed(() => props.beleg.mime_typ === 'application/pdf');
const istHeic = computed(() => ['image/heic', 'image/heif'].includes(props.beleg.mime_typ));

function aufraeumen() {
  if (quelle.value) {
    URL.revokeObjectURL(quelle.value);
    quelle.value = '';
  }
}

async function laden(belegId) {
  aufraeumen();
  laedt.value = true;
  try {
    const blob = await PedantApi.belegDatei(belegId);
    quelle.value = URL.createObjectURL(
      new Blob([blob], { type: props.beleg.mime_typ }));
  } catch (fehler) {
    console.warn('pedant vorschau:', fehler);
  } finally {
    laedt.value = false;
  }
}

watch(() => props.beleg.id, (id) => laden(id), { immediate: true });
onUnmounted(aufraeumen);
</script>

<style scoped>
.ped-vorschau {
  border: 1px solid var(--ped-rand);
  border-radius: 8px;
  background: var(--ped-flaeche-2);
  overflow: auto;
  max-height: 32rem;
}
.ped-vorschau-laedt {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  justify-content: center;
  padding: 2rem;
  color: var(--ped-text-dim);
  font-size: 0.82rem;
}
.ped-vorschau-bild {
  display: block;
  max-width: 100%;
}
.ped-vorschau-pdf {
  width: 100%;
}
</style>
