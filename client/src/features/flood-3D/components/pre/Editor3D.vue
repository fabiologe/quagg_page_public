<template>
  <div class="f3d-editor3d" ref="host">
    <div class="f3d-toolbar">
      <button v-for="t in TOOLS" :key="t.id" class="f3d-tool"
              :class="{ active: mode === t.id }" :title="t.hint"
              @click="setMode(t.id)">{{ t.label }}</button>
      <!-- Stanzen wird vom Eigenschaftenpanel gestartet und war in
           der Werkzeugleiste UNSICHTBAR: kein Werkzeug wirkte aktiv,
           obwohl jeder Klick stanzte. -->
      <button v-if="mode === 'stanzen'" class="f3d-tool active"
              title="Öffnung am Körper platzieren — Mausrad ändert das Maß, Esc bricht ab"
              @click="setMode('select')">⭙ Stanzen … (Esc)</button>
      <span class="f3d-toolbar-sep"></span>
      <button class="f3d-tool" :class="{ active: topView }"
              title="Koordinatentreue Draufsicht" @click="toggleTopView">
        Draufsicht
      </button>
      <button class="f3d-tool" :class="{ active: solverView }"
              :disabled="!!store.terrainSolid"
              :title="store.terrainSolid
                ? 'Nicht nötig: der Fall zeigt bereits den Geländekörper, den der Vernetzer bekommt'
                : 'Gelände auf die Basiszelle abgetastet — so grob sieht es der Vernetzer'"
              @click="solverView = !solverView">
        Solverblick
      </button>
      <button class="f3d-tool" :class="{ active: drahtgitter }"
              :disabled="!!store.terrainSolid"
              :title="store.terrainSolid
                ? 'Der Fall zeigt den Geländekörper — dort gibt es das Rasterdreiecksnetz nicht'
                : 'Geländefläche als Drahtgitter statt schattiert: die Schummerung glättet optisch, was im Raster steht'"
              @click="drahtgitter = !drahtgitter">
        Drahtgitter
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
        Über einer Bruchkante wird der Ring grün — das Gelände zieht sich
        an ihr Höhenprofil.
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

    <div v-if="chooserPts" class="f3d-chooser">
      <span class="f3d-muted f3d-small">
        {{ chooserPts.length }} Punkte — was soll entstehen?
      </span>
      <button v-for="opt in drawTargets" :key="opt.label" class="f3d-btn"
              @click="createFromDrawing(opt)">{{ opt.label }}</button>
      <button class="f3d-btn" @click="cancelDrawing">Abbrechen</button>
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
      <template v-if="mode === 'select'">Klick wählt · Ecken ziehbar (Raster-/Punktfang, Alt = frei) · Bohrung/Öffnung am Marker über den Körper ziehen · Entf löscht Ecke oder Bearbeitung · Strg+D dupliziert · Shift/Strg+Ziehen verschiebt · Strg = Z erzwingen · Doppelklick zentriert</template>
      <template v-else-if="mode === 'move'">Objekt anklicken und ziehen · Zug entlang einer Führungslinie rastet ein (Strg = Z erzwingen) · daneben ziehen dreht die Kamera</template>
      <template v-else-if="mode === 'gauge'">Klick ins Gelände setzt einen Pegelpunkt</template>
      <template v-else-if="mode === 'section'">Zwei Klicks spannen die Querschnittslinie auf</template>
      <template v-else>Klicks setzen Punkte · Doppelklick schließt ab · Esc bricht ab</template>
      <span v-if="coords" class="f3d-coords">{{ coords }}</span>
    </div>
  </div>
</template>

<script setup>
// Hauptansicht 3D des PreViewers (Spez. Kap. 6.1): Gelände, Bauwerke
// (serverseitige Vorschaugeometrie als STL), Verfeinerungsboxen als
// Drahtkörper, Randflächenmarkierungen, Querschnittslinien und Pegelpunkte.
// Klick-Selektion verbindet die Szene mit Objektbaum und Eigenschaftspanel.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { usePreStore } from '../../stores/usePreStore'
import { flood3dApi } from '../../services/api'
import { b64ToBuffer } from '../../services/volume'
import { erzeugeObjektZugriff } from './editor/objektZugriff'
import { erzeugeRotGizmo } from './editor/rotGizmo'
import { erzeugeSzene } from './editor/szene'
import { erzeugeSculpt } from './editor/sculpt'
import { erzeugeMarker } from './editor/marker'
import { erzeugeAchsen } from './editor/achsen'

const store = usePreStore()
const host = ref(null)

// Werkzeuge (Spez. Kap. 6.4): Klick-Platzierung gleichwertig zur
// numerischen Eingabe im Eigenschaftspanel.
const SCULPT_MODI = [
  { id: 'heben', label: '▲ Heben', hint: 'Gelände anheben' },
  { id: 'senken', label: '▼ Senken', hint: 'Gelände absenken' },
  { id: 'glaetten', label: '≈ Glätten', hint: 'Zum Mittel der Nachbarschaft relaxieren' },
  { id: 'kante', label: '⌇ Bruchkante', hint: 'Gelände ans Höhenprofil der nächsten Bruchkante heranziehen' },
]

const TOOLS = [
  { id: 'select', label: 'Auswählen', hint: 'Objekte anklicken · Ecken ziehen · Shift+Ziehen verschiebt' },
  { id: 'move', label: '✥ Verschieben', hint: 'Objekt anklicken und ziehen' },
  { id: 'gauge', label: '+ Pegel', hint: 'Pegelpunkt per Klick setzen' },
  { id: 'section', label: '+ Querschnitt', hint: 'Querschnittslinie mit 2 Klicks' },
  { id: 'draw', label: '✏ Zeichnen', hint: 'Polygon/Polylinie für neue Objekte' },
]
const mode = ref('select')
const topView = ref(false)
const meshView = ref(false)
const meshHint = ref('')
const solverView = ref(false)     // Gelände in Solver-Auflösung zeigen
// Geländefläche als Drahtgitter statt schattiert. Die Schummerung glättet
// optisch, was im Raster steht; das Gitter zeigt jede Zelle einzeln.
const drahtgitter = ref(false)
const solverHint = ref('')
const clipActive = ref(false)
const clipAxis = ref('x')
const clipPos = ref(0)
const clipFlip = ref(false)
const clipRange = ref([0, 100])
const coords = ref('')
const drawPts = ref([])          // [[x,y], ...] der aktuellen Zeichnung
const chooserPts = ref(null)     // abgeschlossene Zeichnung -> Zielauswahl
const ringGeschlossen = ref(false)  // per Klick auf den ersten Punkt

// --- Bearbeitung einzeichnen ("stanzen") ---------------------------------
// Bohrung, Öffnung und Abschneiden werden nicht getippt, sondern auf den
// Körper gezeigt: Vorschau folgt dem Cursor auf der Oberfläche, Mausrad
// ändert das Maß, Klick stanzt. Die Bohrrichtung kommt aus der Normalen
// der getroffenen Fläche — genau so bohrt man auch in echt.
const stanzMass = ref({ d: 0.8, w: 1.2, h: 0.9 })
const stanzInfo = ref('')
const STANZ_TITEL = { bohrung: '⌀ Bohrung setzen', oeffnung: '▭ Öffnung setzen',
  schnitt: '✂ Abschneiden' }
const stanzTitel = computed(() =>
  STANZ_TITEL[store.platzierung?.art] ?? 'Bearbeitung setzen')
let stanzHit = null              // { punkt: Vector3, normale: Vector3 }

// Zeichnen erzeugt ein CAD-OBJEKT (Skizze = Import aus der Hand); der
// Chooser ist die ZUORDNUNG — dieselben Rollen wie beim Dateiimport,
// nachträglich im Baum änderbar. Die früheren build*-Funktionen leben
// als Rollen-Vorbelegungen im Backend (importer._linien_objekt).
const drawTargets = computed(() => {
  const n = chooserPts.value?.length ?? 0
  const line = [
    { label: 'Gerinne', rolle: 'gerinne' },
    { label: 'Wand', rolle: 'wand' },
    { label: 'Dammschüttung', rolle: 'damm' },
    { label: 'Stutzen (Rohr)', rolle: 'stutzen' },
    { label: 'Bruchkante', rolle: 'bruchkante' },
    { label: 'Querschnitt', rolle: 'querschnitt' },
  ]
  const poly = [
    { label: 'Planum', rolle: 'planum', geschlossen: true },
    { label: 'Becken', rolle: 'becken', geschlossen: true },
    { label: 'Verfeinerungsbox', rolle: 'verfeinerung', geschlossen: true },
    { label: '3D-Körper (Prisma)', rolle: 'koerper', geschlossen: true },
    { label: 'Vorfüllung (Startwasser)', rolle: 'vorfuellung', geschlossen: true },
  ]
  if (ringGeschlossen.value) return poly
  return n >= 3 ? [...poly, ...line] : line
})


let renderer = null
let scene = null
let camera = null
let controls = null
let resizeObs = null
let rafId = 0
let fitted = false
let downPos = null
let lastHoverCheck = 0         // Hover-Raycasts drosseln (Frame-Budget)

const groups = { terrain: null, solids: null, markers: null, preview: null,
  stanz: null,
  mesh: null, handles: null }
const selectable = []          // Meshes mit userData { kind, id }
let highlighted = null

// Szenenaufbau — geschnitten nach editor/szene.js
const { terrainZ, clearGroup, buildTerrain, buildTerrainSolid,
  feinsteZelle, buildSolids } = erzeugeSzene({
  store, groups, selectable, holeScene: () => scene,
  solverView, drahtgitter, solverHint })

// Gelände formen (Pinsel) — geschnitten nach editor/sculpt.js
const sculpt = erzeugeSculpt({
  store, groups, holeScene: () => scene, holeCamera: () => camera,
  holeRenderer: () => renderer, holeControls: () => controls,
  melden: (m, art) => store.melden(m, art) })

// Marker-Ebene — geschnitten nach editor/marker.js
const { buildMarkers } = erzeugeMarker({
  store, groups, selectable, holeScene: () => scene, clearGroup, terrainZ })

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

// --- Werkzeuge: Klick-Platzierung und Zeichnen ----------------------------

function setMode(m) {
  mode.value = m
  cancelDrawing()
}

function cancelDrawing() {
  ringGeschlossen.value = false
  zeichenLock = null
  schliessNah = false
  drawPts.value = []
  chooserPts.value = null
  updatePreview(null)
}

function groundPick(e) {
  if (!groups.terrain) return null
  const rect = host.value.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1)
  const ray = new THREE.Raycaster()
  ray.setFromCamera(ndc, camera)
  const hits = ray.intersectObjects(groups.terrain.children, false)
  return hits.length ? hits[0].point : null
}

// --- Zeichen-Fang: Punktfang > Achsfang > Rasterfang (Alt = aus) ----------
// Dieselben Fänge wie beim Griff-Ziehen, nur fürs Zeichnen: der nächste
// Klickpunkt fängt auf vorhandene Stützpunkte (12 px), auf die X/Y-Achse
// durch den letzten Punkt (±14°) und aufs Basiszellraster. Der ERSTE
// eigene Punkt ist zugleich die Schließ-Geste fürs Polygon.
const SCHLIESS_PX = 14
let zeichenLock = null           // 'x' | 'y' | null (Achsfang-Hysterese)
let schliessNah = false          // Cursor überm ersten Punkt

function _px(p3) {
  const v = new THREE.Vector3(p3[0], p3[1], p3[2] ?? terrainZ(p3[0], p3[1]))
    .project(camera)
  const rect = host.value.getBoundingClientRect()
  return [(v.x + 1) / 2 * rect.width + rect.left,
    (-v.y + 1) / 2 * rect.height + rect.top]
}

function fangBeimZeichnen(pt, e) {
  schliessNah = false
  if (!pt) return null
  let p = [pt.x, pt.y]
  if (e?.altKey) { zeichenLock = null; return p }

  // 1) Schließpunkt: der eigene erste Punkt gewinnt gegen alles
  const eigene = drawPts.value
  if (mode.value === 'draw' && eigene.length >= 3) {
    const [sx, sy] = _px(eigene[0])
    if (Math.hypot(e.clientX - sx, e.clientY - sy) < SCHLIESS_PX) {
      schliessNah = true
      zeichenLock = null
      return [...eigene[0]]
    }
  }
  // 2) Punktfang auf fremde Stützpunkte
  let best = null
  for (const s of collectSnapPoints()) {
    const [px, py] = _px(s)
    const d = Math.hypot(e.clientX - px, e.clientY - py)
    if (d < 12 && (!best || d < best.d)) best = { p: [s[0], s[1]], d }
  }
  if (best) { zeichenLock = null; return best.p }
  // 3) Achsfang relativ zum letzten Punkt (mit Hysterese wie beim Ziehen)
  const letzter = eigene[eigene.length - 1]
  if (letzter) {
    const dx = p[0] - letzter[0]
    const dy = p[1] - letzter[1]
    const winkel = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx))) * 180 / Math.PI
    const enter = 14
    const exit = 26
    if (zeichenLock === 'x' ? winkel < exit : winkel < enter) {
      zeichenLock = 'x'
      p = [p[0], letzter[1]]
    } else if (zeichenLock === 'y' ? winkel > 90 - exit : winkel > 90 - enter) {
      zeichenLock = 'y'
      p = [letzter[0], p[1]]
    } else {
      zeichenLock = null
    }
  }
  // 4) Rasterfang auf die Basiszelle
  const zelle = store.spec?.mesh?.base_cell
  if (zelle && !e?.ctrlKey) {
    p = [Math.round(p[0] / zelle) * zelle, Math.round(p[1] / zelle) * zelle]
  }
  return [Number(p[0].toFixed(2)), Number(p[1].toFixed(2))]
}

function updatePreview(hoverPt) {
  if (groups.preview) {
    clearGroup('preview')
  }
  const pts = drawPts.value
  if (!pts.length && !chooserPts.value) return
  groups.preview = new THREE.Group()
  const shown = chooserPts.value ?? pts
  const v3 = shown.map(([x, y]) =>
    new THREE.Vector3(x, y, terrainZ(x, y) + 0.5))
  if (hoverPt && !chooserPts.value) {
    v3.push(new THREE.Vector3(hoverPt.x, hoverPt.y,
      terrainZ(hoverPt.x, hoverPt.y) + 0.5))
  }
  if (v3.length > 1) {
    groups.preview.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(v3),
      new THREE.LineBasicMaterial({ color: 0xffffff })))
  }
  // Achs-Führungslinie durch den letzten Punkt (Fang aktiv)
  if (zeichenLock && pts.length && hoverPt && !chooserPts.value) {
    const l = pts[pts.length - 1]
    const z = terrainZ(l[0], l[1]) + 0.5
    const w = 500
    const a = zeichenLock === 'x'
      ? [new THREE.Vector3(l[0] - w, l[1], z), new THREE.Vector3(l[0] + w, l[1], z)]
      : [new THREE.Vector3(l[0], l[1] - w, z), new THREE.Vector3(l[0], l[1] + w, z)]
    const g = new THREE.Line(new THREE.BufferGeometry().setFromPoints(a),
      new THREE.LineDashedMaterial({ color: zeichenLock === 'x' ? 0xe66767
        : 0x34c98a, dashSize: 0.6, gapSize: 0.4, transparent: true,
      opacity: 0.7 }))
    g.computeLineDistances()
    groups.preview.add(g)
  }
  // Schließring am ersten Punkt, sobald das Polygon möglich ist
  if (pts.length >= 3 && !chooserPts.value) {
    const z0 = terrainZ(pts[0][0], pts[0][1]) + 0.5
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.45, 20),
      new THREE.MeshBasicMaterial({ color: schliessNah ? 0x34c98a : 0xd9a326,
        side: THREE.DoubleSide, depthTest: false }))
    ring.position.set(pts[0][0], pts[0][1], z0)
    groups.preview.add(ring)
  }
  for (const p of v3.slice(0, shown.length)) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }))
    m.position.copy(p)
    groups.preview.add(m)
  }
  scene.add(groups.preview)
}

// --- Bearbeitung auf den Körper zeichnen ---------------------------------

// Mesh des gerade bearbeiteten Bauwerks (nur DAS wird angepeilt — sonst
// bohrt man versehentlich durch den Nachbarkörper)
function stanzMesh() {
  const id = store.platzierung?.id
  if (!id || !groups.solids) return null
  return groups.solids.children.find((c) => c.userData?.id === id) ?? null
}

function stanzPick(e) {
  const m = stanzMesh()
  if (!m) return null
  const hits = _ray(e).intersectObjects([m], false)
  if (!hits.length) return null
  const h = hits[0]
  const n = h.face
    ? h.face.normal.clone().applyMatrix3(
      new THREE.Matrix3().getNormalMatrix(m.matrixWorld)).normalize()
    : new THREE.Vector3(0, 0, 1)
  return { punkt: h.point.clone(), normale: n }
}

// Ausrichtung der Vorschau: Normale der getroffenen Fläche
function _stanzQuat(normale) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), normale.clone().normalize())
}

function updateStanzPreview() {
  clearGroup('stanz')
  const p = store.platzierung
  if (!p || !stanzHit) { stanzInfo.value = ''; return }
  const g = new THREE.Group()
  const { punkt, normale } = stanzHit
  const farbe = 0xffd24d
  const linie = new THREE.LineBasicMaterial({ color: farbe, depthTest: false })
  const flaeche = new THREE.MeshBasicMaterial({ color: farbe, depthTest: false,
    transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  const m = stanzMass.value

  if (p.art === 'schnitt') {
    // waagerechte Ebene auf Trefferhöhe, so groß wie der Körper
    const mesh = stanzMesh()
    const box = new THREE.Box3().setFromObject(mesh)
    const bx = Math.max(box.max.x - box.min.x, 1) * 1.15
    const by = Math.max(box.max.y - box.min.y, 1) * 1.15
    const geo = new THREE.PlaneGeometry(bx, by)
    const ebene = new THREE.Mesh(geo, flaeche)
    ebene.position.set((box.min.x + box.max.x) / 2,
      (box.min.y + box.max.y) / 2, punkt.z)
    g.add(ebene)
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), linie)
      .translateX(ebene.position.x).translateY(ebene.position.y)
      .translateZ(punkt.z))
    stanzInfo.value = `Abschneiden bei z = ${punkt.z.toFixed(2)} m · `
      + 'Klick schneidet alles darüber weg · Esc bricht ab'
  } else {
    const senkrecht = Math.abs(normale.z) > 0.7
    const q = _stanzQuat(normale)
    const gruppe = new THREE.Group()
    if (p.art === 'bohrung') {
      const ring = new THREE.RingGeometry(m.d / 2 * 0.97, m.d / 2, 40)
      gruppe.add(new THREE.Mesh(ring, flaeche))
      gruppe.add(new THREE.LineLoop(
        new THREE.CircleGeometry(m.d / 2, 40), linie))
      stanzInfo.value = `Bohrung ⌀ ${m.d.toFixed(2)} m `
        + `(${senkrecht ? 'senkrecht' : 'waagerecht'}) · Mausrad ändert das `
        + 'Maß · Klick stanzt · Esc bricht ab'
    } else {
      const rechteck = new THREE.PlaneGeometry(m.w, m.h)
      gruppe.add(new THREE.Mesh(rechteck, flaeche))
      gruppe.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(rechteck), linie))
      stanzInfo.value = `Öffnung ${m.w.toFixed(2)} × ${m.h.toFixed(2)} m · `
        + 'Mausrad = Breite, Shift+Rad = Höhe · Klick stanzt · Esc bricht ab'
    }
    // Bohrachse als Strich, damit die Richtung sichtbar ist
    const tiefe = 1.5
    gruppe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, 0, -tiefe)]), linie))
    gruppe.quaternion.copy(q)
    gruppe.position.copy(punkt).addScaledVector(normale, 0.02)
    g.add(gruppe)
  }
  g.renderOrder = 999
  groups.stanz = g
  scene.add(g)
}

function stanzKlick() {
  const p = store.platzierung
  if (!p || !stanzHit) return
  const { punkt, normale } = stanzHit
  const r2 = (v) => Number(v.toFixed(2))
  const nr = ((store.selectedObject?.edits?.length) ?? 0) + 1
  let edit
  if (p.art === 'schnitt') {
    edit = { id: `schnitt_${nr}`, type: 'schnitt', achse: 'z',
      position: r2(punkt.z), behalten: 'unter' }
  } else {
    const senkrecht = Math.abs(normale.z) > 0.7
    const nxy = new THREE.Vector2(normale.x, normale.y)
    if (nxy.lengthSq() < 1e-9) nxy.set(0, 1)
    nxy.normalize()
    const m = stanzMass.value
    edit = { id: `${p.art}_${nr}`, type: 'aussparung',
      shape: p.art === 'bohrung' ? 'kreis' : 'rechteck',
      point: [r2(punkt.x), r2(punkt.y)],
      direction: [r2(nxy.x), r2(nxy.y)],
      z: r2(punkt.z), vertikal: senkrecht }
    if (p.art === 'bohrung') edit.diameter = r2(m.d)
    else { edit.width = r2(m.w); edit.height = r2(m.h) }
  }
  store.addEdit(p.id, edit)
  store.endPlatzierung()
}

watch(() => store.platzierung, (p) => {
  stanzHit = null
  clearGroup('stanz')
  stanzInfo.value = ''
  if (p) {
    mode.value = 'stanzen'
    cancelDrawing()
    if (store.selection?.id !== p.id) store.select('structure', p.id)
  } else if (mode.value === 'stanzen') {
    mode.value = 'select'
  }
})

function handleToolClick(pt) {
  const xy = [Number(pt.x.toFixed(2)), Number(pt.y.toFixed(2))]
  if (mode.value === 'gauge') {
    store.addObject('gauge', { id: 'pegel', point: xy })
    mode.value = 'select'
  } else if (mode.value === 'section') {
    drawPts.value = [...drawPts.value, xy]
    if (drawPts.value.length === 2) {
      store.addObject('section', { id: 'qs', polyline: drawPts.value })
      cancelDrawing()
      mode.value = 'select'
    } else {
      updatePreview(pt)
    }
  } else if (mode.value === 'draw') {
    if (schliessNah && drawPts.value.length >= 3) {
      ringGeschlossen.value = true
      finishDrawing()
      return
    }
    drawPts.value = [...drawPts.value, xy]
    updatePreview(pt)
  }
}

function finishDrawing() {
  if (mode.value === 'draw' && drawPts.value.length >= 2) {
    chooserPts.value = drawPts.value
    drawPts.value = []
    zeichenLock = null
    updatePreview(null)
  }
}

async function createFromDrawing(opt) {
  const pts = chooserPts.value
  cancelDrawing()
  mode.value = 'select'
  const geschlossen = ringGeschlossen.value || opt.geschlossen
  ringGeschlossen.value = false
  if (!pts) return
  for (const m of await store.skizzeZeichnen({
    kind: geschlossen ? 'polygon' : 'polyline',
    rolle: opt.rolle,
    punkte: pts,
  })) {
    store.melden(m, m.startsWith('ACHTUNG') ? 'hinweis' : 'erfolg')
  }
}

// --- Stützpunkthandles (Spez. 6.4): im Grundriss ziehbar ------------------

let dragging = null            // { idx } während eines Handle-Drags
let objectDrag = null          // Ganzes-Objekt-Verschieben: { start, mesh }
// Gesetzte Bearbeitung wieder anfassen: der Marker wird über die
// Oberfläche des Körpers gezogen, geschrieben wird erst beim Loslassen
// (ein Store-Schreiben je pointermove würde die Vorschau lahmlegen).
let editDrag = null            // { structId, idx, mesh }
let lastMove = null            // letztes pointermove-Event (für Entf-Löschen)
let rebuildPending = false     // Szenen-Rebuild bis Drag-Ende aufschieben

// Objektzugriff (Griffe, Verschieben, Fangpunkte) — geschnitten nach
// editor/objektZugriff.js; hier nur noch die Anbindung
const { _r2, transformEdit, importPos, translateObject, objectZable,
  collectSnapPoints, handleAccess } = erzeugeObjektZugriff({
  store, holeGroups: () => groups })

function buildHandles() {
  // nie mitten im Zug neu bauen — sonst verlieren wir die gegriffenen Teile
  if (dragging || objectDrag || rotAktiv()) return
  clearGroup('handles')
  const sel = store.selection
  const access = sel && handleAccess(sel.kind, store.selectedObject)
  if (!access) return
  groups.handles = new THREE.Group()
  const r = Math.max((store.terrain?.resolution ?? 0.5) * 0.7, 0.3)
  const positions = []
  access.points.forEach(([x, y], idx) => {
    // depthTest aus: auch Knoten UNTER dem Gelände (Rechen-Sohle,
    // Durchlass-Achse) bleiben sichtbar — Gizmos scheinen durch
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }))
    m.renderOrder = 4
    const z = access.zAt ? access.zAt(idx) : terrainZ(x, y) + r + 0.15
    m.position.set(x, y, z)
    m.userData = { handleIdx: idx }
    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.35, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0x4d9fff, transparent: true,
        opacity: 0.35, depthTest: false }))
    ring.renderOrder = 3
    ring.position.copy(m.position)
    // unsichtbarer, großzügiger Grabber — opacity 0 (visible:false wäre
    // für den Raycaster unsichtbar), depthTest aus: greifbar auch wenn
    // die Kugel halb im Gelände steckt
    const grab = new THREE.Mesh(
      new THREE.SphereGeometry(r * 2.4, 10, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0,
        depthTest: false, depthWrite: false }))
    grab.position.copy(m.position)
    grab.userData = { handleIdx: idx }
    groups.handles.add(ring, m, grab)
    positions.push(m.position.clone())
  })

  // Verbindungslinien zwischen den Stützpunkten (Umriss). `loops` trennt
  // mehrere Ringe — beim Modellgebiet liegen Sohle und Deckel getrennt
  // übereinander, ein durchgehender Zug ergäbe eine Diagonale quer durch.
  const ringe = access.loops
    ?? (positions.length > 1
      ? [access.closed ? [...positions.keys(), 0] : [...positions.keys()]]
      : [])
  for (const ring of ringe) {
    const idx = access.loops ? [...ring, ring[0]] : ring
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(idx.map((i) => positions[i])),
      new THREE.LineBasicMaterial({ color: 0x4d9fff, transparent: true,
        opacity: 0.9, depthTest: false }))
    outline.renderOrder = 3
    groups.handles.add(outline)
  }

  // vertikale Führungslinien zum Gelände (gestrichelt)
  for (const p of positions) {
    const gz = terrainZ(p.x, p.y)
    if (Math.abs(gz - p.z) > 0.05) {
      const guide = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          [p, new THREE.Vector3(p.x, p.y, gz)]),
        new THREE.LineDashedMaterial({ color: 0x8fa0c2, dashSize: 0.3,
          gapSize: 0.2, transparent: true, opacity: 0.7 }))
      guide.computeLineDistances()
      groups.handles.add(guide)
    }
  }

  if (sel.kind === 'domain') buildRotGizmo()

  // „+"-Zwischenpunkte auf den Kantenmitten: Klick-Zug fügt eine Ecke ein
  if (access.insert && positions.length > 1) {
    const nEdges = positions.length - (access.closed ? 0 : 1)
    for (let i = 0; i < nEdges; i++) {
      const mid = positions[i].clone()
        .lerp(positions[(i + 1) % positions.length], 0.5)
      const plus = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.55, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true,
          opacity: 0.9 }))
      plus.position.copy(mid)
      plus.userData = { insertAfter: i }
      const grabPlus = new THREE.Mesh(
        new THREE.SphereGeometry(r * 1.7, 10, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0,
          depthTest: false, depthWrite: false }))
      grabPlus.position.copy(mid)
      grabPlus.userData = { insertAfter: i }
      groups.handles.add(plus, grabPlus)
    }
  }
  scene.add(groups.handles)
}

// --- Drehgriff für das Modellgebiet --------------------------------------
// Ein Rechengebiet muss achsparallel bleiben (blockMesh, Randflächennamen,
// Höhenraster hängen daran). Schief liegt nicht der Quader, sondern das
// Modell — also dreht dieser Griff das MODELL und der Quader legt sich neu
// darum. Darstellung: dicke z-Achse durch die Gebietsmitte, darüber ein
// gekrümmter Doppelpfeil, an dem gezogen wird.
// Drehgriff — geschnitten nach editor/rotGizmo.js
const { rotInfo, rotAktiv, buildRotGizmo, pickRotGizmo, startRotDrag,
  dragRotTo, cancelRotDrag, commitRotDrag } = erzeugeRotGizmo({
  store, groups, ray: (e) => _ray(e), planePick: (e, z) => planePick(e, z),
  clearGroup, buildHandles: () => buildHandles(),
  holeSzene: () => ({ scene, renderer, controls }) })

function _ray(e) {
  const rect = host.value.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1)
  const ray = new THREE.Raycaster()
  ray.setFromCamera(ndc, camera)
  return ray
}

function planePick(e, z) {
  // Drag auf der horizontalen Ebene der Griffhöhe — kein Parallaxe-Sprung
  // und kein Einfrieren, wenn der Cursor das Gelände verlässt
  const pt = new THREE.Vector3()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -z)
  return _ray(e).ray.intersectPlane(plane, pt) ? pt : null
}

function pickHandle(e) {
  if (!groups.handles) return null
  const ray = _ray(e)
  const hits = ray.intersectObjects(
    groups.handles.children.filter((c) => c.userData.handleIdx != null
      || c.userData.insertAfter != null), false)
  if (!hits.length) return null
  // echte Stützpunkte haben Vorrang vor den kleineren Zwischenpunkten;
  // bei überlappenden Grabbern gewinnt der, dessen ZENTRUM dem Strahl am
  // nächsten liegt — nicht der zufällig vorderste dicke Grabber
  const real = hits.filter((h) => h.object.userData.handleIdx != null)
  if (real.length) {
    return real.reduce((best, h) =>
      (ray.ray.distanceToPoint(h.object.position)
        < ray.ray.distanceToPoint(best.object.position) ? h : best)).object
  }
  return hits[0].object
}

function pickSelectable(e) {
  const hits = _ray(e).intersectObjects(selectable, false)
  if (!hits.length) return null
  // Bauwerke/Marker haben Vorrang vor (großen) Verfeinerungsboxen
  return hits.find((h) => h.object.userData.kind !== 'refinement') ?? hits[0]
}

// --- Achsenführung beim Verschieben: X/Y/Z-Linien durch den Griffpunkt ----
// Klassiker im 3D-Editieren: ohne Führung driftet jede Verschiebung. Nahe
// einer Achse rastet die Bewegung exakt auf sie ein (Hysterese, damit es
// an der Grenze nicht flackert); Alt-Taste = frei bewegen.
// Achsenführung/Δ-Anzeige — geschnitten nach editor/achsen.js
const { showAxisGuides, hideAxisGuides, highlightAxis,
  axisHint: _axisHint, dragScreenInit, gestureSnap, dragDelta, fmtDelta,
  updateDragDelta } = erzeugeAchsen({
  store, host, holeScene: () => scene, holeCamera: () => camera,
  holeControls: () => controls })

function dragHandleTo(e) {
  if (!dragging) return
  const access = handleAccess(store.selection?.kind, store.selectedObject)
  const snap = gestureSnap(dragging, e, !!access?.writeZ)
  if (snap.hold) return
  highlightAxis(snap.lock)

  let dx = 0
  let dy = 0
  let dz = 0
  if (snap.lock === 'z') {
    dz = _r2(snap.t)
  } else {
    const hit = planePick(e, dragging.z)
    if (!hit) return
    const wx = hit.x + dragging.offset[0] - dragging.anchor[0]
    const wy = hit.y + dragging.offset[1] - dragging.anchor[1]
    dx = snap.lock === 'y' ? 0 : wx
    dy = snap.lock === 'x' ? 0 : wy
  }
  let x = _r2(dragging.anchor[0] + dx)
  let y = _r2(dragging.anchor[1] + dy)
  // Fang: Stützpunkte ANDERER Objekte gewinnen vorm Zellraster; nur die
  // tatsächlich bewegte Koordinate rastet (Führungslinien bleiben exakt).
  // Alt = ganz frei, wie bei den Achsen.
  let caught = ''
  if (!e.altKey && snap.lock !== 'z') {
    const g = store.spec?.mesh?.base_cell ?? 0.5
    if (!snap.lock) {
      if (!dragging.snapPts) dragging.snapPts = collectSnapPoints()
      let best = null
      let bd = g * 0.6
      for (const q of dragging.snapPts) {
        const d = Math.hypot(q[0] - x, q[1] - y)
        if (d < bd) { bd = d; best = q }
      }
      if (best) { x = best[0]; y = best[1]; caught = ' · ⌖ Punktfang' }
    }
    if (!caught) {
      if (snap.lock !== 'y') x = _r2(Math.round(x / g) * g)
      if (snap.lock !== 'x') y = _r2(Math.round(y / g) * g)
    }
  }
  for (const part of dragging.parts) {
    part.position.set(x, y, dragging.zBase + dz)
  }
  dragging.last = [x, y]
  dragging.dz = dz
  // Der Erdkörper wird serverseitig gebaut und kommt erst nach dem
  // Loslassen zurück. Beim Ziehen am Gebiet lässt er sich aber sofort auf
  // den neuen Zuschnitt beschneiden — der Körper folgt dann der Ecke,
  // statt eine Vierteldrehung lang falsch dazustehen.
  if (store.selection?.kind === 'domain') koerperBeschneiden(gezogenesGebiet())
  const zNote = e.ctrlKey && !access?.writeZ ? ' · Z hier nicht möglich' : ''
  coords.value = (snap.lock === 'z'
    ? `Δz = ${fmtDelta(dz)}`
    : `x = ${x.toFixed(2)}  y = ${y.toFixed(2)}`)
    + ` (Stützpunkt ${dragging.idx + 1}${_axisHint()}${zNote}${caught})`
  updateDragDelta(e, dx, dy, dz, snap.lock)
}

// Marker einer Bearbeitung unter dem Zeiger (nur am gewählten Bauwerk)
function pickEditMarker(e) {
  if (!groups.markers) return null
  const sel = store.selection
  if (sel?.kind !== 'structure') return null
  const ziele = groups.markers.children.filter(
    (c) => c.userData?.editIdx != null && c.userData.id === sel.id)
  if (!ziele.length) return null
  const hits = _ray(e).intersectObjects(ziele, false)
  return hits.length ? hits[0].object : null
}

function startEditDrag(e, marke) {
  // sichtbarer Ring liegt an derselben Stelle wie das Klickziel
  const sichtbar = (groups.markers?.children ?? []).find(
    (c) => c !== marke && c.userData?.editIdx == null
      && c.userData?.id === marke.userData.id
      && c.position.distanceTo(marke.position) < 1e-6)
  editDrag = { structId: marke.userData.id, idx: marke.userData.editIdx,
    mesh: marke, sichtbar, treffer: null }
  controls.enabled = false
  renderer.domElement.style.cursor = 'grabbing'
  renderer.domElement.setPointerCapture(e.pointerId)
}

function dragEditTo(e) {
  if (!editDrag) return
  const mesh = (groups.solids?.children ?? []).find(
    (c) => c.userData?.id === editDrag.structId)
  if (!mesh) return
  const hits = _ray(e).intersectObjects([mesh], false)
  if (!hits.length) return
  const h = hits[0]
  const n = h.face
    ? h.face.normal.clone().applyMatrix3(
      new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize()
    : new THREE.Vector3(0, 0, 1)
  editDrag.treffer = { punkt: h.point.clone(), normale: n }
  // Marker sofort mitziehen; die Spezifikation folgt beim Loslassen
  const senkrecht = Math.abs(n.z) > 0.7
  for (const m of [editDrag.mesh, editDrag.sichtbar]) {
    if (!m) continue
    m.position.copy(h.point).addScaledVector(n, 0.02)
    m.rotation.set(senkrecht ? 0 : Math.PI / 2, 0,
      senkrecht ? 0 : Math.atan2(n.x, -n.y) + Math.PI / 2)
  }
  coords.value = `Bearbeitung → x = ${h.point.x.toFixed(2)} `
    + `y = ${h.point.y.toFixed(2)} z = ${h.point.z.toFixed(2)} m`
}

function commitEditDrag() {
  const drag = editDrag
  editDrag = null
  controls.enabled = true
  renderer.domElement.style.cursor = 'default'
  if (!drag?.treffer) { buildMarkers(); return }
  const st = (store.spec?.structures ?? []).find((o) => o.id === drag.structId)
  const alt = st?.edits?.[drag.idx]
  if (!alt || alt.type !== 'aussparung') { buildMarkers(); return }
  const { punkt, normale } = drag.treffer
  const senkrecht = Math.abs(normale.z) > 0.7
  const nxy = new THREE.Vector2(normale.x, normale.y)
  if (nxy.lengthSq() < 1e-9) nxy.set(0, 1)
  nxy.normalize()
  const klon = JSON.parse(JSON.stringify(st))
  klon.edits[drag.idx] = { ...alt, station: undefined,
    point: [_r2(punkt.x), _r2(punkt.y)],
    direction: [_r2(nxy.x), _r2(nxy.y)],
    z: _r2(punkt.z), vertikal: senkrecht }
  delete klon.edits[drag.idx].station
  store.updateObject('structure', drag.structId, klon)
}

// Entf über einem Bearbeitungs-Marker löscht die Bearbeitung
function deleteHoveredEdit() {
  if (!lastMove) return false
  const marke = pickEditMarker(lastMove)
  if (!marke) return false
  const st = (store.spec?.structures ?? []).find(
    (o) => o.id === marke.userData.id)
  if (!st?.edits?.length) return false
  const klon = JSON.parse(JSON.stringify(st))
  klon.edits.splice(marke.userData.editIdx, 1)
  store.updateObject('structure', st.id, klon)
  return true
}

function dragObjectTo(e) {
  if (!objectDrag) return
  if (!objectDrag.basePos) objectDrag.basePos = objectDrag.mesh.position.clone()
  if (groups.handles && !objectDrag.handleBase) {
    objectDrag.handleBase = groups.handles.position.clone()
  }
  const zable = objectZable(store.selection?.kind, store.selectedObject)
  const snap = gestureSnap(objectDrag, e, zable)
  if (snap.hold) return
  highlightAxis(snap.lock)

  let dx = 0
  let dy = 0
  let dz = 0
  if (snap.lock === 'z') {
    dz = _r2(snap.t)
  } else {
    const hit = planePick(e, objectDrag.z)
    if (!hit) return
    const wx = hit.x - objectDrag.start[0]
    const wy = hit.y - objectDrag.start[1]
    dx = snap.lock === 'y' ? 0 : wx
    dy = snap.lock === 'x' ? 0 : wy
    // Ganzes Objekt rastet in Zellraster-Schritten (Alt = frei)
    if (!e.altKey) {
      const g = store.spec?.mesh?.base_cell ?? 0.5
      dx = _r2(Math.round(dx / g) * g)
      dy = _r2(Math.round(dy / g) * g)
    }
  }
  objectDrag.mesh.position.set(objectDrag.basePos.x + dx,
    objectDrag.basePos.y + dy, objectDrag.basePos.z + dz)
  if (groups.handles) {
    groups.handles.position.set(objectDrag.handleBase.x + dx,
      objectDrag.handleBase.y + dy, objectDrag.handleBase.z + dz)
  }
  objectDrag.last = [dx, dy]
  objectDrag.dz = dz
  const zNote = e.ctrlKey && !zable ? ' · Z hier nicht möglich' : ''
  coords.value = (snap.lock === 'z'
    ? `Δz = ${fmtDelta(dz)}`
    : `Δx = ${dx.toFixed(2)}  Δy = ${dy.toFixed(2)} m`)
    + ` (verschieben${_axisHint()}${zNote})`
  updateDragDelta(e, dx, dy, dz, snap.lock)
}

function _endDrag() {
  hideAxisGuides()
  // Beschnitt vom Gebietszug aufheben — der echte Körper kommt mit der
  // Entwurfsvorschau nach und braucht ihn nicht mehr
  koerperBeschneiden(null)
  dragDelta.value = null
  renderer.domElement.style.cursor = mode.value === 'select' ? 'default' : 'crosshair'
  if (rebuildPending) {
    rebuildPending = false
    rebuild()
  }
}

// ---- Randbedingung an eine andere Gebietsseite ziehen -------------------
// Der Marker gleitet am UMFANG des Gebiets entlang: nächstgelegene Seite
// unterm Cursor + Lage entlang der Kante. Beim Loslassen wird face
// umgesetzt und das Fenster (span/center) an die neue Lage geschoben —
// der Server löst die Flächen wie immer selbst auf (bc_faces).
let bcDrag = null                 // { id, ziel, lo, w, obj }

function bcBreite(b, seite) {
  const win = b?.window
  const voll = seite.hi - seite.lo
  if (!win) return voll                       // ohne Fenster: ganze Seite
  if (win.span) return Math.min(voll, Math.abs(win.span[1] - win.span[0]))
  if (win.diameter != null) return Math.min(voll, win.diameter)
  if (win.top_width != null || win.bottom_width != null) {
    return Math.min(voll, Math.max(win.top_width ?? 0, win.bottom_width ?? 0))
  }
  return voll
}

function seiteUnterCursor(e) {
  const d = store.spec?.domain
  if (!d) return null
  const [x0, y0, x1, y1] = d.extent
  const p = planePick(e, (d.z_min + d.z_max) / 2) ?? planePick(e, d.z_min)
  if (!p) return null
  const kand = [
    { face: 'x_min', abstand: Math.abs(p.x - x0), t: p.y, lo: y0, hi: y1 },
    { face: 'x_max', abstand: Math.abs(p.x - x1), t: p.y, lo: y0, hi: y1 },
    { face: 'y_min', abstand: Math.abs(p.y - y0), t: p.x, lo: x0, hi: x1 },
    { face: 'y_max', abstand: Math.abs(p.y - y1), t: p.x, lo: x0, hi: x1 },
  ].sort((a, b) => a.abstand - b.abstand)
  const seite = kand[0]
  seite.t = Math.min(seite.hi, Math.max(seite.lo, seite.t))
  return seite
}

function startBcDrag(e, id) {
  const b = (store.spec?.boundaries ?? []).find((x) => x.id === id)
  if (!b) return false
  bcDrag = { id }
  controls.enabled = false
  renderer.domElement.style.cursor = 'grabbing'
  renderer.domElement.setPointerCapture(e.pointerId)
  dragBcTo(e)
  return true
}

function dragBcTo(e) {
  if (!bcDrag) return
  const seite = seiteUnterCursor(e)
  if (!seite) return
  const d = store.spec.domain
  const b = (store.spec.boundaries ?? []).find((x) => x.id === bcDrag.id)
  const w = bcBreite(b, seite)
  const lo = w >= seite.hi - seite.lo ? seite.lo
    : Math.max(seite.lo, Math.min(seite.hi - w, seite.t - w / 2))
  bcDrag.ziel = seite
  bcDrag.lo = lo
  bcDrag.w = w
  // Vorschaurahmen: Fensterbreite × volle Gebietshöhe auf der Zielseite
  const [x0, y0, x1, y1] = d.extent
  const anKante = (t) => seite.face === 'x_min' ? [x0, t]
    : seite.face === 'x_max' ? [x1, t]
      : seite.face === 'y_min' ? [t, y0] : [t, y1]
  const ecken = [[lo, d.z_min], [lo + w, d.z_min],
    [lo + w, d.z_max], [lo, d.z_max]]
  const pts = ecken.map(([t, z]) => {
    const [x, y] = anKante(t)
    return new THREE.Vector3(x, y, z)
  })
  if (!bcDrag.obj) {
    bcDrag.obj = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffc832, depthTest: false }))
    bcDrag.obj.renderOrder = 40
    scene.add(bcDrag.obj)
  } else {
    bcDrag.obj.geometry.setFromPoints(pts)
  }
}

async function commitBcDrag() {
  const drag = bcDrag
  bcDrag = null
  controls.enabled = true
  renderer.domElement.style.cursor = 'default'
  if (drag?.obj) {
    scene.remove(drag.obj)
    drag.obj.geometry.dispose()
    drag.obj.material.dispose()
  }
  if (!drag?.ziel) return
  const b = (store.spec.boundaries ?? []).find((x) => x.id === drag.id)
  if (!b) return
  const r2 = (v) => Math.round(v * 100) / 100
  const clone = JSON.parse(JSON.stringify(b))
  clone.face = drag.ziel.face
  const win = clone.window
  if (win && !win.follow) {
    if (win.span) win.span = [r2(drag.lo), r2(drag.lo + drag.w)]
    if (win.center != null) win.center = r2(drag.lo + drag.w / 2)
  }
  store.updateObject('boundary', drag.id, clone)
  // Sofort speichern: die Marker lesen die SERVER-Auflösung (bc_faces) —
  // erst die PUT-Antwort zeigt den Rand an seiner neuen Seite
  await store.saveCase()
}

function commitObjectDrag() {
  const drag = objectDrag
  objectDrag = null
  controls.enabled = true
  const movedXY = drag?.last && Math.hypot(drag.last[0], drag.last[1]) >= 0.05
  const movedZ = Math.abs(drag?.dz ?? 0) >= 0.05
  if (!movedXY && !movedZ) {
    // kaum bewegt: als Klick werten, Auswahl bleibt
    if (drag?.basePos) drag.mesh.position.copy(drag.basePos)
    if (groups.handles && drag?.handleBase) groups.handles.position.copy(drag.handleBase)
    _endDrag()
    return
  }
  const sel = store.selection
  const clone = translateObject(sel.kind,
    JSON.parse(JSON.stringify(store.selectedObject)),
    drag.last?.[0] ?? 0, drag.last?.[1] ?? 0, drag.dz ?? 0)
  store.updateObject(sel.kind, sel.id, clone)
  _endDrag()
}

// Aus den gezogenen Griffen das vorläufige Gebiet ableiten
function gezogenesGebiet() {
  const pkte = (groups.handles?.children ?? [])
    .filter((c) => c.userData.handleIdx != null)
    .map((c) => c.position)
  if (pkte.length < 4) return null
  const xs = pkte.map((p) => p.x)
  const ys = pkte.map((p) => p.y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// Beschnitt NUR am Geländekörper, nicht global: sonst würden Griffe und
// Bauwerke mit weggeschnitten. Ohne Gebiet wird der Beschnitt aufgehoben.
function koerperBeschneiden(extent) {
  const teile = groups.terrain?.children ?? []
  if (!teile.length) return
  const ebenen = extent ? (() => {
    const [x0, y0, x1, y1] = extent
    renderer.localClippingEnabled = true
    return [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -x0),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), x1),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -y0),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), y1),
    ]
  })() : null
  // auch die Körperkanten mitschneiden — sonst stehen sie beim Ziehen
  // über den neuen Zuschnitt hinaus
  for (const teil of teile) {
    if (!teil.material) continue
    teil.material.clippingPlanes = ebenen
    teil.material.needsUpdate = true
  }
}

function commitHandleDrag() {
  const drag = dragging
  dragging = null
  controls.enabled = true
  if (!drag?.last && !drag?.dz) { _endDrag(); return }
  const sel = store.selection
  const clone = JSON.parse(JSON.stringify(store.selectedObject))
  const access = handleAccess(sel.kind, clone)
  if (drag.last) access.write(clone, drag.idx, drag.last)
  if (drag.dz && access.writeZ) access.writeZ(clone, drag.idx, drag.dz)
  store.updateObject(sel.kind, sel.id, clone)
  _endDrag()
}

watch(() => [store.selection, store.selectedObject], buildHandles,
  { deep: false })

// --- Interaktive Schnittebene (Spez. 6.4) ---------------------------------

function toggleClip() {
  clipActive.value = !clipActive.value
  if (clipActive.value && store.spec?.domain) {
    const [x0, y0, x1, y1] = store.spec.domain.extent
    clipRange.value = clipAxis.value === 'x' ? [x0, x1] : [y0, y1]
    clipPos.value = (clipRange.value[0] + clipRange.value[1]) / 2
  }
}

function applyClip() {
  if (!renderer) return
  if (!clipActive.value) {
    renderer.clippingPlanes = []
    renderer.localClippingEnabled = false
    return
  }
  renderer.localClippingEnabled = true
  const x = clipAxis.value === 'x'
  const sign = clipFlip.value ? 1 : -1
  const normal = new THREE.Vector3(x ? sign : 0, x ? 0 : sign, 0)
  const constant = -sign * clipPos.value
  renderer.clippingPlanes = [new THREE.Plane(normal, constant)]
}

watch(clipAxis, () => {
  if (clipActive.value && store.spec?.domain) {
    const [x0, y0, x1, y1] = store.spec.domain.extent
    clipRange.value = clipAxis.value === 'x' ? [x0, x1] : [y0, y1]
    clipPos.value = (clipRange.value[0] + clipRange.value[1]) / 2
  }
})
watch([clipActive, clipAxis, clipPos, clipFlip], applyClip)

// --- Solver-Netz der Vorschau (Rasteransicht) -----------------------------

async function toggleMeshView() {
  meshView.value = !meshView.value
  meshHint.value = ''
  clearGroup('mesh')
  if (!meshView.value) return
  try {
    const data = await flood3dApi.caseMeshSurface(store.activeCaseId)
    const loader = new STLLoader()
    groups.mesh = new THREE.Group()
    for (const p of data.patches) {
      const geo = loader.parse(b64ToBuffer(p.stl_b64))
      geo.computeVertexNormals()
      const solid = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
        color: p.patch === 'terrain' ? 0x6b7891 : 0x4d9fff,
        side: THREE.DoubleSide }))
      const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x101a30, wireframe: true, transparent: true, opacity: 0.55 }))
      groups.mesh.add(solid, wire)
    }
    scene.add(groups.mesh)
    if (data.stale) {
      meshHint.value = '⚠ Dieses Netz gehört zu einem älteren Stand des '
        + 'Falls — es zeigt NICHT die aktuelle Geometrie. Netz- und '
        + 'Kostenvorschau in der Phase „Simulation" neu ausführen.'
    }
    // Vorschaugeometrie ausblenden — das Netz IST jetzt die Geometrie
    if (groups.terrain) groups.terrain.visible = false
    if (groups.solids) groups.solids.visible = false
  } catch (e) {
    meshView.value = false
    meshHint.value = e.message.includes('Netzvorschau')
      ? 'Noch kein Vorschaunetz — Netz- und Kostenvorschau in der Phase „Simulation" ausführen.'
      : `Netz nicht ladbar: ${e.message}`
  }
}

watch([solverView, drahtgitter], () => buildTerrain())

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
  const hitInfo = pickSelectable(e)
  if (hitInfo) {
    const { kind, id } = hitInfo.object.userData
    store.select(kind, id)
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
    if (mode.value !== 'select' && mode.value !== 'move') return
    if (e.button !== 0) return          // rechts/mitte bleibt der Kamera
    const marke = pickEditMarker(e)
    if (marke) { startEditDrag(e, marke); return }
    // Drehgriff des Modellgebiets zuerst — er liegt über allem anderen
    if (store.selection?.kind === 'domain' && pickRotGizmo(e)) {
      if (startRotDrag(e)) return
    }
    let h = pickHandle(e)
    if (h && h.userData.insertAfter != null) {
      // Zwischenpunkt: neue Ecke einfügen und direkt weiterziehen
      const sel = store.selection
      const clone = JSON.parse(JSON.stringify(store.selectedObject))
      const acc = handleAccess(sel.kind, clone)
      const mid = [Number(h.position.x.toFixed(2)),
        Number(h.position.y.toFixed(2))]
      acc.insert(clone, h.userData.insertAfter, mid)
      store.updateObject(sel.kind, sel.id, clone)
      buildHandles()
      const newIdx = h.userData.insertAfter + 1
      h = (groups.handles?.children ?? []).find(
        (c) => c.userData.handleIdx === newIdx) ?? null
      if (h) {
        dragging = { idx: newIdx, z: h.position.z, offset: [0, 0],
          anchor: mid, zBase: h.position.z, dz: 0,
          screen: dragScreenInit(e, mid[0], mid[1], h.position.z),
          parts: (groups.handles?.children ?? []).filter(
            (c) => c.userData.handleIdx === newIdx
              || c.position.distanceTo(h.position) < 1e-6),
          last: mid }
        showAxisGuides(mid[0], mid[1], h.position.z)
        controls.enabled = false
        renderer.domElement.style.cursor = 'grabbing'
        renderer.domElement.setPointerCapture(e.pointerId)
      }
      return
    }
    if (h) {
      const idx = h.userData.handleIdx
      const zGrab = h.position.z
      const hit = planePick(e, zGrab)
      dragging = {
        idx,
        z: zGrab,
        // Griffversatz merken — der Punkt springt nicht aufs Kugelzentrum
        offset: hit ? [h.position.x - hit.x, h.position.y - hit.y] : [0, 0],
        anchor: [h.position.x, h.position.y],
        zBase: h.position.z,
        dz: 0,
        screen: dragScreenInit(e, h.position.x, h.position.y, h.position.z),
        parts: (groups.handles?.children ?? []).filter(
          (c) => c.position.distanceTo(h.position) < 1e-6),
        last: null,
      }
      showAxisGuides(h.position.x, h.position.y, zGrab)
      controls.enabled = false
      renderer.domElement.style.cursor = 'grabbing'
      renderer.domElement.setPointerCapture(e.pointerId)
      return
    }
    // Körper-Verschieben: im Verschieben-Werkzeug direkt, im
    // Auswählen-Modus nur mit gehaltener Shift-Taste — einfaches Ziehen
    // gehört der Kamera (kein versehentliches Verschieben mehr).
    const hitInfo = pickSelectable(e)
    if (!hitInfo) return
    const sel = store.selection
    const hitsSelected = sel && hitInfo.object.userData.kind === sel.kind
      && hitInfo.object.userData.id === sel.id
    if (hitInfo.object.userData.kind === 'boundary'
        && (mode.value === 'move' || ((e.shiftKey || e.ctrlKey) && hitsSelected))) {
      if (!hitsSelected) {
        store.select('boundary', hitInfo.object.userData.id)
      }
      startBcDrag(e, hitInfo.object.userData.id)
      return
    }
    let startMove = false
    if (mode.value === 'move') {
      if (!hitsSelected) {
        store.select(hitInfo.object.userData.kind, hitInfo.object.userData.id)
      }
      startMove = true
    } else if ((e.shiftKey || e.ctrlKey) && hitsSelected) {
      startMove = true
    }
    if (startMove) {
      // Drag-Ebene auf Höhe des Griffpunkts AM Objekt (kein Parallaxe-Sprung)
      const zGrab = hitInfo.point.z
      const pt = planePick(e, zGrab)
      if (pt) {
        objectDrag = { start: [pt.x, pt.y], z: zGrab,
          mesh: hitInfo.object, last: null, dz: 0,
          screen: dragScreenInit(e, pt.x, pt.y, zGrab) }
        showAxisGuides(pt.x, pt.y, zGrab)
        controls.enabled = false
        renderer.domElement.style.cursor = 'grabbing'
        renderer.domElement.setPointerCapture(e.pointerId)
      }
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
    if (e.button !== 2 && !dragging && !objectDrag && !rotAktiv() && !topView.value) {
      anchorPivotToViewCenter()
    }
    if (e.button === 0 && !dragging && !objectDrag && !rotAktiv()) {
      renderer.domElement.style.cursor = 'grabbing'
    }
  })

  let lastWheelAnchor = 0
  renderer.domElement.addEventListener('wheel', () => {
    const now = performance.now()
    if (now - lastWheelAnchor > 150 && !topView.value) {
      lastWheelAnchor = now
      anchorPivotToViewCenter()
    }
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
    if (bcDrag) {
      commitBcDrag()
      downPos = null
      return
    }
    if (dragging) {
      commitHandleDrag()
      downPos = null
      return
    }
    if (editDrag) {
      commitEditDrag()
      downPos = null
      return
    }
    if (objectDrag) {
      commitObjectDrag(e)
      downPos = null
      return
    }
    renderer.domElement.style.cursor =
      mode.value === 'select' || mode.value === 'move' ? 'default' : 'crosshair'
    if (downPos && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) < 5) {
      if (mode.value === 'stanzen') {
        stanzHit = stanzPick(e) ?? stanzHit
        updateStanzPreview()
        if (stanzHit) stanzKlick()
      } else if (mode.value === 'select' || mode.value === 'move') {
        pick(e)
      } else {
        const roh = groundPick(e)
        const gefangen = roh && fangBeimZeichnen(roh, e)
        if (gefangen) {
          handleToolClick({ x: gefangen[0], y: gefangen[1] })
        }
      }
    }
    downPos = null
  })
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
    if (bcDrag) {
      dragBcTo(e)
      return
    }
    if (dragging) {
      dragHandleTo(e)
      return
    }
    if (editDrag) {
      dragEditTo(e)
      return
    }
    if (objectDrag) {
      dragObjectTo(e)
      return
    }
    if (mode.value === 'stanzen') {
      // gleiche Drosselung wie beim Hover: die Vorschau wird bei jedem
      // Aufruf neu gebaut, 120 Hz wären reine Verschwendung
      const jetzt = performance.now()
      if (jetzt - lastHoverCheck < 40) return
      lastHoverCheck = jetzt
      const h = stanzPick(e)
      if (h) stanzHit = h
      updateStanzPreview()
      renderer.domElement.style.cursor = h ? 'crosshair' : 'not-allowed'
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
    // Zeichnen: Fang + Führungslinie LIVE zeigen, nicht erst beim Klick
    if ((mode.value === 'draw' || mode.value === 'section')
        && drawPts.value.length && !chooserPts.value) {
      const roh = groundPick(e)
      const g = roh && fangBeimZeichnen(roh, e)
      if (g) updatePreview({ x: g[0], y: g[1] })
      renderer.domElement.style.cursor = schliessNah ? 'pointer' : 'crosshair'
      return
    }
    // Hover-Vorab-Sperre: OrbitControls MUSS schon vor dem pointerdown aus
    // sein, sonst startet die Kamerarotation zeitgleich mit dem Drag
    // (OrbitControls hängt früher am Canvas als unsere Handler). Gesperrt
    // wird nur, was wirklich greifbar ist: Handles immer; Objektkörper nur
    // im Verschieben-Werkzeug bzw. mit gehaltener Shift-/Strg-Taste
    // (Strg = Höhen-Verschieben — auch das braucht die Kamera-Sperre!).
    if (mode.value === 'select' || mode.value === 'move') {
      const overEdit = !!pickEditMarker(e)
      if (overEdit) {
        controls.enabled = false
        renderer.domElement.style.cursor = 'grab'
        return
      }
      const overHandle = !!pickHandle(e)
      let overMovable = false
      if (!overHandle) {
        const hitInfo = pickSelectable(e)
        if (hitInfo) {
          if (mode.value === 'move') {
            overMovable = true
          } else if ((e.shiftKey || e.ctrlKey) && store.selection) {
            overMovable = hitInfo.object.userData.kind === store.selection.kind
              && hitInfo.object.userData.id === store.selection.id
          }
        }
      }
      controls.enabled = !(overHandle || overMovable)
      renderer.domElement.style.cursor =
        overHandle || overMovable ? 'grab' : 'default'
    } else {
      renderer.domElement.style.cursor = 'crosshair'
    }
    const pt = groundPick(e)
    coords.value = pt
      ? `x = ${pt.x.toFixed(2)}  y = ${pt.y.toFixed(2)}  z = ${terrainZ(pt.x, pt.y).toFixed(2)} m`
      : ''
    if (mode.value !== 'select' && drawPts.value.length && pt) updatePreview(pt)
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
    updateStanzPreview()
  }, { passive: false, capture: true })
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (mode.value === 'draw') {
      finishDrawing()
      return
    }
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
  if (dragging || objectDrag) {
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
    // Formen arbeitet auf dem feinen Höhenraster — Solverblick wäre die
    // grobe Abtastung, dort stimmen die Vertexindizes nicht
    if (solverView.value) solverView.value = false
    if (!sculpt.aktivieren()) { store.sculptAktiv = false; return }
  } else {
    sculpt.deaktivieren()
  }
})

watch(() => store.geometryVersion, rebuild)
// Marker (Pegel/Schnitte/Boxen/Ränder) folgen der Spec auch ohne Speichern
watch(() => JSON.stringify([store.spec?.evaluation, store.spec?.mesh?.refinements,
  store.spec?.boundaries]), () => { buildMarkers() })

// Stützpunkt aus der Punktliste hervorheben. Eigene Gruppe statt eines
// Eintrags in `markers`: das hängt am Zeiger und darf nicht bei jedem
// Überfahren die ganze Markerebene neu bauen.
let fokusMarke = null

function fokusMarkeBauen() {
  const g = new THREE.Group()
  const kugel = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd34d, depthTest: false }))
  kugel.renderOrder = 999
  // Lot auf das Gelände: ein Punkt in der Luft ist sonst nicht zu verorten
  const lot = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffd34d, depthTest: false }))
  lot.renderOrder = 999
  g.add(kugel, lot)
  g.visible = false
  return { g, kugel, lot }
}

watch(() => store.fokusPunkt, (p) => {
  if (!scene) return
  if (!fokusMarke) {
    fokusMarke = fokusMarkeBauen()
    scene.add(fokusMarke.g)
  }
  if (!p) { fokusMarke.g.visible = false; return }
  // Größe an das Gebiet hängen, damit die Marke in jedem Maßstab sichtbar
  // ist, ohne das Modell zu verdecken
  const ext = store.spec?.domain?.extent
  const r = ext ? Math.max(0.15, Math.min(ext[2] - ext[0], ext[3] - ext[1]) / 120)
    : 0.3
  fokusMarke.kugel.scale.setScalar(r)
  fokusMarke.g.position.set(p.x, p.y, p.z)
  fokusMarke.lot.scale.set(1, 1, Math.max(p.z - (store.spec?.domain?.z_min ?? p.z), 0.01))
  fokusMarke.g.visible = true
})

function _typing() {
  const tag = document.activeElement?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// Entf: Eckknoten unter dem Cursor löschen (Minimalzahl bleibt gewahrt)
function deleteHoveredCorner() {
  if (!lastMove || !store.selection) return
  const h = pickHandle(lastMove)
  if (!h || h.userData.handleIdx == null) return
  const acc = handleAccess(store.selection.kind, store.selectedObject)
  if (!acc?.remove) return
  const clone = JSON.parse(JSON.stringify(store.selectedObject))
  if (acc.remove(clone, h.userData.handleIdx) === false) return
  store.updateObject(store.selection.kind, store.selection.id, clone)
  buildHandles()
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
  if (e.key === 'Escape') {
    if (rotAktiv()) { cancelRotDrag(); return }
    if (store.platzierung) store.endPlatzierung()
    cancelDrawing()
    mode.value = 'select'
    return
  }
  if (_typing()) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    if (duplicateSelected()) e.preventDefault()
    return
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && !dragging && !objectDrag) {
    if (!deleteHoveredEdit()) deleteHoveredCorner()
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
  clearGroup('preview'); clearGroup('mesh'); clearGroup('handles')
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
  max-width: calc(100% - 370px);
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
.f3d-chooser {
  position: absolute;
  /* unter dem Netz-/Solverhinweis (top: 48) — beide lagen exakt
     uebereinander und verdeckten sich */
  top: 84px;
  left: 10px;
  z-index: 6;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  background: rgba(10, 16, 31, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid var(--f3d-accent);
  border-radius: 10px;
  padding: 8px 10px;
  max-width: 520px;
  box-shadow: var(--f3d-glow);
  animation: f3d-in 0.2s ease both;
}
</style>
