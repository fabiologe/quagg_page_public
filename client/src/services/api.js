import axios from 'axios'
import { useAuthStore } from '@/stores/useAuthStore'

export const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Ersetzbar für Tests (jsdom kann nicht navigieren)
export const navigation = {
  zumLogin(ziel) {
    window.location.href = ziel
  },
}

let refreshLaeuft = null

function istAuthPfad(url = '') {
  return /\/auth\/(login|refresh|logout)(\?|$)/.test(url)
}

/** exp-Claim aus dem JWT lesen — nur zur Vorab-Erneuerung, nie zur Autorisierung. */
export function tokenLaeuftBaldAb(token, sekunden = 60) {
  try {
    const nutzlast = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof nutzlast.exp === 'number' && nutzlast.exp * 1000 - Date.now() < sekunden * 1000
  } catch {
    return false
  }
}

/**
 * Sitzung stillschweigend erneuern. Läuft parallel höchstens EINMAL — alle
 * gleichzeitig hängenden Requests warten auf dieselbe Promise.
 */
export function erneuereSitzung() {
  const auth = useAuthStore()
  if (!auth.refreshToken) return Promise.reject(new Error('Kein Refresh-Token'))
  if (!refreshLaeuft) {
    refreshLaeuft = axios
      .post(`${baseURL}/auth/refresh`, { refresh_token: auth.refreshToken })
      .then((antwort) => {
        auth.setAuth(antwort.data)
        return antwort.data.access_token
      })
      .finally(() => {
        refreshLaeuft = null
      })
  }
  return refreshLaeuft
}

function abmeldenUndZumLogin() {
  try {
    useAuthStore().clearAuth()
  } catch {
    /* Store nicht verfügbar */
  }
  if (window.location.pathname !== '/login') {
    const ziel = window.location.pathname + window.location.search
    navigation.zumLogin('/login?redirect=' + encodeURIComponent(ziel))
  }
}

// Request Interceptor - Bearer setzen, kurz vor Ablauf proaktiv erneuern
// (sonst bricht ein langer Multipart-Upload mitten im Ablauf mit 401 ab)
api.interceptors.request.use(
  async (config) => {
    try {
      const auth = useAuthStore()
      if (auth.token && auth.refreshToken && !istAuthPfad(config.url) && tokenLaeuftBaldAb(auth.token)) {
        try {
          await erneuereSitzung()
        } catch {
          /* der Response-Interceptor fängt den 401 */
        }
      }
      if (auth.token) {
        config.headers.Authorization = `Bearer ${auth.token}`
      }
    } catch (error) {
      console.warn('Auth store not available:', error)
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response Interceptor - 401 → einmal erneuern und wiederholen, sonst zum Login.
// 403 löst NIE einen Logout aus (das ist "darfst du nicht", nicht "wer bist du").
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const config = error.config
    if (status !== 401 || !config || istAuthPfad(config.url)) {
      return Promise.reject(error)
    }
    let auth
    try {
      auth = useAuthStore()
    } catch {
      return Promise.reject(error)
    }
    // Anonyme Nutzer (öffentliche Werkzeuge) bekommen den Fehler, keinen Redirect
    if (!auth.token) return Promise.reject(error)
    if (config._wiederholt || !auth.refreshToken) {
      abmeldenUndZumLogin()
      return Promise.reject(error)
    }
    try {
      const neuesToken = await erneuereSitzung()
      config._wiederholt = true
      config.headers = { ...(config.headers || {}), Authorization: `Bearer ${neuesToken}` }
      return api(config)
    } catch {
      abmeldenUndZumLogin()
      return Promise.reject(error)
    }
  }
)

export default api
