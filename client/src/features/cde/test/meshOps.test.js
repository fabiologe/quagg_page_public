// MeshOps (Sprint G): Volumen-Wahrheit, Geschlossenheit, PCA, Skelett, Profil.

import { describe, expect, it } from 'vitest'
import {
  meshVolume, principalDirection, skeletonAxis,
  profileAtStation, meshAreas, simplifyPolyline3d,
} from '../services/geometry/MeshOps'
import { toPositions, box, boxWithHole, tube, erdkoerper, profileArea } from './fixtures/solidFixtures'

describe('meshVolume', () => {
  it('Quader: exaktes Volumen + geschlossen', () => {
    const tris = box(2, 3, 4)
    const { volume, closed, warnings } = meshVolume(toPositions(tris), tris.length)
    expect(volume).toBeCloseTo(24, 10)
    expect(closed).toBe(true)
    expect(warnings).toHaveLength(0)
  })

  it('verdrehte Gesamt-Orientierung → |V| bleibt korrekt', () => {
    const tris = box(2, 3, 4).map(([a, b, c]) => [a, c, b]) // alle gespiegelt
    const { volume, closed } = meshVolume(toPositions(tris), tris.length)
    expect(volume).toBeCloseTo(24, 10)
    expect(closed).toBe(true) // konsistent, nur andersherum
  })

  it('Loch → closed:false, Randkanten gezählt, Warnung', () => {
    const tris = boxWithHole()
    const { closed, boundaryEdgeCount, warnings } = meshVolume(toPositions(tris), tris.length)
    expect(closed).toBe(false)
    expect(boundaryEdgeCount).toBe(3)
    expect(warnings.some(w => w.includes('mesh_offen'))).toBe(true)
  })

  it('Erdkörper: Volumen = Profilfläche × Tiefe', () => {
    const profile = [[0, 0], [30, 0], [30, 1], [15, 1], [10, 5], [0, 5]]
    const tris = erdkoerper(10)
    const { volume, closed } = meshVolume(toPositions(tris), tris.length)
    expect(closed).toBe(true)
    expect(volume).toBeCloseTo(profileArea(profile) * 10, 6)
  })
})

describe('principalDirection', () => {
  it('findet die Rohrachse — auch schräg im Raum', () => {
    const { tris, axisDir } = tube(0.1, 0.125, 10, 24, [1, 0.3, -0.5])
    const { dir } = principalDirection(toPositions(tris), tris.length)
    const dot = Math.abs(dir[0] * axisDir[0] + dir[1] * axisDir[1] + dir[2] * axisDir[2])
    expect(dot).toBeGreaterThan(0.999)
  })

  it('Kugel-artige Körper → Warnung + BBox-Fallback', () => {
    const tris = box(2, 2, 2) // isotrop
    const { warnings } = principalDirection(toPositions(tris), tris.length)
    expect(warnings).toContain('hauptrichtung_uneindeutig')
  })
})

describe('skeletonAxis', () => {
  it('Rohr-Skelett liegt auf der Mittellinie (Abweichung < r/10)', () => {
    const { tris, axisDir } = tube(0.1, 0.125, 10, 24, [1, 0.05, 0.2])
    const skel = skeletonAxis(toPositions(tris), tris.length)
    expect(skel.polyline.length).toBeGreaterThanOrEqual(2)
    // Abstand jedes Skelett-Punkts zur wahren Achse (Gerade durch 0 mit dir)
    for (const p of skel.polyline) {
      const t = p.x * axisDir[0] + p.y * axisDir[1] + p.z * axisDir[2]
      const dx = p.x - t * axisDir[0], dy = p.y - t * axisDir[1], dz = p.z - t * axisDir[2]
      expect(Math.hypot(dx, dy, dz)).toBeLessThan(0.0125)
    }
  })

  it('Skelett-Länge entspricht der Rohrlänge (±5 %)', () => {
    const { tris } = tube(0.1, 0.125, 10, 24)
    const skel = skeletonAxis(toPositions(tris), tris.length)
    let len = 0
    for (let i = 0; i + 1 < skel.polyline.length; i++) {
      const a = skel.polyline[i], b = skel.polyline[i + 1]
      len += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    }
    expect(len).toBeGreaterThan(9)
    expect(len).toBeLessThanOrEqual(10)
  })
})

describe('profileAtStation', () => {
  it('DN aus dem inneren Ring, auf Normreihe gerundet', () => {
    const { tris } = tube(0.1, 0.125, 10, 32)
    const positions = toPositions(tris)
    const axis = skeletonAxis(positions, tris.length).polyline
    const prof = profileAtStation(positions, tris.length, axis, 5)
    expect(prof.rings.length).toBeGreaterThanOrEqual(2)
    expect(prof.dnEstimate_mm).toBe(200) // 2·r_innen = 0,2 m
  })
})

describe('meshAreas', () => {
  it('Quader: Grundfläche und Höhen stimmen', () => {
    const tris = box(2, 3, 4) // Grundriss 2×3 in xy... Profil xy, Extrusion z
    const a = meshAreas(toPositions(tris), tris.length)
    // Profil liegt in xy, „oben" (y) ist hier die Profil-b-Richtung: OK=3
    expect(a.hoehe_ok).toBeCloseTo(3)
    expect(a.hoehe_uk).toBeCloseTo(0)
    expect(a.flaeche_grund).toBeCloseTo(2 * 4) // aufwärts gerichtete Deckfläche (y=3)
  })
})

describe('simplifyPolyline3d', () => {
  it('kollabiert kollineare Punkte, behält Knicke', () => {
    const pts = [
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 2, y: 5, z: 0 },
    ]
    const out = simplifyPolyline3d(pts, 0.01)
    expect(out).toHaveLength(3)
    expect(out[1]).toMatchObject({ x: 2, y: 0, z: 0 })
  })
})
