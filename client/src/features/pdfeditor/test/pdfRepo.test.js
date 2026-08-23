// PdfRepo — IndexedDB-Fassade des PDF-Editors (Stufe 1).
// fake-indexeddb MUSS vor PdfRepo importiert werden, damit die
// Backend-Auswahl indexedDB vorfindet.

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { PdfRepo, IndexedDbBackend } from '../services/PdfRepo'

let dbCounter = 0
function freshRepo(scope = 'global') {
  // Eigene DB pro Test — fake-indexeddb teilt sonst den Zustand.
  return new PdfRepo(scope, new IndexedDbBackend(`pdfed-test-${++dbCounter}-${Date.now()}`))
}

describe('PdfRepo — JSON', () => {
  it('roundtrippt Werte und trennt Scopes', async () => {
    const repo = freshRepo()
    const projekt = repo.withScope('P42')
    await repo.set('einstellungen', { theme: 'dark' })
    await projekt.set('einstellungen', { theme: 'light' })
    expect(await repo.get('einstellungen')).toEqual({ theme: 'dark' })
    expect(await projekt.get('einstellungen')).toEqual({ theme: 'light' })
  })

  it('meldet fehlende Keys als null und listet ohne Scope-Präfix', async () => {
    const repo = freshRepo()
    expect(await repo.get('gibts-nicht')).toBeNull()
    await repo.set('doc:abc:meta', { name: 'Plan' })
    await repo.set('doc:abc:annotations', { items: [] })
    await repo.set('doc-index', [])
    const dokKeys = await repo.list('doc:abc:')
    expect(dokKeys.sort()).toEqual(['doc:abc:annotations', 'doc:abc:meta'])
  })

  it('delete entfernt genau einen Key', async () => {
    const repo = freshRepo()
    await repo.set('a', 1)
    await repo.set('b', 2)
    await repo.delete('a')
    expect(await repo.get('a')).toBeNull()
    expect(await repo.get('b')).toBe(2)
  })
})

describe('PdfRepo — Blobs (PDF-Originale)', () => {
  it('roundtrippt Blob samt Meta und listet Größen', async () => {
    const repo = freshRepo()
    const blob = new Blob(['%PDF-1.7 fake'], { type: 'application/pdf' })
    await repo.setBlob('doc:abc:file', blob, { name: 'Lageplan', groesse: blob.size })
    const eintrag = await repo.getBlob('doc:abc:file')
    expect(eintrag.meta.name).toBe('Lageplan')
    expect(eintrag.blob.size).toBe(blob.size)

    const liste = await repo.listBlobs('doc:')
    expect(liste).toHaveLength(1)
    expect(liste[0].key).toBe('doc:abc:file')
    expect(liste[0].size).toBe(blob.size)
  })

  it('deleteBlob entfernt das Original', async () => {
    const repo = freshRepo()
    await repo.setBlob('doc:x:file', new Blob(['x']), {})
    await repo.deleteBlob('doc:x:file')
    expect(await repo.getBlob('doc:x:file')).toBeNull()
  })
})
