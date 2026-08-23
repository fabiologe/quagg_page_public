// Ansichts-Modi (Sprint P, AP-4): Verfügbarkeit, Weiterschalten, Rückfall.

import { describe, expect, it } from 'vitest'
import {
  ANSICHTS_MODI, normalisiereModus, istVerfuegbar, naechsterModus,
  modusBeschriftung, modusListe,
} from '../services/ViewModes'

const VOLL = { hatModell: true, hatAchsen: true }
const LEER = { hatModell: false, hatAchsen: false }

describe('normalisiereModus', () => {
  it('lässt bekannte Modi durch', () => {
    for (const m of ANSICHTS_MODI) expect(normalisiereModus(m)).toBe(m)
  })

  it('fällt auf 3D zurück — das trägt gespeicherte Ansichten von vor Sprint P', () => {
    for (const wert of [undefined, null, '', 'grundriss', 42, {}]) {
      expect(normalisiereModus(wert)).toBe('3d')
    }
  })
})

describe('istVerfuegbar', () => {
  it('3D geht immer, auch ohne Modell', () => {
    expect(istVerfuegbar('3d', LEER)).toBe(true)
    expect(istVerfuegbar('3d')).toBe(true)
  })

  it('Lageplan braucht ein Modell — sonst wäre er ein weißes Blatt', () => {
    expect(istVerfuegbar('lageplan', LEER)).toBe(false)
    expect(istVerfuegbar('lageplan', { hatModell: true })).toBe(true)
  })

  it('Längsschnitt braucht zusätzlich Haltungsachsen', () => {
    expect(istVerfuegbar('laengsschnitt', { hatModell: true, hatAchsen: false })).toBe(false)
    expect(istVerfuegbar('laengsschnitt', VOLL)).toBe(true)
  })
})

describe('naechsterModus', () => {
  it('schaltet zyklisch durch, wenn alles verfügbar ist', () => {
    expect(naechsterModus('3d', VOLL)).toBe('lageplan')
    expect(naechsterModus('lageplan', VOLL)).toBe('laengsschnitt')
    expect(naechsterModus('laengsschnitt', VOLL)).toBe('3d')
  })

  it('überspringt, was nicht bedienbar ist', () => {
    expect(naechsterModus('3d', { hatModell: true, hatAchsen: false })).toBe('lageplan')
    expect(naechsterModus('lageplan', { hatModell: true, hatAchsen: false })).toBe('3d')
  })

  it('bleibt ohne Modell bei 3D stehen', () => {
    expect(naechsterModus('3d', LEER)).toBe('3d')
  })
})

describe('Beschriftung', () => {
  it('gibt jedem Modus Titel, Taste und Icon', () => {
    for (const m of modusListe()) {
      expect(m.titel).toBeTruthy()
      expect(m.icon).toBeTruthy()
      expect(['1', '2', '3']).toContain(m.taste)
    }
  })

  it('vergibt die Tasten eindeutig', () => {
    const tasten = modusListe().map(m => m.taste)
    expect(new Set(tasten).size).toBe(tasten.length)
  })

  it('beschriftet auch Unsinn, statt undefined zu liefern', () => {
    expect(modusBeschriftung('quatsch').titel).toBe('Modell')
  })
})
