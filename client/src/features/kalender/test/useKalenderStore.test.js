// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/kalenderApi', () => ({
  kalenderApi: {
    liste: vi.fn(), anlegen: vi.fn(), aendern: vi.fn(), entfernen: vi.fn(), einladen: vi.fn(),
    antwortenVerarbeiten: vi.fn(), feedLink: vi.fn(), feedNeu: vi.fn(), feedWiderrufen: vi.fn(), projekte: vi.fn(),
  },
  fehlerText: (err, fb) => err?.response?.data?.detail ?? fb,
}))

import { kalenderApi } from '../services/kalenderApi'
import { useKalenderStore } from '../stores/useKalenderStore'
import { tagSchluessel } from '../services/KalenderZeit'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  kalenderApi.liste.mockResolvedValue({ termine: [{ id: 1 }], meilensteine: [{ id: 9 }], sync: { gelesen: 0 } })
})

describe('useKalenderStore', () => {
  it('lädt das Fenster der aktuellen Sicht', async () => {
    const s = useKalenderStore()
    s.anker = new Date(2026, 8, 15)
    await s.lade()
    expect(s.termine).toEqual([{ id: 1 }])
    expect(s.meilensteine).toEqual([{ id: 9 }])
    const [von, bis] = kalenderApi.liste.mock.calls[0]
    expect(new Date(von) <= new Date(2026, 8, 1)).toBe(true)
    expect(new Date(bis) >= new Date(2026, 9, 1)).toBe(true)
  })

  it('Sichtwechsel und Navigation laden neu', async () => {
    const s = useKalenderStore()
    s.anker = new Date(2026, 8, 9)
    await s.setzeSicht('woche')
    await s.gehe(1)
    expect(tagSchluessel(s.anker)).toBe('2026-09-16')
    expect(kalenderApi.liste).toHaveBeenCalledTimes(2)
    await s.setzeSicht('quatsch')
    expect(s.sicht).toBe('woche')
    expect(kalenderApi.liste).toHaveBeenCalledTimes(2)
  })

  it('Fehler landen lesbar im Store, Schreibaktionen laden nach', async () => {
    const s = useKalenderStore()
    kalenderApi.liste.mockRejectedValueOnce({ response: { data: { detail: 'Kaputt' } } })
    await s.lade()
    expect(s.fehler).toBe('Kaputt')

    kalenderApi.anlegen.mockResolvedValueOnce({ id: 5 })
    await s.anlegen({ titel: 'x' })
    expect(kalenderApi.liste).toHaveBeenCalledTimes(2)
    expect(s.fehler).toBe('')

    kalenderApi.einladen.mockRejectedValueOnce({ response: { data: { detail: 'SMTP down' } } })
    await expect(s.einladen(5, {})).rejects.toBeTruthy()
    expect(s.fehler).toBe('SMTP down')
  })

  it('Dialog- und Feed-Zustand', async () => {
    const s = useKalenderStore()
    s.oeffneDialog(null, { projekt_id: 3 })
    expect(s.dialog).toEqual({ termin: null, vorgabe: { projekt_id: 3 } })
    s.schliesseDialog()
    expect(s.dialog).toBeNull()
    kalenderApi.feedLink.mockResolvedValueOnce({ aktiv: false })
    await s.feedLaden()
    expect(s.feed.aktiv).toBe(false)
    kalenderApi.feedNeu.mockResolvedValueOnce({ aktiv: true, url: 'https://x/feed/t.ics', webcal: 'webcal://x/feed/t.ics' })
    await s.feedNeu()
    expect(s.feed.url).toContain('.ics')
  })

  it('Antworten abholen aktualisiert sync und lädt neu', async () => {
    const s = useKalenderStore()
    kalenderApi.antwortenVerarbeiten.mockResolvedValueOnce({ gelesen: 2, uebernommen: 1, uebersprungen: 1 })
    const z = await s.antwortenAbholen()
    expect(z.uebernommen).toBe(1)
    expect(kalenderApi.liste).toHaveBeenCalledTimes(1)
  })
})
