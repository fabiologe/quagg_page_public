// chainSegmentsToPolylines (Sprint T1): offene Ketten müssen erhalten bleiben
// — chainSegmentsToPolygons verwirft sie, was für Höhenlinien am DGM-Rand und
// Böschungskanten falsch wäre.

import { describe, expect, it } from 'vitest'
import { chainSegmentsToPolylines } from '../services/SectionContour'

const seg = (x1, z1, x2, z2, y1 = 0, y2 = 0) => ({ x1, z1, x2, z2, y1, y2 })

describe('chainSegmentsToPolylines', () => {
  it('verkettet eine offene Linie und behält sie (kein Ringzwang)', () => {
    const chains = chainSegmentsToPolylines([
      seg(0, 0, 1, 0), seg(1, 0, 2, 0), seg(2, 0, 3, 0),
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0]).toHaveLength(4)
    expect(chains[0][0]).toMatchObject({ x: 0, z: 0 })
    expect(chains[0][3]).toMatchObject({ x: 3, z: 0 })
  })

  it('bricht an T-Knoten (Grad 3) in drei Ketten', () => {
    const chains = chainSegmentsToPolylines([
      seg(0, 0, 1, 0), seg(1, 0, 2, 0), seg(1, 0, 1, 1),
    ])
    expect(chains).toHaveLength(3)
    for (const c of chains) expect(c).toHaveLength(2)
  })

  it('geschlossene Schleife → eine Kette mit erstem == letztem Punkt', () => {
    const chains = chainSegmentsToPolylines([
      seg(0, 0, 1, 0), seg(1, 0, 1, 1), seg(1, 1, 0, 1), seg(0, 1, 0, 0),
    ])
    expect(chains).toHaveLength(1)
    const c = chains[0]
    expect(c).toHaveLength(5)
    expect(c[0].x).toBeCloseTo(c[4].x)
    expect(c[0].z).toBeCloseTo(c[4].z)
  })

  it('trägt die y-Komponente durch', () => {
    const chains = chainSegmentsToPolylines([seg(0, 0, 1, 0, 5, 7)])
    expect(chains[0][0].y).toBe(5)
    expect(chains[0][1].y).toBe(7)
  })

  it('snapt kleine Tessellierungs-Lücken (≤ eps)', () => {
    const chains = chainSegmentsToPolylines([
      seg(0, 0, 1, 0), seg(1.002, 0, 2, 0),
    ], 0.005)
    expect(chains).toHaveLength(1)
    expect(chains[0]).toHaveLength(3)
  })

  it('zwei getrennte Linien bleiben getrennt', () => {
    const chains = chainSegmentsToPolylines([
      seg(0, 0, 1, 0), seg(10, 10, 11, 10),
    ])
    expect(chains).toHaveLength(2)
  })
})
