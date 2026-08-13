// Verschieben (aus Editor3D.vue geschnitten): ganzes Objekt per
// Shift/Strg+Ziehen und das Umziehen einer Randbedingung an eine andere
// Gebietsseite. Der Randmarker gleitet am UMFANG des Gebiets entlang:
// nächstgelegene Seite unterm Cursor + Lage entlang der Kante; beim
// Loslassen wird face umgesetzt und das Fenster (span/center) an die neue
// Lage geschoben — der Server löst die Flächen wie immer selbst auf
// (bc_faces). Szene/Renderer/Controls über Getter.
import * as THREE from 'three'

const _r2 = (v) => Number(v.toFixed(2))

// Fensterbreite einer Randbedingung entlang einer Seite (rein rechenbar)
export function bcBreite(b, seite) {
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

// Nächstgelegene Gebietsseite zu einem Punkt der Zieh-Ebene (rein
// rechenbar); t ist die Lage entlang der Kante, an die Enden geklemmt.
export function naechsteSeite(extent, p) {
  const [x0, y0, x1, y1] = extent
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

// Fensterlage entlang der Seite: mittig unterm Cursor, an den Enden
// geklemmt; ein Fenster in voller Breite beginnt am Anfang (rein rechenbar)
export function bcFensterLage(seite, w) {
  return w >= seite.hi - seite.lo ? seite.lo
    : Math.max(seite.lo, Math.min(seite.hi - w, seite.t - w / 2))
}

// Vorschaurahmen: Fensterbreite × volle Gebietshöhe auf der Zielseite
export function bcRahmenPunkte(domain, face, lo, w) {
  const [x0, y0, x1, y1] = domain.extent
  const anKante = (t) => face === 'x_min' ? [x0, t]
    : face === 'x_max' ? [x1, t]
      : face === 'y_min' ? [t, y0] : [t, y1]
  const ecken = [[lo, domain.z_min], [lo + w, domain.z_min],
    [lo + w, domain.z_max], [lo, domain.z_max]]
  return ecken.map(([t, z]) => {
    const [x, y] = anKante(t)
    return new THREE.Vector3(x, y, z)
  })
}

export function erzeugeVerschieben({ store, groups, holeScene, holeRenderer,
  holeControls, planePick, zugriff, achsen, coords, endDrag }) {
  const { objectZable, translateObject } = zugriff
  const { showAxisGuides, highlightAxis, axisHint, fmtDelta, updateDragDelta,
    dragScreenInit, gestureSnap } = achsen

  let objectDrag = null          // Ganzes-Objekt-Verschieben: { start, mesh }
  let bcDrag = null              // { id, ziel, lo, w, obj }

  // --- ganzes Objekt verschieben (Shift/Strg+Ziehen) ------------------------

  function startObjectDrag(e, hitInfo) {
    // Drag-Ebene auf Höhe des Griffpunkts AM Objekt (kein Parallaxe-Sprung)
    const zGrab = hitInfo.point.z
    const pt = planePick(e, zGrab)
    if (!pt) return false
    objectDrag = { start: [pt.x, pt.y], z: zGrab,
      mesh: hitInfo.object, last: null, dz: 0,
      screen: dragScreenInit(e, pt.x, pt.y, zGrab) }
    showAxisGuides(pt.x, pt.y, zGrab)
    holeControls().enabled = false
    holeRenderer().domElement.style.cursor = 'grabbing'
    holeRenderer().domElement.setPointerCapture(e.pointerId)
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
      + ` (verschieben${axisHint()}${zNote})`
    updateDragDelta(e, dx, dy, dz, snap.lock)
  }

  function commitObjectDrag() {
    const drag = objectDrag
    objectDrag = null
    holeControls().enabled = true
    const movedXY = drag?.last && Math.hypot(drag.last[0], drag.last[1]) >= 0.05
    const movedZ = Math.abs(drag?.dz ?? 0) >= 0.05
    if (!movedXY && !movedZ) {
      // kaum bewegt: als Klick werten, Auswahl bleibt
      if (drag?.basePos) drag.mesh.position.copy(drag.basePos)
      if (groups.handles && drag?.handleBase) {
        groups.handles.position.copy(drag.handleBase)
      }
      endDrag()
      return
    }
    const sel = store.selection
    const clone = translateObject(sel.kind,
      JSON.parse(JSON.stringify(store.selectedObject)),
      drag.last?.[0] ?? 0, drag.last?.[1] ?? 0, drag.dz ?? 0)
    store.updateObject(sel.kind, sel.id, clone)
    endDrag()
  }

  // --- Randbedingung an eine andere Gebietsseite ziehen --------------------

  function seiteUnterCursor(e) {
    const d = store.spec?.domain
    if (!d) return null
    const p = planePick(e, (d.z_min + d.z_max) / 2) ?? planePick(e, d.z_min)
    if (!p) return null
    return naechsteSeite(d.extent, p)
  }

  function startBcDrag(e, id) {
    const b = (store.spec?.boundaries ?? []).find((x) => x.id === id)
    if (!b) return false
    bcDrag = { id }
    holeControls().enabled = false
    holeRenderer().domElement.style.cursor = 'grabbing'
    holeRenderer().domElement.setPointerCapture(e.pointerId)
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
    const lo = bcFensterLage(seite, w)
    bcDrag.ziel = seite
    bcDrag.lo = lo
    bcDrag.w = w
    const pts = bcRahmenPunkte(d, seite.face, lo, w)
    if (!bcDrag.obj) {
      bcDrag.obj = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xffc832, depthTest: false }))
      bcDrag.obj.renderOrder = 40
      holeScene().add(bcDrag.obj)
    } else {
      bcDrag.obj.geometry.setFromPoints(pts)
    }
  }

  async function commitBcDrag() {
    const drag = bcDrag
    bcDrag = null
    holeControls().enabled = true
    holeRenderer().domElement.style.cursor = 'default'
    if (drag?.obj) {
      holeScene().remove(drag.obj)
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

  return { startObjectDrag, dragObjectTo, commitObjectDrag,
    startBcDrag, dragBcTo, commitBcDrag,
    objektZugAktiv: () => objectDrag !== null,
    bcZugAktiv: () => bcDrag !== null }
}
