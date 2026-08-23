// Stufe 13b: GeteilteDatei — Abholung der per Android-Share-Target
// hinterlegten PDF (Cache-Fake, DOM-frei).

import { describe, expect, it } from 'vitest'
import {
  holeGeteilteDatei, GETEILT_CACHE, GETEILT_KEY, GETEILT_NAME_HEADER,
} from '../services/GeteilteDatei'

function fakeCaches(eintrag) {
  const geloescht = []
  const cache = {
    match: async (key) => (key === GETEILT_KEY ? eintrag : undefined),
    delete: async (key) => { geloescht.push(key); return true },
  }
  return {
    geloescht,
    geoeffnet: [],
    async open(name) { this.geoeffnet.push(name); return cache },
  }
}

function fakeAntwort(inhalt, name) {
  return {
    blob: async () => new Blob([inhalt], { type: 'application/pdf' }),
    headers: { get: (h) => (h === GETEILT_NAME_HEADER ? name : null) },
  }
}

describe('holeGeteilteDatei', () => {
  it('liefert die Datei mit Namen und löscht den Cache-Eintrag', async () => {
    const caches = fakeCaches(fakeAntwort('%PDF-geteilt', 'Lageplan.pdf'))
    const datei = await holeGeteilteDatei(caches)
    expect(datei).toBeInstanceOf(File)
    expect(datei.name).toBe('Lageplan.pdf')
    expect(datei.type).toBe('application/pdf')
    expect(caches.geoeffnet).toEqual([GETEILT_CACHE])
    expect(caches.geloescht).toEqual([GETEILT_KEY])   // einmalige Übergabe
  })

  it('Fallback-Name, wenn der Header fehlt', async () => {
    const caches = fakeCaches(fakeAntwort('x', null))
    expect((await holeGeteilteDatei(caches)).name).toBe('Geteilt.pdf')
  })

  it('null ohne hinterlegte Datei und ohne Cache-API', async () => {
    expect(await holeGeteilteDatei(fakeCaches(undefined))).toBeNull()
    expect(await holeGeteilteDatei(null)).toBeNull()
  })

  it('null bei kaputtem Cache statt Wurf', async () => {
    expect(await holeGeteilteDatei({ open: async () => { throw new Error('kaputt') } })).toBeNull()
  })
})
