// Stufe 16: BildCache — LRU mit Pixel-Budget, close() beim Verdrängen,
// gebündeltes Laden (ladeEinmal) und gemerkte Fehlschläge.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hole, lege, ladeEinmal, verwirfDokument, _statistik, _leereAlles, PIXEL_BUDGET,
} from '../services/BildCache'

function fakeBitmap(w, h) {
  return { width: w, height: h, close: vi.fn() }
}

beforeEach(_leereAlles)

describe('BildCache', () => {
  it('lege/hole; Treffer erneuert die LRU-Position', () => {
    const a = fakeBitmap(1000, 1000), b = fakeBitmap(1000, 1000)   // je 1 Mio px
    lege('d', 'a', a)
    lege('d', 'b', b)
    expect(hole('d', 'a')).toBe(a)      // a nach vorn
    // 23 Mio px passen nur, wenn EIN Bitmap weicht — das älteste ist jetzt b
    lege('d', 'gross', fakeBitmap(4000, 5750))
    expect(b.close).toHaveBeenCalled()
    expect(hole('d', 'b')).toBeNull()
    expect(hole('d', 'a')).toBe(a)
  })

  it('zu große Bitmaps werden abgelehnt und geschlossen', () => {
    const riese = fakeBitmap(6000, 6000)
    expect(lege('d', 'r', riese)).toBe(false)
    expect(riese.close).toHaveBeenCalled()
    expect(_statistik().eintraege).toBe(0)
    expect(PIXEL_BUDGET).toBe(24e6)
  })

  it('verwirfDokument räumt nur das eigene Präfix ab', () => {
    const a = fakeBitmap(1, 1), x = fakeBitmap(1, 1)
    lege('dok1', 'a', a)
    lege('dok2', 'x', x)
    verwirfDokument('dok1')
    expect(a.close).toHaveBeenCalled()
    expect(hole('dok1', 'a')).toBeNull()
    expect(hole('dok2', 'x')).toBe(x)
  })

  it('ladeEinmal ruft den Lader bei parallelen Anfragen genau einmal', async () => {
    const bm = fakeBitmap(2, 2)
    const lader = vi.fn(() => new Promise(r => setTimeout(() => r(bm), 5)))
    const [r1, r2, r3] = await Promise.all([
      ladeEinmal('d', 'k', lader), ladeEinmal('d', 'k', lader), ladeEinmal('d', 'k', lader),
    ])
    expect(lader).toHaveBeenCalledTimes(1)
    expect(r1).toBe(bm); expect(r2).toBe(bm); expect(r3).toBe(bm)
    expect(hole('d', 'k')).toBe(bm)
    // danach: sofort aus dem Cache, kein zweiter Ladevorgang
    await ladeEinmal('d', 'k', lader)
    expect(lader).toHaveBeenCalledTimes(1)
  })

  it('Fehlschlag wird gemerkt — kein Dauerfeuer, bis ein Import ihn aufhebt', async () => {
    const lader = vi.fn(async () => { throw new Error('kaputt') })
    expect(await ladeEinmal('d', 'k', lader)).toBeNull()
    expect(await ladeEinmal('d', 'k', lader)).toBeNull()
    expect(lader).toHaveBeenCalledTimes(1)
    const nullLader = vi.fn(async () => null)
    expect(await ladeEinmal('d', 'n', nullLader)).toBeNull()
    expect(await ladeEinmal('d', 'n', nullLader)).toBeNull()
    expect(nullLader).toHaveBeenCalledTimes(1)
    // Frischer Import hebt den Fehlschlag auf
    lege('d', 'k', fakeBitmap(1, 1))
    expect(_statistik().fehlgeschlagen).toBe(1)   // nur 'n' bleibt
  })
})
