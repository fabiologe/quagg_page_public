// @vitest-environment jsdom
// Store-Verhalten mit gemockter API: Ordnerfilter, Paging, Gelesen-Zähler, Composer-Vorbelegung.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../services/mailApi', () => ({
  mailApi: {
    konto: vi.fn(),
    liste: vi.fn(),
    detail: vi.fn(),
    setzeGelesen: vi.fn(),
    zuweisen: vi.fn(),
    senden: vi.fn(),
    rsvp: vi.fn(),
  },
  fehlerText: (err, fallback) => err?.response?.data?.detail ?? fallback,
}))

import { mailApi } from '../services/mailApi'
import { useMailStore, filterFuer, ORDNER, SEITE } from '../stores/useMailStore'

const mail = (id, extra = {}) => ({
  id, message_id: `<${id}@t>`, subject: `Betreff ${id}`, sender: `s${id}@a.de`, recipient: 'info@quagg.de',
  received_at: '2026-08-27T10:00:00', is_read: false, is_assigned: false, project_id: null,
  folder: 'inbox', has_quarantined_files: false, attachment_count: 0, ...extra,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mailApi.konto.mockResolvedValue({ email: 'info@quagg.de' })
  mailApi.liste.mockImplementation(async (params) => {
    if (params.is_read === false && params.limit === 1) return { items: [], total: 3 }
    return { items: [mail(1), mail(2)], total: 2 }
  })
})

describe('filterFuer', () => {
  it('bildet jeden Ordner auf seine Query ab', () => {
    expect(filterFuer('inbox')).toEqual({ folder: 'inbox' })
    expect(filterFuer('unassigned')).toEqual({ folder: 'inbox', assigned: false })
    expect(filterFuer('quarantine')).toEqual({ has_quarantined: true })
    expect(filterFuer('sent')).toEqual({ folder: 'sent' })
    expect(filterFuer('gibtsnicht', ' x ')).toEqual({ folder: 'inbox', q: 'x' })
    expect(ORDNER.map(o => o.id)).toEqual(['inbox', 'unassigned', 'quarantine', 'sent'])
  })
})

describe('init / Liste', () => {
  it('lädt Konto, Liste und Ungelesen-Zähler', async () => {
    const store = useMailStore()
    await store.init()
    expect(store.konto).toBe('info@quagg.de')
    expect(store.mails).toHaveLength(2)
    expect(store.total).toBe(2)
    expect(store.ungelesen).toBe(3)
    expect(store.ladeStatus).toBe('fertig')
    expect(mailApi.liste).toHaveBeenCalledWith({ folder: 'inbox', skip: 0, limit: SEITE })
  })

  it('Ordnerwechsel setzt Detail zurück und lädt mit Filter', async () => {
    const store = useMailStore()
    store.aktiveId = 7
    await store.wechsleOrdner('unassigned')
    expect(store.aktiveId).toBeNull()
    expect(mailApi.liste).toHaveBeenLastCalledWith({ folder: 'inbox', assigned: false, skip: 0, limit: SEITE })
    await store.wechsleOrdner('nope')
    expect(store.ordner).toBe('unassigned')
  })

  it('Mehr laden hängt an und respektiert total', async () => {
    mailApi.liste.mockResolvedValueOnce({ items: [mail(1)], total: 2 })
    const store = useMailStore()
    await store.ladeListe()
    expect(store.hatMehr).toBe(true)
    mailApi.liste.mockResolvedValueOnce({ items: [mail(2)], total: 2 })
    await store.ladeMehr()
    expect(store.mails.map(m => m.id)).toEqual([1, 2])
    expect(mailApi.liste).toHaveBeenLastCalledWith({ folder: 'inbox', skip: 1, limit: SEITE })
    expect(store.hatMehr).toBe(false)
    await store.ladeMehr()
    expect(mailApi.liste).toHaveBeenCalledTimes(2)
  })

  it('Fehler landen lesbar im Store', async () => {
    mailApi.liste.mockRejectedValueOnce({ response: { data: { detail: 'Kaputt' } } })
    const store = useMailStore()
    await store.ladeListe()
    expect(store.ladeStatus).toBe('fehler')
    expect(store.fehler).toBe('Kaputt')
  })

  it('verspätete Antwort eines alten Ordners wird verworfen', async () => {
    let loeseAlt
    mailApi.liste
      .mockImplementationOnce(() => new Promise(r => { loeseAlt = r }))
      .mockResolvedValueOnce({ items: [mail(9, { folder: 'sent' })], total: 1 })
    const store = useMailStore()
    const alt = store.wechsleOrdner('inbox')
    await store.wechsleOrdner('sent')
    loeseAlt({ items: [mail(1)], total: 1 })
    await alt
    expect(store.mails[0].id).toBe(9)
  })
})

describe('Detail & Gelesen', () => {
  it('öffnen markiert ungelesene Mail als gelesen und zählt runter', async () => {
    mailApi.detail.mockResolvedValue({ ...mail(1), body_text: 'Hi' })
    mailApi.setzeGelesen.mockResolvedValue({})
    const store = useMailStore()
    await store.init()
    await store.oeffneMail(1)
    expect(store.detail.body_text).toBe('Hi')
    expect(store.detail.is_read).toBe(true)
    expect(store.mails[0].is_read).toBe(true)
    expect(store.ungelesen).toBe(2)
    expect(mailApi.setzeGelesen).toHaveBeenCalledWith(1, true)
  })

  it('bereits gelesene Mail löst keinen Read-Call aus', async () => {
    mailApi.detail.mockResolvedValue(mail(2, { is_read: true }))
    const store = useMailStore()
    await store.oeffneMail(2)
    expect(mailApi.setzeGelesen).not.toHaveBeenCalled()
  })

  it('ungelesen markieren zählt hoch, nur im Posteingang', async () => {
    mailApi.setzeGelesen.mockResolvedValue({})
    const store = useMailStore()
    store.mails = [mail(1, { is_read: true }), mail(2, { is_read: true, folder: 'sent' })]
    store.ungelesen = 0
    await store.setzeGelesen(1, false)
    expect(store.ungelesen).toBe(1)
    await store.setzeGelesen(2, false)
    expect(store.ungelesen).toBe(1)
  })
})

describe('Composer-Vorbelegung', () => {
  const original = mail(5, {
    sender: 'Kunde <kunde@a.de>', recipient: 'info@quagg.de, kollege@quagg.de', cc: 'chef@a.de',
    subject: 'AW: Angebot', body_text: 'Bitte Rückruf.', received_at: '2026-08-27T08:00:00',
  })

  it('neu: leer', () => {
    const store = useMailStore()
    store.oeffneComposer('neu')
    expect(store.composer).toEqual({ modus: 'neu', to: '', cc: '', subject: '', body: '', replyToId: null })
  })

  it('antwort: Absender, Re:-Betreff, Zitat, replyToId', async () => {
    const store = useMailStore()
    store.konto = 'info@quagg.de'
    store.oeffneComposer('antwort', original)
    expect(store.composer.to).toBe('kunde@a.de')
    expect(store.composer.cc).toBe('')
    expect(store.composer.subject).toBe('Re: Angebot')
    expect(store.composer.body).toContain('> Bitte Rückruf.')
    expect(store.composer.replyToId).toBe(5)
  })

  it('alle: Cc ohne mich', () => {
    const store = useMailStore()
    store.konto = 'info@quagg.de'
    store.oeffneComposer('alle', original)
    expect(store.composer.cc).toBe('kollege@quagg.de, chef@a.de')
  })

  it('HTML-only-Mail wird als Text zitiert', () => {
    const store = useMailStore()
    store.oeffneComposer('antwort', { ...original, body_text: null, body_html: '<p>Nur <b>HTML</b></p>' })
    expect(store.composer.body).toContain('> Nur HTML')
  })
})

describe('Aktionen', () => {
  it('zuweisen aktualisiert Detail + Liste und lädt „Nicht zugewiesen" neu', async () => {
    mailApi.zuweisen.mockResolvedValue({ ...mail(1), is_assigned: true, project_id: 1337 })
    const store = useMailStore()
    await store.wechsleOrdner('unassigned')
    store.aktiveId = 1
    store.detail = mail(1)
    const vorher = mailApi.liste.mock.calls.length
    await store.weiseZu(1, '1337_Genau')
    expect(store.detail.project_id).toBe(1337)
    expect(mailApi.liste.mock.calls.length).toBe(vorher + 1)
  })

  it('senden lädt den Gesendet-Ordner nur nach, wenn er offen ist', async () => {
    mailApi.senden.mockResolvedValue({ id: 99 })
    const store = useMailStore()
    const fd = new FormData()
    await store.sendeMail(fd)
    expect(mailApi.liste).not.toHaveBeenCalled()
    await store.wechsleOrdner('sent')
    const vorher = mailApi.liste.mock.calls.length
    await store.sendeMail(fd)
    expect(mailApi.liste.mock.calls.length).toBe(vorher + 1)
  })

  it('darfBearbeiten folgt dem Rang der angemeldeten Rolle', async () => {
    const { useAuthStore } = await import('@/stores/useAuthStore')
    const auth = useAuthStore()
    const store = useMailStore()
    expect(store.darfBearbeiten).toBe(false)
    auth.setAuth({ access_token: 't', user: { rolle: 'WERKSTUDENT' } })
    expect(store.darfBearbeiten).toBe(false)
    auth.setAuth({ access_token: 't', user: { rolle: 'MITARBEITER' } })
    expect(store.darfBearbeiten).toBe(true)
    auth.setAuth({ access_token: 't', user: { role: 'INTERNAL' } })
    expect(store.darfBearbeiten).toBe(true)
  })

  it('Einladung beantworten übernimmt die Server-Antwort ins Detail', async () => {
    const store = useMailStore()
    store.mails = [mail(7, { hat_termin: true })]
    store.aktiveId = 7
    store.detail = { ...mail(7), ical: { methode: 'REQUEST', antwort: null } }
    mailApi.rsvp.mockResolvedValueOnce({ ...mail(7), is_read: true, ical: { methode: 'REQUEST', antwort: { status: 'ACCEPTED' } } })
    await store.beantworteEinladung(7, { status: 'ACCEPTED', kommentar: '', uebernehmen: true })
    expect(mailApi.rsvp).toHaveBeenCalledWith(7, { status: 'ACCEPTED', kommentar: '', uebernehmen: true })
    expect(store.detail.ical.antwort.status).toBe('ACCEPTED')
    expect(store.mails[0].is_read).toBe(true)
  })

  it('Theme wird gemerkt', () => {
    const store = useMailStore()
    store.wechsleTheme()
    expect(store.theme).toBe('dark')
    expect(localStorage.getItem('quagg-mail-theme')).toBe('dark')
  })
})
