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

  it('startet ohne ort-Angabe in der Cloud, nie auf dem toten Server-Rechenort', async () => {
    // Der Server-Rechenort liefert seit Stage B HTTP 410 — ein Default
    // 'server' wäre eine stille Falle für jeden Aufrufer ohne Argument.
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('geheim'))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(antwort(true, { run_id: 'demo_r001' }))

    await flood3dApi.startRun('demo')

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(body.ort).toBe('runpod')
  })

  it('startet nichts, wenn die Eingabe abgebrochen wird', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue(null))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(flood3dApi.startRun('demo')).rejects.toThrow('Abgebrochen')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fragt bei 403 neu und wiederholt den Aufruf selbst', async () => {
    const prompt = vi.fn().mockReturnValueOnce('falsch').mockReturnValueOnce('richtig')
    vi.stubGlobal('prompt', prompt)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(antwort(false, { detail: 'Falsches oder fehlendes Passwort — nichts gestartet.' }, 403))
      .mockResolvedValueOnce(antwort(true, { run_id: 'demo_r001' }))

    const ergebnis = await flood3dApi.startRun('demo')

    expect(ergebnis).toEqual({ run_id: 'demo_r001' })
    expect(prompt).toHaveBeenCalledTimes(2)          // vorab + nach dem 403
    expect(fetchSpy.mock.calls[0][1].headers['X-Launch-Password']).toBe('falsch')
    expect(fetchSpy.mock.calls[1][1].headers['X-Launch-Password']).toBe('richtig')
  })

  it('gibt auf, wenn die zweite Eingabe abgebrochen wird', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValueOnce('falsch').mockReturnValueOnce(null))
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(antwort(false, { detail: 'Falsches oder fehlendes Passwort — nichts gestartet.' }, 403))
    await expect(flood3dApi.startRun('demo')).rejects.toThrow('Passwort')
  })

  it('schreibende Aufrufe fragen erst, wenn der Server 403 sagt', async () => {
    // Fall speichern ist kein teurer Lauf — hier soll NICHT vorab gefragt
    // werden, sondern erst wenn es noetig ist.
    const prompt = vi.fn().mockReturnValue('geheim')
    vi.stubGlobal('prompt', prompt)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(antwort(false, { detail: 'Falsches oder fehlendes Passwort' }, 403))
      .mockResolvedValueOnce(antwort(true, { ok: true }))

    await flood3dApi.saveCase('demo', { meta: { title: 'x' } })

    expect(prompt).toHaveBeenCalledTimes(1)                     // erst nach dem 403
    expect(fetchSpy.mock.calls[1][1].headers['X-Launch-Password']).toBe('geheim')
  })

  it('lesende Aufrufe loesen keine Abfrage aus', async () => {
    const prompt = vi.fn()
    vi.stubGlobal('prompt', prompt)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(antwort(true, []))
    await flood3dApi.listCases()
    expect(prompt).not.toHaveBeenCalled()
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
