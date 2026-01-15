<template>
  <DraggableModal :is-open="isOpen" initial-width="1200px" initial-height="600px" initial-left="center" initial-top="50">
      <div class="modal-header">
        <h3>Simulationsergebnisse</h3>
        <div class="header-actions">
           <!-- Draggable makes bottom panel toggle redundant/confusing. User can resize/move manually -->
             <!-- <button class="icon-btn" @click="toggleBottomPanel" title="Bottom Panel / Modal">
                {{ isBottomPanel ? '⇱' : '⇲' }}
            </button> -->
            <button class="close-btn" @click="close">&times;</button>
        </div>
      </div>

      <div class="modal-body">
        <div class="tabs">
          <button 
            :class="{ active: activeTab === 'edges' }" 
            @click="activeTab = 'edges'"
          >
            Haltungen ({{ edges.size }})
          </button>
          <button 
            :class="{ active: activeTab === 'nodes' }" 
            @click="activeTab = 'nodes'"
          >
            Schächte / Bauwerke ({{ nodes.size }})
          </button>
          <button 
            :class="{ active: activeTab === 'areas' }" 
            @click="activeTab = 'areas'"
          >
            Flächen ({{ areas.length }})
          </button>
          <button 
            :class="{ active: activeTab === 'general' }" 
            @click="activeTab = 'general'"
          >
            Allgemeine Daten
          </button>
        </div>

        <div class="tab-content">
          <!-- Edges Table -->
          <div v-if="activeTab === 'edges'" class="table-container">
            <div v-if="selectedEdgeId" class="detail-view">
                <div class="detail-header">
                    <h3>Haltung {{ selectedEdgeId }}</h3>
                    <button @click="clearSelection" class="secondary-btn btn-sm">Zurück zur Übersicht</button>
                </div>
                <div class="chart-container">
                    <Line v-if="chartData" :data="chartData" :options="chartOptions" />
                </div>
                <div class="detail-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Zeit (min)</th>
                                <th>Abfluss (l/s)</th>
                                <th>Volumen (m³)</th>
                                <th>Geschw. (m/s)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(step, index) in timeSeries" :key="index">
                                <td>{{ (step.time / 60).toFixed(1) }}</td>
                                <td>{{ step.edges[selectedEdgeId]?.q.toFixed(2) }}</td>
                                <td>{{ step.edges[selectedEdgeId]?.vol.toFixed(3) }}</td>
                                <td>{{ step.edges[selectedEdgeId]?.v.toFixed(2) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <table v-else>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Profil</th>
                  <th>Länge (m)</th>
                  <th>Gefälle (%)</th>
                  <th>Q voll (l/s)</th>
                  <th>Q max (l/s)</th>
                  <th>Auslastung</th>
                  <th>v max (m/s)</th>
                  <th>v avg (m/s)</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                    v-for="edge in sortedEdges" 
                    :key="edge.id"
                    :class="{ 'highlight-row': edge.id === selectedEdgeId }"
                    @click="$emit('select-element', { id: edge.id, type: 'edge' })"
                >
                  <td>{{ edge.id }}</td>
                  <td>{{ getProfileLabel(edge.profile) }}</td>
                  <td>{{ edge.length?.toFixed(2) }}</td>
                  <td>{{ calculateSlope(edge)?.toFixed(2) }}</td>
                  <td>{{ edgeResults.get(edge.id)?.capacity?.toFixed(1) }}</td>
                  <td>{{ edgeResults.get(edge.id)?.maxFlow?.toFixed(1) }}</td>
                  <td :class="{ 'text-red': (edgeResults.get(edge.id)?.utilization || 0) > 100 }">
                    {{ (edgeResults.get(edge.id)?.utilization || 0).toFixed(0) }} %
                  </td>
                  <td>{{ edgeResults.get(edge.id)?.maxVelocity?.toFixed(2) }}</td>
                  <td>{{ getAvgVelocity(edge.id)?.toFixed(2) }}</td>
                  <td>
                    <button @click.stop="selectEdge(edge.id)" class="secondary-btn btn-sm">Details</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Nodes Table -->
          <div v-if="activeTab === 'nodes'" class="table-container">
            <div v-if="selectedNodeId" class="detail-view">
                <div class="detail-header">
                    <h3>Schacht {{ selectedNodeId }}</h3>
                    <button @click="clearSelection" class="secondary-btn btn-sm">Zurück zur Übersicht</button>
                </div>
                <div class="chart-container">
                    <Line v-if="nodeChartData" :data="nodeChartData" :options="nodeChartOptions" />
                </div>
                <div class="detail-table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Zeit (min)</th>
                                <th>Zufluss (l/s)</th>
                                <th>Abfluss (l/s)</th>
                                <th>Volumen (m³)</th>
                                <th>Tiefe (m)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(step, index) in timeSeries" :key="index">
                                <td>{{ (step.time / 60).toFixed(1) }}</td>
                                <td>{{ step.nodes[selectedNodeId]?.inflow?.toFixed(2) }}</td>
                                <td>{{ step.nodes[selectedNodeId]?.outflow?.toFixed(2) }}</td>
                                <td>{{ step.nodes[selectedNodeId]?.vol?.toFixed(3) }}</td>
                                <td>{{ step.nodes[selectedNodeId]?.depth?.toFixed(2) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div v-else class="split-tables">
                <div v-if="structureNodes.length > 0">
                    <h4 class="table-section-title">Bauwerke & Auslässe</h4>
                    <table>
                    <thead>
                        <tr>
                        <th>ID</th>
                        <th>Typ</th>
                        <th>Sohlhöhe (m)</th>
                        <th>Max. Tiefe (m)</th>
                        <th>Max. Zufluss (l/s)</th>
                        <th>Auslaufvolumen (m³)</th>
                        <th>Status</th>
                        <th>Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                        v-for="node in structureNodes"
                        :key="node.id"
                        :class="{ 'highlight-row': node.id === selectedNodeId }"
                        @click="$emit('select-element', { id: node.id, type: 'node' })"
                        >
                        <td>{{ node.id }}</td>
                        <td>{{ getNodeTypeLabel(node.type) }}</td>
                        <td>{{ node.z?.toFixed(2) }}</td>
                        <td>{{ getNodeResult(node.id, 'maxDepth')?.toFixed(2) || '-' }}</td>
                        <td>{{ getNodeResult(node.id, 'maxInflow')?.toFixed(1) || '-' }}</td>
                        <td>{{ getNodeResult(node.id, 'totalOutflowVolume')?.toFixed(3) || getNodeResult(node.id, 'pondedVolume')?.toFixed(3) || '0.000' }}</td>
                        <td>
                             <span v-if="getNodeStatus(node.id) === 'Überstau'" class="badge badge-danger">Überstau</span>
                             <span v-else class="badge badge-success">OK</span>
                        </td>
                         <td>
                             <button class="secondary-btn btn-sm" @click.stop="selectNode(node.id)">
                                Details
                            </button>
                        </td>
                        </tr>
                    </tbody>
                    </table>
                </div>

                <h4 class="table-section-title">Schächte</h4>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Typ</th>
                      <th>Sohlhöhe (m)</th>
                      <th>Max. Tiefe (m)</th>
                      <th>Avg. Tiefe (m)</th>
                      <th>Max. Zufluss (l/s)</th>
                      <th>Max. Volumen (m³)</th>
                      <th>Überstauvolumen (m³)</th>
                      <th>Status</th>
                      <th>Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr 
                        v-for="node in manholeNodes" 
                    :key="node.id"
                    :class="{ 'highlight-row': node.id === selectedNodeId }"
                    @click="$emit('select-element', { id: node.id, type: 'node' })"
                >
                  <td>{{ node.id }}</td>
                  <td>{{ getNodeTypeLabel(node.type) }}</td>
                  <td>{{ node.z?.toFixed(2) }}</td>
                  <td>{{ nodeResults.get(node.id)?.maxDepth?.toFixed(2) }}</td>
                  <td>{{ nodeResults.get(node.id)?.avgDepth?.toFixed(2) }}</td>
                  <td>{{ nodeResults.get(node.id)?.maxInflow?.toFixed(1) }}</td>
                  <td>{{ nodeResults.get(node.id)?.maxVolumeStored?.toFixed(3) }}</td>
                  <td>{{ (nodeResults.get(node.id)?.pondedVolume * 1000 || 0).toFixed(3) }}</td>
                  <td>
                    <span v-if="nodeResults.get(node.id)?.overflow" class="badge badge-danger">Überstau</span>
                    <span v-else class="badge badge-success">OK</span>
                  </td>
                  <td>
                    <button @click.stop="selectNode(node.id)" class="secondary-btn btn-sm">Details</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

          <!-- Areas Table -->
          <div v-if="activeTab === 'areas'" class="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Typ</th>
                  <th>Größe (ha)</th>
                  <th>Abflussbeiwert</th>
                  <th>Niederschlag (mm)</th>
                  <th>Abfluss (mm)</th>
                  <th>Abfluss (m³)</th>
                  <th>Peak (l/s)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="area in sortedAreas" :key="area.id">
                  <td>{{ area.id }}</td>
                  <td>{{ getAreaTypeLabel(area.type) }}</td>
                  <td>{{ area.size?.toFixed(4) }}</td>
                  <td>{{ area.runoffCoeff }}</td>
                  <td>{{ getSubcatchmentStat(area.id, 'precip')?.toFixed(2) }}</td>
                  <td>{{ getSubcatchmentStat(area.id, 'totalRunoffMm')?.toFixed(2) }}</td>
                  <td>{{ (getSubcatchmentStat(area.id, 'totalRunoffVol') * 1000)?.toFixed(3) }}</td> <!-- Ltr 10^6 -> m^3 -->
                  <td>{{ getSubcatchmentStat(area.id, 'peakRunoff')?.toFixed(2) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- General Data Tab -->
          <div v-if="activeTab === 'general'" class="general-data-container">
            <div class="stat-card">
                <h3>Niederschlagsvolumen (auf Flächen)</h3>
                <p class="stat-value">{{ formatVolume((systemStats?.runoff?.precip || 0) * 10000) }} m³</p> <!-- ha-m to m³ -->
            </div>
            <div class="stat-card">
                <h3>Versickerung & Verluste</h3>
                <p class="stat-value">{{ formatVolume(((systemStats?.runoff?.evap || 0) + (systemStats?.runoff?.infil || 0)) * 10000) }} m³</p>
            </div>
            <div class="stat-card">
                <h3>Oberflächenabfluss (Netz-Zufluss)</h3>
                <p class="stat-value">{{ formatVolume((systemStats?.runoff?.runoff || 0) * 10000) }} m³</p>
            </div>
            
            <div class="stat-card" style="border-color: #3498db; background: #ebf5fb;">
                <h3>Gesamtvolumen Ein (Netz)</h3>
                <p class="stat-value">{{ formatVolume((systemStats?.flow?.inflowVol || 0) * 1000) }} m³</p> <!-- 10^6 ltr to m³ -->
                <small>Regenabfluss + Fremdwasser</small>
            </div>
            <div class="stat-card" style="border-color: #e67e22; background: #fdf2e9;">
                <h3>Gesamtvolumen Aus (Netz)</h3>
                <p class="stat-value">{{ formatVolume((systemStats?.flow?.outflowVol || 0) * 1000) }} m³</p>
                <small>Auslaufbauwerke</small>
            </div>

            <div class="stat-card">
                <h3>Überstauvolumen (Schächte)</h3>
                <p class="stat-value">{{ formatVolume((systemStats?.flow?.floodingVol || 0) * 1000) }} m³</p>
                <small>Wasser aus Schächten ausgetreten</small>
            </div>
            
             <div class="stat-card">
                <h3>Volumendifferenz (Speicher)</h3>
                <p class="stat-value">{{ formatVolume(((systemStats?.flow?.finalStoredVol || 0) - (systemStats?.flow?.initialStoredVol || 0)) * 1000) }} m³</p>
            </div>

            <div class="stat-card">
                <h3>Kontinuitätsfehler</h3>
                <p class="stat-value" :style="{ color: Math.abs(systemStats?.flow?.error || 0) > 2 ? 'red' : 'green' }">
                    {{ (systemStats?.flow?.error || 0).toFixed(2) }} %
                </p>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="secondary-btn" @click="handlePrintReport" title="Als PDF speichern">🖨️ PDF Report</button>
        <button class="secondary-btn" @click="$emit('show-debug')">📝 Log-Daten</button>
        <button class="secondary-btn" @click="close">Schließen</button>
      </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import { getMapping } from '../../utils/mappings.js';
import { generateSimulationReport } from '../../utils/pdfGenerator.js';
import { Line } from 'vue-chartjs';
import { 
  Chart as ChartJS, 
  Title, 
  Tooltip, 
  Legend, 
  LineElement, 
  PointElement, 
  CategoryScale, 
  LinearScale 
} from 'chart.js';

ChartJS.register(
  Title, 
  Tooltip, 
  Legend, 
  LineElement, 
  PointElement, 
  CategoryScale, 
  LinearScale
);

const props = defineProps({
  isOpen: Boolean,
  nodes: Map,
  edges: Map,
  areas: Array,
  edgeResults: Map,
  nodeResults: Map,
  timeSeries: Array,
  runoffDetails: Array,
  massBalance: Object,
  subcatchmentResults: Map,
  systemStats: Object,
  focusTarget: String // From Parent
});

const emit = defineEmits(['close', 'show-debug', 'select-element']);

const isBottomPanel = ref(true); // Default to bottom panel as requested
const toggleBottomPanel = () => {
    isBottomPanel.value = !isBottomPanel.value;
};

// Watch focusTarget to auto-select
watch(() => props.focusTarget, (newId) => {
    if (!newId) return;
    if (props.nodes && props.nodes.has(newId)) {
        activeTab.value = 'nodes';
        selectNode(newId);
    } else if (props.edges && props.edges.has(newId)) {
        activeTab.value = 'edges';
        selectEdge(newId);
    }
}, { immediate: true });

const activeTab = ref('edges');
const selectedEdgeId = ref(null);
const selectedNodeId = ref(null);

const close = () => {
  emit('close');
};

const selectEdge = (id) => {
  selectedEdgeId.value = id;
  selectedNodeId.value = null;
};

const selectNode = (id) => {
    selectedNodeId.value = id;
    selectedEdgeId.value = null;
};

const clearSelection = () => {
  selectedEdgeId.value = null;
  selectedNodeId.value = null;
};

const handlePrintReport = () => {
    // Gather Metadata via Store? We don't have direct access to store here but via props mostly.
    // Assuming props contain most. For filename, we might need to assume or pass it.
    // Or just use 'Isybau_Report'.
    generateSimulationReport(
        'Simulationsbericht',
        { fileName: 'Projekt', version: '1.0' }, // Mock metadata for now or pass as prop
        props.systemStats,
        props.nodes,
        props.edges,
        props.areas,
        props.nodeResults,
        props.edgeResults,
        props.subcatchmentResults,
        props.timeSeries
    );
};

defineExpose({
    selectEdge,
    selectNode
});

const formatVolume = (val) => {
    return (val || 0).toFixed(3);
};

// ... (Helpers) ...

// ... (Sorting) ...



const nodeChartData = computed(() => {
    if (!selectedNodeId.value || !props.timeSeries) return null;

    const labels = props.timeSeries.map(step => (step.time / 60).toFixed(1));
    const inflowData = props.timeSeries.map(step => step.nodes[selectedNodeId.value]?.inflow || 0);
    const outflowData = props.timeSeries.map(step => step.nodes[selectedNodeId.value]?.outflow || 0);
    const volData = props.timeSeries.map(step => step.nodes[selectedNodeId.value]?.vol || 0);
    const depthData = props.timeSeries.map(step => step.nodes[selectedNodeId.value]?.depth || 0);

    return {
        labels,
        datasets: [
            {
                label: 'Zufluss (l/s)',
                data: inflowData,
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                yAxisID: 'y'
            },
            {
                label: 'Abfluss (l/s)',
                data: outflowData,
                borderColor: '#e67e22',
                backgroundColor: 'rgba(230, 126, 34, 0.2)',
                yAxisID: 'y'
            },
            {
                label: 'Volumen (m³)',
                data: volData,
                borderColor: '#9b59b6',
                backgroundColor: 'rgba(155, 89, 182, 0.2)',
                yAxisID: 'y1'
            },
            {
                label: 'Tiefe (m)',
                data: depthData,
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.2)',
                yAxisID: 'y1',
                borderDash: [2, 2]
            }
        ]
    };
});

const nodeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        mode: 'index',
        intersect: false,
    },
    scales: {
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Fluss (l/s)' }
        },
        y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: 'Volumen (m³) / Tiefe (m)' },
            grid: { drawOnChartArea: false }
        }
    }
};

// Helpers
const getProfileLabel = (profile) => {
  if (!profile) return '-';
  const type = getMapping('Profilart', profile.type);
  return `${type} ${Math.round(profile.height * 1000)}/${Math.round(profile.width * 1000)}`;
};

const getNodeTypeLabel = (type) => {
  if ([2, 3, 4, 5, 12, 13].includes(Number(type)) || type === 'Auslaufbauwerk') return getMapping('Bauwerkstyp', type) || 'Bauwerk';
  return 'Schacht';
};

const getAreaTypeLabel = (type) => {
  return getMapping('Flaechenart', type);
};

const getRunoffStat = (areaId, key) => {
  // Legacy or client-side calc support
  if (!props.runoffDetails) return 0;
  const detail = props.runoffDetails.find(d => d && d.areaId === areaId);
  return detail ? detail[key] : 0;
};

const getSubcatchmentStat = (areaId, key) => {
    if (!props.subcatchmentResults) return 0;
    const res = props.subcatchmentResults.get(areaId);
    return res ? res[key] : 0;
};

const calculateSlope = (edge) => {
    if (edge.slope) return edge.slope;
    if (props.nodes && edge.from && edge.to) { // Changed edge.nodeFrom to edge.from based on usage in chartData
        const n1 = props.nodes.get(edge.from);
        const n2 = props.nodes.get(edge.to);
        if (n1 && n2 && edge.length > 0) {
            // Check for explicit offsets or Z coords
            const z1 = n1.z + (edge.offsetFrom || 0);
            const z2 = n2.z + (edge.offsetTo || 0);
            return (Math.abs(z1 - z2) / edge.length) * 100;
        }
    }
    return 0;
};

const getNodeResult = (id, key) => {
    if (!props.nodeResults) return 0;
    const res = props.nodeResults.get(id);
    return res ? res[key] : 0;
};

const getNodeStatus = (id) => {
    if (!props.nodeResults) return 'OK';
    const res = props.nodeResults.get(id);
    if (!res) return 'OK';
    if (res.overflow) return 'Überstau';
    if (res.pondedVolume > 0 && res.totalOutflowVolume === undefined) return 'Überstau'; // only if not outfall
    return 'OK';
};



const getAvgVelocity = (edgeId) => {
    // Try summary first (if added later)
    const summaryVal = props.edgeResults.get(edgeId)?.avgVelocity;
    if (summaryVal !== undefined && summaryVal > 0) return summaryVal;

    // Calc from Time Series
    if (props.timeSeries && props.timeSeries.length > 0) {
        let sumV = 0;
        let count = 0;
        props.timeSeries.forEach(step => {
            if (step.edges && step.edges[edgeId]) {
                sumV += step.edges[edgeId].v || 0;
                count++;
            }
        });
        return count > 0 ? (sumV / count) : 0;
    }
    return 0;
};

// Sorting
const sortedEdges = computed(() => {
  return Array.from(props.edges.values()).sort((a, b) => a.id.localeCompare(b.id));
});

// Define Structure Types (including Outfall=5)
const STRUCTURE_TYPES = [2, 3, 4, 5, 12, 13];

const structureNodes = computed(() => {
    return Array.from(props.nodes.values())
        .filter(n => STRUCTURE_TYPES.includes(Number(n.type)) || n.type === 'Auslaufbauwerk' || (n.id && n.id.startsWith('AL')) || n.type === 5)
        .sort((a, b) => a.id.localeCompare(b.id));
});

const manholeNodes = computed(() => {
    return Array.from(props.nodes.values())
        .filter(n => !STRUCTURE_TYPES.includes(Number(n.type)) && n.type !== 'Auslaufbauwerk' && !(n.id && n.id.startsWith('AL')))
        .sort((a, b) => a.id.localeCompare(b.id));
});

const sortedAreas = computed(() => {
  return [...props.areas].sort((a, b) => a.id.localeCompare(b.id));
});

const chartData = computed(() => {
  if (!selectedEdgeId.value || !props.timeSeries) return null;

  const labels = props.timeSeries.map(step => (step.time / 60).toFixed(1)); // min
  const flowData = props.timeSeries.map(step => step.edges[selectedEdgeId.value]?.q || 0);
  const volData = props.timeSeries.map(step => step.edges[selectedEdgeId.value]?.vol || 0);
  
  // Get Node Depths for Backwater
  const edge = props.edges.get(selectedEdgeId.value);
  const depthData = props.timeSeries.map(step => {
      // Avg depth at ends
      const d1 = step.nodes[edge.from]?.depth || 0;
      const d2 = step.nodes[edge.to]?.depth || 0;
      return Math.max(d1, d2); // Max depth in pipe
  });

  // Get Capacity (Qvoll)
  const capacity = props.edgeResults.get(selectedEdgeId.value)?.capacity || 0;
  const capacityData = new Array(props.timeSeries.length).fill(capacity);

  return {
    labels,
    datasets: [
      {
        label: 'Abfluss (l/s)',
        data: flowData,
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.2)',
        yAxisID: 'y'
      },
      {
        label: 'Q voll (l/s)',
        data: capacityData,
        borderColor: '#95a5a6',
        borderDash: [5, 5],
        pointRadius: 0,
        borderWidth: 2,
        yAxisID: 'y'
      },
      {
        label: 'Volumen (m³)',
        data: volData,
        borderColor: '#2ecc71',
        backgroundColor: 'rgba(46, 204, 113, 0.2)',
        yAxisID: 'y1'
      },
      {
        label: 'Max. Tiefe (m)',
        data: depthData,
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231, 76, 60, 0.2)',
        yAxisID: 'y1',
        borderDash: [2, 2]
      }
    ]
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    mode: 'index',
    intersect: false,
  },
  scales: {
    y: {
      type: 'linear',
      display: true,
      position: 'left',
      title: { display: true, text: 'Abfluss (l/s)' }
    },
    y1: {
      type: 'linear',
      display: true,
      position: 'right',
      title: { display: true, text: 'Volumen (m³) / Tiefe (m)' },
      grid: {
        drawOnChartArea: false,
      },
    }
  }
};

</script>

<style scoped>
/* Cleaned up styles */
.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: move;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #94a3b8; /* Slate 400 */
  transition: color 0.2s;
  padding: 0 0.5rem;
}

.close-btn:hover {
  color: #ef4444; /* Red 500 */
}

.modal-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #ddd;
  background: #f8f9fa;
  padding: 0 1rem;
}

.tabs button {
  padding: 1rem 1.5rem;
  border: none;
  background: none;
  cursor: pointer;
  font-weight: 500;
  color: #666;
  border-bottom: 2px solid transparent;
}

.tabs button.active {
  color: #3498db;
  border-bottom-color: #3498db;
}

.tab-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.table-container {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

th, td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
  position: sticky;
  top: 0;
}

tr:hover {
  background: #f1f1f1;
  background: #f1f1f1;
  cursor: pointer;
}

.highlight-row {
    background: #e3f2fd !important;
    border-left: 4px solid #2196F3;
}

.text-red {
  color: #e74c3c;
  font-weight: bold;
}

.badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
}

.badge-success {
  background: #d4edda;
  color: #155724;
}

.badge-danger {
  background: #f8d7da;
  color: #721c24;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.secondary-btn {
  padding: 0.5rem 1rem;
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.secondary-btn:hover {
  background: #e2e6ea;
}

.btn-sm {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
}

.detail-view {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.chart-container {
    height: 300px;
    margin-bottom: 1rem;
}

.detail-table-container {
    flex: 1;
    overflow: auto;
    border: 1px solid #eee;
}

.general-data-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    padding: 1rem;
}

.stat-card {
    background: #f8f9fa;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 1.5rem;
    text-align: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.stat-card h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: #666;
}

.stat-value {
    font-size: 1.5rem;
    font-weight: bold;
    color: #2c3e50;
    margin: 0;
}

.stat-card small {
    display: block;
    margin-top: 0.5rem;
    color: #999;
    font-size: 0.8rem;
}
</style>
