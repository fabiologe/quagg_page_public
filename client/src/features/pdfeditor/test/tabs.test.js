// Tab-Verwaltung (Browser-Muster): öffnen dedupliziert, Wechsel merkt die
// Ansicht, Schließen aktiviert den Nachbarn, Tabs überleben den Reload.
// pdf.js ist gemockt — hier geht es um die Tab-Logik, nicht ums Rendern.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

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
import { repo } from '../services/PdfRepo'

let zaehler = 0

async function legeDokAn(name) {
  const id = `tab-dok-${++zaehler}`
  await repo.setBlob(`doc:${id}:file`, new Blob(['%PDF-fake']), { name })
  await repo.set(`doc:${id}:meta`, {
    id, name, schemaVersion: 1, kalibrierung: { standard: null, jeSeite: {} },
  })
  return id
}

beforeEach(() => setActivePinia(createPinia()))

describe('Tabs', () => {
  it('jedes geöffnete Dokument bekommt einen Tab; erneutes Öffnen dedupliziert', async () => {
    const store = useDocStore()
    const a = await legeDokAn('Plan A')
    const b = await legeDokAn('Plan B')
    await store.oeffneDokument(a)
    await store.oeffneDokument(b)
    expect(store.tabs.map(t => t.dokId)).toEqual([a, b])
    expect(store.dokId).toBe(b)
    await store.oeffneDokument(a)
    expect(store.tabs).toHaveLength(2)   // kein Duplikat
    expect(store.dokId).toBe(a)
  })

  it('wechsleTab merkt Zoom + oberste Seite und stellt sie beim Rückwechsel bereit', async () => {
    const store = useDocStore()
    const viewStore = useViewStore()
    const a = await legeDokAn('A')
    const b = await legeDokAn('B')
    await store.oeffneDokument(a)
    viewStore.setzeZoom(2.5)
    viewStore.sichtbareSeiten = { von: 2, bis: 2 }
    await store.wechsleTab(b)
    expect(store.tabs.find(t => t.dokId === a).ansicht).toEqual({ zoom: 2.5, seite: 2 })
    await store.wechsleTab(a)
    expect(store.gewuenschteAnsicht).toEqual({ zoom: 2.5, seite: 2 })
  })

  it('schliesseTab des aktiven Tabs aktiviert den rechten Nachbarn, sonst den linken', async () => {
    const store = useDocStore()
    const a = await legeDokAn('A')
    const b = await legeDokAn('B')
    const c = await legeDokAn('C')
    await store.oeffneDokument(a)
    await store.oeffneDokument(b)
    await store.oeffneDokument(c)
    await store.wechsleTab(b)
    await store.schliesseTab(b)          // Mitte zu → rechter Nachbar c
    expect(store.dokId).toBe(c)
    await store.schliesseTab(c)          // Letzter rechts zu → linker Nachbar a
    expect(store.dokId).toBe(a)
  })

  it('letzter Tab zu → Startseite (Status leer)', async () => {
    const store = useDocStore()
    const a = await legeDokAn('A')
    await store.oeffneDokument(a)
    await store.schliesseTab(a)
    expect(store.tabs).toHaveLength(0)
    expect(store.ladeStatus).toBe('leer')
  })

  it('zeigeStartseite entlädt, behält aber alle Tabs', async () => {
    const store = useDocStore()
    const a = await legeDokAn('A')
    await store.oeffneDokument(a)
    await store.zeigeStartseite()
    expect(store.ladeStatus).toBe('leer')
    expect(store.tabs).toHaveLength(1)
  })

  it('Tabs überleben den Reload; Tabs gelöschter Dokumente fallen weg', async () => {
    const store = useDocStore()
    const a = await legeDokAn('A')
    const b = await legeDokAn('B')
    await store.oeffneDokument(a)
    await store.oeffneDokument(b)

    // „Reload": frische Pinia, Index + Tabs neu laden
    setActivePinia(createPinia())
    const neu = useDocStore()
    // Index nachbauen (ladeTabs filtert gegen den Index)
    neu.dokIndex = [{ id: a, name: 'A' }, { id: b, name: 'B' }]
    const aktiv = await neu.ladeTabs()
    expect(neu.tabs.map(t => t.dokId)).toEqual([a, b])
    expect(aktiv).toBe(b)

    // Dokument a verschwindet aus dem Index → sein Tab fällt beim Laden weg
    setActivePinia(createPinia())
    const dritte = useDocStore()
    dritte.dokIndex = [{ id: b, name: 'B' }]
    await dritte.ladeTabs()
    expect(dritte.tabs.map(t => t.dokId)).toEqual([b])
  })

  it('loescheDokument räumt auch den Tab ab', async () => {
    const store = useDocStore()
    const a = await legeDokAn('A')
    await store.oeffneDokument(a)
    await store.loescheDokument(a)
    expect(store.tabs).toHaveLength(0)
  })
})
