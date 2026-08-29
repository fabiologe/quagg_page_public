// Stufe 16: reine Regeln des Bildimports — Zielformat, Verkleinerung,
// Startmaße beim Platzieren, Picker für Datei/Zwischenablage/Drop, Hash.

import { describe, expect, it } from 'vitest'
import {
  zielFormat, zielMasse, platzierMasse, bildAusDateien, bildAusZwischenablage,
  bildAusDrop, bildKeyAus, MAX_KANTE_PX, MIN_BREITE_PT, START_ANTEIL,
} from '../services/BildImport'
import { TAB_DRAG_TYP } from '../services/TabTransfer'

describe('zielFormat', () => {
  it('PNG-Familie bleibt PNG (Screenshots, Alpha), alles andere wird JPEG', () => {
    for (const m of ['image/png', 'image/gif', 'image/bmp', 'image/svg+xml', 'IMAGE/PNG']) {
      expect(zielFormat(m)).toBe('image/png')
    }
    for (const m of ['image/jpeg', 'image/webp', 'image/heic', 'image/avif', '', undefined]) {
      expect(zielFormat(m)).toBe('image/jpeg')
    }
  })
})

describe('zielMasse', () => {
  it('kleine Bilder bleiben unverändert', () => {
    expect(zielMasse(800, 600)).toEqual({ breite: 800, hoehe: 600, faktor: 1 })
    expect(zielMasse(MAX_KANTE_PX, 100).faktor).toBe(1)
  })
  it('lange Kante wird auf 2000 gedeckelt, proportional gerundet', () => {
    expect(zielMasse(4000, 3000)).toMatchObject({ breite: 2000, hoehe: 1500 })
    expect(zielMasse(1000, 3000)).toMatchObject({ breite: 667, hoehe: 2000 })
  })
  it('nie unter 1 px', () => {
    expect(zielMasse(1, 100000).breite).toBe(1)
  })
})

describe('platzierMasse', () => {
  const A4 = [595, 842]
  it('40 % der Seitenbreite bei großen Bildern, Verhältnis bleibt', () => {
    const { w, h } = platzierMasse(3000, 2000, ...A4)
    expect(w).toBeCloseTo(595 * START_ANTEIL)
    expect(h / w).toBeCloseTo(2000 / 3000)
  })
  it('kleine Bilder werden nicht aufgeblasen (96 dpi → pt)', () => {
    const { w } = platzierMasse(200, 100, ...A4)
    expect(w).toBeCloseTo(200 * 0.75)
  })
  it('winzige Bilder bekommen die Mindestbreite', () => {
    expect(platzierMasse(1, 1, ...A4).w).toBe(MIN_BREITE_PT)
  })
  it('Hochkant-Bilder werden über die Höhe gedeckelt', () => {
    const { w, h } = platzierMasse(1000, 3000, ...A4)
    expect(h).toBeCloseTo(842 * START_ANTEIL)
    expect(w).toBeCloseTo(h / 3)
  })
})

describe('Picker', () => {
  const png = { type: 'image/png', name: 'a.png' }
  const txt = { type: 'text/plain', name: 'a.txt' }
  const pdf = { type: 'application/pdf', name: 'a.pdf' }

  it('bildAusDateien nimmt die erste Bilddatei, ignoriert den Rest', () => {
    expect(bildAusDateien([txt, pdf, png])).toBe(png)
    expect(bildAusDateien([txt, pdf])).toBeNull()
    expect(bildAusDateien(undefined)).toBeNull()
  })
  it('bildAusZwischenablage liest kind=file + image/*', () => {
    const datei = { type: 'image/png' }
    const cd = { items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => datei },
    ] }
    expect(bildAusZwischenablage(cd)).toBe(datei)
    expect(bildAusZwischenablage({ items: [{ kind: 'string', type: 'text/plain' }] })).toBeNull()
    expect(bildAusZwischenablage(null)).toBeNull()
  })
  it('bildAusDrop: Tab-Drags sind nie ein Bild, sonst wie Dateien', () => {
    expect(bildAusDrop({ types: [TAB_DRAG_TYP, 'Files'], files: [png] })).toBeNull()
    expect(bildAusDrop({ types: ['Files'], files: [pdf, png] })).toBe(png)
    expect(bildAusDrop({ types: ['Files'], files: [pdf] })).toBeNull()
  })
})

describe('bildKeyAus', () => {
  it('deterministisch, 32 Hex-Zeichen, verschieden für verschiedene Bytes', async () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const k1 = await bildKeyAus(a)
    const k2 = await bildKeyAus(new Uint8Array([1, 2, 3, 4]))
    const k3 = await bildKeyAus(new Uint8Array([1, 2, 3, 5]))
    expect(k1).toMatch(/^[0-9a-f]{32}$/)
    expect(k1).toBe(k2)
    expect(k3).not.toBe(k1)
  })
})
