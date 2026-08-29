// Höhenlinien (Sprint T1): horizontale Schnitte durch das Gelände-Mesh,
// offene Ketten am Rand, Haupt-/Nebenlinien-Flag auf Höhen-Vielfachen.

import { describe, expect, it } from 'vitest'
import { computeContourLines } from '../services/ContourLines'

function toPositions(tris) {
  const out = new Float64Array(tris.length * 9)
  tris.forEach((t, i) => out.set(t.flat(), i * 9))
  return out
}

/** Schiefe Ebene 10×10 m: y = steigung·x, z ∈ [0,10]. */
function ramp(steigung = 0.1) {
  const A = [0, 0, 0], B = [0, 0, 10], C = [10, steigung * 10, 10], D = [10, steigung * 10, 0]
  return [[A, B, C], [A, C, D]]
}

/** Pyramidenstumpf (wie slopeHatch.test) — geschlossene Höhenlinien. */
function frustum(baseHalf = 10, topHalf = 5, h = 5) {
  const B = (sx, sz) => [sx * baseHalf, 0, sz * baseHalf]
  const T = (sx, sz) => [sx * topHalf, h, sz * topHalf]
  const tris = []
  const sides = [
    [B(-1, 1), B(1, 1), T(1, 1), T(-1, 1)],
    [B(1, 1), B(1, -1), T(1, -1), T(1, 1)],
    [B(1, -1), B(-1, -1), T(-1, -1), T(1, -1)],
    [B(-1, -1), B(-1, 1), T(-1, 1), T(-1, -1)],
  ]
  for (const [b1, b2, t2, t1] of sides) tris.push([b1, b2, t2], [b1, t2, t1])
  return tris
}

describe('computeContourLines', () => {
  it('schiefe Ebene (10 %): bekannte Linien an bekannten X-Positionen, offen', () => {
    const tris = ramp(0.1) // y von 0 bis 1 über x 0..10
    const levels = computeContourLines(toPositions(tris), tris.length, { interval: 0.25 })
    // Stufen 0.25, 0.5, 0.75 innerhalb (0 und 1.0 liegen exakt auf Rand-Vertices → kein Schnitt)
    expect(levels.map(l => l.level)).toEqual([0.25, 0.5, 0.75])
    for (const l of levels) {
      expect(l.polylines).toHaveLength(1)
      const chain = l.polylines[0]
      // Offene Linie quer über die Platte: konstantes x = level/0.1·1... x = y/steigung
      const expectedX = l.level / 0.1
      for (const p of chain) expect(p.x).toBeCloseTo(expectedX, 6)
      // offen: erster != letzter Punkt
      const first = chain[0], last = chain[chain.length - 1]
      expect(Math.hypot(first.z - last.z)).toBeGreaterThan(5)
      expect(p0Length(chain)).toBeCloseTo(10, 3)
    }
  })

  it('Pyramidenstumpf: geschlossene Quadrat-Ringe mit korrektem Umfang', () => {
    const tris = frustum() // Böschung 45°, y 0..5
    const levels = computeContourLines(toPositions(tris), tris.length, { interval: 1 })
    // Stufen 1..4 (0 und 5 auf Vertices)
    expect(levels.map(l => l.level)).toEqual([1, 2, 3, 4])
    for (const l of levels) {
      // Halbweite bei Höhe y: 10 - y (45°) → Umfang 8·(10-y)
      const totalLen = l.polylines.reduce((s, c) => s + p0Length(c), 0)
      expect(totalLen).toBeCloseTo(8 * (10 - l.level), 1)
      // geschlossen: erster == letzter
      const c = l.polylines[0]
      expect(c[0].x).toBeCloseTo(c[c.length - 1].x, 3)
      expect(c[0].z).toBeCloseTo(c[c.length - 1].z, 3)
    }
  })

  it('major-Flag sitzt auf Höhen-Vielfachen (nicht auf Reihenfolge)', () => {
    const tris = ramp(0.5) // y 0..5
    const levels = computeContourLines(toPositions(tris), tris.length, { interval: 0.5, majorEvery: 5 })
    const majors = levels.filter(l => l.major).map(l => l.level)
    // Vielfache von 5·0.5 = 2.5 m
    expect(majors).toEqual([2.5])
  })

  it('leere/flache Eingaben → leeres Ergebnis', () => {
    expect(computeContourLines(new Float64Array(0), 0, {})).toEqual([])
    const flat = [[[0, 1, 0], [10, 1, 0], [10, 1, 10]]]
    expect(computeContourLines(toPositions(flat), 1, { interval: 0.5 })).toEqual([])
  })
})

function p0Length(chain) {
  let s = 0
  for (let i = 0; i + 1 < chain.length; i++) {
    s += Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].z - chain[i].z)
  }
  return s
}
