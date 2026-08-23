// MeasureMath — Kalibrierung, Längen/Flächen, Formatierung, Label-Winkel.

import { describe, expect, it } from 'vitest'
import {
  MM_PRO_PT, kalibrierungFuerSeite, realProPtAusMassstab, realProPtAusStrecke,
  streckeLaengePt, polygonFlaechePt2, formatLaenge, formatFlaeche,
  labelWinkel, messwertLabel,
} from '../services/MeasureMath'

describe('Kalibrierung', () => {
  it('Seiteneintrag gewinnt vor dem Dokument-Standard', () => {
    const kal = {
      standard: { realProPt: 1, einheit: 'm' },
      jeSeite: { 2: { realProPt: 5, einheit: 'm' } },
    }
    expect(kalibrierungFuerSeite(kal, 0).realProPt).toBe(1)
    expect(kalibrierungFuerSeite(kal, 2).realProPt).toBe(5)
    expect(kalibrierungFuerSeite(null, 0)).toBeNull()
  })

  it('Maßstab 1:100 → 1 pt entspricht 100 Papier-pt in Metern', () => {
    // 1 pt Papier = 25,4/72 mm; bei 1:100 also 35,28 mm real
    expect(realProPtAusMassstab(100)).toBeCloseTo((MM_PRO_PT / 1000) * 100, 10)
  })

  it('Referenzstrecke: 100 pt = 3,5 m → realProPt 0,035', () => {
    expect(realProPtAusStrecke(100, 3.5)).toBeCloseTo(0.035, 10)
  })
})

describe('Geometrie', () => {
  it('Polylinien-Länge summiert Segmente', () => {
    expect(streckeLaengePt([[0, 0], [3, 4]])).toBeCloseTo(5)
    expect(streckeLaengePt([[0, 0], [3, 4], [3, 14]])).toBeCloseTo(15)
  })

  it('Shoelace: Rechteck 40×30 → 1200 pt²', () => {
    expect(polygonFlaechePt2([[0, 0], [40, 0], [40, 30], [0, 30]])).toBeCloseTo(1200)
  })

  it('Zoominvarianz ist strukturell: Punkte sind Seitenpunkte, kein Pixelbezug', () => {
    // Dieselben Punkte liefern denselben Wert — es gibt schlicht keinen
    // Zoom-Parameter, der das Ergebnis beeinflussen könnte.
    const punkte = [[10, 10], [110, 10]]
    expect(streckeLaengePt(punkte)).toBe(100)
  })
})

describe('Formatierung (de-DE)', () => {
  it('Längen: mm unter 1 m, sonst m', () => {
    expect(formatLaenge(0.85)).toBe('850 mm')
    expect(formatLaenge(12.345)).toBe('12,35 m')
    expect(formatLaenge(234.56)).toBe('234,6 m')
  })

  it('Flächen: m², ha ab 10.000 m²', () => {
    expect(formatFlaeche(25.5)).toBe('25,5 m²')
    expect(formatFlaeche(15000)).toBe('1,5 ha')
  })
})

describe('Label', () => {
  it('Winkel folgt der Strecke und steht nie kopf', () => {
    expect(labelWinkel([0, 0], [10, 0])).toBeCloseTo(0)
    expect(Math.abs(labelWinkel([0, 0], [0, 10]))).toBeCloseTo(90)     // senkrecht
    expect(Math.abs(labelWinkel([10, 0], [0, 0.01]))).toBeLessThan(1)  // nach links → geflippt
    // nie kopfstehend: Ergebnis immer in [-90, 90]
    for (const [dx, dy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const w = labelWinkel([0, 0], [dx, dy])
      expect(w).toBeGreaterThanOrEqual(-90)
      expect(w).toBeLessThanOrEqual(90)
    }
  })

  it('messwertLabel: Strecke live aus Kalibrierung, unkalibriert benannt', () => {
    const messung = { kind: 'distance', points: [[0, 0], [100, 0]] }
    expect(messwertLabel(messung, { realProPt: 0.035, einheit: 'm' })).toBe('3,5 m')
    expect(messwertLabel(messung, null)).toBe('unkalibriert')
  })

  it('messwertLabel: Fläche skaliert quadratisch', () => {
    const messung = { kind: 'area', points: [[0, 0], [100, 0], [100, 100], [0, 100]] }
    // 10000 pt² × (0,035 m/pt)² = 12,25 m²
    expect(messwertLabel(messung, { realProPt: 0.035 })).toBe('12,25 m²')
  })
})
