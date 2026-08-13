// Tests der Griff-Helfer (editor/handles.js): Griffradius, Umriss-Züge
// (loops/closed-Konvention des Objektzugriffs), Raster-/Punktfang beim
// Ziehen und das vorläufige Gebiet aus gezogenen Griffen.
import { describe, expect, it } from 'vitest'
import { fangePunkt, gebietAusPunkten, griffRadius,
  umrissZuege } from '../components/pre/editor/handles'

describe('griffRadius', () => {
  it('folgt der Rasterauflösung mit Untergrenze 0,3 m', () => {
    expect(griffRadius(1)).toBeCloseTo(0.7)
    expect(griffRadius(0.1)).toBeCloseTo(0.3)
    expect(griffRadius(undefined)).toBeCloseTo(0.35)   // Default 0,5 m
  })
})

describe('umrissZuege', () => {
  it('offener Zug: die Indizes in Reihenfolge, ohne Schluss', () => {
    expect(umrissZuege(undefined, false, 3)).toEqual([[0, 1, 2]])
  })
  it('geschlossener Zug hängt den Anfang wieder an', () => {
    expect(umrissZuege(undefined, true, 4)).toEqual([[0, 1, 2, 3, 0]])
  })
  it('loops (Modellgebiet: Sohle + Deckel) werden je Ring geschlossen — ein durchgehender Zug ergäbe eine Diagonale', () => {
    expect(umrissZuege([[0, 1, 2, 3], [4, 5, 6, 7]], undefined, 8)).toEqual(
      [[0, 1, 2, 3, 0], [4, 5, 6, 7, 4]])
  })
  it('ein einzelner Punkt hat keinen Umriss', () => {
    expect(umrissZuege(undefined, false, 1)).toEqual([])
  })
})

describe('fangePunkt', () => {
  const raster = 0.5

  it('rastet ohne Fang aufs Zellraster', () => {
    expect(fangePunkt(3.18, 7.62, { lock: null, raster, snapPunkte: [] }))
      .toEqual({ x: 3, y: 7.5, gefangen: false })
  })
  it('Stützpunkte ANDERER Objekte gewinnen vorm Zellraster', () => {
    const f = fangePunkt(3.18, 7.62, { lock: null, raster,
      snapPunkte: [[3.3, 7.7], [20, 20]] })
    expect(f).toEqual({ x: 3.3, y: 7.7, gefangen: true })
  })
  it('zu ferne Fangpunkte greifen nicht (Radius 0,6 · Raster)', () => {
    const f = fangePunkt(3.18, 7.62, { lock: null, raster,
      snapPunkte: [[3.6, 7.7]] })   // Abstand ≈ 0,43 > 0,3
    expect(f.gefangen).toBe(false)
  })
  it('Achsen-Lock: nur die bewegte Koordinate rastet, kein Punktfang', () => {
    expect(fangePunkt(3.18, 7.62, { lock: 'x', raster,
      snapPunkte: [[3.2, 7.6]] })).toEqual({ x: 3, y: 7.62, gefangen: false })
    expect(fangePunkt(3.18, 7.62, { lock: 'y', raster, snapPunkte: [] }))
      .toEqual({ x: 3.18, y: 7.5, gefangen: false })
  })
})

describe('gebietAusPunkten', () => {
  it('achsparalleles Umgebungsrechteck der Griffe', () => {
    const pkte = [{ x: 2, y: 3 }, { x: 10, y: 1 }, { x: 8, y: 9 }, { x: 4, y: 5 }]
    expect(gebietAusPunkten(pkte)).toEqual([2, 1, 10, 9])
  })
  it('unter vier Punkten (kein Quader-Griffsatz) kein Gebiet', () => {
    expect(gebietAusPunkten([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull()
  })
})
