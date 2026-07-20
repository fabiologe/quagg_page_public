<template>
  <!-- Zentrale Modal-Verdrahtung: Sichtbarkeit + Datenfluss laufen über store.ui,
       IsybauMain bleibt dadurch reiner View-Umschalter. -->

  <KostraModal
    v-if="store.ui.showKostraModal"
    :is-open="store.ui.showKostraModal"
    :reference-point="store.center"
    @close="store.ui.showKostraModal = false"
  />

  <ModelRainModal
    v-if="store.ui.showRainModal"
    :is-open="store.ui.showRainModal"
    :kostra-data="store.rain.kostraData"
    @close="store.ui.showRainModal = false"
  />

  <PreprocessingModal
    v-if="store.ui.showPreprocessingModal"
    :is-open="store.ui.showPreprocessingModal"
    :network="{ nodes: store.nodes, edges: store.edges }"
    :hydraulics="{ catchments: [], areas: store.areaArray }"
    @close="store.ui.showPreprocessingModal = false"
    @apply="store.applyPreprocessing"
    @select-element="({ id }) => store.flashFocus(id)"
  />

  <RunoffValidationModal
    v-if="store.ui.showValidationModal"
    :details="validationDetails"
    @close="store.ui.showValidationModal = false"
    @recalculate="({ applyLosses }) => { validationApplyLosses = applyLosses; }"
  />

  <SimulationResultsModal
    v-if="store.ui.showResultsModal"
    :is-open="store.ui.showResultsModal"
    :nodes="store.nodes"
    :edges="store.edges"
    :areas="store.areaArray"
    :edgeResults="new Map(Object.entries(store.simulation.results?.edges || {}))"
    :nodeResults="new Map(Object.entries(store.simulation.results?.nodes || {}))"
    :timeSeries="store.simulation.results?.timeSeries || []"
    :areaResults="new Map(Object.entries(store.simulation.results?.subcatchments || {}))"
    :systemStats="store.simulation.results?.systemStats || {}"
    :rain="store.rain"
    @close="store.ui.showResultsModal = false"
    @show-debug="store.ui.showDebugModal = true"
  />

  <SimulationDebugModal
    v-if="store.ui.showDebugModal"
    :is-open="store.ui.showDebugModal"
    :input-text="store.simulation.results?.input || ''"
    :report-text="store.simulation.results?.report || ''"
    @close="store.ui.showDebugModal = false"
  />

  <IsybauHelpModal
    v-if="store.ui.showHelpModal"
    :is-open="store.ui.showHelpModal"
    @close="store.ui.showHelpModal = false"
  />

  <ProjectManagerModal
    :is-open="store.ui.showProjectManager"
    :snapshot="store.projectSnapshot"
    @close="store.ui.showProjectManager = false"
    @load="handleLoadProject"
  />

  <ElementPropertiesModal
    :is-open="store.ui.showElementModal"
    :mode="store.ui.elementModal.mode"
    :element-data="store.ui.elementModal.data"
    :available-nodes="store.nodeArray"
    :available-edges="store.edgeArray"
    @close="store.ui.showElementModal = false"
    @save="store.createElement"
  />
</template>

<script setup>
import { ref, computed } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { computeRunoffValidation } from '../../utils/runoffValidation.js';

import KostraModal from './KostraModal.vue';
import ModelRainModal from './ModelRainModal.vue';
import PreprocessingModal from './PreprocessingModal.vue';
import RunoffValidationModal from './RunoffValidationModal.vue';
import SimulationResultsModal from './SimulationResultsModal.vue';
import SimulationDebugModal from './SimulationDebugModal.vue';
import IsybauHelpModal from './IsybauHelpModal.vue';
import ProjectManagerModal from './ProjectManagerModal.vue';
import ElementPropertiesModal from './ElementPropertiesModal.vue';

const store = useIsybauStore();

const emit = defineEmits(['project-loaded']);

// --- Auto-Validierung (Fließzeitverfahren) ---
// Öffnet NUR nach „Übernehmen" im Daten-bearbeiten-Modal (store.applyPreprocessing).
const validationApplyLosses = ref(false);
const validationDetails = computed(() => computeRunoffValidation({
    areas: store.areaArray,
    rain: store.rain,
    applyLosses: validationApplyLosses.value
}));

const handleLoadProject = (data) => {
    store.loadProjectSnapshot(data);
    emit('project-loaded');
};
</script>
