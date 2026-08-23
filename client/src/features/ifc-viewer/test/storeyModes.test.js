// Ebenen-Modi (Sprint U, AP-U5): welche Ebene ist in welchem Modus sichtbar,
// und welche Schaltvorgänge sind dafür überhaupt nötig.

import { describe, expect, it } from 'vitest'
import { sichtbarkeitFuerModus, aenderungen, storeyKey, STOREY_MODES } from '../services/StoreyModes'

// absichtlich unsortiert übergeben — die Funktion muss selbst nach Höhe ordnen
const EBENEN = [
  { modelId: 'm1', localId: 30, name: '2. OG', elevation: 6.5 },
  { modelId: 'm1', localId: 10, name: 'UG',    elevation: -3.0 },
  { modelId: 'm1', localId: 20, name: 'EG',    elevation: 0.0 },
]
const K = (id) => `m1:${id}`

describe('sichtbarkeitFuerModus', () => {
  it('alle: jede Ebene sichtbar', () => {
    const v = sichtbarkeitFuerModus(EBENEN, { modelId: 'm1', localId: 20 }, 'alle')
    expect([...v.values()].every(Boolean)).toBe(true)
    expect(v.size).toBe(3)
  })

  it('solo: nur die gewählte Ebene', () => {
    const v = sichtbarkeitFuerModus(EBENEN, { modelId: 'm1', localId: 20 }, 'solo')
    expect(v.get(K(20))).toBe(true)
    expect(v.get(K(10))).toBe(false)
    expect(v.get(K(30))).toBe(false)
  })

  it('bis: alles bis einschließlich der gewählten Höhe (von unten)', () => {
    const v = sichtbarkeitFuerModus(EBENEN, { modelId: 'm1', localId: 20 }, 'bis')
    expect(v.get(K(10))).toBe(true)   // UG liegt tiefer
    expect(v.get(K(20))).toBe(true)   // EG = gewählt
    expect(v.get(K(30))).toBe(false)  // 2. OG liegt höher
  })

  it('bis auf der untersten Ebene zeigt nur diese', () => {
    const v = sichtbarkeitFuerModus(EBENEN, { modelId: 'm1', localId: 10 }, 'bis')
    expect([...v.entries()].filter(([, s]) => s).map(([k]) => k)).toEqual([K(10)])
  })

  it('ohne gewählte Ebene fallen solo/bis auf „alle" zurück', () => {
    for (const m of ['solo', 'bis']) {
      const v = sichtbarkeitFuerModus(EBENEN, null, m)
      expect([...v.values()].every(Boolean)).toBe(true)
    }
  })

  it('unterscheidet Ebenen verschiedener Modelle', () => {
    const zwei = [...EBENEN, { modelId: 'm2', localId: 20, name: 'EG (Modell 2)', elevation: 0.0 }]
    const v = sichtbarkeitFuerModus(zwei, { modelId: 'm1', localId: 20 }, 'solo')
    expect(v.get('m1:20')).toBe(true)
    expect(v.get('m2:20')).toBe(false)   // gleiche localId, anderes Modell
  })

  it('gleiche Höhe wie die gewählte Ebene bleibt bei „bis" sichtbar', () => {
    const gleich = [...EBENEN, { modelId: 'm1', localId: 21, name: 'EG Zwischen', elevation: 0.0 }]
    const v = sichtbarkeitFuerModus(gleich, { modelId: 'm1', localId: 20 }, 'bis')
    expect(v.get(K(21))).toBe(true)
  })

  it('leere Eingabe ist unkritisch', () => {
    expect(sichtbarkeitFuerModus([], null, 'solo').size).toBe(0)
    expect(sichtbarkeitFuerModus(null, null, 'alle').size).toBe(0)
  })
})

describe('aenderungen', () => {
  it('meldet nur echte Umschaltungen', () => {
    const ziel = sichtbarkeitFuerModus(EBENEN, { modelId: 'm1', localId: 20 }, 'solo')
    // UG bereits versteckt → nur 2. OG muss noch ausgeblendet werden
    const diff = aenderungen(ziel, new Set([K(10)]))
    expect(diff).toEqual([{ key: K(30), visible: false }])
  })

  it('nichts zu tun, wenn der Zustand schon passt', () => {
    const ziel = sichtbarkeitFuerModus(EBENEN, null, 'alle')
    expect(aenderungen(ziel, new Set())).toEqual([])
  })

  it('blendet wieder ein, wenn der Modus es verlangt', () => {
    const ziel = sichtbarkeitFuerModus(EBENEN, null, 'alle')
    const diff = aenderungen(ziel, new Set([K(10), K(30)]))
    expect(diff.map(d => d.key).sort()).toEqual([K(10), K(30)].sort())
    expect(diff.every(d => d.visible)).toBe(true)
  })
})

describe('storeyKey', () => {
  it('bindet die Modell-ID ein', () => {
    expect(storeyKey({ modelId: 'm1', localId: 7 })).toBe('m1:7')
    expect(STOREY_MODES).toEqual(['alle', 'solo', 'bis'])
  })
})
