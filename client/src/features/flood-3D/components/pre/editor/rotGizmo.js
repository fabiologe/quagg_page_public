// Drehgriff des Modellgebiets (aus Editor3D.vue geschnitten): Gizmo-
// Aufbau, Live-Vorschau durch Drehen der Szenengruppen, Commit an
// store.drehen. Szene/Renderer/Controls kommen über einen Getter, weil
// der Editor sie erst beim Mount belegt.
import * as THREE from 'three'
import { ref } from 'vue'

export function erzeugeRotGizmo({ store, holeSzene, groups, ray, planePick,
  clearGroup, buildHandles }) {
  const sz = holeSzene
const ROT_FARBE = 0x4d9fff
let rotDrag = null            // { cx, cy, z, start, grad } während des Zugs
const rotInfo = ref('')

function rotGeometrie() {
  const d = store.spec?.domain
  if (!d) return null
  const [x0, y0, x1, y1] = d.extent
  const spanne = Math.max(d.z_max - d.z_min, 1)
  return {
    cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
    r: Math.max(Math.min(x1 - x0, y1 - y0) * 0.2, 1.5),
    z0: d.z_min, zTop: d.z_max + Math.max(spanne * 0.35, 1.5),
  }
}

function buildRotGizmo() {
  const g = rotGeometrie()
  if (!g || !groups.handles) return
  const voll = new THREE.MeshBasicMaterial({ color: ROT_FARBE,
    depthTest: false, transparent: true, opacity: 0.9 })
  const unsichtbar = new THREE.MeshBasicMaterial({ transparent: true,
    opacity: 0, depthTest: false, depthWrite: false })
  const dick = g.r * 0.055

  // dicke z-Achse: zeigt, worum gedreht wird
  const hoehe = g.zTop - g.z0
  const achse = new THREE.Mesh(
    new THREE.CylinderGeometry(dick, dick, hoehe, 12), voll)
  achse.rotation.x = Math.PI / 2
  achse.position.set(g.cx, g.cy, g.z0 + hoehe / 2)
  achse.renderOrder = 4
  const spitze = new THREE.Mesh(
    new THREE.ConeGeometry(dick * 2.4, dick * 7, 12), voll)
  spitze.rotation.x = Math.PI / 2
  spitze.position.set(g.cx, g.cy, g.zTop + dick * 3.5)
  spitze.renderOrder = 4
  groups.handles.add(achse, spitze)

  // gekrümmter Doppelpfeil um die Achse
  const bogen = Math.PI * 1.45
  const ring = new THREE.Group()
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(g.r, dick * 0.8, 10, 64, bogen), voll)
  torus.renderOrder = 4
  ring.add(torus)
  for (const [winkel, dreh] of [[0, Math.PI], [bogen, bogen]]) {
    const kopf = new THREE.Mesh(
      new THREE.ConeGeometry(dick * 2.2, dick * 6.5, 12), voll)
    kopf.position.set(g.r * Math.cos(winkel), g.r * Math.sin(winkel), 0)
    kopf.rotation.z = dreh          // Kegel zeigt entlang der Tangente
    kopf.renderOrder = 4
    ring.add(kopf)
  }
  // großzügiges, unsichtbares Greifband auf demselben Bogen
  const greifer = new THREE.Mesh(
    new THREE.TorusGeometry(g.r, dick * 4, 8, 48, bogen), unsichtbar)
  greifer.userData = { rotGizmo: true }
  ring.add(greifer)
  ring.position.set(g.cx, g.cy, g.zTop)
  groups.handles.add(ring)
}

function pickRotGizmo(e) {
  if (!groups.handles) return false
  const ziele = []
  groups.handles.traverse((c) => { if (c.userData?.rotGizmo) ziele.push(c) })
  return ziele.length > 0 && ray(e).intersectObjects(ziele, false).length > 0
}

// Eine Szenengruppe um die senkrechte Achse durch (cx, cy) drehen — nur
// Vorschau, gerechnet wird serverseitig.
function drehGruppe(gruppe, rad, cx, cy) {
  if (!gruppe) return
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  gruppe.rotation.z = rad
  gruppe.position.set(cx - (c * cx - s * cy), cy - (s * cx + c * cy), 0)
}

function rotVorschauZuruecksetzen() {
  for (const name of ['terrain', 'solids', 'markers']) {
    const gruppe = groups[name]
    if (!gruppe) continue
    gruppe.rotation.z = 0
    gruppe.position.set(0, 0, 0)
  }
  clearGroup('rotbox')
}

// Umriss des Gebiets, das nach der Drehung entstünde (achsparallel um die
// gedrehte Geometrie herum) — gestrichelt, damit der Zuschnitt vorab sichtbar ist
function zeigeNeuesGebiet(rad) {
  clearGroup('rotbox')
  const d = store.spec?.domain
  if (!d) return
  const [x0, y0, x1, y1] = d.extent
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  const xs = []
  const ys = []
  for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
    xs.push(cx + c * (px - cx) - s * (py - cy))
    ys.push(cy + s * (px - cx) + c * (py - cy))
  }
  const [nx0, nx1] = [Math.min(...xs), Math.max(...xs)]
  const [ny0, ny1] = [Math.min(...ys), Math.max(...ys)]
  const z = d.z_max
  const linie = new THREE.Line(new THREE.BufferGeometry().setFromPoints(
    [[nx0, ny0], [nx1, ny0], [nx1, ny1], [nx0, ny1], [nx0, ny0]]
      .map(([x, y]) => new THREE.Vector3(x, y, z))),
  new THREE.LineDashedMaterial({ color: 0x7dd3fc, dashSize: 1.2, gapSize: 0.8,
    depthTest: false }))
  linie.computeLineDistances()
  linie.renderOrder = 5
  groups.rotbox = new THREE.Group()
  groups.rotbox.add(linie)
  sz().scene.add(groups.rotbox)
}

function rotWinkel(e) {
  const p = planePick(e, rotDrag.z)
  if (!p) return null
  return Math.atan2(p.y - rotDrag.cy, p.x - rotDrag.cx)
}

function startRotDrag(e) {
  const g = rotGeometrie()
  if (!g) return false
  rotDrag = { cx: g.cx, cy: g.cy, z: g.zTop, start: 0, grad: 0 }
  const a = rotWinkel(e)
  if (a == null) { rotDrag = null; return false }
  rotDrag.start = a
  sz().controls.enabled = false
  sz().renderer.domElement.style.cursor = 'grabbing'
  sz().renderer.domElement.setPointerCapture(e.pointerId)
  rotInfo.value = 'Modell drehen: 0,0° · Shift rastet auf 15° · Esc bricht ab'
  return true
}

function dragRotTo(e) {
  const a = rotWinkel(e)
  if (a == null) return
  let grad = ((a - rotDrag.start) * 180) / Math.PI
  grad = ((grad + 180) % 360 + 360) % 360 - 180      // auf ±180° bringen
  if (e.shiftKey) grad = Math.round(grad / 15) * 15
  else grad = Math.round(grad * 10) / 10
  rotDrag.grad = grad
  const rad = (grad * Math.PI) / 180
  for (const name of ['terrain', 'solids', 'markers']) {
    drehGruppe(groups[name], rad, rotDrag.cx, rotDrag.cy)
  }
  zeigeNeuesGebiet(rad)
  rotInfo.value = `Modell drehen: ${grad.toFixed(1).replace('.', ',')}°`
    + ' · Shift rastet auf 15° · Esc bricht ab'
}

function cancelRotDrag() {
  rotDrag = null
  rotInfo.value = ''
  rotVorschauZuruecksetzen()
  sz().controls.enabled = true
  sz().renderer.domElement.style.cursor = 'default'
}

async function commitRotDrag() {
  const grad = rotDrag?.grad ?? 0
  cancelRotDrag()
  if (Math.abs(grad) < 0.05) return
  // Der Server dreht jede Koordinate des Falls und tastet das Höhenraster
  // neu ab; danach kommen Gelände und Körper ohnehin frisch zurück.
  const hinweise = await store.drehen(grad)
  buildHandles()
  // Das Drehen schreibt den Fall — der Weg zurück ist der Verlaufsstapel
  rotInfo.value = [`Um ${grad.toFixed(1).replace('.', ',')}° gedreht`,
    ...hinweise, 'Strg+Z stellt den Stand davor wieder her'].join(' · ')
  setTimeout(() => { rotInfo.value = '' }, 15000)
}


  return { rotInfo, rotAktiv: () => rotDrag !== null, buildRotGizmo,
    pickRotGizmo, startRotDrag, dragRotTo, cancelRotDrag, commitRotDrag }
}
