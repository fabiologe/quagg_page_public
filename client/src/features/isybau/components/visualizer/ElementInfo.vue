<template>
  <Transition name="slide-up">
    <div
      v-if="selectedElement"
      ref="panelEl"
      class="info-window"
      :class="{ dragging: isDragging }"
      :style="dragStyle"
      @click.stop
      @mousedown.stop
      @wheel.stop
    >
      <div class="info-header" @mousedown="startDrag">
        <h3>{{ typeLabel }} {{ readonly ? 'Ergebnisse' : 'Bearbeiten' }}</h3>
        <button title="Schließen" aria-label="Schließen" @click="$emit('close')" class="close-btn" @mousedown.stop>·×</button>
      </div>
      
      <div class="info-content">
        <!-- Common ID Display -->
        <div class="info-row">
          <span class="label">ID:</span>
          <span class="value">{{ localData.id }}</span>
        </div>

        <!-- ================= SIMULATION RESULTS ================= -->
        <div v-if="currentResult" class="info-group result-box">
             <div class="result-header">Simulation (Maxima)</div>

             <!-- Warning Badges -->
             <div v-if="currentResult.floodWarning" class="flood-badge">
                 ⚠️ ÜBERSTAUT: {{ Math.round(currentResult.floodVolume) }} m³
                 <div class="sub-text">(über den Deckel ausgetreten)</div>
             </div>
             <div v-else-if="currentResult.surcharged" class="flood-badge surcharge-badge">
                 Eingestaut (Wasserspiegel über Rohrscheitel)
             </div>
             <div v-if="currentResult.continuityWarning" class="flood-badge">
                 ⚠️ Kontinuitätsfehler {{ currentResult.continuityError?.toFixed(1) }} % — Ergebnis unzuverlässig
             </div>
             <div v-if="relatedLinkId" class="link-hint-box">
                 ⚙️ Hydraulisches Ergebnis (Durchfluss, Auslastung) siehe Haltung <strong>{{ relatedLinkId }}</strong> im Ergebnis-Modal.
             </div>

             <!-- Node Results -->
             <template v-if="elementType === 'node'">
                 <div class="info-row compact">
                     <span class="label">Max. Tiefe:</span>
                     <span class="value" :class="{'text-red': currentResult.isFlooded}">
                         {{ currentResult.maxDepth?.toFixed(3) }} m
                     </span>
                 </div>
                 <div class="info-row compact" v-if="currentResult.volume != null">
                     <span class="label">Max. Volumen:</span>
                     <span class="value">{{ Math.round(currentResult.volume) }} m³</span>
                 </div>
                 <div class="info-row compact" v-if="currentResult.vmax != null">
                     <span class="label">Vmax (möglich):</span>
                     <span class="value">{{ Math.round(currentResult.vmax) }} m³</span>
                 </div>
             </template>

             <!-- Edge Results -->
             <template v-if="elementType === 'edge'">
                 <div class="info-row compact" v-if="currentResult.maxFlow != null">
                     <span class="label">Max. Abfluss:</span>
                     <span class="value">{{ currentResult.maxFlow.toFixed(1) }} l/s</span>
                 </div>
                 <div class="info-row compact" v-if="currentResult.maxVelocity != null">
                     <span class="label">Max. Geschwindigkeit:</span>
                     <span class="value">{{ currentResult.maxVelocity.toFixed(2) }} m/s</span>
                 </div>
                 <div v-if="currentResult.utilizationText" class="info-row compact">
                     <span class="label">Auslastung:</span>
                     <span class="value" :style="currentResult.utilizationStyle">
                         {{ currentResult.utilizationText }}
                     </span>
                 </div>
             </template>
        </div>


        <!-- ================= EDGE EDITOR ================= -->
        <template v-if="!readonly && elementType === 'edge'">
             <div class="info-group">
                <label>Material</label>
                <PixelSelect v-model="localData.material" class="full-select" :options="materialOptionen"
                             @change="updateRoughness" />
             </div>
             
             <div class="info-group">
                 <label>Rauheit (kst)</label>
                 <input type="number" v-model.number="localData.roughness" class="full-input">
             </div>

             <div class="info-group">
                 <label>Profil</label>
                 <PixelSelect v-model="localData.profile.type" class="full-select" :options="PROFIL_OPTIONEN"
                              @change="onProfileChange" />
             </div>

             <div class="flex-row">
                 <div class="info-group half">
                     <label>{{ localData.profile.type === 8 ? 'Höhe' : 'Höhe/DN' }} (mm)</label>
                     <input type="number" v-model.number="localData.profile.height" class="full-input">
                 </div>
                 <div class="info-group half">
                     <label>Breite (mm)</label>
                     <input type="number" v-model.number="localData.profile.width" :disabled="localData.profile.type === 0" class="full-input">
                 </div>
             </div>

             <div v-if="localData.profile.type === 8" class="info-group">
                 <label>Böschungsneigung (1:n)</label>
                 <input type="number" v-model.number="localData.profile.slope" class="full-input" placeholder="1.5">
             </div>

             <div class="flex-row">
                 <div class="info-group half">
                     <label>Z1 (Einlauf)</label>
                     <input type="number" v-model.number="localData.z1" step="0.01" class="full-input">
                 </div>
                 <div class="info-group half">
                     <label>Z2 (Auslauf)</label>
                     <input type="number" v-model.number="localData.z2" step="0.01" class="full-input">
                 </div>
             </div>
        </template>

        <!-- ================= NODE EDITOR ================= -->
        <template v-else-if="!readonly && elementType === 'node'">
            <div class="info-group">
                <label>Typ</label>
                <PixelSelect v-model="localData.type" class="full-select" :options="typOptionen" />
            </div>

            <div class="flex-row">
                <div class="info-group half">
                    <label>Deckelhöhe (m)</label>
                    <input type="number" v-model.number="localData.coverZ" step="0.01" class="full-input">
                </div>
                <div class="info-group half">
                    <label>Sohlhöhe (m)</label>
                    <input type="number" v-model.number="localData.z" step="0.01" class="full-input">
                </div>
            </div>
            <div class="info-group">
                <label>Tiefe (m)</label>
                <div class="value-display">{{ derivedDepth != null ? derivedDepth.toFixed(2) : '–' }}</div>
                <small class="hint-text">Automatisch aus Deckelhöhe − Sohlhöhe.</small>
            </div>

            <!-- Conditional Inputs based on Type -->
             <div v-if="[14, 'Standard', 'Bauwerk'].includes(localData.type)" class="info-group">
                 <label>Konst. Zufluss (l/s)</label>
                 <input type="number" v-model.number="localData.constantInflow" step="0.1" class="full-input">
             </div>

             <!-- 10, 11, 14: Rechen/Sieb/Einlaufbauwerk -->
             <div v-if="[10, 11, 14].includes(localData.type)" class="info-group">
                 <label>Verlustbeiwert (Eintritt)</label>
                 <input type="number" v-model.number="localData.lossCoeff" step="0.1" min="0" class="full-input" :title="lossCoeffHint(localData.type)">
                 <span class="hint-text">{{ lossCoeffHint(localData.type) }}</span>
             </div>

             <!-- 1, 6: Pumpwerk/Pumpe -->
             <template v-if="[1, 6].includes(localData.type)">
                 <div class="flex-row">
                     <div class="info-group half">
                         <label>Förderleistung (l/s)</label>
                         <input type="number" v-model.number="localData.pumpRate" step="0.1" class="full-input">
                     </div>
                     <div class="info-group half">
                         <label>Förderhöhe (m)</label>
                         <input type="number" v-model.number="localData.pumpHead" step="0.1" class="full-input">
                     </div>
                 </div>
                 <div class="flex-row">
                     <div class="info-group half">
                         <label>Einschalt (m)</label>
                         <input type="number" v-model.number="localData.onDepth" step="0.1" class="full-input">
                     </div>
                     <div class="info-group half">
                         <label>Ausschalt (m)</label>
                         <input type="number" v-model.number="localData.offDepth" step="0.1" class="full-input">
                     </div>
                 </div>
                 <!-- Nur wenn der Knoten tatsächlich zu einem SWMM-PUMP3-Sonderlink wird
                      (Bauwerkstyp 6) — Typ 1 "Pumpwerk" kann je nach Volumen stattdessen
                      als [STORAGE] landen (siehe classifyPreview in utils/mappings.js) und
                      hätte dann gar keine Pumpenkennlinie. -->
                 <PumpCurvePreview v-if="isPumpLink" :node="localData" />
             </template>

             <!-- 2, 3, 4, 12, 13: Becken/Speicher -->
             <template v-if="[2, 3, 4, 12, 13].includes(localData.type)">
                 <div class="info-group">
                     <label>Speichervolumen (m³)</label>
                     <input type="number" v-model.number="localData.volume" step="1" class="full-input">
                 </div>
                 <div class="flex-row">
                     <div class="info-group half">
                         <label>Max. Tiefe (m)</label>
                         <input type="number" v-model.number="localData.maxDepth" step="0.1" class="full-input">
                     </div>
                     <div class="info-group half">
                         <label>Start-Tiefe (m)</label>
                         <input type="number" v-model.number="localData.initDepth" step="0.1" class="full-input">
                     </div>
                 </div>
                 <div class="info-group">
                     <label>Form</label>
                     <PixelSelect v-model="localData.storageShape" class="full-select" :options="SPEICHERFORM_OPTIONEN" />
                 </div>
             </template>

             <!-- 7: Wehr -->
             <template v-if="localData.type === 7">
                 <div class="flex-row">
                     <div class="info-group half">
                         <label>Wehrhöhe (m)</label>
                         <input type="number" v-model.number="localData.weirHeight" step="0.01" class="full-input">
                     </div>
                     <div class="info-group half">
                         <label>Breite (m)</label>
                         <input type="number" v-model.number="localData.wehrWidth" step="0.01" class="full-input">
                     </div>
                 </div>
                 <div class="info-group">
                     <label>Kronenform</label>
                     <PixelSelect class="full-select" :model-value="presetKeyFor(localData.dischargeCoeff)"
                                  :options="KRONENFORM_OPTIONEN"
                                  @update:model-value="localData.dischargeCoeff = parseFloat($event) || localData.dischargeCoeff" />
                 </div>
                 <div class="info-group">
                     <label>Beiwert Cw</label>
                     <input type="number" v-model.number="localData.dischargeCoeff" step="0.01" class="full-input">
                 </div>
             </template>

             <!-- 8: Drossel -->
             <div v-if="localData.type === 8" class="info-group">
                 <label>Max. Abfluss (l/s)</label>
                 <input type="number" v-model.number="localData.maxOutflow" step="0.1" class="full-input">
             </div>

             <!-- 9: Schieber -->
             <template v-if="localData.type === 9">
                 <div class="info-group">
                     <label>Öffnung (0-1)</label>
                     <input type="number" v-model.number="localData.initialOpening" step="0.1" min="0" max="1" class="full-input">
                 </div>
                 <div class="info-group">
                     <label>Schieberbreite (m)</label>
                     <input type="number" v-model.number="localData.gateWidth" step="0.05" class="full-input">
                 </div>
             </template>

            <!-- EIN Schalter, wie in der Datenbearbeitung. Das zweite
                 Modellfeld (isManhole, aus ISYBAU-Status 2) führt
                 setzeDruckdicht mit — siehe dort. -->
            <div class="info-group checkbox-row">
                <input type="checkbox" id="druckdicht" :checked="localData.canOverflow === false" @change="setzeDruckdicht($event.target.checked)">
                <label for="druckdicht">Druckdicht (kein Überstau)</label>
            </div>
        </template>

        <!-- ================= AREA EDITOR ================= -->
        <template v-else-if="!readonly && elementType === 'area'">
            <div class="info-group">
                <label>Fläche (ha)</label>
                <div class="value-display">{{ localData.size?.toFixed(4) }}</div>
            </div>
            
             <div class="info-group">
                 <label>Versiegelungsgrad ψ (0.0 - 1.0)</label>
                 <input type="number" v-model.number="localData.runoffCoeff" step="0.05" min="0" max="1" class="full-input">
             </div>

             <div class="info-group">
                 <label>Neigungsklasse</label>
                 <div class="input-with-pick">
                     <PixelSelect v-model="localData.slope" class="full-select" :options="NEIGUNG_OPTIONEN"
                                  placeholder="– wählen –" />
                     <button type="button" class="pick-btn" @click="suggestSlope" :disabled="!store.terrain" :title="store.terrain ? 'Neigung aus DGM ermitteln' : 'Kein DGM geladen'">
                         <img src="/saintv1d/icons/Health-Brain-1--Streamline-Pixel.svg" alt="Neigung ermitteln" class="pick-icon" />
                     </button>
                 </div>
             </div>

             <div class="info-group">
                 <label>Anschluss Knoten (ID)</label>
                 <div class="input-with-pick">
                     <input type="text" v-model="localData.nodeId" class="full-input" placeholder="Schacht ID">
                     <button type="button" class="pick-btn" @click="pickNodeIntoLocalData" title="Knoten im Viewer wählen">
                         <img src="/saintv1d/icons/Interface-Essential-Cursor-Click-Point--Streamline-Pixel.svg" alt="Wählen" class="pick-icon" />
                     </button>
                 </div>
             </div>

             <div class="info-group">
                 <button type="button" class="secondary-btn full-width" @click="showSchmutzfracht = true">
                     {{ localData.schmutzfracht ? '✓ Schmutzfracht-Daten bearbeiten' : '+ Schmutzfracht-Daten' }}
                 </button>
             </div>
             <SchmutzfrachtDialog
                 :is-open="showSchmutzfracht"
                 :model-value="localData.schmutzfracht"
                 :area-size="localData.size"
                 @close="showSchmutzfracht = false"
                 @update:modelValue="onSchmutzfrachtSave"
             />
        </template>

      </div>
      
      <div class="info-footer">
          <button v-if="!readonly" @click="save" class="primary-btn full-width">
            <img class="ic" src="/saintv1d/icons/Interface-Essential-Floppy-Disk--Streamline-Pixel.svg" /> Speichern
          </button>
          <button @click="store.openPreprocessingFor(selectedElement.id, elementType)" class="secondary-btn full-width" style="margin-top:var(--isy-space-2)"
                  title="Öffnet 'Daten bearbeiten' mit diesem Element vorselektiert">
            <img class="ic" src="/saintv1d/icons/Interface-Essential-Setting-Slide--Streamline-Pixel.svg" /> Bearbeiten (Tabelle)
          </button>
          <button @click="$emit('show-details', selectedElement)" class="secondary-btn full-width" style="margin-top:var(--isy-space-2)">
            <img class="ic" src="/saintv1d/icons/Interface-Essential-Expand-3--Streamline-Pixel.svg" /> Ergebnisse
          </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue';
import { useIsybauStore } from '../../store/index.js';
import { getMapping, getRoughness, MaterialRoughness, Bauwerkstyp, WeirCrestPresets, LINK_BAUWERKSTYPEN, LINK_SECTION_BY_BTYP, getEffectiveBauwerkstyp, resolveNodeUiType, lossCoeffHint, Neigungsklasse, optionenAusZuordnung, optionenAusSchluesseln } from '../../utils/mappings.js';
// EINE Regel für die Überstau-Kopplung — geteilt mit dem Node-Modell und
// PreprocessingModal.vue.
import { normalizeOverflowState } from '../../core/domain/Node.js';
import { depthFromCoverAndZ } from '../../utils/heightCoupling.js';
import { suggestSlopeClassFromTerrain } from '../../utils/slopeSuggestion.js';
import PumpCurvePreview from '../common/PumpCurvePreview.vue';
import SchmutzfrachtDialog from '../common/SchmutzfrachtDialog.vue';
import PixelSelect from '../common/PixelSelect.vue';
import { haltungsZustand, knotenZustand } from '../../utils/typPalette.js';

const presetKeyFor = (cw) => {
    const match = WeirCrestPresets.find(p => Math.abs(p.cw - cw) < 0.005);
    return match ? match.cw : '';
};

/* Eintraege der Auswahlfelder (PixelSelect.vue bekommt sie als Array statt als
   <option>-Kinder). Reihenfolge und Beschriftungen wie zuvor. */
const PROFIL_OPTIONEN = [
    { value: 0, label: 'Kreisprofil' },
    { value: 1, label: 'Eiprofil' },
    { value: 2, label: 'Maulprofil' },
    { value: 3, label: 'Rechteck (geschlossen)' },
    { value: 5, label: 'Rechteck (offen)' },
    { value: 8, label: 'Trapezprofil' },
    { value: 13, label: 'Andere' },
];
const SPEICHERFORM_OPTIONEN = [
    { value: 'PRISMATIC', label: 'Prismatisch (konstante Fläche)' },
    { value: 'CONICAL', label: 'Trichterförmig (linear)' },
    { value: 'PYRAMIDAL', label: 'Pyramidal (quadratisch)' },
];
const KRONENFORM_OPTIONEN = [
    { value: '', label: '— Kronenform wählen —' },
    ...WeirCrestPresets.map(p => ({ value: p.cw, label: p.label })),
];
const NEIGUNG_OPTIONEN = optionenAusZuordnung(Neigungsklasse, { mitNummer: true });
const typOptionen = computed(() => [
    { value: 'Standard', label: 'Schacht (Standard)' },
    { value: 'Bauwerk', label: 'Bauwerk (Allgemein)' },
    ...optionenAusZuordnung(Bauwerkstyp),
]);
/* Ein Material, das die Zuordnung nicht kennt (aus fremden XML-Dateien), muss
   waehlbar bleiben — sonst faellt es beim ersten Anfassen still auf ein
   anderes. */
const materialOptionen = computed(() => {
    const bekannt = optionenAusSchluesseln(MaterialRoughness);
    const eigen = localData.value?.material;
    return (eigen && !MaterialRoughness[eigen])
        ? [...bekannt, { value: eigen, label: eigen }]
        : bekannt;
});

// Zeigt die Kennlinien-Vorschau nur, wenn der Knoten wirklich als [PUMPS]-
// Sonderlink gebaut wird (siehe SwmmBuilder.addLinks()) — Typ 1 "Pumpwerk" kann
// je nach Volumen stattdessen zu [STORAGE] klassifiziert werden (classifyPreview).
const isPumpLink = computed(() => LINK_SECTION_BY_BTYP[getEffectiveBauwerkstyp(localData.value)] === '[PUMPS]');

const store = useIsybauStore();

const props = defineProps({
  selectedElement: Object,
  hydraulics: Map,
  nodeResults: Map,
  edges: Map,
  // Ergebnisansicht: keine Editier-Felder, kein Speichern (siehe IsybauViewer.readonly)
  readonly: { type: Boolean, default: false },
});

// Pumpe/Wehr/Drossel/Schieber (Bauwerkstyp 6/7/8/9) sind in SWMM LINKS — benannt
// nach der ausgehenden Haltung dieses Knotens. Das reale Hydraulik-Ergebnis liegt
// dort, nicht am Knoten selbst; rein informativ (kein Sprung, da diese Popover in
// zwei unabhängigen Selektions-Kontexten laufen — Editor vs. Ergebnisansicht).
const relatedLinkId = computed(() => {
    if (elementType.value !== 'node' || !props.edges) return null;
    const btyp = props.selectedElement?.bauwerkstyp ?? props.selectedElement?.type;
    if (!LINK_BAUWERKSTYPEN.has(btyp)) return null;
    const edge = Array.from(props.edges.values()).find(e => e.fromNodeId === props.selectedElement.id);
    return edge?.id ?? null;
});

const emit = defineEmits(['close', 'save', 'show-details']);

// --- Verschiebbarkeit ---
// Das Popover hängt per CSS mittig im Viewer. Beim ersten Ziehen wechseln
// wir auf explizite left/top-Koordinaten (relativ zum .isybau-viewer-Container,
// dem einzigen positionierten Vorfahren) und lassen die Position danach über
// Elementwechsel hinweg bestehen (wie ein frei schwebendes Werkzeugfenster).
const panelEl = ref(null);
const isDragging = ref(false);
const dragPos = ref(null); // { left, top } in px, oder null = Default-Ecke unten rechts
let dragStartX = 0, dragStartY = 0, dragBaseLeft = 0, dragBaseTop = 0;

const dragStyle = computed(() => {
    if (!dragPos.value) return {};
    // transform zuruecksetzen: die Default-Position ist ueber
    // translate(-50%,-50%) zentriert, beim Ziehen zaehlen aber die echten
    // left/top-Pixel — sonst saesse das Panel um die halbe Groesse versetzt.
    return {
        left: `${dragPos.value.left}px`, top: `${dragPos.value.top}px`,
        right: 'auto', bottom: 'auto', transform: 'none',
    };
});

const startDrag = (e) => {
    if (e.button !== 0) return;
    const panel = panelEl.value;
    const container = panel?.parentElement;
    if (!panel || !container) return;

    const panelRect = panel.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    dragBaseLeft = panelRect.left - containerRect.left;
    dragBaseTop = panelRect.top - containerRect.top;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    isDragging.value = true;
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);
};

const onDrag = (e) => {
    if (!isDragging.value) return;
    dragPos.value = {
        left: dragBaseLeft + (e.clientX - dragStartX),
        top: dragBaseTop + (e.clientY - dragStartY)
    };
};

const stopDrag = () => {
    isDragging.value = false;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
};

onUnmounted(stopDrag);

// Local State Copy
const localData = ref({});
const showSchmutzfracht = ref(false);

// Live-Anzeige der Tiefe (Deckelhöhe - Sohlhöhe) — der eigentliche Store-Wert
// wird weiterhin erst bei save() geschrieben (siehe payload.depth dort), hier
// nur die sofortige Rückmeldung fürs Tippen.
const derivedDepth = computed(() => depthFromCoverAndZ(localData.value.coverZ, localData.value.z));



const elementType = computed(() => {
    if (!props.selectedElement) return null;
    if (props.selectedElement.from || props.selectedElement.fromNodeId) return 'edge';
    if (props.selectedElement.points) return 'area';
    return 'node';
});

const typeLabel = computed(() => {
    switch (elementType.value) {
        case 'edge': return 'Haltung';
        case 'area': return 'Fläche';
        case 'node': return 'Schacht/Bauwerk';
        default: return 'Element';
    }
});

function initLocalData(el) {
    // Deep Clone basic props
    const data = JSON.parse(JSON.stringify(el));
    
    // Normalization logic similar to PreprocessingModal
    if (elementType.value === 'edge') {
        // Ensure profile exists
        if (!data.profile) data.profile = { type: 0, height: 0, width: 0 };
        // Convert m -> mm for display if needed? 
        // Existing PreprocessingModal converts m to mm for display.
        // Let's assume store has meters. We want inputs in mm.
        data.profile.height = (data.profile.height || 0) * 1000;
        data.profile.width = (data.profile.width || 0) * 1000;
        
        if (!data.roughness) data.roughness = getRoughness(data.material);
    } 
    else if (elementType.value === 'node') {
        // Ensure standard fields
        if (data.coverZ === undefined) data.coverZ = data.z + (data.depth || 0);
        if (data.isManhole === undefined) data.isManhole = true;
        if (data.canOverflow === undefined) data.canOverflow = data.isManhole !== false;
        // Importierte Bauwerke tragen den konkreten Typ in `bauwerkstyp`, das
        // Dropdown bindet aber an `type` — ohne diese Auflösung stand dort für
        // JEDES importierte Bauwerk "Bauwerk (Allgemein)" statt Pumpe/Wehr/…
        // (gemeinsame Logik mit PreprocessingModal, siehe mappings.js).
        data.type = resolveNodeUiType(el);
    }
    else if (elementType.value === 'area') {
        // Legacy/ungültige Werte (z.B. alter Prozent-Rohwert) nicht als Klasse vorspiegeln
        if (![1, 2, 3, 4, 5].includes(data.slope)) data.slope = null;
    }

    localData.value = data;
}

// Result Computation — liest die Summary-Objekte des ResultsAssembler
// (nodes/edges aus store.simulation.results), keine Zeitschritt-Daten.
const currentResult = computed(() => {
    // NODE LOGIC
    if (elementType.value === 'node') {
        if (!props.nodeResults || !props.selectedElement) return null;

        const res = props.nodeResults.get(props.selectedElement.id);
        if (!res) return null;

        const floodVolume = res.floodingVolume || 0; // Parser liefert bereits m³
        const continuityError = res.continuityError ?? null;

        return {
            maxDepth: res.maxDepth || 0,
            // Volumen/Vmax nur bei Speichern (Becken) — bei Schächten bedeutungslos (P1.4)
            volume: res.type === 'STORAGE' ? (res.maxVolumeStored ?? null) : null,
            vmax: res.type === 'STORAGE' ? (res.maxAvailableVolume ?? null) : null,
            // eine Regel für alle Anzeigen (typPalette.knotenZustand)
            isFlooded: knotenZustand(res) === 'überstaut',
            surcharged: knotenZustand(res) === 'eingestaut',
            floodWarning: knotenZustand(res) === 'überstaut',
            floodVolume,
            continuityError,
            continuityWarning: continuityError !== null && Math.abs(continuityError) >= 10
        };
    }

    // EDGE LOGIC
    if (elementType.value === 'edge') {
        if (!props.hydraulics || !props.selectedElement) return null;
        const res = props.hydraulics.get(props.selectedElement.id);
        if(!res) return null;

        // Q/Qvoll und Einstau aus EINER Regel (typPalette.haltungsZustand); vorher stand
        // hier h/hvoll als „Auslastung" mit eigenen Schwellen und Farben.
        const z = haltungsZustand(res);
        const displayText = z.auslastung == null ? null
            : `${Math.round(z.auslastung)} % Q/Qvoll${z.eingestaut ? ' · eingestaut' : ''}`;
        const displayStyle = z.farbe ? { color: z.farbe, fontWeight: 'bold' } : {};

        return {
            maxFlow: res.maxFlow ?? null,
            maxVelocity: res.maxVelocity ?? null,
            utilizationText: displayText,
            utilizationStyle: displayStyle,
        };
    }

    return null;
});

// Actions
const updateRoughness = () => {
    localData.value.roughness = getRoughness(localData.value.material);
};

const onProfileChange = () => {
    if (localData.value.profile.type === 8) { // Trapez
        localData.value.material = 'Erde';
        localData.value.roughness = 25;
    }
};


// Schmutzfracht hat eine eigene "Speichern"/"Daten entfernen"-Aktion im
// Sub-Dialog. Die darf NICHT nur in localData landen wie die übrigen Felder,
// sonst geht sie beim nächsten initLocalData() (Elementwechsel) oder beim
// Schließen ohne Klick auf die separate äußere "Speichern"-Schaltfläche
// verloren — genau das war der gemeldete Bug (Daten in ElementInfo gespeichert,
// aber im PreprocessingModal nicht vorhanden). Deshalb sofortiges,
// eigenständiges Commit an den Store — nur schmutzfracht, keine anderen evtl.
// noch unfertigen Feldänderungen, und kein emit('close').
const onSchmutzfrachtSave = (schmutzfracht) => {
    localData.value.schmutzfracht = schmutzfracht;
    emit('save', { id: localData.value.id, type: 'area', data: { schmutzfracht } });
};

// Knoten im Viewer wählen statt Text-ID eintippen (siehe store.startPickRef()
// für die Funktionsweise). Schreibt direkt in localData, nicht in den Store —
// der äußere "Speichern"-Button committet wie gewohnt.
const pickNodeIntoLocalData = () => {
    store.startPickRef('node', (id) => { localData.value.nodeId = id; });
};

// Neigungsklasse aus dem geladenen DGM vorschlagen (nur Button-getriggert,
// keine automatische Herleitung — siehe Build-Test-Fixliste-Session).
const suggestSlope = () => {
    if (!store.terrain || !localData.value.points) return;
    const result = suggestSlopeClassFromTerrain(localData.value.points, store.terrain);
    if (result) {
        localData.value.slope = result.slopeClass;
    } else {
        console.warn('Neigung aus DGM: keine gültigen Höhendaten innerhalb der Fläche gefunden.');
    }
};

/**
 * „Druckdicht" umlegen — derselbe einzige Schalter wie in
 * PreprocessingModal.vue, über dieselbe Regel (normalizeOverflowState in
 * core/domain/Node.js).
 *
 * Abwählen heißt „soll überstauen können", und das setzt einen Deckel voraus:
 * isManhole wird mitgeführt. Unbedenklich, weil das Flag keine andere Wirkung
 * hat — der ISYBAU-Export schreibt `status`, der SwmmBuilder nutzt es nur als
 * Überstau-Sperre.
 */
const setzeDruckdicht = (druckdicht) => {
    Object.assign(localData.value, normalizeOverflowState({
        isManhole: druckdicht ? localData.value.isManhole : true,
        canOverflow: !druckdicht,
    }));
};

const save = () => {
    // Convert back to store format
    const payload = { ...localData.value };

    if (elementType.value === 'edge') {
        // Convert mm -> m
        payload.profile.height = payload.profile.height / 1000;
        payload.profile.width = payload.profile.width / 1000;
    }
    else if (elementType.value === 'node') {
        // Ensure Depth is calculated if Z changed?
        // Store expects z and coverZ usually.
        // If we update z and coverZ, depth is implicitly coverZ - z.
        // But store might use 'depth' property.
        payload.depth = payload.coverZ - payload.z;
    }

    emit('save', { id: payload.id, type: elementType.value, data: payload });
    emit('close');
};


// Watch for selection changes to re-init. deep:true ist nötig, weil
// store.updateNetworkData() (PreprocessingModal "Übernehmen") Node/Edge-
// Objekte per Object.assign IN-PLACE mutiert (gleiche Referenz) — ohne
// deep:true feuert dieser Watcher dann nicht, weil sich props.selectedElement
// selbst nicht ändert, nur seine Felder. localData ist ein reiner JSON-Klon
// (initLocalData), also keine Rückkopplung durch eigene Eingaben des Nutzers.
watch(() => props.selectedElement, (val) => {
    if (val) initLocalData(val);
}, { immediate: true, deep: true });
</script>

<style scoped>
/* Mittig statt unten rechts: dort sitzt die Tutorial-Ratte (fixed, bottom:5px,
   right:~1rem) — das Panel erschien exakt hinter ihr. Verschieben bleibt
   moeglich, dann uebernehmen left/top aus dragStyle (inkl. transform:none,
   sonst zoege die Zentrier-Verschiebung um die halbe Panelbreite mit). */
.info-window {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 320px;
  max-height: 70vh;
  background: var(--isy-pixel-bg-deep);
  border-radius: var(--isy-radius-lg);
  box-shadow: var(--isy-elev-3);
  display: flex;
  flex-direction: column;
  z-index: var(--isy-z-panel);
  overflow: hidden;
  border: 1px solid var(--isy-pixel-border);
}

.info-window.dragging {
  user-select: none;
  box-shadow: var(--isy-elev-4);
}

.info-header {
  background: var(--isy-pixel-bg);
  padding: var(--isy-space-3) var(--isy-space-4);
  border-bottom: 2px solid var(--isy-pixel-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: var(--isy-cursor-pan);
}

.info-window.dragging .info-header {
  cursor: var(--isy-cursor-pan);
}

.info-header h3 {
  margin: 0;
  font-family: var(--isy-pixel-font);
  font-size: var(--isy-fs-pixel-md);
  color: var(--isy-pixel-green);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.close-btn {
  background: none;
  border: none;
  font-size: var(--isy-fs-xl);
  color: var(--isy-pixel-border-hover);
  cursor: var(--isy-cursor-hand);
  line-height: 1;
  transition: color 0.2s;
}
.close-btn:hover { color: var(--isy-pixel-green); }

.info-content {
  padding: var(--isy-space-4);
  overflow-y: auto;
  flex: 1;
}

.info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--isy-space-2);
    font-size: var(--isy-fs-lg);
    color: var(--isy-pixel-text-dim);
}

.info-group {
    margin-bottom: var(--isy-space-3);
}

.info-group label {
    display: block;
    font-size: var(--isy-fs-md);
    color: var(--isy-pixel-text-dim);
    margin-bottom: var(--isy-space-1);
}

.full-input, .full-select {
    width: 100%;
    padding: var(--isy-space-1);
    border: 1px solid var(--isy-pixel-border);
    border-radius: var(--isy-radius-sm);
    background: var(--isy-pixel-bg-alt);
    color: var(--isy-pixel-text);
    font-size: var(--isy-fs-lg);
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
}
.full-input:focus, .full-select:focus { border-color: var(--isy-pixel-green); }
.full-input:disabled, .full-select:disabled { opacity: 0.4; cursor: var(--isy-cursor-gesperrt); }

.flex-row {
    display: flex;
    gap: var(--isy-space-2);
}

.half {
    flex: 1;
}

.checkbox-row {
    display: flex;
    align-items: center;
    gap: var(--isy-space-2);
}

.checkbox-row input {
    margin: 0;
}

.checkbox-row label {
    margin: 0;
    font-size: var(--isy-fs-lg);
    color: var(--isy-pixel-text-dim);
}

.info-footer {
    padding: var(--isy-space-4);
    border-top: 1px solid var(--isy-pixel-border);
    background: var(--isy-pixel-bg);
}

.primary-btn {
    background: var(--isy-pixel-bg);
    color: var(--isy-pixel-text);
    border: 1px solid var(--isy-pixel-border);
    padding: var(--isy-space-2) var(--isy-space-2);
    border-radius: var(--isy-radius-md);
    cursor: var(--isy-cursor-hand);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-md);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--isy-space-2);
    transition: background 0.15s;
}
.primary-btn:hover { background: var(--isy-pixel-border); }

.ic {
    width: 14px;
    height: 14px;
    image-rendering: pixelated;
    filter: invert(63%) sepia(36%) saturate(736%) hue-rotate(103deg) brightness(99%) contrast(96%);
    flex-shrink: 0;
}

.secondary-btn {
    background: transparent;
    border: 1px solid var(--isy-pixel-border);
    color: var(--isy-pixel-text-dim);
    padding: var(--isy-space-2) var(--isy-space-2);
    border-radius: var(--isy-radius-md);
    cursor: var(--isy-cursor-hand);
    font-family: var(--isy-pixel-font);
    font-size: var(--isy-fs-pixel-md);
    transition: background 0.15s;
}

.secondary-btn:hover {
    background: var(--isy-pixel-border);
    color: var(--isy-pixel-text);
}

.full-width {
    width: 100%;
}

/* Result Styles */
.result-box {
    background: var(--isy-pixel-info-soft);
    border: 1px solid var(--isy-pixel-info-soft-border);
    padding: var(--isy-space-2);
    border-radius: var(--isy-radius-sm);
    margin-bottom: var(--isy-space-3);
}

.result-header {
    font-size: var(--isy-fs-md);
    font-weight: bold;
    color: var(--isy-pixel-info-soft-text);
    margin-bottom: var(--isy-space-1);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.flood-badge {
    background: var(--isy-pixel-danger-soft);
    border: 1px solid var(--isy-pixel-danger);
    color: var(--isy-pixel-danger-soft-text);
    padding: var(--isy-space-1);
    border-radius: var(--isy-radius-sm);
    font-weight: bold;
    text-align: center;
    margin-bottom: var(--isy-space-2);
    font-size: var(--isy-fs-lg);
    animation: pulse 2s infinite;
}

.input-with-pick { display: flex; align-items: center; gap: var(--isy-space-1); }
.input-with-pick .full-input { flex: 1; }
.pick-btn { border: none; background: none; cursor: var(--isy-cursor-hand); opacity: 0.5; padding: 0; line-height: 0; flex-shrink: 0; }
.pick-btn:hover { opacity: 1; transform: scale(1.1); }
.pick-btn:disabled { opacity: 0.2; cursor: var(--isy-cursor-gesperrt); }
.pick-btn:disabled:hover { transform: none; }
.pick-icon { width: 16px; height: 16px; display: block; }

.hint-text {
    font-size: var(--isy-fs-sm);
    color: var(--isy-pixel-border-hover);
    margin: calc(-1 * var(--isy-space-1)) 0 var(--isy-space-2) 0;
}

/* War bisher in dieser Datei genutzt (Fläche-Anzeige), aber nie definiert —
   Regel 1:1 aus ElementPropertiesModal.vue/SchmutzfrachtDialog.vue übernommen. */
.value-display { color: var(--isy-pixel-green); font-weight: 600; padding: var(--isy-space-1) 0; }

input[type="checkbox"] { accent-color: var(--isy-pixel-green); }

.link-hint-box {
    background: var(--isy-pixel-info-soft);
    border: 1px solid var(--isy-pixel-info-soft-border);
    border-radius: var(--isy-radius-sm);
    padding: var(--isy-space-2);
    margin-bottom: var(--isy-space-2);
    font-size: var(--isy-fs-sm);
    color: var(--isy-pixel-info-soft-text);
}

.surcharge-badge {
    background: var(--isy-pixel-warning-soft);
    border-color: var(--isy-pixel-warning);
    color: var(--isy-pixel-warning-soft-text);
    animation: none;
}

.sub-text {
    font-size: var(--isy-fs-sm);
    font-weight: normal;
    color: var(--isy-pixel-danger-soft-text);
}

.compact {
    margin-bottom: var(--isy-space-1);
}

.text-red {
    color: var(--isy-pixel-danger-soft-text);
    font-weight: bold;
}

@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); }
    100% { transform: scale(1); }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.28s cubic-bezier(0.34, 1.2, 0.64, 1), opacity 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(calc(100% + 2rem));
  opacity: 0;
}
</style>
