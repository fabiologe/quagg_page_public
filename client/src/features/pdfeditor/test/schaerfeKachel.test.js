// Stufe 12: Schärfe-Kachel — Geometrie des Scharfstell-Ausschnitts.

import { describe, expect, it } from 'vitest'
import {
  berechneKachel, kachelDeckt, kachelNoetig, KACHEL_MAX_PIXEL,
} from '../services/SchaerfeKachel'

const A1 = { breitePt: 2384, hoehePt: 1684 }

describe('kachelNoetig', () => {
  it('nur wenn die Zielskala die Basis deutlich übersteigt', () => {
    expect(kachelNoetig(2.0, 4.0)).toBe(true)
    expect(kachelNoetig(2.0, 2.04)).toBe(false)   // < 5 % drüber
    expect(kachelNoetig(2.0, 1.5)).toBe(false)
  })
})

describe('berechneKachel', () => {
  it('umfasst das Sichtfenster plus Rand, an die Seite geklemmt', () => {
    const k = berechneKachel({ x: 1000, y: 700, b: 300, h: 200 }, A1, 4)
    expect(k.xPt).toBeCloseTo(925)     // 25 % Rand links
    expect(k.yPt).toBeCloseTo(650)
    expect(k.bPt).toBeCloseTo(450)
    expect(k.hPt).toBeCloseTo(300)
    expect(k.skala).toBe(4)            // 450×300×16 = 2,16 Mio px < Deckel
  })

  it('deckelt die Kachelfläche über die Skala', () => {
    // Riesiges Sichtfenster bei hoher Skala → Skala sinkt aufs Budget
    const k = berechneKachel({ x: 0, y: 0, b: 2000, h: 1500 }, A1, 8)
    expect(k.bPt * k.hPt * k.skala * k.skala).toBeLessThanOrEqual(KACHEL_MAX_PIXEL * 1.001)
    expect(k.skala).toBeLessThan(8)
  })

  it('klemmt an den Seitenrändern', () => {
    const k = berechneKachel({ x: -50, y: -50, b: 300, h: 200 }, A1, 4)
    expect(k.xPt).toBe(0)
    expect(k.yPt).toBe(0)
  })

  it('null, wenn die Seite nicht im Sichtfenster liegt', () => {
    expect(berechneKachel({ x: 5000, y: 5000, b: 300, h: 200 }, A1, 4)).toBeNull()
  })
})

describe('kachelDeckt', () => {
  const kachel = { xPt: 900, yPt: 625, bPt: 600, hPt: 450, skala: 4 }

  it('deckt beim Minimal-Scrollen innerhalb des Rands (kein Neu-Render)', () => {
    expect(kachelDeckt(kachel, { x: 950, y: 660, b: 400, h: 300 }, A1, 4)).toBe(true)
  })

  it('deckt nicht mehr, wenn das Sichtfenster den Rand verlässt', () => {
    expect(kachelDeckt(kachel, { x: 1300, y: 660, b: 400, h: 300 }, A1, 4)).toBe(false)
  })

  it('deckt nicht, wenn eine schärfere Kachel möglich wäre (reingezoomt)', () => {
    expect(kachelDeckt(kachel, { x: 1000, y: 700, b: 200, h: 150 }, A1, 6)).toBe(false)
  })

  it('ohne Kachel nie gedeckt', () => {
    expect(kachelDeckt(null, { x: 0, y: 0, b: 100, h: 100 }, A1, 4)).toBe(false)
  })
})
