// Gelände-Sculpting — der Pinsel des Editors.
//
// Alle Pinsel (heben, senken, glätten, an Bruchkante anpassen) erzeugen
// dasselbe: ein DELTA aufs Höhenraster. Während des Strichs formt der
// Client das Vorschau-Netz live (Vertex-Update, kein Rebuild); beim
// Loslassen geht das gesammelte Delta als Patch in Gitterindizes an
// POST /cases/{id}/sculpt (core/sculpt.py) — der Server ist die Wahrheit,
// die Antwort baut das Gelände neu. Rückgängig ist das inverse Patch;
// der globale Undo-Stack bleibt außen vor (ein Spec-Snapshot kann die
// Delta-DATEI nicht zurückdrehen — die Undo-Snapshot-Falle).
import * as THREE from 'three'
import { ref } from 'vue'

export function erzeugeSculpt({ store, groups, holeScene, holeCamera,
  holeRenderer, holeControls, melden }) {
  const modus = ref('heben')          // heben | senken | glaetten | kante
  const radius = ref(4.0)             // m
  const staerke = ref(0.5)            // 0..1
  const form = ref('kreis')           // kreis | quadrat
  const striche = ref(0)              // Größe des Rückgängig-Stapels

  const ray = new THREE.Raycaster()
  let cursorGrp = null                // Pinselring + Fangmarke
  let strich = null                   // { dz: Float64Array, bbox, wartet }
  let mouseLinksVorher = null         // OrbitControls-Belegung merken
  let letzterTick = 0
  const stapel = []                   // Strich-Patches für Rückgängig

  const mesh = () => groups.terrain?.children?.[0] ?? null

  // Erdkörper: geformt wird DIREKT am Volumenkörper (kein Anzeige-
  // Wechsel). Seine Deckfläche liegt auf dem Höhenraster — die „Haut"
  // (alle Soup-Vertices auf Rasterhöhe) wird beim Strich mit dem Gitter
  // mitgezogen; Sohle, Wände und Bohrungen bleiben stehen. Nach dem
  // Strich baut die Server-Antwort den Körper ohnehin exakt neu.
  let haut = null               // Int32Array Vertexindizes der Deckfläche
  let hautMesh = null           // Gültigkeitsanker: Geometrie gewechselt?

  function bereiteHaut(m) {
    if (hautMesh === m && haut) return
    hautMesh = m
    haut = null
    const g = gitter()
    if (!g) return
    const eps = Math.max(0.05, 0.35 * g.res)
    const pos = m.geometry.attributes.position
    const idx = []
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (Math.abs(z - terrainZ(pos.getX(i), pos.getY(i))) < eps) idx.push(i)
    }
    haut = Int32Array.from(idx)
  }

  function hautNachziehen(m, wx0, wy0, wx1, wy1) {
    if (!haut) return
    const pos = m.geometry.attributes.position
    for (let n = 0; n < haut.length; n++) {
      const i = haut[n]
      const x = pos.getX(i)
      const y = pos.getY(i)
      if (x < wx0 || x > wx1 || y < wy0 || y > wy1) continue
      pos.setZ(i, terrainZ(x, y))
    }
    pos.needsUpdate = true
  }
  const gitter = () => {
    const t = store.terrain
    if (!t) return null
    const [ny, nx] = t.dims
    return { t, nx, ny, res: t.resolution }
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

  function terrainZ(x, y) {
    const g = gitter()
    if (!g) return 0
    const { t, nx, ny } = g
    const fx = Math.min(nx - 1.001, Math.max(0, (x - t.x0) / t.resolution))
    const fy = Math.min(ny - 1.001, Math.max(0, (y - t.y0) / t.resolution))
    const i = Math.floor(fx); const j = Math.floor(fy)
    const dx = fx - i; const dy = fy - j
    const z = t.z
    return z[j * nx + i] * (1 - dx) * (1 - dy) + z[j * nx + i + 1] * dx * (1 - dy)
      + z[(j + 1) * nx + i] * (1 - dx) * dy + z[(j + 1) * nx + i + 1] * dx * dy
  }

  function zeigeCursor(cx, cy) {
    if (!cursorGrp) return
    const ring = cursorGrp.getObjectByName('ring')
    const pos = ring.geometry.attributes.position
    const r = radius.value
    for (let k = 0; k <= RING_SEG; k++) {
      let x; let y
      if (form.value === 'quadrat') {
        // Quadratumfang mit Parameter k
        const u = (k % RING_SEG) / RING_SEG * 4
        const seite = Math.floor(u)
        const f = u - seite
        if (seite === 0) { x = -r + 2 * r * f; y = -r }
        else if (seite === 1) { x = r; y = -r + 2 * r * f }
        else if (seite === 2) { x = r - 2 * r * f; y = r }
        else { x = -r; y = r - 2 * r * f }
      } else {
        const a = (k / RING_SEG) * Math.PI * 2
        x = Math.cos(a) * r; y = Math.sin(a) * r
      }
      pos.setXYZ(k, cx + x, cy + y, terrainZ(cx + x, cy + y) + 0.06)
    }
    pos.needsUpdate = true
    // Bruchkanten-Modus: Ring wird grün, sobald eine Kante im Griff ist
    const fang = modus.value === 'kante' ? naechsteKante(cx, cy) : null
    ring.material.color.set(
      modus.value !== 'kante' ? 0xffc832 : (fang ? 0x2fd06e : 0x8a8a8a))
    cursorGrp.visible = true
  }

  // ---- Bruchkanten (spec.terrain.kanten) --------------------------------

  function kanten() {
    return store.spec?.terrain?.kanten ?? []
  }

  // Fußpunkt auf einer Polylinie: Abstand + interpolierte Kanten-Höhe
  function fussAufKante(kante, x, y) {
    let best = null
    const p = kante.polyline
    for (let s = 0; s < p.length - 1; s++) {
      const [ax, ay, az] = p[s]
      const [bx, by, bz] = p[s + 1]
      const dx = bx - ax; const dy = by - ay
      const l2 = dx * dx + dy * dy
      const u = l2 > 0
        ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
      const fx = ax + u * dx; const fy = ay + u * dy
      const d = Math.hypot(x - fx, y - fy)
      if (!best || d < best.d) best = { d, z: az + u * (bz - az) }
    }
    return best
  }

  function naechsteKante(x, y) {
    let best = null
    for (const k of kanten()) {
      const f = fussAufKante(k, x, y)
      if (f && f.d <= radius.value && (!best || f.d < best.d)) {
        best = { kante: k, ...f }
      }
    }
    return best
  }

  // ---- Pinsel anwenden ---------------------------------------------------

  function gewicht(d, r) {
    if (d >= r) return 0
    const c = Math.cos((d / r) * Math.PI / 2)
    return c * c
  }

  function anwenden(cx, cy) {
    const g = gitter()
    const m = mesh()
    if (!g || !m || !strich) return
    const { t, nx, ny, res } = g
    const r = radius.value
    const i0 = Math.max(0, Math.floor((cx - r - t.x0) / res))
    const i1 = Math.min(nx - 1, Math.ceil((cx + r - t.x0) / res))
    const j0 = Math.max(0, Math.floor((cy - r - t.y0) / res))
    const j1 = Math.min(ny - 1, Math.ceil((cy + r - t.y0) / res))
    if (i1 < i0 || j1 < j0) return
    const pos = m.geometry.attributes.position
    const z = t.z
    const schritt = 0.12 * staerke.value      // m je Tick bei vollem Gewicht
    const fangKante = modus.value === 'kante' ? naechsteKante(cx, cy) : null
    if (modus.value === 'kante' && !fangKante) return
    let geaendert = false
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = t.x0 + i * res
        const y = t.y0 + j * res
        const dxa = Math.abs(x - cx); const dya = Math.abs(y - cy)
        const d = form.value === 'quadrat' ? Math.max(dxa, dya)
          : Math.hypot(dxa, dya)
        const w = gewicht(d, r)
        if (w <= 0) continue
        const k = j * nx + i
        let dz = 0
        if (modus.value === 'heben') dz = schritt * w
        else if (modus.value === 'senken') dz = -schritt * w
        else if (modus.value === 'glaetten') {
          // zum Mittel der Nachbarn ziehen — klassisches Relaxieren
          const il = Math.max(0, i - 1); const ir = Math.min(nx - 1, i + 1)
          const ju = Math.max(0, j - 1); const jo = Math.min(ny - 1, j + 1)
          const mittel = (z[j * nx + il] + z[j * nx + ir]
            + z[ju * nx + i] + z[jo * nx + i]) / 4
          dz = (mittel - z[k]) * 0.45 * staerke.value * w
        } else if (modus.value === 'kante') {
          // Das Gelände wird im Pinselbereich AUF die Kantenhöhe GESETZT
          // (Abstand zur LINIE, nicht zum Cursor — so entsteht ein
          // sauberes Band). Nur am Rand des Bandes federt ein Übergang.
          // Vorher stand hier eine gedämpfte Relaxation (·0,5·Stärke·cos²),
          // deren Gewicht zum Rand auf 0 fiel — die Zellen erreichten die
          // Kantenhöhe nie, es sah aus wie „Absenken um die Kante".
          // Setzen ist idempotent: der zweite Tick derselben Stelle ändert
          // nichts mehr, strich.dz und Undo bleiben damit exakt.
          const f = fussAufKante(fangKante.kante, x, y)
          if (!f || f.d >= r) continue
          const kern = r * 0.7
          const wl = f.d <= kern ? 1 : gewicht(f.d - kern, r - kern)
          dz = (f.z - z[k]) * wl
        }
        if (dz === 0) continue
        z[k] += dz
        strich.dz[k] += dz
        if (!strich.solid) pos.setZ(k, z[k])
        geaendert = true
        if (i < strich.bbox[0]) strich.bbox[0] = i
        if (j < strich.bbox[1]) strich.bbox[1] = j
        if (i > strich.bbox[2]) strich.bbox[2] = i
        if (j > strich.bbox[3]) strich.bbox[3] = j
      }
    }
    if (geaendert) {
      if (strich.solid) {
        // Deckfläche des Erdkörpers ans aktualisierte Gitter anlegen
        hautNachziehen(m, t.x0 + i0 * res, t.y0 + j0 * res,
          t.x0 + i1 * res, t.y0 + j1 * res)
      } else {
        pos.needsUpdate = true
      }
      m.geometry.computeVertexNormals()
    }
  }

  // ---- Patches (Gitterindizes + dz-Teilfeld) ----------------------------

  function strichZuPatch(s) {
    const g = gitter()
    if (!g) return null
    const [i0, j0, i1, j1] = s.bbox
    if (i1 < i0 || j1 < j0) return null
    const dz = []
    for (let j = j0; j <= j1; j++) {
      const zeile = new Array(i1 - i0 + 1)
      for (let i = i0; i <= i1; i++) {
        zeile[i - i0] = Math.round(s.dz[j * g.nx + i] * 10000) / 10000
      }
      dz.push(zeile)
    }
    return { i0, j0, dz }
  }

  function inversesPatch(p) {
    return { i0: p.i0, j0: p.j0,
      dz: p.dz.map((zeile) => zeile.map((v) => -v)) }
  }

  async function sende(patches) {
    await store.sculptPatches(patches)
    striche.value = stapel.length
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
    // Erdkörper: nur die Deckfläche ist formbar — Treffer auf Wand,
    // Sohle oder in der Bohrung würden das x/y sinnlos abbilden
    const oben = h.find((t) => (t.face?.normal?.z ?? 0) > 0.35)
    return oben ? oben.point : null
  }

  function strichStart(e) {
    if (e.button !== 0) return false
    const p = hit(e)
    if (!p) return false
    const g = gitter()
    if (!g) return false
    strich = { dz: new Float64Array(g.nx * g.ny),
      bbox: [g.nx, g.ny, -1, -1], solid: !!store.terrainSolid }
    if (strich.solid) bereiteHaut(mesh())
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

  async function strichEnde() {
    if (!strich) return
    const patch = strichZuPatch(strich)
    strich = null
    holeControls().enabled = true
    if (patch) {
      stapel.push(patch)
      await sende([patch])
    }
  }

  async function strichZurueck() {
    const p = stapel.pop()
    if (p) await sende([inversesPatch(p)])
  }

  // ---- Aktivierung -------------------------------------------------------

  function aktivieren() {
    if (!store.terrain) {
      melden('Kein Gelände im Fall — nichts zu formen.', 'warnung')
      return false
    }
    if (store.spec?.terrain?.base?.koerper) {
      melden('Das Gelände kommt als fertiger Volumenkörper (STL) — dort '
        + 'ist das Höhenraster nicht die Quelle, der Pinsel greift nicht.',
      'warnung')
      return false
    }
    baueCursor()
    const controls = holeControls()
    // Linke Maustaste gehört dem Pinsel; Kamera bleibt auf rechts/Mitte
    mouseLinksVorher = controls.mouseButtons.LEFT
    controls.mouseButtons.LEFT = null
    stapel.length = 0
    striche.value = 0
    return true
  }

  function deaktivieren() {
    raeumeCursor()
    strich = null
    const controls = holeControls()
    if (mouseLinksVorher !== null) {
      controls.mouseButtons.LEFT = mouseLinksVorher
      mouseLinksVorher = null
    }
    controls.enabled = true
  }

  return { modus, radius, staerke, form, striche,
    aktivieren, deaktivieren, strichStart, strichZieh, strichEnde,
    strichZurueck, laeuft: () => strich !== null }
}
