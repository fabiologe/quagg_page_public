// Stufe 11e: PDF-Layer (OCG) — Auslesen der Struktur und Umschalten
// über den DocStore (Revision-Bump, Cache-Invalidierung).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { PdfDokument } from '../services/PdfEngine'

/** Fake der pdf.js OptionalContentConfig-API. */
function fakeOcgConfig() {
  const gruppen = {
    'ocg1': { name: 'Bemaßung', visible: true },
    'ocg2': { name: 'Schraffur', visible: true },
    'ocg3': { name: 'Nordpfeil', visible: false },
  }
  return {
    _gesetzt: [],
    getOrder: () => ['ocg1', { name: 'Gruppe Detail', order: ['ocg2', 'ocg3'] }],
    getGroup: (id) => gruppen[id] ?? null,
    setVisibility(id, sichtbar) { this._gesetzt.push([id, sichtbar]) },
  }
}

function fakePdfjsDoc(ocg) {
  return {
    numPages: 2,
    getOptionalContentConfig: async () => ocg,
    getPage: async () => ({ getViewport: () => ({ width: 595, height: 842 }) }),
    destroy: async () => {},
  }
}

describe('PdfDokument.holeLayer', () => {
  it('ebnet verschachtelte Gruppen zur flachen Liste ein', async () => {
    const dok = new PdfDokument(fakePdfjsDoc(fakeOcgConfig()))
    const layer = await dok.holeLayer()
    expect(layer).toEqual([
      { id: 'ocg1', name: 'Bemaßung', sichtbar: true },
      { id: 'ocg2', name: 'Schraffur', sichtbar: true },
      { id: 'ocg3', name: 'Nordpfeil', sichtbar: false },
    ])
  })

  it('Dokumente ohne Layer liefern eine leere Liste', async () => {
    const dok = new PdfDokument({
      numPages: 1,
      getOptionalContentConfig: async () => null,
      destroy: async () => {},
    })
    expect(await dok.holeLayer()).toEqual([])
  })

  it('setzeLayerSichtbar reicht an die OCG-Config durch', async () => {
    const ocg = fakeOcgConfig()
    const dok = new PdfDokument(fakePdfjsDoc(ocg))
    await dok.holeLayer()
    dok.setzeLayerSichtbar('ocg2', false)
    expect(ocg._gesetzt).toEqual([['ocg2', false]])
  })
})

describe('useDocStore.setzeLayerSichtbar', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('bumpt die Revision und aktualisiert die Layer-Liste', async () => {
    const { useDocStore } = await import('../stores/useDocStore')
    const store = useDocStore()
    const ocg = fakeOcgConfig()
    const dok = new PdfDokument(fakePdfjsDoc(ocg))
    await dok.holeLayer()
    // Zustand direkt setzen — das Öffnen selbst testet tabs.test.js.
    store.pdfDok = dok
    store.dokId = 'layer-dok'
    store.pdfLayer = await dok.holeLayer()

    const revisionVorher = store.layerRevision
    store.setzeLayerSichtbar('ocg1', false)
    expect(store.layerRevision).toBe(revisionVorher + 1)
    expect(store.pdfLayer.find(l => l.id === 'ocg1').sichtbar).toBe(false)
    expect(ocg._gesetzt).toContainEqual(['ocg1', false])
  })
})
