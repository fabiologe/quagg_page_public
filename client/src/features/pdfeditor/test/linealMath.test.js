// LinealMath — Kantengeometrie, Ink-Snap-Projektion, Tick-Wahl, Winkelraste.

import { describe, expect, it } from 'vitest'
import {
  kantenLinie, abstandZurKante, projiziereAufKante, tickSchritt, rasteWinkel, PT_PRO_CM,
} from '../services/LinealMath'

describe('Kantengeometrie', () => {
  it('horizontale Kante: Abstand ist die y-Differenz, Projektion behält x', () => {
    const linie = kantenLinie({ x: 100, y: 200, winkelGrad: 0 })
    expect(abstandZurKante(150, 212, linie)).toBeCloseTo(12)
    expect(projiziereAufKante(150, 212, linie)).toEqual([150, 200])
  })

  it('45-Grad-Kante: projizierte Punkte liegen exakt auf der Geraden', () => {
    const linie = kantenLinie({ x: 0, y: 0, winkelGrad: 45 })
    const [px, py] = projiziereAufKante(10, 0, linie)
    expect(px).toBeCloseTo(5)
    expect(py).toBeCloseTo(5)
    expect(abstandZurKante(px, py, linie)).toBeCloseTo(0)
  })

  it('alle projizierten Punkte eines Strichs sind kollinear', () => {
    const linie = kantenLinie({ x: 50, y: 80, winkelGrad: 30 })
    const punkte = [[10, 20], [60, 90], [120, 70]].map(([x, y]) => projiziereAufKante(x, y, linie))
    for (const [x, y] of punkte) {
      expect(abstandZurKante(x, y, linie)).toBeCloseTo(0, 6)
    }
  })
})

describe('rasteWinkel', () => {
  it('rastet nahe Konstruktionswinkeln ein, lässt freie Winkel frei', () => {
    expect(rasteWinkel(1.4)).toBe(0)
    expect(rasteWinkel(44.2)).toBe(45)
    expect(rasteWinkel(91.9)).toBe(90)
    expect(rasteWinkel(17)).toBe(17)
  })

  it('normalisiert auf [0, 180)', () => {
    expect(rasteWinkel(200)).toBe(20)
    expect(rasteWinkel(-45)).toBe(135)
    expect(rasteWinkel(179.5)).toBe(0)   // 180-Raste → 0
  })
})

describe('tickSchritt — maßstabsgetreu', () => {
  it('1:100 bei Zoom 1: 1-m-Tick ist 28,35 pt (= 10 mm Papier)', () => {
    // realProPt bei 1:100 = 0,352777 mm/pt × 100 / 1000 m
    const kal = { realProPt: (25.4 / 72 / 1000) * 100 }
    const s = tickSchritt(kal, 1, 20)
    expect(s.einheit).toBe('m')
    expect(s.wert).toBe(1)
    expect(s.laengePt).toBeCloseTo(28.35, 1)
  })

  it('kleiner Zoom → gröberer Schritt, großer Zoom → feinerer Schritt', () => {
    const kal = { realProPt: (25.4 / 72 / 1000) * 100 }
    expect(tickSchritt(kal, 0.5, 40).wert).toBeGreaterThan(tickSchritt(kal, 4, 40).wert)
  })

  it('unkalibriert: Papier-Zentimeter als Rückfall', () => {
    const s = tickSchritt(null, 1, 20)
    expect(s.einheit).toBe('cm')
    expect(s.laengePt).toBeCloseTo(s.wert * PT_PRO_CM)
  })

  it('Zoom ändert nie den Wert eines gegebenen Schritts, nur die Wahl', () => {
    const kal = { realProPt: 0.035 }
    const grob = tickSchritt(kal, 1, 40)
    // laengePt hängt NUR von wert und Kalibrierung ab:
    expect(grob.laengePt).toBeCloseTo(grob.wert / kal.realProPt)
  })
})
