// @vitest-environment jsdom
//
// Stufe 16: Bild platzieren über usePointerTools — Tipp legt das Bild
// zentriert an und wählt es aus, Drop platziert direkt, Radierer/Lasso
// treffen die Box, Werkzeugwechsel bricht das Warten ab.

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
import { platzierMasse } from '../services/BildImport'

let zaehler = 0
const A4 = { breitePt: 595, hoehePt: 842 }
const VORLAGE = { bildKey: 'k-1', mime: 'image/png', natBreite: 300, natHoehe: 200 }

async function aufbau({ seiteVorhanden = true } = {}) {
  setActivePinia(createPinia())
  const toolStore = useToolStore()
  const annotStore = useAnnotStore()
  const viewStore = useViewStore()
  await annotStore.laden(`bild-dok-${++zaehler}`)
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
    findeSeite: () => (seiteVorhanden ? {
      index: 0, ...A4, zoom: 1, drehung: 0, boxBreitePt: A4.breitePt, boxHoehePt: A4.hoehePt,
      ursprungX: 0, ursprungY: 0, ursprungClientX: 0, ursprungClientY: 0,
    } : null),
  })
  return { werkzeuge, toolStore, annotStore }
}

function maus(x, y, extra = {}) {
  return { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y, ...extra }
}
function tipp(werkzeuge, x, y) {
  werkzeuge.onPointerDown(maus(x, y))
  werkzeuge.onPointerUp(maus(x, y, { buttons: 0 }))
}

describe('Bild per Tipp platzieren', () => {
  it('legt das Bild zentriert unter dem Tipp an, wählt es aus, wechselt zum Lasso', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('bild')
    toolStore.bildZumPlatzieren = VORLAGE
    tipp(werkzeuge, 200, 300)
    const bild = annotStore.items.find(a => a.type === 'bild')
    expect(bild).toBeTruthy()
    const { w, h } = platzierMasse(300, 200, A4.breitePt, A4.hoehePt)
    expect(bild.w).toBeCloseTo(w)
    expect(bild.h).toBeCloseTo(h)
    expect(bild.x).toBeCloseTo(200 - w / 2)
    expect(bild.y).toBeCloseTo(300 - h / 2)
    expect(bild).toMatchObject({ bildKey: 'k-1', mime: 'image/png', natBreite: 300, natHoehe: 200 })
    expect(toolStore.aktivesWerkzeug).toBe('lasso')
    expect(annotStore.auswahl?.ids).toEqual([bild.id])
    expect(toolStore.bildZumPlatzieren).toBeNull()
    // Ein zweiter Tipp (jetzt Lasso-Werkzeug) legt nichts Neues an
    tipp(werkzeuge, 100, 100)
    expect(annotStore.items.filter(a => a.type === 'bild')).toHaveLength(1)
  })

  it('klemmt am Seitenrand in die Seite', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('bild')
    toolStore.bildZumPlatzieren = VORLAGE
    tipp(werkzeuge, 3, 4)
    const bild = annotStore.items.find(a => a.type === 'bild')
    expect(bild.x).toBe(0)
    expect(bild.y).toBe(0)
  })

  it('ohne Vorlage passiert beim Tipp nichts', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau()
    toolStore.waehleWerkzeug('bild')
    tipp(werkzeuge, 200, 300)
    expect(annotStore.items).toHaveLength(0)
  })

  it('Werkzeugwechsel bricht das Warten ab', async () => {
    const { toolStore } = await aufbau()
    toolStore.waehleWerkzeug('bild')
    toolStore.bildZumPlatzieren = VORLAGE
    toolStore.waehleWerkzeug('stift')
    expect(toolStore.bildZumPlatzieren).toBeNull()
  })
})

describe('platziereBildBei (Drop)', () => {
  it('platziert direkt an der Stelle', async () => {
    const { werkzeuge, annotStore, toolStore } = await aufbau()
    const annot = werkzeuge.platziereBildBei(150, 250, VORLAGE)
    expect(annot?.type).toBe('bild')
    expect(annot.x).toBeCloseTo(150 - annot.w / 2)
    expect(annotStore.auswahl?.ids).toEqual([annot.id])
    expect(toolStore.aktivesWerkzeug).toBe('lasso')
  })
  it('liefert null, wenn dort keine Seite liegt', async () => {
    const { werkzeuge, annotStore } = await aufbau({ seiteVorhanden: false })
    expect(werkzeuge.platziereBildBei(150, 250, VORLAGE)).toBeNull()
    expect(annotStore.items).toHaveLength(0)
  })
})

describe('Radierer und Lasso treffen das Bild', () => {
  async function mitBild() {
    const ctx = await aufbau()
    ctx.toolStore.waehleWerkzeug('bild')
    ctx.toolStore.bildZumPlatzieren = VORLAGE
    tipp(ctx.werkzeuge, 200, 300)
    ctx.annotStore.leereAuswahl()
    return ctx
  }

  it('Radierer über der Bildbox löscht es, daneben nicht', async () => {
    const { werkzeuge, toolStore, annotStore } = await mitBild()
    toolStore.waehleWerkzeug('radierer')
    werkzeuge.onPointerDown(maus(580, 830))   // weit weg, unten rechts
    werkzeuge.onPointerUp(maus(580, 830, { buttons: 0 }))
    expect(annotStore.items.filter(a => a.type === 'bild')).toHaveLength(1)
    werkzeuge.onPointerDown(maus(200, 300))   // Bildmitte
    werkzeuge.onPointerUp(maus(200, 300, { buttons: 0 }))
    expect(annotStore.items.filter(a => a.type === 'bild')).toHaveLength(0)
  })

  it('Lasso um den Mittelpunkt wählt das Bild aus', async () => {
    const { werkzeuge, toolStore, annotStore } = await mitBild()
    toolStore.waehleWerkzeug('lasso')
    werkzeuge.onPointerDown(maus(50, 150))
    for (const [x, y] of [[400, 150], [400, 450], [50, 450], [50, 160]]) werkzeuge.onPointerMove(maus(x, y))
    werkzeuge.onPointerUp(maus(50, 160, { buttons: 0 }))
    const bild = annotStore.items.find(a => a.type === 'bild')
    expect(annotStore.auswahl?.ids).toEqual([bild.id])
  })
})
