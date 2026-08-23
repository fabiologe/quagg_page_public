// Undo/Redo über den useAnnotStore — inkl. der Voll-Klon-Regel
// (Projektgedächtnis: Teilfeld-Klone erzeugen tote Undo-Klicks).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAnnotStore } from '../stores/useAnnotStore'
import { repo } from '../services/PdfRepo'

let dokZaehler = 0

function strichDaten(extra = {}) {
  return {
    type: 'ink', page: 0, tool: 'stift', farbe: '#111827',
    breitePt: 1.6, deckkraft: 1, echterDruck: true,
    points: [[10, 10, 0.5], [20, 20, 0.7]],
    ...extra,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

async function frischerStore() {
  const store = useAnnotStore()
  await store.laden(`test-dok-${++dokZaehler}`)
  return store
}

describe('Kommandostack — add/remove', () => {
  it('undo nimmt einen Strich zurück, redo bringt ihn wieder', async () => {
    const store = await frischerStore()
    const a = store.fuegeHinzu(strichDaten())
    expect(store.items).toHaveLength(1)
    store.undo()
    expect(store.items).toHaveLength(0)
    store.redo()
    expect(store.items).toHaveLength(1)
    expect(store.items[0].id).toBe(a.id)
    expect(store.items[0].points).toEqual(a.points)
  })

  it('entferne ist undo-bar und stellt alle Felder wieder her', async () => {
    const store = await frischerStore()
    const a = store.fuegeHinzu(strichDaten({ farbe: '#b91c1c' }))
    store.entferne([a.id])
    expect(store.items).toHaveLength(0)
    store.undo()
    expect(store.items[0].farbe).toBe('#b91c1c')
    expect(store.items[0].points).toEqual(a.points)
  })

  it('neue Aktion verwirft die Redo-Zukunft', async () => {
    const store = await frischerStore()
    store.fuegeHinzu(strichDaten())
    store.undo()
    store.fuegeHinzu(strichDaten({ farbe: '#15803d' }))
    expect(store.canRedo).toBe(false)
  })
})

describe('Voll-Klon-Regel bei update', () => {
  it('undo eines Teil-Patches stellt auch NICHT gepatchte Felder wieder her', async () => {
    const store = await frischerStore()
    const a = store.fuegeHinzu(strichDaten())
    // Patch 1: nur Farbe. Patch 2: nur Punkte.
    store.aktualisiere([{ id: a.id, patch: { farbe: '#7c3aed' } }])
    store.aktualisiere([{ id: a.id, patch: { points: [[50, 50, 1]] } }])
    expect(store.items[0].farbe).toBe('#7c3aed')
    expect(store.items[0].points).toEqual([[50, 50, 1]])

    store.undo()   // Punkte zurück
    expect(store.items[0].points).toEqual(a.points)
    expect(store.items[0].farbe).toBe('#7c3aed')   // Farbe bleibt (aus Patch 1)

    store.undo()   // Farbe zurück
    expect(store.items[0].farbe).toBe('#111827')
    expect(store.items[0].points).toEqual(a.points)
  })

  it('Punkte-Patch erhöht rev (Umriss-Cache-Invalidierung)', async () => {
    const store = await frischerStore()
    const a = store.fuegeHinzu(strichDaten())
    store.aktualisiere([{ id: a.id, patch: { points: [[1, 1, 0.5]] } }])
    expect(store.items[0].rev).toBe(1)
    store.aktualisiere([{ id: a.id, patch: { farbe: '#000' } }])
    expect(store.items[0].rev).toBe(1)   // reiner Farb-Patch ändert rev nicht
  })
})

describe('Radierer-Zug als EINE Undo-Einheit', () => {
  it('mehrere radierte Striche kommen mit einem Undo zurück', async () => {
    const store = await frischerStore()
    const a = store.fuegeHinzu(strichDaten())
    const b = store.fuegeHinzu(strichDaten({ farbe: '#1d4ed8' }))
    store.starteRadieren()
    store.radiere([a.id])
    store.radiere([b.id])
    store.beendeRadieren()
    expect(store.items).toHaveLength(0)
    store.undo()
    expect(store.items).toHaveLength(2)
  })

  it('leerer Radierer-Zug erzeugt KEIN Kommando', async () => {
    const store = await frischerStore()
    store.starteRadieren()
    store.beendeRadieren()
    expect(store.canUndo).toBe(false)
  })
})

describe('Persistenz', () => {
  it('schreibt debounced in die Repo und lädt identisch zurück', async () => {
    const store = await frischerStore()
    const dokId = store.geladenFuer
    const a = store.fuegeHinzu(strichDaten())
    await new Promise(r => setTimeout(r, 350))   // > 250 ms Debounce
    const container = await repo.get(`doc:${dokId}:annotations`)
    expect(container.items).toHaveLength(1)
    expect(container.items[0].id).toBe(a.id)

    // Reload in frischem Store
    setActivePinia(createPinia())
    const neu = useAnnotStore()
    await neu.laden(dokId)
    expect(neu.items).toHaveLength(1)
    expect(neu.items[0].points).toEqual(a.points)
  })

  it('Dokumentwechsel leert den Undo-Verlauf', async () => {
    const store = await frischerStore()
    store.fuegeHinzu(strichDaten())
    expect(store.canUndo).toBe(true)
    await store.laden(`test-dok-${++dokZaehler}`)
    expect(store.canUndo).toBe(false)
  })
})
