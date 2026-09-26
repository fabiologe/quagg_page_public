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
    @select-element="handleLocateFromPreprocessing"
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
    :input-text="store.simulation.fehlerBericht?.input || store.simulation.results?.input || ''"
    :report-text="store.simulation.fehlerBericht?.report || store.simulation.results?.report || ''"
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

  <EzgCrsConfirmModal
    :is-open="store.ui.showEzgCrsModal"
    :guessed-epsg="store.metadata.crs?.epsg"
    @close="handleEzgCrsCancel"
    @confirm="handleEzgCrsConfirm"
  />

  <NewProjectLocationModal
    :is-open="store.ui.showNewProjectLocationModal"
    @close="store.ui.showNewProjectLocationModal = false"
    @confirm="handleNewProjectLocationConfirm"
  />
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { obersteOffene } from '../../utils/modalEscape.js';
import { useElementFocus } from '../../composables/useElementFocus.js';

import KostraModal from './KostraModal.vue';
import ModelRainModal from './ModelRainModal.vue';
import PreprocessingModal from './PreprocessingModal.vue';
import SimulationResultsModal from './SimulationResultsModal.vue';
import SimulationDebugModal from './SimulationDebugModal.vue';
import IsybauHelpModal from './IsybauHelpModal.vue';
import ProjectManagerModal from './ProjectManagerModal.vue';
import ElementPropertiesModal from './ElementPropertiesModal.vue';
import EzgCrsConfirmModal from './EzgCrsConfirmModal.vue';
import NewProjectLocationModal from './NewProjectLocationModal.vue';
import { useEzgLayer } from '../../composables/useEzgLayer.js';

const store = useIsybauStore();

/**
 * Escape schliesst das oberste offene Modal.
 *
 * Vorher reagierte KEINES der 13 Modals auf Escape - der einzige Ausweg war
 * ein "x"-Knopf, der bis vor Kurzem nicht einmal eine Beschriftung trug, und
 * nur 6 der 13 schliessen bei einem Klick auf die Verdunkelung.
 *
 * Escape erlaubt dabei nichts Neues: es tut genau das, was der x-Knopf schon
 * tut. Auch der verwirft ohne Rueckfrage.
 *
 * EIN Listener hier statt dreizehn in den Modals - dieser Wirt kennt alle
 * Sichtbarkeits-Flags ohnehin.
 *
 * Die Reihenfolge bestimmt, welches Modal zuerst weicht. Oben stehen die, die
 * UEBER anderen erscheinen koennen: Bestaetigungen und Auswahldialoge. Je
 * Tastendruck weicht genau eines.
 *
 * Einfangphase + stopImmediatePropagation, weil IsybauEditor.vue einen eigenen
 * Escape-Handler auf window hat, der jedes aktive Werkzeug abbricht. Ohne das
 * wuerde ein Tastendruck bei offenem Modal UND aktivem Werkzeug beides tun.
 */
// Reihenfolge und Auswahl stehen in utils/modalEscape.js, damit sie ohne
// Rendern von elf Modals geprueft werden koennen (test/modalEscape.test.js).

const aufEscape = (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  // Ein aufgeklapptes Auswahlfeld (components/common/PixelSelect.vue) ist die
  // oberste Ebene und faengt Escape selbst ab. Ohne diese Zeile schloesse ein
  // Tastendruck bei offener Liste gleich das ganze Fenster: dieser Listener
  // haengt seit dem Mounten des Modals an window, der des Feldes erst seit
  // dem Aufklappen — er kaeme also zuerst dran. `defaultPrevented` hilft
  // nicht, beide sitzen in der Capture-Phase.
  if (document.querySelector('.isy-select-liste')) return;
  const flag = obersteOffene(store.ui);
  if (!flag) return;
  store.ui[flag] = false;
  e.stopImmediatePropagation();
};

onMounted(() => window.addEventListener('keydown', aufEscape, true));
onBeforeUnmount(() => window.removeEventListener('keydown', aufEscape, true));
const { focusElement } = useElementFocus();

/**
 * „Auf Karte zeigen" aus der Preprocessing-Tabelle.
 *
 * Schließt das Modal — sonst verdeckt es genau die Karte, auf die gerade
 * gesprungen wird (so war es bisher, weshalb der Button wirkungslos schien).
 * Der Weg zurück in die Tabelle bleibt über „Bearbeiten (Tabelle)" bestehen.
 */
function handleLocateFromPreprocessing({ id, type }) {
    store.ui.showPreprocessingModal = false;
    focusElement({ type, id });
}

const emit = defineEmits(['project-loaded']);

const handleLoadProject = (data) => {
    store.loadProjectSnapshot(data);
    emit('project-loaded');
};

// --- EZG-Karte: CRS-Bestätigung ---
const handleEzgCrsConfirm = (epsg) => {
    store.confirmCRS(epsg);
    useEzgLayer().refresh(); // Layer war schon "enabled", wartete nur auf Bestätigung
};

const handleEzgCrsCancel = () => {
    store.ui.showEzgCrsModal = false;
    useEzgLayer().disable(); // sonst bliebe der Toggle "aktiv" ohne sichtbaren Layer
};

// --- "Neu starten": Standort-Anker für ein leeres/neues Projekt ---
const handleNewProjectLocationConfirm = ({ epsg, x, y, label }) => {
    // Bestätigung erst hier, unmittelbar vor dem destruktiven Schritt — nicht
    // schon beim Öffnen des Modals. Suchen/Stöbern bleibt so folgenlos, erst
    // "Bestätigen & Loslegen" bei bestehendem Netz kann etwas kosten.
    if (store.nodes.size > 0) {
        if (!confirm('Neues Projekt starten? Der aktuelle Netzentwurf geht verloren.')) return;
        store.clear();
    }
    store.setOriginAnchor({ epsg, x, y, label });
    store.ui.showNewProjectLocationModal = false;
    useEzgLayer().enable(); // Luftbild/Höhenlinien sofort laden — der ganze Sinn des Features
};
</script>
