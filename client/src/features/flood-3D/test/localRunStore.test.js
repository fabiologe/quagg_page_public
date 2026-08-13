/**
 * Der lokale Lauf-Treiber lebt im Store und überlebt damit Phasenwechsel
 * und Re-Mounts. Diese Tests halten die Zusagen fest, wegen derer er
 * umgezogen ist: kein Doppelstart, kein zweiter Treiber auf demselben
 * (konsumierenden) Companion-Stream, kein erzwungener Phasensprung — und
 * Wiederanknüpfen nach Reload OHNE Neueinreichung.
 */
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/localCompanion', () => ({
  companionHealth: vi.fn(),
  unterbrocheneLaeufe: vi.fn(),
  jobStatus: vi.fn(),
  pauseLocalRun: vi.fn(),
  runLocally: vi.fn(),
  verfolgen: vi.fn(),
  abgeschlosseneCompanionLaeufe: vi.fn().mockResolvedValue([]),
  companionLaufManifest: vi.fn().mockResolvedValue(null),
  importiereArtefakte: vi.fn().mockResolvedValue(undefined),
}))

import { abgeschlosseneCompanionLaeufe, companionHealth,
  companionLaufManifest, importiereArtefakte, jobStatus, runLocally,
  unterbrocheneLaeufe, verfolgen } from '../services/localCompanion'
import { useLocalRunStore } from '../stores/useLocalRunStore'
import { usePreStore } from '../stores/usePreStore'

let lokal
let pre

beforeEach(() => {
  setActivePinia(createPinia())
  lokal = useLocalRunStore()
  pre = usePreStore()
  pre.activeCaseId = 'demo'
  pre.activePhase = 'simulation'
  vi.spyOn(pre, 'loadCaseRuns').mockResolvedValue()
  vi.spyOn(pre, 'saveCase').mockResolvedValue()
  vi.spyOn(pre, 'melden')
  vi.clearAllMocks()
  unterbrocheneLaeufe.mockResolvedValue([])
  companionHealth.mockResolvedValue({ foamSupported: true, version: '1.5.1' })
  abgeschlosseneCompanionLaeufe.mockResolvedValue([])
  companionLaufManifest.mockResolvedValue(null)
  importiereArtefakte.mockResolvedValue(undefined)
})

/** runLocally/verfolgen so verdrahten, dass der Test Ereignisse einspeisen
 *  und den Abschluss selbst steuern kann. */
function treiberFalle(mockFn) {
  let onEvent
  let fertig
  let scheitern
  mockFn.mockImplementation((...args) => {
    onEvent = typeof args[1] === 'function' ? args[1] : args[0]
    return new Promise((res, rej) => { fertig = res; scheitern = rej })
  })
  return {
    ereignis: (ev) => onEvent(ev),
    fertig: (runId) => fertig(runId),
    scheitern: (e) => scheitern(e),
  }
}

describe('Doppelstart und Ereignis-Abbildung', () => {
  it('lehnt einen zweiten Start ab, solange der Treiber fährt', async () => {
    const falle = treiberFalle(runLocally)
    const erster = lokal.starten('demo')
    await lokal.starten('demo')                    // Panel neu gemountet …
    expect(runLocally).toHaveBeenCalledTimes(1)    // … trotzdem EIN Treiber
    expect(pre.melden).toHaveBeenCalledWith(expect.stringContaining('bereits'),
      'warnung')
    falle.fertig('demo_r009')
    await erster
  })

  it('bildet Ereignisse auf den Zustand ab — inkl. Laufnummer aus dem Speicherpunkt', async () => {
    const falle = treiberFalle(runLocally)
    const lauf = lokal.starten('demo')
    falle.ereignis({ event: 'job', jobId: 'local-abc' })
    falle.ereignis({ event: 'progress', fraction: 0.25, phase: 'solving',
      time: 1.5, end_time: 6, eta_s: 120 })
    falle.ereignis({ event: 'checkpoint', run_id: 'demo_r009', letzte_zeit: 1.0 })
    falle.ereignis({ event: 'log', text: 'blockMesh fertig' })

    expect(lokal.laufend.jobId).toBe('local-abc')
    expect(lokal.laufend.fraction).toBe(0.25)
    expect(lokal.laufend.letzteZeit).toBe(1.5)
    expect(lokal.laufend.etaS).toBe(120)
    expect(lokal.laufend.runId).toBe('demo_r009')
    expect(lokal.laufend.caseId).toBe('demo')      // aus <fall>_rNNN
    expect(lokal.log.some((z) => z.includes('noch ca. 2 min'))).toBe(true)
    expect(lokal.log.at(-1)).toBe('blockMesh fertig')
    falle.fertig('demo_r009')
    await lauf
  })

  it('hält den Log-Ring bei 200 Zeilen', () => {
    for (let i = 0; i < 250; i++) lokal.zeile(`z${i}`)
    expect(lokal.log.length).toBe(200)
    expect(lokal.log[0]).toBe('z50')
  })
})

describe('Abschluss und Fehler', () => {
  it('springt am Ende NUR aus der Simulations-Phase in die Ergebnisse', async () => {
    const falle = treiberFalle(runLocally)
    const lauf = lokal.starten('demo')
    pre.activePhase = 'laeufe'                     // Nutzer arbeitet woanders
    falle.fertig('demo_r009')
    await lauf
    expect(lokal.laufend).toBeNull()
    expect(pre.activePhase).toBe('laeufe')         // KEIN erzwungener Sprung
    expect(pre.loadCaseRuns).toHaveBeenCalled()
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('demo_r009'), 'erfolg')

    // Gegenprobe: auf der Simulations-Phase wird wie gewohnt gesprungen
    const falle2 = treiberFalle(runLocally)
    const lauf2 = lokal.starten('demo')
    pre.activePhase = 'simulation'
    falle2.fertig('demo_r010')
    await lauf2
    expect(pre.activePhase).toBe('ergebnis')
  })

  it('räumt im Fehlerfall auf und meldet', async () => {
    const falle = treiberFalle(runLocally)
    const lauf = lokal.starten('demo')
    falle.scheitern(new Error('Companion nicht mehr erreichbar'))
    await lauf
    expect(lokal.laufend).toBeNull()
    expect(lokal.fehler).toContain('Companion')
    expect(lokal.log.at(-1)).toContain('FEHLER')
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('Companion'), 'fehler')
    expect(unterbrocheneLaeufe).toHaveBeenCalled()
  })
})

describe('Wiederaufnahme und Anknüpfen', () => {
  it('bietet den gerade gefahrenen Job NICHT als „fortsetzen" an', () => {
    lokal.offeneLaeufe = [{ id: 'local-abc' }, { id: 'local-alt' }]
    lokal.laufend = { jobId: 'local-abc' }
    expect(lokal.wiederaufnehmbare.map((r) => r.id)).toEqual(['local-alt'])
  })

  it('fortsetzen knüpft bei noch laufendem Job NUR an (kein zweites Einreichen)', async () => {
    jobStatus.mockResolvedValue({ status: 'IN_PROGRESS' })
    const falle = treiberFalle(verfolgen)
    const lauf = lokal.fortsetzen({ id: 'local-abc' })
    await vi.waitFor(() => expect(verfolgen).toHaveBeenCalled())
    expect(runLocally).not.toHaveBeenCalled()
    expect(lokal.laufend.angeknuepft).toBe(true)
    falle.fertig('demo_r009')
    await lauf
  })

  it('anknuepfen übernimmt einen laufenden Job nach Reload — und ist idempotent', async () => {
    unterbrocheneLaeufe.mockResolvedValue([{ id: 'local-abc' }])
    jobStatus.mockResolvedValue({ status: 'IN_PROGRESS' })
    const falle = treiberFalle(verfolgen)
    const erster = lokal.anknuepfen()
    await vi.waitFor(() => expect(verfolgen).toHaveBeenCalledTimes(1))
    await lokal.anknuepfen()                       // Remount/HMR: No-op
    expect(verfolgen).toHaveBeenCalledTimes(1)
    expect(runLocally).not.toHaveBeenCalled()      // NIE neu eingereicht
    falle.fertig('demo_r009')
    await erster
  })

  it('anknuepfen nach Companion-Neustart (Job vergessen) ist ein No-op', async () => {
    unterbrocheneLaeufe.mockResolvedValue([{ id: 'local-abc' }])
    jobStatus.mockResolvedValue(null)              // 404 — Companion neu gestartet
    await lokal.anknuepfen()
    expect(verfolgen).not.toHaveBeenCalled()
    expect(lokal.laufend).toBeNull()
    expect(lokal.offeneLaeufe.map((r) => r.id)).toEqual(['local-abc'])
  })
})


describe('Nachzügler-Vollimport', () => {
  it('holt ein fertiges Companion-Ergebnis genau einmal nach', async () => {
    abgeschlosseneCompanionLaeufe.mockResolvedValue([{ id: 'local-fertig' }])
    companionLaufManifest.mockResolvedValue({ events: [
      { event: 'done', artifactsUrl: '/dateien/a.zip', run_id: 'demo_r006' },
    ] })
    const runDetail = vi.spyOn(
      (await import('../services/api')).flood3dApi, 'runDetail')
      .mockResolvedValue({ status: 'lokal' })

    await lokal.anknuepfen()
    expect(importiereArtefakte).toHaveBeenCalledTimes(1)
    expect(importiereArtefakte).toHaveBeenCalledWith(
      '/dateien/a.zip', 'demo_r006', expect.any(Function))
    expect(pre.melden).toHaveBeenCalledWith(
      expect.stringContaining('demo_r006'), 'erfolg')

    // zweiter App-Start-Aufruf in derselben Sitzung: kein Doppel-Import
    await lokal.anknuepfen()
    expect(importiereArtefakte).toHaveBeenCalledTimes(1)
    runDetail.mockRestore()
  })

  it('lässt Läufe in Ruhe, deren Server-Status schon terminal ist', async () => {
    abgeschlosseneCompanionLaeufe.mockResolvedValue([{ id: 'local-fertig' }])
    companionLaufManifest.mockResolvedValue({ events: [
      { event: 'done', artifactsUrl: '/dateien/a.zip', run_id: 'demo_r006' },
    ] })
    vi.spyOn((await import('../services/api')).flood3dApi, 'runDetail')
      .mockResolvedValue({ status: 'completed' })
    await lokal.anknuepfen()
    expect(importiereArtefakte).not.toHaveBeenCalled()
  })

  it('überspringt Jobs ohne done-Manifest', async () => {
    abgeschlosseneCompanionLaeufe.mockResolvedValue([{ id: 'local-halb' }])
    companionLaufManifest.mockResolvedValue({ events: [
      { event: 'frame', file: 'x' },
    ] })
    await lokal.anknuepfen()
    expect(importiereArtefakte).not.toHaveBeenCalled()
  })
})
