// planFields: Tiefe als Saeulenintegral, subzelliger Wasserspiegel,
// Sichtbarkeit duenner Filme (Audit P2b — vorher war Wasser unter einer
// halben Vertikalzelle unsichtbar, der Spiegel auf Zellkanten quantisiert).
import { describe, expect, it } from 'vitest'
import { planFields } from '../composables/useFieldCache'
import { TIEFE_TROCKEN } from '../utils/anzeigeSchwellen'

const DZ = 0.25

// Ein-Saeulen-Volumen (nx=ny=1) mit gegebener Alphasaeule von unten nach
// oben; U optional als [[ux,uy,uz], ...] je Zelle.
function volAusSaeule(alphaSaeule, uSaeule = null) {
  const nz = alphaSaeule.length
  const n = nz
  const fields = { alpha: { data: Float32Array.from(alphaSaeule) } }
  if (uSaeule) {
    const U = new Float32Array(3 * n)
    uSaeule.forEach(([ux, uy, uz], k) => {
      U[k] = ux
      U[n + k] = uy
      U[2 * n + k] = uz
    })
    fields.U = { data: U }
  }
  return {
    grid: { dims: [1, 1, nz], origin: [0, 0, 0], spacing: [1, 1, DZ] },
    fields,
  }
}

describe('planFields — Saeulenintegral und Wasserspiegel', () => {
  it('integriert die Tiefe volumenerhaltend ueber den Phasenanteil', () => {
    const pf = planFields(volAusSaeule([1, 1, 0.5, 0]), Float32Array.from([0]))
    expect(pf.depth[0]).toBeCloseTo((1 + 1 + 0.5) * DZ, 6)
    // Spiegel subzellig: Unterkante der obersten Nasszelle (k=2) plus deren
    // Fuellgrad — nicht mehr die Zelloberkante (waere 0.75)
    expect(pf.surface[0]).toBeCloseTo(2 * DZ + 0.5 * DZ, 6)
    // Tiefe und Spiegel sind konsistent (Gelaende auf z=0)
    expect(pf.surface[0]).toBeCloseTo(pf.depth[0], 6)
  })

  it('nimmt die Teilfuellung der Zelle ueber der Nasszelle mit', () => {
    const pf = planFields(volAusSaeule([1, 1, 0.3, 0]), Float32Array.from([0]))
    // kTop = 1 (letzte Zelle mit alpha >= 0.5), darueber 0.3 Teilfuellung
    expect(pf.surface[0]).toBeCloseTo(1 * DZ + (1 + 0.3) * DZ, 6)
    expect(pf.depth[0]).toBeCloseTo(2.3 * DZ, 6)
  })

  it('zeigt duenne Filme, die frueher unsichtbar waren', () => {
    // Keine Zelle erreicht alpha 0.5 — alte Logik: trocken, surface NaN
    const pf = planFields(volAusSaeule([0.2, 0, 0, 0]), Float32Array.from([1.0]))
    expect(pf.depth[0]).toBeCloseTo(0.2 * DZ, 6)
    expect(pf.depth[0]).toBeGreaterThan(TIEFE_TROCKEN)
    // Film liegt auf dem Gelaende (z = 1.0)
    expect(pf.surface[0]).toBeCloseTo(1.0 + 0.2 * DZ, 6)
  })

  it('meldet trockene Saeulen als Tiefe 0 mit Spiegel NaN', () => {
    const pf = planFields(volAusSaeule([0, 0, 0, 0]), Float32Array.from([0]))
    expect(pf.depth[0]).toBe(0)
    expect(Number.isNaN(pf.surface[0])).toBe(true)
  })

  it('nimmt die Oberflaechengeschwindigkeit aus der obersten Nasszelle, bei Filmen aus der benetzten Zelle', () => {
    const nass = planFields(volAusSaeule([1, 1, 0, 0],
      [[0.5, 0, 0], [2, 0, 0], [9, 9, 9], [9, 9, 9]]), Float32Array.from([0]))
    expect(nass.umag[0]).toBeCloseTo(2, 6)

    const film = planFields(volAusSaeule([0.2, 0, 0, 0],
      [[0.7, 0, 0], [9, 9, 9], [9, 9, 9], [9, 9, 9]]), Float32Array.from([0]))
    expect(film.umag[0]).toBeCloseTo(0.7, 6)
  })

  it('mittelt die Geschwindigkeit alpha-gewichtet ueber die Tiefe', () => {
    const pf = planFields(volAusSaeule([1, 0.5, 0, 0],
      [[1, 0, 0], [2, 0, 0], [0, 0, 0], [0, 0, 0]]), Float32Array.from([0]))
    // (1*dz*1 + 0.5*dz*2) / (1.5*dz) = 2/1.5
    expect(pf.uxM[0]).toBeCloseTo(2 / 1.5, 6)
  })

  it('laesst die Froude-Zahl unter der Mindesttiefe aus', () => {
    // hMin = max(2*dz, 0.02) = 0.5 m; Tiefe hier 0.25 m
    const pf = planFields(volAusSaeule([1, 0, 0, 0],
      [[1, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]), Float32Array.from([0]))
    expect(Number.isNaN(pf.froude[0])).toBe(true)
  })
})
