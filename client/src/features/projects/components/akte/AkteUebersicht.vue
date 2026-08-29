<template>
  <div class="prj-uebersicht">
    <div class="prj-spalte">
      <VorschlaegeKarte :vorschlaege="akte.vorschlaege || []" @entscheiden="(vid, e) => store.vorschlagEntscheiden(akte.id, vid, e)" />
      <ProjektKarte titel="Leistungsstand" icon="leistung">
        <FortschrittLeiste :abschnitte="akte.abschnitte || []" :abgerechnet-cent="akte.geld?.gestellt_netto_cent ?? null" :bezahlt-cent="akte.geld?.bezahlt_netto_cent ?? null" />
        <p class="prj-stand">
          Leistung <strong>{{ akte.fortschritt?.prozent ?? 0 }} %</strong>
          · {{ centAlsEuro(akte.fortschritt?.leistung_cent ?? 0) }} von {{ centAlsEuro(akte.fortschritt?.honorar_beauftragt_cent ?? 0) }} netto
        </p>
      </ProjektKarte>
      <StammdatenFormular :akte="akte" @speichern="(f) => store.aendere(akte.id, f)" />
      <BeteiligteListe
        :beteiligte="akte.beteiligte"
        @anlegen="(f) => store.beteiligterAnlegen(akte.id, f)"
        @loeschen="(bid) => store.beteiligterLoeschen(akte.id, bid)"
      />
    </div>
    <div class="prj-spalte">
      <FreigabenKarte :akte="akte" />
      <MeilensteinListe
        :meilensteine="akte.meilensteine"
        @anlegen="(f) => store.meilensteinAnlegen(akte.id, f)"
        @erledigen="(mid) => store.meilensteinAendern(akte.id, mid, { erledigt_am: heute() })"
        @loeschen="(mid) => store.meilensteinLoeschen(akte.id, mid)"
      />
    </div>
  </div>
</template>

<script setup>
// AkteUebersicht — Tab „Übersicht": Leistungsstand, Stammdaten, Beteiligte, Termine.
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import BeteiligteListe from './BeteiligteListe.vue';
import FreigabenKarte from './FreigabenKarte.vue';
import MeilensteinListe from './MeilensteinListe.vue';
import StammdatenFormular from './StammdatenFormular.vue';
import VorschlaegeKarte from './VorschlaegeKarte.vue';
import FortschrittLeiste from '../ui/FortschrittLeiste.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { useProjekteStore } from '../../stores/useProjekteStore';

defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();

function heute() {
  return new Date().toISOString().slice(0, 10);
}
</script>

<style scoped>
.prj-uebersicht {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 1rem;
}
.prj-spalte { display: flex; flex-direction: column; gap: 1rem; }
.prj-stand { margin: 0.6rem 0 0; font-size: 0.85rem; color: var(--prj-text-dim); }
@media (max-width: 60rem) { .prj-uebersicht { grid-template-columns: minmax(0, 1fr); } }
</style>
