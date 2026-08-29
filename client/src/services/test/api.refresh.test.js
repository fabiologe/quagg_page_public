// @vitest-environment jsdom
// Stiller Refresh: 401 → genau EIN /auth/refresh für alle wartenden Requests → Wiederholung.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import axios, { AxiosError } from 'axios'

import api, { navigation, tokenLaeuftBaldAb } from '../api'
import { useAuthStore } from '@/stores/useAuthStore'

function jwt(expInSekunden) {
  const body = btoa(JSON.stringify({ sub: 'max', exp: Math.floor(Date.now() / 1000) + expInSekunden }))
  return `h.${body.replace(/=+$/, '')}.s`
}

function fehler401(config) {
  return new AxiosError('Unauthorized', '401', config, null, { status: 401, data: { detail: 'x' }, headers: {}, config })
}

let adapterAufrufe
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  adapterAufrufe = []
  vi.restoreAllMocks()
  navigation.zumLogin = vi.fn()
  // Fake-Transport: altes Token → 401, neues → 200
  api.defaults.adapter = async (config) => {
    adapterAufrufe.push(config.headers.Authorization)
    if (config.headers.Authorization === 'Bearer neu') {
      return { status: 200, data: { ok: true }, headers: {}, config }
    }
    throw fehler401(config)
  }
})

describe('api Refresh-Interceptor', () => {
  it('drei parallele 401 → ein Refresh → drei Wiederholungen', async () => {
    const auth = useAuthStore()
    auth.setAuth({ access_token: jwt(600), refresh_token: 'r-1', user: { rolle: 'ADMIN' } })
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'neu', refresh_token: 'r-2', user: { rolle: 'ADMIN' } } })

    const ergebnisse = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')])
    expect(ergebnisse.map(r => r.data.ok)).toEqual([true, true, true])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh.mock.calls[0][1]).toEqual({ refresh_token: 'r-1' })
    expect(auth.token).toBe('neu')
    expect(auth.refreshToken).toBe('r-2')
    expect(adapterAufrufe.filter(a => a === 'Bearer neu')).toHaveLength(3)
    expect(navigation.zumLogin).not.toHaveBeenCalled()
  })

  it('Refresh scheitert → abmelden + Login mit Rücksprung', async () => {
    const auth = useAuthStore()
    auth.setAuth({ access_token: jwt(600), refresh_token: 'r-1', user: { rolle: 'ADMIN' } })
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('401'))
    window.history.pushState({}, '', '/intern/projects?x=1')

    await expect(api.get('/a')).rejects.toBeTruthy()
    expect(auth.token).toBeNull()
    expect(navigation.zumLogin).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/intern/projects?x=1'))
  })

  it('anonym (kein Token): 401 wird durchgereicht, kein Redirect', async () => {
    const refresh = vi.spyOn(axios, 'post')
    await expect(api.get('/a')).rejects.toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
    expect(navigation.zumLogin).not.toHaveBeenCalled()
  })

  it('kurz vor Ablauf wird proaktiv erneuert', async () => {
    const auth = useAuthStore()
    auth.setAuth({ access_token: jwt(20), refresh_token: 'r-1', user: { rolle: 'ADMIN' } })
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'neu', refresh_token: 'r-2', user: { rolle: 'ADMIN' } } })
    const r = await api.get('/a')
    expect(r.data.ok).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(adapterAufrufe).toEqual(['Bearer neu'])   // kein 401-Umweg
  })

  it('403 löst keinen Logout aus', async () => {
    const auth = useAuthStore()
    auth.setAuth({ access_token: 'neu', refresh_token: 'r-1', user: { rolle: 'WERKSTUDENT' } })
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Forbidden', '403', config, null, { status: 403, data: {}, headers: {}, config })
    }
    await expect(api.get('/a')).rejects.toBeTruthy()
    expect(auth.token).toBe('neu')
    expect(navigation.zumLogin).not.toHaveBeenCalled()
  })

  it('tokenLaeuftBaldAb', () => {
    expect(tokenLaeuftBaldAb(jwt(30))).toBe(true)
    expect(tokenLaeuftBaldAb(jwt(600))).toBe(false)
    expect(tokenLaeuftBaldAb('kaputt')).toBe(false)
  })
})
