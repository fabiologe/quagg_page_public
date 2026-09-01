<template>
  <!-- Sprint I/AP-11: Der Viewer war wahlweise in ein geliehenes
       DraggableModal (aus isyifc) gehuellt — ein Weg, den seit Sprint A
       niemand mehr nahm: die CdeView, sein einziger Aufrufer, setzt
       `standalone` fest. Mit dem Zweig faellt der LETZTE feature-fremde
       Import der CDE. -->
  <div class="standalone-shell">
    <div class="viewer-wrapper">

      <!-- ── Window chrome ── -->
      <div class="viewer-header">
        <span class="header-title"><CdeIcon name="bim" :size="14" /> That Open Engine – IFC Viewer</span>
        <div class="header-controls">
          <button class="hdr-btn hdr-close" @click="emit('close')" title="Schließen" aria-label="Schließen">
            <CdeIcon name="close" :size="13" />
          </button>
        </div>
      </div>

      <!-- ── Canvas + overlays ── -->
      <div class="viewer-body">
        <div class="canvas-root" :class="{ 'measure-cursor': messen.aktiv.value }" ref="canvasRef"></div>

        <!-- Toolbar: Datei laden -->
        <div class="top-bar">
          <div class="top-bar-left">
            <label class="action-btn primary">
              <input type="file" accept=".ifc" @change="ablage.onFileUpload" class="sr-only" />
              <CdeIcon name="documents" :size="13" /> IFC laden
            </label>

            <label v-if="ifc.modelList.length" class="action-btn secondary">
              <input type="file" accept=".ifc" @change="ablage.onFileUploadAdd" class="sr-only" />
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

        <!-- Stufe 9.2: Ergebnis des Nachspielens. Erscheint NUR, wenn etwas
             nicht durchging — „18 Festlegungen angewandt" bei jedem Laden
             wäre Lärm, zwei ungeklärte Konflikte sind eine Nachricht. -->
        <Transition name="fade">
          <div v-if="nachspielen.konflikte.value.length" class="nachspiel-hinweis">
            <CdeIcon name="warn" :size="14" />
            <span>{{ nachspielen.meldung.value }}</span>
            <button
              class="ablage-hinweis-zu"
              @click="nachspielen.zuruecksetzen()"
              title="Ausblenden"
              aria-label="Ausblenden"
            >
              <CdeIcon name="close" :size="12" />
            </button>
          </div>
        </Transition>

        <!-- B4: Zuletzt geöffnete Modelle (lokale Ablage) — nur im Leerzustand -->
        <div v-if="!ifc.modelList.length && !loading && recentModels.length" class="recent-panel">
          <div class="recent-title">Zuletzt geöffnete Modelle</div>
          <div v-for="r in recentModels" :key="r.key" class="recent-item">
            <button class="recent-open" @click="ablage.openRecent(r)">
              <span class="recent-name">{{ r.meta?.name ?? r.key }}</span>
              <span class="recent-info">{{ fmtBytes(r.size) }} · {{ fmtDate(r.meta?.savedAt) }}</span>
            </button>
            <button class="recent-del" @click="ablage.deleteRecent(r)" title="Aus lokalem Speicher entfernen" aria-label="Aus lokalem Speicher entfernen">
              <CdeIcon name="close" :size="12" />
            </button>
          </div>
          <div class="recent-hint">Im Browser gespeichert — ohne Netzverbindung verfügbar.</div>
        </div>

        <!-- B2: Model tags in separate row below top-bar -->
        <div v-if="ifc.modelList.length" class="model-tag-row">
          <span v-for="m in ifc.modelList" :key="m.modelId" class="model-tag">
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
          <div v-if="schnitt.leisteOffen.value" class="section-bar">
            <span class="section-label"><CdeIcon name="section" :size="15" /></span>

            <!-- SC-1: Snap-to-axis buttons -->
            <div class="section-snaps">
              <button class="snap-btn" title="Horizontal (Grundriss)" @click="schnitt.ausrichten('horizontal')">H</button>
              <button class="snap-btn" title="Senkrecht X-Achse"      @click="schnitt.ausrichten('x')">X</button>
              <button class="snap-btn" title="Senkrecht Z-Achse"      @click="schnitt.ausrichten('z')">Z</button>
            </div>

            <div class="section-sep"></div>

            <!-- Mode buttons -->
            <div class="section-modes">
              <button
                class="mode-btn"
                :class="{ active: schnitt.modus.value === 'translate' }"
                title="Verschieben [T]"
                @click="schnitt.setzeModus('translate')"
              >↕ Verschieben</button>
              <button
                class="mode-btn"
                :class="{ active: schnitt.modus.value === 'rotate' }"
                title="Drehen [R]"
                @click="schnitt.setzeModus('rotate')"
              >⟳ Drehen</button>
            </div>

            <!-- SC-2: Position readout -->
            <span v-if="schnitt.position.value" class="section-pos">
              Y&thinsp;{{ schnitt.position.value.y }}&thinsp;m
            </span>

            <div class="section-sep"></div>

            <!-- SC-4: Reset position to model center -->
            <button class="snap-btn" title="Zur Modellmitte zurücksetzen" aria-label="Zur Modellmitte zurücksetzen" @click="schnitt.zuruecksetzen()">
              <CdeIcon name="refresh" :size="12" />
            </button>
            <!-- Blendet nur die Leiste aus; die Schnittebene bleibt aktiv.
                 Erst der Schnitt-Knopf in der Werkzeugleiste entfernt sie ganz. -->
            <button class="section-close" @click="schnitt.leisteAusblenden()" title="Werkzeug ausblenden [Esc]" aria-label="Schnitt-Werkzeugleiste ausblenden">
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
          :measurements="ifc.messungen"
          :element="ifc.selectedElement"
          :elementAnker="selectionAnchor"
          :projectToScreen="(p) => engine?.projectToScreen(p)"
          :getCamera="() => engine?._getWorld()?.camera?.three ?? null"
          :getCanvas="() => canvasRef"
          @delete-measurement="messen.entferne"
          @zoom="onZoomSelected"
          @hide="onHideSelected"
          @isolate="onIsolateSelected"
          @properties="emit('open-properties')"
          @new-issue="issueAmBauteil"
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

        <!-- Stufe 9.3: warum sich dieses Bauteil nicht ziehen lässt. „Geht
             nicht" ohne Grund ist die schlechteste Rückmeldung — der Nutzer
             probiert weiter, weil er nicht weiss, ob er etwas falsch macht. -->
        <Transition name="fade">
          <div v-if="ziehen.grund.value" class="zieh-hinweis">
            <CdeIcon name="warn" :size="13" /> {{ ziehen.grund.value }}
          </div>
          <!-- Einschränkung statt Absage: der Griff ARBEITET, nur zwängt er
               nicht entlang der Bauteilachse. Das muss dastehen, sonst sieht
               er genauso aus wie der richtige und schiebt anders. -->
          <div v-else-if="ziehen.warnung.value" class="zieh-hinweis eingeschraenkt">
            <CdeIcon name="warn" :size="13" /> {{ ziehen.warnung.value }}
          </div>
        </Transition>

        <!-- Mess-Hinweis (die Werte selbst stehen als Pillen an der Strecke) -->
        <Transition name="fade">
          <div v-if="messen.meldung.value" class="measure-toast"><CdeIcon name="measure" :size="14" /> {{ messen.meldung.value.text }}</div>
        </Transition>
        <Transition name="fade">
          <button
            v-if="ifc.messungen.length"
            class="measure-clear"
            title="Alle Messungen entfernen"
            @click="messen.alleEntfernen"
          >
            <CdeIcon name="delete" :size="13" /> {{ ifc.messungen.length }} Messung{{ ifc.messungen.length === 1 ? '' : 'en' }}
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
          @offset-changed="annotationen.versatzGeaendert"
        />

      </div>

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
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue';
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
import IfcLoadOverlay     from './IfcLoadOverlay.vue';
import IfcShortcutsOverlay from './IfcShortcutsOverlay.vue';
import IfcStoreyNav        from './IfcStoreyNav.vue';
import IfcSavedViews       from './IfcSavedViews.vue';
import IfcAnnotationOverlay from './IfcAnnotationOverlay.vue';
import { applyLayerStyle } from '../services/LayerStyleManager.js';
import { provideViewerApi } from '../composables/viewerApi.js';
import { anwendungsweg, planFuerEintrag } from '../services/Nachspielen.js';
import { karteMitEngine } from '../services/GlobalIdKarte.js';
import '../styles/theme.css';
import { useModellAblage, fmtBytes, fmtDate } from '../composables/useModellAblage.js';
import { useSchnitt } from '../composables/useSchnitt.js';
import { useMessen } from '../composables/useMessen.js';
import { useAnnotationen } from '../composables/useAnnotationen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useNachspielen } from '../composables/useNachspielen.js';
import { useZiehen } from '../composables/useZiehen.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { BEARBEITUNGEN, GRUPPEN } from '../services/Bearbeitungen.js';
import { repo } from '../services/RepoFacade.js';

const emit = defineEmits(['close', 'open-properties', 'model-loaded']);
const ifc  = useIfcStore();
const cde  = useCdeStore();
const panels = usePanels();
const ansicht = useAnsicht();
const cmds = usePaletteCommands();
const bearbeitung = useBearbeitung();

defineProps({
  propertiesOpen: { type: Boolean, default: false },
});

// ── refs ────────────────────────────────────────────────────────────────────
const canvasRef   = ref(null);

const engine      = shallowRef(null);
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

// ── Schnittebene (Sprint I, Stufe 5) ────────────────────────────────────────
const schnitt = useSchnitt({ engine });

// PDF export
const showPalette   = ref(false);
const paletteNurElemente = ref(false);
const showShortcuts = ref(false);

// T1.3: Measurement
// ── Messen (Sprint I, Stufe 5) ──────────────────────────────────────────────
// `selection` wird als GETTER hereingereicht: der SelectionHandler entsteht
// erst in onMounted, ein Wert wäre zur Aufrufzeit noch null.
const messen = useMessen({ engine, ifc, selection: () => _selection });

// ── Issue-Pins (Sprint I, Stufe 5) ──────────────────────────────────────────
// `annotationActive` bleibt als Ref HIER: die CdeView liest ihn über
// `defineExpose`, und Vue entpackt Refs im expose-Proxy. Ein Wert im
// Composable wäre dort nicht nachverfolgbar.
const annotationActive = ref(false);
// Das Journal aus Stufe 7 — EIN Bezug, nicht drei Aufrufe. Der Store ist zwar
// ein Singleton, aber drei Aufrufstellen lesen sich wie drei Dinge.
const aenderungen = useAenderungen();
// Stufe 9.2: bringt beim Laden die Festlegungen aufs Modell und meldet, was
// nicht durchging.
const nachspielen = useNachspielen({ engine, aenderungen });

/**
 * Stufe 9.3: der Griff am Bauteil. Braucht `nachspielen` für den eingefrorenen
 * Lieferstand und `bearbeitung` für die Bauform — beide sind oben schon da.
 */
const ziehen = useZiehen({
  engine, cde, aenderungen, bearbeitung, nachspielen,
  getAuswahl:   () => ifc.selectedElement,
  getModellSha: () => ablage.geladeneModellSha?.() ?? null,
});

const annotationen = useAnnotationen({
  engine, ifc, cde,
  selection: () => _selection,
  messen,
  viewpoint: () => erfasseViewpoint(),
  aktiv: annotationActive,
});

// Multi-model list

// Stabile Modell-Identität pro geladenem Modell (B3) + lokale Ablage (B4)

// Coordinate display mode
const coordMode = ref('viewer'); // 'viewer' | 'ifc'

let _mouseDownAt = null;
let _hoverTimer  = null;
let _lastMouse   = null;
let _selection   = null;  // IfcSelectionHandler — übernimmt Click/Hover/Marquee

// ── Modelle laden und ablegen (Sprint I, Stufe 5) ───────────────────────────
// Dateiladen, IndexedDB-Ablage und „zuletzt geöffnet" lagen hier zwischen
// Schnitt, Messen und Tastatur. `_onModelLoaded` bleibt in der Schale — es ist
// die Orchestrierung nach dem Laden und fasst sechs Belange an.
const ablage = useModellAblage({
  engine, ifc, cde,
  onModelLoaded: () => _onModelLoaded(),
});
const { loading, recentModels, ablageHinweis } = ablage;

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

/** Issue direkt am gewählten Bauteil anlegen (Pin sitzt auf dem HUD-Anker). */
function issueAmBauteil() {
  const anker = selectionAnchor.value;
  if (!anker) return;
  const text = prompt('Issue am gewählten Bauteil — Beschreibung:', '');
  if (text === null) return;
  const letzteFarbe = ifc.annotations[ifc.annotations.length - 1]?.color ?? '#e91e63';
  annotationen.anPunkt(anker, text, letzteFarbe);
}

function onZoomSelected() {
  const el = ifc.selectedElement;
  if (el) engine.value?.zoomToElement(el.modelId, el.localId);
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
    active: schnitt.aktiv.value, action: () => schnitt.umschalten() },
  { id: 'coords', icon: 'coords', label: coordMode.value === 'ifc' ? 'IFC' : 'Viewer',
    title: 'Koordinaten umschalten (Viewer ↔ IFC)',
    active: coordMode.value === 'ifc',
    action: () => { coordMode.value = coordMode.value === 'viewer' ? 'ifc' : 'viewer'; } },
  { divider: true },
  { id: 'plan', icon: 'view-top', label: 'Plan', title: 'Planinhalt und Ausgabe (PDF, DXF, Profile)',
    active: panels.isOpen('plan'), action: () => panels.toggle('plan') },
  { id: 'blatt', icon: 'snapshot', label: 'Blatt', title: 'Diese 3D-Ansicht als Bild auf ein Blatt (PDF)',
    action: () => ansichtAufsBlatt() },
  { id: 'cockpit', icon: 'cockpit', label: 'Planung', title: 'Planungs-Cockpit (Flächen, Kosten, Qualität)',
    active: panels.isOpen('cockpit'), action: () => panels.toggle('cockpit') },
  { divider: true },
  { id: 'measure', icon: 'measure', label: 'Messen', title: 'Strecke messen', key: 'M',
    active: messen.aktiv.value, action: () => messen.umschalten() },
  { id: 'ziehen', icon: 'pointer', label: 'Ziehen', title: 'Bauteil verschieben (geführt)', key: 'G',
    active: ziehen.aktiv.value, action: () => ziehen.umschalten() },
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
/**
 * Auswahl einordnen — mit Anker und Bezugshöhe.
 *
 * Die Hülle kommt HIER dazu und nicht im Store: `useBearbeitung` holt sich
 * nichts selbst (Hausregel — sonst hinge er an der Engine und wäre ohne WebGL
 * nicht mehr prüfbar). Gebraucht wird sie von jeder Bearbeitung, die eine Lage
 * verändert: „Bezugshöhe setzen" muss wissen, wo die Unterkante HEUTE liegt,
 * sonst verschöbe es um den absoluten Wert statt um die Differenz — und ein
 * Rohr auf Sohlhöhe 12,40 landete auf 12,40 ÜBER seiner jetzigen Lage.
 */
async function _einordnenMitHuelle(result) {
  let angereichert = result;
  try {
    const h = (await engine.value?.huellenVon?.(result.modelId, [result.localId]))?.get(result.localId);
    if (h) {
      // Der HÖHENVERSATZ muss mit. Ohne ihn zeigt und verlangt jede
      // Höhenbearbeitung Three-Koordinaten — das Modell wird beim Laden zum
      // Ursprung verschoben (`COORDINATE_TO_ORIGIN`), damit die Float32-Puffer
      // nicht an Gauss-Krüger-Grössenordnungen zerbrechen. Sichtbar wurde es
      // als „Höhe −17,4 statt 301 m NN".
      const versatz = engine.value?.getCoordOffsetForModel?.(result.modelId)?.y ?? 0;
      angereichert = { ...result, anker: h.anker, bezugshoehe: h.unterkante,
                       oberkante: h.oberkante, hoehenversatz: versatz };
    }
  } catch (fehler) {
    // Ohne Hülle wird eingeordnet wie bisher; die lagebezogenen Bearbeitungen
    // melden dann selbst, dass ihnen der Bezug fehlt.
    console.warn('cde: huelle lesen', fehler?.message ?? fehler);
  }
  return bearbeitung.einordne(angereichert, engine.value?.makeGeometryResolver?.());
}

/**
 * Das CDE-eigene Modell aus dem Journal NEU aufbauen (Stufe 9.4).
 *
 * Benannte Funktion statt Objektschlüssel, weil `wendeEintragAn` sie
 * mitbenutzt: ein erzeugtes Bauteil darf NIE einzeln angewandt werden.
 */
async function baueErzeugteNeu() {
    if (!engine.value?.autor) return null;
    const plan = { anzuwenden: [] };
    for (const [globalId, wert] of aenderungen.wirksamerStand('erzeugt')) {
      plan.anzuwenden.push({ globalId, art: 'erzeugt', modell: 'cde', wert });
    }
    const r = await engine.value.autor.baueErzeugte(plan.anzuwenden);
    if (r.misserfolge.length) {
      console.warn('[CDE] erzeugte Bauteile', r.misserfolge.map(m => m.grund));
    }
    return r;
}

provideViewerApi({
  // Snapshots & Ansichten
  saveRenderState:      () => engine.value?.saveRenderState(),
  restoreRenderState:   (s) => engine.value?.restoreRenderState(s),
  applyLayerStyle:      (style) => applyLayerStyle(style, engine.value),
  // Szene / Kamera
  getScene:             () => engine.value?._getWorld()?.scene?.three ?? null,
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
  getMeasurements:      () => ifc.messungen,
  // Interaktion
  zoomToElement:        (modelId, localId) => engine.value?.zoomToElement(modelId, localId),
  /**
   * Wie zoomToElement, aber ohne Modell-Kennung: nimmt das erste geladene.
   * Für Aufrufer, die nur eine localId haben (Struktur-Baum, Befehlspalette).
   */
  zoomToLocalId:        async (localId, modelId = null) => {
    const mid = modelId ?? engine.value?.getModelList()?.[0]?.modelId;
    if (mid != null) await engine.value?.zoomToElement(mid, localId);
  },
  zoomToCategory:       (name) => engine.value?.zoomToCategory(name),
  setStoreyVisible:     (localId, visible, modelId = null) =>
                          engine.value?.setStoreyVisible(localId, visible, modelId),
  /** Merkmalssatz am gewählten Bauteil anlegen und die Anzeige nachladen. */
  addPsetToElement:     async (psetName, props) => {
    await engine.value.addPsetToElement(psetName, props);
    return engine.value.refreshElement();
  },
  /** BBox + Koordinatenversatz eines Bauteils — für die Brücken-Übergabe. */
  getElementBox:        async (localId, modelId = null) => {
    if (!engine.value) return null;
    const mid = modelId ?? engine.value.getModelList()?.[0]?.modelId;
    if (mid == null) return null;
    const boxes = await engine.value.getBoxes([localId], mid);
    if (!boxes?.length) return null;
    return { box: boxes[0], offset: engine.value.getCoordOffsetForModel(mid), modelId: mid };
  },
  setElementColors:     (colorMap) => engine.value?.setPerElementColors(colorMap),
  resetElementColors:   () => engine.value?.resetCategoryColors(),
  // Sprint T1: Georeferenz + Dokument-Status für den Planexport
  getAllCoordOffsets:   () => engine.value?.getAllCoordOffsets() ?? {},
  /**
   * Was die Dateien über ihre Lage sagen — je Modell (Stufe 13.1).
   *
   * Geht über `IfcEngine.leseGeoreferenzen`, und das fragt jede Quelle
   * vorher `lebt()`. Der erste Anlauf las über `ifcLoader.webIfc` — einen
   * Handle ohne Modell — und hat damit den Viewer gekostet.
   */
  getGeoreferenzen:     () => engine.value?.leseGeoreferenzen() ?? {},
  getWebIfcAPIs:        () => engine.value?.getWebIfcAPIs() ?? [],
  getLoadedModelSha:    () => ablage.geladeneModellSha(),

  /**
   * Das CDE-eigene Modell aus dem Journal NEU aufbauen (Stufe 9.4).
   *
   * Gerufen vom Lageplan, sobald dort ein Bauteil entstanden ist. Der Plan
   * selbst braucht das nicht — er zeichnet direkt aus dem Journal —, aber die
   * Raumansicht schon: ohne diesen Aufruf stünde ein gerade gezeichnetes Rohr
   * erst nach dem nächsten Laden im Raum, und es sähe aus, als wäre es
   * verlorengegangen.
   *
   * Aufgebaut wird der ganze Stand, nicht der letzte Schritt — dieselbe
   * Idempotenz wie beim Nachspielen, und damit auch der Weg, auf dem eine
   * Rücknahme wirkt.
   */
  /**
   * Einen frisch geschriebenen Journaleintrag SOFORT wirksam machen (12.0b).
   *
   * Ohne das schrieb das Formular ins Journal, und nichts geschah: nur Ziehen,
   * Laden und Zeichnen brachten je etwas ans Modell. Wer eine Sohlhöhe eintrug,
   * sah sein Bauteil erst nach `F5` springen — für den Nutzer ununterscheidbar
   * von „kaputt".
   *
   * Es läuft über DENSELBEN `wendeAn` wie das Nachspielen, nicht über einen
   * eigenen Sofortpfad: zwei Anwendungswege liefen irgendwann auseinander, und
   * dann wäre die Frage „warum steht es nach dem Neuladen anders da?" nicht
   * mehr zu beantworten.
   *
   * @returns {Promise<{weg, angewandt, nurFestlegung, grund}>}
   */
  wendeEintragAn: async (eintrag) => {
    const weg = anwendungsweg(eintrag);
    if (weg === 'neuaufbau') {
      // Erzeugtes NIE einzeln: `baueErzeugte` verwirft das Modell und baut nur,
      // was es bekommt — ein Ein-Schritt-Plan löschte alles andere Erzeugte mit.
      const r = await baueErzeugteNeu();
      return { weg, angewandt: !r?.misserfolge?.length, nurFestlegung: false,
               grund: r?.misserfolge?.[0]?.grund ?? null };
    }
    if (weg === 'nur-festlegung') return { weg, angewandt: false, nurFestlegung: true, grund: null };

    if (!engine.value || !eintrag?.globalId) return { weg, angewandt: false, nurFestlegung: false, grund: 'keine_engine' };
    const { karte } = await karteMitEngine(engine.value, new Set([eintrag.globalId]));
    const ort = karte.get(eintrag.globalId);
    const plan = planFuerEintrag(eintrag, ort?.modelId ?? null);
    const { misserfolge, nichtAngewandt = [] } = await engine.value.wendeFestlegungenAn(plan, {
      globalIdZuLocalId: new Map(ort ? [[eintrag.globalId, ort.localId]] : []),
    });
    return {
      weg,
      angewandt: !misserfolge.length && !nichtAngewandt.length,
      nurFestlegung: nichtAngewandt.length > 0,
      grund: misserfolge[0]?.grund ?? null,
    };
  },

  baueErzeugteNeu,
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
    // Stufe 9.0: einordnen, damit das Kontextmenü weiß, was hier möglich ist.
    // Der Resolver wird JE AUSWAHL gebaut — er cached je Modell, und ein über
    // den Modellwechsel hinweg behaltener liefert Geometrie des alten Modells.
    // Der Griff hängt am ALTEN Bauteil — er muss weg, bevor die neue
    // Einordnung kommt. Sonst zöge man am Griff des vorigen.
    ziehen.loesen();
    _einordnenMitHuelle(result)
      .catch(e => console.warn('cde: einordnen', e?.message ?? e));
  });
  _selection.onClickEmpty(() => {
    ziehen.loesen();
    ifc.clearElement();
    bearbeitung.einordne(null, null);
  });
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

  // B4: lokale Modell-Ablage für den Leerzustand einlesen
  ablage.aktualisiereZuletzt();

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

    // Stufe 9.0: der DRITTE Verbraucher des Bearbeitungs-Katalogs. Dieselbe
    // Liste wie im Kontextmenü — `verfuegbar` spiegelt die Bauform-Prüfung,
    // damit die Palette nichts anbietet, was das Menü verschweigt.
    ...BEARBEITUNGEN.map(b => ({
      id: `bearb.${b.id}`, titel: b.titel, icon: b.icon,
      gruppe: GRUPPEN[b.gruppe]?.titel ?? 'Bearbeiten',
      verfuegbar: () => bearbeitung.moeglich.some(m => m.id === b.id),
      run: () => bearbeitung.starte(b.id),
    })),
  ]);

  // Büro-/Projektprofile einmal je Sitzung laden (Stufe 6: Vorrangregel).
  bearbeitung.ladeProfile(repo).catch(e => console.warn('cde: typprofile', e?.message ?? e));
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
  openBySha: (sha) => ablage.openBySha(sha),
  openFromProjectPath: (pfad) => ablage.openFromProjectPath(pfad),
  zoomToPoint: (position) => annotationen.zoomeAufPin(position),
  applyViewpoint: anwendenViewpoint,
  captureViewpoint: erfasseViewpoint,
  toggleAnnotationMode: () => annotationen.umschalten(),
  /**
   * Messungen und Modell-Kennung fuer die CdeView.
   *
   * Sie liegen auch in der `viewerApi`, aber die ist fuer Kinder gedacht, die
   * IM Viewer haengen. Die CdeView ist sein Elternteil und kommt ueber die
   * Komponentenreferenz heran — kein zweiter Weg zur selben Sache, sondern
   * die passende Richtung.
   */
  messungen: () => ifc.messungen,
  geladeneModellSha: () => ablage.geladeneModellSha(),
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

async function removeModel(modelId) {
  await engine.value?.unloadModel(modelId);
  ablage.vergiss(modelId);
  ifc.setModelList(engine.value.getModelList());
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
  ifc.setModelList(engine.value.getModelList());

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
    const identity = ablage.identitaet(firstModel.modelId);
    await ifc.loadAnnotationsForModel(identity?.key ?? firstModel.name, firstModel.name);
    // If annotation mode is on, re-create visuals; otherwise pre-fill engine's data only
    engine.value?.setAnnotations(ifc.annotations);

    // Stufe 9.2: Die Festlegungen aus dem Journal auf das frisch geladene
    // Modell bringen. Ohne diesen Aufruf ist jede Bearbeitung beim Neuladen
    // weg — das Journal liegt in der RepoFacade, das Modell kommt roh vom
    // Planer. Bewusst NICHT awaited an einer Stelle, die das Anzeigen
    // aufhielte: ein Modell ohne Festlegungen ist besser als gar keins.
    nachspielen.nachModellladung(firstModel.modelId).then(({ konflikte }) => {
      if (konflikte) console.info('[CDE]', nachspielen.meldung.value);
    });
  }

  // Ein neues Modell entwertet den Schnitt.
  schnitt.verwerfen();

  emit('model-loaded');
}

/**
 * Die aktuelle 3D-Ansicht als Bild auf ein Blatt.
 *
 * Der schlichte Rasterweg — ein Schnappschuss mit Schriftfeld, fuer Berichte
 * und Besprechungen. Der massstaebliche Plan ist der Lageplan-Modus; dort
 * liegen Vektorausgabe, Bemassung und die Tiefbau-Pakete.
 *
 * Vorher steckte das im PDF-Export-Modal, zusammen mit einem zweiten
 * three.js-Renderer, einer 150-ms-Vorschauschleife und einer Uebersichtskarte —
 * alles nur, damit man ein starres Standbild ausrichten konnte.
 */
async function ansichtAufsBlatt() {
  const bild = engine.value?.getCanvasSnapshot?.(3);
  if (!bild) return;
  const { exportPlanPDF } = await import('../services/IfcPdfExporter.js');
  const p = cde.auftrag;
  exportPlanPDF({
    snapshot: bild,
    format: ansicht.format,
    orientation: ansicht.ausrichtung,
    titleBlock: {
      projekt:      [p?.nummer, p?.name].filter(Boolean).join(' '),
      auftraggeber: p?.bauherr ?? '',
      bearbeiter:   cde.bearbeiter ?? '',
      datum:        new Date().toLocaleDateString('de-DE'),
      massstab:     'ohne Maßstab',
    },
    logo: null,
  });
}

// ── Section cuts ─────────────────────────────────────────────────────────────

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
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); messen.umschalten(); return; }
  if (e.key === 'Escape' && messen.aktiv.value) { messen.umschalten(); return; }

  // Stufe 9.3: G haengt den Griff an die Auswahl. Der Eintrag in der
  // Werkzeugleiste traegt `key: 'G'` — stuende die Taste nur DORT, verspraeche
  // der Tooltip etwas, das nie passiert (die Registry beschriftet, sie bindet
  // nicht).
  if (e.key === 'g' || e.key === 'G') { e.preventDefault(); ziehen.umschalten(); return; }
  if (e.key === 'Escape' && ziehen.aktiv.value) { ziehen.loesen(); return; }

  // T2.2: V toggles Saved Views panel
  if (e.key === 'v' || e.key === 'V') { e.preventDefault(); showSavedViews.value = !showSavedViews.value; return; }

  // T2.4: N toggles Notes panel, Esc exits annotation placement mode
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); panels.toggle('issues'); return; }
  if (e.key === 'Escape' && annotationActive.value) { annotationen.umschalten(); return; }

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
  if (!schnitt.aktiv.value) return;
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); schnitt.setzeModus('translate'); }
  if (e.key === 'r' || e.key === 'R') { e.preventDefault(); schnitt.setzeModus('rotate'); }
  if (e.key === 'Escape') schnitt.leisteAusblenden();
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
  // Die Engine hat den Schnitt beim Anfahren selbst gesetzt — die Oberfläche
  // zieht nach. Vorher stand die Rückmeldungs-Registrierung hier ein zweites
  // Mal, Zeichen für Zeichen.
  if (ok && withSection) schnitt.uebernehmeVonEngine();
}

/**
 * Ein Geschoss ein- oder ausblenden.
 *
 * Fehlte seit der Composable-Zerlegung (Stufe 5): `IfcStoreyNav` emittierte
 * `set-visible`, die Engine kann `setStoreyVisible` — nur der Handler
 * dazwischen war weg. Ergebnis war nicht ein toter Klick, sondern ein
 * abgebrochener Renderlauf: Vue meldete „Property onStoreyVisible was accessed
 * during render but is not defined", und danach starb der Patch-Vorgang mit
 * `Cannot set properties of null`. Dieselbe Klasse wie `zoomToAnnotation`
 * (aa8efe5) — und dieselbe Blindstelle: der Undef-Wächter prüft das SKRIPT,
 * nicht die Vorlage.
 */
function onStoreyVisible({ modelId, localId, visible }) {
  engine.value?.setStoreyVisible(localId, visible, modelId);
}

// ── T1.3: Measurement ────────────────────────────────────────────────────────

// ── T2.4: Annotations ────────────────────────────────────────────────────────


function onToggleViews() { showSavedViews.value  = !showSavedViews.value; }
function onToggleNotes() { panels.toggle('issues'); }





// ── mouse interaction ─────────────────────────────────────────────────────────
// Selection + Hover + Marquee laufen über _selection (IfcSelectionHandler).
// Hier nur noch die Tool-Modi (Measure / Annotation), die statt zu selektieren
// Punkte/Pins setzen.

function onMouseMoveForTools(e) {
  // Nur aktiv im Measure-Modus — Live-Hover-Marker für den nächsten Messpunkt.
  if (!messen.aktiv.value) return;
  if (_hoverTimer) clearTimeout(_hoverTimer);
  _lastMouse = { x: e.clientX, y: e.clientY };
  _hoverTimer = setTimeout(() => {
    const m = _lastMouse;
    if (m) messen.bewegung(m.x, m.y);
  }, 30);
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  if (!(messen.aktiv.value || annotationActive.value)) return;
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

  if (await messen.klick(downX, downY)) return;

  if (await annotationen.klick(e)) return;
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

/* Stufe 9.2 — gleiche Gestalt wie der Ablage-Hinweis, eigene Bedeutung.
   Etwas tiefer, damit beide nebeneinander lesbar bleiben, wenn ein Upload und
   ein Konflikt zusammenfallen. */
.nachspiel-hinweis {
  position: absolute;
  top: 7.2rem; left: 50%; transform: translateX(-50%);
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

/* Stufe 9.3 — gleiche Gestalt wie der Ablage-Hinweis, eigene Bedeutung. */
.zieh-hinweis.eingeschraenkt { border-color: var(--cde-warn); color: var(--cde-warn); }
.zieh-hinweis {
  position: absolute;
  top: 9rem; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 0.4rem;
  max-width: min(90%, 34rem);
  padding: 0.4rem 0.7rem;
  background: var(--cde-float);
  border: 1px solid color-mix(in srgb, var(--cde-warn) 45%, transparent);
  border-left: 3px solid var(--cde-warn);
  border-radius: var(--cde-radius);
  box-shadow: var(--cde-shadow-float);
  color: var(--cde-text-bright);
  font-size: var(--cde-font-sm);
  z-index: var(--cde-z-hud);
}
</style>
