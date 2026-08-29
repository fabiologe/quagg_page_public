<template>
  <div class="cde-view">
    <!-- ── Projekt-Leiste (Managen) ── -->
    <div class="cde-bar">
      <span class="cde-brand"><CdeIcon name="cde" :size="17" /> CDE</span>

      <select class="cde-project-select" :value="cde.activeProjectId ?? ''" @change="onProjectChange">
        <option value="">— kein Projekt —</option>
        <option v-for="p in cde.projects" :key="p.id" :value="p.id">
          {{ p.nummer ? p.nummer + ' — ' : '' }}{{ p.name || '(ohne Namen)' }}
        </option>
      </select>

      <button class="cde-btn" @click="onNewProject" title="Neues Projekt anlegen">
        <CdeIcon name="add" :size="14" /> Projekt
      </button>
      <button
        class="cde-btn"
        :disabled="!cde.activeProject"
        :class="{ active: showStammdaten }"
        @click="showStammdaten = !showStammdaten; showRegister = false"
        title="Projekt-Stammdaten"
      ><CdeIcon name="stammdaten" :size="14" /> Stammdaten</button>
      <button
        class="cde-btn"
        :disabled="!cde.activeProject"
        :class="{ active: showRegister }"
        @click="showRegister = !showRegister; showStammdaten = false"
        title="Dokument-Register (ISO-19650-Status)"
      ><CdeIcon name="documents" :size="14" /> Dokumente <small v-if="cde.dokumente.length">({{ cde.dokumente.length }})</small></button>

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

    <!-- ── Stammdaten-Panel ── -->
    <div v-if="showStammdaten && cde.activeProject" class="cde-panel">
      <div class="cde-panel-grid">
        <label>Projekt-Nr.
          <input type="text" :value="cde.activeProject.nummer" placeholder="z. B. P9123"
                 @change="updateActive({ nummer: $event.target.value.trim() })" />
        </label>
        <label>Bezeichnung
          <input type="text" :value="cde.activeProject.name"
                 @change="updateActive({ name: $event.target.value.trim() })" />
        </label>
        <label>Bauherr / AG
          <input type="text" :value="cde.activeProject.bauherr"
                 @change="updateActive({ bauherr: $event.target.value.trim() })" />
        </label>
        <label>Leistungsphase
          <select :value="cde.activeProject.lph" @change="updateActive({ lph: $event.target.value })">
            <option value="">—</option>
            <option v-for="n in 9" :key="n" :value="`LPH ${n}`">LPH {{ n }}</option>
          </select>
        </label>
        <label class="wide">Notiz
          <input type="text" :value="cde.activeProject.notiz"
                 @change="updateActive({ notiz: $event.target.value })" />
        </label>
      </div>
      <div class="cde-panel-footer">
        <span class="cde-hint">Projekt-Nr. = späterer StorageBox-Ordnername (Stufe C).</span>
        <button class="cde-btn danger" @click="onDeleteProject">Projekt löschen</button>
      </div>
    </div>

    <!-- ── Dokument-Register ── -->
    <div v-if="showRegister && cde.activeProject" class="cde-panel">
      <div v-if="!cde.dokumente.length" class="cde-empty">
        Noch keine Modelle registriert — beim Laden einer IFC-Datei mit aktivem
        Projekt wird sie automatisch als <b>WIP</b> aufgenommen.
      </div>
      <table v-else class="cde-doc-table">
        <thead>
          <tr>
            <th>Dokument</th><th>Rev.</th><th>Größe</th><th>Status (ISO 19650)</th><th>Aufgenommen</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in sortedDokumente" :key="d.sha256">
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
            standalone
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
          />
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
import IfcAnnotations from '../components/IfcAnnotations.vue';
import CdeIcon from '../components/ui/CdeIcon.vue';
import CdePanel from '../components/ui/CdePanel.vue';
import { useCdeStore, ISO_STATUS } from '../stores/useCdeStore.js';
import { repo, RemoteBackend } from '../services/RepoFacade.js';
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
const cde = useCdeStore();
const panels = usePanels();
const ansicht = useAnsicht();
const ifc = useIfcStore();
const cmds = usePaletteCommands();

const viewerRef = ref(null);
const planRef = ref(null);
const strukturRef = ref(null);
const showStammdaten = ref(false);
const showRegister = ref(false);

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
const planOptionen = computed(() => ({
  styleMap:         ifc.resolvedVectorStyleMap,
  rules:            ifc.vectorRules ?? [],
  labelTemplateFor: (cat) => ifc.vectorStyles?.[cat]?.labelTemplate ?? '',
  annotations:      ifc.annotations ?? [],
  scaleBar:         true,
  showLabels:       true,
  footprints:       true,
}));

const planSchriftfeld = computed(() => ({
  projekt:      [cde.activeProject?.nummer, cde.activeProject?.name].filter(Boolean).join(' '),
  auftraggeber: cde.activeProject?.bauherr ?? '',
  bearbeiter:   cde.bearbeiter ?? '',
  massstab:     `1:${ansicht.massstab}`,
}));

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
async function projektAusCockpit() {
  const id = Number(route.query.projekt);
  if (!Number.isInteger(id) || id <= 0) return;
  try {
    const { default: api } = await import('@/services/api');
    const register = (await api.get(`/projekte/${id}/cde`)).data;
    const st = register.stammdaten || {};
    await cde.ready;
    let projekt = cde.projects.find((p) => String(p.nummer) === String(id));
    if (!projekt) {
      const neuId = await cde.createProject({ nummer: String(id), name: st.name || `Projekt ${id}`, bauherr: st.bauherr || '', lph: st.lph || '' });
      projekt = cde.projects.find((p) => p.id === neuId);
    } else if (st.name && (projekt.name !== st.name || projekt.bauherr !== (st.bauherr || ''))) {
      await cde.updateProject(projekt.id, { name: st.name, bauherr: st.bauherr || '', lph: st.lph || projekt.lph });
    }
    // setActiveProject laedt das Dokumentregister mit — bei aktivem
    // RemoteBackend aus dem Manifest des Projektordners. `register.dokumente`
    // von oben wird hier bewusst NICHT durchgereicht: es gaebe wieder zwei
    // Wege zur selben Liste, und genau daran ist sie auseinandergelaufen.
    await cde.setActiveProject(projekt.id);
    const datei = route.query.datei;
    if (datei) await viewerRef.value?.openFromProjectPath?.(String(datei));
  } catch (fehler) {
    console.warn('cde: projekt aus cockpit', fehler);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  projektAusCockpit();
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

function onProjectChange(e) {
  cde.setActiveProject(e.target.value || null);
  showStammdaten.value = false;
  showRegister.value = false;
}

async function onNewProject() {
  const nummer = prompt('Projekt-Nummer (StorageBox-Konvention, z. B. P9123):', '');
  if (nummer === null) return;
  const name = prompt('Projekt-Bezeichnung:', '');
  if (name === null) return;
  await cde.createProject({ nummer: nummer.trim(), name: name.trim() });
  showStammdaten.value = true;
}

function updateActive(patch) {
  if (cde.activeProject) cde.updateProject(cde.activeProject.id, patch);
}

async function onDeleteProject() {
  const p = cde.activeProject;
  if (!p) return;
  if (!confirm(`Projekt „${p.nummer || p.name}" samt Register und Projekt-Daten löschen?\n(IFC-Dateien in der lokalen Ablage bleiben erhalten.)`)) return;
  await cde.deleteProject(p.id);
  showStammdaten.value = false;
  showRegister.value = false;
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
</style>
