// Achsenführung und Zieh-Anzeige (aus Editor3D.vue geschnitten):
// X/Y/Z-Führungslinien mit Fang-Hysterese, Bildschirmprojektion der
// Achsen, Snapping-Gesten und die schwebende Δ-Anzeige.
import * as THREE from 'three'
import { ref } from 'vue'

export function erzeugeAchsen({ store, host, holeScene, holeCamera,
  holeControls }) {
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
  holeScene().add(group)
}

function hideAxisGuides() {
  if (!axisGuides) return
  holeScene().remove(axisGuides.group)
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
    const v = new THREE.Vector3(x, y, z).project(holeCamera())
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
  holeCamera().getWorldDirection(camDir)
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
    const dist = holeCamera().position.distanceTo(holeControls().target)
    const mpp = (2 * dist * Math.tan((holeCamera().fov * Math.PI) / 360)) / rect.height
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
  // An den Rand geklemmt: die Anzeige stand vorher stur 18 px rechts
  // unter dem Cursor und wurde am rechten/unteren Szenenrand vom
  // overflow:hidden abgeschnitten — also genau dort unlesbar, wo man
  // sie beim Ziehen braucht. Schaetzmasse der Box, damit sie ganz bleibt.
  const breite = 190
  const hoehe = 30
  const px = Math.min(e.clientX - rect.left + 18, rect.width - breite - 8)
  const py = Math.min(e.clientY - rect.top + 18, rect.height - hoehe - 8)
  dragDelta.value = { dx, dy, dz, lock,
    px: Math.max(8, px), py: Math.max(8, py) }
}


  return { showAxisGuides, hideAxisGuides, highlightAxis, axisHint: _axisHint,
    dragScreenInit, gestureSnap, dragDelta, fmtDelta, updateDragDelta }
}
