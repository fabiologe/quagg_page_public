// @vitest-environment jsdom
//
// Textfeld-Kette END-ZU-ENDE in jsdom: Tipp-Aktion legt die Annotation an,
// PageOverlay mountet den Editor, Tippen + Schließen committet den Text,
// leere Felder verschwinden rückstandsfrei. (pdf.js ist gemockt — die
// Kette läuft bis in echte Vue-Mounts, nicht nur bis in den Store.)

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/PdfEngine', () => ({
  oeffnePdf: vi.fn(),
  renderScaleFuer: () => 1,
  RenderingCancelledException: class RenderingCancelledException {},
}))

import PageOverlay from '../components/PageOverlay.vue'
import { useAnnotStore } from '../stores/useAnnotStore'
import { useToolStore } from '../stores/useToolStore'

let pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

function mountePageOverlay() {
  const wurzel = document.createElement('div')
  document.body.appendChild(wurzel)
  const app = createApp(PageOverlay, {
    index: 0, zoom: 1, breitePt: 595, hoehePt: 842,
  })
  app.use(pinia)
  app.mount(wurzel)
  return { wurzel, app }
}

function neuesTextfeld(annotStore, toolStore, extra = {}) {
  const feld = annotStore.fuegeHinzu({
    type: 'textbox', page: 0, x: 100, y: 100, text: '',
    ...toolStore.textfeld,
    ...extra,
  })
  annotStore.offenesTextfeldId = feld.id
  return feld
}

describe('Textfeld-Kette', () => {
  it('nach dem Anlegen rendert der Editor mit fokussierbarer textarea', async () => {
    const annotStore = useAnnotStore()
    const toolStore = useToolStore()
    await annotStore.laden('flow-dok-1')
    const { wurzel, app } = mountePageOverlay()

    neuesTextfeld(annotStore, toolStore)
    await nextTick()

    const editor = wurzel.querySelector('.pdfed-textbox-editor')
    expect(editor).toBeTruthy()
    const textarea = editor.querySelector('textarea')
    expect(textarea).toBeTruthy()
    expect(textarea.placeholder).toBe('Text eingeben')
    app.unmount()
  })

  it('Text eingeben + Fertig committet als EIN Undo-Schritt', async () => {
    const annotStore = useAnnotStore()
    const toolStore = useToolStore()
    await annotStore.laden('flow-dok-2')
    const { wurzel, app } = mountePageOverlay()

    const feld = neuesTextfeld(annotStore, toolStore)
    await nextTick()

    const textarea = wurzel.querySelector('.pdfed-textbox-editor textarea')
    textarea.value = 'Prüfvermerk\nZeile 2'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    // „Fertig"-Knopf (ist-primaer) klicken
    const fertig = [...wurzel.querySelectorAll('.pdfed-textbox-editor button')]
      .find(b => b.classList.contains('ist-primaer'))
    fertig.click()
    await nextTick()

    expect(annotStore.offenesTextfeldId).toBeNull()
    const gespeichert = annotStore.items.find(a => a.id === feld.id)
    expect(gespeichert.text).toBe('Prüfvermerk\nZeile 2')
    // Anlegen + Text = 2 Undo-Schritte; das erste Undo entfernt nur den Text
    annotStore.undo()
    expect(annotStore.items.find(a => a.id === feld.id).text).toBe('')
    app.unmount()
  })

  it('leer geschlossen → Feld verschwindet rückstandsfrei', async () => {
    const annotStore = useAnnotStore()
    const toolStore = useToolStore()
    await annotStore.laden('flow-dok-3')
    const { wurzel, app } = mountePageOverlay()

    neuesTextfeld(annotStore, toolStore)
    await nextTick()
    const fertig = [...wurzel.querySelectorAll('.pdfed-textbox-editor button')]
      .find(b => b.classList.contains('ist-primaer'))
    fertig.click()
    await nextTick()

    expect(annotStore.items.filter(a => a.type === 'textbox')).toHaveLength(0)
    expect(annotStore.offenesTextfeldId).toBeNull()
    app.unmount()
  })

  it('bestehendes Feld zeigt im Textfeld-Werkzeug eine aktive Treffer-Fläche', async () => {
    const annotStore = useAnnotStore()
    const toolStore = useToolStore()
    await annotStore.laden('flow-dok-4')
    toolStore.waehleWerkzeug('textfeld')
    const { wurzel, app } = mountePageOverlay()

    annotStore.fuegeHinzu({
      type: 'textbox', page: 0, x: 50, y: 50, text: 'Bestand',
      ...toolStore.textfeld,
    })
    await nextTick()

    const treffer = wurzel.querySelector('.pdfed-textbox-treffer')
    expect(treffer).toBeTruthy()
    expect(treffer.classList.contains('ist-aktiv')).toBe(true)
    app.unmount()
  })
})
