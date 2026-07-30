<template>
  <div class="f3d-root">
    <!-- Startseite: Projektwahl über dem animierten Strömungsnetz -->
    <StartPage v-if="!store.activeCaseId" />

    <!-- Editor -->
    <template v-else>
      <header class="f3d-header">
        <div class="f3d-header-title">
          <button class="f3d-back f3d-btn-plain" title="Zur Startseite"
                  @click="store.activeCaseId = null">←</button>
          <span class="f3d-brand">≋ flood-3D</span>
          <h1>{{ store.spec?.meta?.title || store.activeCaseId }}</h1>
          <span class="f3d-muted f3d-small">{{ store.activeCaseId }}</span>
          <span v-if="store.dirty" class="f3d-chip">ungespeichert</span>
        </div>

        <!-- Workflow-Phasen: der Fall wandert von links nach rechts -->
        <nav class="f3d-tabs">
          <button class="f3d-tab" :class="{ active: store.activePhase === 'modell' }"
                  @click="store.activePhase = 'modell'">Modell</button>
          <button class="f3d-tab" :class="{ active: store.activePhase === 'simulation' }"
                  @click="store.activePhase = 'simulation'">Simulation</button>
          <button class="f3d-tab" :class="{ active: store.activePhase === 'laeufe' }"
                  @click="store.activePhase = 'laeufe'; store.loadCaseRuns()">
            Läufe
            <span v-if="activeRunCount" class="f3d-tab-badge">{{ activeRunCount }}</span>
          </button>
          <button class="f3d-tab" :class="{ active: store.activePhase === 'ergebnis' }"
                  @click="store.activePhase = 'ergebnis'">Ergebnis</button>
        </nav>

        <div class="f3d-header-actions">
          <button class="f3d-btn" :disabled="!store.canUndo"
                  title="Rückgängig (Strg+Z)" @click="store.undoEdit()">↶</button>
          <button class="f3d-btn" :disabled="!store.canRedo"
                  title="Wiederherstellen (Strg+Shift+Z)" @click="store.redoEdit()">↷</button>
          <span v-if="store.nFehler" class="f3d-chip status-failed">
            ✗ {{ store.nFehler }} Fehler
          </span>
          <span v-if="store.nWarnungen" class="f3d-chip f3d-chip-warn">
            ⚠ {{ store.nWarnungen }}
          </span>
          <button class="f3d-btn" :disabled="store.loading"
                  @click="store.saveCase()">
            {{ store.loading ? '…' : 'Speichern + Prüfen' }}
          </button>
        </div>
      </header>

      <!-- Phase: Modell -->
      <div v-if="store.activePhase === 'modell'" class="f3d-body">
        <ObjectTreePanel class="f3d-pre-tree" />
        <main class="f3d-pre-center">
          <Editor3D class="f3d-pre-scene" />
          <SectionView />
        </main>
        <aside class="f3d-pre-side">
          <PropertyPanel />
          <ValidationPanel />
          <p v-if="store.error" class="f3d-error">{{ store.error }}</p>
        </aside>
      </div>

      <!-- Phase: Simulation -->
      <main v-else-if="store.activePhase === 'simulation'" class="f3d-content">
        <SimulationPanel />
        <p v-if="store.error" class="f3d-error">{{ store.error }}</p>
      </main>

      <!-- Phase: Ergebnis (integrierter Nachweis-Viewer, auf den Fall gefiltert) -->
      <ErgebnisPhase v-else-if="store.activePhase === 'ergebnis'" />

      <!-- Phase: Läufe -->
      <main v-else class="f3d-content">
        <CaseRunsPanel />
        <p v-if="store.error" class="f3d-error">{{ store.error }}</p>
      </main>
    </template>
  </div>
</template>

<script setup>
// PreViewer-Hauptansicht (Spez. Kap. 6, Stufe 4). Arbeitsteilung nach
// Spez. Kap. 3: das Frontend bearbeitet die casespec, die maßgebliche
// Geometrie (Gelände + Bauwerke) kommt nach jedem Speichern neu vom Server.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { usePreStore } from '../stores/usePreStore'
import { usePostStore, VIEWER_TABS } from '../stores/usePostStore'
import { usePreventPageZoom } from '../composables/usePreventPageZoom'
import '../styles/f3d-theme.css'
import CaseRunsPanel from '../components/pre/CaseRunsPanel.vue'
import Editor3D from '../components/pre/Editor3D.vue'
import ErgebnisPhase from '../components/pre/ErgebnisPhase.vue'
import StartPage from '../components/pre/StartPage.vue'
import ObjectTreePanel from '../components/pre/ObjectTreePanel.vue'
import PropertyPanel from '../components/pre/PropertyPanel.vue'
import SectionView from '../components/pre/SectionView.vue'
import SimulationPanel from '../components/pre/SimulationPanel.vue'
import ValidationPanel from '../components/pre/ValidationPanel.vue'

const store = usePreStore()
const postStore = usePostStore()
const route = useRoute()
usePreventPageZoom()

const ACTIVE_STATES = ['building', 'meshing', 'solving', 'extracting',
  'converting_fields']
const activeRunCount = computed(() =>
  store.caseRuns.filter((r) => ACTIVE_STATES.includes(r.status)).length)

// Strg+Z / Strg+Shift+Z / Strg+Y — nicht beim Tippen in Eingabefeldern
function onHistoryKeys(e) {
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      || t.tagName === 'SELECT' || t.isContentEditable)) return
  if (!store.activeCaseId) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) store.redoEdit()
    else store.undoEdit()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    store.redoEdit()
  }
}

onMounted(async () => {
  await store.loadCases()
  window.addEventListener('keydown', onHistoryKeys)

  // Deeplink ?runs=<id,id>[&tab=]: Fall aus dem Laufnamen ableiten
  // (<fall>_rNNN), öffnen und direkt in die Phase Ergebnis springen
  const runsQ = route.query.runs
  const runCase = String(runsQ || '').split(',')[0]?.match(/^(.+)_r\d+$/)?.[1]
  if (runCase && store.cases.some((c) => c.id === runCase)) {
    await store.openCase(runCase)
    store.loadCaseRuns()
    postStore.caseFilter = runCase
    await postStore.loadRuns()
    const wanted = String(runsQ).split(',')
      .filter((id) => postStore.visibleRuns.some((r) => r.run_id === id))
    if (wanted.length) postStore.selectedRunIds = wanted
    const tab = String(route.query.tab || '')
    if (VIEWER_TABS.some((t) => t.id === tab)) postStore.activeTab = tab
    store.activePhase = 'ergebnis'
    return
  }

  // Deeplink ?case=<id> öffnet den Fall direkt (Phase Modell)
  const caseId = route.query.case
  if (caseId && store.cases.some((c) => c.id === caseId)) {
    await store.openCase(caseId)
    store.loadCaseRuns()
  } else if (store.activeCaseId) {
    store.loadCaseRuns()
  }
})
onBeforeUnmount(() => window.removeEventListener('keydown', onHistoryKeys))
</script>

<style scoped>
.f3d-header-actions { display: flex; gap: 8px; align-items: center; }
.f3d-btn-plain {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
}
.f3d-chip-warn { color: #c98500; border-color: #c98500; }
.f3d-pre-tree {
  width: 250px;
  flex-shrink: 0;
  border-right: 1px solid var(--f3d-border);
}
.f3d-pre-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  min-width: 0;
  overflow-y: auto;
}
.f3d-pre-scene { flex: 1; min-height: 420px; }
.f3d-pre-side {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  border-left: 1px solid var(--f3d-border);
}
</style>
