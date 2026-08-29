import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/services/api'
import { hatMindestens as _hatMindestens, normalisiert } from '@/services/rollen'

function gelesen(schluessel) {
  try {
    return localStorage.getItem(schluessel)
  } catch {
    return null
  }
}

function geparst(roh) {
  try {
    return roh ? JSON.parse(roh) : null
  } catch {
    return null
  }
}

function schreibe(schluessel, wert) {
  try {
    if (wert === null || wert === undefined) localStorage.removeItem(schluessel)
    else localStorage.setItem(schluessel, typeof wert === 'string' ? wert : JSON.stringify(wert))
  } catch {
    /* privater Modus / blockiert */
  }
}

/**
 * useAuthStore — Sitzung des angemeldeten Nutzers.
 *
 * Rolle kommt aus `user.rolle` (neu) bzw. `user.role` (Altwert) und wird über
 * das Rang-Modell (services/rollen.js) ausgewertet. Tokens liegen in
 * localStorage (httpOnly-Cookie ist ein späterer Schritt).
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref(gelesen('token'))
  const refreshToken = ref(gelesen('refresh_token'))
  const user = ref(geparst(gelesen('user')))

  const isAuthenticated = computed(() => !!token.value)
  const rolle = computed(() => normalisiert(user.value?.rolle ?? user.value?.role))
  const userRole = rolle
  const istAdmin = computed(() => rolle.value === 'ADMIN')
  const istExtern = computed(() => rolle.value === 'EXTERN')
  const mussPasswortAendern = computed(() => !!user.value?.muss_passwort_aendern)
  const anzeigename = computed(() => user.value?.anzeigename || user.value?.username || user.value?.name || '')

  function hatMindestens(mindestens) {
    return _hatMindestens(rolle.value, mindestens)
  }

  /**
   * Antwort von /auth/login, /auth/refresh oder /auth/passwort übernehmen.
   * Legacy-Signatur setAuth(token, user) wird weiter verstanden.
   */
  function setAuth(antwort, altUser) {
    if (typeof antwort === 'string') {
      token.value = antwort
      if (altUser) user.value = altUser
    } else if (antwort) {
      token.value = antwort.access_token ?? antwort.token ?? token.value
      if (antwort.refresh_token) refreshToken.value = antwort.refresh_token
      if (antwort.user) user.value = antwort.user
    }
    schreibe('token', token.value)
    schreibe('refresh_token', refreshToken.value)
    schreibe('user', user.value)
  }

  function setzeUser(neu) {
    user.value = neu
    schreibe('user', neu)
  }

  function clearAuth() {
    token.value = null
    refreshToken.value = null
    user.value = null
    schreibe('token', null)
    schreibe('refresh_token', null)
    schreibe('user', null)
  }

  /** Serverseitig widerrufen (best effort), dann lokal aufräumen. */
  async function logout() {
    const refresh = refreshToken.value
    try {
      if (token.value) await api.post('/auth/logout', { refresh_token: refresh })
    } catch {
      /* Sitzung war ohnehin tot */
    }
    clearAuth()
  }

  async function ladeMe() {
    const antwort = await api.get('/auth/me')
    setzeUser(antwort.data)
    return antwort.data
  }

  return {
    token,
    refreshToken,
    user,
    isAuthenticated,
    rolle,
    userRole,
    istAdmin,
    istExtern,
    mussPasswortAendern,
    anzeigename,
    hatMindestens,
    setAuth,
    setzeUser,
    clearAuth,
    logout,
    ladeMe,
  }
})
