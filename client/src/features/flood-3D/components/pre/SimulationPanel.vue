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
          <label>Regelwerk</label>
          <label v-for="r in REGELWERKE" :key="r.id" class="f3d-regelwerk">
            <input type="checkbox" :checked="istGewaehlt(r.id)"
                   @change="regelwerkUmschalten(r.id, $event.target.checked)" />
            <span>
              <strong>{{ r.id }}</strong> — {{ r.titel }}<template v-if="r.hinweis">
                <em> ({{ r.hinweis }})</em></template>
            </span>
          </label>
          <input class="f3d-num f3d-grow" placeholder="weitere, mit Komma getrennt"
                 :value="eigeneRegelwerke(spec.meta.nachweis?.regelwerk).join(', ')"
                 @change="eigeneSetzen($event.target.value)" />
          <p class="f3d-muted f3d-small">
            Die maßgebliche Fassung und der maßgebliche Abschnitt sind
            projektbezogen festzulegen und gehören in die Anmerkung.
          </p>
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
          <h3>Modellgebiet &amp; Netz</h3>
          <span class="f3d-muted f3d-small">ändert das Netz</span>
        </header>
        <!-- Gebiet und Gelände werden im MODELL bearbeitet (Editor-Griffe
             oder Objektbaum → Eigenschaften) — hier stand eine dritte
             Eingabemaske für dieselben Zahlen. Geblieben ist die Übersicht
             und die Netzsteuerung, die wirklich hierher gehört. -->
        <p class="f3d-muted f3d-small">
          Gebiet {{ spec.domain.extent[0] }}…{{ spec.domain.extent[2] }} ×
          {{ spec.domain.extent[1] }}…{{ spec.domain.extent[3] }} m,
          z {{ spec.domain.z_min }}…{{ spec.domain.z_max }} m
          <template v-if="spec.terrain"> · Gelände
            „{{ spec.terrain.base.source }}“
            ({{ spec.terrain.base.resolution }} m)</template>
          — bearbeiten in der Phase <b>Modell</b>.
        </p>
        <div class="f3d-field">
          <label>Basiszellgröße (m)</label>
          <input type="number" step="0.05" min="0.05" class="f3d-num"
                 :value="spec.mesh?.base_cell ?? ''"
                 @change="setNum('mesh.base_cell', $event)" />
          <Hinweis pfad="mesh.base_cell" />
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
          <select v-model="lokal.rechenort" class="f3d-select">
            <!-- Server rechnet keine Laeufe mehr (Entscheidung 2026-08-13):
                 die Maschine gehoert der Webseite, gerechnet wird lokal
                 oder in der Cloud -->
            <option value="local" :disabled="!lokal.companion?.foamSupported">
              Lokal (dieser PC, Docker)
            </option>
            <option value="runpod">RunPod (Cloud, kostenpflichtig)</option>
          </select>
          <p v-if="lokal.rechenort === 'runpod'" class="f3d-muted f3d-small">
            Der Fall wird als Paket in die Cloud geschickt und dort auf allen
            Kernen des Workers gerechnet. Der Server begleitet den Lauf und
            übernimmt das Ergebnis automatisch — Browser darf zu sein.
            <strong>Kostenpflichtig nach Laufzeit.</strong>
          </p>
          <p v-if="lokal.companion?.foamSupported" class="f3d-muted f3d-small">
            ✓ Local Companion v{{ lokal.companion.version }} erkannt
            {{ lokal.companion.docker?.available ? '· Docker läuft' : '· Docker NICHT erreichbar!' }}
            — der Lauf rechnet auf deiner Maschine, das Ergebnis wird
            automatisch übernommen.
          </p>
          <p v-else-if="lokal.companion && !lokal.companion.foamSupported" class="f3d-muted f3d-small">
            Companion gefunden, aber zu alt (v{{ lokal.companion.version }}) —
            Version 1.3+ nötig für OpenFOAM. Update herunterladen und
            ausführen:
            <a :href="UPDATE_WIN" download>Windows (.bat)</a> ·
            <a :href="UPDATE_MAC" download>macOS/Linux</a>, danach
            <a href="#" @click.prevent="lokal.companionPruefen(true)">erneut suchen</a>.
          </p>
          <p v-else class="f3d-muted f3d-small">
            Kein Local Companion auf diesem PC gefunden (localhost:8642).
            Einmalig einrichten:
            <a :href="INSTALL_WIN" download>Windows (.bat)</a> ·
            <a :href="INSTALL_MAC" download>macOS/Linux</a>, danach
            <a href="#" @click.prevent="lokal.companionPruefen(true)">erneut suchen</a>.
          </p>
        </div>
        <!-- `store.loading` sperrt den SERVERlauf-Doppelklick; `lokal.laeuft`
             kommt aus dem Store und uebersteht damit auch ein Neu-Mounten
             des Panels (frueher: Doppelstart nach Phasenwechsel) -->
        <button class="f3d-btn f3d-btn-run f3d-cta"
                :disabled="store.nFehler > 0 || lokal.laeuft || store.loading"
                :title="store.nFehler ? 'Erst Fehler der Prüfung beheben' : ''"
                @click="startClicked">
          {{ lokal.laeuft ? '⏳ läuft lokal …'
            : (store.loading ? '⏳ startet …' : '▶ Simulation starten') }}
        </button>
        <button v-if="lokal.laeuft && lokal.laufend.jobId" class="f3d-btn"
                :disabled="lokal.pausing" @click="lokal.pausieren()">
          {{ lokal.pausing ? 'hält an …' : '⏸ Pause (Stand wird gesichert)' }}
        </button>
        <div v-if="!lokal.laeuft && lokal.wiederaufnehmbare.length" class="f3d-resume">
          <p class="f3d-muted f3d-small">
            Auf diesem PC liegen unterbrochene Läufe. Fortsetzen rechnet ab
            dem letzten geschriebenen Zeitschritt weiter — das Netz bleibt
            stehen.
          </p>
          <button v-for="r in lokal.wiederaufnehmbare" :key="r.id" class="f3d-btn f3d-grow"
                  @click="lokal.fortsetzen(r)">
            ▶ {{ r.id }} fortsetzen ({{ Math.round(r.sizeBytes / 1e6) }} MB)
          </button>
        </div>
        <p v-if="store.nFehler" class="f3d-error">
          {{ store.nFehler }} Prüfungsfehler blockieren den Start — Details
          in der Phase „Modell".
        </p>
        <div v-if="lokal.log.length" class="f3d-locallog">
          <div v-if="lokal.fortschritt != null" class="f3d-localbar">
            <div :style="{ width: `${Math.round(lokal.fortschritt * 100)}%` }"></div>
          </div>
          <pre>{{ lokal.log.slice(-14).join('\n') }}</pre>
        </div>
      </article>
      <MeshPreviewCard v-if="store.meshPreview || store.meshPreviewLoading" />

      <!-- Physikalische Verifikation (Spez. Kap. 13): Referenzfälle gegen
           analytische Formeln — sichtbar, WANN zuletzt belegt wurde, dass
           die Pipeline richtige Zahlen liefert (Fabios Wunsch R4) -->
      <article class="f3d-card">
        <h3>Physikalische Verifikation</h3>
        <p v-if="!verifikation.length" class="f3d-muted f3d-small">
          Noch kein Verifikationslauf gerechnet. Läuft serverseitig:
          <code>FLOOD3D_VERIFIKATION=1 pytest …/test_verifikation.py</code>
          — nach jeder Änderung am Fallaufbau und vor jedem Release.
        </p>
        <div v-for="v in verifikation" :key="v.fall" class="f3d-verif-zeile">
          <span class="f3d-chip"
                :class="v.bestanden ? 'status-completed' : 'status-failed'">
            {{ v.bestanden ? 'bestanden' : 'NICHT bestanden' }}
          </span>
          <span class="f3d-verif-text">
            <strong>{{ v.titel ?? v.fall }}</strong><br />
            <span class="f3d-muted f3d-small">
              C_d = {{ v.cd_sim }} (Band {{ v.band?.[0] }}–{{ v.band?.[1] }},
              {{ v.band_art }}) · {{ v.zellen?.toLocaleString('de-DE') }} Zellen
              · geprüft {{ v.geprueft }}
            </span>
          </span>
        </div>
      </article>
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
import { REGELWERKE, REGELWERK_IDS, eigeneRegelwerke } from '../../utils/regelwerke'
import { flood3dApi } from '../../services/api'
import { useLocalRunStore } from '../../stores/useLocalRunStore'
import { usePreStore } from '../../stores/usePreStore'
import MeshPreviewCard from './MeshPreviewCard.vue'
import ValidationPanel from './ValidationPanel.vue'

const store = usePreStore()
// Der lokale Lauf lebt im eigenen Store (App-Lebensdauer): dieses Panel
// rendert nur noch und ruft Actions — Phasenwechsel zerstoeren den
// Treiber nicht mehr.
const lokal = useLocalRunStore()
const spec = computed(() => store.spec)

// Einordnung unter jedem Eingabefeld: übersetzt den Wert in die Sprache
// des konkreten Falls (Zellzahl, Rechenzeit, Datenmenge) statt allgemeiner
// Merksätze. Rot = so lässt der Lauf sich nicht starten.
const Hinweis = (props) => {
  const h1 = hinweis(props.pfad, spec.value, store.meshPreview, store.meshPreviewStale)
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

const verifikation = ref([])

onMounted(() => {
  lokal.companionPruefen(false)
  flood3dApi.verifikation()
    .then((v) => { verifikation.value = v })
    .catch(() => { verifikation.value = [] })
})

async function startClicked() {
  if (lokal.rechenort === 'runpod') {
    // Cloud kostet echtes Geld, deshalb eine bewusste Bestätigung mehr —
    // das Kosten-Passwort fragt der API-Client zusätzlich ab.
    const ok = window.confirm(
      'Lauf in der Cloud rechnen (RunPod)?\n\n'
      + 'Der Server packt den Fall, schickt ihn zum Rechnen und holt das '
      + 'Ergebnis zurück — du kannst die Seite dabei verlassen.\n'
      + 'Es entstehen Kosten nach Laufzeit.')
    if (!ok) return
    await store.startRun('runpod')
    return
  }
  await lokal.starten(store.activeCaseId)
}

const set = (fn) => store.updateSettings(fn)

// --- Regelwerk ------------------------------------------------------------
// Auswahl aus dem Katalog plus Freitextzeile für alles, was nicht darin
// steht. Beide schreiben in dieselbe Liste; die Reihenfolge des Katalogs
// bleibt erhalten, damit die Angabe im Ergebnis vergleichbar aussieht.

function istGewaehlt(id) {
  return (store.spec?.meta?.nachweis?.regelwerk ?? []).includes(id)
}

function regelwerkSchreiben(liste) {
  set((s) => {
    s.meta.nachweis = s.meta.nachweis ?? {}
    s.meta.nachweis.regelwerk = liste
  })
}

function regelwerkUmschalten(id, an) {
  const alt = store.spec?.meta?.nachweis?.regelwerk ?? []
  const gewaehlt = new Set(alt)
  if (an) gewaehlt.add(id)
  else gewaehlt.delete(id)
  regelwerkSchreiben([
    ...REGELWERK_IDS.filter((x) => gewaehlt.has(x)),
    ...eigeneRegelwerke(alt),
  ])
}

function eigeneSetzen(text) {
  const alt = store.spec?.meta?.nachweis?.regelwerk ?? []
  regelwerkSchreiben([
    ...REGELWERK_IDS.filter((x) => alt.includes(x)),
    ...text.split(',').map((x) => x.trim()).filter(Boolean),
  ])
}

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
.f3d-regelwerk {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  line-height: 1.35;
  font-size: 0.72rem;
}
.f3d-regelwerk input { margin-top: 2px; flex: none; }
.f3d-regelwerk strong { color: var(--f3d-text); }
.f3d-regelwerk em { color: var(--f3d-text-2); font-style: normal; }
.f3d-pair { display: flex; align-items: center; gap: 8px; }
.f3d-pair span { color: var(--f3d-text-2); font-size: 0.75rem; }
.f3d-num { width: 110px; }
.f3d-grow { width: 100%; }
.f3d-hint {
  margin: 3px 0 0;
  font-size: 0.72rem;
  line-height: 1.45;
  /* Erklärtext, nicht Beiwerk — hell genug zum Lesen (die Stufenfarben
     warn/bad darunter überschreiben das bei gleicher Spezifität) */
  color: var(--f3d-text-hilfe);
}
.f3d-hint-warn { color: var(--f3d-warn); }
.f3d-hint-bad { color: var(--f3d-bad); }
.f3d-sim-cta { display: flex; flex-direction: column; gap: 10px; }
/* Download-/Aktionslinks in den Hinweistexten: weiß statt Akzentfarbe;
   vom Fließtext trennt sie die Unterstreichung */
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
.f3d-verif-zeile {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 8px;
}
.f3d-verif-text { line-height: 1.35; }
</style>
