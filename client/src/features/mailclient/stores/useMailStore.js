/**
 * useMailStore — der EINE Zustand des Mail-Clients.
 *
 * Ordner sind hier keine IMAP-Ordner, sondern Filter auf email_events
 * (siehe ORDNER). Dialog-/Composer-Sichtbarkeit lebt ebenfalls hier, weil
 * Sidebar UND Lesebereich sie auslösen — genau EIN Besitzer, keine
 * gespiegelten Flags (siehe feedback_gespiegelter_zustand_laeuft_auseinander).
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { mailApi, fehlerText } from '../services/mailApi'
import { baueReplyBetreff, baueReplyEmpfaenger, baueZitat, htmlZuText } from '../services/MailText'

export const SEITE = 50
const THEME_KEY = 'quagg-mail-theme'

export const ORDNER = [
  { id: 'inbox',      label: 'Posteingang',      icon: 'posteingang', filter: { folder: 'inbox' } },
  { id: 'unassigned', label: 'Nicht zugewiesen', icon: 'zuweisen',    filter: { folder: 'inbox', assigned: false } },
  { id: 'quarantine', label: 'Quarantäne',       icon: 'quarantaene', filter: { has_quarantined: true } },
  { id: 'sent',       label: 'Gesendet',         icon: 'gesendet',    filter: { folder: 'sent' } },
]

/** Query-Parameter für GET /emails aus Ordner + Suchtext. */
export function filterFuer(ordnerId, suche = '') {
  const ordner = ORDNER.find(o => o.id === ordnerId) ?? ORDNER[0]
  const params = { ...ordner.filter }
  const q = String(suche ?? '').trim()
  if (q) params.q = q
  return params
}

function gespeichertesTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const useMailStore = defineStore('mailclient', () => {
  // ── Konto & Ansicht ──────────────────────────────────────────────────
  const konto = ref('')
  const theme = ref(gespeichertesTheme())
  const ordner = ref('inbox')
  const suche = ref('')

  // ── Liste ────────────────────────────────────────────────────────────
  const mails = ref([])
  const total = ref(0)
  const ladeStatus = ref('leer')       // leer | laedt | fertig | fehler
  const fehler = ref('')
  const ungelesen = ref(0)

  // ── Detail ───────────────────────────────────────────────────────────
  const aktiveId = ref(null)
  const detail = ref(null)
  const detailStatus = ref('leer')     // leer | laedt | fertig | fehler
  const detailFehler = ref('')

  // ── Dialoge / Composer (einziger Besitzer) ───────────────────────────
  const composer = ref(null)           // null | { modus, to, cc, subject, body, replyToId }
  const zuweisenMail = ref(null)       // null | Mail-Objekt
  const einstellungenOffen = ref(false)

  const hatMehr = computed(() => mails.value.length < total.value)
  const aktiverOrdner = computed(() => ORDNER.find(o => o.id === ordner.value) ?? ORDNER[0])
  // Senden/Zuweisen/Einstellungen ab MITARBEITER — WERKSTUDENT liest nur (Backend gibt sonst 403)
  const darfBearbeiten = computed(() => useAuthStore().hatMindestens('MITARBEITER'))

  // Antworten auf veraltete Requests ignorieren (schneller Ordnerwechsel)
  let listenLauf = 0

  async function ladeListe({ anhaengen = false } = {}) {
    const lauf = ++listenLauf
    ladeStatus.value = 'laedt'
    fehler.value = ''
    const params = {
      ...filterFuer(ordner.value, suche.value),
      skip: anhaengen ? mails.value.length : 0,
      limit: SEITE,
    }
    try {
      const daten = await mailApi.liste(params)
      if (lauf !== listenLauf) return
      mails.value = anhaengen ? [...mails.value, ...daten.items] : daten.items
      total.value = daten.total
      ladeStatus.value = 'fertig'
    } catch (err) {
      if (lauf !== listenLauf) return
      ladeStatus.value = 'fehler'
      fehler.value = fehlerText(err, 'Mails konnten nicht geladen werden.')
    }
  }

  function ladeMehr() {
    if (!hatMehr.value || ladeStatus.value === 'laedt') return Promise.resolve()
    return ladeListe({ anhaengen: true })
  }

  async function ladeUngelesen() {
    try {
      const daten = await mailApi.liste({ folder: 'inbox', is_read: false, limit: 1 })
      ungelesen.value = daten.total
    } catch {
      /* Badge ist Komfort — kein Fehlerbanner */
    }
  }

  function wechsleOrdner(id) {
    if (!ORDNER.some(o => o.id === id)) return
    ordner.value = id
    schliesseDetail()
    return ladeListe()
  }

  function setzeSuche(q) {
    suche.value = q
    return ladeListe()
  }

  function aktualisiere() {
    return Promise.all([ladeListe(), ladeUngelesen()])
  }

  async function init() {
    try {
      konto.value = (await mailApi.konto()).email || ''
    } catch {
      konto.value = ''
    }
    await aktualisiere()
  }

  // ── Detail ───────────────────────────────────────────────────────────

  function _aktualisiereInListe(id, felder) {
    const i = mails.value.findIndex(m => m.id === id)
    if (i >= 0) mails.value[i] = { ...mails.value[i], ...felder }
  }

  async function oeffneMail(id) {
    aktiveId.value = id
    detailStatus.value = 'laedt'
    detailFehler.value = ''
    try {
      const daten = await mailApi.detail(id)
      if (aktiveId.value !== id) return
      detail.value = daten
      detailStatus.value = 'fertig'
      if (!daten.is_read) await setzeGelesen(id, true)
    } catch (err) {
      if (aktiveId.value !== id) return
      detailStatus.value = 'fehler'
      detailFehler.value = fehlerText(err, 'Mail konnte nicht geladen werden.')
    }
  }

  async function setzeGelesen(id, wert) {
    const vorher = mails.value.find(m => m.id === id)?.is_read ?? detail.value?.is_read
    try {
      await mailApi.setzeGelesen(id, wert)
    } catch {
      return
    }
    _aktualisiereInListe(id, { is_read: wert })
    if (detail.value?.id === id) detail.value = { ...detail.value, is_read: wert }
    if (vorher !== wert) {
      const inInbox = (mails.value.find(m => m.id === id)?.folder ?? detail.value?.folder) === 'inbox'
      if (inInbox) ungelesen.value = Math.max(0, ungelesen.value + (wert ? -1 : 1))
    }
  }

  function schliesseDetail() {
    aktiveId.value = null
    detail.value = null
    detailStatus.value = 'leer'
    detailFehler.value = ''
  }

  // ── Aktionen ─────────────────────────────────────────────────────────

  async function weiseZu(id, projektOrdnerName) {
    const ergebnis = await mailApi.zuweisen(id, projektOrdnerName)
    if (detail.value?.id === id) detail.value = ergebnis
    _aktualisiereInListe(id, { is_assigned: true, project_id: ergebnis.project_id })
    if (ordner.value === 'unassigned') await ladeListe()
    return ergebnis
  }

  async function sendeMail(formData) {
    const ergebnis = await mailApi.senden(formData)
    if (ordner.value === 'sent') await ladeListe()
    return ergebnis
  }

  /** Fremde Einladung beantworten; das Detail bekommt die Antwort-Markierung aus dem Server zurück. */
  async function beantworteEinladung(id, payload) {
    const ergebnis = await mailApi.rsvp(id, payload)
    if (detail.value?.id === id) detail.value = ergebnis
    _aktualisiereInListe(id, { is_read: true })
    return ergebnis
  }

  /** Composer öffnen — 'neu' | 'antwort' | 'alle' (Vorbelegung aus mail). */
  function oeffneComposer(modus = 'neu', mail = null) {
    if (modus === 'neu' || !mail) {
      composer.value = { modus: 'neu', to: '', cc: '', subject: '', body: '', replyToId: null }
      return
    }
    const { to, cc } = baueReplyEmpfaenger({
      sender: mail.sender,
      recipient: mail.recipient,
      cc: mail.cc,
      eigeneAdresse: konto.value,
      alle: modus === 'alle',
    })
    const quelle = mail.body_text || htmlZuText(mail.body_html)
    composer.value = {
      modus,
      to: to.join(', '),
      cc: cc.join(', '),
      subject: baueReplyBetreff(mail.subject),
      body: baueZitat({ ...mail, body_text: quelle }),
      replyToId: mail.id,
    }
  }

  function schliesseComposer() {
    composer.value = null
  }

  function setzeTheme(t) {
    theme.value = t === 'dark' ? 'dark' : 'light'
    try { localStorage.setItem(THEME_KEY, theme.value) } catch { /* privat/blockiert */ }
  }

  function wechsleTheme() {
    setzeTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    konto, theme, ordner, suche,
    mails, total, ladeStatus, fehler, ungelesen, hatMehr, aktiverOrdner, darfBearbeiten,
    aktiveId, detail, detailStatus, detailFehler,
    composer, zuweisenMail, einstellungenOffen,
    init, ladeListe, ladeMehr, ladeUngelesen, wechsleOrdner, setzeSuche, aktualisiere,
    oeffneMail, setzeGelesen, schliesseDetail,
    weiseZu, sendeMail, beantworteEinladung, oeffneComposer, schliesseComposer,
    setzeTheme, wechsleTheme,
  }
})
