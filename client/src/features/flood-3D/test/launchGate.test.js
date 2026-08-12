/**
 * Kosten-Gate im API-Client: einmal fragen, mitschicken, bei 403 vergessen.
 * Der Client kennt das richtige Passwort NIE — er reicht nur durch, was
 * eingegeben wurde (anders als flood-2D, wo es im Bundle steht).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { flood3dApi, launchPasswortVergessen } from '../services/api.js'

const antwort = (ok, body = {}, status = 200) => ({
  ok, status,
  json: async () => body,
  headers: { get: () => 'demo_r001' },
  blob: async () => new Blob(['x']),
})

describe('Kosten-Gate', () => {
  beforeEach(() => {
    launchPasswortVergessen()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('fragt einmal und schickt das Passwort als Kopfzeile mit', async () => {
    const prompt = vi.fn().mockReturnValue('geheim')
    vi.stubGlobal('prompt', prompt)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(antwort(true, { run_id: 'demo_r001' }))

    await flood3dApi.startRun('demo')
    await flood3dApi.startRun('demo')          // zweiter Lauf: keine Frage mehr

    expect(prompt).toHaveBeenCalledTimes(1)
    for (const aufruf of fetchSpy.mock.calls) {
      expect(aufruf[1].headers['X-Launch-Password']).toBe('geheim')
    }
  })

  it('startet nichts, wenn die Eingabe abgebrochen wird', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue(null))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(flood3dApi.startRun('demo')).rejects.toThrow('Abgebrochen')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('vergisst ein falsches Passwort und fragt beim naechsten Mal neu', async () => {
    const prompt = vi.fn().mockReturnValueOnce('falsch').mockReturnValueOnce('richtig')
    vi.stubGlobal('prompt', prompt)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(antwort(false, { detail: 'Falsches oder fehlendes Passwort — nichts gestartet.' }, 403))
      .mockResolvedValueOnce(antwort(true, { run_id: 'demo_r001' }))

    await expect(flood3dApi.startRun('demo')).rejects.toThrow('Passwort')
    await flood3dApi.startRun('demo')
    expect(prompt).toHaveBeenCalledTimes(2)
  })

  it('haelt Netzvorschau und Bundle ebenso zurueck', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('geheim'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(antwort(true, { cells: 1000 }))
    await flood3dApi.meshPreview('demo', {})
    await flood3dApi.caseBundle('demo')
    for (const aufruf of fetchSpy.mock.calls) {
      expect(aufruf[1].headers['X-Launch-Password']).toBe('geheim')
    }
  })
})
