<template>
  <section class="f3d-caseruns">
    <article class="f3d-card">
      <header class="f3d-card-head">
        <h3>Läufe dieses Falls</h3>
        <button class="f3d-btn" :disabled="store.loading"
                @click="store.loadCaseRuns()">Aktualisieren</button>
      </header>

      <p v-if="!store.caseRuns.length" class="f3d-muted">
        Noch kein Lauf — in der Phase „Simulation" einstellen und starten.
      </p>

      <div v-for="run in store.caseRuns" :key="run.run_id" class="f3d-runrow">
        <div class="f3d-runrow-main">
          <span class="f3d-runrow-id">{{ run.run_id }}</span>
          <span class="f3d-chip" :class="`status-${run.status}`">{{ run.status }}</span>
          <span v-if="run.verfallen" class="f3d-chip"
                title="Companion-Reservierung ohne Ergebnis seit über 7 Tagen — kann gelöscht werden">
            verfallen
          </span>
          <span v-if="run.n_targets" class="f3d-runrow-targets">
            <span class="ok">✓ {{ run.n_erfuellt }}</span>
            <span v-if="run.n_nicht_erfuellt" class="fail">✗ {{ run.n_nicht_erfuellt }}</span>
          </span>
        </div>
        <div class="f3d-runrow-actions">
          <button v-if="run.status === 'completed'" class="f3d-btn f3d-btn-primary"
                  @click="openResult(run.run_id, 'nachweis')">
            Ergebnis öffnen
          </button>
          <button v-else class="f3d-btn"
                  @click="openResult(run.run_id, 'lauf')">
            Log ansehen
          </button>
        </div>
      </div>
    </article>

    <p class="f3d-muted f3d-small">
      Laufvergleich: in der Phase Ergebnis mehrere Läufe anhaken —
      Diagramme überlagern die Läufe.
    </p>
  </section>
</template>

<script setup>
// Phase „Läufe": die Rechenläufe DIESES Falls mit Live-Status — nach dem
// Start landet der Nutzer hier und sieht den Fortschritt, statt den Lauf
// in einer globalen Liste suchen zu müssen.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import { usePostStore } from '../../stores/usePostStore'

const store = usePreStore()
const postStore = usePostStore()

// in die Phase Ergebnis springen, mit genau diesem Lauf im Fokus
function openResult(runId, tab) {
  postStore.caseFilter = store.activeCaseId || ''
  postStore.focusRun(runId, tab)
  store.activePhase = 'ergebnis'
}

const ACTIVE = ['building', 'meshing', 'solving', 'extracting', 'converting_fields']
const hasActive = computed(() =>
  store.caseRuns.some((r) => ACTIVE.includes(r.status)))

let pollTimer = null
watch(hasActive, (active) => {
  clearInterval(pollTimer)
  if (active) pollTimer = setInterval(() => store.loadCaseRuns(), 5000)
}, { immediate: true })

onMounted(() => store.loadCaseRuns())
onBeforeUnmount(() => clearInterval(pollTimer))
</script>

<style scoped>
.f3d-caseruns {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.f3d-runrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--f3d-border);
}
.f3d-runrow:last-child { border-bottom: none; }
.f3d-runrow-main { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.f3d-runrow-id { color: var(--f3d-text); font-weight: 600; font-size: 0.85rem; }
.f3d-runrow-targets { display: flex; gap: 6px; font-size: 0.76rem; }
.f3d-runrow-targets .ok { color: var(--f3d-good); }
.f3d-runrow-targets .fail { color: var(--f3d-bad); }
</style>
