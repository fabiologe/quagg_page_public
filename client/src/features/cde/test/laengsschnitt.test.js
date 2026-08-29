// Längsschnitt-Kern (Sprint T2): Strang-Kettung über Schacht-Lücken,
// Fließrichtungs-Orientierung, Stationierung, Schacht-Projektion,
// Gelände-Sampler.

import { describe, expect, it } from 'vitest'
import {
  buildStrang, pointAt, sohleAt, sampleTerrainProfile,
  projectManholes, buildLaengsschnitt,
} from '../services/Laengsschnitt'
import { makeHeightSampler } from '../services/TerrainMesh'

// Zwei Haltungen entlang x, 1 m Schacht-Lücke, Sohle fällt 100 → 99,85 → 99,70
const PIPE_1 = { expressId: 1, category: 'IFCPIPESEGMENT',
  polyline: [{ x: 0, y: 100, z: 0 }, { x: 30, y: 99.85, z: 0 }] }
const PIPE_2 = { expressId: 2, category: 'IFCPIPESEGMENT',
  polyline: [{ x: 31, y: 99.85, z: 0 }, { x: 61, y: 99.70, z: 0 }] }

describe('buildStrang', () => {
  it('verkettet Haltungen über die Schacht-Lücke und stationiert kumulativ', () => {
    const strang = buildStrang([PIPE_1, PIPE_2])
    expect(strang.pipes).toHaveLength(2)
    expect(strang.length).toBeCloseTo(61, 1) // 30 + 1 Lücke + 30
    expect(strang.pipes[0].s0).toBeCloseTo(0)
    expect(strang.pipes[1].s0).toBeCloseTo(31, 1)
  })

  it('orientiert den Strang in Fließrichtung (fallende Sohle)', () => {
    // Haltungen absichtlich verkehrt herum übergeben
    const flipped = {
      ...PIPE_1,
      polyline: [...PIPE_1.polyline].reverse(),
    }
    const strang = buildStrang([PIPE_2, flipped])
    expect(strang.points[0].y).toBeCloseTo(100)
    expect(strang.points[strang.points.length - 1].y).toBeCloseTo(99.7)
  })

  it('bei mehreren Strängen gewinnt der längste', () => {
    const abseits = { expressId: 9, category: 'IFCPIPESEGMENT',
      polyline: [{ x: 500, y: 50, z: 500 }, { x: 505, y: 49.9, z: 500 }] }
    const strang = buildStrang([PIPE_1, PIPE_2, abseits])
    expect(strang.length).toBeCloseTo(61, 1)
  })

  it('leere Eingabe → null', () => {
    expect(buildStrang([])).toBeNull()
  })
})

describe('pointAt / sohleAt', () => {
  const strang = buildStrang([PIPE_1, PIPE_2])

  it('interpoliert Lage und Richtung an der Station', () => {
    const p = pointAt(strang, 15)
    expect(p.x).toBeCloseTo(15, 1)
    expect(p.dirX).toBeCloseTo(1, 3)
    expect(p.dirZ).toBeCloseTo(0, 3)
  })

  it('interpoliert die Sohlhöhe linear', () => {
    expect(sohleAt(strang, 0)).toBeCloseTo(100)
    expect(sohleAt(strang, 15)).toBeCloseTo(99.925, 3)
    expect(sohleAt(strang, strang.length)).toBeCloseTo(99.7)
  })
})

describe('projectManholes', () => {
  const strang = buildStrang([PIPE_1, PIPE_2])

  it('projiziert Schächte auf die nächste Station', () => {
    const mhs = projectManholes(strang, [
      { x: 30.5, z: 0.4, name: 'S2', deckel: 102, sohle: 99.8 },
      { x: 0, z: -0.2, name: 'S1', deckel: 102.4, sohle: 100 },
    ])
    expect(mhs.map(m => m.name)).toEqual(['S1', 'S2']) // nach Station sortiert
    expect(mhs[1].s).toBeCloseTo(30.5, 1)
  })

  it('verwirft Schächte abseits der Achse (maxDist)', () => {
    const mhs = projectManholes(strang, [{ x: 15, z: 50, name: 'weit', deckel: 0, sohle: 0 }])
    expect(mhs).toHaveLength(0)
  })
})

describe('Gelände entlang des Strangs', () => {
  // Geneigte Gelände-Platte über dem Strang: y = 102 + 0.01·x
  const tris = (() => {
    const A = [-5, 101.95, -10], B = [-5, 101.95, 10], C = [70, 102.7, 10], D = [70, 102.7, -10]
    const out = new Float64Array(2 * 9)
    out.set([...A, ...B, ...C], 0)
    out.set([...A, ...C, ...D], 9)
    return out
  })()

  it('makeHeightSampler interpoliert die Plattenhöhe, außerhalb null', () => {
    const sampler = makeHeightSampler(tris, 2)
    expect(sampler.sample(-5, 0)).toBeCloseTo(101.95, 2)
    expect(sampler.sample(32.5, 0)).toBeCloseTo(102.325, 2)
    expect(sampler.sample(1000, 1000)).toBeNull()
  })

  it('sampleTerrainProfile liefert das Profil über dem Strang', () => {
    const strang = buildStrang([PIPE_1, PIPE_2])
    const sampler = makeHeightSampler(tris, 2)
    const profile = sampleTerrainProfile(strang, sampler, 10)
    expect(profile.length).toBeGreaterThan(4)
    // Gelände liegt überall über der Sohle
    for (const q of profile) expect(q.y).toBeGreaterThan(sohleAt(strang, q.s))
  })

  it('buildLaengsschnitt fasst alles zusammen (yMin/yMax über Sohle+Gelände+Schächte)', () => {
    const sampler = makeHeightSampler(tris, 2)
    const data = buildLaengsschnitt({
      axisItems: [PIPE_1, PIPE_2],
      manholes: [{ x: 0, z: 0, name: 'S1', deckel: 102.4, sohle: 99.95 }],
      sampler,
    })
    expect(data.strang.pipes).toHaveLength(2)
    expect(data.manholes).toHaveLength(1)
    expect(data.yMin).toBeLessThanOrEqual(99.7)
    expect(data.yMax).toBeGreaterThanOrEqual(102.4)
  })
})
