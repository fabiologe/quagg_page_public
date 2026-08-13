<template>
  <div class="f3d-editor3d" ref="host">
    <div class="f3d-toolbar">
      <!-- Auswahl an/aus: aus heißt, jeder Klick und Zug gehört NUR der
           Kamera — nichts wird gewählt, gegriffen oder verschoben. -->
      <button class="f3d-tool" :class="{ active: auswahlAktiv }"
              :title="auswahlAktiv
                ? 'Auswahl aktiv: Klick wählt, Ecken ziehbar — Klick schaltet die Auswahl aus'
                : 'Auswahl aus: Klicks und Züge gehören nur der Kamera — Klick schaltet die Auswahl ein'"
              @click="auswahlAktiv = !auswahlAktiv">
        {{ auswahlAktiv ? '☑' : '☐' }} Auswählen
      </button>
      <!-- Stanzen wird vom Eigenschaftenpanel gestartet und war in
           der Werkzeugleiste UNSICHTBAR: kein Werkzeug wirkte aktiv,
           obwohl jeder Klick stanzte. -->
      <button v-if="mode === 'stanzen'" class="f3d-tool active"
              title="Öffnung am Körper platzieren — Mausrad ändert das Maß, Esc bricht ab"
              @click="setMode('select')">⭙ Stanzen … (Esc)</button>
      <!-- Höhen-Zug (Strg+Ziehen): einzelne Ecke oder die ganze Kante -->
      <button v-if="zModusVerfuegbar" class="f3d-tool"
              :class="{ active: zModus === 'kante' }"
              :title="zModus === 'kante'
                ? 'Strg+Ziehen hebt die GANZE Kante — Klick schaltet auf einzelne Ecke'
                : 'Strg+Ziehen hebt die einzelne Ecke — Klick schaltet auf ganze Kante'"
              @click="zModus = zModus === 'kante' ? 'ecke' : 'kante'">
        {{ zModus === 'kante' ? '▬ Kante' : '· Ecke' }}
      </button>
      <span class="f3d-toolbar-sep"></span>
      <button class="f3d-tool" :class="{ active: topView }"
              title="Koordinatentreue Draufsicht" @click="toggleTopView">
        Draufsicht
      </button>
      <button class="f3d-tool" :class="{ active: meshView }"
              title="Vernetzte Oberfläche der Netzvorschau (Solver-Zellen)"
              @click="toggleMeshView">
        Netz
      </button>
      <button class="f3d-tool" :class="{ active: clipActive }"
              title="Freischneiden: interaktive Klemm-Ebene der ANSICHT (Innenräume, Geländeeinbindung) — kein Eingriff ins Modell"
              @click="toggleClip">
        Freischneiden
      </button>
    </div>

    <div v-if="store.sculptAktiv" class="f3d-clipbar f3d-sculptbar">
      <button v-for="m in SCULPT_MODI" :key="m.id" class="f3d-tool"
              :class="{ active: sculpt.modus.value === m.id }" :title="m.hint"
              @click="sculpt.modus.value = m.id">{{ m.label }}</button>
      <span class="f3d-toolbar-sep"></span>
      <label class="f3d-small">Ø
        <input type="range" min="0.5" max="25" step="0.5"
               v-model.number="sculpt.radius.value" />
        <span class="f3d-mono">{{ sculpt.radius.value.toFixed(1) }} m</span>
      </label>
      <label class="f3d-small">Stärke
        <input type="range" min="0.1" max="1" step="0.05"
               v-model.number="sculpt.staerke.value" />
      </label>
      <button class="f3d-tool"
              :class="{ active: sculpt.form.value === 'quadrat' }"
              title="Pinselform: Kreis oder Quadrat"
              @click="sculpt.form.value =
                sculpt.form.value === 'kreis' ? 'quadrat' : 'kreis'">
        {{ sculpt.form.value === 'kreis' ? '◯' : '▢' }}
      </button>
      <button class="f3d-tool" :disabled="!sculpt.striche.value"
              title="Letzten Pinselstrich zurücknehmen (inverses Delta)"
              @click="sculpt.strichZurueck()">↩ Strich</button>
      <button class="f3d-tool" title="Formen beenden"
              @click="store.sculptAktiv = false">✓ Fertig</button>
      <span v-if="sculpt.modus.value === 'kante'" class="f3d-muted f3d-small">
        Über einer Bruchkante wird der Ring grün — das Gelände wird im
        Pinselbereich AUF ihr Höhenprofil gesetzt.
      </span>
      <span v-else-if="store.terrainSolid" class="f3d-muted f3d-small">
        Geformt wird die Deckfläche des Erdkörpers — Bohrungen und
        Aushübe ziehen nach jedem Strich mit.
      </span>
    </div>

    <div v-if="clipActive" class="f3d-clipbar">
      <select v-model="clipAxis" class="f3d-select f3d-select-s">
        <option value="x">x</option>
        <option value="y">y</option>
      </select>
      <input type="range" :min="clipRange[0]" :max="clipRange[1]" step="0.1"
             v-model.number="clipPos" />
      <span class="f3d-mono">{{ clipAxis }} = {{ clipPos.toFixed(1) }} m</span>
      <label class="f3d-check">
        <input type="checkbox" v-model="clipFlip" /> Richtung
      </label>
    </div>
    <div v-if="meshHint" class="f3d-meshhint f3d-muted f3d-small">{{ meshHint }}</div>
    <!-- Snappy-Vorschau direkt aus der Netz-Ansicht: voll oder schnell
         (ohne verschachtelte Verfeinerung) -->
    <div v-if="meshAngebot" class="f3d-meshhint f3d-meshangebot">
      <button class="f3d-btn" :disabled="store.meshPreviewLoading"
              title="blockMesh + snappyHexMesh mit allen Verfeinerungen — speichert den Fall, dauert einige Minuten"
              @click="meshRechnen(false)">▦ Netzvorschau rechnen</button>
      <button class="f3d-btn" :disabled="store.meshPreviewLoading"
              title="Ohne verschachtelte Verfeinerung: deutlich schneller, Zellzahl/Kosten als untere Grenze"
              @click="meshRechnen(true)">⚡ Schnell ohne Verfeinerung</button>
    </div>
    <div v-if="solverHint && !meshView" class="f3d-meshhint f3d-muted f3d-small">
      {{ solverHint }}
    </div>
    <!-- Lieber sagen, dass die Szene alt ist, als sie als aktuell ausgeben -->
    <div v-if="store.previewStale" class="f3d-veraltet">
      ⚠ Die Szene zeigt einen älteren Stand — der Entwurf ließ sich zuletzt
      nicht lesen. Der Prüfbereich rechts nennt den Grund.
    </div>
    <div v-else-if="store.terrainSolidStale" class="f3d-veraltet">
      ⚠ Erdkörper veraltet: das Raster ist zu groß, um ihn beim Ziehen neu zu
      bauen. Er wird beim Speichern nachgezogen.
    </div>

    <div v-if="dragDelta" class="f3d-dragdelta"
         :style="{ left: dragDelta.px + 'px', top: dragDelta.py + 'px' }">
      <span class="dd-x" :class="{ on: dragDelta.lock === 'x' }">
        Δx {{ fmtDelta(dragDelta.dx) }}</span>
      <span class="dd-y" :class="{ on: dragDelta.lock === 'y' }">
        Δy {{ fmtDelta(dragDelta.dy) }}</span>
      <span class="dd-z" :class="{ on: dragDelta.lock === 'z' }">
        Δz {{ fmtDelta(dragDelta.dz) }}</span>
    </div>

    <div v-if="rotInfo" class="f3d-stanzbar">
      <strong>⟳ Modellgebiet</strong>
      <span>{{ rotInfo }}</span>
    </div>

    <div v-if="mode === 'stanzen'" class="f3d-stanzbar">
      <strong>{{ stanzTitel }}</strong>
      <span>{{ stanzInfo || 'Auf den Körper zeigen …' }}</span>
      <button class="f3d-btn" @click="store.endPlatzierung()">Abbrechen</button>
    </div>

    <div class="f3d-editor3d-hint f3d-muted f3d-small">
      <template v-if="!auswahlAktiv">Auswahl aus — Klicks und Züge steuern nur die Kamera</template>
      <template v-else-if="mode === 'stanzen'">Auf den Körper zeigen · Mausrad ändert das Maß · Klick stanzt · Esc bricht ab</template>
      <template v-else-if="mode === 'select'">Klick wählt · Klick ins Leere oder Esc wählt ab · Ecken ziehbar (Raster-/Punktfang, Alt = frei) · Bohrung/Öffnung am Marker über den Körper ziehen · Entf löscht Ecke oder Bearbeitung · Strg+D dupliziert · Shift/Strg+Ziehen verschiebt · Strg = Z erzwingen · Doppelklick zentriert</template>
      <span v-if="coords" class="f3d-coords">{{ coords }}</span>
    </div>
  </div>
</template>

<script setup>
// Hauptansicht 3D des PreViewers (Spez. Kap. 6.1): Gelände, Bauwerke
// (serverseitige Vorschaugeometrie als STL), Verfeinerungsboxen als
// Drahtkörper, Randflächenmarkierungen, Querschnittslinien und Pegelpunkte.
// Klick-Selektion verbindet die Szene mit Objektbaum und Eigenschaftspanel.
// Die Fachlogik lebt in editor/*.js — hier bleiben Lebenszyklus, Modus-
// verwaltung und die Zeiger-Choreografie (wer bekommt welches Ereignis).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { usePreStore } from '../../stores/usePreStore'
import { erzeugeObjektZugriff } from './editor/objektZugriff'
import { erzeugeRotGizmo } from './editor/rotGizmo'
import { erzeugeSzene } from './editor/szene'
import { erzeugeSculpt } from './editor/sculpt'
import { erzeugeMarker, baueFokusMarke, fokusRadius } from './editor/marker'
import { erzeugeAchsen } from './editor/achsen'
import { erzeugePick } from './editor/pick'
import { erzeugeHandles } from './editor/handles'
import { erzeugeVerschieben } from './editor/verschieben'
import { erzeugeStanz } from './editor/stanz'
import { erzeugeNetzAnsicht } from './editor/netzAnsicht'
import { clipBereich, koerperBeschneiden, wendeClipAn } from './editor/clip'

const store = usePreStore()
const host = ref(null)

// Werkzeuge (Spez. Kap. 6.4): Klick-Platzierung gleichwertig zur
// numerischen Eingabe im Eigenschaftspanel.
const SCULPT_MODI = [
  { id: 'heben', label: '▲ Heben', hint: 'Gelände anheben' },
  { id: 'senken', label: '▼ Senken', hint: 'Gelände absenken' },
  { id: 'glaetten', label: '≈ Glätten', hint: 'Zum Mittel der Nachbarschaft relaxieren' },
  { id: 'kante', label: '⌇ Bruchkante', hint: 'Gelände im Pinselbereich auf das Höhenprofil der nächsten Bruchkante setzen' },
]

// Es gibt nur noch zwei Modi: `select` (Regelfall) und `stanzen`
// (Klick-Platzierung, vom Eigenschaftenpanel gestartet). Die früheren
// Werkzeuge Verschieben/Pegel/Querschnitt/Zeichnen sind entfernt —
// Verschieben lebt als Shift/Strg+Ziehen im Auswahlmodus weiter, neue
// Objekte entstehen über die ＋-Vorlagen im Objektbaum.
const mode = ref('select')
// Auswahl-Sperre (E4): aus = Klicks und Züge gehören ausschließlich der
// Kamera; nichts wird gewählt, gegriffen oder verschoben.
const auswahlAktiv = ref(true)
const topView = ref(false)
const meshView = ref(false)
const meshHint = ref('')
// Angebot „Netzvorschau jetzt rechnen?" in der Netz-Ansicht (E6)
const meshAngebot = ref(false)
const solverHint = ref('')
const clipActive = ref(false)
const clipAxis = ref('x')
const clipPos = ref(0)
const clipFlip = ref(false)
const clipRange = ref([0, 100])
const coords = ref('')

// Bohrung, Öffnung und Abschneiden werden nicht getippt, sondern auf den
// Körper gezeigt — die Logik lebt in editor/stanz.js, hier nur Maß + Titel
const stanzMass = ref({ d: 0.8, w: 1.2, h: 0.9 })
const stanzInfo = ref('')
const STANZ_TITEL = { bohrung: '⌀ Bohrung setzen', oeffnung: '▭ Öffnung setzen',
  schnitt: '✂ Abschneiden' }
const stanzTitel = computed(() =>
  STANZ_TITEL[store.platzierung?.art] ?? 'Bearbeitung setzen')

let renderer = null
let scene = null
let camera = null
let controls = null
let resizeObs = null
let rafId = 0
let fitted = false
let downPos = null
let lastHoverCheck = 0         // Hover-Raycasts drosseln (Frame-Budget)
let lastMove = null            // letztes pointermove-Event (für Entf-Löschen)
let rebuildPending = false     // Szenen-Rebuild bis Drag-Ende aufschieben

const groups = { terrain: null, solids: null, markers: null,
  stanz: null,
  mesh: null, handles: null }
const selectable = []          // Meshes mit userData { kind, id }
let highlighted = null

// Szenenaufbau — geschnitten nach editor/szene.js
const { terrainZ, clearGroup, buildTerrain, buildTerrainSolid,
  buildSolids } = erzeugeSzene({
  store, groups, selectable, holeScene: () => scene,
  solverHint })

// Gelände formen (Pinsel) — geschnitten nach editor/sculpt.js
const sculpt = erzeugeSculpt({
  store, groups, holeScene: () => scene, holeCamera: () => camera,
  holeRenderer: () => renderer, holeControls: () => controls,
  melden: (m, art) => store.melden(m, art) })

// Marker-Ebene — geschnitten nach editor/marker.js
const { buildMarkers } = erzeugeMarker({
  store, groups, selectable, holeScene: () => scene, clearGroup, terrainZ })

// Trefferermittlung (Strahlen, Boden-/Griff-/Objekt-Picks) — editor/pick.js
const { ray, planePick, groundPick, pickHandle, pickSelectable,
  pickEditMarker } = erzeugePick({
  store, groups, selectable, host, holeCamera: () => camera })

// Objektzugriff (Griffe, Verschieben, Fangpunkte) — geschnitten nach
// editor/objektZugriff.js; hier nur noch die Anbindung
const { translateObject, objectZable,
  collectSnapPoints, handleAccess, clampDomain, clampMarge } =
  erzeugeObjektZugriff({ store, holeGroups: () => groups })

// Achsenführung/Δ-Anzeige — geschnitten nach editor/achsen.js
const achsen = erzeugeAchsen({
  store, host, holeScene: () => scene, holeCamera: () => camera,
  holeControls: () => controls })
const { hideAxisGuides, dragDelta, fmtDelta } = achsen

// Höhen-Zug: einzelne Ecke oder ganze Kante? Nur sinnvoll bei Objekten
// mit Punkt-z (Wand, Wehr, Durchlass, Rechen, Bruchkante …).
const zModus = ref('ecke')       // 'ecke' | 'kante'
const zModusVerfuegbar = computed(() => {
  const sel = store.selection
  const access = sel && handleAccess(sel.kind, store.selectedObject)
  return !!access?.zJePunkt
})

// Beschnitt des Geländekörpers beim Gebietszug — editor/clip.js; der
// Wrapper reicht Renderer/Gruppen durch, die erst beim Mount existieren
function koerperZuschnitt(extent) {
  koerperBeschneiden({ renderer, teile: groups.terrain?.children ?? [],
    extent, clipAktiv: clipActive.value })
}

function _endDrag() {
  hideAxisGuides()
  // Beschnitt vom Gebietszug aufheben — der echte Körper kommt mit der
  // Entwurfsvorschau nach und braucht ihn nicht mehr
  koerperZuschnitt(null)
  dragDelta.value = null
  renderer.domElement.style.cursor = mode.value === 'select' ? 'default' : 'crosshair'
  if (rebuildPending) {
    rebuildPending = false
    rebuild()
  }
}

// --- Drehgriff für das Modellgebiet --------------------------------------
// Ein Rechengebiet muss achsparallel bleiben (blockMesh, Randflächennamen,
// Höhenraster hängen daran). Schief liegt nicht der Quader, sondern das
// Modell — also dreht dieser Griff das MODELL und der Quader legt sich neu
// darum. Drehgriff — geschnitten nach editor/rotGizmo.js; buildHandles
// über späte Bindung, weil Griffe und Drehgriff sich gegenseitig aufbauen.
const rot = erzeugeRotGizmo({
  store, groups, ray, planePick,
  clearGroup, buildHandles: () => handles.buildHandles(),
  holeSzene: () => ({ scene, renderer, controls }) })
const { rotInfo, rotAktiv, pickRotGizmo, startRotDrag,
  dragRotTo, cancelRotDrag, commitRotDrag } = rot

// Stützpunkthandles (Spez. 6.4) samt Zieh-Logik — editor/handles.js
const handles = erzeugeHandles({
  store, groups, holeScene: () => scene, holeRenderer: () => renderer,
  holeControls: () => controls, terrainZ, clearGroup, planePick, pickHandle,
  zugriff: { handleAccess, collectSnapPoints, clampDomain, clampMarge },
  achsen, rotGizmo: () => rot,
  imFremdenZug: () => verschieben.objektZugAktiv() || rotAktiv(),
  koerperZuschnitt, endDrag: _endDrag, coords, zModus })
const { buildHandles } = handles

// Ganzes Objekt und Randbedingungs-Fenster verschieben — editor/verschieben.js
const verschieben = erzeugeVerschieben({
  store, groups, holeScene: () => scene, holeRenderer: () => renderer,
  holeControls: () => controls, planePick,
  zugriff: { objectZable, translateObject }, achsen, coords,
  endDrag: _endDrag })

// Stanzen + Bearbeitungs-Marker ziehen — editor/stanz.js
const stanz = erzeugeStanz({
  store, groups, holeScene: () => scene, holeRenderer: () => renderer,
  holeControls: () => controls, clearGroup, ray, pickEditMarker,
  buildMarkers, stanzMass, stanzInfo, coords })

watch(() => store.platzierung, (p) => {
  stanz.reset()
  if (p) {
    mode.value = 'stanzen'
    if (store.selection?.id !== p.id) store.select('structure', p.id)
  } else if (mode.value === 'stanzen') {
    mode.value = 'select'
  }
})

watch(() => [store.selection, store.selectedObject], buildHandles,
  { deep: false })

function fitCamera() {
  const t = store.terrain
  if (!t || !camera) return
  const [ny, nx] = t.dims
  const w = (nx - 1) * t.resolution
  const h = (ny - 1) * t.resolution
  const cx = t.x0 + w / 2
  const cy = t.y0 + h / 2
  let zMid = 0
  for (let i = 0; i < t.z.length; i += 7) zMid += t.z[i]
  zMid /= Math.ceil(t.z.length / 7)
  controls.target.set(cx, cy, zMid)
  camera.position.set(cx, cy - Math.max(w, h) * 1.1, zMid + Math.max(w, h) * 0.75)
  camera.up.set(0, 0, 1)
  controls.update()
}

// --- Modusverwaltung ------------------------------------------------------

function setMode(m) {
  mode.value = m
}

// --- Interaktive Schnittebene (Spez. 6.4) — Logik in editor/clip.js --------

function clipSpanneSetzen() {
  if (!clipActive.value || !store.spec?.domain) return
  clipRange.value = clipBereich(store.spec.domain.extent, clipAxis.value)
  clipPos.value = (clipRange.value[0] + clipRange.value[1]) / 2
}

function toggleClip() {
  clipActive.value = !clipActive.value
  clipSpanneSetzen()
}

watch(clipAxis, clipSpanneSetzen)
watch([clipActive, clipAxis, clipPos, clipFlip], () => wendeClipAn(renderer, {
  aktiv: clipActive.value, axis: clipAxis.value,
  pos: clipPos.value, flip: clipFlip.value }))

// --- Solver-Netz der Vorschau (Rasteransicht) — editor/netzAnsicht.js ------

const { toggleMeshView, meshRechnen } = erzeugeNetzAnsicht({
  store, groups, holeScene: () => scene, clearGroup,
  meshView, meshHint, meshAngebot })

watch(meshView, (on) => {
  if (!on) {
    if (groups.terrain) groups.terrain.visible = true
    if (groups.solids) groups.solids.visible = true
  }
})

// --- Draufsicht (koordinatentreues Arbeiten, Spez. Kap. 6.1) --------------

let savedCam = null

function toggleTopView() {
  topView.value = !topView.value
  if (topView.value) {
    savedCam = {
      pos: camera.position.clone(),
      target: controls.target.clone(),
      up: camera.up.clone(),
    }
    const t = store.terrain
    const [ny, nx] = t ? t.dims : [10, 10]
    const w = t ? (nx - 1) * t.resolution : 100
    const h = t ? (ny - 1) * t.resolution : 100
    const cx = (t ? t.x0 : 0) + w / 2
    const cy = (t ? t.y0 : 0) + h / 2
    camera.up.set(0, 1, 0)
    camera.position.set(cx, cy, (savedCam.target.z || 95) + Math.max(w, h) * 1.2)
    makeControls()                       // Up-Achse gewechselt -> Controls neu
    controls.target.set(cx, cy, savedCam.target.z || 95)
  } else if (savedCam) {
    camera.up.copy(savedCam.up)
    camera.position.copy(savedCam.pos)
    makeControls()
    controls.target.copy(savedCam.target)
  }
  controls.update()
}

// --- Selektion ------------------------------------------------------------

function setHighlight(mesh) {
  if (highlighted?.material?.emissive) highlighted.material.emissive.setHex(0)
  highlighted = mesh
  if (mesh?.material?.emissive) mesh.material.emissive.setHex(0x666600)
}

function pick(e) {
  if (!auswahlAktiv.value) return
  const hitInfo = pickSelectable(e)
  if (hitInfo) {
    const { kind, id } = hitInfo.object.userData
    store.select(kind, id)
  } else if (store.selection) {
    // Klick ins Leere (oder außerhalb der Domain) wählt ab — vorher gab
    // es schlicht keinen Weg, eine Auswahl wieder loszuwerden
    store.deselect()
  }
}

watch(() => store.selection, (sel) => {
  if (!sel) { setHighlight(null); return }
  const mesh = selectable.find((m) => m.userData.kind === sel.kind
    && m.userData.id === sel.id)
  setHighlight(mesh ?? null)
})

// --- Lebenszyklus ---------------------------------------------------------

function makeControls() {
  // OrbitControls binden camera.up im Konstruktor — nach jedem Wechsel der
  // Up-Achse (Draufsicht!) müssen die Controls neu aufgebaut werden, sonst
  // dreht die Kamera um die falsche Achse.
  const oldTarget = controls?.target.clone()
  controls?.dispose()
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.12                   // straffer Stopp, wenig Nachlauf
  controls.rotateSpeed = 0.9
  controls.zoomToCursor = false                   // Pivot bleibt stabil
  controls.screenSpacePanning = false             // Schwenken in der Geländeebene
  controls.maxPolarAngle = Math.PI / 2 - 0.04     // nicht unter den Horizont
  controls.minDistance = 2
  controls.maxDistance = 600
  controls.enableRotate = !topView.value
  if (oldTarget) controls.target.copy(oldTarget)
  // Nach jedem Schwenk: Drehpunkt ins Modellgebiet einspannen
  controls.addEventListener('end', () => {
    const d = store.spec?.domain
    if (!d) return
    const [x0, y0, x1, y1] = d.extent
    controls.target.x = Math.min(Math.max(controls.target.x, x0), x1)
    controls.target.y = Math.min(Math.max(controls.target.y, y0), y1)
    controls.update()
  })
  controls.update()
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a101f)
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000)
  // WICHTIG: Up-Achse VOR dem Erzeugen der OrbitControls setzen — die
  // Controls übernehmen camera.up genau einmal im Konstruktor. Mit dem
  // Default-Y-hoch drehte die Horizontalbewegung um die falsche Achse
  // (oben/unten und links/rechts wirkten vertauscht).
  camera.up.set(0, 0, 1)
  renderer = new THREE.WebGLRenderer({ antialias: true })
  host.value.appendChild(renderer.domElement)
  makeControls()

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const sun = new THREE.DirectionalLight(0xffffff, 1.1)
  sun.position.set(1, -1, 2)
  scene.add(sun)

  const resize = () => {
    const w = host.value.clientWidth
    const h = host.value.clientHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resizeObs = new ResizeObserver(resize)
  resizeObs.observe(host.value)
  resize()

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downPos = [e.clientX, e.clientY]
    if (store.sculptAktiv) {
      if (e.button === 0) sculpt.strichStart(e)
      return
    }
    if (mode.value !== 'select') return
    if (e.button !== 0) return          // rechts/mitte bleibt der Kamera
    if (!auswahlAktiv.value) return     // Auswahl aus: alles gehört der Kamera
    const marke = pickEditMarker(e)
    if (marke) { stanz.startEditDrag(e, marke); return }
    // Drehgriff des Modellgebiets zuerst — er liegt über allem anderen
    if (store.selection?.kind === 'domain' && pickRotGizmo(e)) {
      if (startRotDrag(e)) return
    }
    // Griff oder „+"-Zwischenpunkt unterm Zeiger: Zug gehört den Handles
    if (handles.startHandleDrag(e)) return
    // Körper-Verschieben: nur mit gehaltener Shift-/Strg-Taste am bereits
    // gewählten Objekt — einfaches Ziehen gehört der Kamera (kein
    // versehentliches Verschieben mehr).
    const hitInfo = pickSelectable(e)
    if (!hitInfo) return
    const sel = store.selection
    const hitsSelected = sel && hitInfo.object.userData.kind === sel.kind
      && hitInfo.object.userData.id === sel.id
    if (hitInfo.object.userData.kind === 'boundary'
        && (e.shiftKey || e.ctrlKey) && hitsSelected) {
      verschieben.startBcDrag(e, hitInfo.object.userData.id)
      return
    }
    if ((e.shiftKey || e.ctrlKey) && hitsSelected) {
      verschieben.startObjectDrag(e, hitInfo)
    }
  })
  // Drehpunkt = Zentrum des VIEWERS: vor jedem Kamera-Zug wird der Pivot
  // auf den Geländepunkt unter der Bildschirmmitte gesetzt. Der Punkt liegt
  // auf der Blickachse — die Ansicht springt nicht, aber jede Drehung
  // kreist um das, was man gerade ansieht.
  function anchorPivotToViewCenter() {
    if (!groups.terrain) return
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    const hits = ray.intersectObjects(groups.terrain.children, false)
    if (hits.length) {
      controls.target.copy(hits[0].point)
      controls.update()
    }
  }

  // läuft NACH dem Haupt-Handler: wenn keine Objekt-Interaktion gestartet
  // wurde, arbeitet die Kamera — Pivot verankern + Faust-Cursor
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (store.sculptAktiv && e.button === 0) return
    const frei = !handles.zugAktiv() && !verschieben.objektZugAktiv()
      && !rotAktiv()
    if (e.button !== 2 && frei && !topView.value) {
      anchorPivotToViewCenter()
    }
    if (e.button === 0 && frei) {
      renderer.domElement.style.cursor = 'grabbing'
    }
  })

  // Drehpunkt NUR am ANFANG einer Zoom-Geste verankern. Vorher wurde alle
  // 150 ms mitten im Scrollen neu geankert — das Ziel sprang während des
  // Zooms und die Kamera zitterte (Fabios Befund Testrunde R2).
  let letztesRad = 0
  renderer.domElement.addEventListener('wheel', () => {
    const now = performance.now()
    const gestenStart = now - letztesRad > 400
    letztesRad = now
    if (gestenStart && !topView.value) anchorPivotToViewCenter()
  }, { passive: true })

  renderer.domElement.addEventListener('pointerup', (e) => {
    if (store.sculptAktiv) {
      sculpt.strichEnde()
      downPos = null
      return
    }
    if (rotAktiv()) {
      commitRotDrag()
      downPos = null
      return
    }
    if (verschieben.bcZugAktiv()) {
      verschieben.commitBcDrag()
      downPos = null
      return
    }
    if (handles.zugAktiv()) {
      handles.commitHandleDrag()
      downPos = null
      return
    }
    if (stanz.editZugAktiv()) {
      stanz.commitEditDrag()
      downPos = null
      return
    }
    if (verschieben.objektZugAktiv()) {
      verschieben.commitObjectDrag()
      downPos = null
      return
    }
    renderer.domElement.style.cursor =
      mode.value === 'select' ? 'default' : 'crosshair'
    // Nur die LINKE Taste klickt: ein Rechtsklick ohne Zug löste sonst
    // eine Selektion aus (der Bewegungs-Schwellwert prüfte nie e.button)
    if (e.button === 0 && downPos
        && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) < 5) {
      if (mode.value === 'stanzen') {
        stanz.stanzKlick(e)
      } else {
        pick(e)
      }
    }
    downPos = null
  })
  // Ohne eigenen Handler hing das Browser-Kontextmenü davon ab, ob
  // OrbitControls gerade enabled war — der Rechtsklick-Pan wirkte dadurch
  // „manchmal gestört". Das Menü hat im 3D-Editor nie einen Zweck.
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
  renderer.domElement.addEventListener('pointermove', (e) => {
    lastMove = e                      // für Entf (Ecke unterm Cursor löschen)
    if (store.sculptAktiv) {
      sculpt.strichZieh(e)
      return
    }
    if (rotAktiv()) {
      dragRotTo(e)
      return
    }
    if (verschieben.bcZugAktiv()) {
      verschieben.dragBcTo(e)
      return
    }
    if (handles.zugAktiv()) {
      handles.dragHandleTo(e)
      return
    }
    if (stanz.editZugAktiv()) {
      stanz.dragEditTo(e)
      return
    }
    if (verschieben.objektZugAktiv()) {
      verschieben.dragObjectTo(e)
      return
    }
    if (mode.value === 'stanzen') {
      // gleiche Drosselung wie beim Hover: die Vorschau wird bei jedem
      // Aufruf neu gebaut, 120 Hz wären reine Verschwendung
      const jetzt = performance.now()
      if (jetzt - lastHoverCheck < 40) return
      lastHoverCheck = jetzt
      renderer.domElement.style.cursor =
        stanz.stanzZeige(e) ? 'crosshair' : 'not-allowed'
      return
    }
    // Maustaste unten = die Kamera arbeitet. Dann darf die Hover-Logik
    // NICHT dazwischenfunken (controls mitten im Orbit umschalten war die
    // Ursache für das „übereinander greifende" Steuergefühl).
    if (e.buttons !== 0) return
    // Raycasts drosseln — Hover-Prüfung braucht keine 120 Hz
    const now = performance.now()
    if (now - lastHoverCheck < 40) return
    lastHoverCheck = now
    // Hover-Vorab-Sperre: das ROTIEREN muss schon vor dem pointerdown aus
    // sein, sonst startet die Kamerarotation zeitgleich mit dem Drag
    // (OrbitControls hängt früher am Canvas als unsere Handler). Gesperrt
    // wird NUR enableRotate — `enabled = false` schaltete früher auch den
    // Rechtsklick-Pan und das Zoomen mit ab („Pan manchmal gestört").
    // Gesperrt wird nur, was wirklich greifbar ist: Handles immer;
    // Objektkörper nur mit gehaltener Shift-/Strg-Taste (Strg =
    // Höhen-Verschieben — auch das braucht die Rotations-Sperre!).
    if (mode.value === 'select' && auswahlAktiv.value) {
      const overEdit = !!pickEditMarker(e)
      const overHandle = !overEdit && !!pickHandle(e)
      let overMovable = false
      if (!overEdit && !overHandle && (e.shiftKey || e.ctrlKey)
          && store.selection) {
        const hitInfo = pickSelectable(e)
        overMovable = !!hitInfo
          && hitInfo.object.userData.kind === store.selection.kind
          && hitInfo.object.userData.id === store.selection.id
      }
      const greifbar = overEdit || overHandle || overMovable
      controls.enableRotate = !topView.value && !greifbar
      renderer.domElement.style.cursor = greifbar ? 'grab' : 'default'
      if (overEdit) return
    } else {
      controls.enableRotate = !topView.value
      renderer.domElement.style.cursor =
        mode.value === 'stanzen' ? 'crosshair' : 'default'
    }
    const pt = groundPick(e)
    coords.value = pt
      ? `x = ${pt.x.toFixed(2)}  y = ${pt.y.toFixed(2)}  z = ${terrainZ(pt.x, pt.y).toFixed(2)} m`
      : ''
  })
  renderer.domElement.addEventListener('wheel', (e) => {
    // Beim Stanzen ändert das Rad das Maß statt der Kameradistanz — das
    // ist der schnellste Weg zur passenden Öffnung, ohne Zahlen zu tippen
    if (mode.value !== 'stanzen') return
    e.preventDefault()
    e.stopPropagation()
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const m = { ...stanzMass.value }
    if (store.platzierung?.art === 'bohrung') {
      m.d = Math.min(Math.max(m.d * f, 0.05), 50)
    } else if (e.shiftKey) {
      m.h = Math.min(Math.max(m.h * f, 0.05), 50)
    } else {
      m.w = Math.min(Math.max(m.w * f, 0.05), 50)
    }
    stanzMass.value = m
    stanz.updateStanzPreview()
  }, { passive: false, capture: true })
  renderer.domElement.addEventListener('dblclick', (e) => {
    // Doppelklick zentriert die Kamera auf den Geländepunkt
    const pt = groundPick(e)
    if (pt) {
      controls.target.set(pt.x, pt.y, pt.z)
      controls.update()
    }
  })
  window.addEventListener('keydown', onKeydown)

  const animate = () => {
    rafId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()

  if (import.meta.env.DEV) {
    // Projektionshelfer für UI-Tests: Weltpunkt -> Bildschirmkoordinaten
    window.__f3dProject = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z).project(camera)
      const rect = renderer.domElement.getBoundingClientRect()
      return [rect.left + ((v.x + 1) / 2) * rect.width,
        rect.top + ((1 - (v.y + 1) / 2) / 1) * rect.height]
    }
    window.__f3dHandles = () => (groups.handles?.children ?? [])
      .filter((c) => c.userData.handleIdx != null)
      .map((c) => {
        const w = new THREE.Vector3()
        c.getWorldPosition(w)
        return [c.userData.handleIdx, Number(w.x.toFixed(2)),
          Number(w.y.toFixed(2)), Number(w.z.toFixed(2))]
      })
  }

  rebuild()
})

function rebuild() {
  if (!scene) return
  // Nicht mitten im Drag die Szene unter dem Cursor wegziehen —
  // die Live-Vorschau wartet, bis der Zug abgeschlossen ist.
  if (handles.zugAktiv() || verschieben.objektZugAktiv()) {
    rebuildPending = true
    return
  }
  buildTerrain()
  buildSolids()
  buildMarkers()
  if (!fitted && store.terrain) {
    fitCamera()
    fitted = true
  }
}

watch(() => store.sculptAktiv, (an) => {
  if (an) {
    if (!sculpt.aktivieren()) { store.sculptAktiv = false; return }
  } else {
    sculpt.deaktivieren()
  }
})

watch(() => store.geometryVersion, rebuild)
// Marker (Pegel/Schnitte/Boxen/Ränder/Vorfüllungen/Vermessungskanten)
// folgen der Spec auch ohne Speichern
watch(() => JSON.stringify([store.spec?.evaluation, store.spec?.mesh?.refinements,
  store.spec?.boundaries, store.spec?.solver?.vorfuellungen,
  store.spec?.terrain?.kanten]),
() => { buildMarkers() })

// Stützpunkt aus der Punktliste hervorheben. Eigene Gruppe statt eines
// Eintrags in `markers`: das hängt am Zeiger und darf nicht bei jedem
// Überfahren die ganze Markerebene neu bauen — Aufbau in editor/marker.js.
let fokusMarke = null

watch(() => store.fokusPunkt, (p) => {
  if (!scene) return
  if (!fokusMarke) {
    fokusMarke = baueFokusMarke()
    scene.add(fokusMarke.g)
  }
  if (!p) { fokusMarke.g.visible = false; return }
  fokusMarke.kugel.scale.setScalar(fokusRadius(store.spec?.domain?.extent))
  fokusMarke.g.position.set(p.x, p.y, p.z)
  fokusMarke.lot.scale.set(1, 1, Math.max(p.z - (store.spec?.domain?.z_min ?? p.z), 0.01))
  fokusMarke.g.visible = true
})

function _typing() {
  const tag = document.activeElement?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// Strg+D: gewähltes Objekt versetzt duplizieren — addObject vergibt
// selbst eindeutige id/patch (Suffix _n)
function duplicateSelected() {
  const sel = store.selection
  const obj = store.selectedObject
  if (!sel || !obj) return false
  const clone = JSON.parse(JSON.stringify(obj))
  const g = store.spec?.mesh?.base_cell ?? 0.5
  translateObject(sel.kind, clone, 2 * g, 2 * g)
  store.addObject(sel.kind, clone)
  return true
}

function onKeydown(e) {
  // Bei offenem Dialog gehört die Tastatur dem Dialog — sonst brach
  // Escape im Hintergrund unsichtbar die Platzierung ab
  if (store.dialogOffen) return
  if (e.key === 'Escape') {
    if (rotAktiv()) { cancelRotDrag(); return }
    if (store.platzierung) { store.endPlatzierung(); return }
    if (store.selection) store.deselect()
    mode.value = 'select'
    return
  }
  if (_typing()) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    if (duplicateSelected()) e.preventDefault()
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace')
      && !handles.zugAktiv() && !verschieben.objektZugAktiv()) {
    if (!stanz.deleteHoveredEdit(lastMove)) handles.deleteHoveredCorner(lastMove)
  }
}

onBeforeUnmount(() => {
  if (store.sculptAktiv) {
    sculpt.deaktivieren()
    store.sculptAktiv = false
  }
  cancelAnimationFrame(rafId)
  resizeObs?.disconnect()
  window.removeEventListener('keydown', onKeydown)
  clearGroup('terrain'); clearGroup('solids'); clearGroup('markers')
  clearGroup('mesh'); clearGroup('handles')
  clearGroup('stanz'); clearGroup('rotbox')
  controls?.dispose()
  renderer?.dispose()
})
</script>

<style scoped>
.f3d-editor3d {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--f3d-border);
}
.f3d-editor3d :deep(canvas) { display: block; }
.f3d-stanzbar {
  position: absolute;
  top: 3.2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  background: rgba(20, 26, 40, 0.92);
  border: 1px solid #ffd24d;
  color: #ffe9a8;
  font-size: 0.82rem;
  z-index: 6;
}

.f3d-editor3d-hint {
  position: absolute;
  left: 10px;
  bottom: 8px;
  pointer-events: none;
  display: flex;
  gap: 16px;
}
.f3d-coords { font-variant-numeric: tabular-nums; }
.f3d-dragdelta {
  position: absolute;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 9px;
  background: rgba(7, 11, 20, 0.88);
  border: 1px solid var(--f3d-border);
  border-radius: 7px;
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  white-space: nowrap;
}
.f3d-dragdelta .dd-x { color: var(--f3d-bad); }
.f3d-dragdelta .dd-y { color: var(--f3d-good); }
.f3d-dragdelta .dd-z { color: var(--f3d-accent); }
.f3d-dragdelta span { opacity: 0.65; }
.f3d-dragdelta span.on { opacity: 1; font-weight: 700; }
.f3d-meshhint {
  position: absolute;
  top: 48px;
  left: 10px;
}
/* Knopfzeile unter dem Hinweistext — beide sind absolut, sonst überlappen sie */
.f3d-meshangebot {
  top: 84px;
  display: flex;
  gap: 0.5rem;
}
.f3d-meshhint {
  /* ohne max-width wuchs der Stale-Text bis unter die Clip-Leiste */
  max-width: min(520px, calc(100% - 380px));
  z-index: 5;
  background: rgba(10, 16, 31, 0.9);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  padding: 6px 10px;
}
.f3d-veraltet {
  position: absolute;
  /* lag exakt auf der Clip-/Sculpt-Leiste (beide top:48/right:10) und
     verdeckte sie mit z-index 6 vollständig — ausgerechnet dann, wenn man
     wegen des veralteten Netzes hineinschauen will */
  bottom: 10px;
  right: 10px;
  max-width: 320px;
  z-index: 6;
  background: rgba(10, 16, 31, 0.94);
  border: 1px solid var(--f3d-warn);
  border-left-width: 3px;
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--f3d-warn);
  font-size: 0.72rem;
  line-height: 1.35;
}
.f3d-clipbar {
  position: absolute;
  top: 48px;
  right: 10px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(10, 16, 31, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid var(--f3d-border);
  border-radius: 10px;
  padding: 6px 10px;
  width: 340px;
}
.f3d-clipbar input[type='range'] { flex: 1; min-width: 0; }
/* .f3d-sculptbar war NIRGENDS definiert und erbte die 340-px-Box der
   Clip-Leiste — hinein müssen aber vier Modusknöpfe, zwei Regler, drei
   Aktionen und ein Erklärtext (~900 px Bedarf). Eigene, breitere und
   umbrechende Box; sie sitzt tiefer, damit sie sich nicht mit der
   Clip-Leiste deckt, wenn beides aktiv ist. */
.f3d-clipbar.f3d-sculptbar {
  width: min(520px, calc(100% - 20px));
  flex-wrap: wrap;
  top: 92px;
  z-index: 6;
}
.f3d-select-s { width: 56px; }
.f3d-mono {
  font-variant-numeric: tabular-nums;
  color: var(--f3d-text-2);
  font-size: 0.75rem;
  white-space: nowrap;
}
.f3d-check {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--f3d-text-2);
  font-size: 0.75rem;
}
.f3d-toolbar {
  position: absolute;
  top: 8px;
  left: 10px;
  z-index: 5;
  display: flex;
  gap: 4px;
  align-items: center;
  /* Elf Knöpfe brauchen rund 900 px; die Szene hat bei einem
     1440er-Notebook nur ~850. Ohne Umbruch schnitt overflow:hidden am
     Container „Netz“ und „Freischneiden“ ab — die Knöpfe waren schlicht
     nicht erreichbar. Rechts bleibt Platz für die Clip-/Sculpt-Leiste. */
  flex-wrap: wrap;
  /* Rechts bleibt Platz für die Clip-/Sculpt-Leiste, aber nie so wenig,
     dass die Leiste zum Turm wird: unter ~800 px Szenenbreite hat die
     Werkzeugleiste Vorrang (die Clip-Leiste erscheint ohnehin nur, wenn
     Freischneiden aktiv ist). Fenster unter ~1100 px bleiben ein Fall
     für die Breakpoints in Runde 3. */
  max-width: max(340px, calc(100% - 370px));
  background: rgba(10, 16, 31, 0.78);
  backdrop-filter: blur(8px);
  border: 1px solid var(--f3d-border);
  border-radius: 10px;
  padding: 4px;
}
.f3d-tool {
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--f3d-text-2);
  font-size: 0.78rem;
  padding: 4px 9px;
  cursor: pointer;
}
.f3d-tool:hover { color: var(--f3d-text); }
.f3d-tool.active {
  color: var(--f3d-text);
  border-color: var(--f3d-accent);
  background: var(--f3d-surface);
}
.f3d-toolbar-sep {
  width: 1px;
  height: 18px;
  background: var(--f3d-border);
  margin: 0 3px;
}
</style>
