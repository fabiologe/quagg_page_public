<template>
  <DraggableModal
    :isOpen="isOpen"
    @close="close"
    initialWidth="1000"
    initialHeight="800"
  >
    <div class="simulation-results-content">

      <!-- Header -->
      <div class="modal-header">
          <h2>Simulationsergebnisse (Hydraulik)</h2>
          <div class="header-actions">
            <SimulationReportExport
              :nodes="nodes"
              :edges="edges"
              :areas="areas"
              :edge-results="edgeResults"
              :node-results="nodeResults"
              :area-results="areaResults"
              :system-stats="systemStats"
              :rain="rain"
              :total-catchment-area-ha="totalCatchmentAreaHa"
            />
            <button class="close-btn" @click="close" title="Schließen">✕</button>
          </div>
      </div>

      <!-- Top Navigation Tabs -->
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

      <!-- Tab Content — je Tab eine eigene Komponente (results/) -->
      <div class="tab-content">
        <ResultsGeneralTab
          v-if="activeTab === 'general'"
          :system-stats="systemStats"
          :rain="rain"
          :total-catchment-area-ha="totalCatchmentAreaHa"
        />
        <ResultsEdgesTab
          v-if="activeTab === 'edges'"
          :edges="edges"
          :edge-results="edgeResults"
          :system-stats="systemStats"
          :time-series="timeSeries"
          :focus-edge-id="focusEdgeId"
        />
        <ResultsNodesTab
          v-if="activeTab === 'nodes'"
          :nodes="nodes"
          :edges="edges"
          :node-results="nodeResults"
          :system-stats="systemStats"
          :time-series="timeSeries"
          @focus-edge="focusEdge"
        />
        <ResultsAreasTab
          v-if="activeTab === 'areas'"
          :areas="areas"
          :area-results="areaResults"
          :system-stats="systemStats"
          :time-series="timeSeries"
        />
      </div>

    </div>
  </DraggableModal>
</template>

<script setup>
import { ref, computed } from 'vue';
import DraggableModal from '../common/DraggableModal.vue';
import SimulationReportExport from './SimulationReportExport.vue';
import ResultsGeneralTab from './results/ResultsGeneralTab.vue';
import ResultsEdgesTab from './results/ResultsEdgesTab.vue';
import ResultsNodesTab from './results/ResultsNodesTab.vue';
import ResultsAreasTab from './results/ResultsAreasTab.vue';

const props = defineProps({
  isOpen: Boolean,
  nodes: Map,
  edges: Map,
  areas: [Map, Array],
  edgeResults: Map,
  nodeResults: Map,
  areaResults: Map,
  timeSeries: Array,
  systemStats: Object,
  rain: Object, // store.rain — enthält activeModelRain.series, method, intensity, duration
});

const emit = defineEmits(['close', 'show-debug']);

const activeTab = ref('general');

const tabs = [
    { id: 'general', label: 'Allgemein & Diagnose' },
    { id: 'edges', label: 'Haltungen (Kanal)' },
    { id: 'nodes', label: 'Schächte & Bauwerke' },
    { id: 'areas', label: 'Teilflächen' }
];

const close = () => emit('close');

// Knoten→Link-Verweis: Klick im Schächte-Tab auf "siehe Haltung X" springt in
// den Haltungen-Tab und öffnet dort direkt das Detail-Overlay dieser Haltung.
const focusEdgeId = ref(null);
const focusEdge = (edgeId) => {
    activeTab.value = 'edges';
    focusEdgeId.value = edgeId;
};

// Gesamtfläche des Einzugsgebiets aus den Input-Areas (in ha) —
// Bezugsfläche für die mm-Bilanzen (General-Tab) und den PDF-Export.
const totalCatchmentAreaHa = computed(() => {
    if (!props.areas) return 0;
    let total = 0;
    if (props.areas instanceof Map) {
        for (const a of props.areas.values()) total += parseFloat(a.size || 0);
    } else if (Array.isArray(props.areas)) {
        for (const a of props.areas) total += parseFloat(a.size || 0);
    } else {
        for (const a of Object.values(props.areas)) total += parseFloat(a.size || 0);
    }
    return total;
});
</script>

<style scoped src="./results/results-shared.css"></style>
