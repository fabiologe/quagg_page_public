// @vitest-environment jsdom
// „Speichern" über die File-System-API: der Dialog startet im Ordner der
// Originaldatei (startIn = Herkunfts-Handle); ohne Picker-Unterstützung
// fällt es auf den Download zurück, Abbrechen bleibt folgenlos.

import { describe, expect, it, vi } from 'vitest'
import { speichereMitPicker } from '../services/PdfExporter'

function fakeZiel() {
  const geschrieben = []
  return {
    geschrieben,
    createWritable: async () => ({
      write: async (b) => geschrieben.push(b),
      close: async () => geschrieben.push('zu'),
    }),
  }
}

describe('speichereMitPicker', () => {
  it('reicht startIn (Herkunfts-Handle) und den Dateinamen an den Picker durch', async () => {
    const ziel = fakeZiel()
    const picker = vi.fn(async () => ziel)
    const startIn = { kind: 'file' }
    const bytes = new Uint8Array([1, 2, 3])
    const ergebnis = await speichereMitPicker(bytes, 'Plan_markiert.pdf', { picker, startIn })
    expect(ergebnis).toBe('gespeichert')
    expect(picker).toHaveBeenCalledTimes(1)
    expect(picker.mock.calls[0][0].startIn).toBe(startIn)
    expect(picker.mock.calls[0][0].suggestedName).toBe('Plan_markiert.pdf')
    expect(ziel.geschrieben).toEqual([bytes, 'zu'])
  })

  it('Abbrechen im Dialog ist kein Fehler', async () => {
    const abbruch = Object.assign(new Error('abgebrochen'), { name: 'AbortError' })
    const picker = vi.fn(async () => { throw abbruch })
    const ergebnis = await speichereMitPicker(new Uint8Array(), 'x.pdf', { picker })
    expect(ergebnis).toBe('abgebrochen')
  })

  it('verwaistes startIn (Datei verschoben) → zweiter Versuch ohne startIn', async () => {
    const ziel = fakeZiel()
    const picker = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('kaputt'), { name: 'NotFoundError' }))
      .mockResolvedValueOnce(ziel)
    const ergebnis = await speichereMitPicker(new Uint8Array([9]), 'x.pdf', {
      picker, startIn: { kind: 'file' },
    })
    expect(ergebnis).toBe('gespeichert')
    expect(picker).toHaveBeenCalledTimes(2)
    expect(picker.mock.calls[1][0].startIn).toBeUndefined()
  })

  it('ohne Picker-Unterstützung: normaler Download', async () => {
    const klicks = []
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () { klicks.push(this.download) }
    // jsdom kennt keine Objekt-URLs — fürs Download-a[href] reicht ein Stub.
    const origUrl = URL.createObjectURL
    URL.createObjectURL = () => 'blob:fake'
    const origRevoke = URL.revokeObjectURL
    URL.revokeObjectURL = () => {}
    try {
      const ergebnis = await speichereMitPicker(new Uint8Array([1]), 'y.pdf', {})
      expect(ergebnis).toBe('download')
      expect(klicks).toEqual(['y.pdf'])
    } finally {
      HTMLAnchorElement.prototype.click = orig
      URL.createObjectURL = origUrl
      URL.revokeObjectURL = origRevoke
    }
  })
})
