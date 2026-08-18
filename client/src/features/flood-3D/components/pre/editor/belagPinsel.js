// Belag-Pinsel — welcher Oberflächenbelag wo auf dem Gelände liegt.
//
// Aufbau wie der Gelände-Pinsel (editor/sculpt.js): Raycast auf das
// Geländenetz, Strich in Gitterindizes sammeln, beim Loslassen an den
// Server. Der Unterschied steckt in dem, was gemalt wird — nicht eine
// Höhenänderung, sondern eine KENNUNG.
//
// Daraus folgen drei Abweichungen, die kein Zufall sind:
//
//   * Gesetzt statt addiert. Eine Kennung ist eine Zuordnung, keine
//     Menge; ein zweiter Strich derselben Stelle überschreibt.
//   * Keine weiche Kante. Der Pinsel des Geländes verläuft nach außen
//     aus (cos²-Gewicht) — bei Kennungen gäbe das eine Mischung, die es
//     nicht gibt. Der Rand ist hart, und die Auflösung ist die
//     Rasterzelle.
//   * Kennung 0 ist der Radiergummi.
//
// Die Vorschau färbt das Geländenetz über Vertexfarben ein; die Wahrheit
// steht danach im Serverraster (POST /cases/{id}/belag-malen).
import * as THREE from 'three'
import { ref } from 'vue'

// Farbe der Fläche ohne Belag: das Gelände bleibt, wie es ist.
const OHNE = new THREE.Color(0xffffff)

/**
 * Die Rasterzellen unter dem Pinsel — als reine Rechnung, damit die eine
 * Zusage prüfbar ist, die den Belag-Pinsel vom Gelände-Pinsel trennt:
 * der Rand ist HART. Beim Gelände verläuft die Wirkung nach außen aus
 * (cos²-Gewicht); bei einer Kennung gäbe das eine Mischung, die es nicht
 * gibt — eine Fläche ist Beton oder Rasen.
 *
 * @returns {number[]} flache Indizes (j * nx + i)
 */
export function pinselZellen(cx, cy, r, form, g) {
  const { x0, y0, res, nx, ny } = g
  const i0 = Math.max(0, Math.floor((cx - r - x0) / res))
  const i1 = Math.min(nx - 1, Math.ceil((cx + r - x0) / res))
  const j0 = Math.max(0, Math.floor((cy - r - y0) / res))
  const j1 = Math.min(ny - 1, Math.ceil((cy + r - y0) / res))
  const aus = []
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = x0 + i * res
      const y = y0 + j * res
      const drin = form === 'kreis'
        ? Math.hypot(x - cx, y - cy) <= r
        : Math.abs(x - cx) <= r && Math.abs(y - cy) <= r
      if (drin) aus.push(j * nx + i)
    }
  }
  return aus
}

export function erzeugeBelagPinsel({ store, groups, holeScene, holeCamera,
  holeRenderer, holeControls, melden }) {
  const radius = ref(2.0)             // m
  const form = ref('kreis')           // kreis | quadrat
  const aktiv = ref(0)                // gewählte Belag-Kennung, 0 = löschen
  const sendet = ref(false)

  const ray = new THREE.Raycaster()
  let cursorGrp = null
  let strich = null                   // { ids: Int16Array, bbox }
  let letzterTick = 0

  const mesh = () => groups.terrain?.children?.[0] ?? null

  const gitter = () => {
    const b = store.belag
    if (!b) return null
    const [ny, nx] = b.dims
    return { b, nx, ny, res: b.resolution }
  }

  const farbeVon = (kennung) => {
    const m = (store.belaege ?? []).find((x) => x.id === kennung)
    return m ? new THREE.Color(m.farbe || '#888888') : OHNE
  }

  // ---- Vorschau: Vertexfarben auf dem Geländenetz ------------------------

  /**
   * Das Geländenetz nach der Belagskarte einfärben.
   *
   * Über Vertexfarben und nicht über ein zweites Netz: das Gelände kann
   * ein Erdkörper mit Bohrungen sein, und eine daraufgelegte Fläche
   * müsste jede Änderung mitmachen. Die Farbe liegt am selben Punkt wie
   * die Höhe — sie kann gar nicht verrutschen.
   */
  function einfaerben() {
    const m = mesh()
    const g = gitter()
    if (!m || !g) return
    const pos = m.geometry.attributes.position
    let farben = m.geometry.attributes.color
    if (!farben || farben.count !== pos.count) {
      farben = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3)
      m.geometry.setAttribute('color', farben)
    }
    const { b, nx, ny, res } = g
    for (let v = 0; v < pos.count; v++) {
      const i = Math.round((pos.getX(v) - b.x0) / res)
      const j = Math.round((pos.getY(v) - b.y0) / res)
      const drin = i >= 0 && i < nx && j >= 0 && j < ny
      const c = drin ? farbeVon(b.ids[j * nx + i]) : OHNE
      farben.setXYZ(v, c.r, c.g, c.b)
    }
    farben.needsUpdate = true
    if (m.material && !m.material.vertexColors) {
      m.material.vertexColors = true
      m.material.needsUpdate = true
    }
  }

  /** Die Einfärbung wieder abnehmen — das Gelände sieht aus wie vorher. */
  function entfaerben() {
    const m = mesh()
    if (!m?.material?.vertexColors) return
    m.material.vertexColors = false
    m.material.needsUpdate = true
  }

  // ---- Cursor ------------------------------------------------------------

  const RING_SEG = 48

  function baueCursor() {
    raeumeCursor()
    cursorGrp = new THREE.Group()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array((RING_SEG + 1) * 3), 3))
    const ring = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffc832, depthTest: false, transparent: true, opacity: 0.9 }))
    ring.renderOrder = 30
    ring.name = 'ring'
    cursorGrp.add(ring)
    cursorGrp.visible = false
    holeScene().add(cursorGrp)
  }

  function raeumeCursor() {
    if (!cursorGrp) return
    holeScene().remove(cursorGrp)
    cursorGrp.traverse((o) => { o.geometry?.dispose(); o.material?.dispose() })
    cursorGrp = null
  }

  function hoeheBei(x, y) {
    const t = store.terrain
    if (!t) return 0
    const [ny, nx] = t.dims
    const i = Math.max(0, Math.min(nx - 1,
      Math.round((x - t.x0) / t.resolution)))
    const j = Math.max(0, Math.min(ny - 1,
      Math.round((y - t.y0) / t.resolution)))
    return t.z[j * nx + i]
  }

  function zeigeCursor(cx, cy) {
    if (!cursorGrp) baueCursor()
    const ring = cursorGrp.getObjectByName('ring')
    const pos = ring.geometry.attributes.position
    const r = radius.value
    // Umfang je nach Form — dieselbe Parametrierung wie beim
    // Gelände-Pinsel, damit sich beide gleich anfühlen
    for (let k = 0; k <= RING_SEG; k++) {
      let x
      let y
      if (form.value === 'quadrat') {
        const u = ((k % RING_SEG) / RING_SEG) * 4
        const seite = Math.floor(u)
        const f = u - seite
        if (seite === 0) { x = -r + 2 * r * f; y = -r }
        else if (seite === 1) { x = r; y = -r + 2 * r * f }
        else if (seite === 2) { x = r - 2 * r * f; y = r }
        else { x = -r; y = r - 2 * r * f }
      } else {
        const a = (k / RING_SEG) * Math.PI * 2
        x = Math.cos(a) * r
        y = Math.sin(a) * r
      }
      pos.setXYZ(k, cx + x, cy + y, hoeheBei(cx + x, cy + y) + 0.06)
    }
    pos.needsUpdate = true
    ring.geometry.computeBoundingSphere()
    cursorGrp.visible = true
  }

  // ---- Malen -------------------------------------------------------------

  function anwenden(cx, cy) {
    const g = gitter()
    if (!g || !strich) return
    const { b, nx } = g
    let geaendert = false
    for (const k of pinselZellen(cx, cy, radius.value, form.value,
      { x0: b.x0, y0: b.y0, res: g.res, nx, ny: g.ny })) {
      if (b.ids[k] === aktiv.value) continue
      b.ids[k] = aktiv.value          // GESETZT, nicht addiert
      strich.ids[k] = 1
      const i = k % nx
      const j = (k - i) / nx
      if (i < strich.bbox[0]) strich.bbox[0] = i
      if (j < strich.bbox[1]) strich.bbox[1] = j
      if (i > strich.bbox[2]) strich.bbox[2] = i
      if (j > strich.bbox[3]) strich.bbox[3] = j
      geaendert = true
    }
    if (geaendert) einfaerben()
  }

  function strichZuMaske(s) {
    const g = gitter()
    if (!g) return null
    const [i0, j0, i1, j1] = s.bbox
    if (i1 < i0 || j1 < j0) return null
    const maske = []
    for (let j = j0; j <= j1; j++) {
      const zeile = new Array(i1 - i0 + 1)
      for (let i = i0; i <= i1; i++) zeile[i - i0] = !!s.ids[j * g.nx + i]
      maske.push(zeile)
    }
    return { i0, j0, belag: aktiv.value, maske }
  }

  // ---- Pointer-Maschine (von Editor3D aufgerufen) -----------------------

  function hit(e) {
    const m = mesh()
    if (!m) return null
    const el = holeRenderer().domElement
    const rect = el.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1), holeCamera())
    const h = ray.intersectObject(m, false)
    if (!h.length) return null
    if (!store.terrainSolid) return h[0].point
    // Erdkörper: nur die Deckfläche trägt einen Belag — ein Treffer auf
    // Wand, Sohle oder in der Bohrung bildete x/y sinnlos ab
    const oben = h.find((t) => (t.face?.normal?.z ?? 0) > 0.35)
    return oben ? oben.point : null
  }

  function strichStart(e) {
    if (e.button !== 0) return false
    const p = hit(e)
    const g = gitter()
    if (!p || !g) return false
    strich = { ids: new Uint8Array(g.nx * g.ny),
      bbox: [g.nx, g.ny, -1, -1] }
    holeControls().enabled = false
    holeRenderer().domElement.setPointerCapture(e.pointerId)
    anwenden(p.x, p.y)
    zeigeCursor(p.x, p.y)
    return true
  }

  function strichZieh(e) {
    const jetzt = performance.now()
    if (jetzt - letzterTick < 25) return
    letzterTick = jetzt
    const p = hit(e)
    if (!p) { if (cursorGrp) cursorGrp.visible = false; return }
    zeigeCursor(p.x, p.y)
    if (strich) anwenden(p.x, p.y)
  }

  async function strichEnde(e) {
    holeControls().enabled = true
    try { holeRenderer().domElement.releasePointerCapture(e.pointerId) }
    catch { /* Zeiger schon weg */ }
    const s = strich
    strich = null
    if (!s) return
    const maske = strichZuMaske(s)
    if (!maske) return
    sendet.value = true
    try {
      const meldungen = await store.belagMalen([maske])
      // Der Server kann eine gemalte Kennung ohne Material melden — das
      // ist ein stummes Loch, wenn es niemand sagt.
      for (const m of meldungen ?? []) {
        if (typeof m === 'string' && m.includes('Achtung')) melden?.(m, 'warnung')
      }
      einfaerben()
    } catch (err) {
      melden?.(`Malen fehlgeschlagen: ${err.message}`, 'fehler')
      await store.ladeBelagskarte()
      einfaerben()
    } finally {
      sendet.value = false
    }
  }

  async function einschalten() {
    if (!store.belag) await store.ladeBelagskarte()
    if (!store.belag) {
      melden?.('Für diesen Fall gibt es kein Geländeraster zum Bemalen.',
        'warnung')
      return false
    }
    baueCursor()
    einfaerben()
    return true
  }

  function ausschalten() {
    raeumeCursor()
    entfaerben()
    strich = null
  }

  return { radius, form, aktiv, sendet, einschalten, ausschalten,
    strichStart, strichZieh, strichEnde, einfaerben }
}
