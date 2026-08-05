// @vitest-environment jsdom
//
// CDE-Store (Managen): Projekte, Bearbeiter, Dokument-Register mit
// ISO-19650-Status, Revisionslogik über die IfcProject-GlobalId.

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCdeStore, ISO_STATUS } from '../stores/useCdeStore'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('useCdeStore', () => {
  it('legt Projekte an, aktiviert sie und persistiert', async () => {
    const cde = useCdeStore()
    await cde.ready
    const id = await cde.createProject({ nummer: 'P9123', name: 'Testprojekt' })
    expect(cde.activeProjectId).toBe(id)
    expect(cde.activeProject.nummer).toBe('P9123')

    // Zweite Store-Instanz (frische Pinia) lädt denselben Stand
    setActivePinia(createPinia())
    const cde2 = useCdeStore()
    await cde2.ready
    expect(cde2.projects).toHaveLength(1)
    expect(cde2.activeProjectId).toBe(id)
  })

  it('registriert Modelle als WIP mit Revisionszählung je GlobalId', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.createProject({ nummer: 'P1', name: 'Rev-Test' })
    await cde.setBearbeiter('Fabio')

    const rev1 = await cde.registerModel({ sha256: 'aaa', name: 'haus_rev1.ifc', size: 100, projectGlobalId: 'GID-X' })
    const rev2 = await cde.registerModel({ sha256: 'bbb', name: 'haus_rev2.ifc', size: 120, projectGlobalId: 'GID-X' })
    const other = await cde.registerModel({ sha256: 'ccc', name: 'anders.ifc', size: 50, projectGlobalId: 'GID-Y' })

    expect(rev1.revision).toBe(1)
    expect(rev2.revision).toBe(2)   // gleiche GlobalId → nächste Revision
    expect(other.revision).toBe(1)  // andere GlobalId → eigenes Dokument
    expect(rev1.status).toBe('WIP')
    expect(rev1.statusHistorie[0].von).toBe('Fabio')

    // Gleiche sha nochmal → kein Duplikat
    await cde.registerModel({ sha256: 'aaa', name: 'haus_rev1.ifc' })
    expect(cde.dokumente).toHaveLength(3)
  })

  it('Statuswechsel schreibt die Audit-Spur, ungültige Status werden abgelehnt', async () => {
    const cde = useCdeStore()
    await cde.ready
    await cde.createProject({ nummer: 'P2', name: 'Status-Test' })
    await cde.setBearbeiter('Fabio')
    await cde.registerModel({ sha256: 'aaa', name: 'x.ifc' })

    expect(await cde.setDokumentStatus('aaa', 'Shared')).toBe(true)
    expect(await cde.setDokumentStatus('aaa', 'Quatsch')).toBe(false)
    const doc = cde.dokumente[0]
    expect(doc.status).toBe('Shared')
    expect(doc.statusHistorie.map(h => h.status)).toEqual(['WIP', 'Shared'])
    expect(ISO_STATUS).toContain('Published')
  })

  it('Register ist projekt-partitioniert; Projekt löschen räumt den Scope', async () => {
    const cde = useCdeStore()
    await cde.ready
    const idA = await cde.createProject({ nummer: 'PA', name: 'A' })
    await cde.registerModel({ sha256: 'aaa', name: 'a.ifc' })
    const idB = await cde.createProject({ nummer: 'PB', name: 'B' })
    expect(cde.dokumente).toHaveLength(0) // B ist leer

    await cde.setActiveProject(idA)
    expect(cde.dokumente).toHaveLength(1)

    await cde.deleteProject(idA)
    expect(cde.projects.map(p => p.id)).toEqual([idB])
    expect(cde.activeProjectId).toBeNull()
    expect(cde.dokumente).toHaveLength(0)
  })
})
