// RepoFacade ist der künftige Umschaltpunkt localStorage → IndexedDB → Remote
// (Stufe B/C der CDE-Roadmap). Das Verhalten des localStorage-Backends wird
// hier festgeschrieben, bevor weitere Backends dazukommen.

import { beforeEach, describe, expect, it } from 'vitest'
import { RepoFacade } from '../services/RepoFacade'

// Node hat kein localStorage — minimaler, vertragstreuer Ersatz.
function fakeLocalStorage() {
  const store = new Map()
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  }
}

beforeEach(() => {
  globalThis.localStorage = fakeLocalStorage()
})

describe('RepoFacade (localStorage-Backend)', () => {
  it('roundtrippt JSON-Werte über get/set', async () => {
    const repo = new RepoFacade()
    await repo.set('din276-overrides', { abc: '330' })
    expect(await repo.get('din276-overrides')).toEqual({ abc: '330' })
  })

  it('liefert null für fehlende Keys und bei kaputtem JSON', async () => {
    const repo = new RepoFacade()
    expect(await repo.get('gibt-es-nicht')).toBeNull()
    localStorage.setItem('ifc-repo:global:kaputt', '{nicht-json')
    expect(await repo.get('kaputt')).toBeNull()
  })

  it('trennt Scopes voneinander (Projekt-Partitionierung)', async () => {
    const global = new RepoFacade()
    const projekt = global.withScope('P9123')
    await global.set('pauschal-items', [1])
    await projekt.set('pauschal-items', [2])
    expect(await global.get('pauschal-items')).toEqual([1])
    expect(await projekt.get('pauschal-items')).toEqual([2])
    expect(await global.list()).toEqual(['pauschal-items'])
  })

  it('listet Keys mit Sub-Präfix ohne Scope-Anteil', async () => {
    const repo = new RepoFacade()
    await repo.set('din277-overrides', {})
    await repo.set('din276-overrides', {})
    await repo.set('anderes', {})
    expect((await repo.list('din')).sort())
      .toEqual(['din276-overrides', 'din277-overrides'])
  })

  it('clear löscht nur den eigenen Scope', async () => {
    const global = new RepoFacade()
    const projekt = new RepoFacade('P9123')
    await global.set('a', 1)
    await projekt.set('b', 2)
    expect(await projekt.clear()).toBe(1)
    expect(await global.get('a')).toBe(1)
    expect(await projekt.get('b')).toBeNull()
  })

  it('delete entfernt genau einen Key', async () => {
    const repo = new RepoFacade()
    await repo.set('a', 1)
    await repo.set('b', 2)
    await repo.delete('a')
    expect(await repo.get('a')).toBeNull()
    expect(await repo.get('b')).toBe(2)
  })
})
