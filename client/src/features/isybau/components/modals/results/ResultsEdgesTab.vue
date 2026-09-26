<template>
  <div class="tab-pane">

     <!-- SPECIAL: Pumps Summary -->
     <div v-if="systemStats?.pumpingSummary?.length > 0" class="panel mb-4">
         <h3><img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Flash--Streamline-Pixel.svg" alt="" /> Pumpwerke</h3>
          <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nutzung (%)</th>
                        <th>Starts</th>
                        <th>Max. Fluss (l/s)</th>
                        <th>Fördervolumen (m³)</th>
                        <th>Energie (kWh)</th>
                    </tr>
                </thead>
                <tbody>
                     <tr v-for="pump in systemStats.pumpingSummary" :key="pump.id" class="clickable-row" @click="selectEdge(pump.id)">
                        <td>{{ pump.id }}</td>
                        <td>{{ fmtZahl(pump.percentUtilized, 1) }} %</td>
                        <td>{{ pump.startUps }}</td>
                        <td>{{ fmtZahl(pump.maxFlow * 1000, 1) }}</td>
                        <td>{{ fmtZahl(pump.totalVol * 1000, 0) }}</td>
                        <td>{{ fmtZahl(pump.totalEnergy, 2) }}</td>
                     </tr>
                </tbody>
          </table>
    </div>

    <div class="toolbar">
        <input v-model="searchQuery" placeholder="Suche Haltung..." class="search-input" />
        <div class="filters">
            <label><input type="checkbox" v-model="filterSurcharged" /> Nur überlastet/eingestaut</label>
        </div>
    </div>

    <div class="table-scroll">
        <table class="data-table sticky-header">
            <thead>
                <tr>
                    <th class="sortable" @click="sortKey='id'">ID</th>
                    <th>Typ</th>
                    <th class="sortable" @click="sortKey='maxFlow'" title="Max. Durchfluss (Betrag)">Max. Durchfluss (l/s)</th>
                    <th class="sortable" @click="sortKey='capacity'" title="Vollfüllungsabfluss aus dem Rechenkern">Qvoll (l/s)</th>
                    <th class="sortable" @click="sortKey='ratio'" title="Auslastung: max. Abfluss / Vollfüllungsabfluss">Max. Q/Qvoll</th>
                    <th class="sortable" @click="sortKey='depth'" title="Max. Füllungsgrad">Max. h/hvoll</th>
                    <th class="sortable" @click="sortKey='maxVelocity'" title="Max. Fließgeschwindigkeit (Betrag)">Max. v (m/s)</th>
                    <th>t_max</th>
                    <th>Status</th>
                    <th>Aktion</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="edge in filteredEdges" :key="edge.id" :class="{'row-danger': edge.zustand.status === 'überlastet', 'row-warning': edge.zustand.status === 'eingestaut'}">
                    <td>{{ edge.id }}</td>
                    <td>{{ edgeTypeLabel(edge.type) }}</td>
                    <td>{{ edge.maxFlow?.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1}) }}</td>
                    <td>
                        <span v-if="edge.type === 'PUMP'" class="na-hint" title="SWMM meldet für Pumpen kein Qvoll">n/a</span>
                        <template v-else>{{ edge.capacity?.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1}) }}</template>
                    </td>
                    <td>
                        <span v-if="['WEIR', 'ORIFICE'].includes(edge.type)" class="na-hint" title="SWMM meldet für Wehre/Drosseln kein Q/Qvoll, nur den Durchfluss">n/a</span>
                        <span v-else :class="getRatioClass(edge.zustand.auslastung / 100)">
                            {{ fmtZahl(edge.zustand.auslastung == null ? null : edge.zustand.auslastung / 100, 2) }}
                        </span>
                    </td>
                    <td>{{ edge.depthRatio == null ? '–' : fmtZahl(edge.depthRatio * 100, 0) + ' %' }}</td>
                    <td>
                        <span v-if="['PUMP', 'WEIR', 'ORIFICE'].includes(edge.type)" class="na-hint" title="SWMM meldet für Pumpen/Wehre/Drosseln keine Fließgeschwindigkeit">n/a</span>
                        <template v-else>{{ edge.maxVelocity?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}</template>
                    </td>
                    <td>{{ edge.timeOfMaxFlow }}</td>
                    <td>
                        <!-- Q/Qvoll > 1 → überlastet; sonst h/hvoll ≥ 0,99 → eingestaut (typPalette.haltungsZustand) -->
                        <span v-if="edge.zustand.status === 'überlastet'" class="badge badge-red">Überlastet</span>
                        <span v-else-if="edge.zustand.status === 'eingestaut'" class="badge badge-orange">Eingestaut</span>
                        <span v-else-if="edge.zustand.status === '> 90 %'" class="badge badge-orange">&gt; 90 % Qvoll</span>
                        <span v-else-if="edge.zustand.status === '–'" class="na-hint">–</span>
                        <span v-else class="badge badge-green">OK</span>
                    </td>
                    <td>
                        <button class="btn-icon" @click="selectEdge(edge.id)">Details</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- Detail Panel Overlay for Edges -->
     <div v-if="selectedEdgeId" class="detail-overlay">
        <div class="detail-card">
            <div class="detail-header">
                <h3>Haltung {{ selectedEdgeId }}</h3>
                <button title="Detailansicht schließen" aria-label="Detailansicht schließen" @click="selectedEdgeId = null" class="detail-close-btn">✕</button>
            </div>
            <div class="detail-body">
                 <div class="engineer-inspector">
                    <div class="col">
                        <strong>Hydraulik</strong>
                        <div>Max. Durchfluss: {{ selectedEdge?.maxFlow?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }} l/s</div>
                        <div>Max. Fließgeschwindigkeit: {{ selectedEdge?.maxVelocity?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }} m/s</div>
                        <div>Zeitpunkt Max.: <strong>{{ selectedEdge?.timeOfMaxFlow || '-' }}</strong></div>
                        <div>Strömungsart: {{ getFlowClass(selectedEdgeId) }}</div>
                    </div>
                    <div class="col">
                        <strong>Qvoll & Auslastung</strong>
                        <div>Qvoll: {{ fmtZahl(selectedEdge?.capacity, 1) }} l/s</div>
                        <div>Max. Q/Qvoll: {{ fmtZahl(selectedZustand.auslastung == null ? null : selectedZustand.auslastung / 100, 2) }}</div>
                        <div>Max. h/hvoll: {{ selectedEdge?.depthRatio?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</div>
                        <div v-if="selectedZustand.status === 'überlastet'" class="text-red">
                            <img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Alert-Triangle-1--Streamline-Pixel.svg" alt="" /> System unter Druck
                        </div>
                    </div>
                 </div>
                 <div class="engineer-inspector" v-if="selectedPumpSummary">
                    <div class="col">
                        <strong><img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Flash--Streamline-Pixel.svg" alt="" /> Pumpwerk-Betrieb</strong>
                        <div>Nutzung: {{ fmtZahl(selectedPumpSummary.percentUtilized, 1) }} %</div>
                        <div>Starts: {{ selectedPumpSummary.startUps }}</div>
                        <div>Min./Mittl. Fluss: {{ fmtZahl(selectedPumpSummary.minFlow * 1000, 1) }} / {{ fmtZahl(selectedPumpSummary.avgFlow * 1000, 1) }} l/s</div>
                    </div>
                    <div class="col">
                        <strong>Energie</strong>
                        <div>Energieverbrauch: {{ fmtZahl(selectedPumpSummary.totalEnergy, 2) }} kWh</div>
                        <!-- SWMM: 10^6 Liter = 1000 m³ (vorher 1000× zu klein) -->
                        <div>Fördervolumen: {{ fmtZahl(selectedPumpSummary.totalVol * 1000, 0) }} m³</div>
                        <div v-if="(selectedPumpSummary.pctTimeOffCurveLow || 0) + (selectedPumpSummary.pctTimeOffCurveHigh || 0) > 5" class="text-red">
                            <img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Alert-Triangle-1--Streamline-Pixel.svg" alt="" /> {{ fmtZahl(selectedPumpSummary.pctTimeOffCurveLow + selectedPumpSummary.pctTimeOffCurveHigh, 1) }} % der Zeit außerhalb der Kennlinie
                        </div>
                    </div>
                 </div>
                 <div class="surcharge-info" v-if="selectedEdge?.surcharge">
                     <strong>Einstau-Diagnose</strong>
                     <ul>
                         <li>Dauer Vollfüllung (beidseitig): {{ dauerH(selectedEdge?.surcharge?.hoursFullBoth) }} h</li>
                         <li>Dauer Vollfüllung (oben): {{ dauerH(selectedEdge?.surcharge?.hoursFullUp) }} h</li>
                         <li>Dauer Vollfüllung (unten): {{ dauerH(selectedEdge?.surcharge?.hoursFullDown) }} h</li>
                         <li>Dauer über Vollfüllung: {{ dauerH(selectedEdge?.surcharge?.hoursAboveFull) }} h</li>
                     </ul>
                 </div>
                 <div class="chart-box">
                     <Line v-if="chartData" :data="chartData" :options="chartOptions" />
                     <div v-else class="loading-chart">Lade Diagramm...</div>
                 </div>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { DIAGRAMM } from '../../../utils/typPalette.js';
import { Line, safeGet, formatTime, edgeTypeLabel, getRatioClass, chartOptions, fmtZahl } from './resultsShared.js';
import { haltungsZustand, SWMM_DAUER_UNTERGRENZE_H } from '../../../utils/typPalette.js';

const props = defineProps({
  edges: { type: Map,    default: () => new Map() },
  edgeResults: { type: Map,    default: () => new Map() },
  systemStats: { type: Object, default: () => ({}) },
  timeSeries: { type: Array,  default: () => [] },
  // Sprungziel aus dem Knoten→Link-Verweis (Schächte-Tab, Pumpe/Wehr/.../Bauwerk)
  focusEdgeId: { type: String, default: null },
});

const searchQuery = ref('');
const filterSurcharged = ref(false);
const sortKey = ref('id');
const selectedEdgeId = ref(null);
const chartData = ref(null);

const selectedEdge = computed(() => selectedEdgeId.value ? safeGet(props.edgeResults, selectedEdgeId.value) : null);
const selectedZustand = computed(() => haltungsZustand(selectedEdge.value));
// SWMM druckt Dauern mindestens als 0,01 h (Untergrenze, typPalette.SWMM_DAUER_UNTERGRENZE_H)
const dauerH = (v) => (v != null && v <= SWMM_DAUER_UNTERGRENZE_H ? '< 0,01' : fmtZahl(v, 2));
const selectedPumpSummary = computed(() =>
    props.systemStats?.pumpingSummary?.find(p => p.id === selectedEdgeId.value) || null
);

const filteredEdges = computed(() => {
     if (!props.edges || !props.edgeResults) return [];
     let list = Array.from(props.edges.values()).map(e => {
         const res = safeGet(props.edgeResults, e.id) || {};
         return { ...e, ...res, zustand: haltungsZustand(safeGet(props.edgeResults, e.id)) }; // Geometrie + Ergebnis
     });

     if (searchQuery.value) {
         const q = searchQuery.value.toLowerCase();
         list = list.filter(e => e.id.toLowerCase().includes(q));
     }
     if (filterSurcharged.value) {
         list = list.filter(e => ['überlastet', 'eingestaut'].includes(e.zustand.status));
     }

     list.sort((a, b) => {
         if (sortKey.value === 'maxFlow') return (b.maxFlow || 0) - (a.maxFlow || 0);
         if (sortKey.value === 'capacity') return (b.capacity || 0) - (a.capacity || 0);
         if (sortKey.value === 'ratio') return (b.zustand.auslastung || 0) - (a.zustand.auslastung || 0);
         if (sortKey.value === 'depth') return (b.depthRatio || 0) - (a.depthRatio || 0);
         if (sortKey.value === 'maxVelocity') return (b.maxVelocity || 0) - (a.maxVelocity || 0);
         return a.id.localeCompare(b.id);
     });

     return list;
});

const getFlowClass = (id) => {
    const cls = props.systemStats?.flowClassification?.find(c => c.id === id);
    if (!cls) return 'N.V.';
    if (cls.fractions.supCrit > 0.1) return 'Überkritisch';
    if (cls.fractions.normLtd > 0.1) return 'Normal-Limitiert';
    return 'Unterkritisch';
};

const selectEdge = (id) => {
    selectedEdgeId.value = id;
    updateChart(id);
};

// Sprungziel aus dem Knoten→Link-Verweis (Schächte-Tab) — watch() erst NACH
// selectEdge()-Deklaration, da `const` (anders als `function`) nicht gehoistet
// wird und die Watch-Callback mit {immediate:true} sofort beim Setup läuft.
watch(() => props.focusEdgeId, (id) => {
    if (id) selectEdge(id);
}, { immediate: true });

const updateChart = (id) => {
    if (!props.timeSeries || props.timeSeries.length === 0) {
        chartData.value = null;
        return;
    }
    const labels = props.timeSeries.map(step => formatTime(step.time));
    chartData.value = {
        labels,
        datasets: [
            {
                label: 'Abfluss (L/s)',
                borderColor: DIAGRAMM.abfluss,
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                data: props.timeSeries.map(step => step.edges[id]?.q || 0),
                fill: true
            },
            {
                label: 'Qvoll (l/s)',
                borderColor: DIAGRAMM.kapazitaet,
                borderDash: [5, 5],
                data: props.timeSeries.map(() => safeGet(props.edgeResults, id)?.capacity || 0)
            }
        ]
    };
};
</script>

<style scoped src="./results-shared.css"></style>
