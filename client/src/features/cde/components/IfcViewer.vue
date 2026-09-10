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
        <!-- Der Cursor kommt als KLASSE vom einen Besitzer (useZeiger, Teil XVI);
             die Engine setzt keinen Inline-Style mehr. -->
        <div class="canvas-root" :class="zeiger.klasse.value" ref="canvasRef"></div>

        <!-- Toolbar: Datei laden -->
        <div class="top-bar">
          <div class="top-bar-left">
            <!-- Während einer Ladung sichtbar gesperrt: die Ablage nimmt
                 nur EINEN Vorgang zugleich, und ein Klick, der nichts tut,
                 ist schlimmer als ein Knopf, der grau ist (Gesetz 10). -->
            <label
              class="action-btn primary"
              :class="{ laedt: ablage.loading.value }"
              :title="ablage.loading.value ? 'Es wird gerade ein Modell geladen' : 'IFC-Datei öffnen'"
            >
              <input type="file" accept=".ifc" :disabled="ablage.loading.value" @change="ablage.onFileUpload" class="sr-only" />
              <CdeIcon name="documents" :size="13" /> IFC laden
            </label>

            <label
              v-if="ifc.modelList.length"
              class="action-btn secondary"
              :class="{ laedt: ablage.loading.value }"
              :title="ablage.loading.value ? 'Es wird gerade ein Modell geladen' : 'Weiteres IFC dazuladen'"
            >
              <input type="file" accept=".ifc" :disabled="ablage.loading.value" @change="ablage.onFileUploadAdd" class="sr-only" />
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

        <!-- Farbkatalog: was der Planer selbst gefärbt hat, bleibt stehen —
             und die Frage steht hier, statt dass still übermalt wird. -->
        <Transition name="fade">
          <div v-if="erdbauEigene.length" class="nachspiel-hinweis">
            <CdeIcon name="style" :size="14" />
            <span>
              {{ erdbauEigene.length }}
              {{ erdbauEigene.length === 1 ? 'Bauteil bringt' : 'Bauteile bringen' }}
              eine eigene Farbe mit — nicht eingefärbt.
            </span>
            <button class="erdbau-uebermalen" @click="erdbauFarbenUeberschreiben()">
              Mit Erdbau-Farben überschreiben
            </button>
            <button
              class="ablage-hinweis-zu"
              @click="erdbauEigene = []"
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
          <!-- Das Eigenbau-Modell ist KEIN Dokument (Stufe 0, D6): es wird aus
               dem Journal gebaut. Es heisst deshalb „Eigenbau", steht
               gestrichelt da und hat keinen Entladen-Knopf — leer wird es
               über Zurück im Journal, nicht über ein X. -->
          <span v-for="m in ifc.modelList" :key="m.modelId" class="model-tag"
                :class="{ 'model-tag--eigenbau': modellHerkunft(m.modelId) === 'cde' }"
                :title="modellHerkunft(m.modelId) === 'cde' ? 'Aus dem Journal gebaut — leeren über Zurück' : m.name">
            <!-- Der Name in EIGENEM Element: als anonymes Flex-Kind schrumpfte
                 er nicht (`min-width: auto`), schob das X aus dem 200-px-Chip
                 und wurde von `overflow: hidden` mitsamt Knopf abgeschnitten.
                 Das Entladen sah dadurch aus, als gäbe es keins. -->
            <span class="model-tag-name">{{ modellTagText(m, eigenbauAnzahl) }}</span>
            <button v-if="modellHerkunft(m.modelId) !== 'cde'" class="tag-close" @click="removeModel(m.modelId)"
                    :title="`${m.name} entladen`" aria-label="Modell entladen">
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
             Prüfliste und Mengen stimmen in dieser Einheit nicht.
             Seit 2026-09-03 ist es kein Sackgassen-Hinweis mehr, sondern ein
             ANGEBOT: der Knopf lädt dasselbe Modell in Metern neu. Die Datei
             des Planers bleibt unverändert — umgerechnet wird eine Kopie im
             Speicher. -->
        <div v-if="einheitsWarnung" class="einheit-banner">
          <CdeIcon name="warn" :size="14" />
          <span>
            Dieses Modell ist in
            <strong>{{ einheitsWarnung.praefix === 'MILLI' ? 'Millimetern' : `${einheitsWarnung.name} × ${einheitsWarnung.faktor}` }}</strong>
            geschrieben. Ansehen und Messen in Modelleinheiten gehen; Bearbeitung,
            Prüfliste und Mengen sind bis zur Umrechnung nicht belastbar.
          </span>
          <button v-if="einheitsWarnung.modelId" class="einheit-knopf"
                  :disabled="ablage.loading.value"
                  title="Lädt dasselbe Modell in Metern neu. Die abgelegte Datei bleibt unverändert."
                  @click="rechneInMeter()">
            <CdeIcon name="refresh" :size="12" /> In Meter umrechnen
          </button>
        </div>
        <!-- Was die Umrechnung getan hat — mit Zahlen, nicht mit „erledigt". -->
        <div v-if="einheitsMeldung" class="einheit-banner" :class="{ ok: einheitsMeldung.ok }">
          <CdeIcon :name="einheitsMeldung.ok ? 'check' : 'warn'" :size="14" />
          <span>{{ einheitsMeldung.text }}</span>
        </div>
        <!-- DIE LESART (2026-09-07): dieses Modell wird nach deiner Festlegung
             in Metern gelesen — sichtbar und rücknehmbar, sonst wäre die
             gespeicherte Entscheidung eine stille. -->
        <div v-else-if="meterLesart" class="einheit-banner ok einheit-lesart">
          <CdeIcon name="check" :size="14" />
          <span>In Metern gelesen — deine Festlegung{{ meterLesart.weg === 'ablage' ? ', aus der Ablage' : '' }}.</span>
          <button class="einheit-knopf" :disabled="ablage.loading.value"
                  title="Festlegung zurücknehmen und das Modell wieder in Modelleinheiten laden"
                  @click="lesartZuruecknehmen()">
            <CdeIcon name="undo" :size="12" /> Zurücknehmen
          </button>
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
          :zeigerMarke="zeigerMarke"
          @delete-measurement="messen.entferne"
          @zoom="onZoomSelected"
          @hide="onHideSelected"
          @isolate="onIsolateSelected"
          @properties="emit('open-properties')"
          @new-issue="issueAmBauteil"
          @waehle-verbund="waehleVerbund"
        />

        <!-- Show-all button — visible whenever any category is currently hidden -->
        <Transition name="sidebar-slide">
          <button
            v-if="anyHidden"
            class="show-all-btn"
            :class="{ hochgerueckt: messen.aktiv.value || annotationActive || !!bearbeitung.scharf }"
            title="Alle wieder einblenden"
            @click="onShowAll"
          >
            <CdeIcon name="visible" :size="14" /> Alle zeigen
          </button>
        </Transition>

        <!-- Die KONTEXTLEISTE (Teil XVI, S2) ersetzt die Modus-Leiste aus T3:
             Tipp-Werkzeuge zeigen ihren Hinweis und den sichtbaren Ausgang
             (Fertig), eine scharfe Bearbeitung ihr Formular, die Chips der
             Vorschau und Übernehmen/Abbrechen — unten in der Mitte, EIN Ort für „was tue ich
             gerade". Auf dem Tablet gibt es weder Hover noch Esc. -->
        <Transition name="fade">
          <CdeKontextleiste
            v-if="messen.aktiv.value || annotationActive || bearbeitung.scharf || rueckmeldung"
            :tipp="tippWerkzeug"
            :chips="vorschau.stand.value?.chips ?? []"
            :rueckmeldung="rueckmeldung"
            :motor="eingabe"
            @fertig="messen.aktiv.value ? messen.beenden() : annotationen.umschalten()"
            @uebernehmen="uebernehmen"
            @geste="(feld) => eingabe.starteGeste(feld)"
            @geste-ab="eingabe.brichGesteAb()"
            @nochmal="nochmalStarten"
            @rueckmeldung-zu="rueckmeldung = null"
          />
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
import { useZeiger } from '../composables/useZeiger.js';
import { useVorschau } from '../composables/useVorschau.js';
import { useEingabe } from '../composables/useEingabe.js';
import { useGriffe } from '../composables/useGriffe.js';
import { modellHerkunft, modellTagText } from '../services/IfcAutor.js';
import { erdbauStandVon } from '../services/Bauteilrezepte.js';
import CdeKontextleiste from './CdeKontextleiste.vue';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { useNachspielen } from '../composables/useNachspielen.js';
import { entwertetGeometrie } from '../services/bauform/FormSchreiber.js';
import { cdeAchsenAus, verdeckteAus } from '../services/CdeAchsen.js';
import { baueEigenbauPaket } from '../services/EigenbauPaket.js';
import { quellenVon } from '../services/ableitung/Bezuege.js';
import { GELAENDE_VORBELEGUNG, kandidatKategorien } from '../services/GelaendeQuelle.js';
import { deklarierteBauform } from '../services/bauform/Bauformen.js';
import { bauformAusRegel } from '../services/bauform/Bauformregeln.js';
import { profilFuer } from '../services/bauform/Typprofile.js';
import { pruefmassVon, zellweiteVorschlag } from '../services/geometrie/ops/Raster.js';
import { grundrissAusMesh } from '../services/geometrie/ops/Umriss.js';
import { useAenderungen, AENDERUNGS_ARTEN } from '../stores/useAenderungen.js';
import { BEARBEITUNGEN, GRUPPEN } from '../services/Bearbeitungen.js';
import { repo } from '../services/RepoFacade.js';
import { ladeVorlagen } from '../services/Bibliothek.js';

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
const einheitsWarnung = shallowRef(null);   // { name, praefix, faktor, modelId } | null
/** Ergebnis der letzten Umrechnung — verschwindet beim nächsten Modellwechsel. */
const einheitsMeldung = shallowRef(null);
/** Gilt für das erste Modell die Lesart „in Metern"? {modelId, sha, weg} | null */
const meterLesart = shallowRef(null);

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

  // Die LESART-Zeile: das erste Modell, das nach Festlegung in Metern gelesen
  // wird. Der Bericht sagt, ob gerechnet (worker/inline) oder aus der Ablage
  // gelesen wurde.
  meterLesart.value = null;
  for (const m of engine.value?.getModelList?.() ?? []) {
    const b = engine.value?.einheitsUmrechnung?.(m.modelId);
    if (b?.ok) { meterLesart.value = { modelId: m.modelId, weg: b.weg ?? null }; break; }
  }

  // Millimeter-Wache: der erste Faktor ≠ 1 gewinnt die Warnung. Die modelId
  // muss MIT — ohne sie wüsste der Umrechnen-Knopf nicht, welches Modell er
  // neu laden soll.
  einheitsWarnung.value = null;
  for (const [modelId, g] of Object.entries(geo)) {
    const e = g?.einheit;
    if (e && Number.isFinite(e.faktor) && Math.abs(e.faktor - 1) > 1e-9) {
      einheitsWarnung.value = { name: e.name, praefix: e.praefix, faktor: e.faktor, modelId };
      break;
    }
  }
}

/**
 * Das Modell in Metern neu laden.
 *
 * Meldet MIT ZAHLEN, was geschehen ist: „umgerechnet" allein wäre wieder nur
 * eine Behauptung, und bei einer Einheitenumrechnung ist genau die Frage
 * „hat es wirklich alles erwischt?" die einzige, die zählt. Die Gegenprobe
 * steckt im Dienst; hier wird sie sichtbar gemacht.
 */
async function rechneInMeter() {
  const modelId = einheitsWarnung.value?.modelId;
  if (!modelId) return;
  einheitsMeldung.value = null;
  const r = await ablage.ladeInMeterNeu(modelId);
  if (!r?.ok) {
    einheitsMeldung.value = { ok: false, text: `Nicht umgerechnet: ${r?.grund ?? 'unbekannter Grund'}` };
    return;
  }
  // Nach dem Neuladen trägt die neue modelId den Bericht.
  const neueId = engine.value?.getModelList?.()?.slice(-1)?.[0]?.modelId
    ?? ifc.modelList?.[ifc.modelList.length - 1]?.modelId ?? null;
  const b = neueId ? engine.value?.einheitsUmrechnung?.(neueId) : null;
  einheitsMeldung.value = b?.ok
    ? { ok: true, text: `In Meter umgerechnet: ${b.masse?.toLocaleString('de-DE') ?? '?'} Längenwerte in `
        + `${b.zeilen?.toLocaleString('de-DE') ?? '?'} Zeilen, Hülle geprüft `
        + `(${(b.vorher?.[0] ?? 0).toFixed(0)} → ${(b.nachher?.[0] ?? 0).toFixed(2)} m)`
        + `${b.weg === 'inline' ? ' — im Hauptthread gerechnet, der Worker war nicht verfügbar' : ''}.` }
    : { ok: false, text: `Nicht umgerechnet: ${b?.grund ?? 'kein Bericht'}` };
}

/** Die Lesart zurücknehmen — das Modell kommt in Modelleinheiten zurück, samt Banner. */
async function lesartZuruecknehmen() {
  const modelId = meterLesart.value?.modelId;
  const sha = modelId ? ablage.identitaet(modelId)?.sha256 : null;
  if (!sha) return;
  einheitsMeldung.value = null;
  const r = await ablage.lesartZuruecknehmen(sha);
  if (!r?.ok) einheitsMeldung.value = { ok: false, text: `Nicht zurückgenommen: ${r?.grund ?? 'unbekannter Grund'}` };
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
// Den Auswahl-Modus leitet der Viewer aus ALLEN Werkzeug-Zuständen ab
// (`auswahlModusNachziehen`) — Messen setzt ihn nicht mehr selbst.
const messen = useMessen({ engine, ifc, slot: { belege: bearbeitung.belegeWerkzeug, frei: bearbeitung.gebeWerkzeugFrei } });

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
// Wieviel steht im Eigenbau-Modell — fuer den Chip in der Leiste (D6).
const eigenbauAnzahl = computed(() => aenderungen.wirksamerStand('erzeugt').size);

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
  viewpoint: () => erfasseViewpoint(),
  aktiv: annotationActive,
});

// ── Der Zeiger (Teil XVI, S1): Cursor-Klasse, Zielmarke, Pille — ein Besitzer ──
const zeiger = useZeiger({ engine, bearbeitung, messenAktiv: messen.aktiv, notizAktiv: annotationActive });

/** Koordinatentext eines Weltpunkts — Landeskoordinaten, wenn es einen Bezug gibt. */
function koordText(punkt, modelId) {
  if (!punkt) return '';
  const alle = Object.values(bezuege.value);
  const b = (modelId && bezuege.value[modelId]) || alle[0];
  if (b && (b.geometrieIstVerortet || b.mapAngewandt)) {
    const p = b.nachProjekt(punkt);
    return `E ${p.ost.toFixed(2)} · N ${p.nord.toFixed(2)} · H ${p.hoehe.toFixed(2)}`;
  }
  return `X ${punkt.x.toFixed(2)} · Y ${punkt.y.toFixed(2)} · Z ${punkt.z.toFixed(2)}`;
}

/** Die Pille am Zeiger fürs HUD — beim Griff-Zug dessen Δ, sonst der Ort unter dem Zeiger. */
const zeigerMarke = computed(() => {
  const g = griffe.pille.value;
  if (g) return { x: g.x, y: g.y, fang: null, text: g.text };
  const m = zeiger.marke.value;
  if (!m) return null;
  return { x: m.x, y: m.y, fang: m.fang, text: koordText(m.punkt, m.modelId) };
});

/**
 * DER AUSWAHL-MODUS, abgeleitet aus allen Werkzeug-Zuständen — eine Stelle.
 *   Messen/Notiz laufen → 'werkzeug' (Tipp geht an sie, kein Pick)
 *   Bearbeitung scharf  → 'gesperrt' (ein Klick wechselt das Subjekt nicht;
 *                          Ecken/Kantenfang beim Schweben)
 *   sonst               → 'single'
 */
function auswahlModusNachziehen() {
  if (!_selection) return;
  if (messen.aktiv.value || annotationActive.value) _selection.setMode('werkzeug');
  else if (bearbeitung.scharfId) _selection.setMode('gesperrt', { fang: true });
  else _selection.setMode('single');
}
watch(() => [messen.aktiv.value, annotationActive.value, bearbeitung.scharfId], auswahlModusNachziehen);

// ── Die Vorschau am Objekt (Teil XVI, S2) ───────────────────────────────────
// Sie beobachtet den Store und zeichnet über die Engine; der Viewer reicht
// nur Höhe und Versatz herein.
const vorschau = useVorschau({
  engine, bearbeitung,
  getHoeheAn: (x, z) => engine.value?.hoeheAn?.(x, z),
  getHoehenversatz: () => bearbeitung.bauteil?.hoehenversatz ?? _hoehenversatzAusBezug(),
});
function _hoehenversatzAusBezug() {
  const b = Object.values(bezuege.value)[0] ?? null;
  return b ? b.nachProjekt({ x: 0, y: 0, z: 0 }).hoehe : 0;
}

// ── Der Eingabe-Motor im RAUM (Teil XVI, S3) ────────────────────────────────
// Dieselbe Maschine wie im Lageplan (`useZeichnen` ist ihre Hülle), derselbe
// Zug im Store: Punkt 1 im Plan, Punkt 2 im Raum, ein Bauteil. Hier kommt
// der Weltpunkt aus dem Raycast auf das Subjekt statt aus der Blattlage.
let _letztesWerkzeugId = null;
watch(() => bearbeitung.scharfId, (id) => { if (id) _letztesWerkzeugId = id; });
const eingabe = useEingabe({
  bearbeitung, cde,
  getModellSha: () => ablage.geladeneModellSha?.() ?? null,
  nachBauen: async (eintraege) => {
    const r = await wendeEintragAn(eintraege);
    _melderueck(r?.angewandt ? 'Übernommen.' : r?.nurFestlegung ? 'Als Festlegung geführt.' : 'Eingetragen.', _letztesWerkzeugId);
    return r;
  },
  getHoehenversatz: () => _hoehenversatzAusBezug(),
  getHoeheAn: (x, z) => engine.value?.hoeheAn?.(x, z),
  bereiteHoehenVor: () => engine.value?.gelaendeSampler?.() ?? Promise.resolve(null),
});

/**
 * Ein Tipp im Raum, solange der Motor läuft: der Treffer auf dem Subjekt wird
 * zum Zug-Punkt oder füllt ein Feld per Geste. Gefangen wird über die
 * Bibliothek (Ecken/Kanten); den Fang auf Schächte macht der Motor selbst.
 * @returns {Promise<boolean>} verbraucht?
 */
async function tippFuerMotor(tipp) {
  if (!eingabe.aktiv.value && !eingabe.geste.value) return false;
  const t = await engine.value?.probeTreffer?.(tipp.x, tipp.y, { fang: true });
  let globalId = null;
  if (t && eingabe.geste.value?.art === 'auswahl') {
    globalId = (await engine.value?.elementDatenVon?.(t.modelId, t.localId))?.globalId ?? null;
  }
  const verbraucht = eingabe.aufTreffer(t ? { ...t, point: t.fang?.punkt ?? t.point, globalId } : null);
  if (eingabe.grund.value) melde(eingabe.grund.value);
  return verbraucht;
}

/** Das Subjekt eines gelieferten Schachts, ohne die Auswahl zu ändern (G1) — für Plan- UND Raum-Griff. */
async function schachtSubjekt(globalId) {
  const ort = engine.value?.schachtOrt?.(globalId);
  if (!ort) return null;
  const h = (await engine.value?.huellenVon?.(ort.modelId, [ort.localId]))?.get(ort.localId);
  const bezug = bezuege.value[ort.modelId] ?? Object.values(bezuege.value)[0] ?? null;
  const versatz = engine.value?.getCoordOffsetForModel?.(ort.modelId) ?? null;
  if (!h?.anker || !bezug || !versatz) return null;
  // Auch hier den LIEFERSTAND einfrieren (Teil XVII): der Plan-Griff zieht
  // Schächte, die nie angeklickt wurden — ohne den Anker hätte der Eintrag
  // keine `basis` und das Fachmodell kein Δ. Der erste Wert gewinnt.
  nachspielen.merkeLieferstand?.(globalId, { x: h.anker.x, y: h.anker.y, z: h.anker.z });
  return {
    globalId, modelId: ort.modelId, localId: ort.localId,
    anker: h.anker,
    lage: bezug.nachProjekt(h.anker),
    versatz: { x: versatz.x, y: versatz.y, z: versatz.z },
    lageUmkehrbar: !bezug.mapAngewandt,
    anschluesse: engine.value?.anschluesseVon?.(ort.modelId, ort.localId) ?? [],
  };
}

// ── Griffe im Raum (Teil XVI, S4) ───────────────────────────────────────────
// Werkzeug-gebunden: jeder Griff bedient einen Katalogeintrag und legt über
// DENSELBEN Weg ab wie der Lageplan-Griff. Die Fachlogik (welcher Griff wo,
// welche Ebene, welcher Wert) liegt in `Griffe.js` — einmal für Plan und Raum.
const griffe = useGriffe({
  engine, bearbeitung, aenderungen,
  getSubjekt: () => bearbeitung.bauteil,
  getTypprofil: () => bearbeitung.typprofil,
  getBauform: () => bearbeitung.einordnung?.bauform ?? null,
  getVersatz: (modelId) => engine.value?.getCoordOffsetForModel?.(modelId) ?? null,
  getHoehenversatz: () => _hoehenversatzAusBezug(),
  getHoeheAn: (x, z) => engine.value?.hoeheAn?.(x, z),
  holeSchachtSubjekt: (gid) => schachtSubjekt(gid),
  holeSchachtAnschluesse: (gid) => engine.value?.schachtAnschluesse?.(gid) ?? [],
  lieferstandVon: (gid) => nachspielen.lieferstandVon(gid),
  nachBauen: (eintraege) => wendeEintragAn(eintraege),
  getModellSha: () => ablage.geladeneModellSha?.() ?? null,
  getWer: () => cde.bearbeiter || '',
  melde,
});
// Nach jeder Anwendung und jedem Neuaufbau stehen die Griffe neu (Journalstand, Geometrie).
watch(() => ifc.geometrieStand, () => griffe.neuBauen());

/** Übernehmen aus der Kontextleiste: der Motor, wenn ein Zug läuft — sonst das Formular. */
function uebernehmen() {
  if (eingabe.aktiv.value && eingabe.zug.value) eingabe.enter();
  else uebernehmeScharf();
}

/** Was der nächste Tipp tut — für die Kontextleiste, wenn ein Tipp-Werkzeug läuft. */
const tippWerkzeug = computed(() => {
  if (messen.aktiv.value) return { icon: 'measure', hinweis: messen.hinweis.value ?? 'Ersten Punkt antippen', titel: 'Messen beenden [M]' };
  if (annotationActive.value) return { icon: 'issues', hinweis: 'Ort für die Notiz antippen', titel: 'Notiz-Modus beenden' };
  return null;
});

/** Nach dem Übernehmen: was passiert ist, und „Nochmal" — verschwindet mit dem nächsten Werkzeug. */
const rueckmeldung = ref(null);
let _rueckmeldungTimer = null;
/** Gelieferte Bauteile mit EIGENER Farbe, die der Katalog nicht übermalt hat. */
const erdbauEigene = ref([]);

watch(() => bearbeitung.scharfId, (id) => { if (id) rueckmeldung.value = null; });
function _melderueck(text, werkzeugId) {
  rueckmeldung.value = { text, werkzeugId };
  if (_rueckmeldungTimer) clearTimeout(_rueckmeldungTimer);
  _rueckmeldungTimer = setTimeout(() => { if (rueckmeldung.value?.text === text) rueckmeldung.value = null; }, 8000);
}
function nochmalStarten(id) {
  rueckmeldung.value = null;
  bearbeitung.starte(id);
}

/**
 * „Übernehmen" in der Kontextleiste — DERSELBE Weg wie Toolbox und HUD: eintragen,
 * anwenden, neu einordnen. Fehler laut (Gesetz 10).
 */
async function uebernehmeScharf() {
  const b = bearbeitung.scharf;
  if (!b) return;
  const el = bearbeitung.bauteil;
  try {
    const eintrag = await bearbeitung.ausfuehren({
      wer: cde.bearbeiter || '',
      modellSha: ablage.geladeneModellSha?.() ?? null,
      basis: el?.globalId ? nachspielen.lieferstandVon(el.globalId) : undefined,
      modell: el ? modellHerkunft(el.modelId) : undefined,
    });
    if (!eintrag) { melde(bearbeitung.letzterGrund || 'Nichts eingetragen.'); return; }
    const r = await wendeEintragAn(eintrag);
    _melderueck(!r ? 'Eingetragen.'
      : r.auslegung ? 'Ausgelegt — so liest die CDE dieses Bauteil ab jetzt.'
      : r.angewandt ? 'Übernommen.'
      : r.nurFestlegung ? 'Als Festlegung geführt — die Geometrie bleibt beim Planer.'
      : `Eingetragen, aber nicht angewandt: ${r.grund ?? 'unbekannt'}`, b.id);
  } catch (fehler) {
    console.error('cde: uebernehmen (Leiste)', fehler);
    melde(`Fehler: ${fehler?.message ?? fehler}`);
  }
}

/** Kurzmeldung des Modus-Knopfs — 4 s, dann weg (Gesetz 10: nie stumm). */
function melde(text) {
  modusMeldung.value = text;
  setTimeout(() => { if (modusMeldung.value === text) modusMeldung.value = ''; }, 4000);
}

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

let _selection   = null;  // IfcSelectionHandler — der EINE Zeiger-Stapel (Tipp/Schweben/Rahmen)

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
/** Abstand Auswahlpunkt → Anker des zuletzt angeklickten Bauteils (Welt). */
let _auswahlAbstand = null;

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
                       oberkante: h.oberkante, box: h.box ?? null, hoehenversatz: versatz };
      // DEN LIEFERSTAND EINFRIEREN, bevor irgendwer verschiebt (Teil XVII,
      // Headless-Befund 2026-09-08): das Nachspielen friert beim Laden nur
      // die Anker ein, die das Journal NENNT. Ein Bauteil, das zum ersten
      // Mal angefasst wird, hatte keinen — der Eintrag bekam keine `basis`
      // (Drei-Wege-Vergleich aus), und `entwerteNach` fand kein Δ: das
      // Fachmodell sah das verschobene Rohr weiter am Lieferort. Hier ist
      // der Anker noch der gelieferte (kein Eintrag, kein Delta); ein zweiter
      // Aufruf nach einer Verschiebung überschreibt nichts (`merkeLieferstand`).
      if (result.globalId && modellHerkunft(result.modelId) === 'geliefert') {
        nachspielen.merkeLieferstand?.(result.globalId, { x: h.anker.x, y: h.anker.y, z: h.anker.z });
      }
      // DER AUSWAHLPUNKT (S5): wo der Klick das Bauteil traf — dort sitzt der
      // Bauteil-Griff. Kommt die Einordnung ohne Treffer (frisch nach dem
      // Anwenden), bleibt der Griff am gemerkten Abstand zum Anker.
      const pkt = result.point && [result.point.x, result.point.y, result.point.z].every(Number.isFinite) ? result.point : null;
      if (pkt) _auswahlAbstand = { x: pkt.x - h.anker.x, y: pkt.y - h.anker.y, z: pkt.z - h.anker.z };
      const ab = _auswahlAbstand ?? { x: 0, y: 0, z: 0 };
      angereichert.auswahlpunkt = pkt ?? { x: h.anker.x + ab.x, y: h.anker.y + ab.y, z: h.anker.z + ab.z };
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
      // Über die GLOBALID (B2): ein selbst gesetzter Schacht wohnt im Netz
      // unter `cde:<gid>` — über den Ort fand ihn niemand, er hatte nie den
      // Mitführen-Regler.
      const anschluesse = engine.value?.anschluesseFuer?.(result.globalId) ?? [];
      if (anschluesse.length) angereichert = { ...angereichert, anschluesse };
    }

    // DIE LAGE IN PROJEKTKOORDINATEN — und der Weg zurück.
    //
    // Wer einen Schacht verschiebt, gibt Rechts- und Hochwert an, nicht
    // Three-Welt-Koordinaten. Der Rückweg ist eine schlichte Umkehrung des
    // Ladeversatzes — SOLANGE keine MapConversion gilt. Gälte eine, käme eine
    // Drehung dazu, und die Umkehrung wäre nicht mehr diese Formel. Deshalb
    // steht das Kennzeichen dabei, statt still falsch zu rechnen.
    // DAS PRÜFMASS EINES GELÄNDES (Teil XIV): wer es formt, schreibt die
    // Momentaufnahme der Quelle (Dreieckszahl, Ausdehnung) und eine Zellweite
    // in den Bauplan — `anwenden` ist synchron und darf nicht rechnen, also
    // liegt beides schon am Subjekt. Nur für Gelände: ein Rohr braucht das nicht.
    // … und seit G6/G7 für JEDES Bauteil: Kanalgraben (Rohr) und Aussparung
    // (Bauwerk) tragen das Prüfmass ihrer Quelle, damit ein vom Planer
    // geändertes Bauteil beim Laden auffällt. Der Resolver cached je Element.
    // DIE GELÄNDE-KANDIDATEN (G6, erweitert in Teil XIX): welches Gelände eine
    // Ableitung als Quelle nehmen kann — mit Prüfmass und Zellweite, damit
    // `anwenden` synchron bleibt. Bis Teil XIX hingen sie nur an Bauteilen MIT
    // Achse (Kanalgraben); die Bauwerksgrube braucht sie am Fundament, am
    // Schacht, an jedem Körper. Eigene DGM-Teile heissen im Journal, nicht in
    // der Engine.
    if (!angereichert.gelaendeQuellen) {
      const kandidaten = await engine.value?.gelaendeKandidaten?.() ?? [];
      if (kandidaten.length) {
        const erzeugt = aenderungen.wirksamerStand('erzeugt');
        angereichert = {
          ...angereichert,
          gelaendeQuellen: kandidaten
            .filter(k => k.globalId !== result.globalId)          // nie sich selbst ausheben
            // … und je Kandidat sein ERDBAU-STAND (Stufe 1): Ur-Gelände, Anzeige,
            // Stapel — `anwenden` hängt daran an, statt eine Kette zu bauen.
            .map(k => ({ ...k, name: k.name || erzeugt.get(k.globalId)?.name || '', erdbau: erdbauStandVon(erzeugt, k.globalId) })),
        };
      }
    }

    // DER ERDBAU-STAND DES SUBJEKTS (Stufe 1; Stufe 0 nannte es D3): wer das
    // Ur-Gelände, seine Anzeige oder ein Alt-DGM anfasst, soll an den
    // vorhandenen Stapel anhängen statt ihn zu klonen. Gefunden über die
    // QUELLEN im Journal — nicht über den Namen.
    if (result.globalId && !angereichert.erdbau) {
      angereichert = { ...angereichert, erdbau: erdbauStandVon(aenderungen.wirksamerStand('erzeugt'), result.globalId) };
    }

    const kategorie = String(result.category ?? result.type ?? '').toUpperCase();
    // DIE EIGENEN KÖRPER als Werkzeug einer Aussparung (G7) — aus dem Journal
    // benannt, nie aus der Engine geraten.
    const koerperKandidaten = engine.value?.koerperKandidaten?.() ?? [];
    if (koerperKandidaten.length) angereichert = { ...angereichert, koerperQuellen: koerperKandidaten };
    // DIE EIGENEN FLÄCHEN als Partner einer Vereinigung (S9) — aus dem
    // Journal, mit ihren Punkten: `anwenden` ist synchron und rechnet die
    // Vereinigung aus zwei Ringen, ohne die Engine zu fragen. Verdecktes
    // (verborgene eigene Quellen) zählt nicht.
    // EIGEN heisst: das Journal führt einen Bauplan zu dieser GlobalId — nicht
    // der Modellname (der Headless-Lauf fand das Subjekt eines eigenen Bauteils
    // unter einem anderen modelId-Wert, und die Listen blieben leer).
    const erzeugtStand = aenderungen.wirksamerStand('erzeugt');
    if (result.globalId && erzeugtStand.get(result.globalId)) {
      const verdeckt = verdeckteAus(aenderungen.wirksamerStand('geloescht'));
      const eigeneFlaechen = [...erzeugtStand]
        .filter(([gid, plan]) => plan?.rezept === 'flaeche' && !verdeckt.has(gid) && Array.isArray(plan?.parameter?.punkte))
        .map(([gid, plan]) => ({ globalId: gid, name: plan.name || '', punkte: plan.parameter.punkte }));
      if (eigeneFlaechen.length) angereichert = { ...angereichert, eigeneFlaechen };
      // DIE BIBLIOTHEK (9.8) für „Tauschen": Vorlagen sind Daten je Rezept —
      // Projekt schlägt Büro schlägt eingebaut, dieselbe Liste wie im Zeichnen-Popover.
      try {
        const vorlagen = await ladeVorlagen(repo);
        if (vorlagen.length) angereichert = { ...angereichert, vorlagen };
      } catch (fehler) { console.warn('cde: vorlagen fürs Tauschen', fehler?.message ?? fehler); }
    }
    // Der Vorfilter fürs Prüfmass — dieselbe Kandidatenmenge wie beim Sampler,
    // damit ein per Auslegung zum Gelände erklärter Proxy sein Prüfmass auch
    // bekommt. Grosszügig sein kostet hier nur einen Resolver-Treffer.
    // … und sobald eine GELÄNDE-ABLEITUNG möglich ist (Teil XIX): die
    // Bauwerksgrube braucht Grundriss und Prüfmass ihres Bauteils, und das
    // ist im Zweifel ein Schacht ohne Achse und ohne eigene Körper — der
    // fiel durch alle vier Bedingungen (Headless 2026-09-09).
    if (gelaendeKandidatKategorien().includes(kategorie) || engine.value?.istCdeGelaende?.(result.globalId)
        || angereichert.achse || koerperKandidaten.length || angereichert.gelaendeQuellen?.length) {
      const res = await engine.value?.makeGeometryResolver?.()
        ?.forElements([{ modelId: result.modelId, localId: result.localId }])?.getForm('mesh');
      const d = res?.data;
      if (d?.positions?.length) {
        const pruefmass = pruefmassVon({ positions: d.positions, triCount: d.triCount });
        angereichert = { ...angereichert, quellmass: { pruefmass, cell: zellweiteVorschlag(pruefmass) } };
        // DER GRUNDRISS (Teil XIX) — aus DEMSELBEN Netz, kein zweiter
        // Resolver-Treffer. Die Bauwerksgrube braucht ihn für die Vorschau;
        // gerechnet wird die Grube später aus der Quelle, nicht hieraus.
        const schritt = d.triCount > 20000 ? Math.ceil(d.triCount / 20000) : 1;
        const gr = grundrissAusMesh({ mesh: { positions: d.positions, triCount: d.triCount } }, { schritt });
        if (gr.ergebnis) angereichert = { ...angereichert, grundriss: gr.ergebnis };
      }
    }

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
  // DIE BEZIEHUNGEN des Bauteils (Teil XVII): Anschlüsse, Überdeckung,
  // Enthalten, Kreuzung, Nähe, Ableitung — aus dem EINEN Index, ans Subjekt
  // gehängt, damit HUD und Katalog nicht selbst suchen. Ein Fehler hier hält
  // die Einordnung nicht auf.
  try {
    const gid = angereichert.globalId ?? result.globalId ?? null;
    const idx = gid ? await engine.value?.beziehungen?.() : null;
    if (idx && gid) angereichert = { ...angereichert, beziehungen: idx.von(gid) };
  } catch (fehler) {
    console.warn('cde: beziehungen', fehler?.message ?? fehler);
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
      + 'Bearbeitung gesperrt. Oben „In Meter umrechnen" löst das.';
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
    if (grund) { melde(grund); return false; }
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
 * „Verbundenes wählen" (Teil XVII, B2): was mit dem gewählten Bauteil
 * zusammenhängt, wird zur MEHRFACHAUSWAHL — über denselben Weg wie die
 * Rahmenauswahl (`waehleOrte` + `_mehrfachEinordnen`), damit die
 * mehrfachfähigen Werkzeuge (Kanalart, Material, Sanierung, Löschen) sofort
 * greifen. `tiefe: 1` = nur die direkten Partner, sonst der ganze Verbund
 * (transitiv über die genannten Arten). Das gewählte Bauteil bleibt das erste.
 */
async function waehleVerbund({ arten = ['anschluss'], tiefe = Infinity, titel = 'Verbund' } = {}) {
  const gid = bearbeitung.bauteil?.globalId ?? ifc.selectedElement?.globalId ?? null;
  if (!gid || !engine.value) return;
  const idx = await engine.value.beziehungen?.().catch(() => null);
  if (!idx) { melde('Beziehungen sind noch nicht gelesen.'); return; }
  const menge = tiefe <= 1
    ? new Set(idx.partner(gid).filter(p => arten.includes(p.art)).map(p => p.gid))
    : idx.verbund(gid, arten);
  const orte = [];
  for (const g of [gid, ...menge]) {
    const o = idx.objekt(g)?.ort ?? null;
    if (o && !orte.some(x => x.modelId === o.modelId && x.localId === o.localId)) orte.push(o);
  }
  if (orte.length < 2) { melde(`Nichts Verbundenes gefunden (${titel}).`); return; }
  const { items, count } = await engine.value.waehleOrte(orte);
  // Das Subjekt zuerst — `_mehrfachEinordnen` nimmt den ersten Ort als Bauteil.
  const erst = orte[0];
  const sortiert = { [erst.modelId]: [Number(erst.localId)] };
  for (const [modelId, ids] of Object.entries(items)) {
    for (const id of ids) {
      if (modelId === erst.modelId && id === Number(erst.localId)) continue;
      (sortiert[modelId] ??= []).push(id);
    }
  }
  await _mehrfachEinordnen(sortiert);
  melde(`${count} Bauteile gewählt — ${titel}.`);
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
    const r = await engine.value.autor.baueErzeugte(plan.anzuwenden, undefined, {
      // Eigene Teile, die als Quelle eines Kanalgrabens verborgen sind (G6).
      verdeckt: verdeckteAus(aenderungen.wirksamerStand('geloescht')),
    });
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
  /** Laute, nicht blockierende Meldungen des Nachspielens (quelle_geaendert, Teil XIV). */
  getHinweise:          () => nachspielen.hinweise.value,
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
  schachtSubjekt: (globalId) => schachtSubjekt(globalId),
  ansichtAufsBlatt:     () => ansichtAufsBlatt(),
  hilfeUmschalten:      () => { showShortcuts.value = !showShortcuts.value; },
  /** Höhe aus dem Gelände-Sampler (Teil XIV, G3) — synchron, undefined bis vorgewärmt. */
  hoeheAn:              (x, z) => engine.value?.hoeheAn?.(x, z),
  /**
   * Das Eigenbau-Paket für den IFC-Verbundexport: was die CDE selbst erzeugt
   * hat, in Landeskoordinaten. Verbraucher: der Verbund-Dialog der CdeView.
   * `null` ohne Engine; wirft, wenn kein Modell (kein Koordinatenbezug) geladen ist.
   */
  eigenbauPaket:        () => eigenbauPaket(),
  bereiteGelaendeVor:   () => engine.value?.gelaendeSampler?.() ?? Promise.resolve(null),
  /** Böschungsoberkanten der Ableitungen für den Lageplan (G5). */
  getAbleitungsBilder:  () => engine.value?.ableitungsBilder?.() ?? [],
  /** Formsignatur eines Elements — was die Geometrie über die Form sagt (Bauformen-Panel). */
  getFormsignatur:      (modelId, localId) => engine.value?.formsignaturVon?.({ modelId, localId }) ?? Promise.resolve(null),
  /** Typen der Dateien, die das 4.3-Wörterbuch nicht kennt (gestrichen/exporteureigen). */
  getFremdeTypen:       () => engine.value?.fremdeTypen?.() ?? [],
  /** Server-Kernel (G7): Kollisionen eigener Körper gegen das gelieferte Modell. */
  kollisionenPruefen:   (opts) => engine.value?.kollisionenPruefen?.(opts) ?? Promise.resolve({ ok: false, grund: 'keine Engine', paare: [] }),
  kernelKann:           (name) => engine.value?.kernelKann?.(name) ?? { ok: false, grund: 'keine Engine' },
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
  wendeEintragAn: (eintragOderListe) => wendeEintragAn(eintragOderListe),

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
/**
 * In welchen Kategorien kann in DIESEM Projekt Gelände stecken?
 *
 * Regeln und Typprofile können jede Kategorie zum Höhenfeld erklären — die
 * mitgelieferte Vorbelegung ist nur der Startwert.
 */
function gelaendeKandidatKategorien() {
  return kandidatKategorien({
    regeln: bearbeitung.regeln ?? [],
    profilSatz: bearbeitung.profilSatz ?? {},
    vorbelegung: GELAENDE_VORBELEGUNG,
  });
}

/**
 * Die DEKLARIERTE Bauform eines Bauteils — als Funktion für die Engine.
 *
 * Sie wohnt hier, weil nur der Viewer die drei Quellen zusammen hat: das
 * JOURNAL (Auslegung je Bauteil), die REGELN und die TYPPROFILE. Die Engine
 * hält kein Journal und soll keins halten.
 *
 * Gefragt wird `deklarierteBauform` — dieselbe Funktion, die auch `bestimme`
 * benutzt. Sie ist synchron und geometriefrei, und das ist kein Zufall,
 * sondern der Grund, warum das hier ohne Resolver geht: der Geometrie-Rückfall
 * kann `hoehenfeld` gar nicht liefern, Gelände steht also ausnahmslos in einer
 * Deklaration.
 *
 * EINE Funktion für zwei Verbraucher: der Gelände-Sampler fragt
 * `=== 'hoehenfeld'`, das Formpaar-Gate der Ableitungen braucht den vollen
 * Wert. Zwei Funktionen wären zwei Wege zu derselben Frage gewesen — und die
 * laufen in diesem Haus zuverlässig auseinander.
 *
 * MOMENTAUFNAHME, mit Absicht: die Stände werden beim Bauen gelesen, nicht bei
 * jedem Aufruf. Die Engine bekommt sie zusammen mit dem Journalstand, und
 * beide gelten für denselben Augenblick.
 */
function baueBauformVon() {
  const auslegung = aenderungen.wirksamerStand('bauform');
  const bauplaene = aenderungen.wirksamerStand('erzeugt');
  const regeln = bearbeitung.regeln ?? [];
  const satz = bearbeitung.profilSatz ?? {};
  return (ctx) => deklarierteBauform({
    ausBauplan: ctx?.globalId ? (bauplaene.get(ctx.globalId)?.bauform ?? null) : null,
    ausEinzelfall: ctx?.globalId ? (auslegung.get(ctx.globalId) ?? null) : null,
    ausRegel: bauformAusRegel(regeln, ctx),
    typprofil: profilFuer(ctx?.category, satz),
  })?.bauform ?? null;
}

/** Braucht irgendeine wirksame Regel einen Merkmalssatz? Dann erst wird gelesen. */
function gelaendeBrauchtMerkmale() {
  return (bearbeitung.regeln ?? []).some(r => r?.bauform === 'hoehenfeld' && r?.condition?.psetName);
}

async function entwerteNach(arten) {
  if (!entwertetGeometrie(arten)) return;
  try {
    const n = await engine.value?.leseAchsen()?.catch?.(() => 0) ?? 0;
    // Der JOURNALSTAND gleich mit (17.3): selbst erzeugte Rohre und Schächte
    // kommen ins Fachmodell, Verdecktes fliegt heraus. Die Engine liest kein
    // Journal — sie bekommt den Stand als Daten; gerechnet wird er rein aus
    // den Bauplan-Parametern (CdeAchsen.js).
    const erzeugtStand = aenderungen.wirksamerStand('erzeugt');
    const { kanten, knoten, gelaende, koerper } = cdeAchsenAus(erzeugtStand);
    // S7: die wirksamen LAGEN gelieferter Bauteile als Δ gegen den Lieferstand —
    // damit Strang, Fang, Sohlgriffe und Prüfliste das verschobene Rohr dort
    // sehen, wo es steht. Ohne eingefrorenen Lieferstand kein Δ (nie raten).
    const lagen = new Map();
    for (const [gid, anker] of aenderungen.wirksamerStand('lage')) {
      const basis = nachspielen.lieferstandVon?.(gid);
      if (!basis || !anker) continue;
      const d = { x: anker.x - basis.x, y: anker.y - basis.y, z: anker.z - basis.z };
      if ([d.x, d.y, d.z].every(Number.isFinite)) lagen.set(gid, d);
    }
    // Teil XVII: Teil → Quelle als Paare für den Beziehungsindex (Art
    // `ableitung`). Die Engine liest kein Journal — sie bekommt die Paare.
    const ableitungen = [];
    for (const [gid, plan] of erzeugtStand) {
      for (const q of Object.values(quellenVon(plan?.parameter))) {
        for (const quelle of (Array.isArray(q) ? q : [q])) {
          if (quelle) ableitungen.push({ teil: gid, quelle, teilName: plan?.name ?? '' });
        }
      }
    }
    engine.value?.setzeJournalStand?.({
      lagen, ableitungen,
      kanten, knoten, gelaende, koerper,
      verdeckt: verdeckteAus(aenderungen.wirksamerStand('geloescht')),
      // Die NAMEN eigener Bauteile (G7): Prüfliste und Kandidatenlisten
      // nennen sie beim Namen statt „eigener Körper".
      namen: new Map([...erzeugtStand].map(([gid, b]) => [gid, b?.name ?? ''])),
      // Was Gelände IST, entscheidet die BAUFORM — nicht mehr eine
      // Kategorienliste. Die Engine bekommt Vorfilter und Entscheidung.
      gelaendeKategorien: gelaendeKandidatKategorien(),
      bauformVon: baueBauformVon(),
      gelaendeBrauchtMerkmale: gelaendeBrauchtMerkmale(),
    });
    ansicht.setzeStand({ hatAchsen: (n + kanten.length) > 0 });
    // Den BEZIEHUNGSINDEX gleich nachziehen (B2): Pille, Griffe und
    // Mitführen lesen ihn synchron aus dem letzten Aufbau — der muss den
    // neuen Stand kennen, bevor der nächste Klick kommt. Nur Berührtes
    // wird gerechnet (Dirty-Menge aus `setzeJournalStand`).
    await engine.value?.beziehungen?.()?.catch?.(e => console.warn('cde: beziehungen', e?.message ?? e));
    ifc.bumpGeometrieStand();
  } catch (fehler) {
    // Die ANWENDUNG war zu diesem Zeitpunkt erfolgreich — ein Fehler beim
    // Nachziehen darf sie nicht rückwirkend wie einen toten Knopf aussehen
    // lassen (Gesetz 10; genau so gemeldet am 2026-09-02).
    console.error('cde: entwerteNach', fehler);
  }
}

/**
 * Einen Eintrag oder Vorgang anwenden — und danach das SUBJEKT NEU EINORDNEN
 * (Teil XVI, S2). Vorher blieb es mit dem Stand von VOR der Änderung
 * stehen: das nächste Werkzeug belegte aus alten Werten vor. Alle vier
 * Aufrufer (Toolbox, HUD, Leiste, Lageplan) laufen hier durch.
 */
async function wendeEintragAn(eintragOderListe) {
  let r;
  if (Array.isArray(eintragOderListe)) {
    r = await wendeVorgangAn(eintragOderListe);
  } else {
    r = await wendeEinenAn(eintragOderListe);
    await entwerteNach([eintragOderListe?.art]);
  }
  await nachAusfuehrenEinordnen(eintragOderListe).catch(e => console.warn('cde: neu einordnen', e?.message ?? e));
  return r;
}

/**
 * Das gewählte Bauteil nach dem Anwenden frisch einordnen — ohne Kamerafahrt.
 * Ist es durch den Vorgang ERSETZT worden (teilen, einfügen, formen), wird
 * die Auswahl geleert und gesagt, warum. Ein CDE-eigenes Subjekt hat nach
 * dem Neuaufbau eine neue localId — die GlobalId-Karte findet es wieder.
 */
async function nachAusfuehrenEinordnen(eintraege) {
  const el = ifc.selectedElement;
  if (!el || !engine.value) return;
  const liste = (Array.isArray(eintraege) ? eintraege : [eintraege]).filter(Boolean);
  if (liste.some(e => e.art === 'geloescht' && e.nachher && e.globalId === el.globalId)) {
    await engine.value.clearSelection?.();
    ifc.clearElement();
    await bearbeitung.einordne(null, null);
    melde('Das Bauteil wurde ersetzt — die Auswahl ist leer.');
    return;
  }
  let ort = { modelId: el.modelId, localId: el.localId };
  if (el.globalId && liste.some(e => anwendungsweg(e) === 'neuaufbau')) {
    const { karte } = await karteMitEngine(engine.value, new Set([el.globalId]));
    const o = karte.get(el.globalId);
    if (o && (o.modelId !== ort.modelId || o.localId !== ort.localId)) {
      ort = { modelId: o.modelId, localId: o.localId };
      await engine.value.waehleOrt?.(o.modelId, o.localId);
    }
  }
  const frisch = await engine.value.elementDatenVon?.(ort.modelId, ort.localId);
  if (!frisch) return;
  ifc.setElement(frisch);
  await _einordnenMitHuelle(frisch);
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
    // Eine AUSLEGUNG gilt sofort — sie wirkt über die Entwertung, nicht über
    // `wendeAn`. `angewandt: true` ist hier die Wahrheit und keine Beschönigung:
    // nach dem `entwerteNach` des Aufrufers zeigt das Bild sie tatsächlich.
    if (weg === 'auslegung') return { weg, angewandt: true, nurFestlegung: false, auslegung: true, grund: null };

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
  _selection.onHover((pos, treffer, px) => {
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
    // EIN Treffer, drei Verbraucher: Zeiger (Klasse, Marke, Pille), Koordinaten-
    // leiste, Mess-Hovermarker — kein zweiter Raycast für dieselbe Antwort.
    if (px === null && treffer === null) zeiger.verlassen();
    else zeiger.aufHover(treffer, px);
    if (messen.aktiv.value) messen.bewegungAn(treffer?.point ?? null);
    if (eingabe.aktiv.value) eingabe.bewegeZeiger(treffer ? (treffer.fang?.punkt ?? treffer.point) : null);
    // Ein Griff unter dem Zeiger wächst — die Hand weiss, dass hier gezogen werden kann.
    if (griffe.bereit.value && px && canvasRef.value) {
      const r = canvasRef.value.getBoundingClientRect();
      engine.value?.griffHervorheben?.(engine.value?.griffUnter?.(px.x + r.left, px.y + r.top));
    }
  });
  // Tipp-Verbraucher in Rangfolge — der erste, der zugreift, gewinnt. Das
  // ersetzt den zweiten Maus-Stapel (eigene Klickschwelle, eigener Timer).
  // GRIFFE (S4): beim Aufsetzen beanspruchen, dann Zug-Ereignisse statt Tipp/Schweben.
  _selection.onGreifen((tipp) => griffe.greifen(tipp));
  _selection.onZugStart((tipp) => griffe.zugStart(tipp));
  _selection.onZugBewegt((tipp) => griffe.zugBewegt(tipp));
  _selection.onZugEnde((ende) => { griffe.zugEnde(ende).catch(e => console.warn('cde: griff', e?.message ?? e)); });
  _selection.onTipp(tippFuerMotor);
  _selection.onTipp(async (tipp) => messen.klick(tipp.x, tipp.y));
  _selection.onTipp(async (tipp) => annotationen.klick(tipp.event));
  // Gesperrt: ein Klick während einer scharfen Bearbeitung wechselt das
  // Subjekt nicht — und sagt, warum (die 3D-Fassung von `griffBereit`).
  _selection.onGesperrt(() => melde('Bearbeitung läuft — „Übernehmen" schliesst sie ab, Esc bricht ab. Das Bauteil bleibt gewählt.'));
  auswahlModusNachziehen();
  _selection.onMarqueeSelect(({ items, count }) => {
    if (!count) return;
    // DER RAHMEN ERREICHT JETZT DIE BEARBEITUNG (Stufe 14.10).
    //
    // Er wählte seit jeher mehrere Bauteile aus und hob sie hervor — gesagt
    // hat er es nur der Konsole. Damit war Mehrfachbearbeitung nicht etwa
    // schwierig, sondern schlicht nicht verdrahtet.
    _mehrfachEinordnen(items).catch(e => console.warn('cde: mehrfach', e?.message ?? e));
  });

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
  //
  // DANACH NEU ENTWERTEN: Regeln und Typprofile entscheiden mit, WAS Gelände
  // ist. Kommen sie nach dem ersten Modell an, gilt sonst bis zur nächsten
  // Bearbeitung die Vorbelegung — eine Büroregel, die einen Proxy zum
  // Höhenfeld erklärt, käme nie an. Der Ladevorgang selbst wird davon nicht
  // aufgehalten (kein `await` an einer sichtbaren Stelle).
  bearbeitung.ladeProfile(repo)
    .then(() => entwerteNach(['bauform']))
    .catch(e => console.warn('cde: typprofile', e?.message ?? e));
});

onBeforeUnmount(() => {
  cmds.unregister('viewer');
  document.removeEventListener('keydown', onKeyDown);
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
  /** Die zuletzt offenen Modelle zurückholen — die Schale ruft es, weil sie
      den Deep-Link kennt und der Vorrang hat. */
  stelleOffeneWiederHer: () => ablage.stelleOffeneWiederHer(),
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
  /** Formsignatur eines Elements — das Panel „Bauformen" misst je Zeile ein Beispiel (2026-09-07). */
  getFormsignatur: (modelId, localId) => engine.value?.formsignaturVon?.({ modelId, localId }) ?? Promise.resolve(null),
  /** Typen ausserhalb des 4.3-Wörterbuchs — strukturell erkannt. */
  getFremdeTypen: () => engine.value?.fremdeTypen?.() ?? [],
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

/**
 * Ein Modell entladen.
 *
 * Der Knopf am Chip war verdrahtet, aber die Nacharbeit fehlte: Bezüge,
 * Welt- und Höhenversatz, Achsen und Journalstand blieben auf dem ENTLADENEN
 * Modell stehen. Wer das erste von zwei Modellen schloss, arbeitete danach
 * mit dessen Ladeversatz weiter, und die Achsen des Verschwundenen geisterten
 * durch Netz, Strang und Prüfliste — dieselbe Klasse wie die Achsen, die bis
 * Stufe 16 nur beim Laden gelesen wurden.
 *
 * Deshalb läuft das Entladen jetzt durch DENSELBEN Nachzug wie das Laden
 * (Gesetz 7) und entwertet danach das Fachmodell.
 */
async function removeModel(modelId) {
  await engine.value?.unloadModel(modelId);
  ablage.vergiss(modelId);
  await _modellmengeNachziehen();
  // Der Journalstand gehört dazu: erzeugte Bauteile und Verdecktes beziehen
  // sich auf Modelle, von denen eines gerade gegangen ist.
  await entwerteNach(['erzeugt', 'lage']);
}

/**
 * Was nach JEDER Änderung der Modellmenge gilt — beim Laden wie beim Entladen.
 *
 * Die Reihenfolge ist nicht beliebig: der Projektbezug entscheidet, was jede
 * Koordinaten- und Höhenanzeige danach zeigt, und der Welt-Rahmen muss stehen,
 * BEVOR das Journal gelesen wird (eine andere Modellmenge kann ein anderes
 * Bounding-Box-Minimum haben — dann hebt JournalVersatz alle Punkte synchron).
 */
async function _modellmengeNachziehen() {
  _bezuegeNeuBestimmen();

  const erstes = engine.value?.getModelList()?.[0];
  const rahmen = erstes ? engine.value?.getCoordOffsetForModel?.(erstes.modelId) : null;
  if (rahmen) aenderungen.setzeWeltversatz({ x: rahmen.x, y: rahmen.y, z: rahmen.z });
  const bezug = Object.values(bezuege.value)[0] ?? null;
  engine.value?.setzeHoehenversatz?.(bezug ? bezug.nachProjekt({ x: 0, y: 0, z: 0 }).hoehe : 0);

  // Die Achsen einmal zählen — davon hängt ab, ob der Längsschnitt bedienbar
  // ist. Fehler halten nichts auf: eine Datei ohne Leitungen hat eben keine.
  const achsen = await engine.value.leseAchsen().catch(() => 0);
  ansicht.setzeStand({ hatAchsen: achsen > 0 });
  // Der Beziehungsindex einmal je Modellmenge (B2) — danach nur Berührtes.
  engine.value?.beziehungen?.()?.catch?.(e => console.warn('cde: beziehungen', e?.message ?? e));

  categoryList.value = engine.value.getCategoryList();
  ifc.setModelList(engine.value.getModelList());
  const tree = await engine.value.getSpatialTree();
  ifc.setSpatialTree(tree ?? null);
  engine.value.buildSearchIndex().then(entries => ifc.setSearchIndex(entries));
  engine.value.getStoreyList().then(list => { storeyList.value = list; }).catch(() => {});

  // Erdbau-Farben auf GELIEFERTES Material (2026-09-09). Erzeugtes trägt
  // seine Farbe im Material und braucht das nicht. Was der Planer selbst
  // gefärbt hat, bleibt — die CDE fragt dann, statt zu übermalen.
  erdbauFarbenAnwenden().catch(e => console.warn('cde: erdbaufarben', e?.message ?? e));

  // Und merken, was jetzt offen ist — der nächste Start holt genau das zurück.
  ablage.merkeOffene();
}

/**
 * Den Farbkatalog auf geliefertes Erdbau-Material anwenden.
 *
 * Ohne Rückfrage, solange niemand widerspricht: ein Gelände in neutralem
 * Grau ist keine Aussage, sondern der Standard der Bibliothek. Bringt ein
 * Bauteil eine EIGENE Farbe mit, bleibt sie stehen und die Frage steht in
 * der Leiste — ein stilles Übermalen wäre Datenverlust in der Anschauung.
 */
async function erdbauFarbenAnwenden({ ueberschreiben = false } = {}) {
  if (!engine.value?.erdbauFaerben) return;
  const bericht = await engine.value.erdbauFaerben({ ueberschreiben });
  erdbauEigene.value = ueberschreiben ? [] : (bericht.eigene ?? []);
  return bericht;
}

/** „Doch überschreiben" — die Antwort auf die Rückfrage. */
async function erdbauFarbenUeberschreiben() {
  await erdbauFarbenAnwenden({ ueberschreiben: true });
}

/**
 * Das Eigenbau-Paket für den IFC-Verbundexport (2026-09-10).
 *
 * Alles, was die CDE selbst erzeugt hat und im Raum steht — neu gebaut aus dem
 * Journal auf DEMSELBEN Weg wie der Raum (`eigenbauGeometrien`), umgerechnet in
 * Landeskoordinaten über den Bezug des ersten Modells. Den Weg zum Server geht
 * der Verbundexport (Multipart-Feld `eigenbau`); hier entsteht nur das Paket.
 *
 * Über viewerApi als `eigenbauPaket` erreichbar; Verbraucher ist der
 * Verbund-Dialog der CdeView (Knopf „Verbund" in der Satzleiste). Den Schlüssel
 * gibt es erst mit ihm — der Wächter `lässt keine toten viewerApi-Schlüssel
 * zurück` verlangt einen Verbraucher.
 */
async function eigenbauPaket() {
  if (!engine.value?.eigenbauGeometrien) return null;
  const bezug = Object.values(bezuege.value)[0] ?? null;
  if (!bezug?.nachProjekt) throw new Error('Eigenbau-Paket: kein Koordinatenbezug — erst ein Modell laden');
  const erzeugt = aenderungen.wirksamerStand('erzeugt');
  const verdeckt = verdeckteAus(aenderungen.wirksamerStand('geloescht'));
  const schritte = [...erzeugt].filter(([, w]) => w).map(([globalId, wert]) => ({ globalId, wert }));
  const gebaut = await engine.value.eigenbauGeometrien(schritte, { verdeckt });
  const c = bezug.crs ?? {};
  const herkunft = c.deklariert && c.erkannt && !c.stimmt
    ? `Georeferenz-Erkennung der CDE: die Datei deklariert ${c.deklariert}, die Koordinaten liegen in ${c.erkannt}`
    : `Georeferenz-Erkennung der CDE (${c.wirksam ?? 'unbekannt'})`;
  // Welcher Journalstand exportiert wird: der jüngste Commit — und ob noch
  // eine offene Sitzung dazukommt (dann ist der Stand MEHR als der Commit).
  const letzter = [...(aenderungen.commits ?? [])].sort((a, b) => (a.wann ?? 0) - (b.wann ?? 0)).at(-1) ?? null;
  const paket = baueEigenbauPaket({
    teile: gebaut.bauteile, stand: erzeugt, nachProjekt: bezug.nachProjekt,
    crs: c.wirksam ?? null, crsHerkunft: herkunft,
    projektname: cde.auftrag?.name ?? '', schluessel: cde.aktiverSatzId ?? 'cde',
    bearbeiter: cde.bearbeiter ?? '',
    anzeigeformen: gebaut.anzeigeformen ?? [],
    journal: { commit: letzter?.id ?? null, sitzungOffen: !!aenderungen.sitzungOffen },
  });
  paket.quellDokumente = await quellDokumenteFuer(paket.bauteile);
  // Was nicht ins Paket kam, steht darin — nicht still weggelassen.
  paket.misserfolge = gebaut.misserfolge;
  paket.leer = gebaut.leer;
  paket.verborgen = gebaut.verborgen;
  return paket;
}

/**
 * Die REGISTERDOKUMENTE, in denen die Wirte der Aushübe liegen (Paket v2).
 *
 * Das Erdbau-Dokument (Stufe 3) nimmt genau sie als Quelle; der Server prüft
 * sie gegen das Register. Gefunden über den GUID-Index der geladenen Modelle
 * (nicht über den Namen) → Modell-Identität (sha256) → Registereintrag. Ein
 * Wirt ohne Dokument steht mit `sha256: null` darin, statt zu fehlen — dann
 * sagt der Server, WAS fehlt.
 */
async function quellDokumenteFuer(bauteile) {
  const gesucht = [...new Set((bauteile ?? []).map(b => b.wirt).filter(g => g && !String(g).startsWith('cde-')))];
  if (!gesucht.length || !engine.value) return [];
  const { karte, fehlend } = await karteMitEngine(engine.value, gesucht);
  const je = new Map();
  const dazu = (sha, gid) => {
    if (!je.has(sha)) {
      const d = sha ? cde.dokumente?.find?.(x => x.sha256 === sha) ?? null : null;
      je.set(sha, { sha256: sha, datei: d?.name ?? null, revision: d?.revision ?? null, globalIds: [] });
    }
    je.get(sha).globalIds.push(gid);
  };
  for (const [gid, { modelId }] of karte) dazu(ablage.identitaet(modelId)?.sha256 ?? null, gid);
  for (const gid of fehlend) dazu(null, gid);
  return [...je.values()];
}

/** Called after every successful loadIfc() to refresh UI state. */
async function _onModelLoaded() {
  // Bezüge, Rahmen, Achsen, Listen — dieselbe Nacharbeit wie beim Entladen.
  // Sie stand bis 2026-09-03 nur hier, und das Entladen liess deshalb den
  // halben Zustand des verschwundenen Modells stehen.
  await _modellmengeNachziehen();

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
  // Im Eingabefeld gelten die Kürzel nicht — ausser Esc: „Esc bricht ab" muss
  // auch gelten, wenn der Cursor gerade im Zahlenfeld der Kontextleiste steht
  // (Headless-Lauf 2026-09-08: der Wächter schluckte es, das Werkzeug blieb).
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    if (e.key !== 'Escape' || !bearbeitung.werkzeug) return;
    e.target.blur?.();
  }

  // ? toggles the shortcut overlay
  if (e.key === '?') { e.preventDefault(); showShortcuts.value = !showShortcuts.value; return; }
  if (e.key === 'Escape' && showShortcuts.value) { showShortcuts.value = false; return; }

  // T1.3: M toggles measure mode
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); messen.umschalten(); return; }
  // ESC — EIN Ausgang (Teil XVI): der Slot kennt seinen Besitzer und dessen
  // Ausschalter (Messen, Notiz, scharfe Bearbeitung, Plan-Werkzeuge). Nur
  // der Schnitt ist anders: Esc blendet dort die LEISTE aus, der Schnitt
  // selbst bleibt — das ist kein Werkzeug-Ende, sondern Aufräumen.
  // Ein laufender Griff-Zug zuerst (S7): Esc verwirft ihn wie ein
  // pointercancel — sonst schaltet `slotAus` nur das Werkzeug ab, der Zug
  // schriebe beim Loslassen trotzdem (Headless 2026-09-08).
  if (e.key === 'Escape' && _selection?.ziehtGerade?.()) { _selection.zugAbbrechen(); return; }
  if (e.key === 'Escape' && bearbeitung.werkzeug) {
    if (bearbeitung.werkzeug === 'schnitt') { schnitt.leisteAusblenden(); return; }
    // Stufenweise, wie im Lageplan: erst die Geste, dann das Werkzeug.
    if (eingabe.brichGesteAb()) return;
    bearbeitung.slotAus();
    return;
  }
  // Der Motor im Raum: Enter schliesst ab (oder prüft), Rücktaste nimmt den letzten Punkt.
  if (eingabe.aktiv.value) {
    if (e.key === 'Enter') { e.preventDefault(); eingabe.enter(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); eingabe.entferneLetzten(); return; }
  }

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





// ── Zeiger-Interaktion ───────────────────────────────────────────────────────
// Tipp, Schweben und Rahmen laufen über _selection (IfcSelectionHandler, EIN
// Stapel). Messen und Notiz sind dort als Tipp-Verbraucher angemeldet — der
// zweite Maus-Stapel mit eigener Klickschwelle und eigenem Timer ist Geschichte
// (Teil XVI, S1).

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
}
/* Der Zeiger — EIN Besitzer (useZeiger, Teil XVI). Die Engine setzte den
   Cursor früher inline und schlug damit jede dieser Klassen. Die Farben in
   den Grafiken gehören zum Bild, nicht zum Thema (siehe designTokens-Wächter). */
.canvas-root.zeiger--auswahl {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='rgba(0,0,0,0.55)' stroke-width='4'/%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='18' cy='18' r='2' fill='white'/%3E%3Ccircle cx='18' cy='18' r='2' fill='none' stroke='rgba(0,0,0,0.5)' stroke-width='1'/%3E%3C/svg%3E") 18 18, crosshair;
}
.canvas-root.zeiger--hover {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='rgba(0,80,0,0.7)' stroke-width='4'/%3E%3Ccircle cx='18' cy='18' r='14' fill='none' stroke='%2300ff22' stroke-width='2.5'/%3E%3Ccircle cx='18' cy='18' r='2' fill='%2300ff22'/%3E%3C/svg%3E") 18 18, pointer;
}
/* Werkzeug scharf: das Fadenkreuz des Browsers — die ZIELMARKE im Raum zeigt den
   gefangenen Punkt, der Cursor selbst bleibt schlank. */
.canvas-root.zeiger--werkzeug { cursor: crosshair; }
.canvas-root.zeiger--messen {
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
.action-btn.laedt { opacity: 0.45; cursor: progress; pointer-events: none; }
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
/* Die Ergebnismeldung sitzt UNTER der Wache — sonst lägen beide übereinander
   und man läse die Warnung, die man gerade erledigt hat. */
.einheit-banner + .einheit-banner { top: 7.2rem; }
.einheit-lesart { opacity: 0.92; }
.einheit-banner.ok {
  border-color: var(--cde-success);
  border-left-color: var(--cde-success);
}
.einheit-knopf {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--cde-warn); border-radius: var(--cde-radius-sm);
  background: transparent; color: var(--cde-text);
  font-size: var(--cde-font-xs); cursor: pointer;
}
.einheit-knopf:hover:not(:disabled) { background: var(--cde-tint); }
.einheit-knopf:disabled { opacity: 0.5; cursor: default; }

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
  /* Der Chip schneidet NICHTS mehr ab — das tut der Name für sich. Ein
     Doppelklick soll ausserdem entladen wollen, nicht Text markieren. */
  user-select: none;
}
.model-tag-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;                 /* ohne das schrumpft ein Flex-Kind nie */
}
/* Eigenbau: gestrichelt, damit es sich von einer Lieferung unterscheidet. */
.model-tag--eigenbau { border-style: dashed; color: var(--cde-text-dim); }
.tag-close {
  background: none; border: none; cursor: pointer;
  color: var(--cde-text-dimmer); font-size: 0.7rem; padding: 0; line-height: 1;
  flex-shrink: 0; transition: color 0.12s;
  touch-action: manipulation;
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
/* Die Modus-Leiste wohnt seit Teil XVI in CdeKontextleiste.vue. */

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
.erdbau-uebermalen {
  padding: 6px 10px;
  min-height: 34px;
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  background: var(--cde-surface-alt);
  color: var(--cde-text);
  font-size: 11px;
  cursor: pointer;
}
.erdbau-uebermalen:hover { background: var(--cde-float); }

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
  .section-close, .bearb-marke-aus, .tag-close { position: relative; }
  .bearb-marke-aus::after, .tag-close::after { content: ''; position: absolute; inset: -10px; }
  .section-close::after, .measure-clear::after {
    content: ''; position: absolute; inset: -9px;
  }
}
</style>
