// @vitest-environment jsdom
//
// Ansicht drehen (Stufe 15): die reine Abbildung UND die Zeigerstrecke.
// Kernzusage: gedreht wird nur die ANZEIGE — was gespeichert wird, liegt
// weiter im unrotierten Seitenraum (sonst wanderte der Export mit).

import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  normalisiereDrehung, boxMasse, inhaltTransform,
  zuSeitenPunkt, vonSeitenPunkt, drehDelta, zuSeitenRect,
} from '../services/AnsichtRotation'

const W = 595, H = 842   // A4 hoch

describe('AnsichtRotation — reine Abbildung', () => {
  it('normalisiert auf 0/90/180/270', () => {
    expect(normalisiereDrehung(-90)).toBe(270)
    expect(normalisiereDrehung(360)).toBe(0)
    expect(normalisiereDrehung(450)).toBe(90)
    expect(normalisiereDrehung(undefined)).toBe(0)
  })

  it('90° und 270° tauschen die Anzeigemaße', () => {
    expect(boxMasse(W, H, 0)).toEqual({ breitePt: W, hoehePt: H })
    expect(boxMasse(W, H, 90)).toEqual({ breitePt: H, hoehePt: W })
    expect(boxMasse(W, H, 180)).toEqual({ breitePt: W, hoehePt: H })
    expect(boxMasse(W, H, 270)).toEqual({ breitePt: H, hoehePt: W })
  })

  it('Hin- und Rückabbildung sind exakt invers (alle vier Drehungen)', () => {
    for (const d of [0, 90, 180, 270]) {
      for (const [x, y] of [[0, 0], [W, 0], [W, H], [0, H], [123.5, 456.25]]) {
        const [lx, ly] = vonSeitenPunkt(x, y, d, W, H)
        const [rx, ry] = zuSeitenPunkt(lx, ly, d, W, H)
        expect(rx).toBeCloseTo(x, 9)
        expect(ry).toBeCloseTo(y, 9)
      }
    }
  })

  it('90° rechts: die obere linke Seitenecke landet oben RECHTS in der Box', () => {
    expect(vonSeitenPunkt(0, 0, 90, W, H)).toEqual([H, 0])
    // und die Box ist H breit — der Punkt liegt also genau auf der Kante
    expect(boxMasse(W, H, 90).breitePt).toBe(H)
  })

  it('jeder Punkt bleibt innerhalb der Anzeigebox', () => {
    for (const d of [90, 180, 270]) {
      const box = boxMasse(W, H, d)
      for (const [x, y] of [[0, 0], [W, 0], [W, H], [0, H]]) {
        const [lx, ly] = vonSeitenPunkt(x, y, d, W, H)
        expect(lx).toBeGreaterThanOrEqual(0)
        expect(ly).toBeGreaterThanOrEqual(0)
        expect(lx).toBeLessThanOrEqual(box.breitePt)
        expect(ly).toBeLessThanOrEqual(box.hoehePt)
      }
    }
  })

  it('drehDelta passt zur Punktabbildung (Ziehen verzieht nichts)', () => {
    for (const d of [0, 90, 180, 270]) {
      const a = zuSeitenPunkt(100, 100, d, W, H)
      const b = zuSeitenPunkt(140, 130, d, W, H)   // Delta (40, 30) am Schirm
      const [dx, dy] = drehDelta(40, 30, d)
      expect(dx).toBeCloseTo(b[0] - a[0], 9)
      expect(dy).toBeCloseTo(b[1] - a[1], 9)
    }
  })

  it('Rechtecke bleiben bei 90°-Vielfachen achsenparallel und flächengleich', () => {
    const r = { x: 10, y: 20, w: 100, h: 12 }   // eine Textzeile in der Box
    const s = zuSeitenRect(r, 90, W, H)
    expect(s.w).toBeCloseTo(12)                 // quer: Breite/Höhe tauschen
    expect(s.h).toBeCloseTo(100)
    expect(s.w * s.h).toBeCloseTo(r.w * r.h)
    expect(s.x).toBeGreaterThanOrEqual(0)
    expect(s.y).toBeGreaterThanOrEqual(0)
  })

  it('transform legt den Stapel passgenau in die Box (origin 0 0)', () => {
    expect(inhaltTransform(0, 200, 300)).toBe('')
    expect(inhaltTransform(90, 200, 300)).toBe('translate(300px, 0px) rotate(90deg)')
    expect(inhaltTransform(180, 200, 300)).toBe('translate(200px, 300px) rotate(180deg)')
    expect(inhaltTransform(270, 200, 300)).toBe('translate(0px, 200px) rotate(270deg)')
  })
})

// ── Zeigerstrecke: derselbe Bildschirmpunkt, gedrehte Ansicht ───────────────

vi.mock('../services/PdfEngine', () => ({
  oeffnePdf: vi.fn(),
  renderScaleFuer: () => 1,
  RenderingCancelledException: class RenderingCancelledException {},
}))

const { usePointerTools } = await import('../composables/usePointerTools')
const { useToolStore } = await import('../stores/useToolStore')
const { useAnnotStore } = await import('../stores/useAnnotStore')
const { useViewStore } = await import('../stores/useViewStore')

let zaehler = 0

async function aufbau(drehung) {
  setActivePinia(createPinia())
  const toolStore = useToolStore()
  const annotStore = useAnnotStore()
  const viewStore = useViewStore()
  await annotStore.laden(`dreh-dok-${++zaehler}`)
  viewStore.setzeDrehung(drehung)
  const wet = {
    starte: vi.fn(), punkt: vi.fn(), zeigeVorhersage: vi.fn(),
    beende: vi.fn(() => null), brich: vi.fn(), anzahlPunkte: () => 0,
    zeigeRadierer: vi.fn(), zeigeMarkerVorschau: vi.fn(), versteckeRadierer: vi.fn(),
  }
  const box = boxMasse(W, H, drehung)
  const werkzeuge = usePointerTools({
    scrollerRef: { value: { setPointerCapture: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
    gesten: {
      onNavPointerDown: vi.fn(), onNavPointerMove: vi.fn(), onNavPointerUp: vi.fn(),
      onNavPointerCancel: vi.fn(), brichAlle: vi.fn(), uebernimmZeiger: vi.fn(),
    },
    wetInkRef: { value: wet },
    toolStore, annotStore, viewStore,
    findeSeite: () => ({
      index: 0, breitePt: W, hoehePt: H, zoom: 1, drehung,
      boxBreitePt: box.breitePt, boxHoehePt: box.hoehePt,
      ursprungX: 0, ursprungY: 0, ursprungClientX: 0, ursprungClientY: 0,
    }),
  })
  return { werkzeuge, toolStore, annotStore, wet }
}

function maus(x, y) {
  return { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y }
}

describe('Zeiger bei gedrehter Ansicht', () => {
  it('Stempel landet auf dem zurückgedrehten Seitenpunkt, nicht auf dem Bildschirmpunkt', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau(90)
    toolStore.waehleWerkzeug('stempel')
    werkzeuge.onPointerDown(maus(100, 50))
    werkzeuge.onPointerUp({ ...maus(100, 50), buttons: 0 })
    const stempel = annotStore.items.find(a => a.type === 'stempel')
    expect(stempel).toBeTruthy()
    // Box-Punkt (100, 50) bei 90° ⇒ Seitenpunkt (50, 742)
    expect(stempel.x).toBeCloseTo(50)
    expect(stempel.y).toBeCloseTo(742)
  })

  it('ungedreht bleibt alles wie bisher', async () => {
    const { werkzeuge, toolStore, annotStore } = await aufbau(0)
    toolStore.waehleWerkzeug('stempel')
    werkzeuge.onPointerDown(maus(100, 50))
    werkzeuge.onPointerUp({ ...maus(100, 50), buttons: 0 })
    const stempel = annotStore.items.find(a => a.type === 'stempel')
    expect(stempel.x).toBeCloseTo(100)
    expect(stempel.y).toBeCloseTo(50)
  })

  it('der nasse Strich bekommt Seitenpunkte — und die Drehung zum Zeichnen mit', async () => {
    const { werkzeuge, toolStore, wet } = await aufbau(270)
    toolStore.waehleWerkzeug('stift')
    werkzeuge.onPointerDown(maus(200, 120))
    expect(wet.starte).toHaveBeenCalledTimes(1)
    const kontext = wet.starte.mock.calls[0][0]
    expect(kontext.drehung).toBe(270)
    expect(kontext.seiteBreitePt).toBe(W)
    expect(kontext.seiteHoehePt).toBe(H)
    // Box-Punkt (200, 120) bei 270° ⇒ Seitenpunkt (595-120, 200)
    const [x, y] = wet.punkt.mock.calls[0]
    expect(x).toBeCloseTo(W - 120)
    expect(y).toBeCloseTo(200)
  })
})
