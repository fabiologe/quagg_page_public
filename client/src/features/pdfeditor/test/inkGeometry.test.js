// InkGeometry — Umrisse (perfect-freehand), Cache und Treffer-Tests.

import { describe, expect, it } from 'vitest'
import {
  strichUmriss, strichUmrissGecacht, leereUmrissCache,
  trifftStrich, punktInPolygon, strichInPolygon, begrenzungsBox,
} from '../services/InkGeometry'

function strich(extra = {}) {
  return {
    id: 'a', rev: 0, tool: 'stift', breitePt: 2, echterDruck: true,
    points: [[0, 0, 0.5], [10, 0, 0.6], [20, 0, 0.7], [30, 0, 0.5]],
    ...extra,
  }
}

describe('strichUmriss', () => {
  it('liefert ein geschlossenes Polygon im Seitenraum', () => {
    const umriss = strichUmriss(strich())
    expect(umriss.length).toBeGreaterThan(3)
    // Umriss umschließt die Polyline: x-Ausdehnung mindestens die der Punkte
    const xs = umriss.map(p => p[0])
    expect(Math.min(...xs)).toBeLessThanOrEqual(0)
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(30)
  })

  it('Marker ohne thinning: Breite bleibt druckunabhängig konstant', () => {
    const duenn = strichUmriss(strich({ tool: 'textmarker', breitePt: 10, points: [[0, 0, 0.1], [30, 0, 0.1]] }))
    const dick = strichUmriss(strich({ tool: 'textmarker', breitePt: 10, points: [[0, 0, 0.9], [30, 0, 0.9]] }))
    const hoehe = (u) => {
      const ys = u.map(p => p[1])
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(Math.abs(hoehe(duenn) - hoehe(dick))).toBeLessThan(0.5)
  })
})

describe('Umriss-Cache', () => {
  it('cacht je id+rev und invalidiert über rev', () => {
    leereUmrissCache()
    const a = strich()
    const erste = strichUmrissGecacht(a)
    expect(strichUmrissGecacht(a)).toBe(erste)               // Referenzgleich = Cache-Treffer
    const bewegt = { ...a, rev: 1, points: a.points.map(([x, y, p]) => [x + 5, y, p]) }
    expect(strichUmrissGecacht(bewegt)).not.toBe(erste)
  })
})

describe('trifftStrich (Radierer)', () => {
  it('trifft nahe der Polyline, verfehlt weit weg', () => {
    const a = strich()
    expect(trifftStrich(a, 15, 2, 3)).toBe(true)     // 2 pt neben dem Segment
    expect(trifftStrich(a, 15, 30, 3)).toBe(false)   // 30 pt entfernt
  })

  it('rechnet die halbe Strichbreite mit ein', () => {
    const breit = strich({ breitePt: 20 })
    expect(trifftStrich(breit, 15, 10, 1)).toBe(true)   // Abstand 10 ≤ 1 + 20/2
    const schmal = strich({ breitePt: 1 })
    expect(trifftStrich(schmal, 15, 10, 1)).toBe(false) // Abstand 10 > 1 + 0.5
  })

  it('trifft auch Einzelpunkt-Striche (Tipp)', () => {
    const punkt = strich({ points: [[5, 5, 0.5]] })
    expect(trifftStrich(punkt, 6, 6, 2)).toBe(true)
  })
})

describe('Lasso-Geometrie', () => {
  const quadrat = [[0, 0], [40, 0], [40, 40], [0, 40]]

  it('punktInPolygon', () => {
    expect(punktInPolygon(20, 20, quadrat)).toBe(true)
    expect(punktInPolygon(50, 20, quadrat)).toBe(false)
  })

  it('strichInPolygon mit 50-%-Regel', () => {
    const halbDrin = strich({ points: [[10, 10, 1], [30, 10, 1], [60, 10, 1], [80, 10, 1]] })
    expect(strichInPolygon(halbDrin, quadrat, 0.5)).toBe(true)    // 2 von 4
    expect(strichInPolygon(halbDrin, quadrat, 0.75)).toBe(false)
  })

  it('begrenzungsBox', () => {
    const box = begrenzungsBox([[1, 2], [5, -3], [4, 9]])
    expect(box).toEqual({ minX: 1, minY: -3, maxX: 5, maxY: 9 })
  })
})
