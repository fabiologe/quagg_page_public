import api from '@/services/api'

export const nutzerApi = {
  liste() {
    return api.get('/auth/nutzer').then(r => r.data)
  },
  anlegen(payload) {
    return api.post('/auth/nutzer', payload).then(r => r.data)
  },
  aendern(id, payload) {
    return api.patch(`/auth/nutzer/${id}`, payload).then(r => r.data)
  },
  passwortReset(id, neuesPasswort) {
    return api.post(`/auth/nutzer/${id}/passwort`, { neues_passwort: neuesPasswort }).then(r => r.data)
  },
}

export function fehlerText(err, fallback = 'Unbekannter Fehler') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  if (err?.response?.status) return `Serverfehler ${err.response.status}`
  return err?.message || fallback
}
