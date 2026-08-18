/**
 * Die Materialbibliothek der Belagskarte.
 *
 * Sie gehört zum FALL, nicht zur Sitzung: eine Kennung im Raster ist
 * wertlos, wenn niemand weiß, welche Rauheit sie meint. Und genau daraus
 * folgt der Fehler, den diese Tests festhalten — eine gemalte Kennung
 * OHNE Material ist ein stummes Loch.
 */
import { describe, expect, it } from 'vitest'

import {
  anteilVon, freieKennung, kennungZaehlen, manningVon, verwaisteKennungen,
} from '../utils/belag'

describe('Manning aus k_s', () => {
  it('trifft die Tabellenwerte', () => {
    // Strickler: n = k_s^(1/6)/26. Die Brücke zur 2D-Welt muss stimmen,
    // sonst führt sie in die Irre — gegengeprüft an den üblichen Angaben.
    expect(manningVon(0.002)).toBeCloseTo(0.0136, 3)   // Beton ~0,014
    expect(manningVon(0.03)).toBeCloseTo(0.0214, 3)    // Erde ~0,021
    expect(manningVon(0.1)).toBeCloseTo(0.0264, 3)     // Steine ~0,026
  })

  it('gibt nichts zurück, wo es nichts zu rechnen gibt', () => {
    expect(manningVon(0)).toBeNull()
    expect(manningVon(-1)).toBeNull()
  })
})

describe('Flächenanteile', () => {
  //  4 x „ohne", 4 x Kennung 1, 2 x Kennung 2
  const ids = Int16Array.from([0, 0, 0, 0, 1, 1, 1, 1, 2, 2])

  it('zählt jede Kennung, auch die 0', () => {
    const z = kennungZaehlen(ids)
    expect(z.get(0)).toBe(4)
    expect(z.get(1)).toBe(4)
    expect(z.get(2)).toBe(2)
  })

  it('rechnet den Anteil an der Gesamtfläche', () => {
    const z = kennungZaehlen(ids)
    expect(anteilVon(z, 1, ids.length)).toBeCloseTo(0.4, 6)
    expect(anteilVon(z, 0, ids.length)).toBeCloseTo(0.4, 6)
    // eine Kennung, die nirgends liegt
    expect(anteilVon(z, 9, ids.length)).toBe(0)
    expect(anteilVon(z, 1, 0)).toBe(0)
  })

  it('kommt ohne Raster klar', () => {
    expect(kennungZaehlen(null).size).toBe(0)
  })
})

describe('Verwaiste Kennungen', () => {
  it('findet Gemaltes ohne Material', () => {
    // Kennung 7 ist gemalt, steht aber in keiner Liste — der Fallaufbau
    // baut dafür keinen Patch, und die Fläche behielte STILL das
    // Grundmaterial des Geländes.
    const z = kennungZaehlen(Int16Array.from([0, 1, 7, 7, 9]))
    expect(verwaisteKennungen(z, [{ id: 1 }])).toEqual([7, 9])
  })

  it('zählt „ohne Belag" nicht als verwaist', () => {
    const z = kennungZaehlen(Int16Array.from([0, 0, 1]))
    expect(verwaisteKennungen(z, [{ id: 1 }])).toEqual([])
  })

  it('ist still, wenn alles zugeordnet ist', () => {
    const z = kennungZaehlen(Int16Array.from([1, 2, 2]))
    expect(verwaisteKennungen(z, [{ id: 1 }, { id: 2 }])).toEqual([])
  })
})

describe('Freie Kennung', () => {
  it('füllt Lücken auf, statt hochzuzählen', () => {
    // Nach dem Löschen von 2 soll die 2 wieder vergeben werden — sonst
    // wandern die Kennungen bei jedem Anlegen/Löschen nach oben und
    // stoßen an die Grenze von 99 (casespec.Belag).
    expect(freieKennung([{ id: 1 }, { id: 3 }])).toBe(2)
    expect(freieKennung([])).toBe(1)
    expect(freieKennung(null)).toBe(1)
  })

  it('sagt Nein, wenn alle 99 vergeben sind', () => {
    const voll = Array.from({ length: 99 }, (_, i) => ({ id: i + 1 }))
    expect(freieKennung(voll)).toBeNull()
  })
})
