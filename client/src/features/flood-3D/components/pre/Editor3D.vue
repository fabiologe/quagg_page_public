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

const store = usePreStore()
const host = ref(null)

// Werkzeuge (Spez. Kap. 6.4): Klick-Platzierung gleichwertig zur
// numerischen Eingabe im Eigenschaftspanel.
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

const drawTargets = computed(() => {
  const n = chooserPts.value?.length ?? 0
  const line = [
    { label: 'Gerinne', build: buildChannel },
    { label: 'Wand', build: buildWall },
    { label: 'Dammschüttung', build: buildEmbankment },
    { label: 'Stutzen (Rohr)', build: buildPipe },
  ]
  const poly = [
    { label: 'Planum', build: buildPad },
    { label: 'Becken', build: buildBasin },
    { label: 'Verfeinerungsbox', build: buildRefineBox },
  ]
  return n >= 3 ? [...poly, ...line] : line
})

const SOLID_COLORS = [0x3987e5, 0xd95926, 0x199e70, 0xc98500, 0xd55181,
  0x9085e9, 0xe66767]

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

function terrainZ(x, y) {
  const t = store.terrain
  if (!t) return 0
  const [ny, nx] = t.dims
  const fx = Math.min(nx - 1.001, Math.max(0, (x - t.x0) / t.resolution))
  const fy = Math.min(ny - 1.001, Math.max(0, (y - t.y0) / t.resolution))
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const dx = fx - i
  const dy = fy - j
  const z = t.z
  return z[j * nx + i] * (1 - dx) * (1 - dy) + z[j * nx + i + 1] * dx * (1 - dy)
    + z[(j + 1) * nx + i] * (1 - dx) * dy + z[(j + 1) * nx + i + 1] * dx * dy
}

// --- Aufbau ---------------------------------------------------------------

function clearGroup(name) {
  const g = groups[name]
  if (!g) return
  g.traverse((o) => {
    o.geometry?.dispose?.()
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material])
      .forEach((m) => m.dispose())
  })
  scene.remove(g)
  groups[name] = null
}

function buildTerrain() {
  clearGroup('terrain')
  const t = store.terrain
  if (!t) return
  // Arbeitet der Fall mit einem GELÄNDEKÖRPER, ist die Höhenfläche nicht
  // mehr die Wahrheit: der Vernetzer bekommt einen Volumenkörper, der
  // Hohlräume haben kann. Dann wird auch genau der gezeigt.
  if (store.terrainSolid) { buildTerrainSolid(); return }
  // Anzeige normalerweise in der Auflösung des Höhenrasters. Im
  // „Solverblick" wird stattdessen auf die BASISZELLE abgetastet und flach
  // schattiert — das ist die Auflösung, mit der der Vernetzer arbeitet.
  // Die glatte Rasterdarstellung verspricht sonst eine Genauigkeit, die
  // das Rechennetz gar nicht hat.
  const cell = store.spec?.mesh?.base_cell
  const grob = solverView.value && cell > 0
  const step = grob ? cell : t.resolution
  const [rny, rnx] = t.dims
  const breite = (rnx - 1) * t.resolution
  const hoehe = (rny - 1) * t.resolution
  const nx = grob ? Math.max(2, Math.round(breite / step) + 1) : rnx
  const ny = grob ? Math.max(2, Math.round(hoehe / step) + 1) : rny
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(nx * ny * 3)
  const col = new Float32Array(nx * ny * 3)
  let zMin = Infinity
  let zMax = -Infinity
  for (let i = 0; i < t.z.length; i++) {
    zMin = Math.min(zMin, t.z[i])
    zMax = Math.max(zMax, t.z[i])
  }
  const span = Math.max(zMax - zMin, 0.01)
  const cLow = new THREE.Color(0x3d5240)
  const cHigh = new THREE.Color(0xb8a577)
  const c = new THREE.Color()
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const x = t.x0 + i * step
      const y = t.y0 + j * step
      const z = grob ? terrainZ(x, y) : t.z[k]
      pos[k * 3] = x
      pos[k * 3 + 1] = y
      pos[k * 3 + 2] = z
      c.lerpColors(cLow, cHigh, (z - zMin) / span)
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b
    }
  }
  const idx = []
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i
      idx.push(a, a + 1, a + nx + 1, a, a + nx + 1, a + nx)
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  // Drahtgitter statt Schummerung: die Schattierung glättet optisch, was
  // im Raster steht — Stufen und Knicke verschwinden im Farbverlauf.
  // Das Gitter zeigt jede Rasterzelle einzeln, und man sieht sofort, wie
  // fein das Gelände wirklich aufgelöst ist.
  const mesh = new THREE.Mesh(geo, drahtgitter.value
    ? new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true })
    : new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, flatShading: grob }))
  groups.terrain = new THREE.Group()
  groups.terrain.add(mesh)
  scene.add(groups.terrain)
  if (grob) {
    const tiefste = feinsteZelle()
    solverHint.value = `Solverblick: Gelände auf die Basiszelle `
      + `${cell.toFixed(3).replace('.', ',')} m abgetastet (Anzeige sonst `
      + `${t.resolution.toFixed(3).replace('.', ',')} m Raster)`
      + (tiefste < cell ? ` · in den Verfeinerungsboxen rechnet der Solver `
        + `bis ${tiefste.toFixed(3).replace('.', ',')} m fein` : '')
      + ' · das FERTIGE Netz zeigt „Netz" nach der Netzvorschau'
  } else {
    solverHint.value = ''
  }
}

// Geländekörper: Oberseite in Geländefarben, Schnitt- und Seitenflächen in
// Erdton — erst dadurch sieht man, dass es ein Volumen ist und keine Haut.
function buildTerrainSolid() {
  const ts = store.terrainSolid
  const geo = new STLLoader().parse(ts.stl)
  geo.computeVertexNormals()
  const pos = geo.getAttribute('position')
  const nor = geo.getAttribute('normal')
  let zMin = Infinity
  let zMax = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    if (z < zMin) zMin = z
    if (z > zMax) zMax = z
  }
  const span = Math.max(zMax - zMin, 0.01)
  const cLow = new THREE.Color(0x3d5240)
  const cHigh = new THREE.Color(0xb8a577)
  const cErde = new THREE.Color(0x6b5136)
  const cTief = new THREE.Color(0x3a2c1d)
  const c = new THREE.Color()
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const f = (pos.getZ(i) - zMin) / span
    if (nor.getZ(i) > 0.35) c.lerpColors(cLow, cHigh, f)
    else c.lerpColors(cTief, cErde, Math.min(1, f * 1.4))
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide }))
  groups.terrain = new THREE.Group()
  groups.terrain.add(mesh)
  // Kanten des Körpers betonen — sonst verschwimmt der Schnittrand
  const kanten = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 50),
    new THREE.LineBasicMaterial({ color: 0x241a10, transparent: true,
      opacity: 0.5 }))
  groups.terrain.add(kanten)
  scene.add(groups.terrain)
  solverHint.value = `Geländekörper: ${ts.volume.toLocaleString('de-DE')} m³, `
    + `${ts.triangles.toLocaleString('de-DE')} Dreiecke, `
    + (ts.watertight ? 'geschlossen' : 'NICHT geschlossen — snappy kann so '
      + 'nicht entscheiden, was Erdreich ist')
    + (ts.importiert ? ' · importierter Volumenkörper' : ' · aus dem Höhenfeld aufgezogen')
    + (ts.bohrungen?.length ? ` · durchbohrt von ${ts.bohrungen.join(', ')}` : '')
}

// feinste Zelle im Modell (Basiszelle durch die höchste Verfeinerungsstufe)
function feinsteZelle() {
  const cell = store.spec?.mesh?.base_cell ?? 0
  let stufe = 0
  for (const r of store.spec?.mesh?.refinements ?? []) {
    stufe = Math.max(stufe, r.level ?? 0)
  }
  return cell / 2 ** stufe
}

function buildSolids() {
  clearGroup('solids')
  selectable.length = 0
  groups.solids = new THREE.Group()
  const loader = new STLLoader()
  store.solids.forEach((s, i) => {
    const geo = loader.parse(s.stl)
    geo.computeVertexNormals()
    const mat = new THREE.MeshPhongMaterial({
      color: SOLID_COLORS[i % SOLID_COLORS.length],
      shininess: 24, transparent: true, opacity: 0.95 })
    const mesh = new THREE.Mesh(geo, mat)
    const struct = store.spec?.structures?.find((x) => x.patch === s.patch)
    mesh.userData = { kind: 'structure', id: struct?.id ?? s.patch }
    groups.solids.add(mesh)
    selectable.push(mesh)
  })
  scene.add(groups.solids)
}

function buildMarkers() {
  clearGroup('markers')
  groups.markers = new THREE.Group()
  const spec = store.spec
  if (!spec) return

  // Modellgebiet als Drahtquader
  if (spec.domain) {
    const [dx0, dy0, dx1, dy1] = spec.domain.extent
    const dbox = new THREE.Box3(
      new THREE.Vector3(dx0, dy0, spec.domain.z_min),
      new THREE.Vector3(dx1, dy1, spec.domain.z_max))
    const gebietFarbe = store.selection?.kind === 'domain' ? 0x4d9fff : 0x2c4370
    groups.markers.add(new THREE.Box3Helper(dbox, gebietFarbe))
    // Klickziel an den vier senkrechten Kanten: der Quader selbst wäre als
    // Vollkörper im Weg, die Kanten sind eindeutig und stören nicht
    for (const [cx, cy] of [[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]]) {
      const h = spec.domain.z_max - spec.domain.z_min
      const kante = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, h, 6),
        new THREE.MeshBasicMaterial({ visible: false }))
      kante.rotation.x = Math.PI / 2
      kante.position.set(cx, cy, (spec.domain.z_min + spec.domain.z_max) / 2)
      kante.userData = { kind: 'domain', id: 'domain' }
      groups.markers.add(kante)
      selectable.push(kante)
    }
  }

  // Verfeinerungsboxen als Drahtkörper
  for (const r of spec.mesh?.refinements ?? []) {
    if (r.type !== 'box') continue
    const [x0, y0, z0, x1, y1, z1] = r.extent
    const box = new THREE.Box3(new THREE.Vector3(x0, y0, z0),
      new THREE.Vector3(x1, y1, z1))
    const helper = new THREE.Box3Helper(box, 0xc98500)
    groups.markers.add(helper)
    const pick = new THREE.Mesh(
      new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0),
      new THREE.MeshBasicMaterial({ visible: false }))
    pick.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    pick.userData = { kind: 'refinement', id: r.id }
    groups.markers.add(pick)
    selectable.push(pick)
  }

  // Geländekanten aus der Vermessung: mit IHRER Höhe zeichnen, nicht auf
  // das Gelände gelegt — man muss sehen, wohin die Kante das Gelände zieht.
  for (const op of spec.terrain?.operations ?? []) {
    const linien = op.type === 'bruchkante' ? [[op.polyline, 0xffd24d]]
      : op.type === 'boeschung' ? [[op.oberkante, 0xffd24d],
        [op.unterkante, 0x4d9fff]]
        // Außenkante ohne Rahmen führt die Bezugskante selbst fort — dann
        // gibt es nichts zu zeichnen und erst recht nichts zu spreizen
        : op.type === 'aussenkante' && op.polygon?.length
          ? [[[...op.polygon, op.polygon[0]], 0x67d98f]] : []
    for (const [pts, farbe] of linien) {
      if (!pts?.length) continue
      const v = pts.map((q) => new THREE.Vector3(q[0], q[1], q[2] ?? 0))
      const linie = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(v),
        new THREE.LineBasicMaterial({ color: farbe }))
      linie.userData = { kind: 'terrain_op', id: op.id }
      groups.markers.add(linie)
      // dicker unsichtbarer Zylinder je Segment als Klickziel
      for (let i = 1; i < v.length; i++) {
        const mitte = v[i - 1].clone().lerp(v[i], 0.5)
        const laenge = v[i - 1].distanceTo(v[i])
        if (laenge < 1e-6) continue
        const ziel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, laenge, 6),
          new THREE.MeshBasicMaterial({ visible: false }))
        ziel.position.copy(mitte)
        ziel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
          v[i].clone().sub(v[i - 1]).normalize())
        ziel.userData = { kind: 'terrain_op', id: op.id }
        groups.markers.add(ziel)
        selectable.push(ziel)
      }
    }
    // Kein Füllband zwischen Ober- und Unterkante mehr: Stützpunkt i der
    // einen Linie gehört nicht zwangsläufig zu Stützpunkt i der anderen
    // (unterschiedliche Punktzahl, gegenläufige Richtung aus dem DXF), das
    // Band verhedderte sich zu einer sinnlosen gelben Fläche. Die Böschung
    // ist ohnehin im Geländeraster zu sehen — die Kanten reichen als Marke.
  }

  // Pegelpunkte
  for (const g of spec.evaluation?.gauges ?? []) {
    const z = terrainZ(g.point[0], g.point[1])
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12),
      new THREE.MeshPhongMaterial({ color: 0xd55181 }))
    m.position.set(g.point[0], g.point[1], z + 0.4)
    m.userData = { kind: 'gauge', id: g.id }
    groups.markers.add(m)
    selectable.push(m)
    const stab = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xd55181 }))
    stab.rotation.x = Math.PI / 2
    stab.position.set(g.point[0], g.point[1], z - 0.2)
    groups.markers.add(stab)
  }

  // Querschnittslinien
  for (const sec of spec.evaluation?.sections ?? []) {
    const pts = sec.polyline.map(([x, y]) =>
      new THREE.Vector3(x, y, terrainZ(x, y) + 0.6))
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x199e70, linewidth: 2 }))
    line.userData = { kind: 'section', id: sec.id }
    groups.markers.add(line)
  }

  // Gesetzte Bearbeitungen sichtbar machen: Aussparungen als Ring bzw.
  // Rechteck am Ort des Lochs, Schnitte als Ebene. Sonst steht der Stapel
  // nur als JSON da und man findet ein gesetztes Loch nicht wieder.
  for (const st of spec.structures ?? []) {
    for (const op of st.edits ?? []) {
      if (op.type === 'aussparung') {
        const srv = store.aufgeloest?.oeffnungen?.[st.id]?.[op.id]
        const lage = op.point
          ? { p: op.point, d: op.direction ? [-op.direction[1], op.direction[0]]
            : [1, 0] }
          : (srv ? { p: srv.point, d: srv.dir } : null)
        if (!lage) continue
        const mat = new THREE.MeshBasicMaterial({ color: 0xc98500,
          side: THREE.DoubleSide, transparent: true, opacity: 0.9,
          depthTest: false })
        let geo
        if (op.shape === 'kreis') {
          const r = (op.diameter ?? 0.5) / 2
          geo = new THREE.RingGeometry(Math.max(r - 0.06, 0.02), r, 24)
        } else {
          geo = new THREE.PlaneGeometry(op.width ?? 1, op.height ?? 1)
        }
        const marke = op.shape === 'kreis'
          ? new THREE.Mesh(geo, mat)
          : new THREE.LineSegments(new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0xc98500, depthTest: false }))
        marke.position.set(lage.p[0], lage.p[1], op.z ?? 0)
        // senkrechte Bohrung liegt flach, waagerechte steht quer zur Achse
        if (!op.vertikal) {
          marke.rotation.set(Math.PI / 2, 0, Math.atan2(lage.d[1], lage.d[0]))
        }
        marke.renderOrder = 3
        marke.userData = { kind: 'structure', id: st.id }
        groups.markers.add(marke)
        selectable.push(marke)
        // Der sichtbare Ring ist nur wenige Zentimeter breit — als Ziel
        // für Maus und Strahl viel zu dünn. Deshalb eine unsichtbare
        // Vollfläche darüber, die dieselbe Lage hat.
        const ziel = new THREE.Mesh(
          op.shape === 'kreis'
            ? new THREE.CircleGeometry((op.diameter ?? 0.5) / 2, 20)
            : new THREE.PlaneGeometry(op.width ?? 1, op.height ?? 1),
          new THREE.MeshBasicMaterial({ visible: false,
            side: THREE.DoubleSide }))
        ziel.position.copy(marke.position)
        ziel.rotation.copy(marke.rotation)
        ziel.userData = { kind: 'structure', id: st.id,
          editId: op.id, editIdx: (st.edits ?? []).indexOf(op) }
        groups.markers.add(ziel)
        selectable.push(ziel)
      } else if (op.type === 'schnitt' && op.achse === 'z') {
        const d = spec.domain
        if (!d) continue
        const [x0, y0, x1, y1] = d.extent
        const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0)
        const ebene = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color: 0xc98500, depthTest: false }))
        ebene.position.set((x0 + x1) / 2, (y0 + y1) / 2, op.position)
        ebene.renderOrder = 3
        ebene.userData = { kind: 'structure', id: st.id }
        groups.markers.add(ebene)
      }
    }
  }

  // Randflächenmarkierungen (Vorbelegung wie meshgen.assign_faces).
  // Mit Fenster: das Wirkrechteck leuchtet, der Rest der Fläche wird blass.
  if (spec.domain) {
    const [x0, y0, x1, y1] = spec.domain.extent
    const { z_min: z0, z_max: z1 } = spec.domain
    const faceGeo = {
      x_min: { pos: [x0, (y0 + y1) / 2, (z0 + z1) / 2], rot: [0, Math.PI / 2, 0], size: [z1 - z0, y1 - y0] },
      x_max: { pos: [x1, (y0 + y1) / 2, (z0 + z1) / 2], rot: [0, Math.PI / 2, 0], size: [z1 - z0, y1 - y0] },
      y_min: { pos: [(x0 + x1) / 2, y0, (z0 + z1) / 2], rot: [Math.PI / 2, 0, 0], size: [x1 - x0, z1 - z0] },
      y_max: { pos: [(x0 + x1) / 2, y1, (z0 + z1) / 2], rot: [Math.PI / 2, 0, 0], size: [x1 - x0, z1 - z0] },
    }
    const colors = { inflow: 0x3987e5, outflow: 0xd95926 }
    const faces = store.aufgeloest?.bcFaces ?? {}
    for (const b of spec.boundaries ?? []) {
      const face = faces[b.id]
      const color = ['inflow_hydrograph', 'inflow_constant'].includes(b.type)
        ? colors.inflow
        : ['outflow_fixed_level', 'outflow_free'].includes(b.type)
          ? colors.outflow : null
      if (!face || !faceGeo[face] || color == null) continue
      const fg = faceGeo[face]
      // Fenster liegen um `inset` INNERHALB der Randfläche — koplanare
      // Flächen z-fighten sonst (Flackern); depthWrite aus, damit die
      // transparenten Marker sich nicht gegenseitig ausstanzen
      const inset = { x_min: [0.04, 0, 0], x_max: [-0.04, 0, 0],
        y_min: [0, 0.04, 0], y_max: [0, -0.04, 0] }[face] ?? [0, 0, 0]
      const mkPlane = (size, pos, opacity, useInset = false) => {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(size[0], size[1]),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
            depthWrite: false, side: THREE.DoubleSide }))
        const off = useInset ? inset : [0, 0, 0]
        plane.position.set(pos[0] + off[0], pos[1] + off[1], pos[2] + off[2])
        plane.rotation.set(...fg.rot)
        plane.userData = { kind: 'boundary', id: b.id }
        groups.markers.add(plane)
        selectable.push(plane)
      }
      // Formfenster als 2D-Shape in (Kante, Höhe), auf die Fläche gedreht
      const mkFaceShape = (shape2d, opacity) => {
        const geo = new THREE.ShapeGeometry(shape2d, 24)
        const m = new THREE.Matrix4()
        if (face.startsWith('x')) {
          m.makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(1, 0, 0))
          m.setPosition(new THREE.Vector3(
            (face === 'x_min' ? x0 : x1) + inset[0], 0, 0))
        } else {
          m.makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 1, 0))
          m.setPosition(new THREE.Vector3(
            0, (face === 'y_min' ? y0 : y1) + inset[1], 0))
        }
        geo.applyMatrix4(m)
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(
          { color, transparent: true, opacity, depthWrite: false,
            side: THREE.DoubleSide }))
        mesh.userData = { kind: 'boundary', id: b.id }
        groups.markers.add(mesh)
        selectable.push(mesh)
      }
      const srvWin = store.aufgeloest?.fenster?.[b.id]
      const win = srvWin && face !== 'z_max'
        ? { ...srvWin, zlo: srvWin.zlo ?? spec.domain.z_min,
            zhi: srvWin.zhi ?? spec.domain.z_max }
        : null
      if (win) {
        mkPlane(fg.size, fg.pos, 0.06)
        if (win.shape === 'kreis') {
          const s = new THREE.Shape()
          s.absarc(win.center, win.zc, win.d / 2, 0, Math.PI * 2)
          mkFaceShape(s, 0.4)
        } else if (win.shape === 'polygon') {
          const s = new THREE.Shape()
          win.points.forEach(([a, z], k) => (k ? s.lineTo(a, z) : s.moveTo(a, z)))
          s.closePath()
          mkFaceShape(s, 0.4)
        } else if (win.shape === 'trapez') {
          const s = new THREE.Shape()
          s.moveTo(win.center - win.bw / 2, win.zw0)
          s.lineTo(win.center + win.bw / 2, win.zw0)
          s.lineTo(win.center + win.tw / 2, win.zw1)
          s.lineTo(win.center - win.tw / 2, win.zw1)
          s.closePath()
          mkFaceShape(s, 0.4)
        } else {
          const [s0, s1] = win.span
          const zm = (win.zlo + win.zhi) / 2
          if (face.startsWith('x')) {
            mkPlane([win.zhi - win.zlo, s1 - s0],
              [fg.pos[0], (s0 + s1) / 2, zm], 0.4, true)
          } else {
            mkPlane([s1 - s0, win.zhi - win.zlo],
              [(s0 + s1) / 2, fg.pos[1], zm], 0.4, true)
          }
        }
      } else {
        mkPlane(fg.size, fg.pos, 0.18)
      }
    }
  }

  scene.add(groups.markers)
}

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
    drawPts.value = [...drawPts.value, xy]
    updatePreview(pt)
  }
}

function finishDrawing() {
  if (mode.value === 'draw' && drawPts.value.length >= 2) {
    chooserPts.value = drawPts.value
    drawPts.value = []
    updatePreview(null)
  }
}

function createFromDrawing(opt) {
  const pts = chooserPts.value
  if (pts) opt.build(pts)
  cancelDrawing()
  mode.value = 'select'
}

function zAlong(pts) {
  return pts.map(([x, y]) => terrainZ(x, y))
}

function buildChannel(pts) {
  const zmin = Math.min(...zAlong(pts))
  store.addObject('terrain_op', {
    id: 'gerinne', type: 'channel_carve', polyline: pts,
    invert_start: Number((zmin - 1.2).toFixed(2)),
    invert_end: Number((zmin - 1.4).toFixed(2)),
    bottom_width: 2.0, depth: 1.5, side_slope: 1.5,
  })
}

function buildWall(pts) {
  const crest = Number((Math.max(...zAlong(pts)) + 1.5).toFixed(2))
  store.addObject('structure', {
    id: 'wand', type: 'wall', patch: 'wand',
    alignment: { kind: 'polyline', points: pts.map(([x, y]) => [x, y, crest]) },
    height: 2.0, thickness: 0.4,
  })
}

function buildPipe(pts) {
  // Stutzen: Rohr, dessen Mündung frei ragen darf (Freistrahl) — Achse
  // knapp überm Gelände; erster Punkt an den Gebietsrand, dann im Panel
  // „Fenster: an Stutzen gekoppelt" wählen
  const axis = pts.map(([x, y]) =>
    [x, y, Number((terrainZ(x, y) + 0.6).toFixed(2))])
  store.addObject('structure', {
    id: 'stutzen', type: 'culvert', patch: 'stutzen',
    axis, profile: { kind: 'circular', diameter: 0.8 },
  })
}

function buildEmbankment(pts) {
  store.addObject('terrain_op', {
    id: 'damm', type: 'embankment', polyline: pts,
    crest_level: Number((Math.max(...zAlong(pts)) + 1.5).toFixed(2)),
    crest_width: 2.0, side_slope: 2.0,
  })
}

function buildPad(pts) {
  const z = zAlong(pts)
  store.addObject('terrain_op', {
    id: 'planum', type: 'pad', polygon: pts,
    level: Number((z.reduce((a, b) => a + b, 0) / z.length).toFixed(2)),
  })
}

function buildBasin(pts) {
  store.addObject('structure', {
    id: 'becken', type: 'basin', patch: 'becken', footprint: pts,
    invert_level: Number((Math.min(...zAlong(pts)) - 0.5).toFixed(2)),
    wall_height: 2.0, wall_thickness: 0.3,
  })
}

function buildRefineBox(pts) {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const zmin = Math.min(...zAlong(pts))
  store.addObject('refinement', {
    id: 'box', type: 'box',
    extent: [Math.min(...xs), Math.min(...ys), Number((zmin - 1).toFixed(2)),
      Math.max(...xs), Math.max(...ys), Number((zmin + 3).toFixed(2))],
    level: 2,
  })
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
let axisGuides = null    // { group, mats: {x,y,z} }
let axisLock = null      // 'x' | 'y' | null

const AXIS_COLORS = { x: 0xe66767, y: 0x34c98a, z: 0x4d9fff }
const SNAP_ENTER_DEG = 14   // Führungslinie fängt unter diesem Winkel
const SNAP_EXIT_DEG = 26    // und lässt erst hier wieder los (Hysterese)

function showAxisGuides(ax, ay, az) {
  hideAxisGuides()
  const ext = store.spec?.domain?.extent
  const L = ext ? Math.max(ext[2] - ext[0], ext[3] - ext[1]) * 1.2 : 300
  const Lz = Math.max(L * 0.12, 15)
  const group = new THREE.Group()
  const mats = {}
  const mk = (axis, a, b) => {
    mats[axis] = new THREE.LineBasicMaterial({ color: AXIS_COLORS[axis],
      transparent: true, opacity: 0.35, depthTest: false })
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]), mats[axis])
    line.renderOrder = 5
    group.add(line)
  }
  mk('x', new THREE.Vector3(ax - L, ay, az), new THREE.Vector3(ax + L, ay, az))
  mk('y', new THREE.Vector3(ax, ay - L, az), new THREE.Vector3(ax, ay + L, az))
  mk('z', new THREE.Vector3(ax, ay, az - Lz), new THREE.Vector3(ax, ay, az + Lz))
  axisGuides = { group, mats }
  scene.add(group)
}

function hideAxisGuides() {
  if (!axisGuides) return
  scene.remove(axisGuides.group)
  axisGuides.group.traverse((c) => {
    c.geometry?.dispose?.()
    c.material?.dispose?.()
  })
  axisGuides = null
  axisLock = null
}

function highlightAxis(lock) {
  if (!axisGuides) return
  axisGuides.mats.x.opacity = lock === 'x' ? 0.95 : 0.35
  axisGuides.mats.y.opacity = lock === 'y' ? 0.95 : 0.35
  axisGuides.mats.z.opacity = lock === 'z' ? 0.95 : 0.35
}

const _axisHint = () => (axisLock
  ? ` · ${axisLock.toUpperCase()}-Achse (Alt = frei)` : '')

// Bildschirmrichtungen der drei Achsen am Griffpunkt (Pixel je Meter).
// Die Mausbewegung wird gegen die Führungslinien verglichen, WIE MAN SIE
// SIEHT — damit fängt auch die Z-Linie genau dann, wenn man an ihr
// entlangzieht, ohne Sondertaste.
function dragScreenInit(e, ax, ay, az) {
  const rect = host.value.getBoundingClientRect()
  const pr = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(camera)
    return [rect.left + ((v.x + 1) / 2) * rect.width,
      rect.top + (1 - (v.y + 1) / 2) * rect.height]
  }
  const p0 = pr(ax, ay, az)
  const px = pr(ax + 1, ay, az)
  const py = pr(ax, ay + 1, az)
  const pz = pr(ax, ay, az + 1)
  return {
    start: [e.clientX, e.clientY],
    axes: {
      x: [px[0] - p0[0], px[1] - p0[1]],
      y: [py[0] - p0[0], py[1] - p0[1]],
      z: [pz[0] - p0[0], pz[1] - p0[1]],
    },
  }
}

// Projektion der Mausbewegung auf eine Achse: Meter entlang der Achse und
// Winkelabweichung in Grad (999 = Achse steht fast senkrecht zum Schirm)
function _axisFit(sdx, sdy, ea) {
  const el = Math.hypot(ea[0], ea[1])
  if (el < 2) return { dev: 999, t: 0 }
  const dot = sdx * ea[0] + sdy * ea[1]
  const sLen = Math.hypot(sdx, sdy)
  const cos = Math.min(Math.abs(dot) / ((sLen * el) || 1), 1)
  return { dev: (Math.acos(cos) * 180) / Math.PI, t: dot / (el * el) }
}

// Interpretiert die GESAMTE Geste seit Drag-Beginn: Strg erzwingt Z,
// Alt = frei, sonst fängt die am besten passende Führungslinie
// (Hysterese über axisLock). Rückgabe { lock, t (Meter), hold }.
function gestureSnap(drag, e, zable) {
  const s = drag.screen
  const sdx = e.clientX - s.start[0]
  const sdy = e.clientY - s.start[1]
  // Bei steilem Blick (Draufsicht) projiziert die Z-Achse nur noch radial
  // verzerrt — dann ist sie weder als Fangziel brauchbar noch als Maßstab
  const camDir = new THREE.Vector3()
  camera.getWorldDirection(camDir)
  const steep = Math.abs(camDir.z) > 0.9
  if (e.altKey) { axisLock = null; return { lock: null } }
  if (e.ctrlKey && zable) {
    axisLock = 'z'
    if (!steep) {
      const fit = _axisFit(sdx, sdy, s.axes.z)
      if (fit.dev < 900) return { lock: 'z', t: fit.t }
    }
    // Draufsicht/steiler Blick: Maus hoch = Objekt hoch (Pixel in Meter)
    const rect = host.value.getBoundingClientRect()
    const dist = camera.position.distanceTo(controls.target)
    const mpp = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / rect.height
    return { lock: 'z', t: -sdy * mpp }
  }
  if (Math.hypot(sdx, sdy) < 8) return { lock: axisLock, hold: true }
  const cand = {
    x: _axisFit(sdx, sdy, s.axes.x),
    y: _axisFit(sdx, sdy, s.axes.y),
    z: zable && !steep ? _axisFit(sdx, sdy, s.axes.z) : { dev: 999, t: 0 },
  }
  if (axisLock && cand[axisLock].dev > SNAP_EXIT_DEG) axisLock = null
  if (!axisLock) {
    const best = ['x', 'y', 'z'].reduce((a, b) =>
      (cand[a].dev <= cand[b].dev ? a : b))
    if (cand[best].dev < SNAP_ENTER_DEG) axisLock = best
  }
  return { lock: axisLock, t: axisLock ? cand[axisLock].t : 0 }
}

// Schwebende Anzeige der Verschiebung je Achse (folgt dem Cursor)
const dragDelta = ref(null)   // { dx, dy, dz, lock, px, py }

const fmtDelta = (v) => (Math.abs(v) < 0.005
  ? '0.00' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`) + ' m'

function updateDragDelta(e, dx, dy, dz, lock) {
  const rect = host.value.getBoundingClientRect()
  dragDelta.value = { dx, dy, dz, lock,
    px: e.clientX - rect.left + 18, py: e.clientY - rect.top + 18 }
}

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
    if (rotAktiv()) {
      commitRotDrag()
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
        const pt = groundPick(e)
        if (pt) handleToolClick(pt)
      }
    }
    downPos = null
  })
  renderer.domElement.addEventListener('pointermove', (e) => {
    lastMove = e                      // für Entf (Ecke unterm Cursor löschen)
    if (rotAktiv()) {
      dragRotTo(e)
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
  z-index: 5;
  background: rgba(10, 16, 31, 0.9);
  border: 1px solid var(--f3d-border);
  border-radius: 8px;
  padding: 6px 10px;
}
.f3d-veraltet {
  position: absolute;
  top: 48px;
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
