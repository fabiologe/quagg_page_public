import api from '@/services/api'

/** HTTP-Schicht des Kalenders (/api/kalender → /FastAPI/kalender). Gibt immer response.data zurück. */
export const kalenderApi = {
  async liste(von, bis, { projektId = null, mitAbgesagten = false } = {}) {
    const params = { von, bis }
    if (projektId != null) params.projekt_id = projektId
    if (mitAbgesagten) params.mit_abgesagten = true
    return (await api.get('/kalender', { params })).data
  },
  async lesen(id) {
    return (await api.get(`/kalender/termine/${id}`)).data
  },
  async anlegen(felder) {
    return (await api.post('/kalender/termine', felder)).data
  },
  async aendern(id, felder) {
    return (await api.put(`/kalender/termine/${id}`, felder)).data
  },
  async entfernen(id) {
    return (await api.delete(`/kalender/termine/${id}`)).data
  },
  async einladen(id, optionen = {}) {
    return (await api.post(`/kalender/termine/${id}/einladen`, optionen)).data
  },
  async antwortenVerarbeiten() {
    return (await api.post('/kalender/antworten-verarbeiten')).data
  },
  async feedLink() {
    return (await api.get('/kalender/feed-link')).data
  },
  async feedNeu() {
    return (await api.post('/kalender/feed-link/neu')).data
  },
  async feedWiderrufen() {
    return (await api.delete('/kalender/feed-link')).data
  },
  async projekte() {
    return (await api.get('/projekte')).data
  },
}

export function fehlerText(err, fallback = 'Unbekannter Fehler') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  if (err?.response?.status) return `Serverfehler ${err.response.status}`
  return err?.message || fallback
}
