// Stützpunkthandles (Spez. 6.4, aus Editor3D.vue geschnitten): die im
// Grundriss ziehbaren Griff-Kugeln samt Umriss, „+"-Zwischenpunkten und
// Führungslinien — und die komplette Zieh-Logik (Fang, Gebiets-Klemme,
// Höhen-Zug, Ecke einfügen/löschen). Szene/Renderer/Controls über Getter,
// der Drehgriff und der fremde Zugstatus über späte Bindung (Zyklus
// handles ↔ rotGizmo).
import * as THREE from 'three'

const _r2 = (v) => Number(v.toFixed(2))

// Griffradius aus der Rasterauflösung (rein rechenbar)
export function griffRadius(resolution) {
  return Math.max((resolution ?? 0.5) * 0.7, 0.3)
}

// Umriss-Züge zwischen den Stützpunkten (rein rechenbar). `loops` trennt
// mehrere Ringe — beim Modellgebiet liegen Sohle und Deckel getrennt
// übereinander, ein durchgehender Zug ergäbe eine Diagonale quer durch.
export function umrissZuege(loops, closed, n) {
  if (loops) return loops.map((ring) => [...ring, ring[0]])
  if (n < 2) return []
  const idx = [...Array(n).keys()]
  return [closed ? [...idx, 0] : idx]
}

// Fang beim Griff-Zug (rein rechenbar): Stützpunkte ANDERER Objekte
// gewinnen vorm Zellraster; nur die tatsächlich bewegte Koordinate rastet
// (Führungslinien bleiben exakt).
export function fangePunkt(x, y, { lock, raster, snapPunkte }) {
  const g = raster ?? 0.5
  if (!lock) {
    let best = null
    let bd = g * 0.6
    for (const q of snapPunkte ?? []) {
      const d = Math.hypot(q[0] - x, q[1] - y)
      if (d < bd) { bd = d; best = q }
    }
    if (best) return { x: best[0], y: best[1], gefangen: true }
  }
  if (lock !== 'y') x = _r2(Math.round(x / g) * g)
  if (lock !== 'x') y = _r2(Math.round(y / g) * g)
  return { x, y, gefangen: false }
}

// Aus gezogenen Griffpositionen das vorläufige Gebiet ableiten (rein)
export function gebietAusPunkten(punkte) {
  if (punkte.length < 4) return null
  const xs = punkte.map((p) => p.x)
  const ys = punkte.map((p) => p.y)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export function erzeugeHandles({ store, groups, holeScene, holeRenderer,
  holeControls, terrainZ, clearGroup, planePick, pickHandle, zugriff,
  achsen, rotGizmo, imFremdenZug, koerperZuschnitt, endDrag, coords,
  zModus }) {
  const { handleAccess, collectSnapPoints, clampDomain, clampMarge } = zugriff
  const { showAxisGuides, highlightAxis, axisHint, fmtDelta, updateDragDelta,
    dragScreenInit, gestureSnap } = achsen

  let dragging = null            // { idx } während eines Handle-Drags

  function buildHandles() {
    // nie mitten im Zug neu bauen — sonst verlieren wir die gegriffenen Teile
    if (dragging || imFremdenZug()) return
    clearGroup('handles')
    const sel = store.selection
    const access = sel && handleAccess(sel.kind, store.selectedObject)
    if (!access) return
    groups.handles = new THREE.Group()
    const r = griffRadius(store.terrain?.resolution)
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

    // Verbindungslinien zwischen den Stützpunkten (Umriss)
    for (const zug of umrissZuege(access.loops, access.closed,
      positions.length)) {
      const outline = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(zug.map((i) => positions[i])),
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

    if (sel.kind === 'domain') rotGizmo().buildRotGizmo()

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
    holeScene().add(groups.handles)
  }

  // gemeinsamer Zug-Beginn: Controls sperren, Cursor, Zeiger einfangen
  function _greifen(e) {
    holeControls().enabled = false
    holeRenderer().domElement.style.cursor = 'grabbing'
    holeRenderer().domElement.setPointerCapture(e.pointerId)
  }

  // pointerdown über einem Griff oder Zwischenpunkt. Rückgabe true, wenn
  // der Klick hier verbraucht wurde (Zug gestartet oder Ecke eingefügt).
  function startHandleDrag(e) {
    let h = pickHandle(e)
    if (!h) return false
    if (h.userData.insertAfter != null) {
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
        _greifen(e)
      }
      return true
    }
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
    _greifen(e)
    return true
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
    // Fang: Alt = ganz frei, wie bei den Achsen
    let caught = ''
    if (!e.altKey && snap.lock !== 'z') {
      if (!snap.lock && !dragging.snapPts) {
        dragging.snapPts = collectSnapPoints()
      }
      const fang = fangePunkt(x, y, { lock: snap.lock,
        raster: store.spec?.mesh?.base_cell ?? 0.5,
        snapPunkte: dragging.snapPts })
      x = fang.x
      y = fang.y
      if (fang.gefangen) caught = ' · ⌖ Punktfang'
    }
    // Ans Modellgebiet klemmen: außerhalb liegende Punkte crashen den Solver
    // (Domain-Ecken dürfen das Gebiet natürlich vergrößern, Randfenster
    // klemmen selbst entlang ihrer Kante)
    if (!['domain', 'boundary'].includes(store.selection?.kind)) {
      ;[x, y] = clampDomain([x, y], clampMarge(store.selectedObject))
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
    if (store.selection?.kind === 'domain') koerperZuschnitt(gezogenesGebiet())
    const zNote = e.ctrlKey && !access?.writeZ ? ' · Z hier nicht möglich' : ''
    coords.value = (snap.lock === 'z'
      ? `Δz = ${fmtDelta(dz)}`
      : `x = ${x.toFixed(2)}  y = ${y.toFixed(2)}`)
      + ` (Stützpunkt ${dragging.idx + 1}${axisHint()}${zNote}${caught})`
    updateDragDelta(e, dx, dy, dz, snap.lock)
  }

  function commitHandleDrag() {
    const drag = dragging
    dragging = null
    holeControls().enabled = true
    if (!drag?.last && !drag?.dz) { endDrag(); return }
    const sel = store.selection
    const clone = JSON.parse(JSON.stringify(store.selectedObject))
    const access = handleAccess(sel.kind, clone)
    if (drag.last) access.write(clone, drag.idx, drag.last)
    if (drag.dz && access.writeZ) {
      if (zModus.value === 'kante' && access.zJePunkt) {
        // ganze Kante: der Höhenzug hebt ALLE Stützpunkte gemeinsam
        const anzahl = access.zPunkte ?? access.points.length
        for (let i = 0; i < anzahl; i++) access.writeZ(clone, i, drag.dz)
      } else {
        access.writeZ(clone, drag.idx, drag.dz)
      }
    }
    store.updateObject(sel.kind, sel.id, clone)
    endDrag()
  }

  // Aus den gezogenen Griffen das vorläufige Gebiet ableiten
  function gezogenesGebiet() {
    return gebietAusPunkten((groups.handles?.children ?? [])
      .filter((c) => c.userData.handleIdx != null)
      .map((c) => c.position))
  }

  // Entf: Eckknoten unter dem Cursor löschen (Minimalzahl bleibt gewahrt)
  function deleteHoveredCorner(lastMove) {
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

  return { buildHandles, startHandleDrag, dragHandleTo, commitHandleDrag,
    gezogenesGebiet, deleteHoveredCorner,
    zugAktiv: () => dragging !== null }
}
