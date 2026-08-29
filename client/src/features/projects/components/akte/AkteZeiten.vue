<template>
  <div class="prj-zeiten">
    <div class="prj-zeiten-spalten">
      <div class="prj-spalte">
        <TimerKarte :akte="akte" />
        <ProjektKarte titel="Zeit buchen" icon="plus">
          <ZeitBuchenForm :abschnitte="akte.abschnitte || []" @buchen="(f) => store.zeitBuchen(akte.id, f)" />
        </ProjektKarte>
        <ZeitenListe
          :buchungen="store.zeiten?.buchungen || []"
          :abschnitt-namen="abschnittNamen"
          @aendern="(bid, f) => store.zeitAendern(akte.id, bid, f)"
          @loeschen="(bid) => store.zeitLoeschen(akte.id, bid)"
          @export="exportieren"
        />
      </div>
      <div class="prj-spalte">
        <ZeitAuswertung :akte="akte" :summen="store.zeiten?.summen" :abschnitt-namen="abschnittNamen" />
        <StundenRechnungKarte :akte="akte" />
      </div>
    </div>
  </div>
</template>

<script setup>
// AkteZeiten — Tab „Zeiten": Timer, Buchen, Liste, Auswertung, Stundennachweis, Rechnung aus Stunden.
import { computed, onMounted, watch } from 'vue';
import ProjektKarte from '../ui/ProjektKarte.vue';
import StundenRechnungKarte from './StundenRechnungKarte.vue';
import TimerKarte from './TimerKarte.vue';
import ZeitAuswertung from './ZeitAuswertung.vue';
import ZeitBuchenForm from './ZeitBuchenForm.vue';
import ZeitenListe from './ZeitenListe.vue';
import { alsCsv, nachweisZeilen } from '../../services/Zeit';
import { useProjekteStore } from '../../stores/useProjekteStore';

const props = defineProps({ akte: { type: Object, required: true } });
const store = useProjekteStore();

const abschnittNamen = computed(() => Object.fromEntries((props.akte.abschnitte || []).map((a) => [a.id, a.bezeichnung])));

async function exportieren(format) {
  const zeilen = nachweisZeilen(store.zeiten?.buchungen || [], abschnittNamen.value);
  const name = `Stundennachweis_P${props.akte.id}`;
  if (format === 'csv') {
    herunterladen(new Blob([`﻿${alsCsv(zeilen)}`], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
    return;
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(zeilen), 'Stundennachweis');
  const puffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  herunterladen(new Blob([puffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
}

function herunterladen(blob, dateiname) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

onMounted(() => store.ladeZeiten(props.akte.id));
watch(() => props.akte.id, (id) => store.ladeZeiten(id));
</script>

<style scoped>
.prj-zeiten-spalten { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 1rem; }
.prj-spalte { display: flex; flex-direction: column; gap: 1rem; }
@media (max-width: 60rem) { .prj-zeiten-spalten { grid-template-columns: minmax(0, 1fr); } }
</style>
