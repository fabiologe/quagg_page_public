<template>
  <InternLayout>
    <div class="prj-root prj-portfolio-seite">
      <header class="prj-seitenkopf">
        <h1><ProjektIcon name="projekte" :size="20" /> Projekte</h1>
        <div class="prj-seitenkopf-aktionen">
          <button type="button" class="prj-knopf" :disabled="store.laedt" @click="store.ladePortfolio()">
            <ProjektIcon name="aktualisieren" :size="14" /> Aktualisieren
          </button>
          <button type="button" class="prj-knopf prj-knopf-primaer" @click="dialog = { ordner: null }">
            <ProjektIcon name="plus" :size="14" /> Neues Projekt
          </button>
        </div>
      </header>

      <p v-if="store.fehler" class="prj-fehler">{{ store.fehler }}</p>
      <TimerLeiste />

      <KennzahlenLeiste :kennzahlen="store.kennzahlen" :aktiv="filter" @filter="filter = $event" />

      <div class="prj-portfolio-spalten">
        <PortfolioListe :projekte="store.projekte" :filter="filter" class="prj-spalte-breit" />
        <div class="prj-spalte-schmal prj-stapel">
          <AbgleichKarte :abgleich="store.abgleich" @uebernehmen="(o) => (dialog = { ordner: o })" />
          <WochenKarte />
        </div>
      </div>

      <ProjektAnlegenDialog
        v-if="dialog"
        :ordner="dialog.ordner"
        @schliessen="dialog = null"
        @anlegen="anlegen"
        @uebernehmen="uebernehmen"
      />
    </div>
  </InternLayout>
</template>

<script setup>
// ProjectsView — das Portfolio: echte Kennzahlen, Kacheln, Abgleich-Karte.
// Fachlogik im Store, Inhalte in features/projects/components/portfolio.
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import InternLayout from '@/components/layout/InternLayout.vue';
import AbgleichKarte from '@/features/projects/components/portfolio/AbgleichKarte.vue';
import KennzahlenLeiste from '@/features/projects/components/portfolio/KennzahlenLeiste.vue';
import PortfolioListe from '@/features/projects/components/portfolio/PortfolioListe.vue';
import ProjektAnlegenDialog from '@/features/projects/components/portfolio/ProjektAnlegenDialog.vue';
import WochenKarte from '@/features/projects/components/portfolio/WochenKarte.vue';
import TimerLeiste from '@/features/projects/components/ui/TimerLeiste.vue';
import ProjektIcon from '@/features/projects/components/ui/ProjektIcon.vue';
import { useProjekteStore } from '@/features/projects/stores/useProjekteStore';
import '@/features/projects/styles/theme.css';

const store = useProjekteStore();
const router = useRouter();
const filter = ref('alle');
const dialog = ref(null);

async function anlegen(felder) {
  const neu = await store.legeAn(felder);
  if (neu) {
    dialog.value = null;
    router.push(`/intern/projects/${neu.id}`);
  }
}

async function uebernehmen(id, felder) {
  const neu = await store.uebernimm(id, felder);
  if (neu) dialog.value = null;
}

onMounted(() => store.ladePortfolio());
</script>

<style scoped>
.prj-portfolio-seite { display: flex; flex-direction: column; gap: 1rem; max-width: 1200px; margin: 0 auto; }
.prj-seitenkopf { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.prj-seitenkopf h1 { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1.4rem; }
.prj-seitenkopf-aktionen { display: flex; gap: 0.5rem; }
.prj-stapel { display: flex; flex-direction: column; gap: 1rem; }
.prj-portfolio-spalten {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(16rem, 1fr);
  gap: 1rem;
  align-items: start;
}
@media (max-width: 60rem) { .prj-portfolio-spalten { grid-template-columns: minmax(0, 1fr); } }
</style>
