// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }))

import api from '@/services/api'
import { useAuthStore } from '../useAuthStore'

const antwort = {
  token: 'jwt-alt', access_token: 'jwt-neu', refresh_token: 'r-1',
  user: { id: 1, username: 'max', name: 'max', anzeigename: 'Max', rolle: 'WERKSTUDENT', role: 'INTERNAL', muss_passwort_aendern: false },
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useAuthStore', () => {
  it('setAuth übernimmt Tokens + Nutzer und persistiert', () => {
    const s = useAuthStore()
    s.setAuth(antwort)
    expect(s.token).toBe('jwt-neu')
    expect(s.refreshToken).toBe('r-1')
    expect(s.rolle).toBe('WERKSTUDENT')
    expect(s.anzeigename).toBe('Max')
    expect(s.hatMindestens('WERKSTUDENT')).toBe(true)
    expect(s.hatMindestens('MITARBEITER')).toBe(false)
    expect(s.istAdmin).toBe(false)
    expect(localStorage.getItem('refresh_token')).toBe('r-1')
    expect(JSON.parse(localStorage.getItem('user')).rolle).toBe('WERKSTUDENT')
  })

  it('Legacy-Signatur und Altwert-Rolle funktionieren weiter', () => {
    const s = useAuthStore()
    s.setAuth('jwt-x', { name: 'kunde', role: 'CLIENT' })
    expect(s.token).toBe('jwt-x')
    expect(s.rolle).toBe('EXTERN')
    expect(s.istExtern).toBe(true)
    expect(s.userRole).toBe('EXTERN')
  })

  it('liest die Sitzung beim Start aus localStorage', () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('refresh_token', 'r')
    localStorage.setItem('user', JSON.stringify({ rolle: 'ADMIN', muss_passwort_aendern: true }))
    const s = useAuthStore()
    expect(s.isAuthenticated).toBe(true)
    expect(s.istAdmin).toBe(true)
    expect(s.mussPasswortAendern).toBe(true)
  })

  it('logout widerruft serverseitig (best effort) und räumt lokal auf', async () => {
    api.post.mockRejectedValueOnce(new Error('offline'))
    const s = useAuthStore()
    s.setAuth(antwort)
    await s.logout()
    expect(api.post).toHaveBeenCalledWith('/auth/logout', { refresh_token: 'r-1' })
    expect(s.token).toBeNull()
    expect(s.user).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('ladeMe aktualisiert den Nutzer', async () => {
    api.get.mockResolvedValueOnce({ data: { ...antwort.user, rolle: 'ADMIN' } })
    const s = useAuthStore()
    s.setAuth(antwort)
    await s.ladeMe()
    expect(s.rolle).toBe('ADMIN')
  })
})
