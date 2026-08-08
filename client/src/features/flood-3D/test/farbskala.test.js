// Farbskalen-Fixierung: übernimmt den sichtbaren Bereich und fällt bei
// unbrauchbaren Eingaben zurück, statt die Karte einfarbig zu machen.
import { describe, expect, it } from 'vitest'
import { bereichUngueltig, uebernehmeBereich, wirksamerBereich }
  from '../utils/farbskala'

describe('uebernehmeBereich', () => {
  it('übernimmt den aktuellen Bereich statt 0…1', () => {
    expect(uebernehmeBereich([0, 80.4])).toEqual([0, 80.4])
  })
  it('rundet auf 3 signifikante Stellen', () => {
    expect(uebernehmeBereich([0.30000000000000004, 1.23456]))
      .toEqual([0.3, 1.23])
  })
  it('fängt kaputte Auto-Bereiche ab', () => {
    expect(uebernehmeBereich([NaN, 5])).toEqual([0, 1])
    expect(uebernehmeBereich(undefined)).toEqual([0, 1])
  })
})

describe('wirksamerBereich', () => {
  const auto = [0, 80]
  it('nimmt ohne Fixierung den Auto-Bereich', () => {
    expect(wirksamerBereich(false, 2, 3, auto)).toBe(auto)
  })
  it('nimmt mit Fixierung die Eingaben', () => {
    expect(wirksamerBereich(true, 2, 3, auto)).toEqual([2, 3])
  })
  it('fällt bei leerem Feld (NaN) auf den Auto-Bereich zurück', () => {
    expect(wirksamerBereich(true, NaN, 3, auto)).toBe(auto)
    expect(wirksamerBereich(true, 2, NaN, auto)).toBe(auto)
  })
  it('fällt bei min >= max zurück, statt alles einfarbig zu zeichnen', () => {
    expect(wirksamerBereich(true, 5, 5, auto)).toBe(auto)
    expect(wirksamerBereich(true, 9, 2, auto)).toBe(auto)
  })
})

describe('bereichUngueltig', () => {
  it('meldet nur bei aktiver Fixierung mit kaputten Werten', () => {
    expect(bereichUngueltig(false, NaN, NaN)).toBe(false)
    expect(bereichUngueltig(true, 0, 5)).toBe(false)
    expect(bereichUngueltig(true, NaN, 5)).toBe(true)
    expect(bereichUngueltig(true, 5, 1)).toBe(true)
  })
})
