// Stufe 17: Baugrubenvolumen mit Böschung — Eckfaktor, Versatzkontur,
// exaktes Integral vs. Prismoid-Kontrolle, Formatierung und der Rechenweg
// als Text (eine Quelle für Dialog, Bildschirm, Export).

import { describe, expect, it } from 'vitest'
import {
  polygonUmfangPt, eckfaktor, versetzePolygon, volumenAusPolygon,
  formatVolumen, rechenwegZeilen, signierteFlaechePt2,
} from '../services/VolumenMath'

const R = 0.1                                   // 1 pt = 0,1 m → 80×60 pt = 8×6 m
const RECHTECK = [[0, 0], [80, 0], [80, 60], [0, 60]]
const RECHTECK_CW = [...RECHTECK].reverse()
const DREIECK = [[0, 0], [30, 0], [0, 40]]      // 3-4-5 in dm: A 600 pt², U 120 pt
const L_FORM = [[0, 0], [80, 0], [80, 30], [30, 30], [30, 60], [0, 60]]
const flaeche = (p) => Math.abs(signierteFlaechePt2(p))

describe('Geometrie', () => {
  it('Umfang ist geschlossen', () => {
    expect(polygonUmfangPt([[0, 0], [40, 0], [40, 30], [0, 30]])).toBe(140)
  })

  it('Eckfaktor: Rechteck 4 (CW wie CCW), 3-4-5-Dreieck 6, gleichseitig 3·√3, L-Form 4', () => {
    expect(eckfaktor(RECHTECK).K).toBeCloseTo(4)
    expect(eckfaktor(RECHTECK_CW).K).toBeCloseTo(4)
    expect(eckfaktor(DREIECK).K).toBeCloseTo(6)           // 1 + 2 + 3
    const h = 50 * Math.sqrt(3) / 2
    expect(eckfaktor([[0, 0], [50, 0], [25, h]]).K).toBeCloseTo(3 * Math.sqrt(3), 5)
    expect(eckfaktor(L_FORM).K).toBeCloseTo(4)            // 5 konvexe (+1) und eine konkave (−1)
    expect(eckfaktor(L_FORM).spitzeEcke).toBe(false)
  })

  it('Eckfaktor meldet sehr spitze Ecken (5°) und kappt sie', () => {
    const spitz = [[0, 0], [100, 0], [100, 100 * Math.tan((5 * Math.PI) / 180)]]
    const { K, spitzeEcke } = eckfaktor(spitz)
    expect(spitzeEcke).toBe(true)
    expect(K).toBeLessThan(15)   // ohne Kappe wäre der 5°-Beitrag allein ≈ 22,9
  })

  it('versetzePolygon: nach außen wächst, nach innen schrumpft, Orientierung egal', () => {
    expect(flaeche(versetzePolygon(RECHTECK, 10))).toBeCloseTo(100 * 80)
    expect(flaeche(versetzePolygon(RECHTECK, -10))).toBeCloseTo(60 * 40)
    expect(flaeche(versetzePolygon(RECHTECK_CW, 10))).toBeCloseTo(100 * 80)
    // Dreieck mit Inkreisradius 10: Versatz um +10 = ähnliches Dreieck, Faktor 2 → Fläche ×4
    expect(flaeche(versetzePolygon(DREIECK, 10))).toBeCloseTo(4 * 600)
    expect(versetzePolygon(RECHTECK, 0)).toEqual(RECHTECK)
  })
})

describe('volumenAusPolygon', () => {
  it('Rechteck 8×6, t=2, 1:1 — Terme und Prismoid-Kontrolle', () => {
    const e = volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 2, neigungN: 1 })
    expect(e.A).toBeCloseTo(48)
    expect(e.U).toBeCloseTo(28)
    expect(e.K).toBeCloseTo(4)
    expect(e.b).toBeCloseTo(2)
    expect(e.bPt).toBeCloseTo(20)
    expect(e.gegenFlaeche).toBeCloseTo(120)
    expect(e.vKern).toBeCloseTo(96)
    expect(e.vKeile).toBeCloseTo(56)
    expect(e.vEcken).toBeCloseTo(32 / 3)
    expect(e.V).toBeCloseTo(488 / 3)
    // Prismoid: t/6 · (A + 4·A(t/2) + Ao), A(1) = 48 + 28 + 4 = 80
    expect(e.V).toBeCloseTo((2 / 6) * (48 + 4 * 80 + 120))
    expect(e.warnungen).toEqual([])
    expect(e.schliesstSich).toBe(false)
  })

  it('senkrecht (n=0) ist der Quader A·t', () => {
    const e = volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 2, neigungN: 0 })
    expect(e.V).toBeCloseTo(96)
    expect(e.vKeile).toBe(0)
    expect(e.vEcken).toBe(0)
    expect(e.gegenFlaeche).toBeCloseTo(48)
  })

  it('3-4-5-Dreieck t=1, 1:1 → 14 m³ (6·∫(1+z)²)', () => {
    const e = volumenAusPolygon({ points: DREIECK, realProPt: R, tiefeM: 1, neigungN: 1 })
    expect(e.V).toBeCloseTo(14)
  })

  it('L-Form (konkave Ecke) t=2, 1:1 → 398/3 m³, Oberkante 105 m²', () => {
    const e = volumenAusPolygon({ points: L_FORM, realProPt: R, tiefeM: 2, neigungN: 1 })
    expect(e.A).toBeCloseTo(33)
    expect(e.U).toBeCloseTo(28)
    expect(e.V).toBeCloseTo(398 / 3)
    expect(e.gegenFlaeche).toBeCloseTo(105)
  })

  it('Modus Oberkante: Sohle schrumpft, maximale Tiefe wird berechnet', () => {
    const e = volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 2, neigungN: 1, modus: 'oberkante' })
    expect(e.gegenFlaeche).toBeCloseTo(8)
    expect(e.V).toBeCloseTo(152 / 3)
    expect(e.V).toBeCloseTo((2 / 6) * (48 + 4 * 24 + 8))   // Prismoid, A(1) = 48 − 28 + 4
    expect(e.maxTiefeM).toBeCloseTo(3)
    expect(e.schliesstSich).toBe(false)
    const zu = volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 3.5, neigungN: 1, modus: 'oberkante' })
    expect(zu.schliesstSich).toBe(true)
    expect(zu.warnungen[0]).toMatch(/schließt sich/)
    expect(zu.warnungen[0]).toMatch(/3 m/)
  })

  it('unbrauchbare Eingaben → null', () => {
    expect(volumenAusPolygon({ points: RECHTECK, realProPt: null, tiefeM: 2, neigungN: 1 })).toBeNull()
    expect(volumenAusPolygon({ points: RECHTECK, realProPt: 0, tiefeM: 2, neigungN: 1 })).toBeNull()
    expect(volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 0, neigungN: 1 })).toBeNull()
    expect(volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 2, neigungN: -1 })).toBeNull()
    expect(volumenAusPolygon({ points: [[0, 0], [10, 0]], realProPt: R, tiefeM: 2, neigungN: 1 })).toBeNull()
  })
})

describe('Formatierung und Rechenweg (de-DE)', () => {
  it('formatVolumen', () => {
    expect(formatVolumen(488 / 3)).toBe('162,67 m³')
    expect(formatVolumen(96)).toBe('96 m³')
    expect(formatVolumen(1234.56)).toBe('1.234,6 m³')
    expect(formatVolumen(NaN)).toBe('—')
  })

  it('Rechenweg Sohle 1:1 — sechs Zeilen, exakt', () => {
    const e = volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 2, neigungN: 1 })
    expect(rechenwegZeilen(e, { auflockerung: 1.25 })).toEqual([
      'Sohle A = 48,00 m² · U = 28,00 m · K = 4,00',
      'Tiefe t = 2,00 m · Böschung 1:1 · b = n·t = 2,00 m',
      'Oberkante Ao = A + U·b + K·b² = 48,00 + 56,00 + 16,00 = 120,00 m²',
      'V = A·t + U·n·t²/2 + K·n²·t³/3',
      '  = 96,00 + 56,00 + 10,67 = 162,67 m³',
      'aufgelockert × 1,25 = 203,33 m³',
    ])
    expect(rechenwegZeilen(e, { auflockerung: 1 })).toHaveLength(5)
  })

  it('Rechenweg senkrecht — Quader', () => {
    const e = volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 2, neigungN: 0 })
    expect(rechenwegZeilen(e, { auflockerung: 1.25 })).toEqual([
      'Sohle A = 48,00 m² · U = 28,00 m · K = 4,00',
      'Tiefe t = 2,00 m · senkrecht (n = 0) · b = 0,00 m',
      'Oberkante Ao = A = 48,00 m²',
      'V = A·t = 48,00 · 2,00 = 96,00 m³',
      'aufgelockert × 1,25 = 120,00 m³',
    ])
  })

  it('Rechenweg Oberkante — Minuszeichen und Sohle As', () => {
    const e = volumenAusPolygon({ points: RECHTECK, realProPt: R, tiefeM: 2, neigungN: 1, modus: 'oberkante' })
    expect(rechenwegZeilen(e, { auflockerung: 1.25 })).toEqual([
      'Oberkante A = 48,00 m² · U = 28,00 m · K = 4,00',
      'Tiefe t = 2,00 m · Böschung 1:1 · b = n·t = 2,00 m',
      'Sohle As = A - U·b + K·b² = 48,00 - 56,00 + 16,00 = 8,00 m²',
      'V = A·t - U·n·t²/2 + K·n²·t³/3',
      '  = 96,00 - 56,00 + 10,67 = 50,67 m³',
      'aufgelockert × 1,25 = 63,33 m³',
    ])
  })

  it('ohne Ergebnis keine Zeilen', () => {
    expect(rechenwegZeilen(null)).toEqual([])
  })
})
