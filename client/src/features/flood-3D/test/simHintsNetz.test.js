/**
 * Die Netz-Kennwerte müssen sagen, was WIRKLICH gerechnet wird.
 *
 * Auslöser (2026-08-12): Der Fall Rentrisch_BetaTest06 rechnete mit 0,025 m
 * Zellen, weil eine Kur das Gelände auf Stufe 3 gesetzt hatte — im Panel
 * stand 0,2 m, 85.331 Zellen und 7 h. Gerechnet wurden 943.370 Zellen und
 * 47 h. Beide Zahlen dürfen so nicht mehr entstehen.
 */
import { describe, expect, it } from 'vitest'

import { hinweis, kennwerte } from '../utils/simHints'

const fall = (extra = {}) => ({
  domain: { extent: [1.63, 1, 13.37, 14], z_min: 223.7, z_max: 226.6 },
  mesh: { base_cell: 0.2, refinements: [], ...extra.mesh },
  solver: { end_time: 60, max_co: 0.5, max_alpha_co: 0.5,
            write_interval_fields: 0.1, ...extra.solver },
  boundaries: [],
})

describe('Netz-Kennwerte', () => {
  it('nennt die feinste Zelle, nicht die eingestellte', () => {
    const k = kennwerte(fall({ mesh: { base_cell: 0.2, refinements: [
      { id: 'fein_terrain', type: 'surface', target: 'terrain', level: 3 },
      { id: 'box_2', type: 'box', level: 2, extent: [5, 11, 223.7, 8, 14, 225.4] },
    ] } }))
    expect(k.maxStufe).toBe(3)
    expect(k.feinsteZelle).toBeCloseTo(0.025, 6)
    expect(k.feinstesAus).toContain('terrain')
  })

  it('warnt im Hinweistext, wenn feiner gerechnet wird als eingestellt', () => {
    const h = hinweis('mesh.base_cell', fall({ mesh: { base_cell: 0.2,
      refinements: [{ id: 'f', type: 'surface', target: 'terrain', level: 3 }] } }))
    expect(h.level).toBe('warn')
    expect(h.text).toMatch(/0,03 m|0,025 m|0,02 m/)   // gerundete Anzeige
    expect(h.text).toMatch(/terrain/)
  })

  it('zählt Verfeinerungen in die Zellzahl ein', () => {
    const ohne = kennwerte(fall())
    const mit = kennwerte(fall({ mesh: { base_cell: 0.2, refinements: [
      { id: 'f', type: 'surface', target: 'terrain', level: 3 }] } }))
    expect(mit.zellen).toBeGreaterThan(ohne.zellen * 3)
  })

  it('reagiert auf die Grundzelle (der alte Messwert blieb stehen)', () => {
    const fein = kennwerte(fall({ mesh: { base_cell: 0.2 } }))
    const grob = kennwerte(fall({ mesh: { base_cell: 0.4 } }))
    expect(grob.zellen).toBeLessThan(fein.zellen / 4)
  })

  it('benutzt den gemessenen Wert nur, solange das Vorschaunetz passt', () => {
    const messung = { cells: 85331 }
    const frisch = kennwerte(fall(), messung, false)
    const veraltet = kennwerte(fall(), messung, true)
    expect(frisch.zellen).toBe(85331)
    expect(frisch.gemessen).toBe(true)
    expect(veraltet.gemessen).toBe(false)
    expect(veraltet.zellen).not.toBe(85331)
  })

  it('schätzt die Rechenzeit in der richtigen Größenordnung', () => {
    // echter Lauf: 943.370 Zellen, 60 s, dt 0,0016 s -> 47 h auf 16 vCPU,
    // also grob 90 h auf 8 Kernen. Frueher sagte der Schaetzer 7 h.
    const k = kennwerte(fall({ mesh: { base_cell: 0.2, refinements: [
      { id: 'f', type: 'surface', target: 'terrain', level: 3 }] } }))
    expect(k.stunden).toBeGreaterThan(20)
    expect(k.stunden).toBeLessThan(500)
  })
})
