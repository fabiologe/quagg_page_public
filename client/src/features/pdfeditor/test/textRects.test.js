// TextRects — Zeilenvereinigung der Textauswahl und Radierer-Treffer.

import { describe, expect, it } from 'vitest'
import { vereinigeZeilenRects, trifftRects } from '../services/TextRects'

describe('vereinigeZeilenRects', () => {
  it('vereinigt Fragmente derselben Zeile zu einer Box', () => {
    const zeilen = vereinigeZeilenRects([
      { x: 10, y: 100, w: 40, h: 12 },
      { x: 52, y: 100.5, w: 30, h: 11 },   // gleiche Zeile, leicht versetzt
      { x: 84, y: 99.8, w: 20, h: 12 },
    ])
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0].x).toBe(10)
    expect(zeilen[0].w).toBeCloseTo(94, 0)
  })

  it('trennt echte Zeilen', () => {
    const zeilen = vereinigeZeilenRects([
      { x: 10, y: 100, w: 200, h: 12 },
      { x: 10, y: 116, w: 150, h: 12 },   // nächste Zeile (kein Überlapp)
    ])
    expect(zeilen).toHaveLength(2)
    expect(zeilen[1].w).toBe(150)
  })

  it('wirft Mini-Fragmente weg und übersteht leere Eingabe', () => {
    expect(vereinigeZeilenRects([])).toEqual([])
    expect(vereinigeZeilenRects([{ x: 0, y: 0, w: 0.05, h: 12 }])).toEqual([])
  })

  it('überlappende Doppel-Rects (Browser-Eigenart) blähen die Box nicht auf', () => {
    const zeilen = vereinigeZeilenRects([
      { x: 10, y: 100, w: 40, h: 12 },
      { x: 10, y: 100, w: 40, h: 12 },   // exaktes Duplikat
    ])
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0].w).toBe(40)
  })
})

describe('trifftRects', () => {
  const rects = [{ x: 10, y: 10, w: 50, h: 10 }]
  it('innen und mit Radius am Rand', () => {
    expect(trifftRects(rects, 30, 15)).toBe(true)
    expect(trifftRects(rects, 63, 15, 4)).toBe(true)   // 3 pt daneben, Radius 4
    expect(trifftRects(rects, 70, 15, 4)).toBe(false)
  })
})
