<template>
  <div class="cde-view">
    <!-- ── Projekt-Leiste (Managen) ── -->
    <div class="cde-bar">
      <span class="cde-brand">🗂 CDE</span>

      <select class="cde-project-select" :value="cde.activeProjectId ?? ''" @change="onProjectChange">
        <option value="">— kein Projekt —</option>
        <option v-for="p in cde.projects" :key="p.id" :value="p.id">
          {{ p.nummer ? p.nummer + ' — ' : '' }}{{ p.name || '(ohne Namen)' }}
        </option>
      </select>

      <button class="cde-btn" @click="onNewProject" title="Neues Projekt anlegen">＋ Projekt</button>
      <button
        class="cde-btn"
        :disabled="!cde.activeProject"
        :class="{ active: showStammdaten }"
        @click="showStammdaten = !showStammdaten; showRegister = false"
        title="Projekt-Stammdaten"
      >⚙ Stammdaten</button>
      <button
        class="cde-btn"
        :disabled="!cde.activeProject"
        :class="{ active: showRegister }"
        @click="showRegister = !showRegister; showStammdaten = false"
        title="Dokument-Register (ISO-19650-Status)"
      >📚 Dokumente <small v-if="cde.dokumente.length">({{ cde.dokumente.length }})</small></button>

      <span class="cde-spacer" />

      <label class="cde-bearbeiter" title="Bearbeiter-Name — Autor für Issues, Kommentare und Statuswechsel">
        👤
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
              <button class="cde-btn sm" @click="openDokument(d)" title="Modell öffnen">▶</button>
              <button class="cde-btn sm danger" @click="cde.removeDokument(d.sha256)" title="Aus Register entfernen">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── Viewer ── -->
    <div class="cde-viewer-host">
      <IfcViewer
        ref="viewerRef"
        standalone
        :propertiesOpen="showProps"
        @close="onClose"
        @open-properties="showProps = true"
        @model-loaded="showSpatialTree = true"
      />
      <IfcSemanticWindow
        v-if="showProps"
        @close="showProps = false"
      />
      <IfcSpatialWindow
        v-if="showSpatialTree"
        @close="showSpatialTree = false"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import IfcViewer from '../components/IfcViewer.vue';
import IfcSemanticWindow from '../components/IfcSemanticWindow.vue';
import IfcSpatialWindow from '../components/IfcSpatialWindow.vue';
import { useCdeStore, ISO_STATUS } from '../stores/useCdeStore.js';

const router = useRouter();
const cde = useCdeStore();

const viewerRef = ref(null);
const showProps = ref(false);
const showSpatialTree = ref(false);
const showStammdaten = ref(false);
const showRegister = ref(false);

const sortedDokumente = computed(() =>
  [...cde.dokumente].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)));

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
  background: #1a1d29;
}

/* ── Projekt-Leiste ── */
.cde-bar {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: #232738;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.cde-brand { color: #eceff1; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.02em; }
.cde-spacer { flex: 1; }

.cde-project-select {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #eceff1;
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
  font-size: 0.78rem;
  min-width: 200px; max-width: 320px;
}

.cde-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #cfd8dc;
  border-radius: 5px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
.cde-btn:hover:not(:disabled) { background: rgba(52,152,219,0.2); color: #fff; }
.cde-btn.active { background: rgba(52,152,219,0.3); border-color: rgba(52,152,219,0.6); color: #90caf9; }
.cde-btn:disabled { opacity: 0.4; cursor: default; }
.cde-btn.danger:hover { background: rgba(239,83,80,0.2); color: #ef9a9a; border-color: rgba(239,83,80,0.5); }
.cde-btn.sm { padding: 0.1rem 0.35rem; font-size: 0.7rem; }
.cde-btn small { color: #90a4ae; }

.cde-bearbeiter {
  display: flex; align-items: center; gap: 0.3rem;
  color: #90a4ae; font-size: 0.8rem;
}
.cde-bearbeiter input {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #eceff1;
  border-radius: 5px;
  padding: 0.22rem 0.4rem;
  font-size: 0.75rem;
  width: 130px;
}

/* ── Panels (Stammdaten / Register) ── */
.cde-panel {
  background: #202433;
  border-bottom: 1px solid rgba(255,255,255,0.08);
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
  color: #90a4ae; font-size: 0.68rem;
}
.cde-panel-grid label.wide { grid-column: span 2; }
.cde-panel-grid input, .cde-panel-grid select {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  color: #eceff1;
  border-radius: 4px;
  padding: 0.25rem 0.4rem;
  font-size: 0.76rem;
}
.cde-panel-footer {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 0.5rem;
}
.cde-hint { color: #607d8b; font-size: 0.66rem; font-style: italic; }
.cde-empty { color: #90a4ae; font-size: 0.75rem; padding: 0.4rem; }

/* ── Dokument-Register ── */
.cde-doc-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; color: #cfd8dc; }
.cde-doc-table th {
  text-align: left; color: #90a4ae; font-weight: 500;
  padding: 0.25rem 0.4rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.cde-doc-table td { padding: 0.25rem 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
.doc-name { color: #eceff1; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-rev, .doc-size, .doc-date { font-variant-numeric: tabular-nums; color: #90a4ae; }
.doc-actions { display: flex; gap: 0.25rem; }

.doc-status {
  border-radius: 4px;
  padding: 0.12rem 0.3rem;
  font-size: 0.7rem;
  border: 1px solid;
  background: rgba(0,0,0,0.2);
}
.doc-status.iso-wip       { color: #ffcc80; border-color: rgba(255,183,77,0.5); }
.doc-status.iso-shared    { color: #90caf9; border-color: rgba(66,165,245,0.5); }
.doc-status.iso-published { color: #a5d6a7; border-color: rgba(129,199,132,0.5); }
.doc-status.iso-archived  { color: #90a4ae; border-color: rgba(255,255,255,0.2); }

/* ── Viewer-Host ── */
.cde-viewer-host {
  position: relative;
  flex: 1;
  min-height: 0;
}
</style>
