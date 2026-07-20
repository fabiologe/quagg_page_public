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
                        <th>Max. Fluss (L/s)</th>
                        <th>Energie (kWh)</th>
                    </tr>
                </thead>
                <tbody>
                     <tr v-for="pump in systemStats.pumpingSummary" :key="pump.id" class="clickable-row" @click="selectEdge(pump.id)">
                        <td>{{ pump.id }}</td>
                        <td>{{ pump.percentUtilized?.toFixed(1) }} %</td>
                        <td>{{ pump.startUps }}</td>
                        <td>{{ (pump.maxFlow * 1000).toFixed(1) }}</td>
                        <td>{{ pump.totalEnergy?.toFixed(2) }}</td>
                     </tr>
                </tbody>
          </table>
    </div>

    <div class="toolbar">
        <input v-model="searchQuery" placeholder="Suche Haltung..." class="search-input" />
        <div class="filters">
            <label><input type="checkbox" v-model="filterSurcharged" /> Nur Überlastung</label>
        </div>
    </div>

    <div class="table-scroll">
        <table class="data-table sticky-header">
            <thead>
                <tr>
                    <th @click="sortKey='id'">ID</th>
                    <th>Typ</th>
                    <th @click="sortKey='maxFlow'" title="Max. Durchfluss (Betrag)">Max. Durchfluss (l/s)</th>
                    <th @click="sortKey='capacity'">Kapazität (l/s)</th>
                    <th @click="sortKey='ratio'" title="Max. Auslastungsgrad">Max. Q/Qvoll</th>
                    <th @click="sortKey='depth'" title="Max. Füllungsgrad">Max. h/hvoll</th>
                    <th @click="sortKey='maxVelocity'" title="Max. Fließgeschwindigkeit (Betrag)">Max. v (m/s)</th>
                    <th>t_max</th>
                    <th>Status</th>
                    <th>Aktion</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="edge in filteredEdges" :key="edge.id" :class="{'row-danger': (edge.depthRatio || 0) > 0.9, 'row-warning': (edge.depthRatio || 0) > 0.7 && (edge.depthRatio || 0) <= 0.9}">
                    <td>{{ edge.id }}</td>
                    <td>{{ edgeTypeLabel(edge.type) }}</td>
                    <td>{{ edge.maxFlow?.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1}) }}</td>
                    <td>
                        <span v-if="edge.type === 'PUMP'" class="na-hint" title="SWMM meldet für Pumpen keine Kapazität">n/a</span>
                        <template v-else>{{ edge.capacity?.toLocaleString('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1}) }}</template>
                    </td>
                    <td>
                        <span v-if="['WEIR', 'ORIFICE'].includes(edge.type)" class="na-hint" title="SWMM meldet für Wehre/Drosseln kein Q/Qvoll, nur den Durchfluss">n/a</span>
                        <span v-else :class="getRatioClass(edge.flowCapacityRatio)">
                            {{ edge.flowCapacityRatio?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}
                        </span>
                    </td>
                    <td>{{ edge.utilization?.toFixed(0) }} %</td>
                    <td>
                        <span v-if="['PUMP', 'WEIR', 'ORIFICE'].includes(edge.type)" class="na-hint" title="SWMM meldet für Pumpen/Wehre/Drosseln keine Fließgeschwindigkeit">n/a</span>
                        <template v-else>{{ edge.maxVelocity?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }}</template>
                    </td>
                    <td>{{ edge.timeOfMaxFlow }}</td>
                    <td>
                        <span v-if="(edge.depthRatio || 0) > 0.9" class="badge badge-red">Überlastet</span>
                        <span v-else-if="(edge.depthRatio || 0) > 0.7" class="badge badge-orange">Belastet</span>
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
                <button @click="selectedEdgeId = null" class="detail-close-btn">✕</button>
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
                        <strong>Kapazität & Auslastung</strong>
                        <div>Kapazität: {{ selectedEdge?.capacity?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }} l/s</div>
                        <div>Max. Q/Qvoll: {{ selectedEdge?.flowCapacityRatio?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</div>
                        <div>Max. h/hvoll: {{ selectedEdge?.depthRatio?.toLocaleString('de-DE', {minimumFractionDigits: 2}) }}</div>
                        <div v-if="(selectedEdge?.flowCapacityRatio || 0) > 1.0" class="text-red">
                            <img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Alert-Triangle-1--Streamline-Pixel.svg" alt="" /> System unter Druck
                        </div>
                    </div>
                 </div>
                 <div class="engineer-inspector" v-if="selectedPumpSummary">
                    <div class="col">
                        <strong><img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Flash--Streamline-Pixel.svg" alt="" /> Pumpwerk-Betrieb</strong>
                        <div>Nutzung: {{ selectedPumpSummary.percentUtilized?.toFixed(1) }} %</div>
                        <div>Starts: {{ selectedPumpSummary.startUps }}</div>
                        <div>Min./Mittl. Fluss: {{ (selectedPumpSummary.minFlow * 1000)?.toFixed(1) }} / {{ (selectedPumpSummary.avgFlow * 1000)?.toFixed(1) }} l/s</div>
                    </div>
                    <div class="col">
                        <strong>Energie</strong>
                        <div>Energieverbrauch: {{ selectedPumpSummary.totalEnergy?.toFixed(2) }} kWh</div>
                        <div>Fördervolumen: {{ selectedPumpSummary.totalVol?.toFixed(2) }} m³</div>
                        <div v-if="(selectedPumpSummary.pctTimeOffCurveLow || 0) + (selectedPumpSummary.pctTimeOffCurveHigh || 0) > 5" class="text-red">
                            <img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Alert-Triangle-1--Streamline-Pixel.svg" alt="" /> {{ (selectedPumpSummary.pctTimeOffCurveLow + selectedPumpSummary.pctTimeOffCurveHigh).toFixed(1) }} % der Zeit außerhalb der Kennlinie
                        </div>
                    </div>
                 </div>
                 <div class="surcharge-info" v-if="selectedEdge?.surcharge">
                     <strong>Einstau-Diagnose</strong>
                     <ul>
                         <li>Dauer Vollfüllung (beidseitig): {{ selectedEdge?.surcharge?.hoursFullBoth?.toFixed(2) }} h</li>
                         <li>Dauer Vollfüllung (oben): {{ selectedEdge?.surcharge?.hoursFullUp?.toFixed(2) }} h</li>
                         <li>Dauer Vollfüllung (unten): {{ selectedEdge?.surcharge?.hoursFullDown?.toFixed(2) }} h</li>
                         <li>Dauer über Vollfüllung: {{ selectedEdge?.surcharge?.hoursAboveFull?.toFixed(2) }} h</li>
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
import { Line, safeGet, formatTime, edgeTypeLabel, getRatioClass, chartOptions } from './resultsShared.js';

const props = defineProps({
  edges: Map,
  edgeResults: Map,
  systemStats: Object,
  timeSeries: Array,
  // Sprungziel aus dem Knoten→Link-Verweis (Schächte-Tab, Pumpe/Wehr/.../Bauwerk)
  focusEdgeId: { type: String, default: null },
});

const searchQuery = ref('');
const filterSurcharged = ref(false);
const sortKey = ref('id');
const selectedEdgeId = ref(null);
const chartData = ref(null);

const selectedEdge = computed(() => selectedEdgeId.value ? safeGet(props.edgeResults, selectedEdgeId.value) : null);
const selectedPumpSummary = computed(() =>
    props.systemStats?.pumpingSummary?.find(p => p.id === selectedEdgeId.value) || null
);

const filteredEdges = computed(() => {
     if (!props.edges || !props.edgeResults) return [];
     let list = Array.from(props.edges.values()).map(e => {
         const res = safeGet(props.edgeResults, e.id) || {};
         return { ...e, ...res }; // Merge Geometry + Results
     });

     if (searchQuery.value) {
         const q = searchQuery.value.toLowerCase();
         list = list.filter(e => e.id.toLowerCase().includes(q));
     }
     if (filterSurcharged.value) {
         list = list.filter(e => (e.depthRatio || 0) > 0.9);
     }

     list.sort((a, b) => {
         if (sortKey.value === 'maxFlow') return (b.maxFlow || 0) - (a.maxFlow || 0);
         if (sortKey.value === 'capacity') return (b.capacity || 0) - (a.capacity || 0);
         if (sortKey.value === 'ratio') return (b.flowCapacityRatio || 0) - (a.flowCapacityRatio || 0);
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
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                data: props.timeSeries.map(step => step.edges[id]?.q || 0),
                fill: true
            },
            {
                label: 'Kapazität (L/s)',
                borderColor: '#94a3b8',
                borderDash: [5, 5],
                data: props.timeSeries.map(() => safeGet(props.edgeResults, id)?.capacity || 0)
            }
        ]
    };
};
</script>

<style scoped src="./results-shared.css"></style>
