// IndexedDB-Backend der RepoFacade (Stufe B): JSON + Blobs + Legacy-Migration.
// fake-indexeddb MUSS vor RepoFacade importiert werden, damit die
// Backend-Auswahl indexedDB vorfindet.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { RepoFacade, IndexedDbBackend } from '../services/RepoFacade'

let dbCounter = 0
function freshRepo(scope = 'global') {
  // Eigene DB pro Test — fake-indexeddb teilt sonst den Zustand
  return new RepoFacade(scope, new IndexedDbBackend(`test-${++dbCounter}-${Date.now()}`))
}

function fakeLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
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

describe('IndexedDbBackend — JSON', () => {
  it('roundtrippt Werte über get/set und trennt Scopes', async () => {
    const repo = freshRepo()
    const projekt = repo.withScope('P9123')
    await repo.set('din276-overrides', { a: '330' })
    await projekt.set('din276-overrides', { b: '340' })
    expect(await repo.get('din276-overrides')).toEqual({ a: '330' })
    expect(await projekt.get('din276-overrides')).toEqual({ b: '340' })
    expect(await repo.list()).toEqual(['din276-overrides'])
  })

  it('liefert null für fehlende Keys, delete/clear räumen auf', async () => {
    const repo = freshRepo()
    expect(await repo.get('nix')).toBeNull()
    await repo.set('a', 1)
    await repo.set('b', 2)
    await repo.delete('a')
    expect(await repo.get('a')).toBeNull()
    expect(await repo.clear()).toBe(1)
    expect(await repo.get('b')).toBeNull()
  })
})

describe('IndexedDbBackend — Blobs', () => {
  it('legt Blobs mit Metadaten ab und listet sie ohne Blob-Inhalt', async () => {
    const repo = freshRepo()
    const blob = new Blob(['IFC-DATEI-INHALT'], { type: 'application/octet-stream' })
    const ok = await repo.setBlob('model:abc123', blob, { name: 'haus.ifc', savedAt: 111 })
    expect(ok).toBe(true)

    const rows = await repo.listBlobs('model:')
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('model:abc123')
    expect(rows[0].meta.name).toBe('haus.ifc')
    expect(rows[0].size).toBe(16)

    const stored = await repo.getBlob('model:abc123')
    expect(await stored.blob.text()).toBe('IFC-DATEI-INHALT')
  })

  it('deleteBlob entfernt genau einen Eintrag', async () => {
    const repo = freshRepo()
    await repo.setBlob('model:a', new Blob(['a']), {})
    await repo.setBlob('model:b', new Blob(['b']), {})
    await repo.deleteBlob('model:a')
    const rows = await repo.listBlobs('model:')
    expect(rows.map(r => r.key)).toEqual(['model:b'])
  })
})

describe('Legacy-Migration localStorage → IndexedDB', () => {
  it('übernimmt ifc-repo:*-Einträge einmalig und löscht sie aus localStorage', async () => {
    globalThis.localStorage = fakeLocalStorage({
      'ifc-repo:global:pauschal-items': JSON.stringify([{ oz: '1.1', betrag: 5000 }]),
      'anderer-key': 'bleibt',
    })
    const repo = freshRepo()
    expect(await repo.get('pauschal-items')).toEqual([{ oz: '1.1', betrag: 5000 }])
    expect(localStorage.getItem('ifc-repo:global:pauschal-items')).toBeNull()
    expect(localStorage.getItem('anderer-key')).toBe('bleibt')
  })

  it('überschreibt vorhandene IndexedDB-Stände nicht', async () => {
    const backend = new IndexedDbBackend(`test-keep-${Date.now()}`)
    const repo = new RepoFacade('global', backend)
    await repo.set('k', 'idb-stand')
    // Legacy-Wert taucht nachträglich auf (z. B. zweiter Tab mit alter Version)
    globalThis.localStorage = fakeLocalStorage({
      'ifc-repo:global:k': JSON.stringify('alter-ls-stand'),
    })
    const backend2 = new IndexedDbBackend(backend._dbName)
    const repo2 = new RepoFacade('global', backend2)
    expect(await repo2.get('k')).toBe('idb-stand')
  })
})
