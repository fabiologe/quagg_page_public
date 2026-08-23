// @vitest-environment jsdom
//
// Tipp-Strecke durch usePointerTools: Maus-/Stift-/Finger-TIPP mit dem
// Textfeld-Werkzeug muss eine textbox anlegen und den Editor öffnen.
// (Reproduktion des Berichts „Textfeld: gar nichts erscheint".)

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

let dokZaehler = 0

function fakeGesten() {
  return {
    onNavPointerDown: vi.fn(), onNavPointerMove: vi.fn(),
    onNavPointerUp: vi.fn(), onNavPointerCancel: vi.fn(),
    brichAlle: vi.fn(), uebernimmZeiger: vi.fn(), stoppeTraegheit: vi.fn(),
  }
}

function fakeWet() {
  return {
    starte: vi.fn(), punkt: vi.fn(), zeigeVorhersage: vi.fn(),
    beende: vi.fn(() => null), brich: vi.fn(), istAktiv: () => false,
    anzahlPunkte: () => 0, zeigeRadierer: vi.fn(), zeigeMarkerVorschau: vi.fn(),
    versteckeRadierer: vi.fn(),
  }
}

async function aufbau() {
  setActivePinia(createPinia())
  const toolStore = useToolStore()
  const annotStore = useAnnotStore()
  const viewStore = useViewStore()
  await annotStore.laden(`tipp-dok-${++dokZaehler}`)
  const gesten = fakeGesten()
  const werkzeuge = usePointerTools({
    scrollerRef: {
      value: {
        setPointerCapture: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
      },
    },
    gesten,
    wetInkRef: { value: fakeWet() },
    toolStore, annotStore, viewStore,
    findeSeite: () => ({
      index: 0, breitePt: 595, hoehePt: 842, zoom: 1,
      ursprungX: 0, ursprungY: 0, ursprungClientX: 0, ursprungClientY: 0,
    }),
  })
  return { werkzeuge, toolStore, annotStore, gesten }
}

function ev(typ, extra = {}) {
  return {
    pointerId: 1, pointerType: typ, button: 0, buttons: typ === 'mouse' ? 1 : 0,
    clientX: 200, clientY: 300, ...extra,
  }
}

describe('Tipp mit dem Textfeld-Werkzeug', () => {
  it('Maus-Klick legt eine textbox an und öffnet den Editor', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('textfeld')
    werkzeuge.onPointerDown(ev('mouse'))
    werkzeuge.onPointerUp(ev('mouse', { buttons: 0 }))
    const felder = annotStore.items.filter(a => a.type === 'textbox')
    expect(felder).toHaveLength(1)
    expect(annotStore.offenesTextfeldId).toBe(felder[0].id)
  })

  it('Finger-Tipp ebenso (Modus Stift + Finger)', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('textfeld')
    werkzeuge.onPointerDown(ev('touch'))
    werkzeuge.onPointerUp(ev('touch'))
    expect(annotStore.items.filter(a => a.type === 'textbox')).toHaveLength(1)
  })

  it('Stift-Tipp ebenso', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('textfeld')
    werkzeuge.onPointerDown(ev('pen', { buttons: 1 }))
    werkzeuge.onPointerUp(ev('pen', { buttons: 0 }))
    expect(annotStore.items.filter(a => a.type === 'textbox')).toHaveLength(1)
  })

  it('Maus mit leichtem Zittern (< 6 px) zählt weiter als Tipp', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('textfeld')
    werkzeuge.onPointerDown(ev('mouse'))
    werkzeuge.onPointerMove(ev('mouse', { clientX: 202, clientY: 301 }))
    werkzeuge.onPointerUp(ev('mouse', { buttons: 0, clientX: 202, clientY: 301 }))
    expect(annotStore.items.filter(a => a.type === 'textbox')).toHaveLength(1)
  })

  it('Kommentar-Tipp funktioniert genauso (Gegenkontrolle)', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('kommentar')
    werkzeuge.onPointerDown(ev('mouse'))
    werkzeuge.onPointerUp(ev('mouse', { buttons: 0 }))
    expect(annotStore.items.filter(a => a.type === 'note')).toHaveLength(1)
  })
})
