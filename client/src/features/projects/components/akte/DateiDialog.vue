<template>
  <ProjektModal :titel="datei.name" icon="datei" @schliessen="$emit('schliessen')">
    <div class="prj-datei-aktionen">
      <a v-if="officeLink" :href="officeLink.uri" class="prj-knopf prj-knopf-primaer"><ProjektIcon name="extern" :size="14" /> In {{ officeName }} öffnen</a>
      <button v-else-if="office" type="button" class="prj-knopf" disabled title="PROJEKTE_WEBDAV_URL in backend/.env setzen (siehe NETZLAUFWERK.md)">In {{ officeName }} öffnen — Netzlaufwerk nicht konfiguriert</button>
      <a v-if="konfiguration?.office_online && onlineBearbeitbar(datei.name)" :href="officeTabUrl" target="_blank" rel="noopener" class="prj-knopf"><ProjektIcon name="bearbeiten" :size="14" /> Im Browser bearbeiten (neuer Tab)</a>
      <a :href="downloadUrl" download class="prj-knopf"><ProjektIcon name="herunterladen" :size="14" /> Herunterladen</a>
    </div>
    <div class="prj-vorschau">
      <p v-if="laedt" class="prj-dim">Vorschau wird geladen…</p>
      <p v-else-if="fehler" class="prj-fehler">{{ fehler }}</p>
      <DocReader v-else-if="art === 'pdf'" :src="downloadUrl" :title="datei.name" :is-embedded="true" @close="$emit('schliessen')" />
      <img v-else-if="art === 'bild' && blobUrl" :src="blobUrl" :alt="datei.name" class="prj-vorschau-bild" />
      <pre v-else-if="art === 'text'" class="prj-vorschau-text">{{ text }}</pre>
      <div v-else-if="art === 'docx' || art === 'xlsx'" class="prj-vorschau-html" v-html="html"></div>
      <p v-else class="prj-dim">Für diesen Dateityp gibt es keine Vorschau — herunterladen oder am Netzlaufwerk öffnen.</p>
    </div>
  </ProjektModal>
</template>

<script setup>
// DateiDialog — Vorschau (pdf/docx/xlsx/Text/Bild) plus Öffnen-Knöpfe. docx via mammoth,
// xlsx via SheetJS (beide nur lesend); Bearbeiten passiert im Desktop-Office oder ONLYOFFICE.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import api from '@/services/api';
import DocReader from '@/features/documents/components/DocReader.vue';
import ProjekteApi from '../../services/ProjekteApi';
import { officeArt, onlineBearbeitbar, vorschauArt } from '../../services/Dokumente';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektModal from '../ui/ProjektModal.vue';

const props = defineProps({
  datei: { type: Object, required: true },           // { name, path } (path relativ zu 1_Projekte)
  akte: { type: Object, required: true },
  konfiguration: { type: Object, default: null },
});
defineEmits(['schliessen']);

const NAMEN = { word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' };
const office = computed(() => officeArt(props.datei.name));
const officeName = computed(() => NAMEN[office.value] || 'Office');
const art = computed(() => vorschauArt(props.datei.name));
const downloadUrl = computed(() => `${api.defaults.baseURL}/projects/file?path=${encodeURIComponent(props.datei.path)}`);
const relPfad = computed(() => {
  const basis = `${props.akte.phase}/${props.akte.ordnername}/`;
  return props.datei.path.startsWith(basis) ? props.datei.path.slice(basis.length) : props.datei.path;
});
const officeTabUrl = computed(() => `/office?${new URLSearchParams({ projekt: String(props.akte.id), pfad: relPfad.value })}`);
const officeLink = ref(null);
const laedt = ref(false);
const fehler = ref('');
const text = ref('');
const html = ref('');
const blobUrl = ref('');

function aufraeumen() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = '';
}

async function laden() {
  aufraeumen();
  text.value = ''; html.value = ''; fehler.value = ''; officeLink.value = null;
  const rel = relPfad.value;
  if (office.value && props.konfiguration?.webdav_url) {
    try { officeLink.value = await ProjekteApi.officeLink(props.akte.id, rel); } catch (e) { officeLink.value = null; }
    if (officeLink.value && !officeLink.value.uri) officeLink.value = null;
  }
  if (!art.value || art.value === 'pdf') return;
  laedt.value = true;
  try {
    const blob = await ProjekteApi.dateiBlob(props.datei.path);
    if (art.value === 'bild') {
      blobUrl.value = URL.createObjectURL(blob);
    } else if (art.value === 'text') {
      text.value = (await blob.text()).slice(0, 200000);
    } else if (art.value === 'docx') {
      const mammoth = await import('mammoth');
      html.value = (await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })).value;
    } else if (art.value === 'xlsx') {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
      html.value = wb.SheetNames.slice(0, 5).map((n) => `<h4>${n}</h4>${XLSX.utils.sheet_to_html(wb.Sheets[n])}`).join('');
    }
  } catch (error) {
    console.warn('projekte vorschau:', error);
    fehler.value = 'Vorschau konnte nicht erzeugt werden.';
  } finally {
    laedt.value = false;
  }
}

onMounted(laden);
watch(() => props.datei.path, laden);
onUnmounted(aufraeumen);
</script>

<style scoped>
.prj-datei-aktionen { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.8rem; }
.prj-datei-aktionen a { text-decoration: none; }
.prj-vorschau { min-height: 8rem; }
.prj-dim { color: var(--prj-text-dim); font-size: 0.85rem; }
.prj-vorschau-bild { max-width: 100%; border: 1px solid var(--prj-rand); }
.prj-vorschau-text { margin: 0; padding: 0.8rem; background: var(--prj-flaeche-2); border-radius: 6px; font-family: var(--prj-mono); font-size: 0.78rem; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 60vh; overflow: auto; }
.prj-vorschau-html { max-height: 60vh; overflow: auto; padding: 0.8rem; border: 1px solid var(--prj-rand); border-radius: 6px; background: var(--prj-flaeche); font-size: 0.88rem; }
.prj-vorschau-html :deep(table) { border-collapse: collapse; font-size: 0.8rem; }
.prj-vorschau-html :deep(td), .prj-vorschau-html :deep(th) { border: 1px solid var(--prj-rand); padding: 0.2rem 0.4rem; }
.prj-vorschau-html :deep(img) { max-width: 100%; }
</style>
