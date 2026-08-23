// Stufe 11: RenderProfil (Schwere-Messung) und SeitenBitmapCache (LRU).

import { beforeEach, describe, expect, it } from 'vitest'
import {
  merkeRenderZeit, istSchwer, renderZeitVon, vergiss, SCHWER_MS, _leereAlles as leereProfil,
} from '../services/RenderProfil'
import {
  lege, hole, skalaPasst, verwirfDokument, PIXEL_BUDGET,
  _statistik, _leereAlles as leereCache,
} from '../services/SeitenBitmapCache'

function fakeBitmap(width, height) {
  const b = { width, height, geschlossen: false, close() { this.geschlossen = true } }
  return b
}

beforeEach(() => { leereProfil(); leereCache() })

describe('RenderProfil', () => {
  it('Seiten über der Schwelle gelten als schwer, Vorschau-Pässe kalibrieren nicht', () => {
    merkeRenderZeit('dok', 0, SCHWER_MS + 100, 2)
    merkeRenderZeit('dok', 1, 50, 2)
    expect(istSchwer('dok', 0)).toBe(true)
    expect(istSchwer('dok', 1)).toBe(false)
    // Vorschau-Pass (vollerPass=false) überschreibt die Messung NICHT
    merkeRenderZeit('dok', 0, 30, 0.8, false)
    expect(istSchwer('dok', 0)).toBe(true)
    expect(renderZeitVon('dok', 0)).toBe(SCHWER_MS + 100)
  })

  it('vergiss löscht nur das eine Dokument', () => {
    merkeRenderZeit('a', 0, 900, 2)
    merkeRenderZeit('b', 0, 900, 2)
    vergiss('a')
    expect(istSchwer('a', 0)).toBe(false)
    expect(istSchwer('b', 0)).toBe(true)
  })
})

describe('SeitenBitmapCache', () => {
  it('roundtrippt und erneuert die LRU-Position beim Treffer', () => {
    const bm = fakeBitmap(1000, 1000)
    expect(lege('dok', 3, bm, 2, 800)).toBe(true)
    const treffer = hole('dok', 3)
    expect(treffer.bitmap).toBe(bm)
    expect(treffer.skala).toBe(2)
    expect(hole('dok', 4)).toBeNull()
  })

  it('verdrängt LRU-ältestes bei Budgetüberschreitung und schließt Bitmaps', () => {
    const a = fakeBitmap(4000, 3000)   // 12 Mio px
    const b = fakeBitmap(4000, 2500)   // 10 Mio px
    const c = fakeBitmap(3000, 2000)   //  6 Mio px → a muss weichen
    lege('dok', 0, a, 2, 800)
    lege('dok', 1, b, 2, 800)
    hole('dok', 0)                     // a frisch anfassen → b ist LRU-ältest
    lege('dok', 2, c, 2, 800)
    expect(b.geschlossen).toBe(true)
    expect(a.geschlossen).toBe(false)
    expect(hole('dok', 1)).toBeNull()
    expect(_statistik().pixel).toBeLessThanOrEqual(PIXEL_BUDGET)
  })

  it('Einzel-Bitmap über dem Budget wird abgelehnt und geschlossen', () => {
    const riese = fakeBitmap(6000, 5000)   // 30 Mio px > Budget
    expect(lege('dok', 0, riese, 2, 800)).toBe(false)
    expect(riese.geschlossen).toBe(true)
  })

  it('erneutes lege ersetzt und schließt das alte Bitmap derselben Seite', () => {
    const alt = fakeBitmap(1000, 1000)
    const neu = fakeBitmap(1000, 1000)
    lege('dok', 0, alt, 2, 800)
    lege('dok', 0, neu, 3, 800)
    expect(alt.geschlossen).toBe(true)
    expect(hole('dok', 0).bitmap).toBe(neu)
  })

  it('skalaPasst mit ±15 % Toleranz', () => {
    const e = { skala: 2 }
    expect(skalaPasst(e, 2.2)).toBe(true)    // 10 % daneben
    expect(skalaPasst(e, 2.5)).toBe(false)   // 20 % daneben
    expect(skalaPasst(null, 2)).toBe(false)
  })

  it('verwirfDokument räumt nur das eine Dokument und schließt', () => {
    const a = fakeBitmap(100, 100)
    const b = fakeBitmap(100, 100)
    lege('dokA', 0, a, 2, 800)
    lege('dokB', 0, b, 2, 800)
    verwirfDokument('dokA')
    expect(a.geschlossen).toBe(true)
    expect(hole('dokA', 0)).toBeNull()
    expect(hole('dokB', 0)?.bitmap).toBe(b)
  })
})
