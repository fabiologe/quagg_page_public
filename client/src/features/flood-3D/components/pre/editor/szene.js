// Szenenaufbau des Editors (aus Editor3D.vue geschnitten): Gelände als
// Höhenfeld oder Erdkörper, Bauwerkskörper aus der Server-Vorschau,
// Solverblick. Szene über Getter — der Editor belegt sie erst beim Mount.
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

export function erzeugeSzene({ store, groups, selectable, holeScene,
  solverView, drahtgitter, solverHint }) {
const SOLID_COLORS = [0x3987e5, 0xd95926, 0x199e70, 0xc98500, 0xd55181,
  0x9085e9, 0xe66767]
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
  holeScene().remove(g)
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
  holeScene().add(groups.terrain)
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
  holeScene().add(groups.terrain)
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
  holeScene().add(groups.solids)
}


  return { terrainZ, clearGroup, buildTerrain, buildTerrainSolid,
    feinsteZelle, buildSolids }
}
