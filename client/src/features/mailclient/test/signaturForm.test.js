// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/signaturApi', () => ({
  signaturApi: { lesen: vi.fn(), eigeneSpeichern: vi.fn(), firmaSpeichern: vi.fn(), firmendatenVorschlag: vi.fn() },
  fehlerText: (err, fb) => err?.response?.data?.detail ?? fb,
}))

import { signaturApi } from '../services/signaturApi'
import MailSignaturForm from '../components/MailSignaturForm.vue'
import { useAuthStore } from '@/stores/useAuthStore'

const ANTWORT = (extra = {}) => ({
  person: { anzeigename: 'Fabio Quagliariello', titel: 'M.Sc.', funktion: 'Projektleiter',
            telefon: '0631 1', mobil: '', signatur_zusatz: '' },
  firma: { aktiv: true, firma: 'Quagg Engineering', rechtsform_zusatz: '', strasse: 'Davenportplatz 5b',
           plz: '67665', ort: 'Kaiserslautern', telefon: '', email: '', web: 'quagg-engineering.org', zusatz: '' },
  darf_firma_bearbeiten: false,
  vorschau: { aktiv: true, text: '-- \nFabio Quagliariello, M.Sc.', html: '<table><tr><td>Fabio</td></tr></table>' },
  ...extra,
})

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
  signaturApi.lesen.mockResolvedValue(ANTWORT())
})

describe('MailSignaturForm', () => {
  it('lädt die eigenen Felder und zeigt die Vorschau', async () => {
    const w = mount(MailSignaturForm)
    await flushPromises()
    expect(w.find('input').element.value).toBe('Fabio Quagliariello')
    expect(w.text()).toContain('Diese Angaben stehen unter jeder Mail')
    // Vorschau als sandboxed iframe, nie per v-html
    const rahmen = w.find('iframe')
    expect(rahmen.attributes('sandbox')).toBe('')
    expect(rahmen.attributes('srcdoc')).toContain('Fabio')
    expect(w.text()).toContain('gespeicherter Stand')
  })

  it('Speichern ist erst bei Änderungen möglich und aktualisiert Vorschau und Anzeigename', async () => {
    const w = mount(MailSignaturForm)
    await flushPromises()
    const knopf = w.findAll('button').find(b => b.text().includes('Speichern'))
    expect(knopf.attributes('disabled')).toBeDefined()

    const auth = useAuthStore()
    auth.setAuth({ access_token: 't', user: { username: 'fabio', anzeigename: 'Alt', rolle: 'MITARBEITER' } })
    signaturApi.eigeneSpeichern.mockResolvedValue(ANTWORT({
      person: { ...ANTWORT().person, funktion: 'Bauleiter' },
      vorschau: { aktiv: true, text: '-- \nneu', html: '<p>neu</p>' },
    }))

    const funktion = w.findAll('input')[2]
    await funktion.setValue('Bauleiter')
    expect(w.text()).toContain('nicht gespeicherte Änderungen')
    expect(knopf.attributes('disabled')).toBeUndefined()

    await w.find('form').trigger('submit')
    await flushPromises()
    expect(signaturApi.eigeneSpeichern).toHaveBeenCalledWith(expect.objectContaining({ funktion: 'Bauleiter' }))
    expect(w.text()).toContain('Gespeichert.')
    expect(auth.user.anzeigename).toBe('Fabio Quagliariello')
    w.unmount()
  })

  it('Firmenblock nur für Admins, sonst nur Hinweis', async () => {
    const ohne = mount(MailSignaturForm)
    await flushPromises()
    expect(ohne.text()).not.toContain('Firmenblock speichern')
    expect(ohne.text()).toContain('Änderungen daran nimmt ein Admin')
    ohne.unmount()

    signaturApi.lesen.mockResolvedValue(ANTWORT({ darf_firma_bearbeiten: true }))
    const mit = mount(MailSignaturForm)
    await flushPromises()
    expect(mit.text()).toContain('Firmenblock speichern')
    expect(mit.text()).toContain('§ 35a GmbHG')

    signaturApi.firmendatenVorschlag.mockResolvedValue({
      firma: 'quagg-engineering', strasse: 'Davenportplatz 5b', plz: '67665', ort: 'Kaiserslautern',
      telefon: '068261735', email: 'info@x.de', rechtsform_zusatz_verfuegbar: 'UG (haftungsbeschränkt)' })
    await mit.findAll('button').find(b => b.text().includes('Aus Firmendaten')).trigger('click')
    await flushPromises()
    expect(mit.text()).toContain('bitte prüfen und speichern')
    // Rechtsformzusatz wird NICHT eingetragen, nur als Warnung angeboten
    expect(mit.text()).toContain('erst nach Eintragung ins Handelsregister')
    const rechtsform = mit.findAll('input').find(i => i.attributes('placeholder') === '(erst ab Eintragung)')
    expect(rechtsform.element.value).toBe('')
    mit.unmount()
  })

  it('meldet Ladefehler lesbar', async () => {
    signaturApi.lesen.mockRejectedValue({ response: { data: { detail: 'Keine Berechtigung' } } })
    const w = mount(MailSignaturForm)
    await flushPromises()
    expect(w.text()).toContain('Keine Berechtigung')
    w.unmount()
  })

  it('zeigt an, wenn gar keine Signatur angehängt wird', async () => {
    signaturApi.lesen.mockResolvedValue(ANTWORT({ vorschau: { aktiv: false, text: '', html: '' } }))
    const w = mount(MailSignaturForm)
    await flushPromises()
    expect(w.text()).toContain('keine Signatur angehängt')
    expect(w.find('iframe').exists()).toBe(false)
    w.unmount()
  })
})
