/**
 * Inhalts-Zwischenspeicher (Sprint P, AP-6).
 *
 * Geprüft wird, was der Cache wirklich leisten muss: WANN wird neu gerechnet
 * und wann nicht. Die Sammler sind dafür durch Zähler ersetzt — es geht um die
 * Schlüssel, nicht um Geometrie.
 *
 * Der teuerste Fall ist der interessanteste: Ein Maßstabswechsel darf die
 * konkave Umriss-Vereinigung NICHT anfassen, nur die anschließende
 * Vereinfachung. Daran entscheidet sich, ob die Maßstabsleiter im
 * Bildschirmplan bedienbar ist oder jedes Mal sekundenlang hängt.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

const zaehler = {
  umrisse: 0, vereinfacht: 0, flaeche: 0, achsen: 0, schnitt: 0, footprint: 0, ausgewertet: 0,
}

vi.mock('../services/IfcPdfExporter.js', () => ({
  sammleUmrisseRoh: async () => { zaehler.umrisse++; return [{ category: 'X', rings: [] }] },
  vereinfacheUmrisse: (o, s) => { zaehler.vereinfacht++; return o?.map(x => ({ ...x, s })) ?? [] },
  sammleGelaendeflaeche: async () => { zaehler.flaeche++; return { positions: new Float64Array(9), triCount: 1 } },
  gelaendeZellweite: (sh, s) => (sh?.enabled && s ? Math.max(0.25, s / 1000) : null),
  werteGelaendeAus: () => { zaehler.ausgewertet++; return { slopeSegments: [], contourLevels: [] } },
  sammleAchsen: async () => { zaehler.achsen++; return [] },
  sammleSchnitt: () => { zaehler.schnitt++; return { sectionSegments: [], hatchPolygons: null } },
  sammleFootprints: async () => { zaehler.footprint++; return [] },
}))

const { erstellePlanInhalt } = await import('../services/PlanContent.js')

/** Minimale viewerApi mit umschaltbarer Schnittebene und Modell-Liste. */
function fakeApi(over = {}) {
  return {
    getFragmentsList: () => new Map([['m1', {}]]),
    getCategoryGroups: () => ({}),
    getFragmentsManager: () => ({}),
    getScene: () => ({}),
    getSectionCutPlane: () => null,
    getWebIfcAPI: () => ({ webIfc: {}, modelID: 0 }),
    ...over,
  }
}

const VOLL = {
  scaleRatio: 100,
  slopeHatch: { enabled: true, tickSpacingMm: 3 },
  contours: { enabled: true, interval: 0.5 },
  axisLabels: { enabled: true },
  footprints: true,
}

beforeEach(() => { for (const k of Object.keys(zaehler)) zaehler[k] = 0 })

describe('Zwischenspeicher', () => {
  it('sammelt beim ersten Mal alles', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole(VOLL)
    expect(zaehler).toMatchObject({ umrisse: 1, flaeche: 1, achsen: 1, schnitt: 1, footprint: 1 })
  })

  it('sammelt beim zweiten identischen Aufruf gar nichts', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole(VOLL)
    await inhalt.hole(VOLL)
    expect(zaehler).toMatchObject({ umrisse: 1, flaeche: 1, achsen: 1, schnitt: 1, footprint: 1 })
  })

  it('Maßstabswechsel rührt die teuren Sammlungen nicht an', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole({ ...VOLL, scaleRatio: 100 })
    const vorher = { ...zaehler }
    await inhalt.hole({ ...VOLL, scaleRatio: 500 })

    expect(zaehler.umrisse).toBe(vorher.umrisse)
    expect(zaehler.footprint).toBe(vorher.footprint)
    expect(zaehler.achsen).toBe(vorher.achsen)
    // die billigen Nachschritte laufen sehr wohl neu
    expect(zaehler.vereinfacht).toBe(vorher.vereinfacht + 1)
    expect(zaehler.ausgewertet).toBe(vorher.ausgewertet + 1)
    // die Gelände-Rasterweite hängt am Maßstab → Fläche neu
    expect(zaehler.flaeche).toBe(vorher.flaeche + 1)
  })

  it('ohne Böschung bleibt auch die Fläche vom Maßstab unberührt', async () => {
    const ohne = { ...VOLL, slopeHatch: null }
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole({ ...ohne, scaleRatio: 100 })
    await inhalt.hole({ ...ohne, scaleRatio: 1000 })
    expect(zaehler.flaeche).toBe(1)
  })

  it('Blattformat, Mitte und Zoom entwerten nichts', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole(VOLL)
    await inhalt.hole({ ...VOLL, format: 'A0', mitte: { x: 900, z: -900 }, pxProMm: 8, northAngle: 42 })
    expect(zaehler).toMatchObject({ umrisse: 1, flaeche: 1, achsen: 1, schnitt: 1, footprint: 1 })
  })

  it('bewegte Schnittebene erneuert Umrisse und Schnitt, aber nicht die FootPrints', async () => {
    let ebene = { normal: { x: 0, y: 1, z: 0 }, constant: 0 }
    const inhalt = erstellePlanInhalt(fakeApi({ getSectionCutPlane: () => ebene }))
    await inhalt.hole(VOLL)
    ebene = { normal: { x: 0, y: 1, z: 0 }, constant: -2.5 }
    await inhalt.hole(VOLL)

    expect(zaehler.umrisse).toBe(2)
    expect(zaehler.schnitt).toBe(2)
    expect(zaehler.footprint).toBe(1)
  })

  it('winziges Zittern der Schnittebene entwertet nichts', async () => {
    let ebene = { normal: { x: 0, y: 1, z: 0 }, constant: 0 }
    const inhalt = erstellePlanInhalt(fakeApi({ getSectionCutPlane: () => ebene }))
    await inhalt.hole(VOLL)
    ebene = { normal: { x: 0, y: 1, z: 0 }, constant: 1e-7 }
    await inhalt.hole(VOLL)
    expect(zaehler.schnitt).toBe(1)
  })

  it('neues Modell erneuert alles', async () => {
    let modelle = new Map([['m1', {}]])
    const inhalt = erstellePlanInhalt(fakeApi({ getFragmentsList: () => modelle }))
    await inhalt.hole(VOLL)
    modelle = new Map([['m1', {}], ['m2', {}]])
    await inhalt.hole(VOLL)
    expect(zaehler).toMatchObject({ umrisse: 2, flaeche: 2, achsen: 2, schnitt: 2, footprint: 2 })
  })

  it('Modell-Reihenfolge ist gleichgültig', async () => {
    let modelle = new Map([['a', {}], ['b', {}]])
    const inhalt = erstellePlanInhalt(fakeApi({ getFragmentsList: () => modelle }))
    await inhalt.hole(VOLL)
    modelle = new Map([['b', {}], ['a', {}]])
    await inhalt.hole(VOLL)
    expect(zaehler.umrisse).toBe(1)
  })
})

describe('entwerte', () => {
  it('wirft gezielt einzelne Teile weg', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole(VOLL)
    inhalt.entwerte('gelaende')
    await inhalt.hole(VOLL)
    expect(zaehler.flaeche).toBe(2)
    expect(zaehler.umrisse).toBe(1)
  })

  it('regeln trifft nur die Umrisse', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole(VOLL)
    inhalt.entwerte('regeln')
    await inhalt.hole(VOLL)
    expect(zaehler.umrisse).toBe(2)
    expect(zaehler.footprint).toBe(1)
  })

  it('alles räumt vollständig', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole(VOLL)
    inhalt.entwerte('alles')
    expect(inhalt._teile()).toEqual([])
    await inhalt.hole(VOLL)
    expect(zaehler).toMatchObject({ umrisse: 2, flaeche: 2, achsen: 2, schnitt: 2, footprint: 2 })
  })

  it('zählt den Stand hoch, damit die Ansicht neu zeichnet', () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    const vorher = inhalt.stand()
    inhalt.entwerte('modell')
    expect(inhalt.stand()).toBe(vorher + 1)
  })

  it('unbekannter Grund räumt nichts weg', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    await inhalt.hole(VOLL)
    inhalt.entwerte('quatsch')
    await inhalt.hole(VOLL)
    expect(zaehler.umrisse).toBe(1)
  })
})

describe('Ergebnisform', () => {
  it('liefert genau die Felder, die der Plotter erwartet', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    const r = await inhalt.hole(VOLL)
    expect(Object.keys(r).sort()).toEqual([
      'axisItems', 'contourLevels', 'footprintProducts', 'hatchPolygons',
      'outlines', 'sectionSegments', 'slopeSegments',
    ])
  })

  it('merkt sich das letzte Ergebnis für die flackerfreie Anzeige', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    expect(inhalt.letztes()).toBeNull()
    const r = await inhalt.hole(VOLL)
    expect(inhalt.letztes()).toBe(r)
    expect(inhalt.rechnetGerade()).toBe(false)
  })

  it('lässt abgeschaltete Teile weg, statt sie leer zu sammeln', async () => {
    const inhalt = erstellePlanInhalt(fakeApi())
    const r = await inhalt.hole({ scaleRatio: 100, footprints: false })
    expect(zaehler).toMatchObject({ flaeche: 0, achsen: 0, footprint: 0 })
    expect(r.axisItems).toBeNull()
    expect(r.footprintProducts).toBeNull()
  })
})
