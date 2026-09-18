// SurfaceOps (Sprint G): solid→surface — die Auflösung des
// Repräsentations-Mismatch. Abnahmetest: geschlossener Erdkörper-Volumenkörper
// (das IfcCivilElement-Beispiel) liefert nach der Ableitung Böschungsschraffur.

import { describe, expect, it } from 'vitest'
import { deriveSurface } from '../services/geometrie/SurfaceOps'
import { makeHeightSampler } from '../services/TerrainMesh'
import { computeSlopeHatch } from '../services/SlopeHatch'
import { computeContourLines } from '../services/ContourLines'
import { toPositions, box, erdkoerper } from './fixtures/solidFixtures'

describe('deriveSurface', () => {
  it('auto: geschlossener Solid → heightfield, offenes Mesh → upfaces', () => {
    const solid = box(10, 5, 10)
    const rs = deriveSurface(toPositions(solid), solid.length)
    expect(rs.method).toBe('heightfield')

    // offenes DGM (geneigte Platte, aufwärts orientiert)
    const dgm = [[[0, 0, 0], [10, 1, 10], [10, 1, 0]], [[0, 0, 0], [0, 0, 10], [10, 1, 10]]]
    const ro = deriveSurface(toPositions(dgm), dgm.length)
    expect(ro.method).toBe('upfaces')
    expect(ro.triCount).toBe(2) // Identität
  })

  it('die beiden Wege sind NICHT dasselbe — deshalb muss der Sampler den richtigen nehmen', () => {
    // Der Gelände-Sampler zog bis 2026-09-03 `filter: 'upward'` roh: jedes
    // nach oben zeigende Dreieck. Bei einem GESCHLOSSENEN Erdkörper sind das
    // aber nicht nur die Deckflächen. Erst `deriveSurface('auto')` erkennt die
    // Geschlossenheit und rastert eine echte Oberfläche.
    //
    // Der Test zählt beide Wege gegeneinander: solange sie verschiedene
    // Zahlen liefern, ist „der Sampler nimmt jetzt den Resolver" eine Aussage
    // mit Inhalt. Wären sie gleich, prüfte der Wächter im nächsten Kapitel
    // zwei identische Mengen — und wäre für immer grün.
    const solid = erdkoerper()
    const positions = toPositions(solid)
    const abgeleitet = deriveSurface(positions, solid.length, { cell: 1 })
    expect(abgeleitet.method).toBe('heightfield')

    // „upward" von Hand — genau das, was collectElementTriangles(filter:'upward') tut.
    let nachOben = 0
    for (let t = 0; t < solid.length; t++) {
      const o = t * 9
      const ax = positions[o], ay = positions[o + 1], az = positions[o + 2]
      const ux = positions[o + 3] - ax, uy = positions[o + 4] - ay, uz = positions[o + 5] - az
      const vx = positions[o + 6] - ax, vy = positions[o + 7] - ay, vz = positions[o + 8] - az
      const ny = uz * vx - ux * vz
      const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
      if (len > 0 && ny / len > 0.05) nachOben++
    }
    expect(nachOben).toBeGreaterThan(0)
    expect(abgeleitet.triCount).not.toBe(nachOben)
  })

  it('Quader-heightfield: Sampler liefert überall die Deckhöhe', () => {
    const solid = box(10, 5, 10) // Profil xy → „Höhe" ist y=5, Grundriss 10(x)×10(z)
    const rs = deriveSurface(toPositions(solid), solid.length, { cell: 1 })
    expect(rs.triCount).toBeGreaterThan(50)
    const sampler = makeHeightSampler(rs.positions, rs.triCount)
    for (const [x, z] of [[2, 2], [5, 5], [8, 3]]) {
      expect(sampler.sample(x, z)).toBeCloseTo(5, 6)
    }
    // kein Dreieck unterhalb der Deckfläche
    for (let i = 0; i < rs.triCount * 3; i++) {
      expect(rs.positions[i * 3 + 1]).toBeGreaterThan(4.999)
    }
  })

  it('ABNAHME: Erdkörper-Solid → surface → SlopeHatch findet die Böschung', () => {
    // Geschlossener Damm-Körper: Krone y=5 (x 0–10), Böschung ~38,7° (x 10–15),
    // Berme y=1 (x 15–30), Tiefe z 0–10 — als VOLUMENKÖRPER, nicht als TIN.
    const solid = erdkoerper(10)
    const surf = deriveSurface(toPositions(solid), solid.length, { cell: 0.5 })
    expect(surf.method).toBe('heightfield')

    const { segments, stats } = computeSlopeHatch(surf.positions, surf.triCount, {
      minSlopeDeg: 20, tickSpacingWorld: 1, minRegionArea: 1,
    })
    expect(stats.regions).toBeGreaterThanOrEqual(1)
    const top = segments.filter(s => s.kind === 'oberkante')
    const bottom = segments.filter(s => s.kind === 'unterkante')
    const ticks = segments.filter(s => s.kind === 'tick' || s.kind === 'tickHalf')
    expect(top.length).toBeGreaterThan(0)
    expect(bottom.length).toBeGreaterThan(0)
    expect(ticks.length).toBeGreaterThanOrEqual(5)
    // Oberkante verläuft bei x≈10 (Kronenrand), Unterkante bei x≈15 —
    // heightfield-bedingt ±1 Zelle Toleranz
    const meanX = (segs) => segs.reduce((s, x) => s + (x.x1 + x.x2) / 2, 0) / segs.length
    expect(meanX(top)).toBeGreaterThan(8.5)
    expect(meanX(top)).toBeLessThan(11.5)
    expect(meanX(bottom)).toBeGreaterThan(13.5)
    expect(meanX(bottom)).toBeLessThan(16.5)
  })

  it('Erdkörper-Solid → surface → Höhenlinien zwischen Berme und Krone', () => {
    const solid = erdkoerper(10)
    const surf = deriveSurface(toPositions(solid), solid.length, { cell: 0.5 })
    const levels = computeContourLines(surf.positions, surf.triCount, { interval: 1 })
    const values = levels.map(l => l.level)
    // Böschungsbereich 1→5 m: Linien bei 2 und 4 müssen existieren.
    // (3,0 fällt bei cell 0,5 exakt auf Rasterknoten — Schnitt bei Vorzeichen-
    // WECHSEL ist das dokumentierte Epsilon-Verhalten, wie „0 und 5 auf Vertices".)
    for (const v of [2, 4]) expect(values).toContain(v)
    expect(values.length).toBeGreaterThanOrEqual(2)
  })

  it('leere Eingabe → leeres Ergebnis + Warnung', () => {
    const r = deriveSurface(new Float64Array(0), 0)
    expect(r.triCount).toBe(0)
    expect(r.warnings).toContain('mesh_leer')
  })
})
