<template>
  <div class="tab-pane">
      <div class="table-scroll">
        <table class="data-table sticky-header">
            <thead>
                <tr>
                    <th>Teilfläche ID</th>
                    <th>Fläche (ha)</th>
                    <th title="Fließbreite, wie gerechnet (.inp)">Breite (m)</th>
                    <th title="Geländegefälle, wie gerechnet (.inp) — nicht die Neigungsklasse">Gefälle (%)</th>
                    <th title="Versiegelungsgrad, wie gerechnet (.inp)">Versiegelungsgrad (%)</th>
                    <th title="Abflussbeiwert (Ergebnis)">Abflussbeiwert</th>
                    <th title="Niederschlagshöhe (mm)">Niederschlag (mm)</th>
                    <th title="Zufluss von extern (mm)">Zufluss extern (mm)</th>
                    <th title="Verdunstung (mm)">Verdunstung (mm)</th>
                    <th title="Infiltration (mm)">Infiltration (mm)</th>
                    <th title="Abfluss Versiegelt (mm)">Abfluss Vers. (mm)</th>
                    <th title="Abfluss Unversiegelt (mm)">Abfluss Unvers. (mm)</th>
                    <th title="Gesamtabflusshöhe (mm)">Gesamtabflusshöhe (mm)</th>
                    <th title="Abflussvolumen = Abflusshöhe × Fläche">Volumen (m³)</th>
                    <th title="Spitzenabfluss aus der Ganglinie (.out)">Spitzenabfluss (l/s)</th>
                    <th>Aktion</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="sub in sortedSubcatchments" :key="sub.id">
                    <td>{{ sub.id }}</td>
                    <td>{{ sub.size?.toLocaleString('de-DE', {minimumFractionDigits: 4}) }}</td>
                    <td>{{ (sub.inputWidth || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.inputSlope || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.inputImperv || 0).toLocaleString('de-DE', {minimumFractionDigits: 1}) }}</td>
                    <td>{{ (sub.runoffCoeff || 0).toLocaleString('de-DE', {minimumFractionDigits: 3}) }}</td>
                    <td>{{ (sub.precip || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.totalRunon || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.totalEvap || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.totalInfil || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.impervRunoffMm || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.pervRunoffMm || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ (sub.totalRunoffMm || 0).toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</td>
                    <td>{{ fmtZahl(sub.volumenM3, 1) }}</td>
                    <td><strong>{{ fmtZahl(sub.spitzeLs, 1) }}</strong></td>
                    <td>
                        <button class="btn-icon" @click="selectArea(sub.id)">Details</button>
                    </td>
                </tr>
            </tbody>
        </table>
      </div>

    <!-- Detail Panel Overlay for Areas -->
    <div v-if="selectedAreaId" class="detail-overlay">
        <div class="detail-card">
            <div class="detail-header">
                <h3>Fläche {{ selectedAreaId }}</h3>
                <button title="Detailansicht schließen" aria-label="Detailansicht schließen" @click="selectedAreaId = null" class="detail-close-btn">✕</button>
            </div>
            <div class="detail-body">
                 <Line v-if="areaChartData" :data="areaChartData" :options="chartOptions" />
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { DIAGRAMM } from '../../../utils/typPalette.js';
import { Line, formatTime, chartOptions, fmtZahl } from './resultsShared.js';
import { parseInpSubcatchments } from '../../../utils/resultsExport.js';
import { spitzeAusGanglinie, faktorZuLs } from '../../../utils/swmm/niederschlagsBilanz.js';

const props = defineProps({
  areas: [Map, Array],
  areaResults: { type: Map,    default: () => new Map() },
  systemStats: { type: Object, default: () => ({}) },
  timeSeries: { type: Array,  default: () => [] },
  inp: { type: String, default: '' }, // Eingabedatei des Laufs: Fläche/Breite/Gefälle wie gerechnet
});

const selectedAreaId = ref(null);
const areaChartData = ref(null);

const ausInp = computed(() => new Map(parseInpSubcatchments(props.inp).map(t => [t.name, t])));

const zuLs = () => faktorZuLs(props.systemStats);
const spitze = (id) => spitzeAusGanglinie(props.timeSeries, id, zuLs());

// Subcatchments: Ergebnisse (inkl. _2-Splits) mit Eingangs-Geometrie anreichern
const sortedSubcatchments = computed(() => {
     const results = props.areaResults;
     const ausInp_ = ausInp.value;

     if (!results) return [];
     if (results instanceof Map && results.size === 0) return [];
     if (!(results instanceof Map) && Object.keys(results).length === 0) return [];

     let entries = [];
     if (results instanceof Map) {
         entries = Array.from(results.entries());
     } else {
         entries = Object.entries(results);
     }

     const findParent = (baseId) => {
         if (props.areas instanceof Map) return props.areas.get(baseId);
         if (Array.isArray(props.areas)) return props.areas.find(a => a.id === baseId);
         return null;
     };

     let list = entries.map(([id, data]) => {
         // 1. Resolve Parent ID (Split-Flächen enden auf _2)
         let baseId = id;
         const isPart2 = id.endsWith('_2');
         if (isPart2) {
             baseId = baseId.replace(/_2$/, '');
         }

         // 2. Try Find Parent — Exact Match first
         let parentArea = findParent(baseId);

         // 3. Fallback: Strip .1 suffix (e.g. Result "RW34.1" vs Input Area "RW34")
         if (!parentArea && baseId.endsWith('.1')) {
             parentArea = findParent(baseId.substring(0, baseId.length - 2));
         }

         // 4. Calculate Derived Properties
         let sizeVal = 0;
         let inputSlope = 0;
         let inputImperv = 0;
         let inputWidth = 0;

         if (parentArea) {
             const totalSize = parentArea.size || 0;
             inputSlope = parentArea.slope || 0;
             inputImperv = (parentArea.runoffCoeff || 0) * 100;

             let ratio = 1.0;
             if (parentArea.nodeId2) {
                 const userRatio = (parentArea.splitRatio !== undefined) ? parseFloat(parentArea.splitRatio) : 50;
                 ratio = userRatio / 100.0;
             }

             sizeVal = isPart2 ? totalSize * (1 - ratio) : totalSize * ratio;

             // Dynamic Width Calculation (consistent with builder)
             inputWidth = Math.sqrt(sizeVal * 10000);
         }

         // Wie gerechnet (.inp) vor dem Editorstand — der kann sich nach dem Lauf geändert haben,
         // und „Gefälle" war dort die Neigungsklasse (1–5), nicht % (P1.7).
         const gerechnet = ausInp_.get(id);
         if (gerechnet) {
             sizeVal = gerechnet.areaHa;
             inputSlope = gerechnet.slope;
             inputImperv = gerechnet.imperv;
             inputWidth = gerechnet.width;
         }
         // Volumen = Abflusshöhe (mm) × Fläche (ha) × 10 m³ — SWMMs Volumenspalte (10^6 l,
         // zwei Stellen) löst nur 10 m³ auf. Spitze aus der Ganglinie statt aus der
         // zweistelligen CMS-Spalte (Auflösung 10 l/s).
         const volumenM3 = (data.totalRunoffMm ?? 0) * sizeVal * 10;
         const spitzeLs = spitze(id) ?? data.peakRunoff ?? null;
         return { id, size: sizeVal, inputSlope, inputImperv, inputWidth, ...data, volumenM3, spitzeLs };
     });

     list.sort((a, b) => a.id.localeCompare(b.id));
     return list;
});

const selectArea = (id) => {
    selectedAreaId.value = id;
    updateChart(id);
};

const updateChart = (id) => {
    if (!props.timeSeries || props.timeSeries.length === 0) {
        areaChartData.value = null;
        return;
    }
    const labels = props.timeSeries.map(step => formatTime(step.time));
    areaChartData.value = {
        labels,
        datasets: [
            {
                // Abfluss aus der .out-Zeitreihe; Einheit hängt von FLOW_UNITS ab
                label: 'Abfluss (L/s)',
                borderColor: DIAGRAMM.flaechenabfluss,
                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                data: props.timeSeries.map(step => step.subcatchments[id]?.runoff * zuLs() || 0),
                fill: true
            }
        ]
    };
};
</script>

<style scoped src="./results-shared.css"></style>
