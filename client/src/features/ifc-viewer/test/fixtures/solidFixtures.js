/**
 * Synthetische Volumenkörper für die Sprint-G-Tests — geschlossene Meshes mit
 * KONSISTENTER Außen-Orientierung (jede Kante 1× vorwärts + 1× rückwärts).
 */

/** Dreiecks-Liste → flaches Float64Array (9 Werte je Dreieck). */
export function toPositions(tris) {
  const out = new Float64Array(tris.length * 9)
  tris.forEach((t, i) => out.set(t.flat(), i * 9))
  return out
}

/**
 * Extrusion eines 2D-Profils (xy, CCW) entlang z — geschlossener Körper:
 * Rückkappe (z=depth, +z), Frontkappe (z=0, −z, gespiegelt), Mantel-Quads.
 * Profil muss von profile[0] aus sternförmig sein (Fan-Triangulation).
 */
export function extrudeProfile(profile, depth) {
  const tris = []
  const P = (i, z) => [profile[i][0], profile[i][1], z]
  const n = profile.length

  // Kappen (Fan von Punkt 0)
  for (let i = 1; i + 1 < n; i++) {
    tris.push([P(0, depth), P(i, depth), P(i + 1, depth)]) // hinten, +z
    tris.push([P(0, 0), P(i + 1, 0), P(i, 0)])             // vorn, −z (gespiegelt)
  }
  // Mantel
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    tris.push([P(i, 0), P(j, 0), P(j, depth)])
    tris.push([P(i, 0), P(j, depth), P(i, depth)])
  }
  return tris
}

/** Shoelace-Fläche eines 2D-Profils (für Soll-Volumen = Fläche × Tiefe). */
export function profileArea(profile) {
  let a = 0
  for (let i = 0; i < profile.length; i++) {
    const [x1, y1] = profile[i]
    const [x2, y2] = profile[(i + 1) % profile.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a / 2)
}

/** Geschlossener Quader a×b×c (Ecke im Ursprung). */
export function box(a = 2, b = 3, c = 4) {
  return extrudeProfile([[0, 0], [a, 0], [a, b], [0, b]], c)
}

/** Quader mit Loch: ein Dreieck entfernt → 3 Randkanten. */
export function boxWithHole(a = 2, b = 3, c = 4) {
  return box(a, b, c).slice(0, -1)
}

/**
 * Erdkörper (Abnahme-Fixture): extrudierter Damm-Querschnitt mit ebener Krone
 * (y=5, x 0–10), steiler Böschung (x 10–15, ~38,7°) und Berme (y=1, x 15–30).
 * GESCHLOSSENER Körper — genau der Fall „IfcCivilElement als Volumenkörper".
 */
export function erdkoerper(depth = 10) {
  return extrudeProfile([[0, 0], [30, 0], [30, 1], [15, 1], [10, 5], [0, 5]], depth)
}

/**
 * Rohr (offene Wandflächen, keine Kappen): Außen- + Innenwand um eine
 * beliebige Achse — für Skelettierung und DN-aus-Profil.
 * @returns {{ tris, axisStart: [x,y,z], axisDir: [x,y,z] }}
 */
export function tube(rInner = 0.1, rOuter = 0.125, len = 10, seg = 24, dir = [1, 0.05, 0.2]) {
  const dlen = Math.hypot(...dir)
  const d = dir.map(v => v / dlen)
  // Orthonormale Basis senkrecht zur Achse
  let u = [d[2], 0, -d[0]]
  const ulen = Math.hypot(...u)
  u = ulen > 1e-6 ? u.map(v => v / ulen) : [1, 0, 0]
  const w = [
    d[1] * u[2] - d[2] * u[1],
    d[2] * u[0] - d[0] * u[2],
    d[0] * u[1] - d[1] * u[0],
  ]
  const ring = (t, r, k) => {
    const ang = (2 * Math.PI * k) / seg
    const cu = r * Math.cos(ang), cw = r * Math.sin(ang)
    return [
      t * d[0] + cu * u[0] + cw * w[0],
      t * d[1] + cu * u[1] + cw * w[1],
      t * d[2] + cu * u[2] + cw * w[2],
    ]
  }
  const tris = []
  const N = 8 // Längs-Segmente
  for (let s = 0; s < N; s++) {
    const t0 = (len * s) / N, t1 = (len * (s + 1)) / N
    for (let k = 0; k < seg; k++) {
      for (const r of [rOuter, rInner]) {
        const a = ring(t0, r, k), b = ring(t0, r, k + 1)
        const c = ring(t1, r, k + 1), e = ring(t1, r, k)
        tris.push([a, b, c], [a, c, e])
      }
    }
  }
  return { tris, axisStart: [0, 0, 0], axisDir: d }
}
