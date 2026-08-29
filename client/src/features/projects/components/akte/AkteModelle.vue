<template>
  <div class="prj-modelle">
    <ProjektKarte titel="Modelle und Pläne (CDE)" icon="modelle">
      <template #aktionen>
        <a v-if="register" :href="viewerLink()" target="_blank" rel="noopener" class="prj-knopf prj-knopf-primaer"><ProjektIcon name="extern" :size="14" /> Im CDE-Viewer öffnen</a>
      </template>
      <LeerHinweis v-if="!akte.ordner_vorhanden" text="Kein Projektordner — das CDE-Register lebt in <Projekt>/CDE/manifest.yaml." />
      <template v-else>
        <form class="prj-upload" @submit.prevent="hochladen">
          <input ref="dateiFeld" type="file" accept=".ifc,.ifczip,.pdf,.dxf,.dwg,.bcf,.bcfzip" @change="auswahl = $event.target.files?.[0] || null" />
          <select v-model="uploadStatus">
            <option v-for="s in register?.status || STATUS" :key="s" :value="s">{{ s }}</option>
          </select>
          <button type="submit" class="prj-knopf prj-knopf-primaer" :disabled="!auswahl || laeuft"><ProjektIcon :name="laeuft ? 'laden' : 'hochladen'" :size="14" /> Hochladen</button>
        </form>
        <p v-if="fehler" class="prj-fehler">{{ fehler }}</p>
        <LeerHinweis v-if="register && !register.dokumente.length" text="Noch kein Modell oder Plan registriert. IFC/PDF/DXF hochladen — die Datei landet in CDE/, das Manifest führt Revision und Status." />
        <div v-else-if="register" class="prj-tabelle-huelle">
          <table class="prj-tabelle">
            <thead><tr><th>Datei</th><th>Art</th><th>Rev.</th><th>Status</th><th>Größe</th><th>Hochgeladen</th><th></th></tr></thead>
            <tbody>
              <tr v-for="d in register.dokumente" :key="d.sha256" :class="{ 'prj-fehlt': !d.vorhanden }">
                <td class="prj-mono">{{ d.datei }}<small v-if="!d.vorhanden"> — Datei fehlt</small></td>
                <td>{{ d.art }}</td>
                <td class="prj-mitte">{{ d.revision }}</td>
                <td>
                  <select :value="d.status" @change="status(d, $event.target.value)">
                    <option v-for="s in register.status" :key="s" :value="s">{{ s }}</option>
                  </select>
                </td>
                <td class="prj-zahl">{{ Math.round(d.groesse / 1024 / 1024 * 10) / 10 }} MB</td>
                <td class="prj-zahl">{{ datum(String(d.hochgeladen_am).slice(0, 10)) }}</td>
                <td>
                  <a v-if="d.art === 'modell' && d.vorhanden" :href="viewerLink(d.pfad)" target="_blank" rel="noopener" class="prj-knopf prj-knopf-klein" title="Im Viewer laden (neuer Tab)"><ProjektIcon name="modelle" :size="13" /></a>
                  <a v-else-if="d.vorhanden" :href="dateiUrl(d.pfad)" download class="prj-knopf prj-knopf-klein" title="Herunterladen"><ProjektIcon name="herunterladen" :size="13" /></a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="prj-dim">Status nach ISO 19650: WIP (Vorabzug) → Shared (zur Prüfung) → Published → Archived. Der Viewer öffnet in einem eigenen Tab, übernimmt Nummer, Bezeichnung, Bauherr und LPH aus dieser Akte und speichert Ansichten, Issues und Stile in <code>CDE/_repo/</code> des Projektordners.</p>
      </template>
    </ProjektKarte>
  </div>
</template>

<script setup>
// AkteModelle — Tab „Modelle": Register aus <Projekt>/CDE/manifest.yaml, Upload, Status, Deep-Link zum Viewer.
import { onMounted, ref, watch } from 'vue';
import api from '@/services/api';
import ProjekteApi from '../../services/ProjekteApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';

const STATUS = ['WIP', 'Shared', 'Published', 'Archived'];
const props = defineProps({ akte: { type: Object, required: true } });
const register = ref(null);
const auswahl = ref(null);
const dateiFeld = ref(null);
const uploadStatus = ref('WIP');
const laeuft = ref(false);
const fehler = ref('');

function viewerLink(pfad = null) {
  const q = new URLSearchParams({ projekt: String(props.akte.id) });
  if (pfad) q.set('datei', `${props.akte.phase}/${props.akte.ordnername}/${pfad}`);
  return `/cde?${q.toString()}`;
}
function dateiUrl(pfad) {
  return `${api.defaults.baseURL}/projects/file?path=${encodeURIComponent(`${props.akte.phase}/${props.akte.ordnername}/${pfad}`)}`;
}

async function laden() {
  if (!props.akte.ordner_vorhanden) return;
  try { register.value = await ProjekteApi.cde(props.akte.id); } catch (error) { register.value = null; }
}

async function hochladen() {
  if (!auswahl.value) return;
  laeuft.value = true;
  fehler.value = '';
  try {
    await ProjekteApi.cdeHochladen(props.akte.id, auswahl.value, { status: uploadStatus.value });
    auswahl.value = null;
    if (dateiFeld.value) dateiFeld.value.value = '';
    await laden();
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Upload fehlgeschlagen.';
  } finally {
    laeuft.value = false;
  }
}

async function status(d, neu) {
  try {
    await ProjekteApi.cdeStatus(props.akte.id, d.sha256, neu);
    await laden();
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Status konnte nicht gesetzt werden.';
  }
}

onMounted(laden);
watch(() => props.akte.id, laden);
</script>

<style scoped>
.prj-upload { display: grid; grid-template-columns: 1fr 9rem auto; gap: 0.4rem; align-items: center; margin-bottom: 0.8rem; }
.prj-upload input, .prj-upload select { padding: 0.35rem 0.5rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.82rem; }
.prj-tabelle-huelle { overflow-x: auto; }
.prj-tabelle { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.prj-tabelle th { text-align: left; padding: 0.4rem 0.5rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); border-bottom: 1px solid var(--prj-rand-stark); }
.prj-tabelle td { padding: 0.4rem 0.5rem; border-bottom: 1px dashed var(--prj-rand); vertical-align: middle; }
.prj-tabelle select { padding: 0.25rem 0.4rem; border: 1px solid var(--prj-rand-stark); border-radius: 6px; background: var(--prj-flaeche); color: var(--prj-text); font-size: 0.8rem; }
.prj-fehlt td { opacity: 0.6; }
.prj-fehlt small { color: var(--prj-fehler); }
.prj-mono { font-family: var(--prj-mono); font-size: 0.8rem; }
.prj-mitte { text-align: center; }
.prj-zahl { font-variant-numeric: tabular-nums; white-space: nowrap; }
.prj-knopf-klein { padding: 0.25rem 0.4rem; text-decoration: none; display: inline-flex; }
.prj-dim { margin: 0.6rem 0 0; font-size: 0.76rem; color: var(--prj-text-dim); }
a.prj-knopf { text-decoration: none; }
@media (max-width: 60rem) { .prj-upload { grid-template-columns: 1fr; } }
</style>
