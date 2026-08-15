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
          <!-- Sichern muss dort erreichbar sein, wo die Änderung passiert
               (Modell), nicht nur in der Phase, wo die Liste steht -->
          <button class="f3d-btn f3d-small" :disabled="store.staendeLoading"
                  title="Die aktuelle Geometrie als benannten Stand sichern"
                  @click="standSichern">💾 Stand sichern</button>
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
          <!-- Der lokale Lauf ist phasenunabhaengig sichtbar — vorher
               verschwand er mit dem Simulations-Panel und wirkte abgebrochen -->
          <button v-if="lokal.laeuft" class="f3d-chip status-lokal f3d-btn-plain"
                  title="Lokaler Lauf auf diesem PC — Details in der Phase Simulation"
                  @click="store.activePhase = 'simulation'">
            💻 lokaler Lauf<template v-if="lokal.laufend.letzteZeit != null">:
              t = {{ lokal.laufend.letzteZeit.toFixed(2) }} s</template>
            <template v-if="lokal.fortschritt != null">
              ({{ Math.round(lokal.fortschritt * 100) }} %)</template>
          </button>
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

      <!-- EIN Meldungsweg für alle vier Phasen. Vorher stand derselbe
           Fehlerblock dreimal im Markup — und in der Phase „Ergebnis"
           überhaupt nicht, dort waren Fehler unsichtbar. -->
      <MeldungsLeiste />

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
        </aside>
      </div>

      <!-- Phase: Simulation -->
      <main v-else-if="store.activePhase === 'simulation'" class="f3d-content">
        <SimulationPanel />
      </main>

      <!-- Phase: Ergebnis (integrierter Nachweis-Viewer, auf den Fall gefiltert) -->
      <ErgebnisPhase v-else-if="store.activePhase === 'ergebnis'" />

      <!-- Phase: Läufe — darunter die Geometrie-Stände: der Lauf und die
           Geometrie, mit der er gerechnet wurde, gehören zusammen -->
      <main v-else class="f3d-content">
        <CaseRunsPanel />
        <StaendePanel />
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
import { AKTIV } from '../utils/runStatus'
import '../styles/f3d-theme.css'
import MeldungsLeiste from '../components/common/MeldungsLeiste.vue'
import CaseRunsPanel from '../components/pre/CaseRunsPanel.vue'
import Editor3D from '../components/pre/Editor3D.vue'
import ErgebnisPhase from '../components/pre/ErgebnisPhase.vue'
import StartPage from '../components/pre/StartPage.vue'
import ObjectTreePanel from '../components/pre/ObjectTreePanel.vue'
import PropertyPanel from '../components/pre/PropertyPanel.vue'
import SectionView from '../components/pre/SectionView.vue'
import SimulationPanel from '../components/pre/SimulationPanel.vue'
import StaendePanel from '../components/pre/StaendePanel.vue'
import ValidationPanel from '../components/pre/ValidationPanel.vue'
import { useLocalRunStore } from '../stores/useLocalRunStore'

const store = usePreStore()
const postStore = usePostStore()
const lokal = useLocalRunStore()
const route = useRoute()
usePreventPageZoom()

const activeRunCount = computed(() =>
  store.caseRuns.filter((r) => AKTIV.includes(r.status)).length
  + (lokal.laeuft ? 1 : 0))

// Geometrie-Stand aus der Kopfleiste sichern: der Name wird gefragt,
// bevor irgendetwas passiert — ein namenloser Stand ist in einer Woche
// nicht mehr zuzuordnen.
function standSichern() {
  // Der globale Strg+Z-Handler hängt am window und darf hinter dem
  // Dialog nicht am Modell arbeiten
  store.dialogOffen = true
  let name = null
  try {
    name = window.prompt('Name für den Geometrie-Stand:',
      `Stand ${new Date().toLocaleDateString('de-DE')}`)
  } finally {
    store.dialogOffen = false
  }
  if (name && name.trim()) store.standSichern(name)
}

// Strg+Z / Strg+Shift+Z / Strg+Y — nicht beim Tippen in Eingabefeldern
function onHistoryKeys(e) {
  // Strg+Z hätte sonst hinter einem offenen Dialog Modelländerungen
  // rückgängig gemacht, die man gar nicht sieht
  if (store.dialogOffen) return
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
  // Laeuft auf dieser Maschine noch ein Companion-Job (Seite neu geladen),
  // seinen Strom uebernehmen — NICHT awaiten, das laeuft potenziell Stunden.
  lokal.anknuepfen()

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
.f3d-chip-warn { color: var(--f3d-warn); border-color: var(--f3d-warn); }
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
/* Eigenschaften und Prüfung teilten sich EINEN Scrollbereich: bei einem
   Bauwerk mit aufgeklappten Gruppen wurde das Eigenschaftspanel über
   1000 px hoch und schob die Prüfung komplett unter die Falz — samt der
   Fehler, auf die der Editor ausdrücklich verweist. Die Prüfung klebt
   jetzt am unteren Rand und bleibt erreichbar. */
.f3d-pre-side > .f3d-validation {
  position: sticky;
  bottom: 0;
  flex-shrink: 0;
  max-height: 45%;
  overflow-y: auto;
  background: var(--f3d-bg-2);
  box-shadow: 0 -8px 16px -8px rgba(0, 0, 0, 0.6);
}

/* Schmale Fenster: erst die Spalten verkleinern, dann stapeln. Die
   Regeln müssen hier stehen — die Breiten sind scoped definiert und
   schlagen jede globale Media Query. */
@media (max-width: 1280px) {
  .f3d-pre-tree { width: 210px; }
  .f3d-pre-side { width: 265px; }
}

/* Eine zweite Stufe (Stapeln unter ~1024 px) war gebaut und ist bewusst
   wieder ENTFERNT: gemessen erzeugte sie 17 neue Überlappungen, weil der
   3D-Editor mit seinen absolut positionierten Bedienleisten und der
   Canvas das Stapeln nicht ohne eigene Höhenlogik vertragen. Lieber kein
   Layout für sehr schmale Fenster als ein kaputtes — das bleibt ein
   eigener Umbau. */
</style>
