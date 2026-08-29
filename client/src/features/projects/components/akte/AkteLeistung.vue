<template>
  <div class="prj-leistung">
    <ProjektKarte titel="Leistungsstand" icon="leistung">
      <template #aktionen>
        <button v-if="!akte.abschnitte.length" type="button" class="prj-knopf prj-knopf-primaer" @click="vorlage = true">
          <ProjektIcon name="leistung" :size="13" /> Aus Leistungsbild
        </button>
      </template>
      <FortschrittLeiste :abschnitte="akte.abschnitte" :abgerechnet-cent="akte.geld?.gestellt_netto_cent ?? null" :bezahlt-cent="akte.geld?.bezahlt_netto_cent ?? null" />
      <dl class="prj-kennwerte">
        <div><dt>Beauftragt (netto)</dt><dd>{{ centAlsEuro(f.honorar_beauftragt_cent) }}</dd></div>
        <div><dt>Leistung (netto)</dt><dd>{{ centAlsEuro(f.leistung_cent) }}</dd></div>
        <div><dt>Fortschritt</dt><dd>{{ f.prozent }} %</dd></div>
        <div v-if="f.honorar_gesamt_cent !== f.honorar_beauftragt_cent"><dt>Nicht beauftragt</dt><dd>{{ centAlsEuro(f.honorar_gesamt_cent - f.honorar_beauftragt_cent) }}</dd></div>
      </dl>
    </ProjektKarte>

    <ProjektKarte titel="Abschnitte" icon="akte">
      <LeerHinweis v-if="!akte.abschnitte.length" text="Noch keine Abschnitte. Entweder aus einem HOAI-Leistungsbild anlegen oder unten frei erfassen." />
      <div v-else class="prj-tabelle-huelle">
        <table class="prj-tabelle">
          <thead><tr><th>#</th><th>Abschnitt</th><th class="prj-rechts">Honorar</th><th>beauftr.</th><th>Fortschritt</th><th>Status</th><th></th></tr></thead>
          <tbody>
            <AbschnittZeile
              v-for="a in akte.abschnitte"
              :key="a.id"
              :abschnitt="a"
              @aendern="(f) => store.abschnittAendern(akte.id, a.id, f)"
              @loeschen="store.abschnittLoeschen(akte.id, a.id)"
            />
          </tbody>
        </table>
      </div>
      <AbschnittNeuForm class="prj-neu-form" @anlegen="(f) => store.abschnittAnlegen(akte.id, f)" />
    </ProjektKarte>

    <HonorarHistorie :historie="akte.honorar_historie" />

    <VorlageDialog
      v-if="vorlage"
      :bilder="store.leistungsbilder"
      :vorauswahl="akte.leistungsbild || '43'"
      @schliessen="vorlage = false"
      @anwenden="anwenden"
    />
  </div>
</template>

<script setup>
// AkteLeistung — Tab „Leistung": Balken, Kennwerte, Abschnitte, Historie.
import { computed, onMounted, ref } from 'vue';
import { centAlsEuro } from '@/features/kleiner-pedant/services/Geld';
import AbschnittNeuForm from './AbschnittNeuForm.vue';
import AbschnittZeile from './AbschnittZeile.vue';
import HonorarHistorie from './HonorarHistorie.vue';
import VorlageDialog from './VorlageDialog.vue';
import FortschrittLeiste from '../ui/FortschrittLeiste.vue';
import LeerHinweis from '../ui/LeerHinweis.vue';
import ProjektIcon from '../ui/ProjektIcon.vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();
const vorlage = ref(false);
const f = computed(() => props.akte.fortschritt || { honorar_gesamt_cent: 0, honorar_beauftragt_cent: 0, leistung_cent: 0, prozent: 0 });

async function anwenden(felder) {
  const neu = await store.vorlageAnwenden(props.akte.id, felder);
  if (neu) vorlage.value = false;
}

onMounted(() => store.ladeLeistungsbilder());
</script>

<style scoped>
.prj-leistung { display: flex; flex-direction: column; gap: 1rem; }
.prj-kennwerte { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.6rem; margin: 0.9rem 0 0; }
.prj-kennwerte dt { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); }
.prj-kennwerte dd { margin: 0; font-size: 1.05rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.prj-tabelle-huelle { overflow-x: auto; }
.prj-tabelle { width: 100%; border-collapse: collapse; }
.prj-tabelle th { text-align: left; padding: 0.4rem 0.5rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--prj-text-dim); border-bottom: 1px solid var(--prj-rand-stark); }
.prj-rechts { text-align: right; }
.prj-neu-form { margin-top: 0.8rem; }
</style>
