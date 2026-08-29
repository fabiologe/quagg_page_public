<template>
  <PedantKarte titel="Zeitliche Verteilung" icon="diagramm">
    <template #aktionen>
      <div class="ped-ansicht-wahl" role="group" aria-label="Darstellung">
        <button
          type="button" class="ped-wahl"
          :class="{ 'ped-wahl-aktiv': ansicht === 'diagramm' }"
          @click="ansicht = 'diagramm'"
        >
          <PedantIcon name="diagramm" :size="13" /> Diagramm
        </button>
        <button
          type="button" class="ped-wahl"
          :class="{ 'ped-wahl-aktiv': ansicht === 'tabelle' }"
          @click="ansicht = 'tabelle'"
        >
          <PedantIcon name="tabelle" :size="13" /> Tabelle
        </button>
      </div>
    </template>

    <div v-if="ansicht === 'diagramm'" class="ped-chart">
      <Bar :data="chartDaten" :options="chartOptionen" />
    </div>

    <PedantTabelle
      v-else
      :spalten="SPALTEN"
      :leer="reihe.length === 0"
      leer-text="Noch keine Daten"
    >
      <tr v-for="zeile in reihe" :key="zeile.monat">
        <td class="ped-monat">{{ monatsName(zeile.monat) }}</td>
        <td class="ped-zahl"><GeldBetrag :cent="zeile.bezahlt_cent" /></td>
        <td class="ped-zahl"><GeldBetrag :cent="zeile.offen_cent" /></td>
        <td class="ped-zahl"><GeldBetrag :cent="zeile.kommend_cent" /></td>
      </tr>
    </PedantTabelle>
  </PedantKarte>
</template>

<script setup>
// MonatsBalken — die einfache Timeline aus FAHRPLAN Phase 4: gruppierte
// Monatsbalken der drei Ebenen (bezahlt/offen/kommend) mit validierter
// Palette (dataviz), Legende, Hover-Tooltips und Tabellen-Ansicht.
// Die volle 5-Zoomstufen-Timeline ist bewusst Phase 7.
import {
  BarElement, CategoryScale, Chart, Legend, LinearScale, Tooltip,
} from 'chart.js';
import { computed, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import GeldBetrag from '../ui/GeldBetrag.vue';
import PedantIcon from '../ui/PedantIcon.vue';
import PedantKarte from '../ui/PedantKarte.vue';
import PedantTabelle from '../ui/PedantTabelle.vue';

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const props = defineProps({
  reihe: { type: Array, required: true },  // [{monat, bezahlt_cent, offen_cent, kommend_cent}]
});

const SPALTEN = [
  { key: 'monat', titel: 'Monat' },
  { key: 'bezahlt', titel: 'Bezahlt', zahl: true },
  { key: 'offen', titel: 'Offen', zahl: true },
  { key: 'kommend', titel: 'Kommend', zahl: true },
];

const ansicht = ref('diagramm');

function token(name, fallback) {
  if (typeof getComputedStyle !== 'function') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const EURO = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});

function monatsName(monat) {
  const [jahr, nummer] = monat.split('-').map(Number);
  return new Date(jahr, nummer - 1, 1)
    .toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

const chartDaten = computed(() => ({
  labels: props.reihe.map((zeile) => monatsName(zeile.monat)),
  datasets: [
    { label: 'Bezahlt', data: props.reihe.map((zeile) => zeile.bezahlt_cent / 100),
      backgroundColor: token('--ped-chart-bezahlt', '#1baf7a') },
    { label: 'Offen', data: props.reihe.map((zeile) => zeile.offen_cent / 100),
      backgroundColor: token('--ped-chart-offen', '#eb6834') },
    { label: 'Kommend', data: props.reihe.map((zeile) => zeile.kommend_cent / 100),
      backgroundColor: token('--ped-chart-kommend', '#2a78d6') },
  ].map((datensatz) => ({
    ...datensatz,
    borderWidth: 0,
    borderRadius: 4,             // gerundetes Datenende …
    borderSkipped: 'start',      // … Basislinie bleibt eckig verankert
    maxBarThickness: 22,
    categoryPercentage: 0.72,
    barPercentage: 0.9,
  })),
}));

const chartOptionen = computed(() => {
  const textDim = token('--ped-text-dim', '#6b7280');
  const rand = token('--ped-rand', '#dcd9d2');
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: textDim, usePointStyle: true, boxWidth: 8, boxHeight: 8 },
      },
      tooltip: {
        callbacks: {
          label: (kontext) => `${kontext.dataset.label}: ${EURO.format(kontext.raw)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: textDim } },
      y: {
        beginAtZero: true,
        grid: { color: rand },
        border: { display: false },
        ticks: { color: textDim, callback: (wert) => EURO.format(wert) },
      },
    },
  };
});
</script>

<style scoped>
.ped-chart {
  height: 260px;
}
.ped-ansicht-wahl {
  display: inline-flex;
  border: 1px solid var(--ped-rand);
  border-radius: 6px;
  overflow: hidden;
}
.ped-wahl {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.55rem;
  border: none;
  background: var(--ped-flaeche);
  color: var(--ped-text-dim);
  font-size: 0.74rem;
  cursor: pointer;
}
.ped-wahl-aktiv {
  background: var(--ped-akzent-weich);
  color: var(--ped-akzent);
  font-weight: 600;
}
.ped-monat {
  white-space: nowrap;
}
.ped-zahl {
  text-align: right;
}
</style>
