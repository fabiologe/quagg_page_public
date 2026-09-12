// Übergabe aus der Bibliothek an Quagg-PDF: dieselbe Quelle öffnet dasselbe
// lokale Dokument (kein erneuter Download, keine Dublette, Anmerkungen
// bleiben); ein gelöschtes Dokument wird frisch importiert; Nicht-PDFs
// werden abgelehnt. pdf.js ist gemockt — geprüft wird die Übergabelogik.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Node 20 kennt kein globales `navigator` (importiereDatei fragt
// navigator.storage.persist an) — für den Test ein leeres Objekt.
if (typeof globalThis.navigator === 'undefined') vi.stubGlobal('navigator', {})

vi.mock('../services/PdfEngine', () => ({
  oeffnePdf: vi.fn(async () => ({
    seitenAnzahl: 3,
    holeSeite: async () => ({ getViewport: () => ({ width: 595, height: 842 }) }),
    ladeSeitenMasse: async (cb) => {
      const s = [1, 2, 3].map(() => ({ breitePt: 595, hoehePt: 842 }))
      cb?.(s)
      return s
    },
    schliesse: async () => {},
  })),
  renderScaleFuer: () => 1,
  RenderingCancelledException: class RenderingCancelledException {},
}))

import { useDocStore } from '../stores/useDocStore'
import { repo } from '../services/PdfRepo'
import { oeffneQuelle } from '../services/QuellenUebergabe'

const pdfBlob = () => new Blob(['%PDF-1.7\n%Quagg-Test\n'], { type: 'application/pdf' })
let zaehler = 0
const neueQuelle = () => `bibliothek:${9000 + ++zaehler}`

beforeEach(() => setActivePinia(createPinia()))

describe('oeffneQuelle', () => {
  it('Erstaufruf lädt genau einmal, legt einen Tab an und merkt sich die Quelle', async () => {
    const store = useDocStore()
    const quelle = neueQuelle()
    const lade = vi.fn(async () => ({ blob: pdfBlob(), name: 'DWA-A 138.pdf' }))
    const r = await oeffneQuelle(quelle, lade)
    expect(r.neu).toBe(true)
    expect(lade).toHaveBeenCalledTimes(1)
    expect(store.tabs.some(t => t.dokId === r.dokId)).toBe(true)
    expect(store.name).toBe('DWA-A 138')
    expect((await repo.get(`quelle:${quelle}`)).dokId).toBe(r.dokId)
  })

  it('zweiter Aufruf: gleiche dokId, kein erneuter Download, keine Dublette', async () => {
    const store = useDocStore()
    const quelle = neueQuelle()
    const erst = await oeffneQuelle(quelle, async () => ({ blob: pdfBlob(), name: 'A.pdf' }))
    const vorher = store.dokIndex.length
    const lade = vi.fn(async () => ({ blob: pdfBlob(), name: 'A.pdf' }))
    const zweit = await oeffneQuelle(quelle, lade)
    expect(zweit).toEqual({ dokId: erst.dokId, neu: false })
    expect(lade).not.toHaveBeenCalled()
    expect(store.dokIndex.length).toBe(vorher)
  })

  it('verwaiste Quelle (Dokument gelöscht) führt zu einem frischen Import', async () => {
    const store = useDocStore()
    const quelle = neueQuelle()
    const erst = await oeffneQuelle(quelle, async () => ({ blob: pdfBlob(), name: 'B.pdf' }))
    await store.loescheDokument(erst.dokId)
    const lade = vi.fn(async () => ({ blob: pdfBlob(), name: 'B.pdf' }))
    const neu = await oeffneQuelle(quelle, lade)
    expect(neu.neu).toBe(true)
    expect(neu.dokId).not.toBe(erst.dokId)
    expect(lade).toHaveBeenCalledTimes(1)
    expect((await repo.get(`quelle:${quelle}`)).dokId).toBe(neu.dokId)
  })

  it('eine Nicht-PDF (z. B. eine HTML-Fehlerseite) wird abgelehnt, nichts importiert', async () => {
    const store = useDocStore()
    await store.ladeIndex()
    const vorher = store.dokIndex.length
    const quelle = neueQuelle()
    await expect(oeffneQuelle(quelle, async () => ({
      blob: new Blob(['<html>Anmeldung abgelaufen</html>'], { type: 'text/html' }), name: 'x.pdf',
    }))).rejects.toThrow(/keine PDF/)
    expect(store.dokIndex.length).toBe(vorher)
    expect(await repo.get(`quelle:${quelle}`)).toBeNull()
  })

  it('ein weiteres Dokument aus der Bibliothek kommt als zusätzlicher Tab dazu (frische Seite)', async () => {
    // Die Bibliothek navigiert das eine QuaggPdf-Fenster neu → jede Übergabe
    // beginnt mit einem frischen Store. Die offenen Tabs dürfen dabei nicht
    // durch „nur der neue Tab" überschrieben werden.
    const erst = await oeffneQuelle(neueQuelle(), async () => ({ blob: pdfBlob(), name: 'Erstes.pdf' }))
    setActivePinia(createPinia())
    const zweit = await oeffneQuelle(neueQuelle(), async () => ({ blob: pdfBlob(), name: 'Zweites.pdf' }))

    setActivePinia(createPinia())
    const frisch = useDocStore()
    await frisch.ladeIndex()
    await frisch.ladeTabs()
    const offen = frisch.tabs.map(t => t.dokId)
    expect(offen).toContain(erst.dokId)
    expect(offen).toContain(zweit.dokId)
  })

  it('ohne Quelle oder Ladefunktion wirft es sofort', async () => {
    await expect(oeffneQuelle('', async () => ({}))).rejects.toThrow()
    await expect(oeffneQuelle('bibliothek:1', null)).rejects.toThrow()
  })
})
