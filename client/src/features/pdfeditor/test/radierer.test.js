// Punkt-Radierer (Stufe 9): Strich-Zerteilung am Radierkreis und der
// Radier-Zug als EIN Undo-Schritt trotz Ersetzen (Original raus, Teile rein).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { zerteileStrich } from '../services/InkGeometry'
import { useAnnotStore } from '../stores/useAnnotStore'

// ── Geometrie ────────────────────────────────────────────────────────────────

describe('zerteileStrich', () => {
  const gerade = [[0, 0, 0.5], [10, 0, 0.5], [20, 0, 0.5], [30, 0, 0.5], [40, 0, 0.5]]

  it('schneidet die Mitte heraus und setzt Randpunkte auf den Kreis', () => {
    const teile = zerteileStrich(gerade, 20, 0, 5)
    expect(teile).toHaveLength(2)
    const [links, rechts] = teile
    expect(links[links.length - 1][0]).toBeCloseTo(15)   // Eintritt bei x=15
    expect(rechts[0][0]).toBeCloseTo(25)                 // Austritt bei x=25
    expect(links[0][0]).toBe(0)
    expect(rechts[rechts.length - 1][0]).toBe(40)
  })

  it('zerteilt auch MITTEN in einem langen Segment (schneller Strich)', () => {
    const schnell = [[0, 0, 0.5], [100, 0, 0.9]]
    const teile = zerteileStrich(schnell, 50, 0, 8)
    expect(teile).toHaveLength(2)
    expect(teile[0][1][0]).toBeCloseTo(42)
    expect(teile[1][0][0]).toBeCloseTo(58)
    // Druck wird an der Schnittstelle interpoliert
    expect(teile[0][1][2]).toBeCloseTo(0.5 + 0.4 * 0.42, 2)
  })

  it('Radieren am Ende kürzt den Strich statt ihn zu teilen', () => {
    const teile = zerteileStrich(gerade, 40, 0, 8)
    expect(teile).toHaveLength(1)
    expect(teile[0][teile[0].length - 1][0]).toBeCloseTo(32)
  })

  it('alles im Kreis → nichts überlebt', () => {
    expect(zerteileStrich(gerade, 20, 0, 100)).toEqual([])
  })

  it('unberührter Strich bleibt EIN identisch langes Teilstück', () => {
    const teile = zerteileStrich(gerade, 20, 50, 5)
    expect(teile).toHaveLength(1)
    expect(teile[0]).toHaveLength(gerade.length)
  })

  it('winzige Splitter unter der Mindestlänge fallen weg', () => {
    // Kreis endet 0,3 pt vor dem Strichende → Rest-Splitter zu kurz
    const teile = zerteileStrich([[0, 0, 0.5], [10, 0, 0.5]], 9.7, 0, 9.4)
    expect(teile).toHaveLength(0)
  })

  it('Einzelpunkt (Tipp) wird ganz gelöscht oder ganz behalten', () => {
    expect(zerteileStrich([[5, 5, 0.5]], 5, 5, 2)).toEqual([])
    expect(zerteileStrich([[5, 5, 0.5]], 50, 50, 2)).toHaveLength(1)
  })
})

// ── Radier-Zug mit Ersetzen ─────────────────────────────────────────────────

let dokZaehler = 100

function strichDaten(extra = {}) {
  return {
    type: 'ink', page: 0, tool: 'stift', stiftArt: 'kugelschreiber',
    farbe: '#111827', breitePt: 1.6, deckkraft: 1, echterDruck: true,
    points: [[0, 0, 0.5], [20, 0, 0.5], [40, 0, 0.5]],
    ...extra,
  }
}

beforeEach(() => setActivePinia(createPinia()))

async function frischerStore() {
  const store = useAnnotStore()
  await store.laden(`radierer-dok-${++dokZaehler}`)
  return store
}

describe('ersetzeBeimRadieren', () => {
  it('EIN Undo stellt das Original wieder her und entfernt die Fragmente', async () => {
    const store = await frischerStore()
    const original = store.fuegeHinzu(strichDaten())
    store.starteRadieren()
    store.ersetzeBeimRadieren(original, [
      strichDaten({ points: [[0, 0, 0.5], [15, 0, 0.5]] }),
      strichDaten({ points: [[25, 0, 0.5], [40, 0, 0.5]] }),
    ])
    store.beendeRadieren()
    expect(store.items).toHaveLength(2)
    expect(store.items.every(a => a.id !== original.id)).toBe(true)

    store.undo()
    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(original.id)
    expect(store.items[0].points).toEqual(original.points)

    store.redo()
    expect(store.items).toHaveLength(2)
  })

  it('ein im selben Zug weiter zerteiltes Fragment taucht im Kommando nicht auf', async () => {
    const store = await frischerStore()
    const original = store.fuegeHinzu(strichDaten())
    store.starteRadieren()
    store.ersetzeBeimRadieren(original, [strichDaten({ points: [[0, 0, 0.5], [30, 0, 0.5]] })])
    const fragment = store.items.find(a => a.id !== original.id)
    // dasselbe Fragment wird gleich nochmal zerteilt:
    store.ersetzeBeimRadieren(fragment, [
      strichDaten({ points: [[0, 0, 0.5], [10, 0, 0.5]] }),
      strichDaten({ points: [[20, 0, 0.5], [30, 0, 0.5]] }),
    ])
    store.beendeRadieren()
    expect(store.items).toHaveLength(2)

    store.undo()
    // NUR das Ur-Original kommt zurück — das Zwischenfragment war nie Teil des Kommandos.
    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(original.id)
  })

  it('komplett wegradierte Fragmente hinterlassen ein reines remove-Kommando', async () => {
    const store = await frischerStore()
    const a = store.fuegeHinzu(strichDaten())
    store.starteRadieren()
    store.ersetzeBeimRadieren(a, [strichDaten({ points: [[0, 0, 0.5], [10, 0, 0.5]] })])
    const fragment = store.items[0]
    store.radiere([fragment.id])   // Fragment ganz weg
    store.beendeRadieren()
    expect(store.items).toHaveLength(0)
    store.undo()
    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(a.id)
  })

  it('Fragmente erben z-Ordnung und Stil des Originals', async () => {
    const store = await frischerStore()
    const original = store.fuegeHinzu(strichDaten({ farbe: '#15803d', stiftArt: 'bleistift' }))
    store.starteRadieren()
    store.ersetzeBeimRadieren(original, [{
      ...strichDaten({ farbe: '#15803d', stiftArt: 'bleistift' }), z: original.z,
    }])
    store.beendeRadieren()
    expect(store.items[0].z).toBe(original.z)
    expect(store.items[0].stiftArt).toBe('bleistift')
    expect(store.items[0].rev).toBe(0)
    expect(store.items[0].id).not.toBe(original.id)
  })
})
