// @vitest-environment jsdom
//
// Stufe-B-Abnahme: useIfcStore schreibt nicht mehr direkt in localStorage.
// Alte `ifc-viewer-*`-Bestände werden beim ersten Start in die RepoFacade
// übernommen und aus localStorage entfernt; Annotationen wandern vom
// Dateinamen-Key auf den stabilen Modell-Key.

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useIfcStore } from '../stores/useIfcStore'
import { repo } from '../services/RepoFacade'

// jsdom hat kein indexedDB → RepoFacade fällt auf das localStorage-Backend
// zurück. Für die Migrations-Semantik ist das egal: Legacy-Keys sind die
// `ifc-viewer-*`-Keys, Repo-Keys tragen das `ifc-repo:`-Präfix.

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('useIfcStore — Persistenz über RepoFacade', () => {
  it('übernimmt Legacy-Saved-Views und löscht den alten Key', async () => {
    const legacy = [{ id: 'v1', name: 'Ansicht Nord', createdAt: 1, state: {} }]
    localStorage.setItem('ifc-viewer-saved-views', JSON.stringify(legacy))

    const store = useIfcStore()
    await store.ready
    expect(store.savedViews).toEqual(legacy)
    expect(localStorage.getItem('ifc-viewer-saved-views')).toBeNull()
    expect(await repo.get('saved-views')).toEqual(legacy)
  })

  it('übernimmt Legacy-Vector-Rules und -Styles', async () => {
    localStorage.setItem('ifc-viewer-vector-rules', JSON.stringify([{ id: 'r1', name: 'Regel' }]))
    localStorage.setItem('ifc-viewer-vector-styles', JSON.stringify({ IFCWALL: { lineWidth: 0.7 } }))

    const store = useIfcStore()
    await store.ready
    expect(store.vectorRules).toEqual([{ id: 'r1', name: 'Regel' }])
    expect(store.vectorStyles.IFCWALL.lineWidth).toBe(0.7)
    // Defaults werden weiterhin nachgeliefert (Merge, kein Ersatz)
    expect(Object.keys(store.vectorStyles).length).toBeGreaterThan(1)
    expect(localStorage.getItem('ifc-viewer-vector-rules')).toBeNull()
  })

  it('lädt Annotationen unter dem stabilen Modell-Key und migriert den Namens-Key', async () => {
    const legacyAnns = [{ id: 'a1', text: 'Riss in Wand', idx: 1 }]
    localStorage.setItem('ifc-viewer-annotations:haus.ifc', JSON.stringify(legacyAnns))

    const store = useIfcStore()
    await store.ready
    await store.loadAnnotationsForModel('gid:2O2Fr$t4X7Zf8NOew3FLOH', 'haus.ifc')
    // Altbestand wird beim Laden auf das Issue-Schema normalisiert
    expect(store.annotations).toHaveLength(1)
    expect(store.annotations[0]).toMatchObject({ ...legacyAnns[0], status: 'open', comments: [] })
    expect(localStorage.getItem('ifc-viewer-annotations:haus.ifc')).toBeNull()

    // Gleiche Datei unter anderem Namen → gleicher Key → Annotationen bleiben
    await store.loadAnnotationsForModel('gid:2O2Fr$t4X7Zf8NOew3FLOH', 'haus_umbenannt.ifc')
    expect(store.annotations[0]).toMatchObject(legacyAnns[0])
  })

  it('schreibt neue Daten nur noch unter dem ifc-repo:-Präfix', async () => {
    const store = useIfcStore()
    await store.ready
    store.saveView('Test', { cam: 1 })
    // Debounce (250 ms) abwarten
    await new Promise(r => setTimeout(r, 400))

    const keys = []
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i))
    expect(keys.some(k => k.startsWith('ifc-viewer-'))).toBe(false)
    expect(await repo.get('saved-views')).toHaveLength(1)
  })
})
