// Bearbeitungen auf den Körper zeichnen (aus Editor3D.vue geschnitten):
// Bohrung, Öffnung und Abschneiden werden nicht getippt, sondern auf den
// Körper gezeigt — Vorschau folgt dem Cursor auf der Oberfläche, Mausrad
// ändert das Maß, Klick stanzt. Dazu das Wieder-Anfassen gesetzter
// Bearbeitungen: der Marker wird über die Oberfläche gezogen, geschrieben
// wird erst beim Loslassen. Szene/Renderer/Controls über Getter.
import * as THREE from 'three'

const _r2 = (v) => Number(v.toFixed(2))

// Ausrichtung der Vorschau: Normale der getroffenen Fläche
export function stanzQuat(normale) {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), normale.clone().normalize())
}

// Lage einer getroffenen Fläche (rein rechenbar): senkrecht ab |n_z| > 0,7,
// XY-Richtung normiert mit Fallback (0, 1) bei lotrechter Normale — genau
// die Werte, die eine Aussparung in der Spezifikation braucht.
export function flaechenLage(punkt, normale) {
  const senkrecht = Math.abs(normale.z) > 0.7
  const nxy = new THREE.Vector2(normale.x, normale.y)
  if (nxy.lengthSq() < 1e-9) nxy.set(0, 1)
  nxy.normalize()
  return { senkrecht,
    point: [_r2(punkt.x), _r2(punkt.y)],
    direction: [_r2(nxy.x), _r2(nxy.y)],
    z: _r2(punkt.z) }
}

// Bearbeitungs-Spezifikation eines Stanz-Klicks (rein rechenbar).
// Die Bohrrichtung kommt aus der Normalen der getroffenen Fläche —
// genau so bohrt man auch in echt.
export function baueStanzEdit({ art, punkt, normale, mass, nr }) {
  if (art === 'schnitt') {
    return { id: `schnitt_${nr}`, type: 'schnitt', achse: 'z',
      position: _r2(punkt.z), behalten: 'unter' }
  }
  const lage = flaechenLage(punkt, normale)
  const edit = { id: `${art}_${nr}`, type: 'aussparung',
    shape: art === 'bohrung' ? 'kreis' : 'rechteck',
    point: lage.point, direction: lage.direction,
    z: lage.z, vertikal: lage.senkrecht }
  if (art === 'bohrung') edit.diameter = _r2(mass.d)
  else { edit.width = _r2(mass.w); edit.height = _r2(mass.h) }
  return edit
}

// Bearbeitung an die neue Trefferstelle versetzen (Loslassen des Markers,
// rein rechenbar). `station` fällt weg — die Lage ist jetzt absolut.
export function versetzteBearbeitung(alt, punkt, normale) {
  const lage = flaechenLage(punkt, normale)
  const neu = { ...alt, point: lage.point, direction: lage.direction,
    z: lage.z, vertikal: lage.senkrecht }
  delete neu.station
  return neu
}

export function erzeugeStanz({ store, groups, holeScene, holeRenderer,
  holeControls, clearGroup, ray, pickEditMarker, buildMarkers, stanzMass,
  stanzInfo, coords }) {
  let stanzHit = null              // { punkt: Vector3, normale: Vector3 }
  // Gesetzte Bearbeitung wieder anfassen: geschrieben wird erst beim
  // Loslassen (ein Store-Schreiben je pointermove würde die Vorschau
  // lahmlegen).
  let editDrag = null              // { structId, idx, mesh }

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
    const hits = ray(e).intersectObjects([m], false)
    if (!hits.length) return null
    const h = hits[0]
    const n = h.face
      ? h.face.normal.clone().applyMatrix3(
        new THREE.Matrix3().getNormalMatrix(m.matrixWorld)).normalize()
      : new THREE.Vector3(0, 0, 1)
    return { punkt: h.point.clone(), normale: n }
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
      const q = stanzQuat(normale)
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
    holeScene().add(g)
  }

  // pointermove im Stanz-Modus: Vorschau nachführen, Rückgabe = getroffen?
  function stanzZeige(e) {
    const h = stanzPick(e)
    if (h) stanzHit = h
    updateStanzPreview()
    return !!h
  }

  // Klick stanzt: Bearbeitung anlegen und Platzierung beenden
  function stanzKlick(e) {
    stanzHit = stanzPick(e) ?? stanzHit
    updateStanzPreview()
    const p = store.platzierung
    if (!p || !stanzHit) return
    const nr = ((store.selectedObject?.edits?.length) ?? 0) + 1
    const edit = baueStanzEdit({ art: p.art, punkt: stanzHit.punkt,
      normale: stanzHit.normale, mass: stanzMass.value, nr })
    store.addEdit(p.id, edit)
    store.endPlatzierung()
  }

  // Platzierung gewechselt/beendet: Vorschau und Treffer verwerfen
  function reset() {
    stanzHit = null
    clearGroup('stanz')
    stanzInfo.value = ''
  }

  // --- Bearbeitungs-Marker ziehen -----------------------------------------

  function startEditDrag(e, marke) {
    // sichtbarer Ring liegt an derselben Stelle wie das Klickziel
    const sichtbar = (groups.markers?.children ?? []).find(
      (c) => c !== marke && c.userData?.editIdx == null
        && c.userData?.id === marke.userData.id
        && c.position.distanceTo(marke.position) < 1e-6)
    editDrag = { structId: marke.userData.id, idx: marke.userData.editIdx,
      mesh: marke, sichtbar, treffer: null }
    holeControls().enabled = false
    holeRenderer().domElement.style.cursor = 'grabbing'
    holeRenderer().domElement.setPointerCapture(e.pointerId)
  }

  function dragEditTo(e) {
    if (!editDrag) return
    const mesh = (groups.solids?.children ?? []).find(
      (c) => c.userData?.id === editDrag.structId)
    if (!mesh) return
    const hits = ray(e).intersectObjects([mesh], false)
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
    holeControls().enabled = true
    holeRenderer().domElement.style.cursor = 'default'
    if (!drag?.treffer) { buildMarkers(); return }
    const st = (store.spec?.structures ?? []).find((o) => o.id === drag.structId)
    const alt = st?.edits?.[drag.idx]
    if (!alt || alt.type !== 'aussparung') { buildMarkers(); return }
    const klon = JSON.parse(JSON.stringify(st))
    klon.edits[drag.idx] = versetzteBearbeitung(alt, drag.treffer.punkt,
      drag.treffer.normale)
    store.updateObject('structure', drag.structId, klon)
  }

  // Entf über einem Bearbeitungs-Marker löscht die Bearbeitung
  function deleteHoveredEdit(lastMove) {
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

  return { updateStanzPreview, stanzZeige, stanzKlick, reset,
    startEditDrag, dragEditTo, commitEditDrag, deleteHoveredEdit,
    editZugAktiv: () => editDrag !== null }
}
