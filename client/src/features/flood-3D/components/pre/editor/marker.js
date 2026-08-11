// Marker-Ebene des Editors (aus Editor3D.vue geschnitten): Gebietsquader,
// Verfeinerungsboxen, Vermessungskanten, Pegel, Querschnitte,
// Bearbeitungs-Marker und Randflächen samt Fensterformen. Die Randflächen
// und Fenster kommen AUFGELÖST vom Server (store.aufgeloest) — hier wird
// nur noch gezeichnet.
import * as THREE from 'three'

export function erzeugeMarker({ store, groups, selectable, holeScene,
  clearGroup, terrainZ }) {
// Eigene Einträge in `selectable` beim Neuaufbau wieder AUSTRAGEN: die
// Marker-Ebene wird auch für sich allein neu gebaut (Spec-Watcher) — ohne
// Austragen sammelten sich verwaiste Meshes an alten Positionen an, die
// der Raycaster weiter traf („Phantom-Picks").
function merken(mesh) {
  mesh.userData.ebene = 'marker'
  selectable.push(mesh)
}

function buildMarkers() {
  clearGroup('markers')
  for (let i = selectable.length - 1; i >= 0; i--) {
    if (selectable[i].userData?.ebene === 'marker') selectable.splice(i, 1)
  }
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
      merken(kante)
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
    merken(pick)
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
        merken(ziel)
      }
    }
    // Kein Füllband zwischen Ober- und Unterkante mehr: Stützpunkt i der
    // einen Linie gehört nicht zwangsläufig zu Stützpunkt i der anderen
    // (unterschiedliche Punktzahl, gegenläufige Richtung aus dem DXF), das
    // Band verhedderte sich zu einer sinnlosen gelben Fläche. Die Böschung
    // ist ohnehin im Geländeraster zu sehen — die Kanten reichen als Marke.
  }

  // Vermessungskanten (spec.terrain.kanten): mit ihrer Höhe gezeichnet —
  // der Formen-Pinsel „Bruchkante" zieht das Gelände an GENAU diese Linien
  // heran, also müssen sie sichtbar und greifbar sein (seit dem Ende des
  // Zeichnen-Werkzeugs entstehen sie auch über die Objektbaum-Vorlage).
  for (const k of spec.terrain?.kanten ?? []) {
    const pts = k.polyline ?? []
    if (pts.length < 2) continue
    const v = pts.map((q) => new THREE.Vector3(q[0], q[1], q[2] ?? 0))
    const linie = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(v),
      new THREE.LineBasicMaterial({ color: 0xffa94d }))
    linie.userData = { kind: 'kante', id: k.id }
    groups.markers.add(linie)
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
      ziel.userData = { kind: 'kante', id: k.id }
      groups.markers.add(ziel)
      merken(ziel)
    }
  }

  // Pegelpunkte
  for (const g of spec.evaluation?.gauges ?? []) {
    const z = terrainZ(g.point[0], g.point[1])
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12),
      new THREE.MeshPhongMaterial({ color: 0xd55181 }))
    m.position.set(g.point[0], g.point[1], z + 0.4)
    m.userData = { kind: 'gauge', id: g.id }
    groups.markers.add(m)
    merken(m)
    const stab = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xd55181 }))
    stab.rotation.x = Math.PI / 2
    stab.position.set(g.point[0], g.point[1], z - 0.2)
    groups.markers.add(stab)
  }

  // Querschnittslinien — mit unsichtbaren Zylinder-Klickzielen je Segment
  // (die dünne Linie selbst war fürs Anklicken nie in `selectable`, obwohl
  // Griffe und Verschieben voll unterstützt sind; Audit U5)
  for (const sec of spec.evaluation?.sections ?? []) {
    const pts = sec.polyline.map(([x, y]) =>
      new THREE.Vector3(x, y, terrainZ(x, y) + 0.6))
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x199e70, linewidth: 2 }))
    line.userData = { kind: 'section', id: sec.id }
    groups.markers.add(line)
    for (let i = 1; i < pts.length; i++) {
      const mitte = pts[i - 1].clone().lerp(pts[i], 0.5)
      const laenge = pts[i - 1].distanceTo(pts[i])
      if (laenge < 1e-6) continue
      const ziel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, laenge, 6),
        new THREE.MeshBasicMaterial({ visible: false }))
      ziel.position.copy(mitte)
      ziel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
        pts[i].clone().sub(pts[i - 1]).normalize())
      ziel.userData = { kind: 'section', id: sec.id }
      groups.markers.add(ziel)
      merken(ziel)
    }
  }

  // Vorfüllungen (Anfangszustand): transparente Wasserebene auf z = level,
  // im Polygon. Vorher war der Startwasserstand in der Szene UNSICHTBAR —
  // Höhe und Lage standen nur als Zahlen im Panel.
  for (const v of spec.solver?.vorfuellungen ?? []) {
    if (!Array.isArray(v.polygon) || v.polygon.length < 3) continue
    const shape = new THREE.Shape()
    v.polygon.forEach(([x, y], k) => (k ? shape.lineTo(x, y)
      : shape.moveTo(x, y)))
    shape.closePath()
    const wasser = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0x2f7fd0, transparent: true,
        opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }))
    wasser.position.z = v.level ?? 0
    wasser.renderOrder = 2
    wasser.userData = { kind: 'vorfuellung', id: v.id }
    groups.markers.add(wasser)
    merken(wasser)
    const rand = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        v.polygon.map(([x, y]) => new THREE.Vector3(x, y, 0))),
      new THREE.LineBasicMaterial({ color: 0x7fc4ff, transparent: true,
        opacity: 0.9 }))
    rand.position.z = v.level ?? 0
    groups.markers.add(rand)
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
        merken(marke)
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
        merken(ziel)
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
        merken(plane)
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
        merken(mesh)
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

  holeScene().add(groups.markers)
}


  return { buildMarkers }
}
