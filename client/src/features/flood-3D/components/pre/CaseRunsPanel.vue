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
          <span v-if="istLive(run)" class="f3d-muted f3d-small">
            💻 t = {{ lokal.laufend.letzteZeit ?? '…' }} s
            ({{ Math.round((lokal.fortschritt ?? 0) * 100) }} %)
          </span>
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
          <!-- Die Geometrie, mit der DIESER Lauf gerechnet wurde, als
               Stand übernehmen — der Weg zurück zu „so sah es damals aus" -->
          <button class="f3d-btn" :disabled="!run.spec_gesichert || store.staendeLoading"
                  :title="run.spec_gesichert
                    ? 'Die Geometrie dieses Laufs als Geometrie-Stand sichern'
                    : 'Dieser Lauf stammt aus der Zeit vor den Ständen — seine Geometrie wurde nicht gesichert'"
                  @click="store.laufGeometrieUebernehmen(run.run_id)">
            Geometrie als Stand
          </button>
          <button v-if="MIT_ERGEBNIS.includes(run.status)"
                  class="f3d-btn f3d-btn-primary"
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
import { computed, onMounted } from 'vue'
import { usePreStore } from '../../stores/usePreStore'
import { useLocalRunStore } from '../../stores/useLocalRunStore'
import { usePostStore } from '../../stores/usePostStore'
import { useRunPolling } from '../../composables/useRunPolling'
import { AKTIV, MIT_ERGEBNIS } from '../../utils/runStatus'

const store = usePreStore()
const lokal = useLocalRunStore()
const istLive = (run) => run.status === 'lokal'
  && lokal.laufend?.runId === run.run_id
const postStore = usePostStore()

// in die Phase Ergebnis springen, mit genau diesem Lauf im Fokus
function openResult(runId, tab) {
  postStore.caseFilter = store.activeCaseId || ''
  postStore.focusRun(runId, tab)
  store.activePhase = 'ergebnis'
}

const hasActive = computed(() =>
  store.caseRuns.some((r) => AKTIV.includes(r.status))
  // Teilstand-Importe des lokal gefahrenen Laufs sollen sichtbar nachladen
  || lokal.laeuft)

useRunPolling(hasActive, () => store.loadCaseRuns(), 5000)

onMounted(() => store.loadCaseRuns())
</script>

<style scoped>
.f3d-caseruns {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
/* .f3d-runrow* steht global in f3d-theme.css — die Zeile teilt sich das
   Aussehen mit der Stände-Liste. Hier bleibt nur, was diese Liste allein
   hat. */
.f3d-runrow-targets { display: flex; gap: 6px; font-size: 0.76rem; }
.f3d-runrow-targets .ok { color: var(--f3d-good); }
.f3d-runrow-targets .fail { color: var(--f3d-bad); }
</style>
