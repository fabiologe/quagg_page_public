<template>
  <PedantKarte titel="Steuerberater-Export (DATEV)" icon="herunterladen">
    <div class="ped-export">
      <div class="ped-export-zeitraum">
        <FormFeld name="Von"><input v-model="von" type="date" /></FormFeld>
        <FormFeld name="Bis"><input v-model="bis" type="date" /></FormFeld>
        <div class="ped-export-schnell">
          <button type="button" class="ped-export-chip" @click="letzterMonat">letzter Monat</button>
          <button type="button" class="ped-export-chip" @click="letztesQuartal">letztes Quartal</button>
        </div>
      </div>

      <button class="ped-export-knopf" type="button" :disabled="!gueltig || laedt" @click="pruefe">
        <PedantIcon :name="laedt ? 'laden' : 'checkliste'" :size="14" /> Prüfliste
      </button>

      <template v-if="pruefliste">
        <StatusPille
          :zustand="pruefliste.sauber ? 'ok' : 'warnung'"
          :text="pruefliste.sauber
            ? `sauber — ${pruefliste.anzahl_buchungen} Buchungen im Zeitraum`
            : 'offene Punkte'"
        />
        <ul v-if="pruefliste.befunde.length" class="ped-export-befunde">
          <li v-for="(befund, index) in pruefliste.befunde" :key="index">{{ befund }}</li>
        </ul>
        <div class="ped-export-downloads">
          <button class="ped-export-knopf" type="button" :disabled="laedt" @click="lade('extf')">
            <PedantIcon name="herunterladen" :size="14" /> EXTF-Buchungsstapel
          </button>
          <button class="ped-export-knopf" type="button" :disabled="laedt" @click="lade('belege')">
            <PedantIcon name="beleg" :size="14" /> Belegbilder (ZIP)
          </button>
        </div>
      </template>

      <p v-if="fehler" class="ped-export-fehler">{{ fehler }}</p>
    </div>
  </PedantKarte>
</template>

<script setup>
// ExportKarte — Kap. 9 Pipeline Steuerberater-Export: Zeitraum waehlen,
// Pruefliste (alle Belege verbucht? Bank abgeglichen?), dann die zwei
// Downloads: EXTF-Stapel + Belegbilder-ZIP (referenziert ueber Belegfeld 1).
import { computed, ref } from 'vue';
import PedantApi from '../../services/PedantApi';
import FormFeld from '../ui/FormFeld.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import StatusPille from '../ui/StatusPille.vue';

const heute = new Date();
const von = ref(new Date(heute.getFullYear(), heute.getMonth() - 1, 1)
  .toISOString().slice(0, 10));
const bis = ref(new Date(heute.getFullYear(), heute.getMonth(), 0)
  .toISOString().slice(0, 10));
const pruefliste = ref(null);
const laedt = ref(false);
const fehler = ref('');

const gueltig = computed(() => von.value && bis.value && von.value <= bis.value);

function letzterMonat() {
  von.value = new Date(heute.getFullYear(), heute.getMonth() - 1, 1)
    .toISOString().slice(0, 10);
  bis.value = new Date(heute.getFullYear(), heute.getMonth(), 0)
    .toISOString().slice(0, 10);
}

function letztesQuartal() {
  const quartal = Math.floor(heute.getMonth() / 3);
  von.value = new Date(heute.getFullYear(), (quartal - 1) * 3, 1)
    .toISOString().slice(0, 10);
  bis.value = new Date(heute.getFullYear(), quartal * 3, 0)
    .toISOString().slice(0, 10);
}

async function pruefe() {
  laedt.value = true;
  fehler.value = '';
  try {
    pruefliste.value = await PedantApi.exportPruefliste(von.value, bis.value);
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Prüfliste fehlgeschlagen';
  } finally {
    laedt.value = false;
  }
}

async function lade(art) {
  laedt.value = true;
  fehler.value = '';
  try {
    const blob = art === 'extf'
      ? await PedantApi.exportExtf(von.value, bis.value)
      : await PedantApi.exportBelege(von.value, bis.value);
    const url = URL.createObjectURL(blob);
    const anker = document.createElement('a');
    anker.href = url;
    anker.download = art === 'extf'
      ? `EXTF_Buchungsstapel_${von.value}_${bis.value}.csv`
      : `Belege_${von.value}_${bis.value}.zip`;
    anker.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    fehler.value = error?.response?.data?.detail || 'Download fehlgeschlagen';
  } finally {
    laedt.value = false;
  }
}
</script>

<style scoped>
.ped-export { display: flex; flex-direction: column; gap: 0.6rem; }
.ped-export-zeitraum {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
  align-items: end;
}
.ped-export-schnell { grid-column: 1 / -1; display: flex; gap: 0.35rem; }
.ped-export-chip {
  padding: 0.2rem 0.6rem; border: 1px solid var(--ped-rand);
  border-radius: 999px; background: var(--ped-flaeche);
  color: var(--ped-text-dim); font-size: 0.72rem; cursor: pointer;
}
.ped-export-chip:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-export-knopf {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.75rem; border: 1px solid var(--ped-rand-stark);
  border-radius: 6px; background: var(--ped-flaeche);
  color: var(--ped-text); font-size: 0.8rem; cursor: pointer;
}
.ped-export-knopf:hover { border-color: var(--ped-akzent); color: var(--ped-akzent); }
.ped-export-knopf:disabled { opacity: 0.6; }
.ped-export-downloads { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.ped-export-befunde {
  margin: 0; padding: 0.45rem 0.6rem 0.45rem 1.5rem;
  border-radius: 6px; background: var(--ped-warn-weich);
  color: var(--ped-warn); font-size: 0.78rem;
}
.ped-export-fehler {
  margin: 0; padding: 0.45rem 0.6rem; border-radius: 6px;
  background: var(--ped-fehler-weich); color: var(--ped-fehler); font-size: 0.8rem;
}
</style>
