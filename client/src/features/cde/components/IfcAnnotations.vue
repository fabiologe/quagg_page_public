<template>
  <div class="ann-panel">
    <div class="ann-header">
      <span class="ann-title">
        <CdeIcon name="issues" :size="15" />
        Notizen <small v-if="ifc.annotations.length">({{ openCount }} offen)</small>
      </span>
      <div class="ann-header-actions">
        <button
          class="ann-mode-btn"
          :class="{ active: annotationActive }"
          @click="$emit('toggle-mode')"
          :title="annotationActive ? 'Pin-Modus beenden' : 'Notiz anlegen — dann auf das Modell klicken'"
        >
          <CdeIcon :name="annotationActive ? 'check' : 'add'" :size="12" />
          {{ annotationActive ? 'Aktiv' : 'Neu' }}
        </button>
        <button
          v-if="ifc.annotations.length"
          class="ann-export-btn"
          @click="onBcfExport"
          title="Als BCF 3.0 exportieren (.bcfzip) — für BIMcollab, Solibri, Revit…"
        ><CdeIcon name="download" :size="12" /> BCF</button>
        <label class="ann-import-btn" title="BCF importieren (.bcfzip)">
          <CdeIcon name="upload" :size="12" /> BCF
          <input type="file" accept=".bcf,.bcfzip,application/zip" @change="onBcfImport" class="sr-only" />
        </label>
        <button
          v-if="ifc.annotations.length"
          class="ann-export-btn"
          @click="onExport"
          title="Als JSON exportieren"
          aria-label="Als JSON exportieren"
        ><CdeIcon name="download" :size="12" /></button>
        <label class="ann-import-btn" title="JSON importieren">
          <CdeIcon name="upload" :size="12" />
          <input type="file" accept="application/json,.json" @change="onImport" class="sr-only" />
        </label>
        <button
          v-if="ifc.annotations.length"
          class="ann-clear-btn"
          @click="onClearAll"
          title="Alle löschen"
          aria-label="Alle Notizen löschen"
        ><CdeIcon name="delete" :size="12" /></button>
      </div>
    </div>

    <!-- Status-Filter -->
    <div v-if="ifc.annotations.length" class="ann-filter-row">
      <button
        v-for="f in FILTERS"
        :key="f.id"
        class="ann-filter-chip"
        :class="{ active: filter === f.id }"
        @click="filter = f.id"
      >{{ f.label }} <small>{{ countFor(f.id) }}</small></button>
    </div>

    <div class="ann-body">
      <div v-if="!filtered.length" class="ann-empty">
        {{ ifc.annotations.length ? 'Keine Notiz in diesem Filter.' : 'Keine Notizen' }}<br>
        <small v-if="!ifc.annotations.length">„＋ Neu" aktivieren, dann auf eine Stelle im Modell klicken.</small>
      </div>

      <div
        v-for="a in filtered"
        :key="a.id"
        class="ann-row"
        :class="`st-${a.status}`"
      >
        <span
          class="ann-idx"
          :style="{ background: a.color || '#e91e63' }"
          @click="onZoom(a)"
          title="Zum Pin zoomen"
        >#{{ a.idx }}</span>

        <div class="ann-row-body">
          <textarea
            class="ann-text"
            :value="a.text"
            @blur="onTextBlur(a, $event)"
            rows="2"
            placeholder="Text der Notiz …"
          ></textarea>

          <!-- Issue-Metadaten -->
          <div class="ann-meta-grid">
            <select
              class="ann-status"
              :class="`st-${a.status}`"
              :value="a.status"
              @change="ifc.updateAnnotation(a.id, { status: $event.target.value })"
            >
              <option value="open">offen</option>
              <option value="in-progress">in Bearbeitung</option>
              <option value="closed">geschlossen</option>
            </select>
            <input
              class="ann-assignee"
              type="text"
              :value="a.assignee"
              placeholder="Zuständig…"
              @change="ifc.updateAnnotation(a.id, { assignee: $event.target.value.trim() })"
            />
            <input
              class="ann-due"
              type="date"
              :class="{ overdue: isOverdue(a) }"
              :value="a.dueDate ?? ''"
              @change="ifc.updateAnnotation(a.id, { dueDate: $event.target.value || null })"
            />
          </div>

          <div class="ann-info-line">
            <span v-if="a.author">von {{ a.author }}</span>
            <span v-if="a.createdAt">· {{ fmtDate(a.createdAt) }}</span>
            <span class="ann-vp-actions">
              <button
                v-if="a.viewpoint"
                class="ann-vp-btn"
                @click="props.applyViewpoint?.(a.viewpoint)"
                title="Gespeicherte Ansicht (Kamera/Sichtbarkeit/Schnitt) wiederherstellen"
              ><CdeIcon name="snapshot" :size="11" /> Ansicht</button>
              <button
                class="ann-vp-btn dim"
                @click="onUpdateViewpoint(a)"
                title="Aktuelle Ansicht als Viewpoint speichern"
                aria-label="Aktuelle Ansicht als Viewpoint speichern"
              ><CdeIcon name="refresh" :size="11" /></button>
            </span>
          </div>

          <!-- Kommentar-Thread -->
          <div v-if="a.comments.length || commentOpen.has(a.id)" class="ann-comments">
            <div v-for="(c, i) in a.comments" :key="i" class="ann-comment">
              <span class="ann-comment-meta">{{ c.author || '—' }} · {{ fmtDate(c.createdAt) }}</span>
              <span class="ann-comment-text">{{ c.text }}</span>
            </div>
            <div v-if="commentOpen.has(a.id)" class="ann-comment-input-row">
              <input
                class="ann-comment-input"
                type="text"
                v-model="commentDrafts[a.id]"
                placeholder="Kommentar…"
                @keydown.enter="submitComment(a)"
              />
              <button class="ann-comment-send" @click="submitComment(a)" title="Kommentar senden" aria-label="Kommentar senden">
                <CdeIcon name="send" :size="13" />
              </button>
            </div>
          </div>
          <div class="ann-row-footer">
            <button class="ann-link-btn" @click="toggleComment(a.id)">
              <CdeIcon name="issues" :size="11" />
              {{ a.comments.length || '' }} {{ commentOpen.has(a.id) ? 'schließen' : 'Kommentar' }}
            </button>
            <div class="ann-color-picker">
              <button
                v-for="c in COLOR_PRESETS"
                :key="c"
                class="ann-color-swatch"
                :class="{ active: (a.color || '#e91e63') === c }"
                :style="{ background: c }"
                @click="onColorPick(a, c)"
              ></button>
            </div>
          </div>
        </div>

        <button class="ann-del" @click="onDelete(a)" title="Löschen" aria-label="Notiz löschen">
          <CdeIcon name="delete" :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue';
import { useIfcStore } from '../stores/useIfcStore.js';
import CdeIcon from './ui/CdeIcon.vue';
import { useCdeStore } from '../stores/useCdeStore.js';
import { exportBcf, importBcf } from '../services/BcfService.js';

const props = defineProps({
  annotationActive: { type: Boolean, default: false },
  zoomToPoint:      { type: Function, default: null }, // ([x,y,z]) => void
  applyViewpoint:   { type: Function, default: null }, // (viewpoint) => Promise
  captureViewpoint: { type: Function, default: null }, // () => viewpoint|null
});
defineEmits(['toggle-mode']);

const ifc = useIfcStore();
const cde = useCdeStore();

// 6 distinct, print-friendly colors
const COLOR_PRESETS = [
  '#e91e63', // pink (default)
  '#ef5350', // red
  '#fb8c00', // orange
  '#fdd835', // yellow
  '#43a047', // green
  '#1e88e5', // blue
  '#8e24aa', // purple
];

const FILTERS = [
  { id: 'all',         label: 'Alle' },
  { id: 'open',        label: 'Offen' },
  { id: 'in-progress', label: 'In Arbeit' },
  { id: 'closed',      label: 'Erledigt' },
];
const filter = ref('all');

const filtered = computed(() =>
  filter.value === 'all'
    ? ifc.annotations
    : ifc.annotations.filter(a => a.status === filter.value));

const openCount = computed(() => ifc.annotations.filter(a => a.status !== 'closed').length);
function countFor(f) {
  return f === 'all' ? ifc.annotations.length : ifc.annotations.filter(a => a.status === f).length;
}

function isOverdue(a) {
  return a.dueDate && a.status !== 'closed' && new Date(a.dueDate) < new Date();
}
function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Kommentare ──────────────────────────────────────────────────────────────
const commentOpen = reactive(new Set());
const commentDrafts = reactive({});

function toggleComment(id) {
  if (commentOpen.has(id)) commentOpen.delete(id);
  else commentOpen.add(id);
}
function submitComment(a) {
  const text = (commentDrafts[a.id] ?? '').trim();
  if (!text) return;
  ifc.addAnnotationComment(a.id, { author: cde.bearbeiter || '', text });
  commentDrafts[a.id] = '';
}

// ── Basis-Aktionen ──────────────────────────────────────────────────────────
function onZoom(a)          { props.zoomToPoint?.(a.position); }
function onColorPick(a, c)  { ifc.updateAnnotationColor(a.id, c); }
function onTextBlur(a, e) {
  const newText = e.target.value;
  if (newText !== a.text) ifc.updateAnnotationText(a.id, newText);
}
function onDelete(a)        { ifc.removeAnnotation(a.id); }
function onClearAll() {
  const n = ifc.annotations.length;
  if (confirm(n === 1 ? 'Die Notiz löschen?' : `Alle ${n} Notizen löschen?`)) {
    ifc.clearAnnotations();
  }
}
function onUpdateViewpoint(a) {
  const vp = props.captureViewpoint?.();
  if (vp) ifc.updateAnnotation(a.id, { viewpoint: vp });
}

// ── JSON-Export/-Import (Eigenformat, bleibt als Zweitweg) ──────────────────
function onExport() {
  const blob = ifc.exportAnnotationsJSON();
  _download(blob, `issues-${new Date().toISOString().slice(0, 10)}.json`);
}
function onImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const ok = ifc.importAnnotationsJSON(reader.result);
    if (!ok) alert('Import fehlgeschlagen — ungültige JSON-Datei.');
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ── BCF 3.0 (.bcfzip) ───────────────────────────────────────────────────────
async function onBcfExport() {
  try {
    const blob = await exportBcf(ifc.annotations, {
      projectName: cde.auftrag?.name || 'Projekt',
      author: cde.bearbeiter || 'quagg-cde',
    });
    _download(blob, `issues-${new Date().toISOString().slice(0, 10)}.bcfzip`);
  } catch (err) {
    console.error('BCF export error:', err);
    alert('BCF-Export fehlgeschlagen.');
  }
}
async function onBcfImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const issues = await importBcf(await file.arrayBuffer());
    if (!issues.length) { alert('Keine Topics in der BCF-Datei gefunden.'); return; }
    let merged = 0, added = 0;
    for (const issue of issues) {
      // Merge per BCF-Guid: bestehendes Issue aktualisieren (Kommentare/Status),
      // Unbekanntes neu anlegen — so überlebt ein Roundtrip Externe → wir.
      const existing = ifc.annotations.find(a => a.bcfGuid === issue.bcfGuid);
      if (existing) {
        ifc.updateAnnotation(existing.id, {
          status: issue.status ?? existing.status,
          assignee: issue.assignee || existing.assignee,
          dueDate: issue.dueDate ?? existing.dueDate,
        });
        for (const c of issue.comments) {
          const dupe = existing.comments.some(ec => ec.text === c.text && ec.author === c.author);
          if (!dupe) ifc.addAnnotationComment(existing.id, c);
        }
        merged++;
      } else {
        ifc.pushAnnotation(issue);
        added++;
      }
    }
    alert(`BCF importiert: ${added} neu, ${merged} aktualisiert.`);
  } catch (err) {
    console.error('BCF import error:', err);
    alert('BCF-Import fehlgeschlagen — Datei nicht lesbar.');
  } finally {
    e.target.value = '';
  }
}

function _download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.ann-panel {
  width: 100%;
  display: flex; flex-direction: column;
  background: var(--cde-surface);
}

.ann-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.55rem 0.75rem;
  background: var(--cde-surface-raised);
  border-bottom: 1px solid var(--cde-tint);
  flex-shrink: 0;
}
.ann-title {
  display: flex; align-items: center; gap: 0.35rem;
  font-size: 0.78rem; font-weight: 600; color: var(--cde-issue-soft);
}
.ann-title small { color: var(--cde-text-dim); font-weight: 400; }
.ann-header-actions { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.ann-mode-btn {
  display: inline-flex; align-items: center; gap: 0.25rem;
  background: color-mix(in srgb, var(--cde-issue) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-issue) 40%, transparent);
  color: var(--cde-issue-soft);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem; cursor: pointer;
  transition: background 0.15s;
}
.ann-mode-btn:hover  { background: color-mix(in srgb, var(--cde-issue) 25%, transparent); }
.ann-mode-btn.active {
  background: var(--cde-issue); color: var(--cde-text-invert);
  border-color: var(--cde-issue);
}
.ann-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--cde-tint-strong);
  color: var(--cde-text-mute); padding: 0.2rem 0.4rem;
  border-radius: 4px; cursor: pointer; font-size: 0.7rem;
}
.ann-clear-btn:hover { background: var(--cde-danger-fill); color: var(--cde-danger); border-color: color-mix(in srgb, var(--cde-danger) 40%, transparent); }

.ann-filter-row {
  display: flex; gap: 0.25rem;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--cde-tint-weak);
}
.ann-filter-chip {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-strong);
  color: var(--cde-text-dim);
  padding: 0.12rem 0.45rem;
  border-radius: 10px;
  font-size: 0.66rem; cursor: pointer;
}
.ann-filter-chip small { color: var(--cde-text-faint); }
.ann-filter-chip.active { background: color-mix(in srgb, var(--cde-issue) 20%, transparent); color: var(--cde-issue-soft); border-color: color-mix(in srgb, var(--cde-issue) 45%, transparent); }

.ann-body {
  flex: 1; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--cde-tint-max) transparent;
}

.ann-empty {
  padding: 1.2rem 0.8rem;
  color: var(--cde-text-dimmer); font-size: 0.72rem; text-align: center;
  line-height: 1.6;
}
.ann-empty small { color: var(--cde-text-dimmer); font-size: 0.65rem; }

.ann-row {
  display: grid;
  grid-template-columns: 30px 1fr 20px;
  gap: 0.4rem; align-items: flex-start;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--cde-tint-weak);
}
.ann-row.st-closed { opacity: 0.55; }
.ann-idx {
  display: inline-flex; justify-content: center; align-items: center;
  width: 26px; height: 26px;
  border-radius: 50%;
  background: var(--cde-issue); color: var(--cde-text-invert);
  font-size: 0.7rem; font-weight: 700; font-variant-numeric: tabular-nums;
  cursor: pointer; flex-shrink: 0;
  transition: transform 0.1s;
}
.ann-idx:hover { transform: scale(1.1); }

.ann-row-body { display: flex; flex-direction: column; gap: 0.3rem; }
.ann-text {
  font-family: inherit;
  font-size: 0.74rem; color: var(--cde-text);
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint);
  border-radius: 4px;
  padding: 0.3rem 0.4rem;
  resize: vertical;
  min-height: 36px;
  width: 100%; box-sizing: border-box;
}
.ann-text:focus { outline: none; border-color: color-mix(in srgb, var(--cde-issue) 40%, transparent); }

.ann-meta-grid {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.3rem;
}
.ann-status, .ann-assignee, .ann-due {
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-strong);
  color: var(--cde-text);
  border-radius: 4px;
  font-size: 0.68rem;
  padding: 0.15rem 0.3rem;
}
.ann-status.st-open        { color: var(--cde-danger-soft); border-color: color-mix(in srgb, var(--cde-danger) 35%, transparent); }
.ann-status.st-in-progress { color: var(--cde-warn-soft); border-color: color-mix(in srgb, var(--cde-warn) 35%, transparent); }
.ann-status.st-closed      { color: var(--cde-success); border-color: color-mix(in srgb, var(--cde-success-strong) 35%, transparent); }
.ann-due.overdue { color: var(--cde-danger); border-color: color-mix(in srgb, var(--cde-danger) 60%, transparent); }

.ann-info-line {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: 0.62rem; color: var(--cde-text-mute);
}
.ann-vp-actions { margin-left: auto; display: flex; gap: 0.2rem; }
.ann-vp-btn {
  display: inline-flex; align-items: center; gap: 0.2rem;
  background: var(--cde-accent-fill);
  border: 1px solid var(--cde-accent-line);
  color: var(--cde-accent-soft);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-size: 0.62rem; cursor: pointer;
}
.ann-vp-btn:hover { background: var(--cde-accent-fill-hi); }
.ann-vp-btn.dim { background: none; border-color: var(--cde-line-strong); color: var(--cde-text-mute); }

.ann-comments {
  display: flex; flex-direction: column; gap: 0.2rem;
  background: var(--cde-tint-weak);
  border-radius: 4px;
  padding: 0.3rem 0.4rem;
}
.ann-comment { display: flex; flex-direction: column; }
.ann-comment-meta { font-size: 0.6rem; color: var(--cde-text-faint); }
.ann-comment-text { font-size: 0.7rem; color: var(--cde-text-soft); white-space: pre-wrap; }
.ann-comment-input-row { display: flex; gap: 0.25rem; margin-top: 0.15rem; }
.ann-comment-input {
  flex: 1;
  background: var(--cde-tint-weak);
  border: 1px solid var(--cde-tint-strong);
  color: var(--cde-text);
  border-radius: 4px;
  font-size: 0.7rem;
  padding: 0.2rem 0.35rem;
}
.ann-comment-send {
  display: inline-flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--cde-issue) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--cde-issue) 40%, transparent);
  color: var(--cde-issue-soft);
  border-radius: var(--cde-radius-sm); cursor: pointer;
  padding: 0 0.45rem;
}
.ann-comment-send:hover { background: color-mix(in srgb, var(--cde-issue) 34%, transparent); }

.ann-row-footer { display: flex; justify-content: space-between; align-items: center; }
.ann-link-btn {
  display: inline-flex; align-items: center; gap: 0.25rem;
  background: none; border: none; color: var(--cde-text-mute);
  font-size: 0.64rem; cursor: pointer; padding: 0;
}
.ann-link-btn:hover { color: var(--cde-accent-soft); }

.ann-color-picker { display: flex; gap: 0.2rem; }
.ann-color-swatch {
  width: 12px; height: 12px;
  border-radius: 50%;
  border: 1px solid var(--cde-tint-max);
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s, border-color 0.1s;
}
.ann-color-swatch:hover { transform: scale(1.2); }
.ann-color-swatch.active {
  border-color: var(--cde-text-invert);
  box-shadow: 0 0 0 1px var(--cde-tint-max);
}

.ann-del {
  display: inline-flex; align-items: center; justify-content: center;
  align-self: flex-start;
  background: none; border: none; color: var(--cde-text-mute);
  cursor: pointer; padding: 0.15rem 0.25rem; border-radius: 3px;
}
.ann-del:hover { color: var(--cde-danger); }

.ann-export-btn,
.ann-import-btn {
  background: none; border: 1px solid var(--cde-tint-strong);
  color: var(--cde-text-mute); padding: 0.2rem 0.45rem;
  border-radius: 4px; cursor: pointer; font-size: 0.68rem;
  display: inline-flex; align-items: center;
}
.ann-export-btn:hover,
.ann-import-btn:hover { background: var(--cde-fill); color: var(--cde-text); }

/* Icon + Kürzel stehen nebeneinander in einer Zeile. */
.ann-export-btn,
.ann-import-btn { gap: 0.25rem; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
</style>
