<template>
  <div class="prj-root prj-office">
    <header class="prj-office-kopf">
      <ProjektIcon name="bearbeiten" :size="16" />
      <strong>{{ dateiname }}</strong>
      <span v-if="akte" class="prj-office-projekt">#P{{ akte.id }} {{ akte.name }}</span>
      <span class="prj-office-hinweis">Gespeichert wird direkt im Projektordner. Schließen erst, wenn ONLYOFFICE „gespeichert" meldet.</span>
      <button type="button" class="prj-knopf" @click="schliessen"><ProjektIcon name="schliessen" :size="14" /> Schließen</button>
    </header>
    <p v-if="fehler" class="prj-fehler prj-office-fehler">{{ fehler }}</p>
    <template v-else>
      <form v-if="sitzung" ref="formular" :action="sitzung.editor_url" method="post" target="prj-onlyoffice" class="prj-versteckt">
        <input type="hidden" name="access_token" :value="sitzung.access_token" />
        <input type="hidden" name="access_token_ttl" :value="sitzung.access_token_ttl" />
      </form>
      <iframe name="prj-onlyoffice" class="prj-office-editor" title="ONLYOFFICE" allow="clipboard-read; clipboard-write"></iframe>
    </template>
  </div>
</template>

<script setup>
// OfficeView — Standalone-Tab für ONLYOFFICE (Muster PDF-Editor): /office?projekt=<id>&pfad=<relativ>.
// Holt die WOPI-Sitzung und lädt den Editor per Formular-POST in ein Vollbild-iframe.
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import ProjektIcon from '../components/ui/ProjektIcon.vue';
import ProjekteApi from '../services/ProjekteApi';
import '../styles/theme.css';

const route = useRoute();
const sitzung = ref(null);
const akte = ref(null);
const fehler = ref('');
const formular = ref(null);
const pfad = computed(() => String(route.query.pfad || ''));
const dateiname = computed(() => pfad.value.split('/').pop() || 'Dokument');

function schliessen() {
  if (window.history.length > 1 && !window.opener) window.history.back();
  else window.close();
}

onMounted(async () => {
  const id = Number(route.query.projekt);
  if (!Number.isInteger(id) || id <= 0 || !pfad.value) {
    fehler.value = 'Aufruf ohne Projekt oder Datei — bitte aus dem Dokumente-Tab öffnen.';
    return;
  }
  document.title = `${dateiname.value} · ONLYOFFICE`;
  try {
    const [s, a] = await Promise.all([ProjekteApi.wopiSession(id, pfad.value), ProjekteApi.lesen(id)]);
    sitzung.value = s;
    akte.value = a;
    await nextTick();
    formular.value?.submit();
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Online-Office ist nicht erreichbar.';
  }
});
</script>

<style scoped>
.prj-office { display: flex; flex-direction: column; height: 100vh; background: var(--prj-bg); color: var(--prj-text); }
.prj-office-kopf { display: flex; align-items: center; gap: 0.7rem; padding: 0.45rem 0.9rem; background: var(--prj-flaeche); border-bottom: 1px solid var(--prj-rand); font-size: 0.85rem; }
.prj-office-projekt { color: var(--prj-text-dim); }
.prj-office-hinweis { margin-left: auto; font-size: 0.76rem; color: var(--prj-text-dim); }
.prj-office-editor { flex: 1; width: 100%; border: none; background: var(--prj-flaeche); }
.prj-office-fehler { margin: 1rem; }
.prj-versteckt { display: none; }
</style>
