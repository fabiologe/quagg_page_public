<template>
  <ClientLayout>
    <div class="prj-root prj-portal">
      <h1>Ihre Projekte</h1>
      <p v-if="fehler" class="prj-fehler">{{ fehler }}</p>
      <p v-else-if="laedt" class="prj-dim">Projekte werden geladen…</p>
      <LeerHinweis v-else-if="!projekte.length" text="Ihnen ist noch kein Projekt freigegeben. Bei Fragen erreichen Sie uns über die Kontaktseite." />
      <div v-else class="prj-portal-liste">
        <PortalProjektKarte v-for="p in projekte" :key="p.id" :projekt="p" />
      </div>
    </div>
  </ClientLayout>
</template>

<script setup>
// Kundenportal (Stufe 8): nur freigegebene Projekte, nur Leistungsstand und Termine — kein Geld.
import { onMounted, ref } from 'vue';
import api from '@/services/api';
import ClientLayout from '@/components/layout/ClientLayout.vue';
import PortalProjektKarte from '@/features/projects/components/portal/PortalProjektKarte.vue';
import LeerHinweis from '@/features/projects/components/ui/LeerHinweis.vue';
import '@/features/projects/styles/theme.css';

const projekte = ref([]);
const laedt = ref(true);
const fehler = ref('');

onMounted(async () => {
  try {
    projekte.value = (await api.get('/portal/projekte')).data;
  } catch (error) {
    fehler.value = 'Die Projektübersicht ist gerade nicht erreichbar.';
  } finally {
    laedt.value = false;
  }
});
</script>

<style scoped>
.prj-portal { max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 1rem; }
.prj-portal h1 { margin: 0; font-size: 1.4rem; }
.prj-dim { color: var(--prj-text-dim); }
.prj-portal-liste { display: grid; grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr)); gap: 1rem; }
</style>
