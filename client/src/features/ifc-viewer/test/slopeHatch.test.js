// Sprint T1, Herzstück: Böschungsschraffur aus Gelände-Dreiecksnetzen.
// Fixture ist ein Pyramidenstumpf mit 45°-Böschungen — dafür sind Kanten,
// Regionszahl und Strichlängen von Hand nachrechenbar.

import { describe, expect, it } from 'vitest'
import { computeSlopeHatch } from '../services/SlopeHatch'

// ── Fixture-Builder ─────────────────────────────────────────────────────────

/** Dreiecke als flaches Float64Array (9 Werte je Dreieck). */
function toPositions(tris) {
  const out = new Float64Array(tris.length * 9)
  tris.forEach((t, i) => out.set(t.flat(), i * 9))
  return out
}

/**
 * Pyramidenstumpf: Basisquadrat 2·baseHalf, Deckquadrat 2·topHalf, Höhe h.
 * 8 Böschungsdreiecke + 2 Deckdreiecke. baseHalf−topHalf = h → 45°.
 */
function frustum(baseHalf = 10, topHalf = 5, h = 5, ox = 0, oz = 0) {
  const B = (sx, sz) => [ox + sx * baseHalf, 0, oz + sz * baseHalf]
  const T = (sx, sz) => [ox + sx * topHalf, h, oz + sz * topHalf]
  const tris = []
  const sides = [
    [B(-1, 1), B(1, 1), T(1, 1), T(-1, 1)],     // Nord (z+)
    [B(1, 1), B(1, -1), T(1, -1), T(1, 1)],     // Ost
    [B(1, -1), B(-1, -1), T(-1, -1), T(1, -1)], // Süd
    [B(-1, -1), B(-1, 1), T(-1, 1), T(-1, -1)], // West
  ]
  for (const [b1, b2, t2, t1] of sides) {
    tris.push([b1, b2, t2], [b1, t2, t1])
  }
  tris.push([T(-1, 1), T(1, 1), T(1, -1)], [T(-1, 1), T(1, -1), T(-1, -1)]) // Deck
  return tris
}

/** Quad-Streifen über z∈[0,10]: von (x0,y0) nach (x1,y1). */
function strip(x0, y0, x1, y1) {
  const A = [x0, y0, 0], B = [x0, y0, 10], C = [x1, y1, 10], D = [x1, y1, 0]
  return [[A, B, C], [A, C, D]]
}

function sumLength(segs) {
  return segs.reduce((s, x) => s + Math.hypot(x.x2 - x.x1, x.z2 - x.z1), 0)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('computeSlopeHatch', () => {
  const OPTS = { minSlopeDeg: 20, tickSpacingWorld: 1, minRegionArea: 0.5 }

  it('Pyramidenstumpf: 1 Region, Oberkante 40 m, Unterkante 80 m', () => {
    const tris = frustum()
    const { segments, stats } = computeSlopeHatch(toPositions(tris), tris.length, OPTS)
    expect(stats.regions).toBe(1)
    expect(stats.steepTris).toBe(8)
    const top = segments.filter(s => s.kind === 'oberkante')
    const bottom = segments.filter(s => s.kind === 'unterkante')
    expect(sumLength(top)).toBeCloseTo(40, 1)
    expect(sumLength(bottom)).toBeCloseTo(80, 1)
  })

  it('Striche: 40 Stück, strikt alternierend voll (≈5 m) / halb (≈2,5 m)', () => {
    const tris = frustum()
    const { segments, stats } = computeSlopeHatch(toPositions(tris), tris.length, OPTS)
    const ticks = segments.filter(s => s.kind === 'tick' || s.kind === 'tickHalf')
    expect(stats.ticks).toBe(40)
    expect(ticks.filter(t => t.kind === 'tick')).toHaveLength(20)
    expect(ticks.filter(t => t.kind === 'tickHalf')).toHaveLength(20)
    for (const t of ticks) {
      const len = Math.hypot(t.x2 - t.x1, t.z2 - t.z1)
      expect(len).toBeCloseTo(t.kind === 'tick' ? 5 : 2.5, 1)
    }
  })

  it('Striche zeigen hangabwärts (vom Deck weg nach außen)', () => {
    const tris = frustum()
    const { segments } = computeSlopeHatch(toPositions(tris), tris.length, OPTS)
    for (const t of segments.filter(s => s.kind === 'tick')) {
      // Startpunkt liegt auf dem Deckrand (|x| oder |z| ≈ 5); Endpunkt weiter außen
      const rStart = Math.max(Math.abs(t.x1), Math.abs(t.z1))
      const rEnd = Math.max(Math.abs(t.x2), Math.abs(t.z2))
      expect(rEnd).toBeGreaterThan(rStart)
    }
  })

  it('flache Platte → keine Segmente', () => {
    const tris = strip(0, 0, 10, 0.2) // 1,15° Neigung
    const { segments, stats } = computeSlopeHatch(toPositions(tris), tris.length, OPTS)
    expect(segments).toHaveLength(0)
    expect(stats.regions).toBe(0)
  })

  it('zwei getrennte Stümpfe → zwei Regionen', () => {
    const tris = [...frustum(10, 5, 5, 0, 0), ...frustum(10, 5, 5, 100, 0)]
    const { stats } = computeSlopeHatch(toPositions(tris), tris.length, OPTS)
    expect(stats.regions).toBe(2)
  })

  it('Terrassen (Böschung–Berme–Böschung) → zwei Bänder mit eigenen Kanten', () => {
    const tris = [
      ...strip(0, 0, 5, 5),    // Band 1: 45°
      ...strip(5, 5, 10, 5),   // Berme: flach
      ...strip(10, 5, 15, 10), // Band 2: 45°
    ]
    const { segments, stats } = computeSlopeHatch(toPositions(tris), tris.length, OPTS)
    expect(stats.regions).toBe(2)
    // Jedes Band: Oberkante 10 m (z-Richtung) + Unterkante 10 m
    const top = segments.filter(s => s.kind === 'oberkante')
    expect(sumLength(top)).toBeCloseTo(20, 1)
    // Striche beider Bänder: horizontaler Weg je 5 m
    const full = segments.filter(s => s.kind === 'tick')
    for (const t of full) {
      expect(Math.hypot(t.x2 - t.x1, t.z2 - t.z1)).toBeCloseTo(5, 1)
    }
  })

  it('Mini-Regionen unterhalb minRegionArea werden verworfen', () => {
    const tris = strip(0, 0, 0.5, 0.5) // 45°, aber nur 0.5×10 m Grundriss... > 0.5 m²
    const { stats } = computeSlopeHatch(toPositions(tris), tris.length, { ...OPTS, minRegionArea: 20 })
    expect(stats.regions).toBe(0)
  })

  it('leere Eingabe → leeres Ergebnis', () => {
    const { segments, stats } = computeSlopeHatch(new Float64Array(0), 0, OPTS)
    expect(segments).toHaveLength(0)
    expect(stats).toEqual({ regions: 0, ticks: 0, steepTris: 0 })
  })
})
