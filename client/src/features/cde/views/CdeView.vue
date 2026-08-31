<template>
  <div class="cde-view">
    <!-- ── Auftrags- und Satz-Leiste (Managen) ──
         Der AUFTRAG steht fest (er kommt aus dem Ordner) und ist deshalb Text,
         kein Wähler. Gewählt wird der MODELLSATZ — die Variante. -->
    <div class="cde-bar">
      <span class="cde-brand"><CdeIcon name="cde" :size="17" /> CDE</span>

      <span v-if="cde.auftrag" class="cde-auftrag" :title="`Auftrag ${cde.auftrag.nummer} — kommt aus dem Projektordner`">
        {{ cde.auftrag.nummer }} · {{ cde.auftrag.name }}
      </span>

      <template v-if="cde.auftrag">
        <select class="cde-project-select" :value="cde.aktiverSatzId ?? ''" @change="onSatzChange"
                title="Modellsatz — eine benannte Auswahl aus den Modellen des Auftrags">
          <option value="">— ganzer Auftrag —</option>
          <option v-for="s in cde.saetze" :key="s.id" :value="s.id">
            {{ s.name }}<template v-if="s.zweck && s.zweck !== 'variante'"> ({{ s.zweck }})</template>
          </option>
        </select>

        <button class="cde-btn" @click="onNeuerSatz" title="Modellsatz anlegen — übernimmt die aktuelle Auswahl">
          <CdeIcon name="add" :size="14" /> Satz
        </button>
        <button class="cde-btn" :disabled="!cde.aktiverSatz" @click="onSatzUmbenennen" title="Modellsatz umbenennen">
          <CdeIcon name="edit" :size="14" />
        </button>
        <button class="cde-btn" :disabled="!cde.aktiverSatz" @click="onSatzLoeschen"
                title="Modellsatz löschen — die Modelle bleiben">
          <CdeIcon name="delete" :size="14" />
        </button>
      </template>

      <button
        class="cde-btn"
        :disabled="!cde.auftrag"
        :class="{ active: showStammdaten }"
        @click="showStammdaten = !showStammdaten; showRegister = false"
        title="Auftrags-Stammdaten"
      ><CdeIcon name="stammdaten" :size="14" /> Stammdaten</button>
      <button
        class="cde-btn"
        :disabled="!cde.auftrag"
        :class="{ active: showRegister }"
        @click="showRegister = !showRegister; showStammdaten = false"
        title="Dokument-Register (ISO-19650-Status)"
      ><CdeIcon name="documents" :size="14" /> Dokumente <small v-if="cde.dokumente.length">({{ cde.dokumente.length }})</small></button>
      <button
        class="cde-btn"
        :class="{ active: showBauformen }"
        @click="oeffneBauformen"
        title="Bauformen zuordnen — was bedeuten die Namen dieses Exporteurs?"
      ><CdeIcon name="element" :size="14" /> Bauformen</button>

      <span class="cde-sep" />

      <!-- Ansichts-Umschalter (Sprint P): 3D-Modell ↔ gezeichneter Lageplan.
           Datenquelle ist der Modus-Katalog, damit Umschalter, Befehlspalette
           und Hilfe-Overlay nicht auseinanderlaufen. -->
      <div class="cde-ansicht-schalter">
        <button
          v-for="m in ansichtsModi"
          :key="m.id"
          class="cde-ansicht-btn"
          :class="{ active: ansicht.modus === m.id }"
          :disabled="!modusMoeglich(m.id)"
          :title="modusTitel(m)"
          @click="ansicht.setzeModus(m.id)"
        ><CdeIcon :name="m.icon" :size="13" /> {{ m.kurz }}</button>
      </div>

      <span class="cde-sep" />

      <!-- Panel-Umschalter (Sprint U): eine Quelle — die Panel-Registry -->
      <button
        v-for="p in panels.defs"
        :key="p.id"
        class="cde-btn ghost"
        :class="{ active: panels.isOpen(p.id) }"
        :title="`${p.titel} ein-/ausblenden`"
        @click="panels.toggle(p.id)"
      ><CdeIcon :name="p.icon" :size="14" /></button>

      <span class="cde-spacer" />

      <label class="cde-bearbeiter" title="Bearbeiter-Name — Autor für Issues, Kommentare und Statuswechsel">
        <CdeIcon name="user" :size="14" />
        <input
          type="text"
          :value="cde.bearbeiter"
          placeholder="Bearbeiter…"
          @change="cde.setBearbeiter($event.target.value)"
        />
      </label>
    </div>

    <!-- Bericht der einmaligen Übernahme (Stufe 11.5). Er nennt Alteinträge
         ohne Datei beim Namen — die dürfen nicht in der Konsole enden. -->
    <div v-if="migrationsBericht" class="cde-panel cde-migration">
      <CdeIcon name="info" :size="14" />
      <span>{{ migrationsBericht }}</span>
      <button class="cde-btn sm" @click="migrationsBericht = ''" title="Ausblenden" aria-label="Ausblenden">
        <CdeIcon name="close" :size="12" />
      </button>
    </div>

    <!-- ── Auftragswähler ──
         Ohne `?projekt=` gibt es keinen Auftrag. Vorher stand hier eine
         Client-Projektliste, in der man sich Projekte ausdenken konnte, die es
         gar nicht gibt. Jetzt kommen sie aus dem Projektbestand. -->
    <div v-if="!cde.auftrag" class="cde-panel cde-auftragswahl">
      <h2>Auftrag wählen</h2>
      <p class="cde-hint">
        Die CDE arbeitet im Ordner eines Auftrags: dort liegen die Modelle, das
        Register und die Festlegungen. Ohne Auftrag lässt sich eine IFC nur
        ansehen — nichts wird abgelegt.
      </p>
      <p v-if="auftragsFehler" class="cde-fehler">{{ auftragsFehler }}</p>
      <ul v-else-if="auftraege.length" class="cde-auftragsliste">
        <li v-for="a in auftraege" :key="a.id">
          <button class="cde-auftrag-knopf" :disabled="!a.ordner" @click="onAuftragWaehlen(a.id)">
            <span class="nr">{{ a.id }}</span>
            <span class="nm">{{ a.name || '(ohne Bezeichnung)' }}</span>
            <small v-if="!a.ordner">kein Projektordner</small>
          </button>
        </li>
      </ul>
      <p v-else class="cde-hint">Keine Aufträge gefunden.</p>
    </div>

    <!-- ── Stammdaten-Panel ──
         NUR ANZEIGE. Nummer, Bezeichnung und Bauherr gehören dem Projekt und
         werden in der Akte gepflegt; sie hier bearbeitbar zu machen hiesse,
         dieselbe Angabe an zwei Orten zu führen. Genau daran sind vorher schon
         Register und Status auseinandergelaufen. -->
    <div v-if="showStammdaten && cde.auftrag" class="cde-panel">
      <div class="cde-panel-grid">
        <label>Auftrags-Nr.<input type="text" :value="cde.auftrag.nummer" readonly /></label>
        <label>Bezeichnung<input type="text" :value="cde.auftrag.name" readonly /></label>
        <label>Bauherr / AG<input type="text" :value="cde.auftrag.bauherr || '—'" readonly /></label>
        <label>Leistungsphase<input type="text" :value="cde.auftrag.lph || '—'" readonly /></label>
      </div>
      <div class="cde-panel-footer">
        <span class="cde-hint">Aus dem Projektordner — geändert wird in der Projekt-Akte.</span>
        <a class="cde-btn" :href="`/intern/projects?projekt=${cde.auftrag.id}`" target="_blank" rel="noopener">
          <CdeIcon name="open" :size="14" /> Zur Akte
        </a>
      </div>
    </div>

    <!-- ── Bauformen zuordnen (Stufe 9.3a) ──
         Manche Software gibt alles als IFCBUILDINGELEMENTPROXY aus — dann sagt
         der Typ nichts, der NAME aber sehr wohl. Hier wird einmal erklärt, was
         er bedeutet; das gilt danach für jede Datei aus derselben Software.
         Die Maschine RÄT nicht, sie zeigt nur, was sie gefunden hat. -->
    <div v-if="showBauformen" class="cde-panel">
      <p class="cde-hint">
        Was in diesem Modell wie heisst — und was es bedeutet. Die Zuordnung
        wird als Regel gespeichert und gilt für jede weitere Lieferung aus
        derselben Software.
      </p>
      <p v-if="bauformAbdeckung.gesamt" class="cde-hint">
        {{ bauformAbdeckung.mit }} von {{ bauformAbdeckung.gesamt }} benannten Bauteilen
        zugeordnet<span v-if="bauformAbdeckung.ohne"> — die übrigen
        {{ bauformAbdeckung.ohne }} werden aus der Geometrie eingeordnet und
        bleiben sichtbar, messbar und zeichenbar.</span>
      </p>
      <div v-if="!bauformVorschlaege.length" class="cde-empty">
        Kein Modell geladen, oder keine benannten Bauteile gefunden.
      </div>
      <table v-else class="cde-doc-table">
        <thead>
          <tr><th>Kategorie</th><th>Name</th><th>Anzahl</th><th>Bauform</th></tr>
        </thead>
        <tbody>
          <tr v-for="v in bauformVorschlaege" :key="`${v.category}|${v.name}|${v.art}`">
            <td class="doc-name">{{ v.category.replace(/^IFC/, '') }}</td>
            <td class="doc-name">
              {{ v.name }}<template v-if="v.art === 'gruppe'"><span class="bf-gruppe"
                :title="`Fasst ${v.namen.length} Namen zusammen: ${v.namen.slice(0, 6).join(', ')}${v.namen.length > 6 ? ' …' : ''}`"
              >…</span></template>
            </td>
            <td class="doc-rev">{{ v.anzahl }}</td>
            <td>
              <select
                class="doc-status"
                :value="v.bauform ?? ''"
                @change="setzeBauform(v, $event.target.value)"
              >
                <option value="">— aus der Geometrie —</option>
                <option v-for="(b, schluessel) in BAUFORMEN" :key="schluessel" :value="schluessel">
                  {{ b.titel }}
                </option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Dokument-Register ── -->
    <div v-if="showRegister && cde.auftrag" class="cde-panel">
      <div v-if="!cde.dokumente.length" class="cde-empty">
        Noch keine Modelle registriert — beim Laden einer IFC-Datei mit aktivem
        Auftrag wird sie automatisch als <b>WIP</b> aufgenommen.
      </div>
      <table v-else class="cde-doc-table">
        <thead>
          <tr>
            <!-- Die Spalte steht IMMER, nur ihr Inhalt hängt am Satz — eine
                 Zelle per `v-if` aus einer keyed `v-for`-Zeile zu nehmen ändert
                 die Kinderzahl der Zeile zwischen zwei Durchläufen. Das war
                 NICHT die Ursache der Renderabstürze (die lag in
                 IfcStoreyNav), aber es bleibt die stabilere Form. -->
            <th class="doc-satz" :title="cde.aktiverSatz ? `Im Modellsatz „${cde.aktiverSatz.name}“` : ''">
              {{ cde.aktiverSatz ? 'Satz' : '' }}
            </th>
            <th>Dokument</th><th>Rev.</th><th>Größe</th><th>Status (ISO 19650)</th><th>Aufgenommen</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in sortedDokumente" :key="d.sha256">
            <!-- Stufe 11.4: Was liegt im aktiven Modellsatz? Der Haken ist die
                 EINZIGE Stelle, an der sich Varianten unterscheiden — alles
                 andere (Dateien, Register, Status) gehört dem Auftrag. -->
            <td class="doc-satz">
              <input
                v-if="cde.aktiverSatz"
                type="checkbox"
                :checked="(cde.aktiverSatz.enthaelt ?? []).includes(d.sha256)"
                :title="`In „${cde.aktiverSatz.name}“ führen`"
                @change="satzUmschalten(d.sha256)"
              />
            </td>
            <td class="doc-name" :title="d.sha256">{{ d.name }}</td>
            <td class="doc-rev">{{ d.revision }}</td>
            <td class="doc-size">{{ fmtBytes(d.size) }}</td>
            <td>
              <select
                class="doc-status"
                :class="`iso-${d.status.toLowerCase()}`"
                :value="d.status"
                :title="statusTitle(d)"
                @change="cde.setDokumentStatus(d.sha256, $event.target.value)"
              >
                <option v-for="s in ISO_STATUS" :key="s" :value="s">{{ s }}</option>
              </select>
            </td>
            <td class="doc-date">{{ fmtDate(d.addedAt) }}</td>
            <td class="doc-actions">
              <button class="cde-btn sm" @click="openDokument(d)" title="Modell öffnen" aria-label="Modell öffnen">
                <CdeIcon name="open" :size="12" />
              </button>
              <button class="cde-btn sm danger" @click="cde.removeDokument(d.sha256)" title="Aus Register entfernen" aria-label="Aus Register entfernen">
                <CdeIcon name="close" :size="12" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Arbeitsfläche: Leiste | Viewer | Leiste ──
         Panels docken an und verkleinern den Viewer, statt ihn zu verdecken —
         am Modell abzulesende Geometrie bleibt sichtbar (Sprint U). -->
    <div class="cde-workspace">
      <CdePanel
        v-if="panels.aktivLinks"
        :titel="panels.aktivLinks.titel"
        :icon="panels.aktivLinks.icon"
        seite="left"
        :breite="panels.breiten[panels.aktivLinks.id]"
        @close="panels.close(panels.aktivLinks.id)"
        @resize="(w) => panels.setBreite(panels.aktivLinks.id, w)"
      >
        <!-- Erster Nutzer des head-actions-Slots: die beiden Baum-Knöpfe, die
             früher im Modal-Kopf der Struktur saßen (Sprint P/AP-12). -->
        <template v-if="panels.isOpen('struktur')" #head-actions>
          <button class="cp-head-btn" title="Alle aufklappen" @click="strukturRef?.expandAll()">
            <CdeIcon name="chevron-down" :size="13" />
          </button>
          <button class="cp-head-btn" title="Alle zuklappen" @click="strukturRef?.collapseAll()">
            <CdeIcon name="chevron-right" :size="13" />
          </button>
        </template>
        <IfcSpatialWindow v-if="panels.isOpen('struktur')" ref="strukturRef" />
      </CdePanel>

      <div class="cde-viewer-host">
        <!-- Der 3D-Viewer bleibt IMMER im Baum und wird nur unsichtbar
             geschaltet. Zwei Gründe, beide teuer erkauft:
             (1) `onBeforeUnmount` gibt die Engine frei und entwertet den
                 viewerApi, an dem sämtliche Panels hängen;
             (2) `display:none` setzt die Canvas-Größe auf 0 — der Renderer
                 schreibt daraufhin einen 0x0-Puffer und liefert beim
                 Zurückschalten ein schwarzes Bild.
             Deshalb `visibility`, nicht `v-if` und nicht `v-show`. -->
        <div class="host-lage" :class="{ verborgen: ansicht.modus !== '3d' }">
          <IfcViewer
            ref="viewerRef"
            :propertiesOpen="panels.isOpen('eigenschaften')"
            @close="onClose"
            @open-properties="panels.open('eigenschaften')"
            @model-loaded="onModelLoaded"
          />
        </div>

        <div v-if="ansicht.modus === 'lageplan'" class="host-lage">
          <IfcPlanCanvas
            ref="planRef"
            :optionen="planOptionen"
            :titleBlock="planSchriftfeld"
            :logo="plan.logo"
            @zeichnen-beendet="zeichenstandAbgleichen"
          />
          <!-- Werkzeuge des Lageplans. Bewusst hier und nicht im Panel: sie
               wirken auf die Zeichenfläche und sollen erreichbar sein, auch
               wenn die Leiste zugeklappt ist. -->
          <div class="plan-werkzeuge">
            <!-- Erzeugen (Stufe 9.4). Die Liste kommt aus dem Bearbeitungs-
                 Katalog, gefiltert nach Gruppe — dieselbe Liste, die auch die
                 Befehls-Palette liest. Ein Werkzeug, das dort fehlt und hier
                 steht, kann es damit nicht geben. -->
            <button
              v-for="z in ZEICHEN_WERKZEUGE"
              :key="z.id"
              class="plan-wz"
              :class="{ aktiv: zeichenWerkzeug === z.id }"
              :title="`${z.titel} — Punkte in den Plan klicken, Doppelklick schliesst ab [Esc bricht ab]`"
              @click="zeichenWerkzeugSetzen(z.id)"
            >
              <CdeIcon :name="z.icon" :size="14" />
            </button>

            <span class="plan-wz-trenner"></span>

            <button
              class="plan-wz"
              :class="{ aktiv: misstImPlan }"
              title="Bemaßen — zwei Punkte im Plan anklicken [Esc beendet]"
              @click="bemassungUmschalten"
            >
              <CdeIcon name="measure" :size="14" />
            </button>
            <button
              v-if="ifc.planDimensions.length"
              class="plan-wz"
              :title="`Alle ${ifc.planDimensions.length} Maße entfernen`"
              @click="ifc.clearPlanDimensions()"
            >
              <CdeIcon name="delete" :size="14" />
              <span class="plan-wz-zahl">{{ ifc.planDimensions.length }}</span>
            </button>

            <span class="plan-wz-trenner"></span>

            <!-- Planinhalte setzen (Stufe 7). Ohne Setzmodus fasst der Zeiger
                 vorhandene Inhalte an und zieht sie. -->
            <button
              class="plan-wz"
              :class="{ aktiv: planModus === 'text' }"
              title="Beschriftung setzen — dann in den Plan klicken"
              @click="planModusSetzen('text')"
            >
              <CdeIcon name="edit" :size="14" />
            </button>
            <button
              v-for="sym in PLAN_SYMBOL_NAMES"
              :key="sym"
              class="plan-wz"
              :class="{ aktiv: planModus === sym }"
              :title="`Symbol setzen: ${SYMBOL_TITEL[sym] ?? sym}`"
              @click="planModusSetzen(sym)"
            >
              <span class="plan-wz-sym">{{ SYMBOL_KURZ[sym] ?? '?' }}</span>
            </button>
            <span class="plan-wz-trenner"></span>

            <!-- Rotstift: Freihand-Anmerkung ZUM Plan, kein Planinhalt. -->
            <button
              class="plan-wz"
              :class="{ aktiv: stiftModus === 'stift' }"
              title="Rotstift — freihand anmerken"
              @click="stiftSetzen('stift')"
            >
              <CdeIcon name="edit" :size="14" :style="{ color: stiftFarbe }" />
            </button>
            <button
              v-for="f in STIFT_FARBEN"
              :key="f"
              v-show="stiftModus === 'stift'"
              class="plan-wz farbe"
              :class="{ aktiv: stiftFarbe === f }"
              :style="{ '--farbe': f }"
              :title="`Stiftfarbe`"
              @click="stiftSetzen('stift', f)"
            ></button>
            <button
              v-if="rotstift.anzahl"
              class="plan-wz"
              :class="{ aktiv: stiftModus === 'radierer' }"
              :title="`Radieren (${rotstift.anzahl} Striche)`"
              @click="stiftSetzen('radierer')"
            >
              <CdeIcon name="undo" :size="14" />
            </button>

            <span class="plan-wz-trenner"></span>

            <button
              v-if="planInhalt.anzahl"
              class="plan-wz"
              :class="{ aktiv: planModus === 'loeschen' }"
              :title="`Planinhalt entfernen (${planInhalt.anzahl} gesetzt)`"
              @click="planModusSetzen('loeschen')"
            >
              <CdeIcon name="close" :size="14" />
              <span class="plan-wz-zahl">{{ planInhalt.anzahl }}</span>
            </button>
          </div>
        </div>
      </div>

      <CdePanel
        v-if="panels.aktivRechts"
        :titel="panels.aktivRechts.titel"
        :icon="panels.aktivRechts.icon"
        seite="right"
        :breite="panels.breiten[panels.aktivRechts.id]"
        @close="panels.close(panels.aktivRechts.id)"
        @resize="(w) => panels.setBreite(panels.aktivRechts.id, w)"
      >
        <IfcSemanticWindow  v-if="panels.isOpen('eigenschaften')" />
        <IfcPlanningCockpit v-else-if="panels.isOpen('cockpit')" />
        <IfcPlanPanel v-else-if="panels.isOpen('plan')" @stile-oeffnen="stilEditorOffen = true" />
        <CdeToolbox v-else-if="panels.isOpen('toolbox')" />
        <IfcAnnotations
          v-else-if="panels.isOpen('issues')"
          :annotationActive="annotationActive"
          :zoomToPoint="zoomToIssue"
          :applyViewpoint="(vp) => viewerRef?.applyViewpoint(vp)"
          :captureViewpoint="() => viewerRef?.captureViewpoint() ?? null"
          @toggle-mode="onToggleIssueMode"
        />
      </CdePanel>
    </div>

    <IfcVectorStyleEditor v-if="stilEditorOffen" @close="stilEditorOffen = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import IfcViewer from '../components/IfcViewer.vue';
import IfcPlanCanvas from '../components/IfcPlanCanvas.vue';
import IfcSemanticWindow from '../components/IfcSemanticWindow.vue';
import IfcSpatialWindow from '../components/IfcSpatialWindow.vue';
import IfcPlanningCockpit from '../components/IfcPlanningCockpit.vue';
import IfcPlanPanel from '../components/IfcPlanPanel.vue';
import CdeToolbox from '../components/CdeToolbox.vue';
import IfcVectorStyleEditor from '../components/IfcVectorStyleEditor.vue';
import IfcAnnotations from '../components/IfcAnnotations.vue';
import CdeIcon from '../components/ui/CdeIcon.vue';
import CdePanel from '../components/ui/CdePanel.vue';
import { useCdeStore, ISO_STATUS, resolveWatermarkText } from '../stores/useCdeStore.js';
import { usePlan } from '../stores/usePlan.js';
import { usePlanInhalt } from '../stores/usePlanInhalt.js';
import { useRotstift, STIFT_FARBEN } from '../stores/useRotstift.js';
import { PLAN_SYMBOL_NAMES } from '../services/PlanSymbols.js';
import { repo, RemoteBackend, BueroBackend } from '../services/RepoFacade.js';
import { AuftragApi } from '../services/AuftragApi.js';
import { berichtText, migriere } from '../services/SatzMigration.js';
import { useAenderungen } from '../stores/useAenderungen.js';
import { useBearbeitung } from '../stores/useBearbeitung.js';
import { BAUFORMEN } from '../services/bauform/Bauformen.js';
import { ausGruppe } from '../services/Bearbeitungen.js';
import { abdeckung } from '../services/bauform/Bauformregeln.js';
import { usePanels } from '../stores/usePanels.js';
import { useAnsicht } from '../stores/useAnsicht.js';
import { useIfcStore } from '../stores/useIfcStore.js';
import { usePaletteCommands } from '../stores/useCommands.js';
import { modusListe, istVerfuegbar } from '../services/ViewModes.js';
// Design-Tokens — landen bewusst auf :root (teleportierte Panels erben sonst nichts)
import '../styles/theme.css';

const router = useRouter();
const route = useRoute();
// Stufe C: mit ?projekt=<id> lebt das Repository im Projektordner auf dem Server.
// Muss VOR den Stores passieren — sie lesen beim Anlegen aus dem Backend.
const cockpitProjektId = Number(route.query.projekt);
if (Number.isInteger(cockpitProjektId) && cockpitProjektId > 0) {
  repo.setBackend(new RemoteBackend(cockpitProjektId));
} else if (repo.remote) {
  repo.setBackend(null);
}

// Büro-Ebene (Stufe 6): Plankopf-Vorlagen, Linienstil-Presets, Symbolsätze,
// IDS-Regelwerke und KG-Kennwerte gelten projektübergreifend. Sie liegt NEBEN
// dem Projekt-Repository, nicht darin — deshalb ein eigenes Backend und kein
// weiterer Scope. Ohne Netz bleibt sie aus; die Vorrangregel fällt dann auf
// den eingebauten Standard.
repo.setBueroBackend(new BueroBackend());
const cde = useCdeStore();
const aenderungen = useAenderungen();
/** Die Aufträge zur Auswahl — nur gefüllt, wenn `?projekt=` fehlt. */
const auftraege = ref([]);
const auftragsFehler = ref('');
/** Was die einmalige Übernahme alter Client-Projekte ergeben hat (Stufe 11.5). */
const migrationsBericht = ref('');
const panels = usePanels();
const ansicht = useAnsicht();
const ifc = useIfcStore();
const bearbeitung = useBearbeitung();
const plan = usePlan();
const planInhalt = usePlanInhalt();
const rotstift = useRotstift();
const cmds = usePaletteCommands();

const viewerRef = ref(null);
const planRef = ref(null);
const strukturRef = ref(null);
const showStammdaten = ref(false);
/** Linienstil-Editor. Sein einziger Einhängepunkt war bisher das PDF-Modal. */
const stilEditorOffen = ref(false);
const showRegister = ref(false);
const showBauformen = ref(false);
/** Die Namen des geladenen Modells samt bereits zugeordneter Bauform. */
const bauformVorschlaege = ref([]);
/** Wie viel davon zugeordnet ist — damit man weiss, wann man aufhören kann. */
const bauformAbdeckung = ref({ mit: 0, ohne: 0, gesamt: 0 });

/** Vorschläge und Abdeckung neu berechnen — nach jeder Zuordnung. */
function frischeVorschlaege() {
  const index = ifc.getSearchIndex();
  bauformVorschlaege.value = bearbeitung.vorschlaege(index);
  bauformAbdeckung.value = abdeckung(
    (index ?? []).map(e => ({ category: e.category, attributes: { Name: e.name } })),
    bearbeitung.regeln,
  );
}

function oeffneBauformen() {
  showBauformen.value = !showBauformen.value;
  showStammdaten.value = false;
  showRegister.value = false;
  // Frisch berechnen: der Suchindex kommt erst nach dem Laden, und eine
  // Zuordnung ändert die Spalte „Bauform" sofort.
  if (showBauformen.value) frischeVorschlaege();
}

async function setzeBauform(v, bauform) {
  await bearbeitung.ordneZu({ category: v.category, name: v.name, art: v.art, bauform: bauform || null });
  frischeVorschlaege();
}

// ── Ansichts-Umschaltung (Sprint P, AP-8) ────────────────────────────────────

const ansichtsModi = modusListe();

function modusMoeglich(id) { return istVerfuegbar(id, ansicht.stand); }
function modusTitel(m) {
  return modusMoeglich(m.id)
    ? `${m.titel} (Taste ${m.taste})`
    : `${m.titel} — erst mit geladenem Modell verfügbar`;
}

// Der Modellstand entscheidet, welche Modi bedienbar sind. Ohne Modell wäre
// der Lageplan ein weißes Blatt — also sperren statt hineinlaufen lassen.
watch(() => ifc.modelList?.length ?? 0, (n) => {
  ansicht.setzeStand({ hatModell: n > 0 });
  if (!n) ansicht.setzeModus('3d');
}, { immediate: true });

/**
 * Zeichenoptionen des Plans. Vorläufig die Standardausstattung — sobald das
 * Plan-Panel steht (AP-9), kommen sie von dort. Die Stile stammen aus dem
 * IFC-Store, damit Bildschirm und Export dieselbe Farbtabelle benutzen.
 */
/**
 * Zeichenoptionen des Plans.
 *
 * Kamen bis Sprint I als feste Standardausstattung von hier — zehn Optionen,
 * die `IfcPlanCanvas` längst durchreicht, waren am Bildschirm damit still aus
 * (Böschungsschraffur, Höhenlinien, UTM-Kreuze, Haltungsbeschriftung …).
 * Jetzt bedient sie das Plan-Panel über `usePlan`.
 */
const planOptionen = computed(() => {
  const o = plan.optionen;
  return {
    // Was der Store weiß. Die Engine-Teile (web-ifc-Instanzen für die
    // Haltungsbeschriftung, Koordinaten-Versatz für die UTM-Kreuze, das
    // Achsenraster) ergänzt IfcPlanCanvas — nur der hat die viewerApi.
    ...plan.zeichenOptionen,
    ifcGrids:         o.ifcGrids,
    styleMap:         ifc.resolvedVectorStyleMap,
    styleMapPerModel: ifc.vectorStylesByModel ?? null,
    rules:            ifc.vectorRules ?? [],
    labelTemplateFor: (cat) => ifc.vectorStyles?.[cat]?.labelTemplate ?? '',
    annotations:      o.annotations ? (ifc.annotations ?? []) : [],
    dimensions:       o.dimensions ? ifc.planDimensions : [],
    planInhalte:      planInhalt.inhalte,
    rotstift:         rotstift.striche,
    measurements:     o.measurements ? (viewerRef.value?.messungen?.() ?? []) : [],
    watermark:        planWasserzeichen.value,
  };
});

/** Handeintrag schlägt den ISO-19650-Status des Dokuments. */
const planWasserzeichen = computed(() => {
  const eigen = (plan.optionen.watermarkText ?? '').trim();
  if (eigen) return eigen;
  const sha = viewerRef.value?.geladeneModellSha?.();
  return (sha ? resolveWatermarkText(cde.dokumente, sha) : null) || null;
});

/**
 * Schriftfeld. Der Nutzer pflegt es im Panel; leer gelassene Felder fallen
 * auf die Projektakte zurück, damit ein frisches Projekt sofort ein
 * brauchbares Blatt liefert.
 */
const planSchriftfeld = computed(() => ({
  ...plan.schriftfeld,
  projekt:      plan.schriftfeld.projekt
                || [cde.auftrag?.nummer, cde.auftrag?.name].filter(Boolean).join(' '),
  auftraggeber: plan.schriftfeld.auftraggeber || (cde.auftrag?.bauherr ?? ''),
  bearbeiter:   plan.schriftfeld.bearbeiter   || (cde.bearbeiter ?? ''),
  massstab:     `1:${ansicht.massstab}`,
}));

// ── Planinhalte setzen (Stufe 7) ───────────────────────────────────────────
//
// Kurzzeichen statt Icons: für Schacht, Pumpe, Einlauf, Hydrant und Armatur
// gibt es keine lucide-Entsprechung, und ein erfundenes Icon wäre schlechter
// als das Kürzel, das auch auf dem Blatt steht.
const SYMBOL_KURZ = {
  schacht: 'S', pumpe: 'P', einlauf: 'E', hydrant: 'H', armatur: 'A',
};
const SYMBOL_TITEL = {
  schacht: 'Schacht', pumpe: 'Pumpe', einlauf: 'Straßeneinlauf',
  hydrant: 'Hydrant', armatur: 'Armatur',
};

// ── Rotstift (Stufe 7) ─────────────────────────────────────────────────────
const stiftModus = ref(null);
const stiftFarbe = ref(STIFT_FARBEN[0]);
function stiftSetzen(m, farbe = null) {
  // Auf dieselbe Farbe nochmal geklickt schaltet ab; eine neue Farbe schaltet
  // den Stift an und wechselt nur.
  const gleicheFarbe = !farbe || farbe === stiftFarbe.value;
  stiftModus.value = (stiftModus.value === m && gleicheFarbe) ? null : m;
  if (farbe) stiftFarbe.value = farbe;
  planRef.value?.setzeStift?.(stiftModus.value, stiftFarbe.value);
  if (stiftModus.value) { planModus.value = null; misstImPlan.value = false; zeichenWerkzeugSetzen(null); }
}

const planModus = ref(null);
function planModusSetzen(m) {
  // Nochmal derselbe Knopf schaltet ab — sonst kommt man aus dem Modus nur
  // über Esc heraus, und das weiß nicht jeder.
  planModus.value = planModus.value === m ? null : m;
  planRef.value?.setzeModus?.(planModus.value);
  if (planModus.value) { misstImPlan.value = false; stiftModus.value = null; zeichenWerkzeugSetzen(null); }
}

// ── Zeichnen im Plan (Stufe 9.4) ───────────────────────────────────────────
/**
 * Die Zeichenwerkzeuge — abgeleitet aus dem Katalog, nicht hier aufgezählt.
 *
 * Erzeugen hat kein Subjekt, deshalb steht es in der WERKZEUGLEISTE und nicht
 * im Kontextmenü am Bauteil. Genau diese Trennung führt `GRUPPEN[...].einstieg`
 * im Katalog, und `passende()` hält sich daran.
 */
const ZEICHEN_WERKZEUGE = ausGruppe('erzeugen');
const zeichenWerkzeug = ref(null);

function zeichenWerkzeugSetzen(id) {
  // Nochmal derselbe Knopf schaltet ab — wie bei Setzmodus und Stift.
  const ziel = zeichenWerkzeug.value === id ? null : id;
  const ok = planRef.value?.zeichneMit?.(ziel);
  zeichenWerkzeug.value = ziel && ok ? ziel : null;
  if (zeichenWerkzeug.value) {
    // Zeichnen, Bemaßen, Setzen und Stift teilen sich den Klick — nie zwei
    // zugleich. Ohne das läge ein gesetzter Punkt zugleich als Symbol im Plan.
    misstImPlan.value = false;
    planModus.value = null;
    stiftModus.value = null;
  }
}

/** Wenn der Plan von sich aus aufhört (abgeschlossen, Esc), nachziehen. */
function zeichenstandAbgleichen() {
  zeichenWerkzeug.value = planRef.value?.zeichnetGerade?.() ?? null;
}

// ── Bemaßung im Plan (AP-10) ───────────────────────────────────────────────
const misstImPlan = ref(false);
function bemassungUmschalten() {
  planRef.value?.messenUmschalten?.();
  misstImPlan.value = planRef.value?.misstGerade?.() ?? false;
  // Bemaßen und Setzen teilen sich den Klick — nie beide zugleich.
  if (misstImPlan.value) {
    planModus.value = null; planRef.value?.setzeModus?.(null);
    stiftModus.value = null; planRef.value?.setzeStift?.(null);
    zeichenWerkzeugSetzen(null);
  }
}

// Tasten 1/2/3 sind frei — der Viewer belegt M V N H I T R ? Esc und Strg+K/F.
function onKeyDown(e) {
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const treffer = ansichtsModi.find(m => m.taste === e.key);
  if (treffer) { e.preventDefault(); ansicht.setzeModus(treffer.id); }
}

/**
 * Deep-Link aus dem Projekt-Cockpit: /cde?projekt=<id>&datei=<pfad relativ zu 1_Projekte>.
 * Stammdaten kommen aus der Projektakte (kein Handeintrag), das CDE-Projekt wird
 * bei Bedarf angelegt und aktiv gesetzt; eine Datei wird direkt geladen.
 */
/**
 * Den Auftrag aus dem Projektordner übernehmen.
 *
 * EIN Aufruf liefert Stammdaten, Dokumente UND Modellsätze — sie werden in den
 * Store hineingereicht, statt dass er sie ein zweites Mal holt. Genau daran
 * sind Register und Viewer-Liste in Stufe 3 auseinandergelaufen.
 *
 * Die CDE legt KEINE Aufträge mehr an. Ein Auftrag ist ein Ordner auf der
 * StorageBox; wer hier einen erfände, bekäme ein Projekt ohne Ordner, ohne
 * Nummer und ohne Bauherrn — und genau zwei davon standen am Ende in
 * `1337_Genau`.
 */
async function auftragAusOrdner() {
  const id = Number(route.query.projekt);
  if (!Number.isInteger(id) || id <= 0) { auftragsListeLaden(); return; }
  try {
    const register = await AuftragApi.register(id);
    await cde.ready;
    await cde.uebernehmeRegister(register, id);

    // Stufe 11.5: die alten Client-Projekte einmalig zu Modellsätzen machen.
    // Läuft VOR dem Setzen des Satzes, damit ein frisch übernommener gleich
    // gewählt werden kann. Idempotent — die Marke hält fest, dass es lief.
    try {
        const bericht = await migriere({
            repo, manifest: cde.dokumente,
            satzAnlegen: (daten) => cde.satzAnlegen(daten),
        });
        migrationsBericht.value = berichtText(bericht);
        if (bericht.angelegt.length) await cde.ladeSaetze();
    } catch (fehler) {
        console.warn('cde: satz-migration', fehler);
    }

    await aenderungen.setzeSatz(cde.aktiverSatzId);
    const datei = route.query.datei;
    if (datei) await viewerRef.value?.openFromProjectPath?.(String(datei));
  } catch (fehler) {
    auftragsFehler.value = 'Der Projektordner ist nicht erreichbar.';
    console.warn('cde: auftrag aus ordner', fehler);
  }
}

/** Ohne `?projekt=` zeigt die CDE die echten Aufträge zur Auswahl. */
async function auftragsListeLaden() {
  try {
    auftraege.value = await AuftragApi.liste();
  } catch (fehler) {
    auftragsFehler.value = 'Die Projektliste ist nicht erreichbar — angemeldet?';
    console.warn('cde: auftragsliste', fehler);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  auftragAusOrdner();
  // Der Modus ist ein Belang der Schale, nicht des Viewers — er wird hier
  // angemeldet und erscheint dadurch automatisch in Palette und Hilfe.
  cmds.register('ansicht', ansichtsModi.map(m => ({
    id: `ansicht.${m.id}`,
    titel: `Ansicht: ${m.titel}`,
    icon: m.icon,
    gruppe: 'Ansicht',
    key: m.taste,
    verfuegbar: () => istVerfuegbar(m.id, ansicht.stand),
    run: () => ansicht.setzeModus(m.id),
  })));
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  cmds.unregister('ansicht');
});

const sortedDokumente = computed(() =>
  [...cde.dokumente].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)));

/** Beim ersten geladenen Modell die Struktur-Leiste anbieten. */
function onModelLoaded() {
  if (!panels.aktivLinks) panels.open('struktur');
}

/** Issue-Pin im 3D anfahren (Panel liegt außerhalb des Viewers). */
function zoomToIssue(position) {
  viewerRef.value?.zoomToPoint?.(position);
}

/**
 * Pin-Setz-Modus des Viewers vom Issues-Panel aus schalten.
 *
 * Gelesen wird direkt aus dem Viewer — KEINE eigene Kopie danebenlegen.
 * Der Modus endet auch ohne diesen Knopf (Esc, oder von selbst, sobald ein Pin
 * gesetzt ist); eine gespiegelte Variable liefe dann auseinander und der Knopf
 * zeigte weiter „Aktiv".
 */
const annotationActive = computed(() => viewerRef.value?.annotationActive ?? false);
function onToggleIssueMode() {
  viewerRef.value?.toggleAnnotationMode?.();
}

function onClose() {
  router.push('/tools');
}

/**
 * Modellsatz wechseln.
 *
 * Der Wechsel lädt DAS JOURNAL des Satzes nach — danach gilt ein anderer
 * wirksamer Stand. Anschliessend läuft das Nachspielen erneut; genau das ist
 * der Variantenwechsel, und es braucht dafür keinen eigenen Mechanismus.
 */
async function onSatzChange(e) {
  await cde.setzeSatz(e.target.value || null);
  await aenderungen.setzeSatz(cde.aktiverSatzId);
  showRegister.value = false;
}

/** Einen Modellsatz anlegen — er übernimmt die Auswahl des aktuellen. */
async function onNeuerSatz() {
  const name = prompt('Name des Modellsatzes (z. B. „Variante Nord"):', '');
  if (name === null || !name.trim()) return;
  try {
    // Wie `git branch`: der neue Satz startet mit dem, was gerade gilt.
    await cde.satzAnlegen({ name: name.trim(), enthaelt: cde.aktiverSatz?.enthaelt ?? [] });
    await aenderungen.setzeSatz(cde.aktiverSatzId);
  } catch (fehler) {
    alert(fehler?.response?.data?.detail || fehler?.message || 'Modellsatz konnte nicht angelegt werden.');
  }
}

async function onSatzUmbenennen() {
  const s = cde.aktiverSatz;
  if (!s) return;
  const name = prompt('Neuer Name:', s.name);
  if (name === null || !name.trim()) return;
  try { await cde.satzAendern(s.id, { name: name.trim() }); }
  catch (fehler) { alert(fehler?.response?.data?.detail || 'Umbenennen fehlgeschlagen.'); }
}

/**
 * Einen Modellsatz löschen.
 *
 * Die DATEIEN bleiben — sie gehören dem Auftrag, nicht dem Satz. Das steht
 * ausdrücklich in der Rückfrage, sonst klingt „löschen" nach mehr, als es ist.
 */
async function onSatzLoeschen() {
  const s = cde.aktiverSatz;
  if (!s) return;
  if (!confirm(`Modellsatz „${s.name}" löschen?\nDie Modelle selbst bleiben im Projekt — ein Satz ist nur eine Auswahl.`)) return;
  await cde.satzLoeschen(s.id);
  await aenderungen.setzeSatz(cde.aktiverSatzId);
  showRegister.value = false;
}

/** Ein Modell in den aktiven Satz aufnehmen oder herausnehmen. */
async function satzUmschalten(sha256) {
  const s = cde.aktiverSatz;
  if (!s) return;
  const drin = (s.enthaelt ?? []).includes(sha256);
  const neu = drin ? s.enthaelt.filter(x => x !== sha256) : [...(s.enthaelt ?? []), sha256];
  try {
    await cde.satzAendern(s.id, { enthaelt: neu });
  } catch (fehler) {
    // Der Server lehnt zwei Revisionen desselben Modells ab. Das ist keine
    // Panne, sondern die Invariante — sie gehört im Klartext gezeigt.
    alert(fehler?.response?.data?.detail || 'Das geht in diesem Satz nicht.');
  }
}

/** Zu einem anderen Auftrag wechseln — über die URL, nicht im laufenden Betrieb. */
function onAuftragWaehlen(id) {
  if (!id) return;
  // `repo.setBackend` läuft beim Aufbau der Ansicht. Es hier im Betrieb zu
  // tauschen wäre ein zweiter Weg zum selben Zustand — und die Stores haben
  // bereits gelesen. Deshalb neu laden.
  window.location.href = `/cde?projekt=${id}`;
}

function openDokument(d) {
  viewerRef.value?.openBySha(d.sha256);
}

function statusTitle(d) {
  const h = d.statusHistorie ?? [];
  return h.map(e => `${e.status} — ${e.von}, ${fmtDate(e.am)}`).join('\n');
}

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '–';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(ts) {
  if (!ts) return '–';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
</script>

<style scoped>
/* Werkzeuge am Lageplan — schweben über der Zeichenfläche, links oben. */
.plan-werkzeuge {
  position: absolute;
  top: 0.6rem; left: 0.6rem;
  display: flex; gap: 0.25rem;
  z-index: var(--cde-z-hud);
}
.plan-wz {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.32rem 0.42rem;
  background: var(--cde-float);
  border: 1px solid var(--cde-line-strong);
  border-radius: var(--cde-radius-sm);
  box-shadow: var(--cde-shadow-float);
  color: var(--cde-text-soft);
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.plan-wz:hover { background: var(--cde-fill-hover); color: var(--cde-text-bright); }
.plan-wz.aktiv {
  background: var(--cde-accent-fill-hi);
  border-color: var(--cde-accent-line);
  color: var(--cde-accent);
}
.plan-wz-zahl { font-size: 0.66rem; font-variant-numeric: tabular-nums; }
.plan-wz-sym {
  display: inline-block; width: 14px; text-align: center;
  font-size: 0.76rem; font-weight: 700; line-height: 1;
}
.plan-wz.farbe {
  width: 1.5rem; padding: 0.32rem 0;
  justify-content: center;
}
.plan-wz.farbe::after {
  content: ''; width: 11px; height: 11px; border-radius: 50%;
  background: var(--farbe);
  box-shadow: 0 0 0 1px var(--cde-line-strong);
}
.plan-wz.farbe.aktiv::after { box-shadow: 0 0 0 2px var(--cde-text-bright); }

.plan-wz-trenner {
  width: 1px; align-self: stretch; margin: 0 0.15rem;
  background: var(--cde-line-strong);
}

.cde-view {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--cde-bg-deep);
}

/* ── Projekt-Leiste ── */
.cde-bar {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: var(--cde-bg-alt);
  border-bottom: 1px solid var(--cde-tint);
  flex-shrink: 0;
}
.cde-brand { color: var(--cde-text-bright); font-weight: 700; font-size: 0.9rem; letter-spacing: 0.02em; }
.cde-spacer { flex: 1; }

.cde-project-select {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text-bright);
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
  font-size: 0.78rem;
  min-width: 200px; max-width: 320px;
}

.cde-btn {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text);
  border-radius: 5px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.cde-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cde-accent) 20%, transparent); color: var(--cde-text-bright); }
.cde-btn.active { background: color-mix(in srgb, var(--cde-accent) 30%, transparent); border-color: color-mix(in srgb, var(--cde-accent) 60%, transparent); color: var(--cde-accent-soft); }
.cde-btn:disabled { opacity: 0.4; cursor: default; }
.cde-btn.danger:hover { background: color-mix(in srgb, var(--cde-danger) 20%, transparent); color: var(--cde-danger-soft); border-color: color-mix(in srgb, var(--cde-danger) 50%, transparent); }
.cde-btn.sm { padding: 0.1rem 0.35rem; font-size: 0.7rem; }
.cde-btn small { color: var(--cde-text-dim); }

.cde-bearbeiter {
  display: flex; align-items: center; gap: 0.3rem;
  color: var(--cde-text-dim); font-size: 0.8rem;
}
.cde-bearbeiter input {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text-bright);
  border-radius: 5px;
  padding: 0.22rem 0.4rem;
  font-size: 0.75rem;
  width: 130px;
}

/* ── Panels (Stammdaten / Register) ── */
.cde-panel {
  background: var(--cde-bg);
  border-bottom: 1px solid var(--cde-tint);
  padding: 0.6rem 0.8rem;
  flex-shrink: 0;
  max-height: 40vh;
  overflow-y: auto;
}
.cde-panel-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
  gap: 0.5rem;
}
.cde-panel-grid label {
  display: flex; flex-direction: column; gap: 0.15rem;
  color: var(--cde-text-dim); font-size: 0.68rem;
}
.cde-panel-grid label.wide { grid-column: span 2; }
.cde-panel-grid input, .cde-panel-grid select {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-max);
  color: var(--cde-text-bright);
  border-radius: 4px;
  padding: 0.25rem 0.4rem;
  font-size: 0.76rem;
}
.cde-panel-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 0.5rem;
}
.cde-hint { color: var(--cde-text-faint); font-size: 0.66rem; font-style: italic; }
.cde-empty { color: var(--cde-text-dim); font-size: 0.75rem; padding: 0.4rem; }

/* ── Dokument-Register ── */
.cde-doc-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; color: var(--cde-text); }
.cde-doc-table th {
  text-align: left; color: var(--cde-text-dim); font-weight: 500;
  padding: 0.25rem 0.4rem;
  border-bottom: 1px solid var(--cde-tint-strong);
}
.cde-doc-table td { padding: 0.25rem 0.4rem; border-bottom: 1px solid var(--cde-tint-weak); }
.doc-name { color: var(--cde-text-bright); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-rev, .doc-size, .doc-date { font-variant-numeric: tabular-nums; color: var(--cde-text-dim); }
.doc-actions { display: flex; gap: 0.25rem; }

.doc-status {
  border-radius: 4px;
  padding: 0.12rem 0.3rem;
  font-size: 0.7rem;
  border: 1px solid;
  background: var(--cde-sunken);
}
.doc-status.iso-wip       { color: var(--cde-warn-soft); border-color: color-mix(in srgb, var(--cde-warn) 50%, transparent); }
.doc-status.iso-shared    { color: var(--cde-accent-soft); border-color: color-mix(in srgb, var(--cde-accent) 50%, transparent); }
.doc-status.iso-published { color: var(--cde-success); border-color: color-mix(in srgb, var(--cde-success-strong) 50%, transparent); }
.doc-status.iso-archived  { color: var(--cde-text-dim); border-color: color-mix(in srgb, var(--cde-text-invert) 20%, transparent); }

/* ── Viewer-Host ── */
.cde-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

.cde-viewer-host {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* Beide Ansichten liegen deckungsgleich im selben Stapel. Der 3D-Viewer wird
   nur unsichtbar geschaltet, damit seine Canvas ihre Größe behält — mit
   `display:none` käme er schwarz zurück (siehe Kommentar im Template). */
.cp-head-btn {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  background: none; border: none; border-radius: var(--cde-radius-sm);
  color: var(--cde-text-mute); cursor: pointer;
}
.cp-head-btn:hover { background: var(--cde-fill-hover); color: var(--cde-accent); }

.host-lage { position: absolute; inset: 0; }
.host-lage.verborgen { visibility: hidden; pointer-events: none; }

.cde-ansicht-schalter {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--cde-fill);
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius);
}
.cde-ansicht-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 8px;
  background: none; border: none;
  border-radius: var(--cde-radius-sm);
  color: var(--cde-text-dim);
  font-size: var(--cde-font-xs);
  cursor: pointer;
  white-space: nowrap;
}
.cde-ansicht-btn:hover:not(:disabled) { background: var(--cde-fill-hover); color: var(--cde-text); }
.cde-ansicht-btn.active {
  background: var(--cde-accent-fill-hi);
  color: var(--cde-accent);
}
.cde-ansicht-btn:disabled { opacity: 0.4; cursor: default; }

.cde-sep {
  width: 1px; height: 1.3rem;
  background: var(--cde-line-strong);
  margin: 0 0.15rem;
}
.cde-btn.ghost { padding: 0.25rem 0.4rem; }

/* ── Auftragswahl und Auftragsanzeige (Stufe 11.3) ──────────────────────── */
.cde-auftrag {
  font-size: var(--cde-font-sm);
  color: var(--cde-text-bright);
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--cde-line);
  border-radius: var(--cde-radius-sm);
  background: var(--cde-fill);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 26ch;
}
.cde-auftragswahl { max-width: 46rem; }
.cde-auftragswahl h2 {
  margin: 0 0 0.3rem; font-size: var(--cde-font-md); color: var(--cde-text-bright);
}
.cde-fehler { color: var(--cde-danger); font-size: var(--cde-font-sm); margin: 0.4rem 0; }
.cde-auftragsliste {
  list-style: none; padding: 0; margin: 0.6rem 0 0;
  display: flex; flex-direction: column; gap: 0.2rem;
  max-height: 22rem; overflow-y: auto;
}
.cde-auftrag-knopf {
  width: 100%; display: flex; align-items: baseline; gap: 0.6rem;
  padding: 0.35rem 0.5rem; text-align: left; cursor: pointer;
  background: var(--cde-fill); color: var(--cde-text);
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  font-size: var(--cde-font-sm);
}
.cde-auftrag-knopf:hover:not(:disabled) { background: var(--cde-accent-fill-hi); color: var(--cde-accent); }
.cde-auftrag-knopf:disabled { opacity: 0.45; cursor: not-allowed; }
.cde-auftrag-knopf .nr { font-variant-numeric: tabular-nums; color: var(--cde-text-dim); min-width: 4ch; }
.cde-auftrag-knopf .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-satz { width: 2.4rem; text-align: center; }
.doc-satz input { accent-color: var(--cde-accent); cursor: pointer; }
.cde-migration {
  display: flex; align-items: center; gap: 0.5rem;
  border-left: 3px solid var(--cde-accent);
  font-size: var(--cde-font-sm); color: var(--cde-text);
}
.bf-gruppe {
  margin-left: 0.2rem; padding: 0 0.25rem;
  border: 1px solid var(--cde-line); border-radius: var(--cde-radius-sm);
  color: var(--cde-accent); font-size: var(--cde-font-xs); cursor: help;
}
</style>
