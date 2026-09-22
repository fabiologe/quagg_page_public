// @vitest-environment jsdom
/**
 * EIN Bearbeitungsverlauf (E3). Der Pinsel hatte einen eigenen,
 * unsichtbaren Stapel: Strg+Z nahm die letzte OBJEKT-Änderung zurück statt
 * den Strich davor, und der Stapel starb bei jedem Phasenwechsel. Jetzt
 * liegen Striche und Spec-Änderungen in derselben Reihenfolge in EINEM
 * Stapel — ein Strich als inverses Patch, weil die Sculpt-Ebene eine
 * DATEI ist und ein Spec-Schnappschuss sie nicht zurückdrehen kann
 * (die Undo-Snapshot-Falle).
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  flood3dApi: {
    sculpt: vi.fn(),
    saveCase: vi.fn(),
    caseGeometry: vi.fn(),
    caseRasters: vi.fn(),
  },
  launchPasswortSichern: vi.fn(),
}))

import { flood3dApi } from '../services/api'
import { usePreStore } from '../stores/usePreStore'

const PATCH = { i0: 2, j0: 3, dz: [[0.5, -0.25]] }

function frischerStore() {
  setActivePinia(createPinia())
  const store = usePreStore()
  store.activeCaseId = 'probe'
  store.spec = { meta: { id: 'probe' }, domain: { extent: [0, 0, 10, 10] },
    terrain: { base: { source: 'g.asc', resolution: 0.5 },
      sculpt: 'sculpt.npz', sculpt_stand: 'abc123', operations: [] },
    structures: [], mesh: { base_cell: 0.5, refinements: [] },
    boundaries: [], solver: {}, evaluation: {} }
  store.dirty = false
  flood3dApi.sculpt.mockReset()
  flood3dApi.saveCase.mockReset()
  flood3dApi.saveCase.mockResolvedValue({
    ok: true, spec: JSON.parse(JSON.stringify(store.spec)), validation: [] })
  flood3dApi.sculpt.mockResolvedValue({
    ok: true, meldungen: [], geaendert: true,
    spec: JSON.parse(JSON.stringify(store.spec)), validation: [] })
  return store
}

describe('Ein Zeitstrahl für Striche und Objektänderungen', () => {
  let store
  beforeEach(() => { store = frischerStore() })

  it('Strg+Z nimmt den Strich zurück — als inverses Patch', async () => {
    store.recordSculpt(PATCH)
    expect(store.canUndo).toBe(true)
    await store.undoEdit()
    expect(flood3dApi.sculpt).toHaveBeenCalledTimes(1)
    const [, patches] = flood3dApi.sculpt.mock.calls[0]
    expect(patches).toEqual([{ i0: 2, j0: 3, dz: [[-0.5, 0.25]] }])
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(true)
  })

  it('Redo schickt das Patch wieder hin', async () => {
    store.recordSculpt(PATCH)
    await store.undoEdit()
    await store.redoEdit()
    const [, patches] = flood3dApi.sculpt.mock.calls[1]
    expect(patches).toEqual([PATCH])
    expect(store.canUndo).toBe(true)
  })

  it('Striche und Objektänderungen kommen in IHRER Reihenfolge zurück', async () => {
    store.recordSculpt(PATCH)                 // 1. ein Strich
    store.recordUndo()                        // 2. eine Objektänderung
    store.spec.structures.push({ id: 'w1', type: 'wall' })

    await store.undoEdit()                    // nimmt die Objektänderung
    expect(store.spec.structures).toEqual([])
    expect(flood3dApi.sculpt).not.toHaveBeenCalled()

    await store.undoEdit()                    // dann erst den Strich
    expect(flood3dApi.sculpt).toHaveBeenCalledTimes(1)
  })

  it('ein Spec-Undo behält den Verweis auf die Sculpt-DATEI', async () => {
    store.recordUndo()
    // der Strich danach ändert den Stempel — ein alter Schnappschuss
    // dürfte ihn nicht zurückschreiben, die Datei dreht nicht mit
    store.spec.terrain.sculpt_stand = 'neu999'
    store.spec.structures.push({ id: 'w1', type: 'wall' })
    await store.undoEdit()
    expect(store.spec.structures).toEqual([])
    expect(store.spec.terrain.sculpt_stand).toBe('neu999')
    expect(store.spec.terrain.sculpt).toBe('sculpt.npz')
  })

  it('der Stapel ist gedeckelt und ein neuer Zweig verwirft Redo', async () => {
    for (let i = 0; i < 120; i++) store.recordSculpt(PATCH)
    expect(store.undoStack.length).toBe(100)
    await store.undoEdit()
    expect(store.canRedo).toBe(true)
    store.recordSculpt(PATCH)
    expect(store.canRedo).toBe(false)
  })

  it('das stille Speichern beim Formen wird gemeldet', async () => {
    store.dirty = true
    flood3dApi.saveCase.mockResolvedValue({ ok: true, validation: [] })
    await store.sculptPatches([PATCH])
    expect(store.meldungen.some((m) => /gespeichert/.test(m.text))).toBe(true)
  })

  it('was der Server zum Strich sagt, steht danach in der Leiste', async () => {
    flood3dApi.sculpt.mockResolvedValue({
      ok: true, geaendert: true, validation: [],
      spec: JSON.parse(JSON.stringify(store.spec)),
      meldungen: ['Gelände geformt: 1 Strich(e). Auf 40 % der bestrichenen '
        + 'Fläche bleibt er ohne Wirkung: dort gelten die Sollhöhen von '
        + '„planum".'] })
    await store.sculptPatches([PATCH])
    expect(store.meldungen.some((m) => /ohne Wirkung/.test(m.text))).toBe(true)
  })
})
