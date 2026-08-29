import api from '@/services/api'

/** Mail-Signatur: persönlicher Teil (jeder selbst) und Firmenblock (nur Admin). */
export const signaturApi = {
  async lesen() {
    return (await api.get('/signatur')).data
  },
  async eigeneSpeichern(felder) {
    return (await api.put('/signatur/ich', felder)).data
  },
  async firmaSpeichern(felder) {
    return (await api.put('/signatur/firma', felder)).data
  },
  async firmendatenVorschlag() {
    return (await api.get('/signatur/firma/vorschlag')).data
  },
}

export function fehlerText(err, fallback = 'Unbekannter Fehler') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  if (err?.response?.status) return `Serverfehler ${err.response.status}`
  return err?.message || fallback
}
