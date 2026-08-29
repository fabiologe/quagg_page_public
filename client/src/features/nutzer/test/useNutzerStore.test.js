// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/nutzerApi', () => ({
  nutzerApi: { liste: vi.fn(), anlegen: vi.fn(), aendern: vi.fn(), passwortReset: vi.fn() },
  fehlerText: (err, fb) => err?.response?.data?.detail ?? fb,
}))

import { nutzerApi } from '../services/nutzerApi'
import { useNutzerStore } from '../stores/useNutzerStore'

const n = (id, username, extra = {}) => ({ id, username, rolle: 'MITARBEITER', is_active: true, anzeigename: '', muss_passwort_aendern: false, ...extra })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useNutzerStore', () => {
  it('lädt die Liste, meldet Fehler lesbar', async () => {
    nutzerApi.liste.mockResolvedValueOnce([n(1, 'admin'), n(2, 'max')])
    const s = useNutzerStore()
    await s.laden()
    expect(s.nutzer.map(x => x.username)).toEqual(['admin', 'max'])
    nutzerApi.liste.mockRejectedValueOnce({ response: { data: { detail: 'Nur Admin' } } })
    await s.laden()
    expect(s.fehler).toBe('Nur Admin')
  })

  it('anlegen sortiert ein, ändern ersetzt', async () => {
    const s = useNutzerStore()
    s.nutzer = [n(1, 'admin'), n(3, 'zoe')]
    nutzerApi.anlegen.mockResolvedValueOnce(n(4, 'max'))
    await s.anlegen({ username: 'max' })
    expect(s.nutzer.map(x => x.username)).toEqual(['admin', 'max', 'zoe'])
    nutzerApi.aendern.mockResolvedValueOnce(n(3, 'zoe', { rolle: 'ADMIN' }))
    await s.aendern(3, { rolle: 'ADMIN' })
    expect(s.nutzer.find(x => x.id === 3).rolle).toBe('ADMIN')
    nutzerApi.passwortReset.mockResolvedValueOnce(n(3, 'zoe', { rolle: 'ADMIN', muss_passwort_aendern: true }))
    await s.passwortReset(3, 'Neu-Passwort-2026')
    expect(nutzerApi.passwortReset).toHaveBeenCalledWith(3, 'Neu-Passwort-2026')
    expect(s.nutzer.find(x => x.id === 3).muss_passwort_aendern).toBe(true)
  })
})
