<template>
  <InternLayout>
    <div class="prj-root prj-akte">
      <p v-if="store.fehler" class="prj-fehler">{{ store.fehler }}</p>
      <div v-if="store.laedt && !store.akte" class="prj-laedt"><ProjektIcon name="laden" :size="18" /> Akte wird geladen…</div>
      <LeerHinweis v-else-if="!store.akte" :text="`Es gibt keine Akte #P${route.params.id}.`" />
      <template v-else>
        <TimerLeiste v-if="tab !== 'zeiten'" />
        <AkteKopf :akte="store.akte" :aktiv="tab" :tabs="TABS" @tab="tab = $event" @verschieben="verschieben" />
        <AkteUebersicht v-if="tab === 'uebersicht'" :akte="store.akte" />
        <AkteLeistung v-else-if="tab === 'leistung'" :akte="store.akte" />
        <AkteGeld v-else-if="tab === 'geld'" :akte="store.akte" />
        <AkteTermine v-else-if="tab === 'termine'" :akte="store.akte" />
        <AkteZeiten v-else-if="tab === 'zeiten'" :akte="store.akte" />
        <AkteAufgaben v-else-if="tab === 'aufgaben'" :akte="store.akte" />
        <AkteDokumente v-else-if="tab === 'dokumente'" :akte="store.akte" />
        <AkteModelle v-else-if="tab === 'modelle'" :akte="store.akte" />
        <AkteKommunikation v-else-if="tab === 'kommunikation'" :akte="store.akte" />
        <AkteDossier v-else-if="tab === 'dossier'" :akte="store.akte" />
      </template>
    </div>
  </InternLayout>
</template>

<script setup>
// ProjektAkteView — Shell der Akte: lädt per Route-ID, hält den aktiven Tab.
// Weitere Tabs (Leistung, Geld, Zeiten, …) kommen je Stufe als eigene Komponente.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import InternLayout from '@/components/layout/InternLayout.vue';
import { useAuthStore } from '@/stores/useAuthStore';
import AkteDokumente from '../components/akte/AkteDokumente.vue';
import AkteDossier from '../components/akte/AkteDossier.vue';
import AkteAufgaben from '../components/akte/AkteAufgaben.vue';
import AkteGeld from '../components/akte/AkteGeld.vue';
import AkteKommunikation from '../components/akte/AkteKommunikation.vue';
import AkteModelle from '../components/akte/AkteModelle.vue';
import AkteTermine from '../components/akte/AkteTermine.vue';
import AkteZeiten from '../components/akte/AkteZeiten.vue';
import AkteKopf from '../components/akte/AkteKopf.vue';
import AkteLeistung from '../components/akte/AkteLeistung.vue';
import AkteUebersicht from '../components/akte/AkteUebersicht.vue';
import LeerHinweis from '../components/ui/LeerHinweis.vue';
import TimerLeiste from '../components/ui/TimerLeiste.vue';
import ProjektIcon from '../components/ui/ProjektIcon.vue';
import { useProjekteStore } from '../stores/useProjekteStore';
import '../styles/theme.css';

const ALLE_TABS = [
  { id: 'uebersicht', titel: 'Übersicht', icon: 'akte' },
  { id: 'leistung', titel: 'Leistung', icon: 'leistung' },
  { id: 'geld', titel: 'Geld', icon: 'geld' },
  { id: 'termine', titel: 'Termine', icon: 'termin' },
  { id: 'zeiten', titel: 'Zeiten', icon: 'zeit' },
  { id: 'aufgaben', titel: 'Aufgaben', icon: 'aufgaben' },
  { id: 'dokumente', titel: 'Dokumente', icon: 'ordner-offen' },
  { id: 'modelle', titel: 'Modelle', icon: 'modelle' },
  { id: 'kommunikation', titel: 'Kommunikation', icon: 'mail' },
  { id: 'dossier', titel: 'Dossier', icon: 'dossier' },
];

const route = useRoute();
const store = useProjekteStore();
const auth = useAuthStore();
const tab = ref('uebersicht');

// Rechnungslegung (Geld-Tab) nur für Admins — das Backend gibt dort ohnehin 403
const TABS = computed(() => ALLE_TABS.filter(t => t.id !== 'geld' || auth.istAdmin));
watch(TABS, (liste) => {
  if (!liste.some(t => t.id === tab.value)) tab.value = 'uebersicht';
});

async function laden() {
  const id = Number(route.params.id);
  if (Number.isInteger(id)) await store.ladeAkte(id);
}

async function verschieben(phase) {
  if (phase && phase !== store.akte?.phase) await store.verschiebe(store.akte.id, phase);
}

onMounted(laden);
watch(() => route.params.id, laden);
</script>

<style scoped>
.prj-akte { display: flex; flex-direction: column; gap: 1rem; max-width: 1200px; margin: 0 auto; }
.prj-laedt { display: flex; align-items: center; gap: 0.5rem; color: var(--prj-text-dim); }
</style>
