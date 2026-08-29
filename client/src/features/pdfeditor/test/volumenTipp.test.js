// @vitest-environment jsdom
//
// Stufe 17: Volumen-Werkzeug über usePointerTools — Polygon zeichnen legt
// eine Baugrube mit Vorgaben an und öffnet den Dialog; Tipp in eine
// bestehende Fläche/Baugrube öffnet den Dialog ohne neues Objekt; die
// Umwandlung ist ein Undo-Schritt.

import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../services/PdfEngine', () => ({
  oeffnePdf: vi.fn(),
  renderScaleFuer: () => 1,
  RenderingCancelledException: class RenderingCancelledException {},
}))

import { usePointerTools } from '../composables/usePointerTools'
import { useToolStore } from '../stores/useToolStore'
import { useAnnotStore } from '../stores/useAnnotStore'
import { useViewStore } from '../stores/useViewStore'

let zaehler = 0

async function aufbau() {
  setActivePinia(createPinia())
  const toolStore = useToolStore()
  const annotStore = useAnnotStore()
  const viewStore = useViewStore()
  await annotStore.laden(`vol-dok-${++zaehler}`)
  const wet = {
    starte: vi.fn(), punkt: vi.fn(), zeigeVorhersage: vi.fn(),
    beende: vi.fn(() => null), brich: vi.fn(), anzahlPunkte: () => 0,
    zeigeRadierer: vi.fn(), zeigeMarkerVorschau: vi.fn(), versteckeRadierer: vi.fn(),
  }
  const werkzeuge = usePointerTools({
    scrollerRef: { value: { setPointerCapture: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
    gesten: {
      onNavPointerDown: vi.fn(), onNavPointerMove: vi.fn(), onNavPointerUp: vi.fn(),
      onNavPointerCancel: vi.fn(), brichAlle: vi.fn(), uebernimmZeiger: vi.fn(),
    },
    wetInkRef: { value: wet },
    toolStore, annotStore, viewStore,
    findeSeite: () => ({
      index: 0, breitePt: 595, hoehePt: 842, zoom: 1, drehung: 0, boxBreitePt: 595, boxHoehePt: 842,
      ursprungX: 0, ursprungY: 0, ursprungClientX: 0, ursprungClientY: 0,
    }),
  })
  return { werkzeuge, toolStore, annotStore }
}

function tipp(werkzeuge, x, y) {
  const ev = { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y }
  werkzeuge.onPointerDown(ev)
  werkzeuge.onPointerUp({ ...ev, buttons: 0 })
}

const ECKEN = [[100, 100], [300, 100], [300, 300], [100, 300]]

describe('Volumen zeichnen', () => {
  it('Polygon schließen legt eine Baugrube mit Vorgaben an und öffnet den Dialog', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('messenVolumen')
    tipp(werkzeuge, 100, 100)
    expect(toolStore.messungInArbeit?.kind).toBe('volumen')
    for (const [x, y] of ECKEN.slice(1)) tipp(werkzeuge, x, y)
    tipp(werkzeuge, 100, 100)   // Schluss auf den Startpunkt
    const messungen = annotStore.items.filter(a => a.type === 'measure')
    expect(messungen).toHaveLength(1)
    expect(messungen[0]).toMatchObject({
      kind: 'volumen', tiefeM: 2, neigungN: 1, auflockerung: 1.25, modus: 'sohle', rechenwegAnzeigen: true,
    })
    expect(messungen[0].points).toHaveLength(4)
    expect(toolStore.messungInArbeit).toBeNull()
    expect(toolStore.volumenAnfrage).toEqual({ id: messungen[0].id, page: 0, quelle: 'neu' })
  })

  it('Tipp in eine bestehende Fläche öffnet den Dialog — ohne neues Objekt, kind bleibt area', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    const flaeche = annotStore.fuegeHinzu({ type: 'measure', kind: 'area', page: 0, points: ECKEN })
    toolStore.waehleWerkzeug('messenVolumen')
    tipp(werkzeuge, 200, 200)
    expect(annotStore.items).toHaveLength(1)
    expect(toolStore.volumenAnfrage).toEqual({ id: flaeche.id, page: 0, quelle: 'flaeche' })
    expect(toolStore.messungInArbeit).toBeNull()
    expect(annotStore.items[0].kind).toBe('area')
  })

  it('Tipp in eine bestehende Baugrube → bearbeiten', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    const vol = annotStore.fuegeHinzu({
      type: 'measure', kind: 'volumen', page: 0, points: ECKEN, tiefeM: 1, neigungN: 0, auflockerung: 1, modus: 'sohle',
    })
    toolStore.waehleWerkzeug('messenVolumen')
    tipp(werkzeuge, 150, 150)
    expect(toolStore.volumenAnfrage).toEqual({ id: vol.id, page: 0, quelle: 'bearbeiten' })
  })

  it('Umwandlung per Patch ist ein Undo-Schritt', async () => {
    const { annotStore } = await aufbau()
    const flaeche = annotStore.fuegeHinzu({ type: 'measure', kind: 'area', page: 0, points: ECKEN })
    annotStore.aktualisiere([{ id: flaeche.id, patch: { kind: 'volumen', tiefeM: 2, neigungN: 1, auflockerung: 1.25, modus: 'sohle' } }])
    expect(annotStore.items[0].kind).toBe('volumen')
    annotStore.undo()
    expect(annotStore.items[0].kind).toBe('area')
    annotStore.redo()
    expect(annotStore.items[0].kind).toBe('volumen')
    expect(annotStore.items[0].tiefeM).toBe(2)
  })

  it('Tipp außerhalb jeder Fläche beginnt ein neues Polygon', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    annotStore.fuegeHinzu({ type: 'measure', kind: 'area', page: 0, points: ECKEN })
    toolStore.waehleWerkzeug('messenVolumen')
    tipp(werkzeuge, 400, 400)
    expect(toolStore.volumenAnfrage).toBeNull()
    expect(toolStore.messungInArbeit).toMatchObject({ kind: 'volumen', points: [[400, 400]] })
  })

  it('Werkzeugwechsel lässt die Dialog-Anfrage stehen; Vorgaben kommen aus den Einstellungen', async () => {
    const { toolStore } = await aufbau()
    toolStore.volumenAnfrage = { id: 'x', page: 0, quelle: 'neu' }
    toolStore.waehleWerkzeug('stift')
    expect(toolStore.volumenAnfrage).toEqual({ id: 'x', page: 0, quelle: 'neu' })
    await toolStore.ladeEinstellungen({ volumen: { tiefeM: 3, neigungN: 2 } })
    expect(toolStore.volumenVorgaben).toMatchObject({ tiefeM: 3, neigungN: 2, auflockerung: 1.25, modus: 'sohle' })
  })
})
