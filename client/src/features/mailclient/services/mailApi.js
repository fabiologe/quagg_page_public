/**
 * mailApi — feature-lokale Anbindung an /FastAPI/emails.
 * Alle Aufrufe laufen über die Axios-Instanz aus @/services/api (Bearer-Token,
 * 401-Redirect). Downloads MÜSSEN als Blob laufen — ein nacktes <a href>
 * hätte keinen Authorization-Header.
 */
import api from '@/services/api'

export const mailApi = {
  konto() {
    return api.get('/emails/konto').then(r => r.data)
  },

  liste(params) {
    return api.get('/emails', { params }).then(r => r.data)
  },

  detail(id) {
    return api.get(`/emails/${id}`).then(r => r.data)
  },

  setzeGelesen(id, isRead) {
    return api.patch(`/emails/${id}/read`, { is_read: isRead }).then(r => r.data)
  },

  anhangBlob(id, index) {
    return api.get(`/emails/${id}/attachments/${index}/download`, { responseType: 'blob' })
      .then(r => r.data)
  },

  emlBlob(id) {
    return api.get(`/emails/${id}/eml/download`, { responseType: 'blob' }).then(r => r.data)
  },

  zuweisen(id, projectFolderName) {
    return api.patch(`/emails/${id}/assign`, { project_folder_name: projectFolderName })
      .then(r => r.data)
  },

  /** @param {FormData} formData  Felder: to, cc, subject, body_text, reply_to_id, files[] */
  senden(formData) {
    // Content-Type bewusst NICHT setzen — Axios erzeugt den multipart-Boundary selbst
    return api.post('/emails/send', formData, { headers: { 'Content-Type': undefined } })
      .then(r => r.data)
  },

  projektOrdner() {
    return api.get('/projects/all_ids').then(r => r.data)
  },

  /** Antwort auf eine fremde Einladung: { status: ACCEPTED|DECLINED|TENTATIVE, kommentar, uebernehmen } */
  rsvp(id, payload) {
    return api.post(`/emails/${id}/rsvp`, payload).then(r => r.data)
  },

  dateitypen() {
    return api.get('/emails/settings/file-types').then(r => r.data)
  },
  dateitypAnlegen(payload) {
    return api.post('/emails/settings/file-types', payload).then(r => r.data)
  },
  dateitypAendern(id, payload) {
    return api.patch(`/emails/settings/file-types/${id}`, payload).then(r => r.data)
  },
  dateitypLoeschen(id) {
    return api.delete(`/emails/settings/file-types/${id}`)
  },
}

/** Fehlertext aus einer Axios-Ablehnung für die Anzeige. */
export function fehlerText(err, fallback = 'Unbekannter Fehler') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  if (err?.response?.status) return `Serverfehler ${err.response.status}`
  if (err?.message) return err.message
  return fallback
}

/** Blob als Datei-Download im Browser auslösen. */
export function speichereBlob(blob, dateiname) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname || 'download'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
