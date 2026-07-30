<template>
  <section class="f3d-runlog">
    <article v-for="entry in entries" :key="entry.runId" class="f3d-card">
      <header class="f3d-card-head">
        <h3>{{ entry.runId }}</h3>
        <span class="f3d-chip" :class="`status-${entry.status}`">{{ entry.status }}</span>
      </header>

      <dl v-if="entry.manifest" class="f3d-stats">
        <div v-for="row in manifestRows(entry.manifest)" :key="row[0]" class="f3d-stat">
          <dt>{{ row[0] }}</dt>
          <dd :class="row[2] ?? ''">{{ row[1] }}</dd>
        </div>
      </dl>
      <p v-if="entry.manifest?.error" class="f3d-error">{{ entry.manifest.error }}</p>

      <div class="f3d-log-head">
        <span class="f3d-muted f3d-small">
          Log: {{ entry.logSource ?? '–' }}
          <template v-if="isActive(entry.status)"> · aktualisiert automatisch</template>
        </span>
      </div>
      <pre class="f3d-log">{{ entry.log || '(keine Logausgabe)' }}</pre>
    </article>
    <p v-if="!entries.length" class="f3d-muted">Keinen Lauf ausgewählt.</p>
  </section>
</template>

<script setup>
// Logansicht (Spez. Kap. 8) + Laufmanifest (Spez. 4.4): OpenFOAM-Version,
// Netzkennwerte, Kerne, Dauer, Abbruchgrund. Bei laufenden Läufen wird das
// Log des aktuellen Schritts automatisch nachgeladen.
import { onBeforeUnmount, ref, watchEffect } from 'vue'
import { flood3dApi } from '../../services/api'
import { usePostStore } from '../../stores/usePostStore'
import { fmt } from '../../utils/labels'

const store = usePostStore()
const entries = ref([])
let pollTimer = null

const ACTIVE = ['building', 'meshing', 'solving', 'extracting', 'converting_fields']
const isActive = (s) => ACTIVE.includes(s)

function manifestRows(m) {
  const rows = []
  if (m.of_image) rows.push(['Rechenumgebung', m.of_image])
  if (m.cores) rows.push(['Kerne', String(m.cores)])
  if (m.case_hash) rows.push(['casespec-Hash', m.case_hash])
  if (m.checkmesh?.cells != null) {
    rows.push(['Zellenzahl', m.checkmesh.cells.toLocaleString('de-DE')])
    rows.push(['checkMesh', m.checkmesh.checkmesh_ok ? 'in Ordnung' : 'fehlgeschlagen',
      m.checkmesh.checkmesh_ok ? 'good' : 'bad'])
    if (m.checkmesh.max_non_ortho != null) {
      rows.push(['Max. Nichtorthogonalität', `${fmt(m.checkmesh.max_non_ortho)}°`])
    }
  }
  if (m.duration_s != null) rows.push(['Dauer', `${fmt(m.duration_s / 60)} min`])
  if (m.missing_sources?.length) {
    rows.push(['Fehlende Quellen', m.missing_sources.join(', '), 'bad'])
  }
  return rows
}

async function load() {
  const ids = [...store.selectedRunIds]
  entries.value = await Promise.all(ids.map(async (runId) => {
    try {
      const [detail, logData] = await Promise.all([
        flood3dApi.runDetail(runId),
        flood3dApi.runLog(runId, 60).catch(() => ({ log: '', source: null })),
      ])
      return { runId, status: detail.status, manifest: detail.manifest,
        log: logData.log, logSource: logData.source }
    } catch (e) {
      return { runId, status: 'unbekannt', manifest: null, log: e.message }
    }
  }))
  clearInterval(pollTimer)
  if (entries.value.some((e) => isActive(e.status))) {
    pollTimer = setInterval(load, 5000)
  }
}

watchEffect(() => {
  void store.selectedRunIds.length
  load()
})

onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<style scoped>
.f3d-runlog { display: flex; flex-direction: column; gap: 16px; }
.f3d-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 4px 18px;
  margin: 0 0 10px;
}
.f3d-stat { display: flex; justify-content: space-between; gap: 10px; }
.f3d-stat dt { color: var(--f3d-text-2); font-size: 0.78rem; }
.f3d-stat dd {
  margin: 0;
  color: var(--f3d-text);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}
.f3d-stat dd.good { color: var(--f3d-good); }
.f3d-stat dd.bad { color: var(--f3d-bad); }
.f3d-log-head { margin-bottom: 4px; }
.f3d-log {
  background: var(--f3d-bg);
  border: 1px solid var(--f3d-border);
  border-radius: 6px;
  padding: 10px;
  margin: 0;
  max-height: 320px;
  overflow: auto;
  color: var(--f3d-text-2);
  font-size: 0.7rem;
  line-height: 1.45;
}
</style>
