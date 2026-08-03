<template>
  <section class="f3d-sim">
    <div class="f3d-sim-forms">
      <article class="f3d-card">
        <header class="f3d-card-head"><h3>Fall</h3></header>
        <div class="f3d-field">
          <label>Titel</label>
          <input class="f3d-num f3d-grow" :value="spec.meta.title"
                 @change="set((s) => { s.meta.title = $event.target.value })" />
        </div>
        <div class="f3d-field">
          <label>Lastfall / Anmerkung</label>
          <input class="f3d-num f3d-grow" :value="spec.meta.nachweis?.lastfall ?? ''"
                 @change="set((s) => { s.meta.nachweis.lastfall = $event.target.value })" />
        </div>
        <div class="f3d-field">
          <label>Bearbeiter</label>
          <input class="f3d-num f3d-grow" :value="spec.meta.nachweis?.bearbeiter ?? ''"
                 @change="set((s) => { s.meta.nachweis.bearbeiter = $event.target.value })" />
        </div>
        <div class="f3d-field">
          <label>Regelwerk (mit Komma trennen)</label>
          <input class="f3d-num f3d-grow"
                 :value="(spec.meta.nachweis?.regelwerk ?? []).join(', ')"
                 @change="set((s) => { s.meta.nachweis.regelwerk =
                   $event.target.value.split(',').map((x) => x.trim()).filter(Boolean) })" />
        </div>
        <div class="f3d-field">
          <label>Bezugssystem (EPSG)</label>
          <input class="f3d-num f3d-grow" type="number"
                 :value="spec.meta.crs?.epsg ?? ''"
                 @change="set((s) => { const v = Number($event.target.value)
                   s.meta.crs = v > 0 ? { epsg: v } : null })" />
        </div>
        <p class="f3d-muted f3d-small">
          Diese Angaben wandern unverändert ins Ergebnis und stehen dort über
          den Nachweiskriterien. Gerechnet wird immer in lokalen Metern; die
          beim CAD-Import abgezogene Landeskoordinate merkt sich der Fall
          getrennt.
        </p>
      </article>

      <article class="f3d-card">
        <header class="f3d-card-head">
          <h3>Simulation</h3>
          <span class="f3d-muted f3d-small">was gerechnet wird</span>
        </header>
        <div class="f3d-field">
          <label>Simulationsdauer (s)</label>
          <input type="number" step="any" min="1" class="f3d-num"
                 :value="spec.solver.end_time"
                 @change="setNum('solver.end_time', $event)" />
          <Hinweis pfad="solver.end_time" />
        </div>
        <div class="f3d-field">
          <label>Anfangswasserspiegel (m NHN)</label>
          <input type="number" step="0.05" class="f3d-num"
                 :value="spec.solver.initial_level ?? ''"
                 placeholder="leer = trocken"
                 @change="setNumOrNull('solver.initial_level', $event)" />
          <Hinweis pfad="solver.initial_level" />
        </div>
        <div class="f3d-field">
          <label>Verweilzeit mitrechnen</label>
          <input type="checkbox" :checked="spec.evaluation?.verweilzeit ?? false"
                 @change="set((s) => { s.evaluation.verweilzeit = $event.target.checked })" />
          <p class="f3d-muted f3d-small">
            Rechnet einen Markierungsstoff mit, der ab t = 0 mit dem Zufluss
            eintritt. Seine Durchbruchskurve am Ablauf zeigt die tatsächliche
            Verweilzeit und ob ein Teil des Zuflusses kurzgeschlossen
            durchläuft — für Absetz- und Rückhaltebecken die entscheidende
            Frage. Kostet rund 5 % Rechenzeit.
          </p>
        </div>
        <div class="f3d-field">
          <label>Turbulenzmodell</label>
          <select class="f3d-select" :value="spec.solver.turbulence"
                  @change="set((s) => { s.solver.turbulence = $event.target.value })">
            <option value="kOmegaSST">k-ω-SST (Standard)</option>
            <option value="kEpsilon">k-ε</option>
            <option value="laminar">laminar (ohne Turbulenz)</option>
          </select>
          <Hinweis pfad="solver.turbulence" />
        </div>
      </article>

      <article class="f3d-card">
        <header class="f3d-card-head">
          <h3>Genauigkeit &amp; Ausgabe</h3>
          <span class="f3d-muted f3d-small">Zeitschritt und Datenmenge</span>
        </header>
        <div class="f3d-field">
          <label>Courant-Grenze (max_co)</label>
          <input type="number" step="0.05" min="0.1" max="1" class="f3d-num"
                 :value="spec.solver.max_co"
                 @change="setNum('solver.max_co', $event)" />
          <Hinweis pfad="solver.max_co" />
        </div>
        <div class="f3d-field">
          <label>Alpha-Courant-Grenze (max_alpha_co)</label>
          <input type="number" step="0.05" min="0.1" max="1" class="f3d-num"
                 :value="spec.solver.max_alpha_co"
                 @change="setNum('solver.max_alpha_co', $event)" />
          <Hinweis pfad="solver.max_alpha_co" />
        </div>
        <div class="f3d-field">
          <label>3D-Felder schreiben alle (s)</label>
          <input type="number" step="any" min="0.1" class="f3d-num"
                 :value="spec.solver.write_interval_fields"
                 @change="setNum('solver.write_interval_fields', $event)" />
          <Hinweis pfad="solver.write_interval_fields" />
        </div>
        <div class="f3d-field">
          <label>Zeitreihen schreiben alle (s)</label>
          <input type="number" step="any" min="0.01" class="f3d-num"
                 :value="spec.solver.write_interval_series"
                 @change="setNum('solver.write_interval_series', $event)" />
          <Hinweis pfad="solver.write_interval_series" />
        </div>
      </article>

      <article class="f3d-card" v-if="spec.domain">
        <header class="f3d-card-head">
          <h3>Modellgebiet</h3>
          <span class="f3d-muted f3d-small">ändert das Netz</span>
        </header>
        <div class="f3d-field">
          <label>Ausdehnung x (m)</label>
          <div class="f3d-pair">
            <input type="number" step="any" class="f3d-num" :value="spec.domain.extent[0]"
                   @change="setExtent(0, $event)" />
            <span>bis</span>
            <input type="number" step="any" class="f3d-num" :value="spec.domain.extent[2]"
                   @change="setExtent(2, $event)" />
          </div>
        </div>
        <div class="f3d-field">
          <label>Ausdehnung y (m)</label>
          <div class="f3d-pair">
            <input type="number" step="any" class="f3d-num" :value="spec.domain.extent[1]"
                   @change="setExtent(1, $event)" />
            <span>bis</span>
            <input type="number" step="any" class="f3d-num" :value="spec.domain.extent[3]"
                   @change="setExtent(3, $event)" />
          </div>
          <Hinweis pfad="domain.extent" />
        </div>
        <div class="f3d-field">
          <label>Höhenbereich z (m NHN)</label>
          <div class="f3d-pair">
            <input type="number" step="any" class="f3d-num" :value="spec.domain.z_min"
                   @change="setNum('domain.z_min', $event)" />
            <span>bis</span>
            <input type="number" step="any" class="f3d-num" :value="spec.domain.z_max"
                   @change="setNum('domain.z_max', $event)" />
          </div>
          <Hinweis pfad="domain.z" />
        </div>
        <div class="f3d-field">
          <label>Basiszellgröße (m)</label>
          <input type="number" step="0.05" min="0.05" class="f3d-num"
                 :value="spec.mesh?.base_cell ?? ''"
                 @change="setNum('mesh.base_cell', $event)" />
          <Hinweis pfad="mesh.base_cell" />
        </div>
      </article>

      <article class="f3d-card" v-if="spec.terrain">
        <header class="f3d-card-head"><h3>Geländebasis</h3></header>
        <div class="f3d-field">
          <label>Quelle</label>
          <input class="f3d-num f3d-grow" :value="spec.terrain.base.source"
                 @change="set((s) => { s.terrain.base.source = $event.target.value })" />
          <span class="f3d-muted f3d-small">flat:&lt;höhe&gt;, .asc oder .xyz neben dem Fall</span>
        </div>
        <div class="f3d-field">
          <label>Raster-Auflösung (m)</label>
          <input type="number" step="0.05" min="0.05" class="f3d-num"
                 :value="spec.terrain.base.resolution"
                 @change="setNum('terrain.base.resolution', $event)" />
          <Hinweis pfad="terrain.base.resolution" />
        </div>
      </article>
    </div>

    <aside class="f3d-sim-side">
      <article class="f3d-card f3d-sim-cta">
        <header class="f3d-card-head"><h3>Rechnen</h3></header>
        <p class="f3d-muted f3d-small">
          Vor dem Lauf lohnt die Netzvorschau — sie prüft die Vernetzbarkeit
          und schätzt Dauer und Kosten für die aktuelle Einstellung.
        </p>
        <button class="f3d-btn" :disabled="store.meshPreviewLoading"
                @click="store.runMeshPreview()">
          {{ store.meshPreviewLoading ? 'vernetze …' : 'Netz- und Kostenvorschau' }}
        </button>
        <div class="f3d-field">
          <label>Rechenort</label>
          <select v-model="rechenort" class="f3d-select">
            <option value="server">Server</option>
            <option value="local" :disabled="!companion?.foamSupported">
              Lokal (dieser PC, Docker)
            </option>
          </select>
          <p v-if="companion?.foamSupported" class="f3d-muted f3d-small">
            ✓ Local Companion v{{ companion.version }} erkannt
            {{ companion.docker?.available ? '· Docker läuft' : '· Docker NICHT erreichbar!' }}
            — der Lauf rechnet auf deiner Maschine, das Ergebnis wird
            automatisch übernommen.
          </p>
          <p v-else-if="companion && !companion.foamSupported" class="f3d-muted f3d-small">
            Companion gefunden, aber zu alt (v{{ companion.version }}) —
            Version 1.3+ nötig für OpenFOAM. Update herunterladen und
            ausführen:
            <a :href="UPDATE_WIN" download>Windows (.bat)</a> ·
            <a :href="UPDATE_MAC" download>macOS/Linux</a>, danach
            <a href="#" @click.prevent="checkCompanion">erneut suchen</a>.
          </p>
          <p v-else class="f3d-muted f3d-small">
            Kein Local Companion auf diesem PC gefunden (localhost:8642).
            Einmalig einrichten:
            <a :href="INSTALL_WIN" download>Windows (.bat)</a> ·
            <a :href="INSTALL_MAC" download>macOS/Linux</a>, danach
            <a href="#" @click.prevent="checkCompanion">erneut suchen</a>.
          </p>
        </div>
        <button class="f3d-btn f3d-btn-run f3d-cta"
                :disabled="store.nFehler > 0 || localRunning"
                :title="store.nFehler ? 'Erst Fehler der Prüfung beheben' : ''"
                @click="startClicked">
          {{ localRunning ? '⏳ läuft lokal …' : '▶ Simulation starten' }}
        </button>
        <button v-if="localRunning && localJobId" class="f3d-btn"
                :disabled="pausing" @click="pauseClicked">
          {{ pausing ? 'hält an …' : '⏸ Pause (Stand wird gesichert)' }}
        </button>
        <div v-if="!localRunning && offeneLaeufe.length" class="f3d-resume">
          <p class="f3d-muted f3d-small">
            Auf diesem PC liegen unterbrochene Läufe. Fortsetzen rechnet ab
            dem letzten geschriebenen Zeitschritt weiter — das Netz bleibt
            stehen.
          </p>
          <button v-for="r in offeneLaeufe" :key="r.id" class="f3d-btn f3d-grow"
                  @click="resumeClicked(r)">
            ▶ {{ r.id }} fortsetzen ({{ Math.round(r.sizeBytes / 1e6) }} MB)
          </button>
        </div>
        <p v-if="store.nFehler" class="f3d-error">
          {{ store.nFehler }} Prüfungsfehler blockieren den Start — Details
          in der Phase „Modell".
        </p>
        <div v-if="localLog.length" class="f3d-locallog">
          <div v-if="localProgress != null" class="f3d-localbar">
            <div :style="{ width: `${Math.round(localProgress * 100)}%` }"></div>
          </div>
          <pre>{{ localLog.slice(-14).join('\n') }}</pre>
        </div>
      </article>
      <MeshPreviewCard v-if="store.meshPreview || store.meshPreviewLoading" />
      <ValidationPanel />
    </aside>
  </section>
</template>

<script setup>
// Phase „Simulation": alle justierbaren Rechenparameter als Formular —
// vorher lebten sie unsichtbar in der YAML. Jede Feldänderung ist ein
// Undo-Schritt und aktualisiert die Live-Vorschau (Gebiet/Gelände wirken
// sofort sichtbar in der Modell-Phase).
import { computed, h, onMounted, ref } from 'vue'
import { begrenzen, hinweis } from '../../utils/simHints'
import { companionHealth, pauseLocalRun, runLocally,
  unterbrocheneLaeufe } from '../../services/localCompanion'
import { usePreStore } from '../../stores/usePreStore'
import MeshPreviewCard from './MeshPreviewCard.vue'
import ValidationPanel from './ValidationPanel.vue'

const store = usePreStore()
const spec = computed(() => store.spec)

// Einordnung unter jedem Eingabefeld: übersetzt den Wert in die Sprache
// des konkreten Falls (Zellzahl, Rechenzeit, Datenmenge) statt allgemeiner
// Merksätze. Rot = so lässt der Lauf sich nicht starten.
const Hinweis = (props) => {
  const h1 = hinweis(props.pfad, spec.value, store.meshPreview)
  if (!h1) return null
  // Kinder eines nativen Elements muessen Text/Array sein — eine Funktion
  // waere ein Slot-Objekt und bliebe leer
  return h('p', { class: ['f3d-hint', h1.level && `f3d-hint-${h1.level}`] },
    h1.text)
}
Hinweis.props = ['pfad']

// Lokaler Rechenweg über den quagg Local Companion (wie beim Flood2D-Solver).
// Der Companion läuft als Docker-Image; Installer und Update liegen unter
// /downloads (erneutes Ausführen des Installers aktualisiert ebenfalls).
const INSTALL_WIN = '/downloads/install-quagg-companion.bat'
const INSTALL_MAC = '/downloads/install-quagg-companion.sh'
const UPDATE_WIN = '/downloads/update-quagg-companion.bat'
const UPDATE_MAC = '/downloads/update-quagg-companion.command'

const companion = ref(null)
const rechenort = ref('server')
const localRunning = ref(false)
const localLog = ref([])
const localJobId = ref(null)
const pausing = ref(false)
const offeneLaeufe = ref([])
const localProgress = ref(null)

async function pauseClicked() {
  pausing.value = true
  try {
    await pauseLocalRun(localJobId.value)
  } catch (e) {
    store.error = `Pause: ${e.message}`
  } finally {
    pausing.value = false
  }
}

function resumeClicked(r) {
  starteLokal({ jobId: r.id, runId: null })
}

async function checkCompanion(autoSelect = true) {
  companion.value = await companionHealth()
  offeneLaeufe.value = await unterbrocheneLaeufe()
  // Nach bewusstem „erneut suchen" direkt auf Lokal stellen — beim
  // Seitenladen bleibt Server die Vorauswahl
  if (autoSelect && companion.value?.foamSupported) rechenort.value = 'local'
}

onMounted(() => checkCompanion(false))

const fmtDauer = (s) => (s == null ? '?'
  : s > 3600 ? `${(s / 3600).toFixed(1)} h`
    : s > 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`)

async function starteLokal(resumeJob = null) {
  localRunning.value = true
  localLog.value = []
  localProgress.value = null
  localJobId.value = null
  try {
    if (!resumeJob && store.dirty) await store.saveCase()
    await runLocally(store.activeCaseId, (ev) => {
      if (ev.event === 'job') {
        localJobId.value = ev.jobId
      } else if (ev.event === 'progress' && ev.fraction != null) {
        localProgress.value = ev.fraction
        if (ev.time != null) {
          const rest = ev.eta_s ? ` · noch ca. ${fmtDauer(ev.eta_s)}` : ''
          localLog.value.push(
            `t = ${ev.time} s / ${ev.end_time} s `
            + `(${Math.round(ev.fraction * 100)} %${rest})`)
        }
      } else if (ev.text) {
        localLog.value.push(ev.text)
      }
    }, resumeJob)
    await store.loadCaseRuns()
    offeneLaeufe.value = await unterbrocheneLaeufe()
    store.activePhase = 'ergebnis'
  } catch (e) {
    store.error = `Lokaler Lauf: ${e.message}`
    localLog.value.push(`FEHLER: ${e.message}`)
    // nach Abbruch/Absturz kann derselbe Lauf fortgesetzt werden
    offeneLaeufe.value = await unterbrocheneLaeufe()
  } finally {
    localRunning.value = false
  }
}

async function startClicked() {
  if (rechenort.value === 'server') {
    store.startRun()
    return
  }
  await starteLokal(null)
}

const set = (fn) => store.updateSettings(fn)

function setNum(path, e) {
  let v = Number(e.target.value)
  if (Number.isNaN(v)) return
  // harte Grenzen: unsinnige Werte gar nicht erst in die Spezifikation
  // lassen (0 Zellgröße, negative Dauer, …)
  const vb = begrenzen(path, v)
  if (vb !== v) {
    v = vb
    e.target.value = String(v)
  }
  const keys = path.split('.')
  store.updateSettings((s) => {
    let o = s
    for (const k of keys.slice(0, -1)) o = o[k]
    o[keys[keys.length - 1]] = v
  })
}

function setNumOrNull(path, e) {
  const raw = e.target.value.trim()
  const keys = path.split('.')
  store.updateSettings((s) => {
    let o = s
    for (const k of keys.slice(0, -1)) o = o[k]
    o[keys[keys.length - 1]] = raw === '' ? null : Number(raw)
  })
}

function setExtent(idx, e) {
  const v = Number(e.target.value)
  if (Number.isNaN(v)) return
  store.updateSettings((s) => {
    const ext = [...s.domain.extent]
    ext[idx] = v
    s.domain.extent = ext
  })
}
</script>

<style scoped>
.f3d-sim {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.f3d-sim-forms {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
  align-content: start;
}
.f3d-sim-side {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.f3d-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}
.f3d-field > label { color: var(--f3d-text-2); font-size: 0.76rem; }
.f3d-pair { display: flex; align-items: center; gap: 8px; }
.f3d-pair span { color: var(--f3d-text-2); font-size: 0.75rem; }
.f3d-num { width: 110px; }
.f3d-grow { width: 100%; }
.f3d-hint {
  margin: 3px 0 0;
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--f3d-text-2);
}
.f3d-hint-warn { color: #c98500; }
.f3d-hint-bad { color: var(--f3d-bad); }
.f3d-sim-cta { display: flex; flex-direction: column; gap: 10px; }
/* Download-/Aktionslinks in den Hinweistexten: weiß statt Akzentfarbe,
   damit sie sich vom gedämpften Fließtext klar abheben */
.f3d-sim-cta a {
  color: var(--f3d-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.f3d-sim-cta a:hover { color: #fff; }
.f3d-cta { padding: 10px; font-size: 0.9rem; }
.f3d-locallog pre {
  margin: 6px 0 0;
  max-height: 180px;
  overflow-y: auto;
  background: var(--f3d-bg);
  border: 1px solid var(--f3d-border);
  border-radius: 6px;
  padding: 8px;
  font-size: 0.7rem;
  color: var(--f3d-text-2);
  white-space: pre-wrap;
}
.f3d-localbar {
  height: 6px;
  border-radius: 3px;
  background: var(--f3d-border);
  overflow: hidden;
}
.f3d-localbar > div { height: 100%; background: var(--f3d-accent); }
</style>
