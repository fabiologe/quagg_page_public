// Persistenz über einen Neustart hinweg: Was der DocStore in die IndexedDB
// schreibt, muss ein frischer Store (wie nach einem Neuladen) wieder lesen.
// Anlass: reaktive Vue-Proxies sind NICHT strukturiert klonbar; PdfRepo.set
// schluckte den DataCloneError still — Dokumentliste, Kalibrierung und die
// gemerkte Tab-Ansicht gingen beim Neuladen verloren.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Node 20 kennt kein globales `navigator` (importiereDatei fragt persist an).
if (typeof globalThis.navigator === 'undefined') vi.stubGlobal('navigator', {})

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
import { useViewStore } from '../stores/useViewStore'

const pdf = (name) => new File([new Blob(['%PDF-1.7\n%Persistenz\n'])], name, { type: 'application/pdf' })

/** Frischer Pinia-Stand = das, was nach einem Neuladen übrig bleibt. */
function neuladen() {
  setActivePinia(createPinia())
  return useDocStore()
}

beforeEach(() => setActivePinia(createPinia()))

describe('Persistenz über einen Neustart', () => {
  it('die Dokumentliste („Zuletzt geöffnet") überlebt das Neuladen', async () => {
    const store = useDocStore()
    const id = await store.importiereDatei(pdf('Liste.pdf'))
    expect(id).toBeTruthy()

    const frisch = neuladen()
    await frisch.ladeIndex()
    expect(frisch.dokIndex.map(d => d.id)).toContain(id)
  })

  it('die Kalibrierung überlebt das Neuladen (Schreibweg wie im CalibrateDialog)', async () => {
    const store = useDocStore()
    const id = await store.importiereDatei(pdf('Kalibriert.pdf'))
    // Genau so schreibt CalibrateDialog.uebernehme(): über den reaktiven Store.
    const kal = store.meta.kalibrierung ?? { standard: null, jeSeite: {} }
    kal.standard = { realProPt: 0.035, einheit: 'm' }
    kal.jeSeite = { ...kal.jeSeite, 1: { realProPt: 0.07, einheit: 'm' } }
    store.meta.kalibrierung = { ...kal }
    await store.speichereMeta()

    const frisch = neuladen()
    await frisch.oeffneDokument(id)
    expect(frisch.meta.kalibrierung.standard?.realProPt).toBe(0.035)
    expect(frisch.meta.kalibrierung.jeSeite?.[1]?.realProPt).toBe(0.07)
  })

  it('die gemerkte Tab-Ansicht (Zoom, Seite, Drehung) überlebt das Neuladen', async () => {
    const store = useDocStore()
    const viewStore = useViewStore()
    const a = await store.importiereDatei(pdf('Ansicht-A.pdf'))
    const b = await store.importiereDatei(pdf('Ansicht-B.pdf'))
    await store.wechsleTab(a)
    viewStore.setzeZoom(2.5)
    viewStore.setzeDrehung(90)
    await store.wechsleTab(b)   // merkt die Ansicht von A und speichert die Tabs

    const frisch = neuladen()
    await frisch.ladeIndex()
    await frisch.ladeTabs()
    const tabA = frisch.tabs.find(t => t.dokId === a)
    expect(tabA).toBeTruthy()
    expect(tabA.ansicht).toMatchObject({ zoom: 2.5, drehung: 90 })
  })
})
