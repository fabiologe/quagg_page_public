<template>
  <DraggableModal name="Simulationsergebnisse"
    :isOpen="isOpen"
    @close="close"
    initialWidth="1000"
    initialHeight="800"
  >
    <div class="simulation-results-content">

      <!-- Header -->
      <div class="modal-header">
          <h2>Simulationsergebnisse (Hydraulik)</h2>
          <span v-if="veraltet" class="veraltet-hinweis" title="Netz oder Regen wurden nach dem Lauf geändert">
            Veraltet — nach dem Lauf geändert, bitte neu rechnen
          </span>
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
              :time-series="timeSeries"
              :inp="inp"
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
          :inp="inp"
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
import { rechenflaecheAusInp } from '../../utils/swmm/niederschlagsBilanz.js';

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
  inp: { type: String, default: '' }, // Eingabedatei des Laufs (Bezugsfläche der Bilanz)
  veraltet: { type: Boolean, default: false }, // Netz/Regen nach dem Lauf geändert
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

// Bezugsfläche der Bilanz: Teilflächen der GERECHNETEN .inp (nicht der aktuelle Editorstand,
// der sich nach dem Lauf ändern kann, und ohne Flächen ohne Anschluss). Rückfall: Editorfläche.
const totalCatchmentAreaHa = computed(() => {
    const ausLauf = rechenflaecheAusInp(props.inp);
    if (ausLauf > 0) return ausLauf;
    const liste = props.areas instanceof Map ? [...props.areas.values()]
        : Array.isArray(props.areas) ? props.areas : Object.values(props.areas || {});
    return liste.reduce((summe, a) => summe + (parseFloat(a.size) || 0), 0);
});
</script>

<style scoped src="./results/results-shared.css"></style>
<style scoped>
.veraltet-hinweis {
  padding: var(--isy-space-1) var(--isy-space-2);
  font-size: var(--isy-fs-sm);
  color: var(--isy-pixel-warning-soft-text);
  background: var(--isy-pixel-warning-soft);
  border: 1px solid var(--isy-pixel-warning-soft-border);
}
</style>
