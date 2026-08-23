// @vitest-environment jsdom
//
// Panel-Registry (Sprint U): pro Leiste genau ein Panel, Breiten begrenzt,
// Zustand übersteht den Neustart.

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePanels, PANEL_DEFS } from '../stores/usePanels'
import { repo } from '../services/RepoFacade'

beforeEach(async () => {
  localStorage.clear()
  await repo.delete('panel-state')
  setActivePinia(createPinia())
})

describe('usePanels', () => {
  it('kennt die Panel-Definitionen und startet geschlossen', async () => {
    const p = usePanels()
    await p.bereit
    expect(p.defs.map(d => d.id)).toEqual(['eigenschaften', 'struktur', 'cockpit', 'issues'])
    expect(p.aktivLinks).toBeNull()
    expect(p.aktivRechts).toBeNull()
  })

  it('öffnet pro Leiste nur EIN Panel — das vorherige weicht', async () => {
    const p = usePanels()
    await p.bereit
    p.open('eigenschaften')          // rechts
    expect(p.aktivRechts.id).toBe('eigenschaften')
    p.open('cockpit')                // ebenfalls rechts
    expect(p.aktivRechts.id).toBe('cockpit')
    expect(p.isOpen('eigenschaften')).toBe(false)
  })

  it('linke und rechte Leiste stören einander nicht', async () => {
    const p = usePanels()
    await p.bereit
    p.open('struktur')      // links
    p.open('cockpit')       // rechts
    expect(p.aktivLinks.id).toBe('struktur')
    expect(p.aktivRechts.id).toBe('cockpit')
  })

  it('toggle öffnet und schließt', async () => {
    const p = usePanels()
    await p.bereit
    p.toggle('issues')
    expect(p.isOpen('issues')).toBe(true)
    p.toggle('issues')
    expect(p.isOpen('issues')).toBe(false)
    expect(p.aktivRechts).toBeNull()
  })

  it('closeSide räumt eine ganze Leiste', async () => {
    const p = usePanels()
    await p.bereit
    p.open('struktur'); p.open('cockpit')
    p.closeSide('right')
    expect(p.aktivRechts).toBeNull()
    expect(p.aktivLinks.id).toBe('struktur')
  })

  it('begrenzt die Breite auf sinnvolle Werte', async () => {
    const p = usePanels()
    await p.bereit
    p.setBreite('cockpit', 50)
    expect(p.breiten.cockpit).toBe(240)
    p.setBreite('cockpit', 5000)
    expect(p.breiten.cockpit).toBe(720)
    p.setBreite('cockpit', 400.4)
    expect(p.breiten.cockpit).toBe(400)
  })

  it('stellt offene Panels und Breiten nach dem Neustart wieder her', async () => {
    const p = usePanels()
    await p.bereit
    p.open('struktur')
    p.open('issues')
    p.setBreite('issues', 420)

    setActivePinia(createPinia())
    const p2 = usePanels()
    await p2.bereit
    expect(p2.isOpen('struktur')).toBe(true)
    expect(p2.isOpen('issues')).toBe(true)
    expect(p2.breiten.issues).toBe(420)
  })

  it('verwirft unbekannte IDs aus dem gespeicherten Zustand', async () => {
    await repo.set('panel-state', { offen: ['gibtsnicht', 'cockpit'], breiten: { quatsch: 999 } })
    const p = usePanels()
    await p.bereit
    expect(p.isOpen('cockpit')).toBe(true)
    expect([...p.offen]).toEqual(['cockpit'])
    expect(p.breiten.quatsch).toBeUndefined()
  })

  it('jede Definition hat ein Icon und eine Seite', () => {
    for (const d of PANEL_DEFS) {
      expect(d.icon).toBeTruthy()
      expect(['left', 'right']).toContain(d.seite)
    }
  })
})
