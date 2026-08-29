// Stufe 16: BildAblage — Blob unter dem Hash-Key, Deduplizierung, Bytes
// für den Export, Aufräumen je Dokument. Normalisierung wird injiziert
// (kein DOM in Node).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repo } from '../services/PdfRepo'
import {
  legeBildAb, bildBlobKey, ladeBildBytes, loescheBilder, verwirfDokument,
} from '../services/BildAblage'
import { hole, _leereAlles } from '../services/BildCache'

function normalisiererFuer(bytes, mime = 'image/png') {
  return async () => ({
    blob: new Blob([bytes], { type: mime }),
    mime, natBreite: 300, natHoehe: 200,
    bitmap: { width: 300, height: 200, close: vi.fn() },
  })
}

beforeEach(_leereAlles)

describe('legeBildAb', () => {
  it('speichert Blob + Meta unter dem Hash-Key und wärmt den Cache vor', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const v = await legeBildAb('dokA', {}, { normalisiere: normalisiererFuer(bytes) })
    expect(v.bildKey).toMatch(/^[0-9a-f]{32}$/)
    expect(v).toMatchObject({ mime: 'image/png', natBreite: 300, natHoehe: 200 })
    const eintrag = await repo.getBlob(bildBlobKey('dokA', v.bildKey))
    expect(eintrag.meta).toMatchObject({ mime: 'image/png', natBreite: 300, natHoehe: 200, groesse: 5 })
    expect(new Uint8Array(await eintrag.blob.arrayBuffer())).toEqual(bytes)
    expect(hole('dokA', v.bildKey)).toBeTruthy()
  })

  it('derselbe Inhalt ein zweites Mal → gleicher Key, KEIN zweites Schreiben', async () => {
    const bytes = new Uint8Array([9, 9, 9])
    const schreib = vi.spyOn(repo, 'setBlob')
    const a = await legeBildAb('dokB', {}, { normalisiere: normalisiererFuer(bytes) })
    const b = await legeBildAb('dokB', {}, { normalisiere: normalisiererFuer(bytes) })
    expect(a.bildKey).toBe(b.bildKey)
    expect(schreib).toHaveBeenCalledTimes(1)
    schreib.mockRestore()
  })
})

describe('ladeBildBytes', () => {
  it('liefert Bytes + MIME je Key, unbekannte Keys fehlen einfach', async () => {
    const bytes = new Uint8Array([7, 7])
    const v = await legeBildAb('dokC', {}, { normalisiere: normalisiererFuer(bytes, 'image/jpeg') })
    const map = await ladeBildBytes('dokC', [v.bildKey, v.bildKey, 'gibt-es-nicht'])
    expect(map.size).toBe(1)
    expect(map.get(v.bildKey).mime).toBe('image/jpeg')
    expect(map.get(v.bildKey).bytes).toEqual(bytes)
  })
})

describe('loescheBilder', () => {
  it('entfernt nur die Blobs des eigenen Dokuments', async () => {
    const a = await legeBildAb('dokX', {}, { normalisiere: normalisiererFuer(new Uint8Array([1])) })
    const b = await legeBildAb('dokY', {}, { normalisiere: normalisiererFuer(new Uint8Array([2])) })
    await loescheBilder('dokX')
    expect(await repo.getBlob(bildBlobKey('dokX', a.bildKey))).toBeNull()
    expect(await repo.getBlob(bildBlobKey('dokY', b.bildKey))).not.toBeNull()
    expect(hole('dokX', a.bildKey)).toBeNull()
    expect(hole('dokY', b.bildKey)).toBeTruthy()
    verwirfDokument('dokY')
    expect(hole('dokY', b.bildKey)).toBeNull()
  })
})
