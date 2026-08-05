// Stufe A: Testfundament. RDP-Vereinfachung ist reiner Geometrie-Code —
// Regressionen hier verzerren still jeden Vektor-Planexport.

import { describe, expect, it } from 'vitest'
import { simplifyRing, simplifyOutlines } from '../services/PolygonSimplify'

// Quadrat 1×1 mit einem kollinearen Zwischenpunkt auf der Unterkante
const squareWithMidpoint = [
  [0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1], [0, 0],
]

describe('simplifyRing', () => {
  it('entfernt kollineare Zwischenpunkte', () => {
    const out = simplifyRing(squareWithMidpoint, 0.01)
    expect(out).toEqual([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])
  })

  it('hält den Ring geschlossen (letzter == erster Punkt)', () => {
    const out = simplifyRing(squareWithMidpoint, 0.01)
    expect(out[0]).toEqual(out[out.length - 1])
  })

  it('behält Punkte, deren Abweichung über der Toleranz liegt', () => {
    // Zacke von 0.5 m auf der Unterkante — weit über epsilon
    const ring = [[0, 0], [0.5, 0.5], [1, 0], [1, 1], [0, 1], [0, 0]]
    const out = simplifyRing(ring, 0.02)
    expect(out).toContainEqual([0.5, 0.5])
  })

  it('gibt bei epsilon <= 0 oder zu kurzen Ringen das Original zurück', () => {
    expect(simplifyRing(squareWithMidpoint, 0)).toBe(squareWithMidpoint)
    const tiny = [[0, 0], [1, 0], [0, 0]]
    expect(simplifyRing(tiny, 0.01)).toBe(tiny)
  })
})

describe('simplifyOutlines', () => {
  it('arbeitet nicht-destruktiv auf Records', () => {
    const outlines = [{ category: 'IFCWALL', rings: [squareWithMidpoint] }]
    const out = simplifyOutlines(outlines, 0.01)
    expect(out[0].rings[0]).toHaveLength(5)
    expect(outlines[0].rings[0]).toHaveLength(6) // Original unangetastet
    expect(out[0].category).toBe('IFCWALL')
  })
})
