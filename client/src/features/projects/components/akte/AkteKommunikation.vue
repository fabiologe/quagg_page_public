<template>
  <ProjektKarte titel="E-Mails zu diesem Projekt" icon="mail">
    <template #aktionen>
      <router-link to="/mail" class="prj-knopf"><ProjektIcon name="extern" :size="13" /> Posteingang</router-link>
    </template>
    <p v-if="fehler" class="prj-fehler">{{ fehler }}</p>
    <LeerHinweis v-else-if="geladen && !mails.length" text="Noch keine Mail zugeordnet — im Posteingang einer Mail die Projektnummer zuweisen." />
    <ul v-else class="prj-mails">
      <li v-for="m in mails" :key="m.id">
        <span class="prj-datum">{{ datum(String(m.received_at).slice(0, 10)) }}</span>
        <span class="prj-absender">{{ m.sender }}</span>
        <span class="prj-betreff">{{ m.subject }}<small v-if="m.has_quarantined_files"> · Anhang in Quarantäne</small></span>
      </li>
    </ul>
  </ProjektKarte>
</template>

<script setup>
// AkteKommunikation — Mails mit project_id (bestehender E-Mail-Endpunkt). Zuordnen bleibt im Posteingang.
import { onMounted, ref, watch } from 'vue';
import ProjekteApi from '../../services/ProjekteApi';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { datum } from '../../services/Phasen';

const props = defineProps({ akte: { type: Object, required: true } });
const mails = ref([]);
const geladen = ref(false);
const fehler = ref('');

async function laden() {
  fehler.value = '';
  try {
    mails.value = await ProjekteApi.mails(props.akte.id);
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Mails konnten nicht geladen werden.';
  } finally {
    geladen.value = true;
  }
}
onMounted(laden);
watch(() => props.akte.id, laden);
</script>

<style scoped>
a.prj-knopf { text-decoration: none; }
.prj-mails { list-style: none; margin: 0; padding: 0; }
.prj-mails li { display: grid; grid-template-columns: 6rem 14rem 1fr; gap: 0.6rem; padding: 0.4rem 0; border-bottom: 1px dashed var(--prj-rand); font-size: 0.85rem; }
.prj-datum { font-variant-numeric: tabular-nums; color: var(--prj-text-dim); }
.prj-absender { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--prj-text-dim); }
.prj-betreff { font-weight: 600; }
.prj-betreff small { font-weight: 400; color: var(--prj-warn); }
@media (max-width: 60rem) { .prj-mails li { grid-template-columns: 1fr; gap: 0.1rem; } }
</style>
