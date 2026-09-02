<template>
  <!-- Sprint I/AP-11: Der Viewer war wahlweise in ein geliehenes
       DraggableModal (aus isyifc) gehuellt — ein Weg, den seit Sprint A
       niemand mehr nahm: die CdeView, sein einziger Aufrufer, setzt
       `standalone` fest. Mit dem Zweig faellt der LETZTE feature-fremde
       Import der CDE. -->
  <div class="standalone-shell">
    <div class="viewer-wrapper">

      <!-- ── Window chrome ── -->
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

        <!-- MILLIMETER-WACHE: nicht wegklickbar, solange ein Modell mit
             Längenfaktor ≠ 1 geladen ist. Laut statt still — die Zahlen der
             Prüfliste und Mengen stimmen in dieser Einheit nicht. -->
        <div v-if="einheitsWarnung" class="einheit-banner">
          <CdeIcon name="warn" :size="14" />
          <span>
            Dieses Modell ist in
            <strong>{{ einheitsWarnung.praefix === 'MILLI' ? 'Millimetern' : `${einheitsWarnung.name} × ${einheitsWarnung.faktor}` }}</strong>
            geschrieben. Ansehen und Messen in Modelleinheiten gehen; Bearbeitung,
            Prüfliste und Mengen sind bis zur Einheiten-Umrechnung nicht belastbar.
          </span>
        </div>

        <!-- Das Ansicht-Popover (X2) — neben dem Anker, schliesst nach
             der Wahl; Views und Ebenen bleiben Umschalter. -->
        <div v-if="ansichtOffen" class="ansicht-popover">
          <button v-for="e in ANSICHT_EINTRAEGE" :key="e.id" class="ap-eintrag"
                  :title="e.titel" @click="ansichtWaehle(e)">
            <CdeIcon :name="e.icon" :size="14" /> {{ e.titel }}
          </button>
          <div class="ap-trenner"></div>
          <button class="ap-eintrag" :class="{ aktiv: showSavedViews }"
                  title="Gespeicherte Ansichten [V]"
                  @click="showSavedViews = !showSavedViews; ansichtOffen = false">
            <CdeIcon name="views" :size="14" /> Gespeicherte Ansichten
          </button>
          <button class="ap-eintrag" :class="{ aktiv: showLayerPanel }"
                  title="Ebenen / Kategorien"
                  @click="showLayerPanel = !showLayerPanel; ansichtOffen = false">
            <CdeIcon name="layers" :size="14" /> Ebenen / Kategorien
          </button>
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

        <!-- DER MODUS, SICHTBAR. Ein Modus, den man nicht sieht, ist keiner:
             man muss ohne Hinsehen wissen, ob ein Klick etwas verändert. Der
             Rahmen liegt über allem und fängt keine Klicks ab. -->
        <div v-if="bearbeitung.modusAn" class="bearb-rahmen" aria-hidden="true"></div>
        <!-- Die SITZUNGS-LEISTE (U2): der Modus zeigt, was er gesammelt
             hat — und trägt seine beiden Ausgänge. „Abschließen" führt in
             den Commit-Dialog; das X ist Taste E und tut dasselbe. -->
        <div v-if="bearbeitung.modusAn" class="bearb-marke">
          <CdeIcon name="edit" :size="12" />
          <span>Sitzung</span>
          <button
            v-if="aenderungen.sitzungSchritte.length"
            class="bearb-zahl"
            title="Versionsverlauf öffnen"
            @click="panels.open('verlauf')"
          >
            {{ aenderungen.sitzungVorgaenge.length }}
            Schritt{{ aenderungen.sitzungVorgaenge.length === 1 ? '' : 'e' }}
          </button>
          <button
            class="bearb-abschluss"
            :class="{ gedimmt: !herkunftAn }"
            title="Herkunft färben: Geändertes orange, selbst Gebautes blau (9.6)"
            @click="herkunftUmschalten"
          ><CdeIcon name="style" :size="11" /></button>
          <button
            v-if="aenderungen.sitzungSchritte.length"
            class="bearb-abschluss"
            title="Sitzung abschließen — Commit mit Nachricht"
            @click="bearbeitung.commitDialogOffen = true"
          ><CdeIcon name="check" :size="11" /> Abschließen</button>
          <button class="bearb-marke-aus" title="Bearbeiten beenden [E]" @click="bearbeitenUmschalten()">
            <CdeIcon name="close" :size="11" />
          </button>
        </div>

        <Transition name="fade">
          <div v-if="modusMeldung" class="bearb-sperre">
            <CdeIcon name="warn" :size="13" /> {{ modusMeldung }}
          </div>
        </Transition>

        <!-- B1: Koordinatenanzeige — centered bottom -->
        <div v-if="coords" class="coord-bar">
          <button
            class="coord-mode-badge"
            :title="`${COORD_MODI[coordMode].titel} — Klick wechselt den Bezug`"
            @click="coordMode = COORD_REIHE[(COORD_REIHE.indexOf(coordMode) + 1) % COORD_REIHE.length]"
          >{{ COORD_MODI[coordMode].kurz }}</button>
          <!-- PROJEKT ist die Vorgabe: das ist, was im CAD steht. Die beiden
               anderen Modi bleiben — für „warum liegt das so?" braucht man sie. -->
          <template v-if="coordMode === 'projekt' && projektKoords">
            <span><b>E</b> {{ projektKoords.ost }}&thinsp;m</span>
            <span><b>N</b> {{ projektKoords.nord }}&thinsp;m</span>
            <span><b>H</b> {{ projektKoords.hoehe }}&thinsp;m</span>
            <span v-if="projektKoords.crs" class="coord-crs">{{ projektKoords.crs }}</span>
          </template>
          <template v-else-if="coordMode === 'projekt'">
            <span class="coord-crs">kein Landesbezug — nur Modellkoordinaten</span>
          </template>
          <template v-if="coordMode === 'viewer'">
            <span><b>X</b> {{ coords.x }}&thinsp;m</span>
            <span><b>Y</b> {{ coords.y }}&thinsp;m</span>
            <span><b>Z</b> {{ coords.z }}&thinsp;m</span>
          </template>
          <template v-if="coordMode === 'ifc'">
            <span><b>X</b> {{ coords.ox }}&thinsp;m</span>
            <span><b>Y</b> {{ coords.oy }}&thinsp;m</span>
            <span><b>Z</b> {{ coords.oz }}&thinsp;m</span>
          </template>
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
            :class="{ hochgerueckt: messen.aktiv.value || annotationActive }"
            title="Alle wieder einblenden"
            @click="onShowAll"
          >
            <CdeIcon name="visible" :size="14" /> Alle zeigen
          </button>
        </Transition>

        <!-- T3: Die Modus-Leiste STEHT, solange ein Tipp-Modus an ist — sie
             sagt, was der nächste Tipp tut, und trägt den sichtbaren Ausgang
             (Muster: Statuszeile flood-3D, Fertig-Knopf des Pre-Editors).
             Auf dem Tablet gibt es weder Hover noch Esc — ohne die Leiste
             sah ein Modus nach 3,5 s Toast tot aus. -->
        <Transition name="fade">
          <div v-if="messen.aktiv.value || annotationActive" class="modus-leiste">
            <CdeIcon :name="messen.aktiv.value ? 'measure' : 'issues'" :size="14" />
            <span>{{ messen.aktiv.value
              ? (messen.hinweis.value ?? 'Ersten Punkt antippen')
              : 'Ort für die Notiz antippen' }}</span>
            <button
              class="modus-fertig"
              :title="messen.aktiv.value ? 'Messen beenden [M]' : 'Notiz-Modus beenden'"
              @click="messen.aktiv.value ? messen.beenden() : annotationen.umschalten()"
            >
              <CdeIcon name="check" :size="12" /> Fertig
            </button>
          </div>
        </Transition>
        <!-- Flüchtige Rückmeldung (Messwert, Fehlgriff) — über der Leiste. -->
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
import { bestimmeBezug } from '../services/Projektkoordinaten.js';
import { anwendungsweg, planFuerEintrag } from '../services/Nachspielen.js';
import { karteMitEngine } from '../services/GlobalIdKarte.js';
import '../styles/theme.css';
import { useModellAblage, fmtBytes, fmtDate } from '../composables/useModellAblage.js';
import { useSchnitt } from '../composables/useSchnitt.js';
import { useMessen } from '../composables/useMessen.js';
import { useAnnotationen } from '../composables/useAnnotationen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useNachspielen } from '../composables/useNachspielen.js';
import { entwertetGeometrie } from '../services/bauform/FormSchreiber.js';
import { cdeAchsenAus, verdeckteAus } from '../services/CdeAchsen.js';
import { useAenderungen, AENDERUNGS_ARTEN } from '../stores/useAenderungen.js';
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
/**
 * Der aufgelöste Bezug je Modell — Welt → Ost/Nord/Höhe.
 *
 * Wird beim Modellwechsel neu bestimmt, nicht bei jedem Zeigen: die Auflösung
 * liest die Georeferenz und prüft die Rohkoordinaten gegen die
 * Systembereiche, und das gehört nicht in einen Mousemove.
 */
const bezuege = shallowRef({});

/**
 * DIE MILLIMETER-WACHE (Audit-Lücke 1, 2026-09-02).
 *
 * Die Einheit wird seit 13.1 gelesen und angezeigt — aber sie WIRKTE
 * nirgends: jede Rechnung nimmt Meter an, und ein mm-Modell (beide
 * BODEN-Dateien im Projekt!) rechnete still tausendfach falsch. Bis die
 * durchgängige Normalisierung gebaut ist, gilt: ein Modell mit
 * Längenfaktor ≠ 1 wird ANGEZEIGT, aber Bearbeitung, Prüfliste und Mengen
 * stehen unter sichtbarem Vorbehalt — laut statt still.
 */
const einheitsWarnung = shallowRef(null);   // { name, praefix, faktor } | null

/**
 * Den Projektbezug aller geladenen Modelle neu bestimmen.
 *
 * Nach jedem Laden und Entladen. Die Auflösung entscheidet unter anderem, ob
 * die MapConversion überhaupt gilt — bei Dateien, deren Geometrie schon
 * Landeskoordinaten trägt, wäre sie eine zweite Verschiebung.
 */
function _bezuegeNeuBestimmen() {
  const geo = engine.value?.leseGeoreferenzen?.() ?? {};
  const versaetze = engine.value?.getAllCoordOffsets?.() ?? {};
  const out = {};
  for (const [modelId, versatz] of Object.entries(versaetze)) {
    out[modelId] = bestimmeBezug({ georeferenz: geo[modelId] ?? null, versatz });
  }
  bezuege.value = out;

  // Millimeter-Wache: der erste Faktor ≠ 1 gewinnt die Warnung.
  einheitsWarnung.value = null;
  for (const g of Object.values(geo)) {
    const e = g?.einheit;
    if (e && Number.isFinite(e.faktor) && Math.abs(e.faktor - 1) > 1e-9) {
      einheitsWarnung.value = { name: e.name, praefix: e.praefix, faktor: e.faktor };
      break;
    }
  }
}

/** Der Zeigerpunkt in Landeskoordinaten — oder null, wenn es keinen Bezug gibt. */
const projektKoords = computed(() => {
  const welt = coords.value?._welt;
  if (!welt) return null;
  const alle = Object.values(bezuege.value);
  const b = (coords.value._modelId && bezuege.value[coords.value._modelId]) || alle[0];
  if (!b || (!b.geometrieIstVerortet && !b.mapAngewandt)) return null;
  const p = b.nachProjekt(welt);
  return {
    ost: p.ost.toFixed(3), nord: p.nord.toFixed(3), hoehe: p.hoehe.toFixed(3),
    crs: b.crs.wirksam,
  };
});

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
const schnitt = useSchnitt({ engine, slot: { belege: bearbeitung.belegeWerkzeug, frei: bearbeitung.gebeWerkzeugFrei } });

// PDF export
const showPalette   = ref(false);
const paletteNurElemente = ref(false);
const showShortcuts = ref(false);

// T1.3: Measurement
// ── Messen (Sprint I, Stufe 5) ──────────────────────────────────────────────
// `selection` wird als GETTER hereingereicht: der SelectionHandler entsteht
// erst in onMounted, ein Wert wäre zur Aufrufzeit noch null.
const messen = useMessen({ engine, ifc, selection: () => _selection, slot: { belege: bearbeitung.belegeWerkzeug, frei: bearbeitung.gebeWerkzeugFrei } });

// ── Issue-Pins (Sprint I, Stufe 5) ──────────────────────────────────────────
// `annotationActive` bleibt als Ref HIER: die CdeView liest ihn über
// `defineExpose`, und Vue entpackt Refs im expose-Proxy. Ein Wert im
// Composable wäre dort nicht nachverfolgbar.
const annotationActive = ref(false);
/** Kurzmeldung des Modus-Knopfs (Sperrgrund) — Gesetz 10, nie stumm. */
const modusMeldung = ref('');

// Das Journal aus Stufe 7 — EIN Bezug, nicht drei Aufrufe. Der Store ist zwar
// ein Singleton, aber drei Aufrufstellen lesen sich wie drei Dinge.
const aenderungen = useAenderungen();

/**
 * HERKUNFT IM RAUM (9.6, U4): Wer erzeugt, muss trennen können, was
 * geliefert war und was von hier stammt. Der Schalter färbt jedes Bauteil
 * mit wirksamer Festlegung (warn-Ton) und jedes selbst gebaute (accent) —
 * abgeleitet aus dem Journalstand, nie gespeichert; die Farben kommen zur
 * Laufzeit aus den Tokens.
 */
const herkunftAn = ref(false);

async function herkunftFaerben() {
  if (!engine.value || !herkunftAn.value) return;
  const stil = getComputedStyle(document.documentElement);
  const warnHex = stil.getPropertyValue('--cde-warn').trim();
  const accentHex = stil.getPropertyValue('--cde-accent').trim();

  const eigene = new Set([...aenderungen.wirksamerStand('erzeugt').keys()]);
  const geaendert = new Set();
  for (const art of Object.keys(AENDERUNGS_ARTEN)) {
    if (art === 'erzeugt') continue;
    for (const [gid, wert] of aenderungen.wirksamerStand(art)) {
      if (wert !== null && wert !== undefined && !eigene.has(gid)) geaendert.add(gid);
    }
  }
  const { karte } = await karteMitEngine(engine.value, new Set([...geaendert, ...eigene]));
  const farben = new Map();
  for (const [gid, ort] of karte) {
    farben.set(`${ort.modelId}|${ort.localId}`, eigene.has(gid) ? accentHex : warnHex);
  }
  await engine.value.resetCategoryColors?.();
  if (farben.size) await engine.value.setPerElementColors(farben);
}

async function herkunftUmschalten() {
  herkunftAn.value = !herkunftAn.value;
  if (herkunftAn.value) await herkunftFaerben();
  else await engine.value?.resetCategoryColors?.();
}

// Nachziehen, wenn sich Journal oder Geometrie rühren; Modus-Aus räumt ab.
watch(() => [aenderungen.anzahl, ifc.geometrieStand], () => {
  if (herkunftAn.value) herkunftFaerben().catch(e => console.warn('cde: herkunft', e?.message ?? e));
});
watch(() => bearbeitung.modusAn, (an) => {
  if (!an && herkunftAn.value) {
    herkunftAn.value = false;
    engine.value?.resetCategoryColors?.();
  }
});
// Stufe 9.2: bringt beim Laden die Festlegungen aufs Modell und meldet, was
// nicht durchging.
const nachspielen = useNachspielen({ engine, aenderungen });

/**
 * Stufe 9.3: der Griff am Bauteil. Braucht `nachspielen` für den eingefrorenen
 * Lieferstand und `bearbeitung` für die Bauform — beide sind oben schon da.
 */
const annotationen = useAnnotationen({
  slot: { belege: bearbeitung.belegeWerkzeug, frei: bearbeitung.gebeWerkzeugFrei },
  engine, ifc, cde,
  selection: () => _selection,
  messen,
  viewpoint: () => erfasseViewpoint(),
  aktiv: annotationActive,
});

// Multi-model list

// Stabile Modell-Identität pro geladenem Modell (B3) + lokale Ablage (B4)

// Coordinate display mode
/**
 * Die drei Bezugssysteme der Koordinatenleiste.
 *
 * `projekt` ist neu und die VORGABE — das ist, was im CAD steht und was Fabio
 * gemeint hat: „real, so wie es auch in einem CAD wäre". Die beiden anderen
 * bleiben, weil man sie braucht, um zu verstehen, WARUM etwas so liegt:
 * `viewer` ist modellzentriert (der Loader schiebt das Modell zum Ursprung,
 * damit Float32 nicht an Landeskoordinaten zerbricht), `ifc` ist die Rohzahl
 * aus der Datei.
 */
const COORD_MODI = Object.freeze({
  projekt: { kurz: 'Projekt', titel: 'Landeskoordinaten (Ost/Nord/Höhe)' },
  viewer:  { kurz: 'Viewer',  titel: 'Three-Welt, modellzentriert' },
  ifc:     { kurz: 'IFC',     titel: 'Rohkoordinaten aus der Datei' },
});
const COORD_REIHE = ['projekt', 'viewer', 'ifc'];
const coordMode = ref('projekt');

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
/** Das Ansicht-Popover (X2): Kamera, Views, Ebenen hinter EINEM Anker. */
const ansichtOffen = ref(false);
const ANSICHT_EINTRAEGE = [
  { id: 'fit',   icon: 'fit',        titel: 'Alles einpassen',        mach: () => engine.value?.zoomToFit() },
  { id: 'top',   icon: 'view-top',   titel: 'Draufsicht',             mach: () => engine.value?.viewTop() },
  { id: 'front', icon: 'view-front', titel: 'Vorderansicht',          mach: () => engine.value?.viewFront() },
  { id: 'side',  icon: 'view-side',  titel: 'Seitenansicht',          mach: () => engine.value?.viewSide() },
  { id: 'reset', icon: 'view-reset', titel: 'Ansicht zurücksetzen',   mach: () => engine.value?.resetView() },
];
function ansichtWaehle(e) {
  e.mach();
  ansichtOffen.value = false;
}

/**
 * DIE LEISTE IST KURATIERT (Teil XII, X2): fünf Anker statt sechzehn
 * Knöpfe. Kamera/Views/Ebenen wohnen im Ansicht-Popover; die Panels
 * (Plan, Planung, Issues) gehören allein der Panel-Leiste in der
 * Kopfzeile; „Blatt" wohnt bei der übrigen Ausgabe im Plan-Panel; der
 * Koordinaten-Umschalter IST jetzt die Koordinatenleiste (das Badge sah
 * schon immer klickbar aus — jetzt stimmt es); Hilfe sitzt in der
 * Kopfzeile. Tasten (M, E, T/R, V, N, ?, 1–3) gelten unverändert.
 */
const toolbarItems = computed(() => [
  { id: 'ansicht', icon: 'fit', label: 'Ansicht', title: 'Kamera · gespeicherte Ansichten · Ebenen',
    active: ansichtOffen.value, action: () => { ansichtOffen.value = !ansichtOffen.value; } },
  { id: 'section', icon: 'section', label: 'Schnitt', title: 'Horizontaler Schnitt', key: 'T/R',
    active: schnitt.aktiv.value, action: () => schnitt.umschalten() },
  { divider: true },
  { id: 'measure', icon: 'measure', label: 'Messen', title: 'Strecke messen', key: 'M',
    active: messen.aktiv.value, action: () => messen.umschalten() },
  { id: 'notiz', icon: 'issues', label: 'Notiz', title: 'Issue-Pin setzen (das Panel sitzt in der Kopfzeile)', key: 'N',
    active: annotationActive.value, action: () => annotationen.umschalten() },
  { divider: true },
  { id: 'bearbeiten', icon: 'edit', label: 'Bearbeiten', key: 'E',
    title: bearbeitung.modusAn
      ? 'Sitzung abschließen (Commit-Dialog)'
      : (bearbeitenSperrgrund() ?? 'Bearbeiten einschalten — beginnt eine Sitzung'),
    active: bearbeitung.modusAn, action: () => bearbeitenUmschalten() },
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
async function _einordnenMitHuelle(result, { weitere = [] } = {}) {
  let angereichert = result;
  try {
    const h = (await engine.value?.huellenVon?.(result.modelId, [result.localId]))?.get(result.localId);
    if (h) {
      // Der Höhenversatz kommt aus DEMSELBEN aufgelösten Bezug wie die
      // Koordinatenleiste. Vorher war es der rohe `offset.y` — dieselbe Zahl,
      // solange keine MapConversion gilt, aber eben eine zweite Rechnung
      // daneben. Und genau das war Fabios Beobachtung: „die Bearbeitung nimmt
      // auch die Sachen vom Viewer." Jetzt gibt es nur noch eine Quelle.
      const bezug = bezuege.value[result.modelId] ?? Object.values(bezuege.value)[0] ?? null;
      const versatz = bezug ? bezug.nachProjekt({ x: 0, y: 0, z: 0 }).hoehe : 0;
      angereichert = { ...result, anker: h.anker, bezugshoehe: h.unterkante,
                       oberkante: h.oberkante, hoehenversatz: versatz };
    }
    // DIE ACHSE, falls es eine gibt. Sie kennt Anfang und Ende GETRENNT —
    // die Hülle kann das nicht, sie ist eine Bounding-Box und weiss nicht,
    // welches Ende oben liegt. Ohne sie ist kein Gefälle bearbeitbar.
    // Gelesen wird nichts nach: die Achsen stehen seit dem Laden bereit.
    const merkmale = engine.value?.merkmaleVon?.(result.modelId, result.localId) ?? null;
    if (merkmale) angereichert = { ...angereichert, merkmale };
    const achse = engine.value?.achseVon?.(result.modelId, result.localId) ?? null;
    if (achse) {
      // Mit der Achse kommt auch der STRANG — die Kette stromab. Sie steht am
      // Bauteil, damit der Katalog rein bleibt: eine Bearbeitung, die den
      // ganzen Strang anfasst, bekommt ihn hereingereicht statt sich die
      // Engine zu holen.
      angereichert = {
        ...angereichert, achse,
        strang: engine.value?.strangVon?.(result.modelId, result.localId) ?? [],
        // Die SCHACHTKNOTEN des Modells (Stufe 16): „An Schacht
        // anschliessen" wählt daraus den nächsten zum Tipp. Am Bauteil,
        // damit der Katalog rein bleibt — dieselbe Regel wie beim Strang.
        schachtKnoten: [...(engine.value?.schachtPunkteVon?.(result.modelId) ?? new Map())]
          .map(([globalId, pk]) => ({ globalId, punkt: { x: pk.x, y: pk.y, z: pk.z }, name: pk.name ?? '' })),
      };
    } else {
      // Kein Lauf, also womöglich ein KNOTEN. Die Anschlüsse gehören ans
      // Bauteil, damit der Katalog rein bleiben kann — dieselbe Regel wie beim
      // Strang.
      const anschluesse = engine.value?.anschluesseVon?.(result.modelId, result.localId) ?? [];
      if (anschluesse.length) angereichert = { ...angereichert, anschluesse };
    }

    // DIE LAGE IN PROJEKTKOORDINATEN — und der Weg zurück.
    //
    // Wer einen Schacht verschiebt, gibt Rechts- und Hochwert an, nicht
    // Three-Welt-Koordinaten. Der Rückweg ist eine schlichte Umkehrung des
    // Ladeversatzes — SOLANGE keine MapConversion gilt. Gälte eine, käme eine
    // Drehung dazu, und die Umkehrung wäre nicht mehr diese Formel. Deshalb
    // steht das Kennzeichen dabei, statt still falsch zu rechnen.
    const bezugFuerLage = bezuege.value[result.modelId] ?? Object.values(bezuege.value)[0] ?? null;
    const versatz = engine.value?.getCoordOffsetForModel?.(result.modelId) ?? null;
    if (bezugFuerLage && versatz && angereichert.anker) {
      angereichert = {
        ...angereichert,
        lage: bezugFuerLage.nachProjekt(angereichert.anker),
        versatz: { x: versatz.x, y: versatz.y, z: versatz.z },
        lageUmkehrbar: !bezugFuerLage.mapAngewandt,
      };
    }
  } catch (fehler) {
    // Ohne Hülle wird eingeordnet wie bisher; die lagebezogenen Bearbeitungen
    // melden dann selbst, dass ihnen der Bezug fehlt.
    console.warn('cde: huelle lesen', fehler?.message ?? fehler);
  }
  return bearbeitung.einordne(angereichert, engine.value?.makeGeometryResolver?.(), { weitere });
}

/**
 * Den Bearbeiten-Modus umschalten.
 *
 * Beim EINSCHALTEN öffnet die Toolbox mit: sie ist das Zuhause des Editors,
 * und ein Modus, dessen Werkzeuge man erst suchen muss, ist keiner.
 */
/**
 * WANN man bearbeiten darf (U2) — der Knopf nennt den Grund, nie stumm.
 * Der Status bekommt hier seine Zähne (Stufe-3-Schuld): ein PUBLISHED- oder
 * archivierter Stand ist schreibgeschützt.
 */
function bearbeitenSperrgrund() {
  if (!ifc.modelList?.length) return 'Erst ein Modell laden.';
  if (einheitsWarnung.value) {
    const e = einheitsWarnung.value;
    return `Modell in ${e.praefix === 'MILLI' ? 'Millimetern' : `${e.name} × ${e.faktor}`} — `
      + 'Bearbeitung gesperrt, bis die Einheiten-Umrechnung gebaut ist.';
  }
  const sha = ablage.geladeneModellSha?.() ?? null;
  const dok = sha ? cde.dokumente.find(d => d.sha256 === sha) : null;
  if (dok && ['Published', 'Archived'].includes(dok.status)) {
    return `„${dok.name}" ist ${dok.status} — schreibgeschützt. Status im Register ändern.`;
  }
  if (nachspielen.laeuft?.value) return 'Festlegungen werden gerade angewandt …';
  return null;
}

function bearbeitenUmschalten() {
  if (!bearbeitung.modusAn) {
    const grund = bearbeitenSperrgrund();
    if (grund) {
      modusMeldung.value = grund;
      setTimeout(() => { if (modusMeldung.value === grund) modusMeldung.value = ''; }, 4000);
      return false;
    }
    // E an = SITZUNG beginnen (U2). Liegt ein Entwurf vom letzten Mal, wird
    // er fortgesetzt — die Leiste zeigt seine Schritte sofort.
    aenderungen.beginneSitzung({ wer: cde.bearbeiter || '' });
    bearbeitung.modusSetzen(true);
    panels.open('toolbox');
    return true;
  }

  // E aus MIT offenen Schritten führt IMMER in den Commit-Dialog — der
  // Modus bleibt an, bis dort entschieden ist (Committen/Verwerfen/Weiter).
  if (aenderungen.sitzungSchritte.length) {
    bearbeitung.commitDialogOffen = true;
    return true;
  }
  aenderungen.schliesseLeereSitzung();
  bearbeitung.modusSetzen(false);
  return false;
}

/**
 * Eine Rahmenauswahl einordnen.
 *
 * Das ERSTE Bauteil bestimmt die Einordnung und damit, was angeboten wird —
 * die Herleitung hängt an einem Bauteil, und daran soll sich nichts ändern,
 * nur weil man fünf angeklickt hat. Die übrigen kommen als Liste dazu; auf sie
 * wirkt, was der Katalog als `mehrfach` kennzeichnet.
 *
 * Die Anreicherung (Hülle, Achse, Lage) läuft nur fürs erste Bauteil: sie
 * kostet je Bauteil einen Lesezugriff, und für eine Massenauswahl von
 * hunderten wäre das eine spürbare Pause für Angaben, die kein
 * Mehrfach-Werkzeug braucht.
 */
async function _mehrfachEinordnen(items) {
  const orte = [];
  for (const [modelId, localIds] of Object.entries(items ?? {})) {
    for (const localId of localIds) orte.push({ modelId, localId });
  }
  if (!orte.length) return;

  const erst = await engine.value?.elementDatenVon?.(orte[0].modelId, orte[0].localId);
  if (!erst) return;
  const weitere = [];
  for (const o of orte.slice(1)) {
    const el = await engine.value?.elementDatenVon?.(o.modelId, o.localId);
    if (el) weitere.push(el);
  }
  ifc.setElement(erst);
  panels.open('toolbox');
  await _einordnenMitHuelle(erst, { weitere });
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
  /**
   * Die Merkmale des gewählten Bauteils neu lesen (Lücke ⑧).
   *
   * Der Merkmals-SCHREIBER läuft nicht mehr hier entlang — er ist eine
   * Journal-Anwendung (`wendeEintragAn` mit art `pset`). Was bleibt, ist das
   * Nachladen der Anzeige, nachdem die Anwendung durch ist.
   */
  refreshElement:       () => engine.value?.refreshElement() ?? null,
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
  /**
   * Wie der Höhenversatz je Modell zustande kam (Stufe 13.3).
   *
   * Sichtbar, weil er zweimal still danebenlag: einmal, weil `getPositions`
   * vor der Tessellierung nichts liefert, einmal, weil der Loader-Wert 0 ist
   * und 0 wie ein gültiges Ergebnis aussieht. Ein Befund, den nur die Konsole
   * kennt, kostet den Nutzer eine Rückfrage.
   */
  getHoehenBefunde:     () => engine.value?.alleHoehenBefunde?.() ?? {},
  /**
   * Der Anker eines Bauteils im GELIEFERTEN Modell (Stufe 12.0c).
   *
   * Jeder `lage`-Eintrag braucht ihn als `basis` — er ist der Bezugspunkt des
   * Drei-Wege-Vergleichs. Das Ziehen holte ihn sich von Anfang an, die beiden
   * Formulare nicht; ihre Einträge gingen deshalb bei einer neuen Revision
   * still als „sauber" durch, statt einen Konflikt zu melden.
   */
  lieferstandVon:       (globalId) => nachspielen.lieferstandVon(globalId),
  getKonflikte:         () => nachspielen.konflikte.value,
  // ── Schacht-Griffe im Lageplan (G1) ──────────────────────────────────────
  getSchachtGriffe:     () => engine.value?.schachtGriffe?.() ?? [],
  getSchachtAnschluesse: (globalId) => engine.value?.schachtAnschluesse?.(globalId) ?? [],
  /**
   * Das SUBJEKT für `schacht-verschieben`, ohne die Auswahl zu ändern.
   *
   * Der Griff im Lageplan zieht einen Schacht, den in 3D niemand angeklickt
   * hat — die Einordnung über `waehleBauteil` würde die Auswahl umwerfen und
   * die Toolbox aufreißen, mitten im Zug. Gebaut wird hier dasselbe Bauteil-
   * Objekt wie in `_einordnenMitHuelle`, aus DENSELBEN Quellen (Hülle,
   * Bezug, Versatz): eine zweite Lage-Rechnung daneben wäre exakt der
   * Auseinanderläufer, den 13.3 beseitigt hat.
   */
  schachtSubjekt: async (globalId) => {
    const ort = engine.value?.schachtOrt?.(globalId);
    if (!ort) return null;
    const h = (await engine.value?.huellenVon?.(ort.modelId, [ort.localId]))?.get(ort.localId);
    const bezug = bezuege.value[ort.modelId] ?? Object.values(bezuege.value)[0] ?? null;
    const versatz = engine.value?.getCoordOffsetForModel?.(ort.modelId) ?? null;
    if (!h?.anker || !bezug || !versatz) return null;
    return {
      globalId, modelId: ort.modelId, localId: ort.localId,
      anker: h.anker,
      lage: bezug.nachProjekt(h.anker),
      versatz: { x: versatz.x, y: versatz.y, z: versatz.z },
      lageUmkehrbar: !bezug.mapAngewandt,
      anschluesse: engine.value?.anschluesseVon?.(ort.modelId, ort.localId) ?? [],
    };
  },
  ansichtAufsBlatt:     () => ansichtAufsBlatt(),
  hilfeUmschalten:      () => { showShortcuts.value = !showShortcuts.value; },
  /** Das ganze Modell prüfen — die Prüfliste (Stufe 14.4). */
  pruefeAlles:          (opts) => engine.value?.pruefeAlles(opts) ?? [],
  /** Länge, Nennweite und Merkmale je Bauteil — für den Mengenauszug. */
  mengenGrundlage:      () => engine.value?.mengenGrundlage() ?? [],
  erdmassen:            (bauplaene) => engine.value?.erdmassen(bauplaene) ?? Promise.resolve([]),
  /**
   * Ein Bauteil ohne Mausklick auswählen — für den Sprung aus der Prüfliste.
   *
   * `zoomToElement` hebt es bereits hervor, aber die EINORDNUNG blieb aus:
   * die Toolbox zeigte weiter das zuletzt angeklickte Bauteil. Aus einer
   * Arbeitsliste wurde damit eine Leseliste — man sprang hin und musste dann
   * doch von Hand klicken.
   */
  waehleBauteil: async (modelId, localId) => {
    if (!engine.value) return false;
    await engine.value.zoomToElement(modelId, localId);
    const el = await engine.value.refreshElement();
    if (!el) return false;
    ifc.setElement(el);
    panels.open('toolbox');
    await _einordnenMitHuelle(el);
    return true;
  },
  /**
   * Den Bearbeiten-Modus umschalten (Stufe 12.0d).
   *
   * Über die Fassade, weil die Toolbox in der CdeView hängt und nicht unter
   * dem Viewer — ein Ereignis quer durch den Baum wäre ein zweiter Weg zu
   * derselben Handlung.
   */
  bearbeitenUmschalten: () => bearbeitenUmschalten(),
  /**
   * Der Höhenversatz Welt→NN, wie ihn auch die Koordinatenleiste benutzt.
   *
   * Damit rechnet das Zeichnen im Lageplan in m NN statt in Three-Welt-Y —
   * dieselbe Größe, dasselbe System. Vorher ging der eingetragene Wert direkt
   * als Welt-Y in die Punkte, und eine auf „305" gezeichnete Linie landete um
   * den ganzen Ladeversatz zu hoch.
   */
  getHoehenversatz:     () => {
    const b = Object.values(bezuege.value)[0] ?? null;
    return b ? b.nachProjekt({ x: 0, y: 0, z: 0 }).hoehe : 0;
  },
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
   * NIMMT EINEN EINTRAG ODER MEHRERE. Ein mehrteiliger Vorgang („Haltung
   * teilen" = löschen + zweimal erzeugen) kommt als Liste herein und wird der
   * Reihe nach angewandt; gemeldet wird das Ergebnis zusammengefasst. Die
   * Alternative wäre gewesen, das an beiden Aufrufern zu wiederholen — und
   * zwei Wege zu derselben Sache sind in dieser Kette schon zweimal
   * auseinandergelaufen.
   *
   * @returns {Promise<{weg, angewandt, nurFestlegung, grund}>}
   */
  wendeEintragAn: async (eintragOderListe) => {
    if (Array.isArray(eintragOderListe)) return wendeVorgangAn(eintragOderListe);
    const r = await wendeEinenAn(eintragOderListe);
    await entwerteNach([eintragOderListe?.art]);
    return r;
  },

  baueErzeugteNeu,
});

/** Einen mehrteiligen Vorgang anwenden — der Reihe nach, einmal zusammengefasst. */
/**
 * Nach ANGEWANDTEN Änderungen neu ableiten, was dadurch veraltet ist —
 * die Verdrahtung des FormSchreibers (Stufe 16; gebaut in 14.4, bis hier
 * von niemandem gerufen). Der Speicher hinter Längsschnitt, Netz, Strang,
 * Prüfliste und Plan-Beschriftung sind die ACHSEN (`engine.leseAchsen`,
 * bislang nur beim Laden gelesen — jede Bearbeitung liess sie veralten:
 * dieselbe Fehlerklasse wie die Prozent-Bemaßung, ein richtiger Wert an
 * einer alten Stelle). Der Lageplan hängt am `geometrieStand`-Zähler.
 */
async function entwerteNach(arten) {
  if (!entwertetGeometrie(arten)) return;
  try {
    const n = await engine.value?.leseAchsen()?.catch?.(() => 0) ?? 0;
    // Der JOURNALSTAND gleich mit (17.3): selbst erzeugte Rohre und Schächte
    // kommen ins Fachmodell, Verdecktes fliegt heraus. Die Engine liest kein
    // Journal — sie bekommt den Stand als Daten; gerechnet wird er rein aus
    // den Bauplan-Parametern (CdeAchsen.js).
    const { kanten, knoten } = cdeAchsenAus(aenderungen.wirksamerStand('erzeugt'));
    engine.value?.setzeJournalStand?.({
      kanten, knoten,
      verdeckt: verdeckteAus(aenderungen.wirksamerStand('geloescht')),
    });
    ansicht.setzeStand({ hatAchsen: (n + kanten.length) > 0 });
    ifc.bumpGeometrieStand();
  } catch (fehler) {
    // Die ANWENDUNG war zu diesem Zeitpunkt erfolgreich — ein Fehler beim
    // Nachziehen darf sie nicht rückwirkend wie einen toten Knopf aussehen
    // lassen (Gesetz 10; genau so gemeldet am 2026-09-02).
    console.error('cde: entwerteNach', fehler);
  }
}

async function wendeVorgangAn(eintraege) {
  let angewandt = true;
  let nurFestlegung = false;
  let grund = null;
  let neuaufbauGelaufen = false;
  for (const e of eintraege) {
    // Der Neuaufbau ist TOTAL — er baut den ganzen Stand. Ihn je
    // `erzeugt`-Eintrag zu wiederholen wäre dreimal dieselbe Arbeit.
    if (anwendungsweg(e) === 'neuaufbau') {
      if (neuaufbauGelaufen) continue;
      neuaufbauGelaufen = true;
    }
    const r = await wendeEinenAn(e);
    angewandt = angewandt && r.angewandt;
    nurFestlegung = nurFestlegung || r.nurFestlegung;
    grund = grund ?? r.grund;
  }
  await entwerteNach(eintraege.map(e => e?.art));
  return { weg: 'vorgang', angewandt, nurFestlegung, grund };
}

async function wendeEinenAn(eintrag) {
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
}

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
    _einordnenMitHuelle(result)
      .catch(e => console.warn('cde: einordnen', e?.message ?? e));
  });
  _selection.onClickEmpty(() => {
    ifc.clearElement();
    bearbeitung.einordne(null, null);
  });
  _selection.onHover(pos => {
    coords.value = pos
      ? {
          x: pos.x.toFixed(3), y: pos.y.toFixed(3), z: pos.z.toFixed(3),
          ox: pos.ox.toFixed(3), oy: pos.oy.toFixed(3), oz: pos.oz.toFixed(3),
          // Die ROHEN Zahlen mit — der Projektbezug rechnet damit weiter, und
          // aus einem `toFixed`-String zurückzuparsen wäre der Anfang eines
          // zweiten Wahrheitsstrangs.
          _welt: { x: pos.x, y: pos.y, z: pos.z },
          _modelId: pos.modelId ?? null,
        }
      : null;
  });
  _selection.onMarqueeSelect(({ items, count }) => {
    if (!count) return;
    // DER RAHMEN ERREICHT JETZT DIE BEARBEITUNG (Stufe 14.10).
    //
    // Er wählte seit jeher mehrere Bauteile aus und hob sie hervor — gesagt
    // hat er es nur der Konsole. Damit war Mehrfachbearbeitung nicht etwa
    // schwierig, sondern schlicht nicht verdrahtet.
    _mehrfachEinordnen(items).catch(e => console.warn('cde: mehrfach', e?.message ?? e));
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
      // Der Modus zuerst: die Palette darf nichts anbieten, was `starte`
      // ohnehin abweist. Ein Befehl, der nur eine Absage erzeugt, ist ein
      // toter Knopf mit Suchfunktion.
      verfuegbar: () => bearbeitung.modusAn && bearbeitung.moeglich.some(m => m.id === b.id),
      run: () => bearbeitung.starte(b.id),
    })),
    { id: 'bearb.modus', titel: 'Bearbeiten ein-/ausschalten', icon: 'edit',
      gruppe: 'Bearbeiten', key: 'E', run: () => bearbeitenUmschalten() },
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
  // Projektbezug ZUERST: er entscheidet, was jede Koordinatenanzeige und jede
  // Höhenbearbeitung danach zeigt. Einmal je Laden, nicht je Mausbewegung.
  _bezuegeNeuBestimmen();

  // Rahmen-Nachführung (Lücke ⑤): der Welt-Rahmen ist der Ladeversatz des
  // ERSTEN Modells (COORDINATE_TO_ORIGIN). Das Journal muss ihn kennen,
  // BEVOR das Nachspielen unten liest — eine neue Revision kann ein anderes
  // Bounding-Box-Minimum haben, und dann werden alle gespeicherten Punkte
  // synchron um das Delta gehoben (useAenderungen/JournalVersatz).
  {
    const erstes = engine.value?.getModelList()?.[0];
    const rahmen = erstes ? engine.value?.getCoordOffsetForModel?.(erstes.modelId) : null;
    if (rahmen) aenderungen.setzeWeltversatz({ x: rahmen.x, y: rahmen.y, z: rahmen.z });
  }

  // Die Achsen einmal zählen — davon hängt ab, ob der Längsschnitt bedienbar
  // ist. `hatAchsen` wurde bis Stufe 14.1 NIRGENDS gesetzt, der Modus war
  // damit dauerhaft gesperrt, obwohl die Fachrechnung dafür fertig dasteht.
  // Gesetzt wird hier, weil hier gezählt wird — ein Beobachter anderswo
  // liefe der Zählung davon. Fehler halten das Laden nicht auf: eine Datei
  // ohne Leitungen ist kein Fehlerfall, sie hat eben keine Achsen.
  const achsen = await engine.value.leseAchsen().catch(() => 0);
  ansicht.setzeStand({ hatAchsen: achsen > 0 });

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
    nachspielen.nachModellladung(firstModel.modelId).then(async ({ konflikte }) => {
      if (konflikte) console.info('[CDE]', nachspielen.meldung.value);
      // Die Achsen wurden oben VOR dem Nachspielen gezählt — trug das
      // Journal Geometrieänderungen, sind sie damit schon veraltet.
      await entwerteNach(['lage', 'erzeugt']);
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
  if (e.key === 'e' || e.key === 'E') { e.preventDefault(); bearbeitenUmschalten(); return; }
  // Ohne Modus sagt `umschalten` selbst, warum nichts passiert — die Anzeige

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

/* Bearbeiten-Modus: Rahmen und Marke. Beide über allem, beide klickdurchlässig
   bis auf den Beenden-Knopf — ein Modus-Hinweis darf nie im Weg stehen. */
.bearb-rahmen {
  position: absolute; inset: 0; pointer-events: none; z-index: 6;
  border: 2px solid var(--cde-accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cde-accent) 35%, transparent);
}
.bearb-marke {
  position: absolute; top: 0.5rem; left: 50%; transform: translateX(-50%);
  z-index: 7; display: flex; align-items: center; gap: 0.35rem;
  padding: 0.2rem 0.35rem 0.2rem 0.5rem; border-radius: var(--cde-radius-sm);
  background: var(--cde-accent); color: var(--cde-text-invert);
  font-size: var(--cde-font-xs); font-weight: 600; letter-spacing: 0.02em;
}
.bearb-marke-aus {
  display: flex; align-items: center; padding: 0.1rem; cursor: pointer;
  border: 0; border-radius: 3px; background: transparent; color: inherit;
}
.bearb-marke-aus:hover { background: var(--cde-scrim); }
.bearb-zahl {
  opacity: 0.85; font-weight: 500; cursor: pointer;
  background: transparent; border: 0; color: inherit; font: inherit;
  text-decoration: underline dotted; text-underline-offset: 2px;
  touch-action: manipulation;
}
.bearb-zahl:hover { opacity: 1; }
.bearb-abschluss {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.1rem 0.45rem; cursor: pointer;
  border: 1px solid var(--cde-scrim); border-radius: 999px;
  background: var(--cde-scrim); color: inherit;
  font-size: var(--cde-font-xs); font-weight: 600;
  touch-action: manipulation;
}
.bearb-abschluss:hover { filter: brightness(1.15); }
.bearb-abschluss.gedimmt { opacity: 0.6; }
.bearb-sperre {
  position: absolute; top: 2.6rem; left: 50%; transform: translateX(-50%);
  z-index: 8; display: flex; align-items: center; gap: 0.4rem;
  max-width: min(90%, 34rem);
  padding: 0.35rem 0.65rem;
  background: var(--cde-float);
  border: 1px solid color-mix(in srgb, var(--cde-warn) 45%, transparent);
  border-left: 3px solid var(--cde-warn);
  border-radius: var(--cde-radius);
  color: var(--cde-text); font-size: var(--cde-font-sm);
}

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
.einheit-banner {
  position: absolute; top: 3.4rem; left: 50%; transform: translateX(-50%);
  z-index: 25; display: flex; align-items: center; gap: 0.5rem;
  max-width: min(92%, 44rem);
  padding: 0.45rem 0.8rem;
  background: var(--cde-float);
  border: 1px solid var(--cde-warn);
  border-left: 4px solid var(--cde-warn);
  border-radius: var(--cde-radius);
  color: var(--cde-text); font-size: var(--cde-font-sm);
  box-shadow: var(--cde-shadow);
}

.ansicht-popover {
  position: absolute; bottom: 1rem; left: 4.6rem; z-index: 21;
  display: flex; flex-direction: column; gap: 0.15rem;
  background: var(--cde-float); padding: 0.35rem;
  border: 1px solid var(--cde-tint); border-radius: 10px;
  box-shadow: var(--cde-shadow-float);
}
.ap-eintrag {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.6rem; cursor: pointer; text-align: left;
  background: transparent; border: 0; border-radius: 7px;
  color: var(--cde-text); font-size: var(--cde-font-sm);
  touch-action: manipulation;
}
.ap-eintrag:hover { background: var(--cde-tint); }
.ap-eintrag.aktiv { color: var(--cde-accent); }
.ap-trenner { height: 1px; background: var(--cde-tint-max); margin: 0.2rem 0.3rem; }

.coord-mode-badge {
  cursor: pointer; border: 0; font: inherit;
  touch-action: manipulation;
}
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
/* T3: Wenn die Modus-Leiste unten mittig steht, staffelt der Knopf nach oben —
   dieselbe Stelle für zwei Dinge wäre auf dem Finger ein Lotteriespiel. */
.show-all-btn.hochgerueckt { bottom: 5.4rem; }

/* T3: Die Modus-Leiste — unten mittig, wie die Statuszeile in flood-3D. */
.modus-leiste {
  position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%);
  z-index: 21; display: flex; align-items: center; gap: 0.5rem;
  padding: 0.35rem 0.4rem 0.35rem 0.7rem;
  background: var(--cde-surface-raised);
  border: 1px solid var(--cde-accent-line);
  border-radius: 999px;
  color: var(--cde-text);
  font-size: var(--cde-font-sm);
  box-shadow: var(--cde-shadow);
  white-space: nowrap;
}
.modus-fertig {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.6rem; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--cde-success-strong) 50%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--cde-success-strong) 18%, transparent);
  color: var(--cde-success);
  font-size: var(--cde-font-xs); font-weight: 600;
  touch-action: manipulation;
}
.modus-fertig:hover { background: color-mix(in srgb, var(--cde-success-strong) 28%, transparent); }

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


/* ── T1: Fingerziele (Tablet-Pass) ──────────────────────────────────────────
   Der 3D-Canvas gehört der Kamera: ohne `touch-action: none` wischt der
   Finger die SEITE statt der Szene — camera-controls verhindert das nicht
   selbst. Kleine Knöpfe: schwebende Leisten wachsen auf groben Zeigern
   WIRKLICH (sie verschieben nichts), einzelne Zeichen-Knöpfe bekommen die
   unsichtbare Trefferfläche (Muster flood-3D f3d-theme.css — Pseudo-Element
   statt Layoutänderung). `.measure-clear` ist selbst absolut positioniert
   und trägt damit schon einen Bezug fürs Pseudo-Element — ihm `position:
   relative` zu geben, risse es aus seiner Verankerung. */
.canvas-root { touch-action: none; }
.tool-btn, .snap-btn, .mode-btn, .section-close, .sel-action-btn,
.show-all-btn, .measure-clear, .bearb-marke-aus { touch-action: manipulation; }
@media (pointer: coarse) {
  .snap-btn, .mode-btn { padding: 0.55rem 0.75rem; }
  .modus-fertig { padding: 0.5rem 0.8rem; }
  .section-close, .bearb-marke-aus { position: relative; }
  .bearb-marke-aus::after { content: ''; position: absolute; inset: -10px; }
  .section-close::after, .measure-clear::after {
    content: ''; position: absolute; inset: -9px;
  }
}
</style>
