<template>
  <InternLayout>
    <div class="pedant-root">
      <header class="ped-kopf">
        <h1><PedantIcon name="buchhaltung" :size="20" /> Buchhaltung</h1>
        <nav class="ped-tabs" aria-label="Bereiche">
          <button
            v-for="tab in TABS"
            :key="tab.id"
            type="button"
            class="ped-tab"
            :class="{ 'ped-tab-aktiv': aktiverTab === tab.id }"
            @click="aktiverTab = tab.id"
          >
            <PedantIcon :name="tab.icon" :size="14" />
            {{ tab.titel }}
          </button>
        </nav>
      </header>

      <p v-if="store.fehler" class="ped-global-fehler">{{ store.fehler }}</p>
      <p v-if="belegStore.fehler" class="ped-global-fehler">{{ belegStore.fehler }}</p>

      <div v-if="aktiverTab === 'journal'" class="ped-spalten">
        <BuchungsListe class="ped-spalte-breit" />
        <BuchungsFormular class="ped-spalte-schmal" />
      </div>

      <RechnungenBereich v-else-if="aktiverTab === 'rechnungen'" />

      <GeldBereich v-else-if="aktiverTab === 'geld'" />

      <BankBereich v-else-if="aktiverTab === 'bank'" />

      <template v-else-if="aktiverTab === 'belege'">
        <BelegPruefung
          v-if="belegStore.aktiverBeleg"
          :beleg="belegStore.aktiverBeleg"
        />
        <div v-else class="ped-spalten">
          <BelegListe class="ped-spalte-breit" />
          <BelegDropzone class="ped-spalte-schmal" />
        </div>
      </template>

      <div v-else class="ped-spalten">
        <div class="ped-spalte-schmal ped-stapel">
          <StatusKarte />
          <KettenStatus />
          <ExportKarte />
        </div>
        <LetzteBuchungen class="ped-spalte-breit" />
      </div>
    </div>
  </InternLayout>
</template>

<script setup>
// PedantView — reine Shell: Layout, Tabs, Erstladung. Fachlogik lebt in
// Store und services/, die Inhalte in den Komponenten.
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import InternLayout from '@/components/layout/InternLayout.vue';
import BelegDropzone from '../components/belege/BelegDropzone.vue';
import BelegListe from '../components/belege/BelegListe.vue';
import BelegPruefung from '../components/belege/BelegPruefung.vue';
import BankBereich from '../components/bank/BankBereich.vue';
import GeldBereich from '../components/geld/GeldBereich.vue';
import RechnungenBereich from '../components/rechnungen/RechnungenBereich.vue';
import BuchungsFormular from '../components/journal/BuchungsFormular.vue';
import BuchungsListe from '../components/journal/BuchungsListe.vue';
import KettenStatus from '../components/status/KettenStatus.vue';
import LetzteBuchungen from '../components/status/LetzteBuchungen.vue';
import ExportKarte from '../components/status/ExportKarte.vue';
import StatusKarte from '../components/status/StatusKarte.vue';
import PedantIcon from '../components/ui/PedantIcon.vue';
import { useBelegStore } from '../stores/useBelegStore';
import { useJournalStore } from '../stores/useJournalStore';
import { useRechnungStore } from '../stores/useRechnungStore';
import '../styles/theme.css';

const TABS = [
  { id: 'journal', titel: 'Journal', icon: 'journal' },
  { id: 'belege', titel: 'Belege', icon: 'beleg' },
  { id: 'rechnungen', titel: 'Rechnungen', icon: 'rechnung' },
  { id: 'geld', titel: 'Geld', icon: 'geld' },
  { id: 'bank', titel: 'Bank', icon: 'bank' },
  { id: 'status', titel: 'Status', icon: 'status' },
];

// Deep-Link aus dem Projekt-Cockpit: /intern/pedant?tab=rechnungen&rechnung=<id>
const route = useRoute();
const startTab = TABS.some((t) => t.id === route.query.tab) ? route.query.tab : 'journal';
const aktiverTab = ref(startTab);
const store = useJournalStore();
const belegStore = useBelegStore();
const rechnungStore = useRechnungStore();

onMounted(() => {
  store.ladeAlles();
  belegStore.ladeBelege();
  const rechnungId = Number(route.query.rechnung);
  if (Number.isInteger(rechnungId) && rechnungId > 0) rechnungStore.oeffne(rechnungId);
});
</script>

<style scoped>
.pedant-root {
  max-width: 72rem;
  margin: 0 auto;
  padding: 1.2rem;
  background: var(--ped-bg);
  color: var(--ped-text);
  min-height: 100%;
}
.ped-kopf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.ped-kopf h1 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1.25rem;
  color: var(--ped-text);
}
.ped-tabs {
  display: flex;
  gap: 0.3rem;
}
.ped-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--ped-rand);
  border-radius: 6px;
  background: var(--ped-flaeche);
  color: var(--ped-text-dim);
  font-size: 0.82rem;
  cursor: pointer;
}
.ped-tab-aktiv {
  background: var(--ped-akzent-weich);
  border-color: var(--ped-akzent);
  color: var(--ped-akzent);
  font-weight: 600;
}
.ped-global-fehler {
  margin: 0 0 1rem;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  background: var(--ped-fehler-weich);
  color: var(--ped-fehler);
  font-size: 0.82rem;
}
.ped-spalten {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(18rem, 1fr);
  gap: 1rem;
  align-items: start;
}
.ped-spalte-breit { min-width: 0; }
.ped-stapel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
@media (max-width: 56rem) {
  .ped-spalten { grid-template-columns: 1fr; }
}
</style>
