// Kostenschätzung Stufe 1: Menge × Kennwert je KG, Einheiten m³/Stk.

import { describe, expect, it } from 'vitest'
import { mergeKennwerte, computeKosten, DEFAULT_KENNWERTE } from '../services/KgKennwerte'

describe('mergeKennwerte', () => {
  it('liefert ohne gespeicherte Werte die Defaults (Kopie, nicht Referenz)', () => {
    const kw = mergeKennwerte(null)
    expect(kw['330']).toEqual(DEFAULT_KENNWERTE['330'])
    kw['330'].wert = 1
    expect(DEFAULT_KENNWERTE['330'].wert).not.toBe(1)
  })

  it('gespeicherte Werte übersteuern, Defaults füllen Lücken', () => {
    const kw = mergeKennwerte({ '330': { wert: 999 } })
    expect(kw['330'].wert).toBe(999)
    expect(kw['330'].einheit).toBe(DEFAULT_KENNWERTE['330'].einheit)
    expect(kw['340']).toEqual(DEFAULT_KENNWERTE['340'])
  })
})

describe('computeKosten', () => {
  const byKg = new Map([
    ['330', { count: 4, volume_m3: 120 }],
    ['334', { count: 12, volume_m3: 6 }],
    ['999', { count: 2, volume_m3: 5 }], // kein Kennwert
  ])

  it('rechnet m³- und Stück-Kennwerte korrekt und summiert', () => {
    const kennwerte = {
      '330': { einheit: 'm3', wert: 550 },
      '334': { einheit: 'stk', wert: 1600 },
    }
    const { rows, summe } = computeKosten(byKg, kennwerte)
    const r330 = rows.find(r => r.kgCode === '330')
    const r334 = rows.find(r => r.kgCode === '334')
    expect(r330.betrag).toBeCloseTo(120 * 550)
    expect(r330.menge).toBeCloseTo(120)
    expect(r334.betrag).toBeCloseTo(12 * 1600)
    expect(r334.menge).toBe(12)
    expect(summe).toBeCloseTo(120 * 550 + 12 * 1600)
  })

  it('KG ohne Kennwert erscheint mit Betrag 0 und hasKennwert=false', () => {
    const { rows, summe } = computeKosten(byKg, {})
    const r999 = rows.find(r => r.kgCode === '999')
    expect(r999.hasKennwert).toBe(false)
    expect(r999.betrag).toBe(0)
    expect(summe).toBe(0)
  })

  it('verkraftet leere Eingaben', () => {
    expect(computeKosten(null, {})).toEqual({ rows: [], summe: 0 })
    expect(computeKosten(new Map(), {})).toEqual({ rows: [], summe: 0 })
  })
})
