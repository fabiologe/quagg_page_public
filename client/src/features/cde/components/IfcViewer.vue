<template>
  <component
    :is="standalone ? 'div' : DraggableModal"
    ref="modalRef"
    :class="standalone ? 'standalone-shell' : null"
    v-bind="standalone ? {} : {
      isOpen: true,
      initialWidth: '1000px',
      initialHeight: '700px',
      initialTop: '80px',
      initialLeft: 'center',
    }"
    @close="emit('close')"
  >
    <div class="viewer-wrapper">

      <!-- ── Window chrome ── -->
      <div class="viewer-header">
        <span class="header-title"><CdeIcon name="bim" :size="14" /> That Open Engine – IFC Viewer</span>
        <div class="header-controls">
          <template v-if="!standalone">
            <button class="hdr-btn" @click="modalRef?.toggleMinimize()" title="Minimieren">_</button>
            <button class="hdr-btn" @click="modalRef?.toggleMaximize()" title="Vollbild">□</button>
          </template>
          <button class="hdr-btn hdr-close" @click="emit('close')" title="Schließen" aria-label="Schließen">
            <CdeIcon name="close" :size="13" />
          </button>
        </div>
      </div>

      <!-- ── Canvas + overlays ── -->
      <div class="viewer-body">
        <div class="canvas-root" :class="{ 'measure-cursor': measureActive }" ref="canvasRef"></div>

        <!-- Toolbar: Datei laden -->
        <div class="top-bar">
          <div class="top-bar-left">
            <label class="action-btn primary">
              <input type="file" accept=".ifc" @change="onFileUpload" class="sr-only" />
              <CdeIcon name="documents" :size="13" /> IFC laden
            </label>

            <label v-if="modelList.length" class="action-btn secondary">
              <input type="file" accept=".ifc" @change="onFileUploadAdd" class="sr-only" />
              <CdeIcon name="add" :size="13" /> Hinzufügen
            </label>

          </div>

          <div v-if="loading" class="loading-badge">
            <span class="spinner"></span> Wird geladen…
          </div>
        </div>

        <!-- Full-canvas loading overlay — hides the half-tessellated frames during initial load -->
        <IfcLoadOverlay :visible="loading" />

        <!-- Ablage-Meldung: der Server kann einen Upload ablehnen (Datei
             gleichen Namens). Das darf nicht in einem console.warn verschwinden
             — sonst steht das Modell im Viewer, aber nicht im Projekt. -->
        <Transition name="fade">
          <div v-if="ablageHinweis" class="ablage-hinweis">
            <CdeIcon name="warn" :size="14" />
            <span>{{ ablageHinweis }}</span>
            <button class="ablage-hinweis-zu" @click="ablageHinweis = null" title="Ausblenden" aria-label="Ausblenden">
              <CdeIcon name="close" :size="12" />
            </button>
          </div>
        </Transition>

        <!-- B4: Zuletzt geöffnete Modelle (lokale Ablage) — nur im Leerzustand -->
        <div v-if="!modelList.length && !loading && recentModels.length" class="recent-panel">
          <div class="recent-title">Zuletzt geöffnete Modelle</div>
          <div v-for="r in recentModels" :key="r.key" class="recent-item">
            <button class="recent-open" @click="openRecent(r)">
              <span class="recent-name">{{ r.meta?.name ?? r.key }}</span>
              <span class="recent-info">{{ fmtBytes(r.size) }} · {{ fmtDate(r.meta?.savedAt) }}</span>
            </button>
            <button class="recent-del" @click="deleteRecent(r)" title="Aus lokalem Speicher entfernen" aria-label="Aus lokalem Speicher entfernen">
              <CdeIcon name="close" :size="12" />
            </button>
          </div>
          <div class="recent-hint">Im Browser gespeichert — ohne Netzverbindung verfügbar.</div>
        </div>

        <!-- B2: Model tags in separate row below top-bar -->
        <div v-if="modelList.length" class="model-tag-row">
          <span v-for="m in modelList" :key="m.modelId" class="model-tag">
            {{ m.name }}
            <button class="tag-close" @click="removeModel(m.modelId)" title="Entfernen" aria-label="Modell entfernen">
              <CdeIcon name="close" :size="11" />
            </button>
          </span>
        </div>

        <!-- Kamera-Toolbox (links) -->
        <!-- Werkzeugleiste — datengetrieben aus `toolbarItems` (Sprint U):
             eine Quelle für Icon, Beschriftung, Tastenkürzel und Aktion. -->
        <div class="toolbox">
          <template v-for="(t, i) in toolbarItems" :key="t.id ?? `div-${i}`">
            <div v-if="t.divider" class="tool-divider"></div>
            <button
              v-else
              class="tool-btn"
              :class="{ active: t.active }"
              :title="t.key ? `${t.title} [${t.key}]` : t.title"
              @click="t.action()"
            >
              <CdeIcon :name="t.icon" :size="17" />
              <small>{{ t.label }}</small>
            </button>
          </template>
        </div>

        <!-- B3: Section-Cut Bar — centered, with snap + mode + position readout -->
        <Transition name="section-slide">
          <div v-if="showSectionBar" class="section-bar">
            <span class="section-label"><CdeIcon name="section" :size="15" /></span>

            <!-- SC-1: Snap-to-axis buttons -->
            <div class="section-snaps">
              <button class="snap-btn" title="Horizontal (Grundriss)" @click="snapSection('horizontal')">H</button>
              <button class="snap-btn" title="Senkrecht X-Achse"      @click="snapSection('x')">X</button>
              <button class="snap-btn" title="Senkrecht Z-Achse"      @click="snapSection('z')">Z</button>
            </div>

            <div class="section-sep"></div>

            <!-- Mode buttons -->
            <div class="section-modes">
              <button
                class="mode-btn"
                :class="{ active: sectionMode === 'translate' }"
                title="Verschieben [T]"
                @click="setSectionMode('translate')"
              >↕ Verschieben</button>
              <button
                class="mode-btn"
                :class="{ active: sectionMode === 'rotate' }"
                title="Drehen [R]"
                @click="setSectionMode('rotate')"
              >⟳ Drehen</button>
            </div>

            <!-- SC-2: Position readout -->
            <span v-if="sectionPosition" class="section-pos">
              Y&thinsp;{{ sectionPosition.y }}&thinsp;m
            </span>

            <div class="section-sep"></div>

            <!-- SC-4: Reset position to model center -->
            <button class="snap-btn" title="Zur Modellmitte zurücksetzen" aria-label="Zur Modellmitte zurücksetzen" @click="resetSection">
              <CdeIcon name="refresh" :size="12" />
            </button>
            <!-- Blendet nur die Leiste aus; die Schnittebene bleibt aktiv.
                 Erst der Schnitt-Knopf in der Werkzeugleiste entfernt sie ganz. -->
            <button class="section-close" @click="hideSection" title="Werkzeug ausblenden [Esc]" aria-label="Schnitt-Werkzeugleiste ausblenden">
              <CdeIcon name="close" :size="12" />
            </button>
          </div>
        </Transition>

        <!-- B1: Koordinatenanzeige — centered bottom -->
        <div v-if="coords" class="coord-bar">
          <span class="coord-mode-badge">{{ coordMode === 'ifc' ? 'IFC' : 'Viewer' }}</span>
          <span v-if="coordMode === 'viewer'"><b>X</b> {{ coords.x }}&thinsp;m</span>
          <span v-if="coordMode === 'viewer'"><b>Y</b> {{ coords.y }}&thinsp;m</span>
          <span v-if="coordMode === 'viewer'"><b>Z</b> {{ coords.z }}&thinsp;m</span>
          <span v-if="coordMode === 'ifc'"><b>X</b> {{ coords.ox }}&thinsp;m</span>
          <span v-if="coordMode === 'ifc'"><b>Y</b> {{ coords.oy }}&thinsp;m</span>
          <span v-if="coordMode === 'ifc'"><b>Z</b> {{ coords.oz }}&thinsp;m</span>
        </div>

        <!-- Sprint U/AP-U4: Werte und Aktionen am Objekt statt in Bildschirmecken.
             Auswahl-Knöpfe und Messliste sind ins HUD gewandert. -->
        <CdeHudLayer
          :measurements="measurements"
          :element="ifc.selectedElement"
          :elementAnker="selectionAnchor"
          :projectToScreen="(p) => engine?.projectToScreen(p)"
          :getCamera="() => engine?._getWorld()?.camera?.three ?? null"
          :getCanvas="() => canvasRef"
          @delete-measurement="deleteMeasurement"
          @zoom="onZoomSelected"
          @hide="onHideSelected"
          @isolate="onIsolateSelected"
          @properties="emit('open-properties')"
          @new-issue="onIssueFromSelection"
        />

        <!-- Show-all button — visible whenever any category is currently hidden -->
        <Transition name="sidebar-slide">
          <button
            v-if="anyHidden"
            class="show-all-btn"
            title="Alle wieder einblenden"
            @click="onShowAll"
          >
            <CdeIcon name="visible" :size="14" /> Alle zeigen
          </button>
        </Transition>

        <!-- Mess-Hinweis (die Werte selbst stehen als Pillen an der Strecke) -->
        <Transition name="fade">
          <div v-if="measureToast" class="measure-toast"><CdeIcon name="measure" :size="14" /> {{ measureToast.text }}</div>
        </Transition>
        <Transition name="fade">
          <button
            v-if="measurements.length"
            class="measure-clear"
            title="Alle Messungen entfernen"
            @click="clearMeasurements"
          >
            <CdeIcon name="delete" :size="13" /> {{ measurements.length }} Messung{{ measurements.length === 1 ? '' : 'en' }}
          </button>
        </Transition>

        <!-- Layer-Panel (floating) -->
        <Transition name="panel-slide">
          <IfcLayerPanel
            v-if="showLayerPanel && categoryList.length"
            :categories="categoryList"
            :hasIfcGrids="!!engine?.getIfcGridAxes()?.length"
            @toggle="onToggleCategory"
            @zoom="({ name }) => engine?.zoomToCategory(name)"
            @toggle-ifc-grids="(v) => engine?.setIfcGridsVisible(v)"
            @close="showLayerPanel = false"
          />
        </Transition>

        <!-- T1.5: Storey-Quick-Nav (floating left) — shifts right when LayerPanel is open -->
        <IfcStoreyNav
          v-if="showStoreyNav"
          ref="storeyNavRef"
          :storeys="storeyList"
          :style="{ left: showLayerPanel && categoryList.length ? '320px' : '70px' }"
          @goto="onGotoStorey"
          @set-visible="onStoreyVisible"
        />

        <!-- T2.2: Saved Views (floating right, toggleable) -->
        <Transition name="panel-slide">
          <div v-if="showSavedViews" class="saved-views-wrap">
            <IfcSavedViews
              :captureView="erfasseViewpoint"
              :applyView="anwendenViewpoint"
            />
          </div>
        </Transition>

        <!-- Issues-Panel lebt seit Sprint U in der rechten Leiste (CdeView) -->

        <!-- T2.4: Speech-bubble overlay (always rendered when there are annotations) -->
        <IfcAnnotationOverlay
          v-if="ifc.annotations.length && canvasRef"
          :annotations="ifc.annotations"
          :projectToScreen="(p) => engine?.projectToScreen(p)"
          :canvasEl="canvasRef"
          :getCamera="() => engine?._getWorld()?.camera?.three ?? null"
          @offset-changed="onAnnotationOffsetChanged"
        />

      </div>

      <!-- PDF Export Modal — teleported to body to escape z-index stacking context -->
      <Teleport to="body">
        <IfcPdfExportModal
          v-if="showPdfExport"
          @close="showPdfExport = false"
        />
      </Teleport>

      <!-- Planungs-Cockpit lebt seit Sprint U in der rechten Leiste (CdeView) -->

      <CdeCommandPalette
        :open="showPalette"
        :nurElemente="paletteNurElemente"
        @close="showPalette = false"
      />

      <Teleport to="body">
        <IfcShortcutsOverlay :open="showShortcuts" @close="showShortcuts = false" />
      </Teleport>
    </div>
  </component>
</template>

<script setup>
import { ref, computed, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue';
import DraggableModal from '@/features/isyifc/components/common/DraggableModal.vue';
import { IfcEngine }            from '../services/IfcEngine.js';
import { IfcSelectionHandler }  from '../services/IfcSelectionHandler.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { useCdeStore } from '../stores/useCdeStore.js';
import { usePanels } from '../stores/usePanels.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { usePaletteCommands } from '../stores/useCommands.js';
import IfcLayerPanel      from './IfcLayerPanel.vue';
import CdeIcon            from './ui/CdeIcon.vue';
import CdeCommandPalette  from './ui/CdeCommandPalette.vue';
import CdeHudLayer        from './CdeHudLayer.vue';
import IfcPdfExportModal  from './IfcPdfExportModal.vue';
import IfcLoadOverlay     from './IfcLoadOverlay.vue';
import IfcShortcutsOverlay from './IfcShortcutsOverlay.vue';
import IfcStoreyNav        from './IfcStoreyNav.vue';
import IfcSavedViews       from './IfcSavedViews.vue';
import IfcAnnotationOverlay from './IfcAnnotationOverlay.vue';
import { applyLayerStyle } from '../services/LayerStyleManager.js';
import { provideViewerApi } from '../composables/viewerApi.js';
import '../styles/theme.css';
import { computeModelIdentity } from '../services/ModelIdentity.js';
import { repo } from '../services/RepoFacade.js';


const emit = defineEmits(['close', 'open-properties', 'model-loaded']);
const ifc  = useIfcStore();
const cde  = useCdeStore();
const panels = usePanels();
const ansicht = useAnsicht();
const cmds = usePaletteCommands();

defineProps({
  propertiesOpen: { type: Boolean, default: false },
  // true = Vollbild-Seite (Route /cde), false = DraggableModal (ToolsDashboard-Altpfad)
  standalone:     { type: Boolean, default: false },
});

// ── refs ────────────────────────────────────────────────────────────────────
const modalRef    = ref(null);
const canvasRef   = ref(null);

const engine      = shallowRef(null);
const loading = ref(false);
const coords      = ref(null);

// Layer panel
const showLayerPanel = ref(false);
const categoryList   = ref([]); // [{name, count, visible}]
const storeyList     = ref([]); // [{modelId, localId, name, elevation, box}]
// Template-Ref auf IfcStoreyNav. In <script setup> muss sie ausdruecklich
// deklariert werden — fehlte sie, warf jeder der drei Ebenen-Befehle aus der
// Befehlspalette einen ReferenceError.
const storeyNavRef   = ref(null);
const showStoreyNav  = ref(true);
const showSavedViews = ref(false);
const annotationActive   = ref(false);

// Section cut — sectionActive = clip plane exists; showSectionBar = UI bar visible
const sectionActive   = ref(false);
const showSectionBar  = ref(false);
const sectionMode     = ref('translate'); // 'translate' | 'rotate'
const sectionPosition = ref(null); // { x, y, z } from engine

// PDF export
const showPdfExport = ref(false);
const showPalette   = ref(false);
const paletteNurElemente = ref(false);
const showShortcuts = ref(false);

// T1.3: Measurement
const measureActive    = ref(false);
const measureToast     = ref(null);  // { text, ts }
const measurements     = ref([]);    // [{ dist }]
let _measureToastTimer = null;

// Multi-model list
const modelList = ref([]); // [{modelId, name}]

// Stabile Modell-Identität pro geladenem Modell (B3) + lokale Ablage (B4)
const _modelIdentity = new Map(); // modelId → { key, sha256, projectGlobalId, name }
const recentModels = ref([]);     // [{ key, meta, size }] aus repo.listBlobs('model:')
/** Meldung der Projekt-Ablage (z. B. abgelehnter Upload). null = nichts zu sagen. */
const ablageHinweis = ref(null);

// Coordinate display mode
const coordMode = ref('viewer'); // 'viewer' | 'ifc'

let _mouseDownAt = null;
let _hoverTimer  = null;
let _lastMouse   = null;
let _selection   = null;  // IfcSelectionHandler — übernimmt Click/Hover/Marquee

// ── AP-U4: Anker der Auswahl für das Kontextmenü am Objekt ─────────────────
// Der Bildschirmpunkt wird im HUD projiziert; hier wird nur der WELT-Punkt
// (BBox-Zentrum) nachgeführt, wenn sich die Auswahl ändert.
const selectionAnchor = ref(null);
watch(() => ifc.selectedElement, async (el) => {
  if (!el || !engine.value) { selectionAnchor.value = null; return; }
  const boxes = await engine.value.getBoxes([el.localId], el.modelId);
  const box = boxes?.[0];
  selectionAnchor.value = (box && !box.isEmpty())
    ? [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2]
    : null;
});

/**
 * Einzelne Messung entfernen (früher ging nur „alle zurücksetzen").
 * Die Strecken zeichnet seit AP-U4 das HUD im Bildschirmraum; die 3D-Marker
 * der Engine werden deshalb verworfen, damit nichts doppelt stehen bleibt.
 */
function deleteMeasurement(i) {
  measurements.value = measurements.value.filter((_, idx) => idx !== i);
  engine.value?.clearMeasurements?.();
}

function onZoomSelected() {
  const el = ifc.selectedElement;
  if (el) engine.value?.zoomToElement(el.modelId, el.localId);
}

/** Issue direkt am gewählten Bauteil anlegen (Pin sitzt auf dem Anker). */
function onIssueFromSelection() {
  const anker = selectionAnchor.value;
  if (!anker) return;
  const text = prompt('Issue am gewählten Bauteil — Beschreibung:', '');
  if (text === null) return;
  const lastColor = ifc.annotations[ifc.annotations.length - 1]?.color ?? '#e91e63';
  const ann = engine.value?.addAnnotationAt?.(anker, text, lastColor);
  if (!ann) return;
  ann.viewpoint = erfasseViewpoint();
  ann.author = cde.bearbeiter || '';
  ann.createdAt = Date.now();
  ifc.pushAnnotation(ann);
  panels.open('issues');
}

// ── Werkzeugleiste (Sprint U) ───────────────────────────────────────────────
// Eine Quelle für Icon, Beschriftung, Tastenkürzel und Aktion — der Tooltip
// nennt das Kürzel jetzt automatisch (früher nur bei 3 von 14 Knöpfen), und
// die Liste ist zugleich der Einspeisepunkt für die Befehls-Palette (AP-U3).
const toolbarItems = computed(() => [
  { id: 'fit',    icon: 'fit',         label: 'Fit',    title: 'Alles einpassen',   action: () => engine.value?.zoomToFit() },
  { id: 'top',    icon: 'view-top',    label: 'Oben',   title: 'Draufsicht',        action: () => engine.value?.viewTop() },
  { id: 'front',  icon: 'view-front',  label: 'Vorne',  title: 'Vorderansicht',     action: () => engine.value?.viewFront() },
  { id: 'side',   icon: 'view-side',   label: 'Seite',  title: 'Seitenansicht',     action: () => engine.value?.viewSide() },
  { id: 'reset',  icon: 'view-reset',  label: 'Reset',  title: 'Ansicht zurücksetzen', action: () => engine.value?.resetView() },
  { divider: true },
  { id: 'layers', icon: 'layers',  label: 'Layer',   title: 'Ebenen / Kategorien',
    active: showLayerPanel.value, action: () => { showLayerPanel.value = !showLayerPanel.value; } },
  { id: 'section', icon: 'section', label: 'Schnitt', title: 'Horizontaler Schnitt', key: 'T/R',
    active: sectionActive.value, action: () => toggleSectionCut() },
  { id: 'coords', icon: 'coords', label: coordMode.value === 'ifc' ? 'IFC' : 'Viewer',
    title: 'Koordinaten umschalten (Viewer ↔ IFC)',
    active: coordMode.value === 'ifc',
    action: () => { coordMode.value = coordMode.value === 'viewer' ? 'ifc' : 'viewer'; } },
  { divider: true },
  { id: 'export', icon: 'export', label: 'Export', title: 'Plan exportieren (PDF/DXF/Profile)',
    active: showPdfExport.value, action: () => { showPdfExport.value = !showPdfExport.value; } },
  { id: 'cockpit', icon: 'cockpit', label: 'Planung', title: 'Planungs-Cockpit (Flächen, Kosten, Qualität)',
    active: panels.isOpen('cockpit'), action: () => panels.toggle('cockpit') },
  { divider: true },
  { id: 'measure', icon: 'measure', label: 'Messen', title: 'Strecke messen', key: 'M',
    active: measureActive.value, action: () => toggleMeasure() },
  { id: 'views', icon: 'views', label: 'Views', title: 'Gespeicherte Ansichten', key: 'V',
    active: showSavedViews.value, action: () => onToggleViews() },
  { id: 'issues', icon: 'issues', label: 'Issues', title: 'Issues / Notizen', key: 'N',
    active: panels.isOpen('issues') || annotationActive.value, action: () => onToggleNotes() },
  { divider: true },
  { id: 'help', icon: 'help', label: 'Hilfe', title: 'Tastenkürzel anzeigen', key: '?',
    active: showShortcuts.value, action: () => { showShortcuts.value = !showShortcuts.value; } },
]);

// ── viewerApi — Engine-Accessoren für teleportierte Kinder ──────────────────
// (PDF-Export, Planungs-Cockpit, Vector-Style-Editor) via provide/inject statt
// Funktions-Props. Closures greifen zur Aufrufzeit auf engine.value zu.
provideViewerApi({
  // Snapshots & Ansichten
  getSnapshot:          () => engine.value?.getCanvasSnapshot(3),
  onViewTop:            () => engine.value?.viewTop(),
  onViewFront:          () => engine.value?.viewFront(),
  onViewSide:           () => engine.value?.viewSide(),
  saveRenderState:      () => engine.value?.saveRenderState(),
  restoreRenderState:   (s) => engine.value?.restoreRenderState(s),
  applyLayerStyle:      (style) => applyLayerStyle(style, engine.value),
  getScaleSnapshot:     (s, dw, dh, dir, px, pz) => engine.value?.getScaleSnapshot(s, dw, dh, dir, 10, px ?? 0, pz ?? 0),
  truckCamera:          (dx, dy) => engine.value?.truckCamera(dx, dy),
  // Szene / Kamera
  getCamera:            () => engine.value?._getWorld()?.camera?.three ?? null,
  getScene:             () => engine.value?._getWorld()?.scene?.three ?? null,
  getPlotFrustum:       () => engine.value?.getLastPlotFrustum(),
  getMainScene:         () => engine.value?.getMainScene(),
  getModelCenterY:      () => engine.value?.getModelCenterY() ?? 0,
  getCameraTarget:      () => engine.value?.getCameraTarget() ?? { x: 0, y: 0, z: 0 },
  renderToCanvas:       (cv, cam) => engine.value?.renderToCanvas(cv, cam) ?? false,
  // Modelldaten
  getCategoryGroups:    () => engine.value?.getCategoryGroups() ?? [],
  getFragmentsList:     () => engine.value?.getFragmentsList() ?? new Map(),
  getFragmentsManager:  () => engine.value?.getFragmentsManager() ?? null,
  getWebIfcAPI:         () => engine.value?.getWebIfcAPI(),
  getSpatialTree:       () => engine.value?.getSpatialTree() ?? null,
  getStoreyList:        () => engine.value?.getStoreyList() ?? [],
  getModelBoundsXZ:     () => engine.value?.getModelBoundsXZ(),
  getIfcGridAxes:       () => engine.value?.getIfcGridAxes() ?? [],
  // Schnitt & Overlays
  getSectionCutPlane:   () => engine.value?.getSectionCutPlane(),
  getClippingPlanes:    () => engine.value?.getClippingPlanes() ?? [],
  withSectionVisualsHidden: (fn) => engine.value?.withSectionVisualsHidden(fn),
  getOverviewSnapshot:  (w, h) => engine.value?.getOverviewSnapshot(w, h),
  getMeasurements:      () => measurements.value,
  // Interaktion
  zoomToElement:        (modelId, localId) => engine.value?.zoomToElement(modelId, localId),
  setElementColors:     (colorMap) => engine.value?.setPerElementColors(colorMap),
  resetElementColors:   () => engine.value?.resetCategoryColors(),
  // Sprint T1: Georeferenz + Dokument-Status für den Planexport
  getAllCoordOffsets:   () => engine.value?.getAllCoordOffsets() ?? {},
  getWebIfcAPIs:        () => engine.value?.getWebIfcAPIs() ?? [],
  getLoadedModelSha:    () => {
    const first = engine.value?.getModelList()?.[0];
    return first ? (_modelIdentity.get(first.modelId)?.sha256 ?? null) : null;
  },
});

// ── lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  document.addEventListener('keydown', onKeyDown);

  engine.value = new IfcEngine();
  await engine.value.init(canvasRef.value);

  // SelectionHandler übernimmt Click/Hover/Marquee. Coord-Bar-Update bleibt in Vue
  // (an mousemove gehängt) — der Handler triggert nur den Hover-Raycast.
  _selection = new IfcSelectionHandler({ engine: engine.value, canvas: canvasRef.value });
  _selection.attach();
  _selection.onPick(result => {
    ifc.setElement(result);
    panels.open('eigenschaften');
  });
  _selection.onClickEmpty(() => ifc.clearElement());
  _selection.onHover(pos => {
    coords.value = pos
      ? {
          x: pos.x.toFixed(3), y: pos.y.toFixed(3), z: pos.z.toFixed(3),
          ox: pos.ox.toFixed(3), oy: pos.oy.toFixed(3), oz: pos.oz.toFixed(3),
        }
      : null;
  });
  _selection.onMarqueeSelect(({ count }) => {
    if (count) console.info(`[Selection] Marquee: ${count} Elemente ausgewählt`);
  });

  // Measure-/Annotation-Modi nutzen weiterhin den Vue-Click-Handler — wenn sie
  // aktiv sind, schalten wir den SelectionHandler in den 'disabled'-Modus, damit
  // ein Click nicht gleichzeitig selektiert UND einen Messpunkt setzt.
  canvasRef.value.addEventListener('mousedown',  onMouseDown);
  canvasRef.value.addEventListener('mouseup',    onMouseUp);
  canvasRef.value.addEventListener('mousemove',  onMouseMoveForTools);

  ifc.registerPsetHandler(async (psetName, props) => {
    try {
      await engine.value.addPsetToElement(psetName, props);
      const refreshed = await engine.value.refreshElement();
      if (refreshed) ifc.setElement(refreshed);
    } catch (err) {
      ifc.setPsetError(`Fehler: ${err.message}`);
    }
  });

  ifc.registerSpatialHandler(async (localId, visible, modelId = null) => {
    await engine.value?.setStoreyVisible(localId, visible, modelId);
  });

  // T1.1: zoom-to-element / zoom-to-category — modelId defaults to first loaded model
  ifc.registerZoomHandler(async (localId, modelId) => {
    const mid = modelId ?? engine.value?.getModelList()?.[0]?.modelId;
    if (mid != null) await engine.value?.zoomToElement(mid, localId);
  });
  ifc.registerZoomCategoryHandler(async (name) => {
    await engine.value?.zoomToCategory(name);
  });

  ifc.registerBoxHandler(async (localId, modelId) => {
    if (!engine.value) return null;
    const mid = modelId ?? engine.value.getModelList()?.[0]?.modelId;
    if (mid == null) return null;
    const boxes = await engine.value.getBoxes([localId], mid);
    if (!boxes?.length) return null;
    const offset = engine.value.getCoordOffsetForModel(mid);
    return { box: boxes[0], offset, modelId: mid };
  });

  // B4: lokale Modell-Ablage für den Leerzustand einlesen
  _refreshRecentModels();

  // Sprint U: Werkzeuge + Panels als Befehle anmelden (Palette, Hilfe, Tooltips)
  cmds.register('viewer', [
    ...toolbarItems.value
      .filter(t => !t.divider)
      .map(t => ({
        id: `tool.${t.id}`, titel: t.title, icon: t.icon,
        gruppe: 'Werkzeug', key: t.key, run: t.action,
      })),
    ...panels.defs.map(p => ({
      id: `panel.${p.id}`, titel: `${p.titel} ein-/ausblenden`, icon: p.icon,
      gruppe: 'Panel', run: () => panels.toggle(p.id),
    })),
    { id: 'sel.hide', titel: 'Auswahl ausblenden', icon: 'hidden', gruppe: 'Auswahl', key: 'H',
      verfuegbar: () => !!ifc.selectedElement, run: () => onHideSelected() },
    { id: 'sel.isolate', titel: 'Auswahl isolieren', icon: 'isolate', gruppe: 'Auswahl', key: 'I',
      verfuegbar: () => !!ifc.selectedElement, run: () => onIsolateSelected() },
    { id: 'sel.showall', titel: 'Alles wieder einblenden', icon: 'visible', gruppe: 'Auswahl', key: 'Shift+A',
      run: () => onShowAll() },
    { id: 'lvl.alle', titel: 'Ebenen: alle zeigen', icon: 'layers', gruppe: 'Ebenen',
      verfuegbar: () => storeyList.value.length > 0, run: () => storeyNavRef.value?.setModus('alle') },
    { id: 'lvl.solo', titel: 'Ebenen: nur die gewählte (Solo)', icon: 'layers', gruppe: 'Ebenen',
      verfuegbar: () => storeyList.value.length > 0, run: () => storeyNavRef.value?.setModus('solo') },
    { id: 'lvl.bis', titel: 'Ebenen: bis zur gewählten', icon: 'layers', gruppe: 'Ebenen',
      verfuegbar: () => storeyList.value.length > 0, run: () => storeyNavRef.value?.setModus('bis') },
  ]);
});

onBeforeUnmount(() => {
  cmds.unregister('viewer');
  document.removeEventListener('keydown', onKeyDown);
  if (canvasRef.value) {
    canvasRef.value.removeEventListener('mousedown',  onMouseDown);
    canvasRef.value.removeEventListener('mouseup',    onMouseUp);
    canvasRef.value.removeEventListener('mousemove',  onMouseMoveForTools);
  }
  _selection?.detach();
  _selection = null;
  engine.value?.dispose();
  engine.value = null;
});

// ── file loading ─────────────────────────────────────────────────────────────

/**
 * Gemeinsamer Lade-Pfad für Datei-Dialog und „Zuletzt geöffnet":
 * Identität (GlobalId/SHA-256) berechnen, Modell laden, UI auffrischen,
 * Blob in die lokale Ablage legen (fire-and-forget).
 */
async function _loadBuffer(buf, name, { persist = true } = {}) {
  const bytes = new Uint8Array(buf);
  const identity = await computeModelIdentity(bytes, name);
  const model = await engine.value.loadIfc(bytes, name);
  if (model?.modelId) _modelIdentity.set(model.modelId, { ...identity, name });
  await _onModelLoaded();
  if (persist) _persistModelBlob(bytes, name, identity);
  // M1: bei aktivem Projekt ins Dokument-Register aufnehmen (Status WIP,
  // Revisionszählung über die IfcProject-GlobalId)
  if (cde.activeProjectId && identity.sha256) {
    cde.registerModel({
      sha256: identity.sha256,
      name,
      size: bytes.byteLength,
      projectGlobalId: identity.projectGlobalId,
    }).catch(() => { /* Register optional */ });
  }
}

async function onFileUpload(e) {
  const file = e.target.files[0];
  if (!file || loading.value) return;
  loading.value = true;
  try {
    await _loadBuffer(await file.arrayBuffer(), file.name);
  } catch (err) {
    console.error('IFC load error:', err);
    alert('Fehler beim Laden der IFC-Datei.');
  } finally {
    loading.value  = false;
    e.target.value = '';
  }
}

async function onFileUploadAdd(e) {
  const file = e.target.files[0];
  if (!file || loading.value) return;
  loading.value = true;
  try {
    await _loadBuffer(await file.arrayBuffer(), file.name);
  } catch (err) {
    console.error('IFC add error:', err);
    alert('Fehler beim Hinzufügen der IFC-Datei.');
  } finally {
    loading.value  = false;
    e.target.value = '';
  }
}

// ── Lokale Modell-Ablage (IndexedDB via RepoFacade) ─────────────────────────
const MAX_RECENT_MODELS = 5;

async function _persistModelBlob(bytes, name, identity) {
  if (!identity?.sha256) return; // ohne Hash keine stabile Blob-Adresse
  try {
    const ok = await repo.setBlob(`model:${identity.sha256}`, new Blob([bytes]), {
      name,
      size: bytes.byteLength,
      savedAt: Date.now(),
      projectGlobalId: identity.projectGlobalId,
      key: identity.key,
    });
    if (!ok) return; // Backend ohne Blob-Support (localStorage-Fallback)
    // Ablage deckeln: nur die letzten N Modelle behalten
    const all = (await repo.listBlobs('model:'))
      .sort((a, b) => (b.meta?.savedAt ?? 0) - (a.meta?.savedAt ?? 0));
    for (const row of all.slice(MAX_RECENT_MODELS)) {
      await repo.deleteBlob(row.key);
    }
    await _refreshRecentModels();
  } catch (e) {
    // Der Server lehnt einen zweiten Upload gleichen Namens mit 422 ab. Das
    // ist kein technischer Fehler, sondern eine Aussage an den Nutzer — sonst
    // steht das Modell im Viewer, aber nicht im Projektregister, und die
    // beiden laufen wieder auseinander.
    if (e?.name === 'CdeUploadAbgelehnt') {
      ablageHinweis.value = `Nicht ins Projekt übernommen: ${e.message}`;
      return;
    }
    console.warn('[CDE] Lokale Modell-Ablage fehlgeschlagen:', e?.message ?? e);
  }
}

async function _refreshRecentModels() {
  recentModels.value = (await repo.listBlobs('model:'))
    .sort((a, b) => (b.meta?.savedAt ?? 0) - (a.meta?.savedAt ?? 0));
}

async function openRecent(row) {
  if (loading.value) return;
  loading.value = true;
  try {
    const stored = await repo.getBlob(row.key);
    if (!stored?.blob) throw new Error('Blob nicht gefunden');
    await _loadBuffer(await stored.blob.arrayBuffer(), stored.meta?.name ?? 'model', { persist: false });
    // savedAt auffrischen, damit die Liste nach letzter Nutzung sortiert bleibt
    repo.setBlob(row.key, stored.blob, { ...stored.meta, savedAt: Date.now() })
      .then(() => _refreshRecentModels());
  } catch (err) {
    console.error('Recent-model load error:', err);
    alert('Modell konnte nicht aus dem lokalen Speicher geladen werden.');
  } finally {
    loading.value = false;
  }
}

async function deleteRecent(row) {
  await repo.deleteBlob(row.key);
  await _refreshRecentModels();
}

/** M2: Modell aus dem Dokument-Register öffnen (CdeView ruft per Template-Ref). */
async function openBySha(sha256) {
  await openRecent({ key: `model:${sha256}` });
}
/**
 * Modell aus dem Projektordner laden (Projekt-Cockpit, Stufe 6): der Pfad ist
 * relativ zu 1_Projekte; die Datei kommt über /projects/file mit Bearer-Token.
 */
async function openFromProjectPath(pfad) {
  // Beim Deep-Link ist die Engine oft noch im Aufbau — kurz warten statt scheitern.
  for (let i = 0; i < 60 && !engine.value; i += 1) await new Promise((r) => setTimeout(r, 250));
  if (!engine.value) throw new Error('viewer-engine nicht bereit');
  const { default: api } = await import('@/services/api');
  const antwort = await api.get('/projects/file', { params: { path: pfad }, responseType: 'arraybuffer' });
  const name = String(pfad).split('/').pop() || 'modell.ifc';
  await _loadBuffer(antwort.data, name);
}
/**
 * Gespeicherte Ansicht / Issue-Viewpoint (Sprint P, AP-8).
 *
 * Die Engine bekommt bewusst KEINEN Oberflächenzustand — sie kennt Kamera,
 * Sichtbarkeit und Schnitt. Der Ansichtsmodus (3D oder Lageplan mit Maßstab
 * und Blattlage) wird hier darübergelegt. Fehlt das Feld, weil die Ansicht vor
 * Sprint P gespeichert wurde, sorgt `normalisiereModus` im Store für '3d' —
 * eine Migration ist deshalb nicht nötig.
 */
function erfasseViewpoint() {
  const v = engine.value?.captureView();
  if (!v) return null;
  return { ...v, ansicht: ansicht.serialisieren() };
}

async function anwendenViewpoint(vp) {
  await engine.value?.applyView(vp);
  ansicht.anwenden(vp?.ansicht);
}

defineExpose({
  openBySha,
  openFromProjectPath,
  zoomToPoint: zoomToAnnotation,
  applyViewpoint: anwendenViewpoint,
  captureViewpoint: erfasseViewpoint,
  toggleAnnotationMode: () => toggleAnnotationMode(),
  /**
   * Der Pin-Modus wird als REF herausgegeben, nicht als Momentaufnahme.
   *
   * Vorher stand hier `isAnnotationActive: () => annotationActive.value` — eine
   * Funktion, die nur beim Aufruf las. Die CdeView führte daneben eine eigene
   * Kopie und aktualisierte sie ausschließlich beim Klick auf den Panel-Knopf.
   * Endete der Modus anders (Esc, oder automatisch nach dem Setzen eines Pins),
   * blieb die Kopie auf „Aktiv" stehen und der Knopf log.
   * Vue entpackt Refs im expose-Proxy, `viewerRef.annotationActive` ist also
   * ein Boolean — und wird in einem computed richtig nachverfolgt.
   */
  annotationActive,
});

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

async function removeModel(modelId) {
  await engine.value?.unloadModel(modelId);
  _modelIdentity.delete(modelId);
  modelList.value = engine.value.getModelList();
  ifc.setModelList(modelList.value);
  categoryList.value = engine.value.getCategoryList();
  // Update spatial tree for first remaining model
  const tree = await engine.value?.getSpatialTree();
  ifc.setSpatialTree(tree ?? null);
  // Refresh storey list (might be empty if all models with storeys are unloaded)
  storeyList.value = (await engine.value?.getStoreyList()) ?? [];
}

/** Called after every successful loadIfc() to refresh UI state. */
async function _onModelLoaded() {
  // Categories for Layer Panel
  categoryList.value = engine.value.getCategoryList();

  // Update multi-model list
  modelList.value = engine.value.getModelList();
  ifc.setModelList(modelList.value);

  // Spatial tree → store (IfcSpatialWindow reads from there)
  const tree = await engine.value.getSpatialTree();
  ifc.setSpatialTree(tree);

  // T1.1: Build search index for Cmd/Ctrl+F (runs in background, non-blocking)
  engine.value.buildSearchIndex().then(entries => ifc.setSearchIndex(entries));

  // T1.5: Storey list for the quick-nav panel (skipped silently for infra models)
  engine.value.getStoreyList().then(list => { storeyList.value = list; }).catch(() => {});

  // T2.4: Load persisted annotations for this model + redraw any visuals.
  // Schlüssel ist die stabile Modell-Identität (IfcProject.GlobalId bzw.
  // SHA-256) — der Dateiname dient nur noch der Legacy-Übernahme.
  const firstModel = engine.value?.getModelList()?.[0];
  if (firstModel) {
    const identity = _modelIdentity.get(firstModel.modelId);
    await ifc.loadAnnotationsForModel(identity?.key ?? firstModel.name, firstModel.name);
    // If annotation mode is on, re-create visuals; otherwise pre-fill engine's data only
    engine.value?.setAnnotations(ifc.annotations);
  }

  // Reset section cut when a new model is loaded
  if (sectionActive.value) {
    engine.value.deleteSectionCuts();
    sectionActive.value  = false;
    showSectionBar.value = false;
    sectionPosition.value = null;
  }

  emit('model-loaded');
}

// ── Section cuts ─────────────────────────────────────────────────────────────

/**
 * Meldet die Rueckmeldung der Schnittebene an.
 *
 * Stand vorher Zeichen fuer Zeichen an zwei Stellen — beim Einschalten des
 * Werkzeugs und beim Anfahren eines Geschosses. Eine Aenderung an der einen
 * haette die andere stillschweigend zurueckgelassen.
 */
function _schnittRueckmeldungAnmelden() {
  engine.value?.setSectionChangeCallback(() => {
    sectionPosition.value = engine.value?.getSectionPosition() ?? null;
  });
}

function toggleSectionCut() {
  if (!sectionActive.value) {
    // First click: create the clip plane and show the bar
    const result = engine.value?.createSectionCut();
    if (!result) return;
    sectionMode.value     = 'translate';
    sectionActive.value   = true;
    showSectionBar.value  = true;
    sectionPosition.value = engine.value.getSectionPosition();
    _schnittRueckmeldungAnmelden();
  } else {
    // Second click: remove the cut entirely (clean toggle)
    engine.value?.setSectionChangeCallback(null);
    engine.value?.deleteSectionCuts();
    sectionActive.value   = false;
    showSectionBar.value  = false;
    sectionPosition.value = null;
  }
}

/** Hide the section bar and gizmo — clip plane remains active. */
function hideSection() {
  showSectionBar.value = false;
  engine.value?.setSectionGizmoVisible(false);
}

function setSectionMode(mode) {
  sectionMode.value = mode;
  engine.value?.setSectionMode(mode);
}

function snapSection(axis) {
  engine.value?.snapSectionTo(axis);
  sectionPosition.value = engine.value?.getSectionPosition() ?? null;
}

function resetSection() {
  engine.value?.resetSection();
  sectionPosition.value = engine.value?.getSectionPosition() ?? null;
}

// SC-3: Keyboard shortcuts for section cut
function onKeyDown(e) {
  // Cmd/Ctrl+F → open search overlay
  // Strg+K = Befehls-Palette, Strg+F = dieselbe Liste, nur Elemente
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    paletteNurElemente.value = false;
    showPalette.value = true;
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault();
    paletteNurElemente.value = true;
    showPalette.value = true;
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // ? toggles the shortcut overlay
  if (e.key === '?') { e.preventDefault(); showShortcuts.value = !showShortcuts.value; return; }
  if (e.key === 'Escape' && showShortcuts.value) { showShortcuts.value = false; return; }

  // T1.3: M toggles measure mode, Esc exits it
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMeasure(); return; }
  if (e.key === 'Escape' && measureActive.value) { toggleMeasure(); return; }

  // T2.2: V toggles Saved Views panel
  if (e.key === 'v' || e.key === 'V') { e.preventDefault(); showSavedViews.value = !showSavedViews.value; return; }

  // T2.4: N toggles Notes panel, Esc exits annotation placement mode
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); panels.toggle('issues'); return; }
  if (e.key === 'Escape' && annotationActive.value) { toggleAnnotationMode(); return; }

  // T1.2: H = hide selected, I = isolate selected, Shift+A = show all
  if (ifc.selectedElement && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault(); onHideSelected(); return;
  }
  if (ifc.selectedElement && (e.key === 'i' || e.key === 'I')) {
    e.preventDefault(); onIsolateSelected(); return;
  }
  if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault(); onShowAll(); return;
  }

  // Section-cut shortcuts (only while section bar is active)
  if (!sectionActive.value) return;
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); setSectionMode('translate'); }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setSectionMode('rotate'); }
  if (e.key === 'Escape') hideSection();
}

// ── Layer panel ───────────────────────────────────────────────────────────────
async function onToggleCategory({ name, visible }) {
  await engine.value?.setCategoryVisible(name, visible);
  const entry = categoryList.value.find(c => c.name === name);
  if (entry) entry.visible = visible;
}

// ── T1.2: Hide / Isolate / Show all ───────────────────────────────────────────
const anyHidden = computed(() => categoryList.value.some(c => !c.visible));

async function onHideSelected() {
  await engine.value?.hideSelected();
  // Selection cleared in engine — refresh store
  ifc.clearElement();
  // categoryList visibility doesn't change for hide-selected (selection ≠ whole category)
  // but show "Alle zeigen" if any item is hidden — we approximate by marking dirty later
}

async function onIsolateSelected() {
  await engine.value?.isolateSelected();
  // Engine flipped all g.visible = false → mirror in UI
  categoryList.value = engine.value?.getCategoryList() ?? [];
}

async function onShowAll() {
  await engine.value?.showAll();
  categoryList.value = engine.value?.getCategoryList() ?? [];
}

// ── T1.5: Storey navigation ───────────────────────────────────────────────────
async function onGotoStorey({ modelId, localId, withSection }) {
  const ok = await engine.value?.gotoStorey(modelId, localId, { withSection });
  if (ok && withSection) {
    // Sync the section-cut UI state so the bar appears
    sectionActive.value   = true;
    showSectionBar.value  = true;
    sectionMode.value     = 'translate';
    sectionPosition.value = engine.value?.getSectionPosition() ?? null;
    _schnittRueckmeldungAnmelden();
  }
}

// ── T1.3: Measurement ────────────────────────────────────────────────────────
function toggleMeasure() {
  if (measureActive.value) {
    engine.value?.disableMeasureMode();
    measureActive.value = false;
    measureToast.value  = null;
    _selection?.setMode('single');
  } else {
    engine.value?.enableMeasureMode();
    measureActive.value = true;
    _setMeasureToast('Klick auf 1. Punkt');
    _selection?.setMode('disabled');
  }
}

function clearMeasurements() {
  engine.value?.clearMeasurements();
  measurements.value = [];
  _setMeasureToast('Messungen zurückgesetzt');
}

function _setMeasureToast(text) {
  measureToast.value = { text, ts: Date.now() };
  if (_measureToastTimer) clearTimeout(_measureToastTimer);
  _measureToastTimer = setTimeout(() => { measureToast.value = null; }, 3500);
}

function _formatDist(m) {
  if (m < 1)   return `${(m * 1000).toFixed(0)} mm`;
  if (m < 10)  return `${m.toFixed(3)} m`;
  return `${m.toFixed(2)} m`;
}

// ── T2.4: Annotations ────────────────────────────────────────────────────────

/**
 * Der Store fuehrt die Issues, die Engine zeichnet ihre Pins — und folgt ihm.
 *
 * Vorher spiegelte nur EINE von sieben Store-Aenderungen in die Engine
 * (`updateAnnotationOffset`). Loeschen, Farbwechsel, „alle loeschen" und der
 * BCF-Import blieben im 3D-Bild stehen: die Liste im Panel und die Pins im
 * Modell liefen auseinander. Statt jede Operation einzeln nachzuziehen —
 * sieben Stellen, die man beim naechsten Mal wieder vergisst — folgt die
 * Engine hier dem Store.
 *
 * Beobachtet wird bewusst nur, was den PIN bestimmt: Kennung, Ort und Farbe
 * (`idx` leitet die Engine aus der Reihenfolge ab). Text, Status, Frist und
 * Kommentare aendern das 3D-Bild nicht — eine tiefe Beobachtung wuerde beim
 * Tippen im Panel bei jedem Zeichen die Marker neu bauen.
 */
watch(
  () => ifc.annotations.map(a => `${a.id}|${a.color ?? ''}|${a.position?.join(',') ?? ''}`).join(';'),
  () => { engine.value?.setAnnotations(ifc.annotations); },
);

function onToggleViews() { showSavedViews.value  = !showSavedViews.value; }
function onToggleNotes() { panels.toggle('issues'); }

function toggleAnnotationMode() {
  if (annotationActive.value) {
    annotationActive.value = false;
    _selection?.setMode('single');
  } else {
    if (measureActive.value) toggleMeasure();
    engine.value?.enableAnnotationMode();
    annotationActive.value = true;
    _selection?.setMode('disabled');
  }
}

async function _onAnnotationClick(e) {
  const text = prompt('Issue anlegen — Beschreibung:', '');
  if (text === null) return;
  // Re-use the last annotation's color so users can place a series of same-colored pins
  const lastColor = ifc.annotations[ifc.annotations.length - 1]?.color ?? '#e91e63';
  const ann = await engine.value?.addAnnotation(e.clientX, e.clientY, text, lastColor);
  if (ann) {
    // Issue-Felder: Viewpoint (Kamera + Sichtbarkeit + Schnitt) für „so sah
    // ich es"-Wiederherstellung, Autor aus der CDE-Bearbeiter-Identität.
    ann.viewpoint = erfasseViewpoint();
    ann.author    = cde.bearbeiter || '';
    ann.createdAt = Date.now();
    ifc.pushAnnotation(ann);
  }
}

function onAnnotationOffsetChanged({ id, offset }) {
  ifc.updateAnnotationOffset(id, offset);
  // Reflect in the engine's internal copy so future redraws use the new offset
  engine.value?.updateAnnotation?.(id, { labelOffset: offset });
}

function zoomToAnnotation(position) {
  engine.value?.lookAtPoint(position[0], position[1], position[2], 5);
}

// ── mouse interaction ─────────────────────────────────────────────────────────
// Selection + Hover + Marquee laufen über _selection (IfcSelectionHandler).
// Hier nur noch die Tool-Modi (Measure / Annotation), die statt zu selektieren
// Punkte/Pins setzen.

function onMouseMoveForTools(e) {
  // Nur aktiv im Measure-Modus — Live-Hover-Marker für den nächsten Messpunkt.
  if (!measureActive.value) return;
  if (_hoverTimer) clearTimeout(_hoverTimer);
  _lastMouse = { x: e.clientX, y: e.clientY };
  _hoverTimer = setTimeout(() => {
    const m = _lastMouse;
    if (m) engine.value?.updateMeasureHover(m.x, m.y);
  }, 30);
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  if (!(measureActive.value || annotationActive.value)) return;
  _mouseDownAt = { x: e.clientX, y: e.clientY };
}

async function onMouseUp(e) {
  if (e.button !== 0) return;
  if (!_mouseDownAt) return;
  const dx = e.clientX - _mouseDownAt.x;
  const dy = e.clientY - _mouseDownAt.y;
  const downX = _mouseDownAt.x;
  const downY = _mouseDownAt.y;
  _mouseDownAt = null;

  if (Math.hypot(dx, dy) > 8) return; // >8 px = Drag, nicht Click

  if (measureActive.value) {
    const res = await engine.value?.addMeasurePoint(downX, downY);
    if (!res || res.phase === 'no-hit') {
      _setMeasureToast('Kein Treffer — bitte auf Bauteil klicken');
    } else if (res.phase === 'awaiting-second') {
      _setMeasureToast('Klick auf 2. Punkt');
    } else if (res.phase === 'complete') {
      measurements.value.push({
        dist: res.dist,
        p1: { x: res.p1.x, y: res.p1.y, z: res.p1.z },
        p2: { x: res.p2.x, y: res.p2.y, z: res.p2.z },
      });
      _setMeasureToast(`Abstand: ${_formatDist(res.dist)} — Klick auf nächste 2 Punkte`);
    }
    return;
  }

  if (annotationActive.value) {
    await _onAnnotationClick({ clientX: downX, clientY: downY });
  }
}

</script>

<style scoped>
/* ── Layout shell ── */
.viewer-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

/* Vollbild-Modus (Route /cde) — füllt den Eltern-Container (CdeView-Host) */
.standalone-shell {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--cde-papier);
}
.standalone-shell .viewer-header { cursor: default; }

/* B4: Zuletzt geöffnete Modelle */
.recent-panel {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  min-width: 320px; max-width: 420px;
  background: var(--cde-float-deep);
  border: 1px solid var(--cde-tint-strong);
  border-radius: 8px;
  padding: 0.9rem 1rem;
  z-index: 5;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.recent-title { color: var(--cde-text-bright); font-weight: 600; font-size: 0.95rem; margin-bottom: 0.2rem; }
.recent-item { display: flex; align-items: stretch; gap: 0.3rem; }
.recent-open {
  flex: 1; display: flex; justify-content: space-between; align-items: baseline; gap: 0.6rem;
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-strong);
  border-radius: 5px;
  padding: 0.45rem 0.6rem;
  cursor: pointer;
  color: var(--cde-text);
  transition: background 0.1s;
}
.recent-open:hover { background: var(--cde-accent-fill-hi); color: var(--cde-text-bright); }
.recent-name { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-info { font-size: 0.7rem; color: var(--cde-text-dim); flex-shrink: 0; }
.recent-del {
  background: none; border: none; color: var(--cde-text-dim); cursor: pointer;
  font-size: 0.8rem; padding: 0 0.3rem;
}
.recent-del:hover { color: var(--cde-danger-soft); }
.recent-hint { font-size: 0.68rem; color: var(--cde-text-mute); font-style: italic; margin-top: 0.2rem; }

/* ── Header ── */
.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.7rem 1rem;
  background: var(--cde-bg-alt);
  color: var(--cde-text-bright);
  border-bottom: 1px solid var(--cde-line);
  user-select: none;
  cursor: grab;
  flex-shrink: 0;
}
.viewer-header:active { cursor: grabbing; }

.header-title { font-weight: 600; font-size: 1.05rem; }
.header-controls { display: flex; gap: 0.4rem; }

.hdr-btn {
  background: none; border: none; color: var(--cde-text-bright);
  font-size: 1.15rem; cursor: pointer; padding: 0.2rem 0.45rem;
  border-radius: 4px; transition: background 0.15s;
}
.hdr-btn:hover { background: var(--cde-tint-strong); }
.hdr-close:hover { color: var(--cde-danger); background: color-mix(in srgb, var(--cde-danger) 12%, transparent); }

/* ── Body ── */
.viewer-body { position: relative; flex: 1; overflow: hidden; }

.canvas-root {
  position: absolute; inset: 0; background: var(--cde-bg-deep); z-index: 10;
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='rgba(0,0,0,0.55)' stroke-width='4'/%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='18' cy='18' r='2' fill='white'/%3E%3Ccircle cx='18' cy='18' r='2' fill='none' stroke='var(--cde-scrim)' stroke-width='1'/%3E%3C/svg%3E") 18 18, crosshair;
}
.canvas-root.measure-cursor {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect x='2' y='2' width='32' height='32' fill='none' stroke='rgba(0,0,0,0.6)' stroke-width='3'/%3E%3Crect x='2' y='2' width='32' height='32' fill='none' stroke='%23ffeb3b' stroke-width='1.5'/%3E%3Cline x1='18' y1='6' x2='18' y2='30' stroke='%23ffeb3b' stroke-width='2'/%3E%3Cline x1='6' y1='18' x2='30' y2='18' stroke='%23ffeb3b' stroke-width='2'/%3E%3C/svg%3E") 18 18, crosshair;
}

/* ── Top bar ── */
.top-bar {
  position: absolute; top: 1rem; left: 1rem; right: 1rem; z-index: 20;
  display: flex; justify-content: space-between; align-items: center;
  background: var(--cde-float); padding: 0.65rem 1.25rem;
  border-radius: 8px; box-shadow: var(--cde-shadow-sm);
}
.top-bar-left { display: flex; gap: 0.75rem; align-items: center; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}

.action-btn {
  padding: 0.45rem 0.9rem; border: none; border-radius: 6px;
  font-weight: 600; font-size: 0.9rem; cursor: pointer;
  transition: background 0.15s, transform 0.15s;
  display: inline-flex; align-items: center; gap: 0.4rem;
}
.action-btn.primary { background: var(--cde-accent); color: var(--cde-bg-deep); }
.action-btn.primary:hover { background: var(--cde-accent); transform: translateY(-1px); }
/* Vorher hellgrau (#e2e8f0) auf dunkler Leiste — der einzige helle Knopf
   der ganzen Oberfläche. Jetzt eine ruhige Zweitstufe neben dem Akzent. */
.action-btn.secondary {
  background: var(--cde-fill-hover);
  border: 1px solid var(--cde-line-strong);
  color: var(--cde-text);
}
.action-btn.secondary:hover { background: var(--cde-fill-active); color: var(--cde-text-bright); }

/* Loading badge */
.loading-badge {
  display: flex; align-items: center; gap: 0.5rem;
  color: var(--cde-warn); font-weight: 600; font-size: 0.9rem;
}
.spinner {
  width: 15px; height: 15px;
  border: 2.5px solid color-mix(in srgb, var(--cde-warn) 30%, transparent); border-top-color: var(--cde-warn);
  border-radius: 50%; animation: spin 0.8s linear infinite;
}

/* ── Camera toolbox ── */
.toolbox {
  position: absolute; bottom: 1rem; left: 1rem; z-index: 20;
  display: flex; flex-direction: column; gap: 0.3rem;
  background: var(--cde-float); padding: 0.45rem; border-radius: 10px;
  box-shadow: var(--cde-shadow-float);
  border: 1px solid var(--cde-tint);
  /* Cap height + scroll so growing button list doesn't escape the viewport */
  max-height: calc(100% - 7rem);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--cde-tint-max) transparent;
}
.toolbox::-webkit-scrollbar { width: 4px; }
.toolbox::-webkit-scrollbar-thumb { background: var(--cde-tint-max); border-radius: 2px; }
.tool-btn {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 3px; width: 50px; height: 46px;
  border: none; border-radius: 7px; background: var(--cde-tint);
  color: var(--cde-text); cursor: pointer;
  transition: background 0.15s, transform 0.12s, color 0.15s;
}
.tool-btn small { font-size: 0.57rem; opacity: 0.75; font-weight: 500; line-height: 1; }
.tool-btn:hover { background: var(--cde-tint-max); color: var(--cde-text-invert); transform: scale(1.05); }
.tool-btn:active { transform: scale(0.94); background: var(--cde-accent-fill-hi); }
.tool-btn.active { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }

.tool-divider {
  height: 1px; background: var(--cde-tint-strong); margin: 0.2rem 0.3rem;
}

/* ── B3: Section cut bar — centered bottom ── */
.section-bar {
  position: absolute; bottom: 1rem;
  left: 50%; transform: translateX(-50%);
  z-index: 21;
  display: flex; align-items: center; gap: 0.5rem;
  background: var(--cde-float-deep); border: 1px solid color-mix(in srgb, var(--cde-accent) 40%, transparent);
  padding: 0.4rem 0.75rem; border-radius: 8px;
  box-shadow: var(--cde-shadow-float);
  white-space: nowrap;
}
.section-label {
  display: flex; align-items: center; font-size: 0.9rem; }
.section-sep { width: 1px; height: 18px; background: var(--cde-tint-strong); margin: 0 0.1rem; }
.section-snaps { display: flex; gap: 0.25rem; }
.snap-btn {
  padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid var(--cde-tint-max);
  background: var(--cde-tint); color: var(--cde-text-dim); font-size: 0.72rem; font-weight: 700;
  cursor: pointer; transition: background 0.12s, color 0.12s;
  line-height: 1.4;
}
.snap-btn:hover { background: var(--cde-tint-max); color: var(--cde-text); }
.snap-btn--danger:hover { background: color-mix(in srgb, var(--cde-danger) 18%, transparent); color: var(--cde-danger); border-color: color-mix(in srgb, var(--cde-danger) 40%, transparent); }
.section-modes { display: flex; gap: 0.25rem; }
.mode-btn {
  padding: 0.22rem 0.6rem; border-radius: 5px; border: 1px solid var(--cde-tint-strong);
  background: var(--cde-tint-weak); color: var(--cde-text-dim); font-size: 0.73rem;
  cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.mode-btn:hover  { background: var(--cde-tint-strong); color: var(--cde-text); }
.mode-btn.active { background: color-mix(in srgb, var(--cde-accent) 30%, transparent); color: var(--cde-accent); border-color: color-mix(in srgb, var(--cde-accent) 55%, transparent); }
.section-pos {
  font-family: 'Roboto Mono', monospace; font-size: 0.7rem; color: var(--cde-accent);
  padding: 0 0.2rem;
}
.section-close {
  background: none; border: none; color: var(--cde-text-dimmer); font-size: 1rem;
  cursor: pointer; padding: 0 0.1rem; line-height: 1; transition: color 0.15s;
}
.section-close:hover { color: var(--cde-danger); }

/* ── B1: Coordinate display — centered bottom ── */
.coord-bar {
  position: absolute; bottom: 0.75rem;
  left: 50%; transform: translateX(-50%);
  z-index: 20;
  display: flex; align-items: center; gap: 0.9rem; background: var(--cde-float);
  padding: 0.35rem 0.7rem; border-radius: 6px;
  font-family: 'Roboto Mono', monospace; font-size: 0.72rem; color: var(--cde-text-soft);
  border: 1px solid var(--cde-tint);
  pointer-events: none; white-space: nowrap;
}
.coord-bar b { color: var(--cde-accent); margin-right: 2px; }
.coord-mode-badge {
  font-size: 0.6rem; font-weight: 700; color: var(--cde-text-dimmer);
  background: var(--cde-tint-weak); border-radius: 3px;
  padding: 0.05rem 0.3rem; letter-spacing: 0.05em;
}

/* ── B2: Model tag row below top-bar ── */
.model-tag-row {
  position: absolute; top: calc(1rem + 56px); left: 1rem; z-index: 19;
  display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;
}
.model-tag {
  display: flex; align-items: center; gap: 0.3rem;
  background: color-mix(in srgb, var(--cde-accent) 15%, transparent); border: 1px solid color-mix(in srgb, var(--cde-accent) 35%, transparent);
  border-radius: 4px; padding: 0.2rem 0.5rem;
  font-size: 0.78rem; color: var(--cde-accent-soft); max-width: 200px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tag-close {
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-dimmer); font-size: 0.7rem; padding: 0; line-height: 1;
  flex-shrink: 0; transition: color 0.12s;
}
.tag-close:hover { color: var(--cde-danger); }

/* ── B1: Selection badge — bottom right (no longer overlaps centered coord-bar) ── */

/* Selection-action toolbar (Hide / Isolate) */
.sel-action-btn > span { font-size: 1rem; }
.sel-action-btn > small { font-size: 0.58rem; color: var(--cde-text-dim); letter-spacing: 0.02em; }

/* Persistent "Alle zeigen" button when anything is hidden */
.show-all-btn {
  position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%); z-index: 21;
  background: color-mix(in srgb, var(--cde-success-strong) 18%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-success-strong) 50%, transparent);
  border-radius: 6px;
  padding: 0.4rem 0.9rem;
  color: var(--cde-success);
  font-size: 0.78rem; font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;
  box-shadow: var(--cde-shadow-sm);
}
.show-all-btn:hover { background: color-mix(in srgb, var(--cde-success-strong) 28%, transparent); transform: translate(-50%, -1px); }

/* T1.3: Measurement UI */
.measure-clear {
  position: absolute; bottom: 3.2rem; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 0.3rem;
  padding: 0.2rem 0.55rem;
  background: var(--cde-surface-raised);
  border: 1px solid var(--cde-line-strong);
  border-radius: 999px;
  color: var(--cde-text-dim);
  font-size: var(--cde-font-xs);
  cursor: pointer;
  z-index: 21;
}
.measure-clear:hover { color: var(--cde-danger); border-color: var(--cde-danger); }

.ablage-hinweis {
  position: absolute;
  top: 3.6rem; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 0.45rem;
  max-width: min(90%, 34rem);
  padding: 0.45rem 0.5rem 0.45rem 0.7rem;
  background: var(--cde-float);
  border: 1px solid color-mix(in srgb, var(--cde-warn) 45%, transparent);
  border-left: 3px solid var(--cde-warn);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow-float);
  color: var(--cde-text-bright);
  font-size: var(--cde-font-sm);
  z-index: var(--cde-z-hud);
}
.ablage-hinweis .cde-icon { color: var(--cde-warn); }
.ablage-hinweis-zu {
  display: inline-flex; align-items: center; justify-content: center;
  margin-left: auto; padding: 0.15rem;
  background: none; border: none; border-radius: 3px;
  color: var(--cde-text-mute); cursor: pointer;
}
.ablage-hinweis-zu:hover { color: var(--cde-text-bright); }
.ablage-hinweis-zu .cde-icon { color: inherit; }

.measure-toast {
  display: flex; align-items: center; gap: 0.35rem;
  position: absolute; top: 5.5rem; left: 50%; transform: translateX(-50%); z-index: 22;
  background: var(--cde-hinweis); color: var(--cde-hinweis-text);
  padding: 0.4rem 0.9rem; border-radius: 6px;
  font-size: 0.8rem; font-weight: 600;
  box-shadow: var(--cde-shadow-float);
}

/* T2.2: Saved Views floating panel — right edge, above coord-bar */
.saved-views-wrap {
  position: absolute; right: 1rem; top: 5rem; z-index: 25;
  width: 280px; max-height: 480px;
  background: var(--cde-surface);
  border: 1px solid color-mix(in srgb, var(--cde-amber) 25%, transparent);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--cde-scrim);
  overflow: hidden;
  display: flex; flex-direction: column;
}

/* T2.4: Annotations panel — also right, shifts down if Saved Views is open */
.annotations-wrap {
  position: absolute; right: 1rem; top: 5rem; z-index: 25;
  width: 320px; max-height: 500px;
  background: var(--cde-surface);
  border: 1px solid color-mix(in srgb, var(--cde-issue) 30%, transparent);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--cde-scrim);
  overflow: hidden;
  display: flex; flex-direction: column;
}
/* If both panels are open, push annotations down */
.saved-views-wrap ~ .annotations-wrap { top: calc(5rem + 500px); }

/* ── Transitions ── */
.sidebar-slide-enter-active, .sidebar-slide-leave-active,
.panel-slide-enter-active,   .panel-slide-leave-active,
.section-slide-enter-active, .section-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.sidebar-slide-enter-from, .sidebar-slide-leave-to { opacity: 0; transform: translateY(8px); }
.panel-slide-enter-from,   .panel-slide-leave-to   { opacity: 0; transform: translateX(-8px); }
.section-slide-enter-from, .section-slide-leave-to { opacity: 0; transform: translateY(6px); }

/* ── Animations ── */
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fadeDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
</style>
