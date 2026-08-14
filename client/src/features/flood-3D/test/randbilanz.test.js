// Randbilanz-Helfer: Trapez-Kumulierung, Zeitcursor-Interpolation und die
// Verortung eines Rand-Fensters. Gegen Handrechnung gepinnt — Grundriss
// (G3-Pfeile) und Raum (Randbilanz-Labels) hängen an genau diesen Werten.
import { describe, expect, it } from 'vitest'
import { fensterMittelpunkt, fensterSpanne, kumuliere, randFace, randTyp,
  wertBei } from '../utils/randbilanz'

// 10 × 20 × 4 m Gebiet ab (100, 200, 50)
const grid = { origin: [100, 200, 50], spacing: [0.5, 0.5, 0.5],
  dims: [20, 40, 8] }

describe('kumuliere', () => {
  it('Trapezregel gegen Handrechnung', () => {
    // Q: 0 → 2 → 2 → 0 auf t = 0, 10, 20, 30
    // Flächen: 10·(0+2)/2 = 10; 10·2 = 20; 10·(2+0)/2 = 10
    const V = kumuliere([0, 10, 20, 30], [0, 2, 2, 0])
    expect(Array.from(V)).toEqual([0, 10, 30, 40])
  })

  it('ungleiche Schrittweiten und Vorzeichenwechsel', () => {
    // 5·(1+1)/2 = 5, dann 15·(1−1)/2 = 0
    const V = kumuliere([0, 5, 20], [1, 1, -1])
    expect(Array.from(V)).toEqual([0, 5, 5])
  })

  it('leer und einelementig: kein Absturz, V[0] = 0', () => {
    expect(Array.from(kumuliere([], []))).toEqual([])
    expect(Array.from(kumuliere([7], [3]))).toEqual([0])
  })
})

describe('wertBei', () => {
  const t = [0, 10, 20]
  const v = [0, 100, 50]

  it('interpoliert linear zwischen Stützstellen', () => {
    expect(wertBei(t, v, 5)).toBeCloseTo(50)
    expect(wertBei(t, v, 15)).toBeCloseTo(75)
  })

  it('trifft Stützstellen exakt', () => {
    expect(wertBei(t, v, 10)).toBe(100)
  })

  it('klemmt an den Rändern statt zu extrapolieren', () => {
    expect(wertBei(t, v, -5)).toBe(0)
    expect(wertBei(t, v, 999)).toBe(50)
  })

  it('leere Reihe → null', () => {
    expect(wertBei([], [], 1)).toBeNull()
    expect(wertBei(null, null, 1)).toBeNull()
  })
})

describe('randTyp / randFace', () => {
  it('inflow_* → zu, outflow_* → ab, atmosphere → null', () => {
    expect(randTyp({ type: 'inflow_constant' })).toBe('zu')
    expect(randTyp({ type: 'inflow_hydrograph' })).toBe('zu')
    expect(randTyp({ type: 'outflow_free' })).toBe('ab')
    expect(randTyp({ type: 'outflow_fixed_level' })).toBe('ab')
    expect(randTyp({ type: 'atmosphere' })).toBeNull()
    expect(randTyp({})).toBeNull()
    expect(randTyp(null)).toBeNull()
  })

  it('Face: explizit gesetzt gewinnt, sonst meshgen-Vorbelegung', () => {
    expect(randFace({ type: 'inflow_constant', face: 'y_max' })).toBe('y_max')
    expect(randFace({ type: 'inflow_constant' })).toBe('x_min')
    expect(randFace({ type: 'outflow_free' })).toBe('x_max')
    expect(randFace({ type: 'atmosphere' })).toBeNull()
  })
})

describe('fensterSpanne', () => {
  it('span (auch verdreht) → sortiertes Intervall', () => {
    expect(fensterSpanne({ span: [204, 202] }, 200, 220)).toEqual([202, 204])
  })

  it('Kreis/Trapez aus Mitte und Breite', () => {
    expect(fensterSpanne({ shape: 'kreis', center: 210, diameter: 2 },
      200, 220)).toEqual([209, 211])
    expect(fensterSpanne({ shape: 'trapez', center: 210, bottom_width: 1,
      top_width: 4 }, 200, 220)).toEqual([208, 212])
  })

  it('ohne Fenster (und bei follow) die ganze Kante', () => {
    expect(fensterSpanne(null, 200, 220)).toEqual([200, 220])
    expect(fensterSpanne({ follow: 'rohr1' }, 200, 220)).toEqual([200, 220])
  })
})

describe('fensterMittelpunkt', () => {
  it('x_min mit span-Fenster: Kante x, Fenstermitte y, z-Mitte', () => {
    const p = fensterMittelpunkt({ type: 'inflow_constant', face: 'x_min',
      window: { span: [204, 208] } }, grid)
    expect(p[0]).toBeCloseTo(100)
    expect(p[1]).toBeCloseTo(206)
    expect(p[2]).toBeCloseTo(52)      // 50…54 → Mitte
  })

  it('x_max ohne Fenster: Flächenmitte', () => {
    const p = fensterMittelpunkt({ type: 'outflow_free', face: 'x_max' }, grid)
    expect(p).toEqual([110, 210, 52])
  })

  it('y_min mit Kreisfenster: z aus z_center', () => {
    const p = fensterMittelpunkt({ type: 'inflow_constant', face: 'y_min',
      window: { shape: 'kreis', center: 104, z_center: 51, diameter: 1 } }, grid)
    expect(p).toEqual([104, 200, 51])
  })

  it('y_max mit Polygonfenster: Schwerpunkt der Eckpunkte', () => {
    const p = fensterMittelpunkt({ type: 'outflow_free', face: 'y_max',
      window: { shape: 'polygon',
        points: [[102, 50], [106, 50], [104, 52]] } }, grid)
    expect(p[0]).toBeCloseTo(104)
    expect(p[1]).toBeCloseTo(220)
    expect(p[2]).toBeCloseTo(50.667, 3)
  })

  it('z_max: Deckelmitte; Vorbelegung ohne face: Zufluss x_min', () => {
    expect(fensterMittelpunkt({ type: 'atmosphere', face: 'z_max' }, grid))
      .toEqual([105, 210, 54])
    const p = fensterMittelpunkt({ type: 'inflow_constant' }, grid)
    expect(p[0]).toBeCloseTo(100)
  })

  it('ohne Gitter → null', () => {
    expect(fensterMittelpunkt({ type: 'inflow_constant' }, null)).toBeNull()
  })
})
