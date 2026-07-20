<template>
  <div class="tab-pane">

    <div class="toolbar">
        <input v-model="searchQuery" placeholder="Suche Schacht..." class="search-input" />
        <div class="filters">
            <label><input type="checkbox" v-model="filterFlooded" /> Nur Überstau</label>
        </div>
    </div>
     <div class="table-scroll">
        <table class="data-table sticky-header">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Typ</th>
                    <th>Sohlhöhe (m)</th>
                    <th title="Max. Wassertiefe">Max. Wassertiefe (m)</th>
                    <th title="Max. Wasserspiegelhöhe (absolut, m ü. NHN)">Max. HGL (m ü. NHN)</th>
                    <th title="Max. gespeichertes Volumen während der Simulation">Max. Speichervol. (m³)</th>
                    <th title="Maximal mögliches Volumen (aus Geometrie)">Vmax (m³)</th>
                    <th title="Max. Füllgrad: Max. Speichervol. / Vmax">Füllgrad (%)</th>
                    <th title="Gesamtvolumen der Überflutung">Überflutungsvolumen (m³)</th>
                    <th title="Zeitpunkt des Maximums">t_max</th>
                    <th>Status</th>
                    <th>Aktion</th>
                </tr>
            </thead>
            <tbody>
                 <tr v-for="node in filteredNodes" :key="node.id"
                     :class="{
                       'row-danger': (node.floodingVolume || 0) > 0.001,
                       'row-warning': node.surcharged && !((node.floodingVolume || 0) > 0.001)
                     }">
                    <td>{{ node.id }}</td>
                    <td>{{ structureTypeLabel(node.bwType, node.type) }}</td>
                    <td>{{ node.z?.toFixed(2) ?? '-' }}</td>
                    <td>{{ node.maxDepth?.toFixed(2) ?? '-' }}</td>
                    <td>{{ node.maxHGL?.toFixed(2) ?? '-' }}</td>
                    <td>{{ fmtVol(nodeMaxVolume(node)) }}</td>
                    <td>{{ fmtVol(nodeVmax(node)) }}</td>
                    <td>{{ nodeFillPct(node) != null ? nodeFillPct(node).toFixed(1) : '-' }}</td>
                    <td>{{ (node.floodingVolume || 0).toLocaleString('de-DE', {minimumFractionDigits: 3}) }}</td>
                     <td>{{ node.timeOfMaxDepth || '-' }}</td>
                    <td>
                        <span v-if="(node.floodingVolume || 0) > 0.001" class="badge badge-red">ÜBERFLUTET</span>
                        <span v-else-if="node.surcharged" class="badge badge-yellow">Eingestaut</span>
                        <span v-else class="badge badge-green">OK</span>
                        <span v-if="node.continuityError != null && Math.abs(node.continuityError) >= 10"
                              class="badge badge-red"
                              :title="`Kontinuitätsfehler ${node.continuityError.toFixed(1)} % — Ergebnis unzuverlässig`">
                            Δ {{ node.continuityError.toFixed(0) }} %
                        </span>
                    </td>
                     <td>
                        <button class="btn-icon" @click="selectNode(node.id)">Details</button>
                    </td>
                 </tr>
            </tbody>
        </table>
    </div>

    <!-- Node Details Overlay -->
    <div v-if="selectedNodeId" class="detail-overlay">
        <div class="detail-card">
            <div class="detail-header">
                <h3>{{ structureTypeLabel(selectedNodeResult?.bwType, selectedNodeResult?.type) }} {{ selectedNodeId }}</h3>
                <button @click="selectedNodeId = null" class="detail-close-btn">✕</button>
            </div>
            <div class="detail-body">
                <div v-if="relatedLinkId(selectedNodeResult)" class="link-hint">
                    <img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Cog-Double--Streamline-Pixel.svg" alt="" /> Hydraulisches Ergebnis (Durchfluss, Auslastung) siehe Haltung
                    <button class="link-hint-btn" @click="emit('focus-edge', relatedLinkId(selectedNodeResult))">
                        {{ relatedLinkId(selectedNodeResult) }}
                    </button>
                    im Haltungen-Tab — dieser Knoten trägt nur die generischen Wasserstand-Werte.
                </div>
                <div class="engineer-inspector">
                    <div class="col">
                        <strong>Wassertiefen-Auswertung</strong>
                        <div>Mittlere Wassertiefe: {{ selectedNodeResult?.avgDepth?.toFixed(2) }} m</div>
                        <div>Max. Wassertiefe: {{ selectedNodeResult?.maxDepth?.toFixed(2) }} m</div>
                        <div>Max. Wasserspiegel (HGL): {{ selectedNodeResult?.maxHGL?.toFixed(2) }} m</div>
                        <div>Max. Einstautiefe (gemeldet): <strong>{{ selectedNodeResult?.reportedMaxDepth?.toFixed(2) }} m</strong></div>
                    </div>
                    <div class="col">
                        <strong>Zufluss & Überflutung</strong>
                        <div>Max. seitl. Zufluss: {{ selectedNodeResult?.maxLatInflow?.toFixed(2) }} l/s</div>
                        <div>Max. Gesamtzufluss: {{ selectedNodeResult?.maxTotalInflow?.toFixed(2) }} l/s</div>
                        <div>Gesamtvol. Überflutung: {{ (selectedNodeResult?.floodingVolume || 0).toFixed(3) }} m³</div>
                        <div v-if="(selectedNodeResult?.floodingVolume || 0) > 0.001" class="text-red"><img class="emoji-icon" src="/saintv1d/icons/Interface-Essential-Alert-Triangle-1--Streamline-Pixel.svg" alt="" /> Überflutung gemeldet</div>
                    </div>
                    <div class="col">
                        <strong>Volumen</strong>
                        <div>Max. gespeichert: {{ fmtVol(nodeMaxVolume(selectedNodeResult)) }} m³</div>
                        <div>Vmax (möglich): {{ fmtVol(nodeVmax(selectedNodeResult)) }} m³</div>
                        <div>Max. Füllgrad: <strong>{{ nodeFillPct(selectedNodeResult) != null ? nodeFillPct(selectedNodeResult).toFixed(1) + ' %' : '-' }}</strong></div>
                        <template v-if="storageEntry(selectedNodeId)">
                            <div>Durchschnittl. Füllgrad: {{ storageEntry(selectedNodeId).avgPcntFull?.toFixed(1) }} %</div>
                            <div>Max. Abfluss: {{ (storageEntry(selectedNodeId).maxOutflow * 1000)?.toLocaleString('de-DE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) }} l/s</div>
                        </template>
                    </div>
                </div>
                 <div class="chart-box">
                     <Line v-if="nodeChartData" :data="nodeChartData" :options="nodeChartData.options || chartOptions" />
                     <div v-else class="loading-chart">Lade Diagramm...</div>
                 </div>
            </div>
        </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Line, safeGet, formatTime, fmtVol, structureTypeLabel, chartOptions } from './resultsShared.js';
import { classifyPreview, LINK_BAUWERKSTYPEN } from '../../../utils/mappings.js';

const props = defineProps({
  nodes: Map,
  edges: Map,
  nodeResults: Map,
  systemStats: Object,
  timeSeries: Array,
});

const emit = defineEmits(['focus-edge']);

const searchQuery = ref('');
const filterFlooded = ref(false);
const selectedNodeId = ref(null);
const nodeChartData = ref(null);

// --- Volumen-Helfer ---
// maxVolumeStored liefert die .out-Zeitreihe für ALLE Knoten, maxAvailableVolume (Vmax)
// berechnet der ResultsAssembler aus der Geometrie; storageSummary (.rpt) bleibt
// Fallback für Becken.
const storageEntry = (id) => props.systemStats?.storageSummary?.find(s => s.id === id) || null;

const nodeMaxVolume = (node) => {
    if (!node) return null;
    if (node.maxVolumeStored > 0) return node.maxVolumeStored;
    return storageEntry(node.id)?.maxVol ?? null;
};

const nodeVmax = (node) => (node && node.maxAvailableVolume > 0) ? node.maxAvailableVolume : null;

const nodeFillPct = (node) => {
    const vmax = nodeVmax(node);
    const v = nodeMaxVolume(node);
    if (vmax && v != null) return (v / vmax) * 100;
    return storageEntry(node?.id)?.maxPcntFull ?? null;
};

const selectedNodeResult = computed(() => {
    if (!selectedNodeId.value) return null;
    const res = safeGet(props.nodeResults, selectedNodeId.value) || {};
    const node = safeGet(props.nodes, selectedNodeId.value);
    return { id: selectedNodeId.value, ...res, bwType: node?.type };
});

// Pumpe/Wehr/Drossel/Schieber (Bauwerkstyp 6/7/8/9) sind in SWMM LINKS — benannt
// nach der AUSGEHENDEN Haltung dieses Knotens, nicht nach dem Knoten selbst.
// Das reale Hydraulik-Ergebnis (Durchfluss, Auslastung, Pumpenzyklen) liegt
// deshalb im Haltungen-Tab, nicht hier am Knoten — Hinweis + Link dorthin.
const relatedLinkId = (node) => {
    if (!node || !LINK_BAUWERKSTYPEN.has(node.bwType)) return null;
    const edge = Array.from(props.edges?.values?.() || []).find(e => e.fromNodeId === node.id);
    return edge?.id ?? null;
};

const filteredNodes = computed(() => {
    if (!props.nodes || !props.nodeResults) return [];
    let list = Array.from(props.nodes.values()).map(n => {
         const res = safeGet(props.nodeResults, n.id) || {};
         // res.type (SWMM JUNCTION/STORAGE/OUTFALL) würde sonst n.type (ISYBAU-
         // Bauwerkstyp, z.B. 6=Pumpe) überschreiben — bwType getrennt mitführen,
         // damit die Tabelle "Pumpe"/"Wehr" statt generisch "Schacht" zeigt.
         return { ...n, ...res, bwType: n.type };
    });

     if (searchQuery.value) {
         const q = searchQuery.value.toLowerCase();
         list = list.filter(n => n.id.toLowerCase().includes(q));
     }
     if (filterFlooded.value) {
         list = list.filter(n => (n.floodingVolume || 0) > 0.001);
     }
     return list;
});

const selectNode = (id) => {
    selectedNodeId.value = id;
    updateChart(id);
};

const updateChart = (id) => {
    if (!props.timeSeries || props.timeSeries.length === 0) {
        nodeChartData.value = null;
        return;
    }
    const labels = props.timeSeries.map(step => formatTime(step.time));

    // Get Node Geometry
    const nodeGeom = props.nodes instanceof Map ? props.nodes.get(id) : props.nodes[id];
    const maxPhysicalDepth = nodeGeom ? parseFloat(nodeGeom.depth) : 0;

    const datasets = [
        {
            label: 'Tiefe (m)',
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            data: props.timeSeries.map(step => step.nodes[id]?.depth || 0),
            fill: true,
            yAxisID: 'y'
        },
        {
            label: 'Zufluss (L/s)',
            borderColor: '#10b981',
            data: props.timeSeries.map(step => step.nodes[id]?.inflow || 0),
            yAxisID: 'y1'
        }
    ];

    // Volumen-Ganglinie für ALLE Knoten (die .out-Datei liefert vol überall,
    // nicht nur für Becken) — nur weglassen, wenn die Zeitreihe kein Volumen hat.
    const hasVolume = props.timeSeries.some(step => (step.nodes[id]?.vol || 0) > 0);

    if (hasVolume) {
        datasets.push({
            label: 'Volumen (m³)',
            borderColor: '#f59e0b', // amber
            backgroundColor: 'rgba(245, 158, 11, 0.2)',
            data: props.timeSeries.map(step => step.nodes[id]?.vol || 0),
            fill: true,
            yAxisID: 'y2'
        });

        // Vmax-Referenzlinie: maximal mögliches Volumen aus der Geometrie
        const vmax = safeGet(props.nodeResults, id)?.maxAvailableVolume;
        if (vmax > 0) {
            datasets.push({
                label: 'Vmax (möglich)',
                borderColor: '#f59e0b',
                borderDash: [5, 5],
                borderWidth: 1,
                pointRadius: 0,
                data: labels.map(() => vmax),
                yAxisID: 'y2'
            });
        }
    }

    // Add Reference Line for Rim Elevation (Max Depth)
    if (maxPhysicalDepth > 0) {
        datasets.push({
            label: 'Deckelhöhe',
            borderColor: '#ef4444',
            borderDash: [5, 5],
            borderWidth: 1,
            pointRadius: 0,
            data: labels.map(() => maxPhysicalDepth),
            yAxisID: 'y'
        });
    }

    // Dynamic chart options for nodes to support multiple axes
    const nodeOptions = JSON.parse(JSON.stringify(chartOptions));
    nodeOptions.scales = {
        x: { display: true },
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Tiefe (m)' }
        },
        y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Zufluss (L/s)' },
            grid: { drawOnChartArea: false }
        }
    };

    if (hasVolume) {
        nodeOptions.scales.y2 = {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Volumen (m³)' },
            grid: { drawOnChartArea: false }
        };
    }

    nodeChartData.value = {
        labels,
        datasets,
        options: nodeOptions
    };
};
</script>

<style scoped src="./results-shared.css"></style>
