// Tab-Verschieben zwischen Fenstern: BroadcastChannel-Protokoll (TabTransfer)
// und das Umsortieren in der Leiste (docStore.verschiebeTab).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { erzeugeTabTransfer } from '../services/TabTransfer'

vi.mock('../services/PdfEngine', () => ({
  oeffnePdf: vi.fn(async () => ({
    seitenAnzahl: 3,
    holeSeite: async () => ({ getViewport: () => ({ width: 595, height: 842 }) }),
    ladeSeitenMasse: async (cb) => {
      const s = [1, 2, 3].map(() => ({ breitePt: 595, hoehePt: 842 }))
      cb?.(s)
      return s
    },
    schliesse: async () => {},
  })),
  renderScaleFuer: () => 1,
  RenderingCancelledException: class RenderingCancelledException {},
}))

import { useDocStore } from '../stores/useDocStore'
import { repo } from '../services/PdfRepo'

// Fake-BroadcastChannel: alle Instanzen desselben Namens hören einander —
// aber (wie im Browser) nie sich selbst.
const kanaele = []
class FakeKanal {
  constructor(name) { this.name = name; this.onmessage = null; kanaele.push(this) }
  postMessage(data) {
    for (const k of kanaele) {
      if (k !== this && k.name === this.name) k.onmessage?.({ data })
    }
  }
  close() { kanaele.splice(kanaele.indexOf(this), 1) }
}

describe('TabTransfer', () => {
  it('meldet die Übernahme an ANDERE Fenster, nie an sich selbst', () => {
    kanaele.length = 0
    const a = erzeugeTabTransfer({ kanalKonstruktor: FakeKanal })
    const b = erzeugeTabTransfer({ kanalKonstruktor: FakeKanal })
    const beiA = vi.fn(), beiB = vi.fn()
    a.aufUebernahme(beiA)
    b.aufUebernahme(beiB)
    b.meldeUebernahme('dok-7')
    expect(beiA).toHaveBeenCalledWith('dok-7')
    expect(beiB).not.toHaveBeenCalled()
    a.schliesse(); b.schliesse()
  })

  it('ohne BroadcastChannel wird alles zum No-op statt zu werfen', () => {
    const t = erzeugeTabTransfer({ kanalKonstruktor: null })
    expect(() => t.meldeUebernahme('x')).not.toThrow()
    t.schliesse()
  })
})

let zaehler = 0
async function legeDokAn(name) {
  const id = `mv-dok-${++zaehler}`
  await repo.setBlob(`doc:${id}:file`, new Blob(['%PDF-fake']), { name })
  await repo.set(`doc:${id}:meta`, {
    id, name, schemaVersion: 1, kalibrierung: { standard: null, jeSeite: {} },
  })
  return id
}

beforeEach(() => setActivePinia(createPinia()))

describe('verschiebeTab', () => {
  it('sortiert um und persistiert die neue Reihenfolge', async () => {
    const store = useDocStore()
    const a = await legeDokAn('A'), b = await legeDokAn('B'), c = await legeDokAn('C')
    await store.oeffneDokument(a)
    await store.oeffneDokument(b)
    await store.oeffneDokument(c)
    // A ans Ende (Drop-Index zeigt HINTER den letzten Tab):
    await store.verschiebeTab(a, 3)
    expect(store.tabs.map(t => t.dokId)).toEqual([b, c, a])
    // C an den Anfang:
    await store.verschiebeTab(c, 0)
    expect(store.tabs.map(t => t.dokId)).toEqual([c, b, a])
    const gespeichert = await repo.get('tabs')
    expect(gespeichert.liste.map(t => t.dokId)).toEqual([c, b, a])
  })

  it('unbekannte dokId und identische Position sind harmlos', async () => {
    const store = useDocStore()
    const a = await legeDokAn('A'), b = await legeDokAn('B')
    await store.oeffneDokument(a)
    await store.oeffneDokument(b)
    await store.verschiebeTab('gibt-es-nicht', 0)
    await store.verschiebeTab(a, 0)
    expect(store.tabs.map(t => t.dokId)).toEqual([a, b])
  })
})
