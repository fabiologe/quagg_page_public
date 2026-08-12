/**
 * verfolgen(): die herausgelöste Ereignisschleife — der Kern des
 * Wiederanknüpfens. Entscheidend: Nach einem Reload ist die Laufnummer
 * unbekannt und MUSS aus dem checkpoint-Ereignis übernommen werden, sonst
 * erreichen die Speicherpunkte den Server nicht.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/api', () => ({
  flood3dApi: {
    teilstandAbholen: vi.fn().mockResolvedValue({}),
    importRunChunked: vi.fn().mockResolvedValue({ status: 'completed' }),
    caseBundle: vi.fn(),
  },
}))

import { flood3dApi } from '../services/api'
import { verfolgen } from '../services/localCompanion'

const stromAntwort = (events, status = 'IN_PROGRESS') => ({
  ok: true,
  json: async () => ({ status, stream: events.map((e) => ({ output: e })) }),
})

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks() })

describe('verfolgen', () => {
  it('übernimmt die Laufnummer aus dem checkpoint und stößt den Teilstand an', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(stromAntwort([
        { event: 'checkpoint', run_id: 'demo_r009', zeiten: 2, letzte_zeit: 0.5 },
      ]))
      .mockResolvedValueOnce(stromAntwort([
        { event: 'done', artifactsUrl: '/dateien/x.zip', run_id: 'demo_r009' },
      ], 'COMPLETED'))
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['PK']) })

    const events = []
    const lauf = verfolgen('local-abc', (ev) => events.push(ev), { runId: null })
    await vi.advanceTimersByTimeAsync(2100)   // 1. Poll: checkpoint
    await vi.advanceTimersByTimeAsync(2100)   // 2. Poll: done + Import
    const runId = await lauf

    expect(runId).toBe('demo_r009')
    expect(flood3dApi.teilstandAbholen).toHaveBeenCalledWith('demo_r009',
      expect.objectContaining({ event: 'checkpoint', zeiten: 2 }))
    expect(flood3dApi.importRunChunked).toHaveBeenCalledWith('demo_r009',
      expect.anything(), expect.any(Function))
    // Artefakte wurden beim Companion abgeholt
    expect(fetchSpy.mock.calls.at(-1)[0]).toContain('/dateien/x.zip')
  })

  it('toleriert Wackler statt beim ersten gescheiterten fetch zu sterben', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Netz weg'))
      .mockResolvedValueOnce(stromAntwort([
        { event: 'done', artifactsUrl: '/dateien/x.zip', run_id: 'demo_r009' },
      ], 'COMPLETED'))
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['PK']) })

    const lauf = verfolgen('local-abc', () => {}, { runId: null })
    await vi.advanceTimersByTimeAsync(2100)
    await vi.advanceTimersByTimeAsync(2100)
    await expect(lauf).resolves.toBe('demo_r009')
  })
})
