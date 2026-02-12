<template>
  <DraggableModal
    :isOpen="isOpen"
    @close="close"
    title="Simulationsergebnisse (Hydraulik)"
    :initialWidth="1000"
    :initialHeight="800"
  >
    <div class="simulation-results-content">
      
      <!-- Top Navigation Tabs (Modern Pill Design) -->
      <div class="tabs-nav">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          class="tab-btn"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Main Content Area -->
      <div class="tab-content">
        
        <div v-if="activeTab === 'general'" class="tab-pane">
            
            <!-- System Health Header -->
            <div class="health-header" :class="getHealthClass(healthScore)">
                <div class="score-circle">
                    <span class="score-val">{{ healthScore }}</span>
                    <span class="score-label">Health</span>
                </div>
                <div class="health-text">
                    <h3>{{ getHealthTitle(healthScore) }}</h3>
                    <p>{{ getHealthDescription(healthScore) }}</p>
                </div>
                <div class="health-metrics">
                    <div class="metric">
                         <span>Kontinuität</span>
                         <strong>{{ (systemStats?.flow?.error || 0).toFixed(2) }} %</strong>
                    </div>
                     <div class="metric">
                         <span>Instabilität</span>
                         <strong>{{ (systemStats?.routingTimeStep?.notConverging || 0).toFixed(2) }} %</strong>
                    </div>
                </div>
            </div>

            <!-- System Stats Grid -->
            <div class="kpi-grid">
                <div class="kpi-card">
                    <div class="label">Niederschlag (Total)</div>
                    <div class="value">{{ formatVolume((systemStats?.runoff?.precip || 0) * 10000) }} m³</div>
                </div>
                 <div class="kpi-card">
                    <div class="label">Zufluss (Trocken/Regen)</div>
                    <div class="value">{{ formatVolume(((systemStats?.flow?.dryWeatherInflow || 0) + (systemStats?.flow?.wetWeatherInflow || 0)) * 1000) }} m³</div>
                </div>
                 <div class="kpi-card">
                    <div class="label">Volumen-Änderung</div>
                    <div class="value">{{ formatVolume(((systemStats?.flow?.finalStoredVol || 0) - (systemStats?.flow?.initialStoredVol || 0)) * 1000) }} m³</div>
                </div>
                <!-- Continuity Errors -->
                <div class="kpi-card" :class="getContinuityClass(systemStats?.flow?.error)">
                     <div class="label">Kontinuitätsfehler (Flow)</div>
                     <div class="value">{{ (systemStats?.flow?.error || 0).toFixed(2) }} %</div>
                </div>
            </div>

            <div class="grid-layout">
                
                <!-- 1. Simulations-Parameter (Analysis Options) -->
                <div class="panel">
                    <h3>⚙️ Simulations-Parameter</h3>
                    <table class="simple-table">
                        <tr><td>Flow Units:</td><td>{{ systemStats.analysisOptions?.flowUnits }}</td></tr>
                        <tr><td>Infiltration:</td><td>{{ systemStats.analysisOptions?.infiltrationMethod }}</td></tr>
                        <tr><td>Routing Method:</td><td>{{ systemStats.analysisOptions?.flowRoutingMethod }}</td></tr>
                        <tr><td>Start Date:</td><td>{{ systemStats.analysisOptions?.startDate }}</td></tr>
                        <tr><td>End Date:</td><td>{{ systemStats.analysisOptions?.endDate }}</td></tr>
                        <tr><td>Routing Step:</td><td>{{ systemStats.analysisOptions?.routingTimeStep }}</td></tr>
                    </table>
                </div>

                <!-- 2. Massenbilanz Details -->
                <div class="panel">
                    <h3>⚖️ Massenbilanz (Flow Routing)</h3>
                    <table class="simple-table">
                        <tr><td>Dry Weather Inflow:</td><td>{{ formatVolume((systemStats.flow?.dryWeatherInflow||0)*1000) }} m³</td></tr>
                        <tr><td>Wet Weather Inflow:</td><td>{{ formatVolume((systemStats.flow?.wetWeatherInflow||0)*1000) }} m³</td></tr>
                        <tr><td>Groundwater Inflow:</td><td>{{ formatVolume((systemStats.flow?.groundwaterInflow||0)*1000) }} m³</td></tr>
                        <tr><td>Flooding Loss:</td><td>{{ formatVolume((systemStats.flow?.floodingLoss||0)*1000) }} m³</td></tr>
                        <tr><td>Internal Outflow:</td><td>{{ formatVolume((systemStats.flow?.externalOutflow||0)*1000) }} m³</td></tr>
                        <tr class="highlight-row"><td><strong>Continuity Error:</strong></td><td><strong :class="{'text-red': Math.abs(systemStats.flow?.error) > 2}">{{ systemStats.flow?.error?.toFixed(2) }} %</strong></td></tr>
                    </table>
                </div>
                
                <!-- Stability Report -->
                <div class="panel warning-panel" v-if="hasStabilityIssues">
                    <h3>⚠️ Stabilitätsbericht</h3>
                    <div class="detail-row">
                        <span>Min Time Step:</span> <strong>{{ systemStats.routingTimeStep?.min?.toFixed(4) }} s</strong>
                    </div>
                    <div class="detail-row">
                        <span>Not Converging:</span> <strong :class="{'text-red': (systemStats.routingTimeStep?.notConverging || 0) > 0}">{{ systemStats.routingTimeStep?.notConverging?.toFixed(2) }} %</strong>
                    </div>
                    
                    <div v-if="systemStats?.nonConvergingNodes?.length" class="mt-2">
                        <strong>Kritische Knoten (Non-Converging):</strong>
                        <ul class="mini-list">
                            <li v-for="node in systemStats.nonConvergingNodes.slice(0, 3)" :key="node.id">
                                {{ node.id }} ({{ node.value }}%)
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Outfall Summary -->
                <div class="panel">
                    <h3>Ausleitungen (Outfalls)</h3>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Freq (%)</th>
                                <th>Avg (L/s)</th>
                                <th>Max (L/s)</th>
                                <th>Vol (m³)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="out in systemStats.outfallLoading || []" :key="out.id">
                                <td>{{ out.id }}</td>
                                <td>{{ out.freq?.toFixed(1) }}</td>
                                <td>{{ (out.avgFlow * 1000).toFixed(1) }}</td>
                                <td>{{ (out.maxFlow * 1000).toFixed(1) }}</td>
                                <td>{{ (out.totalVol * 1000).toFixed(1) }}</td>
                            </tr>
                            <tr v-if="!systemStats.outfallLoading?.length">
                                <td colspan="5" class="text-center text-muted">Keine Ausleitungen gefunden.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- === TAB: HALTUNGEN (Links) === -->
        <div v-if="activeTab === 'edges'" class="tab-pane">
            
             <!-- SPECIAL: Pumps Summary -->
             <div v-if="systemStats?.pumpingSummary?.length > 0" class="panel mb-4">
                 <h3>⛽ Pumpwerke</h3>
                  <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nutzung (%)</th>
                                <th>Starts</th>
                                <th>Max Flow (L/s)</th>
                                <th>Energie (kWh)</th>
                            </tr>
                        </thead>
                        <tbody>
                             <tr v-for="pump in systemStats.pumpingSummary" :key="pump.id">
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
                        <tr @click="sortEdges">
                            <th @click="sortBy='id'">ID</th>
                            <th>Typ</th>
                            <th @click="sortBy='maxFlow'">Qmax (L/s)</th>
                            <th @click="sortBy='capacity'">Kapazität (L/s)</th>
                            <th @click="sortBy='ratio'">Auslastung (Flow)</th>
                            <th @click="sortBy='depth'">Füllgrad (h/H)</th>
                            <th>Status</th>
                            <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="edge in filteredEdges" :key="edge.id" :class="{'row-warning': (edge.flowCapacityRatio || 0) > 1.0}">
                            <td>{{ edge.id }}</td>
                            <td>{{ edge.type || 'Conduit' }}</td>
                            <td>{{ edge.maxFlow?.toFixed(1) }}</td>
                            <td>{{ edge.capacity?.toFixed(1) }}</td>
                            <td>
                                <span :class="getRatioClass(edge.flowCapacityRatio)">
                                    {{ edge.flowCapacityRatio?.toFixed(2) }}
                                </span>
                            </td>
                            <td>{{ edge.utilization?.toFixed(0) }} %</td>
                            <td>
                                <span v-if="(edge.surcharge?.hoursAboveFull || 0) > 0" class="badge badge-red">Surcharged</span>
                                <span v-else-if="(edge.flowCapacityRatio || 0) > 1.0" class="badge badge-orange">Pressure</span>
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
                        <button @click="selectedEdgeId = null">✕</button>
                    </div>
                    <div class="detail-body">
                         <div class="engineer-inspector">
                            <div class="col">
                                <strong>Raw SWMM Metrics</strong>
                                <div>Max Flow: {{ edgeResults.get(selectedEdgeId)?.maxFlow?.toFixed(2) }} L/s</div>
                                <div>Max Vel: {{ edgeResults.get(selectedEdgeId)?.maxVelocity?.toFixed(2) }} m/s</div>
                                <div>Time of Max: <strong>{{ edgeResults.get(selectedEdgeId)?.timeOfMaxFlow || '-' }}</strong></div>
                                <div>Flow Class: {{ getFlowClass(selectedEdgeId) }}</div>
                            </div>
                            <div class="col">
                                <strong>Hydraulic Analysis</strong>
                                <div>Capacity: {{ edgeResults.get(selectedEdgeId)?.capacity?.toFixed(2) }} L/s</div>
                                <div v-if="(edgeResults.get(selectedEdgeId)?.flowCapacityRatio || 0) > 1.0" class="text-red">
                                    ⚠️ System under pressure ({{ edgeResults.get(selectedEdgeId)?.flowCapacityRatio?.toFixed(2) }}x Cap)
                                </div>
                            </div>
                         </div>
                         <div class="chart-box">
                             <!-- Placeholder for Chart -->
                             <Line v-if="chartData" :data="chartData" :options="chartOptions" />
                             <div v-else class="loading-chart">Lade Zeitreihe...</div>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- === TAB: SCHÄCHTE (Nodes) === -->
        <div v-if="activeTab === 'nodes'" class="tab-pane">
            
            <!-- SPECIAL: Storage Summary -->
            <div v-if="systemStats?.storageSummary?.length > 0" class="panel mb-4">
                 <h3>💧 Speicher & Rückhaltebecken</h3>
                  <table class="data-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Typ</th>
                                <th>Avg Vol (m³)</th>
                                <th>Max Vol (m³)</th>
                                <th>Füllgrad Max (%)</th>
                                <th>Max Outflow (L/s)</th>
                            </tr>
                        </thead>
                        <tbody>
                             <tr v-for="st in systemStats.storageSummary" :key="st.id">
                                <td>{{ st.id }}</td>
                                <td>{{ st.type }}</td>
                                <td>{{ (st.avgVol * 1000).toFixed(1) }}</td>
                                <td>{{ (st.maxVol * 1000).toFixed(1) }}</td>
                                <td>
                                    <div class="progress-bar-bg">
                                        <div class="progress-bar-fill" :style="{width: st.maxPcntFull + '%', background: st.maxPcntFull > 90 ? '#ef4444' : '#3b82f6'}"></div>
                                    </div>
                                    {{ st.maxPcntFull?.toFixed(1) }} %
                                </td>
                                <td>{{ (st.maxOutflow * 1000).toFixed(1) }}</td>
                             </tr>
                        </tbody>
                  </table>
            </div>

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
                            <th>Max HGL (m)</th>
                            <th>Max Tiefe (m)</th>
                            <th>Überstau Vol (m³)</th>
                            <th>Zeit (Max)</th>
                            <th>Status</th>
                            <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                         <tr v-for="node in filteredNodes" :key="node.id" :class="{'row-danger': node.overflow}">
                            <td>{{ node.id }}</td>
                            <td>{{ node.type || 'Junction' }}</td>
                             <td>{{ nodes.get(node.id)?.z?.toFixed(2) }}</td>
                            <td>{{ node.maxHGL?.toFixed(2) || '-' }}</td>
                            <td>{{ node.maxDepth?.toFixed(2) }}</td>
                            <td>{{ (node.floodingVolume || 0).toFixed(3) }}</td>
                             <td>{{ node.timeOfMaxDepth || '-' }}</td>
                            <td>
                                <span v-if="node.overflow" class="badge badge-red">FLOODED</span>
                                <span v-else-if="node.surcharged" class="badge badge-yellow">Surcharged</span>
                                <span v-else class="badge badge-green">OK</span>
                            </td>
                             <td>
                                <button class="btn-icon" @click="selectNode(node.id)">Details</button>
                            </td>
                         </tr>
                    </tbody>
                </table>
            </div>
             <!-- Detail Panel Overlay for Nodes -->
             <div v-if="selectedNodeId" class="detail-overlay">
                <div class="detail-card">
                    <div class="detail-header">
                        <h3>Schacht {{ selectedNodeId }}</h3>
                        <button @click="selectedNodeId = null">✕</button>
                    </div>
                    <div class="detail-body">
                         <Line v-if="nodeChartData" :data="nodeChartData" :options="nodeChartOptions" />
                    </div>
                </div>
             </div>
        </div>

        <!-- === TAB: FLÄCHEN (Catchments) === -->
        <div v-if="activeTab === 'areas'" class="tab-pane">
              <div class="table-scroll">
                <table class="data-table sticky-header">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Größe (ha)</th>
                            <th>Abflussbeiwert</th>
                            <th>Niederschlag (mm)</th>
                            <th>Verdunstung (mm)</th>
                            <th>Infiltration (mm)</th>
                            <th>Abfluss (mm)</th>
                            <th>Abfluss (mm)</th>
                            <th>Peak (L/s)</th>
                            <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="area in sortedAreas" :key="area.id">
                            <td>{{ area.id }}</td>
                            <td>{{ area.size?.toFixed(4) }}</td>
                             <td>{{ getSubcatchmentStat(area.id, 'runoffCoeff')?.toFixed(3) || area.runoffCoeff }}</td>
                             <td>{{ getSubcatchmentStat(area.id, 'precip')?.toFixed(2) }}</td>
                             <td>{{ getSubcatchmentStat(area.id, 'totalEvap')?.toFixed(2) }}</td>
                             <td>{{ getSubcatchmentStat(area.id, 'totalInfil')?.toFixed(2) }}</td>
                             <td>{{ getSubcatchmentStat(area.id, 'totalRunoffMm')?.toFixed(2) }}</td>
                            <td><strong>{{ getSubcatchmentStat(area.id, 'peakRunoff')?.toFixed(1) }}</strong></td>
                            <td>
                                <button class="btn-icon" @click="selectArea(area.id)">Details</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
              </div>
        </div>

      </div>
        
         <!-- Detail Panel Overlay for Areas -->
             <div v-if="selectedAreaId" class="detail-overlay">
                <div class="detail-card">
                    <div class="detail-header">
                        <h3>Fläche {{ selectedAreaId }}</h3>
                        <button @click="selectedAreaId = null">✕</button>
                    </div>
                    <div class="detail-body">
                         <Line v-if="areaChartData" :data="areaChartData" :options="chartOptions" />
                    </div>
                </div>
             </div>

    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'vue-chartjs';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const props = defineProps({
  isOpen: Boolean,
  resultsText: String, // The Raw Report Text
  nodes: Map, // Input Nodes (Geometry)
  edges: Map, // Input Edges (Geometry)
  areas: Map,
  edgeResults: Map, // Parsed Results
  nodeResults: Map,
  areaResults: Map,
  timeSeries: Array, // Binary Output Time Series
  systemStats: Object
});

const emit = defineEmits(['close', 'zoomTo']);

// State
const activeTab = ref('general');
const selectedEdgeId = ref(null);
const selectedNodeId = ref(null);
const selectedAreaId = ref(null);
const searchQuery = ref('');
const filterSurcharged = ref(false);
const filterFlooded = ref(false);
const sortBy = ref('id');

// Tabs Config
const tabs = [
    { id: 'general', label: 'Allgemein & Diagnose' },
    { id: 'edges', label: 'Haltungen (Kanal)' },
    { id: 'nodes', label: 'Schächte & Bauwerke' },
    { id: 'areas', label: 'Flächen (Einzugsgebiete)' }
];

// --- Helpers ---
const close = () => emit('close');
const formatVolume = (v) => v ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';

const getContinuityClass = (error) => {
    const absErr = Math.abs(error || 0);
    if (absErr > 5) return 'kpi-danger';
    if (absErr > 1) return 'kpi-warning';
    return 'kpi-success';
};

const getRatioClass = (ratio) => {
    if ((ratio || 0) > 1.0) return 'text-red font-bold';
    if ((ratio || 0) > 0.8) return 'text-orange';
    return '';
};

const hasStabilityIssues = computed(() => {
    return (props.systemStats?.routingTimeStep?.notConverging > 0) || 
           (props.systemStats?.nonConvergingNodes?.length > 0);
});

// Health Score Logic
const healthScore = computed(() => {
    let score = 100;
    // Deduct for Continuity Error
    const contErr = Math.abs(props.systemStats?.flow?.error || 0);
    if (contErr > 1) score -= (contErr * 5); // -5 points per 1% error
    
    // Deduct for Instability
    const instab = props.systemStats?.routingTimeStep?.notConverging || 0;
    if (instab > 0) score -= (instab * 2);

    // Clamp
    return Math.max(0, Math.min(100, Math.round(score)));
});

const getHealthClass = (score) => {
    if (score >= 90) return 'health-excellent';
    if (score >= 70) return 'health-good';
    if (score >= 50) return 'health-warning';
    return 'health-critical';
};

const getHealthTitle = (score) => {
    if (score >= 90) return 'Exzellent';
    if (score >= 70) return 'Gut';
    if (score >= 50) return 'Warnung';
    return 'Kritisch';
};

const getHealthDescription = (score) => {
    if (score >= 90) return 'Das Modell ist hydraulisch stabil und massenkonsistent.';
    if (score >= 70) return 'Gute Ergebnisse, leichte Fehler in der Massenbilanz.';
    if (score >= 50) return 'Signifikante Modellfehler. Bitte prüfen Sie die Warnungen.';
    return 'Modell instabil (hoher Fehler). Ergebnisse nicht vertrauenswürdig.';
};

// --- Computed Data ---
// 1. Edges
const filteredEdges = computed(() => {
     if (!props.edges || !props.edgeResults) return [];
     let list = Array.from(props.edges.values()).map(e => {
         const res = props.edgeResults.get(e.id) || {};
         return { ...e, ...res }; // Merge Geometry + Results
     });

     if (searchQuery.value) {
         const q = searchQuery.value.toLowerCase();
         list = list.filter(e => e.id.toLowerCase().includes(q));
     }
     if (filterSurcharged.value) {
         list = list.filter(e => (e.flowCapacityRatio > 0.9) || (e.surcharge?.hoursAboveFull > 0));
     }
     
     // Sorting
     list.sort((a, b) => {
         // Simple sort logic
         if (sortBy.value === 'maxFlow') return (b.maxFlow || 0) - (a.maxFlow || 0);
         if (sortBy.value === 'capacity') return (b.capacity || 0) - (a.capacity || 0);
         if (sortBy.value === 'ratio') return (b.flowCapacityRatio || 0) - (a.flowCapacityRatio || 0);
         return a.id.localeCompare(b.id);
     });
     
     return list;
});

// 2. Nodes
const filteredNodes = computed(() => {
    if (!props.nodes || !props.nodeResults) return [];
    let list = Array.from(props.nodes.values()).map(n => {
         const res = props.nodeResults.get(n.id) || {};
         return { ...n, ...res };
    });

     if (searchQuery.value) {
         const q = searchQuery.value.toLowerCase();
         list = list.filter(n => n.id.toLowerCase().includes(q));
     }
     if (filterFlooded.value) {
         list = list.filter(n => n.overflow);
     }
     return list;
});

// 3. Areas
const sortedAreas = computed(() => {
     if (!props.areas) return [];
     return Array.from(props.areas.values());
});

const getSubcatchmentStat = (id, key) => {
    // Assuming props.areaResults is the subcatchments object from parser
    return props.areaResults && props.areaResults[id] ? props.areaResults[id][key] : null;
};

const getFlowClass = (id) => {
    // try find flow class
    const cls = props.systemStats?.flowClassification?.find(c => c.id === id);
    if (!cls) return 'N/A';
    if (cls.fractions.supCrit > 0.1) return 'SuperCritical';
    if (cls.fractions.normLtd > 0.1) return 'Normal Limited';
    return 'SubCritical';
};


// Selection Logic (Placeholder for Chart Data - requires logic from old component)
// For now, simple stubs.
// Selection Logic & Chart Data
const chartOptions = { 
    responsive: true, 
    maintainAspectRatio: false,
    elements: { point: { radius: 0 } }, // Optimize performance
    interaction: { mode: 'index', intersect: false }
};

const chartData = ref(null);
const nodeChartData = ref(null);
const areaChartData = ref(null);

const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
};

const updateCharts = (type, id) => {
    if (!props.timeSeries || props.timeSeries.length === 0) return;

    const labels = props.timeSeries.map(step => formatTime(step.time));

    if (type === 'edge') {
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
                    label: 'Kapazität (L/s)', // Approximation based on utilization? Or flat line?
                    // Flat line of capacity?
                    borderColor: '#94a3b8',
                    borderDash: [5, 5],
                    data: props.timeSeries.map(() => props.edgeResults.get(id)?.capacity || 0)
                }
            ]
        };
    } else if (type === 'node') {
         // Get Node Geometry
         const nodeGeom = props.nodes instanceof Map ? props.nodes.get(id) : props.nodes[id];
         // Max Depth = (CoverZ - InvertZ) or just 'depth' prop (mapped to Max Depth in SWMM)
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

         // Add Reference Line for Rim Elevation (Max Depth)
         if (maxPhysicalDepth > 0) {
             datasets.push({
                 label: 'Schachthöhe (Deckel)',
                 borderColor: '#ef4444',
                 borderDash: [5, 5],
                 borderWidth: 1,
                 pointRadius: 0,
                 data: labels.map(() => maxPhysicalDepth),
                 yAxisID: 'y'
             });
         }

         nodeChartData.value = {
            labels,
            datasets: datasets
        };
        // Add dual axis options if needed, for now sharing scale or just depth
    } else if (type === 'area') {
        areaChartData.value = {
            labels,
            datasets: [
                {
                    label: 'Abfluss (L/s)', // Runoff value (assuming parser returns normalized unit or raw? Parser has float32. usually CMS or LPS depending on flowUnits)
                    // Wait, SwmmOutParser just reads float. SWMM outputs runoff in flow units usually.
                    // If flowUnits is LPS, its LPS. 
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                    data: props.timeSeries.map(step => step.subcatchments[id]?.runoff * (props.systemStats?.analysisOptions?.flowUnits === 'LPS' ? 1 : 1000) || 0),
                    fill: true
                }
            ]
        };
    }
};

const selectEdge = (id) => { selectedEdgeId.value = id; updateCharts('edge', id); };
const selectNode = (id) => { selectedNodeId.value = id; updateCharts('node', id); };
const selectArea = (id) => { selectedAreaId.value = id; updateCharts('area', id); };

// Watch for external/focus open
watch(selectedEdgeId, (newId) => { if(newId) updateCharts('edge', newId); });
watch(selectedNodeId, (newId) => { if(newId) updateCharts('node', newId); });
// Area?

</script>

<style scoped>
/* Modern Isybau Styling (Clean, Flat, functional) */
.simulation-results-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fdfdfd;
    font-family: 'Inter', sans-serif;
}

/* Tabs */
.tabs-nav {
    display: flex;
    gap: 1rem;
    padding: 1rem 1.5rem;
    background: #fff;
    border-bottom: 1px solid #eee;
}

.tab-btn {
    padding: 0.5rem 1.2rem;
    border-radius: 20px;
    background: #f3f4f6;
    border: none;
    color: #666;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.tab-btn:hover { background: #e5e7eb; }
.tab-btn.active {
    background: #3b82f6;
    color: white;
    box-shadow: 0 2px 5px rgba(59, 130, 246, 0.3);
}

/* Tab Content */
.tab-content {
    flex: 1;
    overflow: hidden; /* For scrolling inside tabs */
    position: relative;
    padding: 0;
}

.tab-pane {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    overflow-y: auto;
}

/* KPI Grid */
.kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
}

.kpi-card {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    border: 1px solid #f0f0f0;
    text-align: center;
}
.kpi-card .label { color: #888; font-size: 0.9rem; margin-bottom: 0.5rem; }
.kpi-card .value { font-size: 1.5rem; font-weight: 700; color: #333; }
.kpi-danger .value { color: #ef4444; }
.kpi-warning .value { color: #f59e0b; }
.kpi-success .value { color: #10b981; }

.grid-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
}

.panel {
    background: white;
    border-radius: 8px;
    border: 1px solid #eee;
    padding: 1.5rem;
}
.panel h3 { margin-top: 0; font-size: 1.1rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; margin-bottom: 1rem;}
.warning-panel { border-left: 4px solid #f59e0b; }

.detail-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.95rem; }
.simple-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.simple-table td { padding: 0.25rem 0; border-bottom: 1px solid #f5f5f5; }
.simple-table tr:last-child td { border-bottom: none; }
.simple-table .highlight-row td { background: #fdfdfd; font-weight: bold; border-top: 2px solid #eee; padding-top: 0.5rem; }

/* Tables */
.table-scroll { flex: 1; overflow-y: auto; background: white; border: 1px solid #eee; border-radius: 6px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.data-table th, .data-table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #eee; }
.data-table th { background: #f9fafb; font-weight: 600; color: #4b5563; position: sticky; top: 0; z-index: 1; cursor: pointer; }
.data-table tr:hover { background: #f8fafc; }
.row-warning { background: #fff7ed; }
.row-danger { background: #fef2f2; }

/* Badges */
.badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
.badge-red { background: #fee2e2; color: #b91c1c; }
.badge-orange { background: #ffedd5; color: #c2410c; }
.badge-yellow { background: #fef3c7; color: #b45309; }
.badge-green { background: #d1fae5; color: #047857; }

/* Toolbar */
.toolbar { display: flex; justify-content: space-between; margin-bottom: 1rem; }
.search-input { padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; width: 250px; }

/* Overlays */
.detail-overlay {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(255,255,255,0.95);
    z-index: 20;
    padding: 2rem;
    display: flex;
    justify-content: center;
}
.detail-card {
    background: white;
    width: 100%;
    max-width: 800px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    border-radius: 8px;
    border: 1px solid #eee;
    display: flex; 
    flex-direction: column;
}
.detail-header { display: flex; justify-content: space-between; padding: 1rem; border-bottom: 1px solid #eee; background: #fafafa; }
.detail-body { padding: 1.5rem; flex: 1; overflow-y: auto; }
.engineer-inspector { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; background: #f8fbff; padding: 1rem; border-radius: 6px; border: 1px solid #e0f0ff;}
.text-red { color: #dc2626; font-weight: bold; }
.btn-icon { background: none; border: 1px solid #ddd; padding: 0.2rem 0.6rem; border-radius: 4px; cursor: pointer; font-size: 0.8rem; }
.btn-icon:hover { background: #f3f4f6; }

.mb-4 { margin-bottom: 1rem; }
.progress-bar-bg { width: 100px; height: 8px; background: #eee; border-radius: 4px; display: inline-block; margin-right: 5px; }
.progress-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }

/* Health Header */
.health-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.5rem;
    background: white;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    border: 1px solid #eee;
}
.score-circle {
    width: 60px; height: 60px; border-radius: 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: white; font-weight: bold;
}
.score-val { font-size: 1.2rem; line-height: 1; }
.score-label { font-size: 0.6rem; text-transform: uppercase; }
.health-text { flex: 1; }
.health-text h3 { margin: 0 0 0.25rem 0; font-size: 1.2rem; }
.health-text p { margin: 0; color: #666; font-size: 0.9rem; }
.health-metrics { display: flex; gap: 1.5rem; border-left: 1px solid #eee; padding-left: 1.5rem; }
.metric { display: flex; flex-direction: column; }
.metric span { font-size: 0.75rem; color: #888; text-transform: uppercase; }
.metric strong { font-size: 1.1rem; color: #333; }

.health-excellent .score-circle { background: #10b981; }
.health-excellent h3 { color: #059669; }
.health-good .score-circle { background: #3b82f6; } /* Blue */
.health-good h3 { color: #2563eb; }
.health-warning .score-circle { background: #f59e0b; }
.health-warning h3 { color: #d97706; }
.health-critical .score-circle { background: #ef4444; }
.health-critical h3 { color: #dc2626; }

</style>
