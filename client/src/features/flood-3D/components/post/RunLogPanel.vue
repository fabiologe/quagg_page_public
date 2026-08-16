<template>
  <section class="f3d-runlog">
    <article v-for="entry in entries" :key="entry.runId" class="f3d-card">
      <header class="f3d-card-head">
        <h3>{{ entry.runId }}</h3>
        <span class="f3d-chip" :class="`status-${entry.status}`">{{ entry.status }}</span>
        <button v-if="isActive(entry.status)" class="f3d-btn f3d-btn-s"
                :disabled="abbrechend === entry.runId"
                title="Container des aktuellen Schritts stoppen — der Lauf endet mit Status „abgebrochen“"
                @click="abbrechen(entry.runId)">
          ✕ Lauf abbrechen
        </button>
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
          Log: {{ lokalLive(entry) ? 'Companion (live)' : (entry.logSource ?? '–') }}
          <template v-if="isActive(entry.status)"> · aktualisiert automatisch</template>
        </span>
      </div>
      <pre class="f3d-log">{{ lokalLive(entry) ? lokal.log.join('\n')
        : (entry.log || '(keine Logausgabe)') }}</pre>
    </article>
    <p v-if="!entries.length" class="f3d-muted">Keinen Lauf ausgewählt.</p>
  </section>
</template>

<script setup>
// Logansicht (Spez. Kap. 8) + Laufmanifest (Spez. 4.4): OpenFOAM-Version,
// Netzkennwerte, Kerne, Dauer, Abbruchgrund. Bei laufenden Läufen wird das
// Log des aktuellen Schritts automatisch nachgeladen.
import { computed, ref, watchEffect } from 'vue'
import { flood3dApi } from '../../services/api'
import { useLocalRunStore } from '../../stores/useLocalRunStore'
import { usePostStore } from '../../stores/usePostStore'
import { useRunPolling } from '../../composables/useRunPolling'
import { AKTIV } from '../../utils/runStatus'
import { GRENZWERTE } from '../../utils/grenzwerte'
import { fmt } from '../../utils/labels'

const store = usePostStore()
const lokal = useLocalRunStore()

// Der ausgewaehlte 'lokal'-Lauf ist genau der, den DIESER Browser gerade
// faehrt? Dann kommt das Log live aus dem Store statt vom Server (dort
// gibt es fuer laufende Companion-Jobs nichts zu lesen). Nach dem
// Wiederanknuepfen ist die Laufnummer erst ab dem ersten Speicherpunkt
// bekannt — bis dahin genuegt der Fall-Praefix (<fall>_rNNN).
function lokalLive(entry) {
  const l = lokal.laufend
  return !!l && entry.status === 'lokal'
    && (l.runId === entry.runId
        || (!l.runId && l.caseId && entry.runId.startsWith(`${l.caseId}_r`)))
}
const entries = ref([])

const isActive = (s) => AKTIV.includes(s)

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
  // Womit gerechnet wurde, gehört in den Nachweis: Server und
  // Nutzer-Maschine müssen dieselbe OpenFOAM-Ausgabe fahren
  if (m.foam?.api) {
    rows.push(['OpenFOAM', `v${m.foam.api}${m.foam.build ? ` (${m.foam.build})` : ''}`,
      m.foam_hinweis ? 'bad' : 'good'])
  }
  if (m.foam_hinweis) rows.push(['Ausgabe abweichend', m.foam_hinweis, 'bad'])
  // Womit gerechnet wurde: bei Läufen auf fremden Maschinen ist das der
  // Unterschied zwischen Diagnose und Raten (Audit Rechenorte)
  if (m.maschine) {
    const ma = m.maschine
    rows.push(['Maschine',
      `${ma.kerne_benutzt} Ränge von ${ma.kerne_sichtbar ?? '?'} CPUs · `
      + `${ma.ram_gb ?? '?'} GB RAM · Job-Ordner auf ${ma.job_fs ?? '?'}`,
      ma.job_fs_warnung ? 'bad' : ''])
    if (ma.job_fs_warnung) {
      rows.push(['Dateisystem bremst',
        `${ma.job_fs_warnung} — OpenFOAM schreibt ständig; auf ein `
        + 'Docker-Volume umstellen', 'bad'])
    }
  }
  // Speicherpunkte des Cloud-Laufs: was schon gesichert ist, ist bei
  // Timeout/Absturz NICHT verloren und im Ergebnis-3D bereits sichtbar
  if (m.teilstand_zeiten != null) {
    rows.push(['Zwischenstand',
      `${m.teilstand_zeiten} Zeitschritte bis t = ${fmt(m.letzte_zeit)} s `
      + 'gesichert — Raum (3D) zeigt sie schon jetzt', 'good'])
  }
  if (m.teilstand_fehler) {
    rows.push(['Zwischenstand-Fehler', m.teilstand_fehler, 'bad'])
  }
  if (m.duration_s != null) rows.push(['Dauer', `${fmt(m.duration_s / 60)} min`])
  // Warum der Lauf endete. Ohne diese Zeile sieht ein planmäßig früh
  // beendeter Leerlauf aus wie ein abgeschnittener — die Zeitachse hört
  // in beiden Fällen vor der eingestellten Dauer auf.
  if (m.ende_grund === 'leerlauf') {
    rows.push(['Ende', `Leerlauf erreicht bei t = ${fmt(m.ende_zeit)} s — `
      + 'vor der Obergrenze, weil nichts mehr abgelaufen ist', 'good'])
    if (m.ende_text) rows.push(['Abbruchkriterium', m.ende_text])
  } else if (m.ende_grund === 'zeit') {
    rows.push(['Ende', `Rechenzeit ${fmt(m.ende_zeit)} s abgelaufen`])
  }
  if (m.cost_eur != null) rows.push(['Ist-Kosten', `${fmt(m.cost_eur)} €`])
  if (m.missing_sources?.length) {
    rows.push(['Fehlende Quellen', m.missing_sources.join(', '), 'bad'])
  }
  // Stumme Manifest-Kanäle sichtbar machen (Audit H1/H2): diese Einträge
  // wurden geschrieben, aber nie angezeigt — man stand „vor einem Lauf
  // ohne Gelände und ohne Erklärung"
  if (m.terrain_error) {
    rows.push(['Geländeschicht', `fehlt — ${m.terrain_error}`, 'bad'])
  }
  if (m.fields_error) {
    rows.push(['3D-Felder', `nicht konvertiert — ${m.fields_error}`, 'bad'])
  }
  if (m.viz_volume_error_rel_max != null) {
    const pct = (m.viz_volume_error_rel_max * 100).toFixed(1)
    rows.push(['Viz-Volumen-Selbsttest',
      `max. ${pct} % Abweichung zum Solver-Volumen`,
      m.viz_volume_error_rel_max > GRENZWERTE.viz_volumen_befund
        ? 'bad' : 'good'])
  }
  return rows
}

// Abbruch (Audit H3): Marke + Container-Kill serverseitig; das Manifest
// endet mit status=abgebrochen statt failed
const abbrechend = ref(null)

async function abbrechen(runId) {
  abbrechend.value = runId
  try {
    await flood3dApi.abortRun(runId)
  } catch (e) {
    entries.value = entries.value.map((x) =>
      (x.runId === runId ? { ...x, log: `Abbruch: ${e.message}\n${x.log}` } : x))
  } finally {
    abbrechend.value = null
    load()
  }
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
}

watchEffect(() => {
  void store.selectedRunIds.length
  load()
})

// solange einer der angezeigten Läufe rechnet, Log + Manifest nachladen
const hasActive = computed(() => entries.value.some((e) => isActive(e.status)))
useRunPolling(hasActive, load, 5000)
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
