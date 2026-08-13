<template>
  <aside class="f3d-runlist">
    <div class="f3d-runlist-head">
      <h2>Läufe</h2>
      <button class="f3d-btn" :disabled="store.runsLoading" @click="store.loadRuns()">
        {{ store.runsLoading ? '…' : 'Aktualisieren' }}
      </button>
    </div>

    <p v-if="store.runsError" class="f3d-error">{{ store.runsError }}</p>
    <p v-else-if="!runsNewestFirst.length && !store.runsLoading" class="f3d-muted">
      Noch keine Läufe für dieses Projekt — in der Phase
      Simulation starten.
    </p>

    <label v-for="run in runsNewestFirst" :key="run.run_id" class="f3d-run"
           :class="{ selected: store.selectedRunIds.includes(run.run_id) }">
      <input type="checkbox"
             :checked="store.selectedRunIds.includes(run.run_id)"
             @change="store.toggleRun(run.run_id)" />
      <span class="f3d-run-body">
        <span class="f3d-run-id">{{ run.run_id }}</span>
        <span class="f3d-run-meta">
          <span class="f3d-chip" :class="`status-${run.status}`">{{ run.status }}</span>
          <span v-if="run.stale" class="f3d-chip status-stale"
                title="Logs wachsen seit über 15 Minuten nicht mehr — Lauf vermutlich abgestürzt">
            hängt?
          </span>
          <span v-if="run.status === 'teilergebnis'" class="f3d-chip status-stale"
                title="Der Lauf wurde abgebrochen oder ist gescheitert — ausgewertet wurde, was bis dahin gerechnet war">
            Teilergebnis
          </span>
          <span v-if="run.verfallen" class="f3d-chip status-stale"
                title="Companion-Reservierung, deren Ergebnis seit über 7 Tagen nicht importiert wurde — kann gelöscht werden">
            verfallen
          </span>
          <span v-if="MIT_ERGEBNIS.includes(run.status)
                      && run.has_normalized === false"
                class="f3d-chip status-stale"
                title="Lauf ohne normalisierte Zeitreihen — Diagramme und Nachweise bleiben leer">
            ohne Auswertung
          </span>
          <span v-if="run.befunde_fehler || run.befunde_warnung"
                class="f3d-chip"
                :class="run.befunde_fehler ? 'status-failed' : 'status-stale'"
                :title="`${run.befunde_fehler || 0} Fehler- und ${run.befunde_warnung || 0} Warn-Befunde — Details im Reiter Qualität`">
            ⚠ Qualität
          </span>
          <span v-if="run.archiviert" class="f3d-chip status-stale"
                :title="`Auf die StorageBox ausgelagert (${fmtBytes(run.archiv_bytes || 0)}) — `
                        + 'Bewertung ist da, 3D-Felder und Abbildungen werden beim Öffnen zurückgeholt'">
            archiviert
          </span>
          <span v-if="run.n_targets" class="f3d-run-targets">
            <span class="ok">✓ {{ run.n_erfuellt }}</span>
            <span v-if="run.n_nicht_erfuellt" class="fail">✗ {{ run.n_nicht_erfuellt }}</span>
          </span>
          <span v-if="run.size_mb != null" class="f3d-run-size">{{ fmtBytes(run.size_mb * 1e6) }}</span>
        </span>
      </span>
      <button v-if="!run.archiviert && TERMINAL_ARCHIV.includes(run.status)"
              class="f3d-run-del" :disabled="archivBusy === run.run_id"
              title="Auf die StorageBox auslagern — macht Platz auf der Serverplatte, Lauf bleibt in der Liste"
              @click.prevent.stop="archivieren(run)">{{ archivBusy === run.run_id ? '…' : '📦' }}</button>
      <button v-else-if="run.archiviert" class="f3d-run-del"
              :disabled="archivBusy === run.run_id"
              title="Aus dem Archiv zurückholen (3D-Felder und Abbildungen)"
              @click.prevent.stop="zurueckholen(run)">{{ archivBusy === run.run_id ? '…' : '📥' }}</button>
      <button class="f3d-run-del" title="Lauf samt Feldern löschen"
              @click.prevent.stop="confirmDelete(run)">🗑</button>
    </label>

    <p v-if="store.selectedRunIds.length > 1" class="f3d-muted f3d-hint">
      Mehrere Läufe ausgewählt — Diagramme überlagern die Läufe,
      Strichmuster unterscheidet sie.
    </p>
  </aside>
</template>

<script setup>
// Laufauswahl des aktiven Projekts (caseFilter im Store); solange ein Lauf
// in einem Zwischenzustand ist (building, meshing, solving, …), wird die
// Liste automatisch aktualisiert.
import { computed, ref } from 'vue'
import { flood3dApi } from '../../services/api'
import { useLocalRunStore } from '../../stores/useLocalRunStore'
import { usePostStore } from '../../stores/usePostStore'
import { useRunPolling } from '../../composables/useRunPolling'
import { MIT_ERGEBNIS, TERMINAL, TERMINAL_ARCHIV } from '../../utils/runStatus'
import { fmtBytes } from '../../utils/labels'

const store = usePostStore()
const lokal = useLocalRunStore()

// Ein 'lokal'-Lauf ist nur aktiv, wenn DIESER Browser ihn fährt;
// hängende Läufe (stale) nicht weiter pollen — sonst pollt die Liste ewig
const hasActive = computed(() =>
  store.visibleRuns.some((r) => (!TERMINAL.includes(r.status) && !r.stale)
    || (r.status === 'lokal' && lokal.laufend?.runId === r.run_id)))

async function confirmDelete(run) {
  const ok = window.confirm(
    `Lauf ${run.run_id} (${fmtBytes((run.size_mb ?? 0) * 1e6)}) endgültig löschen?`)
  if (!ok) return
  try {
    await store.removeRun(run.run_id)
  } catch (e) {
    store.runsError = e.message
  }
}

// Auslagern / Zurückholen. Beides dauert Sekunden (147 MB/s über CIFS), aber
// der Knopf muss währenddessen gesperrt sein — ein zweiter Klick würde den
// laufenden Kopiervorgang durchkreuzen.
const archivBusy = ref(null)

async function archivieren(run) {
  archivBusy.value = run.run_id
  try {
    await flood3dApi.archiviereRun(run.run_id)
    await store.loadRuns()
  } catch (e) {
    store.runsError = e.message
  } finally {
    archivBusy.value = null
  }
}

async function zurueckholen(run) {
  archivBusy.value = run.run_id
  try {
    await flood3dApi.holeRunZurueck(run.run_id)
    await store.loadRuns()
  } catch (e) {
    store.runsError = e.message
  } finally {
    archivBusy.value = null
  }
}

const runsNewestFirst = computed(() => [...store.visibleRuns].reverse())

useRunPolling(hasActive, () => store.loadRuns(), 8000)
</script>

<style scoped>
.f3d-runlist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  overflow-y: auto;
}
.f3d-runlist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.f3d-runlist-head h2 {
  margin: 0;
  font-size: 0.95rem;
  color: var(--f3d-text);
}
.f3d-run {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px;
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  cursor: pointer;
  background: var(--f3d-surface);
}
.f3d-run.selected { border-color: var(--f3d-accent); }
.f3d-run input { margin-top: 3px; accent-color: var(--f3d-accent); }
.f3d-run-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.f3d-run-id {
  color: var(--f3d-text);
  font-size: 0.85rem;
  font-weight: 600;
  word-break: break-all;
}
.f3d-run-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.f3d-run-targets { display: flex; gap: 6px; font-size: 0.75rem; }
.f3d-run-targets .ok { color: var(--f3d-good); }
.f3d-run-targets .fail { color: var(--f3d-bad); }
.f3d-hint { font-size: 0.75rem; }
.f3d-run-size { color: var(--f3d-text-2); font-size: 0.72rem; }
.f3d-run-del {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  opacity: 0.4;
}
.f3d-run:hover .f3d-run-del { opacity: 1; }
.status-stale {
  background: color-mix(in srgb, var(--f3d-bad) 22%, transparent);
  color: var(--f3d-bad);
}
</style>
