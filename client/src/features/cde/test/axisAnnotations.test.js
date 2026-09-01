// Haltungsbeschriftung (Sprint T1/AP-C): Achs-Polylinien aus web-ifc-Strukturen,
// Länge/Gefälle-Berechnung, Offset-Korrektur, Winkel-Normalisierung.

import { describe, expect, it } from 'vitest'
import {
  extractAxisPolylines, polylineLength, polylineGefaellePromille,
  longestSegment, normalizeTextAngle, formatGefaelle,
} from '../services/AxisAnnotations'
import { typKonstante } from '../services/WebIfcTypen.js'

// ── Fake-webIfc ─────────────────────────────────────────────────────────────

function ifcPoint(...coords) {
  return { Coordinates: coords.map(v => ({ value: v })) }
}

function pipeProduct(points) {
  return {
    ObjectPlacement: null, // Identität
    Representation: {
      Representations: [
        { RepresentationIdentifier: { value: 'Body' }, Items: [] },
        { RepresentationIdentifier: { value: 'Axis' }, Items: [{ Points: points }] },
      ],
    },
  }
}

function fakeWebIfc(products) {
  return {
    IFCPIPESEGMENT: 999,
    GetLineIDsWithType: (mid, type) => (type === 999 ? products.map((_, i) => i + 1) : []),
    GetLine: (mid, id) => products[id - 1],
  }
}

describe('extractAxisPolylines', () => {
  it('liefert die Achse als zusammenhängende 3D-Polylinie (IFC-Z → Höhe)', () => {
    // Haltung: 30 m in IFC-X, Sohle fällt von 100,00 auf 99,85 → 5 ‰
    const webIfc = fakeWebIfc([pipeProduct([ifcPoint(0, 0, 100), ifcPoint(30, 0, 99.85)])])
    const [p] = extractAxisPolylines(webIfc, 0)
    expect(p.category).toBe('IFCPIPESEGMENT')
    expect(p.polyline).toHaveLength(2)
    expect(p.polyline[0]).toMatchObject({ x: 0, y: 100, z: 0 })
    expect(p.polyline[1].y).toBeCloseTo(99.85)
    expect(p.laenge).toBeCloseTo(30.0, 1)
    expect(p.gefaelle).toBeCloseTo(5, 3) // ‰
  })

  it('2D-Achse (nur X/Y) → gefaelle null, Länge 2D', () => {
    const webIfc = fakeWebIfc([pipeProduct([ifcPoint(0, 0), ifcPoint(10, 0), ifcPoint(10, 20)])])
    const [p] = extractAxisPolylines(webIfc, 0)
    expect(p.gefaelle).toBeNull()
    expect(p.laenge).toBeCloseTo(30)
    // IFC-Y wird three-z
    expect(p.polyline[2]).toMatchObject({ x: 10, z: 20 })
  })

  it('korrigiert den Koordinations-Offset (roh → Welt)', () => {
    const webIfc = fakeWebIfc([pipeProduct([ifcPoint(555010, 0, 100), ifcPoint(555040, 0, 100)])])
    const [p] = extractAxisPolylines(webIfc, 0, { coordOffset: { x: 555000, y: 0, z: 0 } })
    expect(p.polyline[0].x).toBeCloseTo(10)
    expect(p.polyline[1].x).toBeCloseTo(40)
  })

  it('Produkte ohne Axis-Repräsentation werden übersprungen', () => {
    const noAxis = { Representation: { Representations: [{ RepresentationIdentifier: { value: 'Body' }, Items: [] }] } }
    const webIfc = fakeWebIfc([noAxis])
    expect(extractAxisPolylines(webIfc, 0)).toHaveLength(0)
  })
})

describe('Geometrie-Helfer', () => {
  const pts = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, { x: 3, y: 0, z: 5 }]

  it('polylineLength summiert 3D', () => {
    expect(polylineLength(pts)).toBeCloseTo(6)
    expect(polylineLength([{ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 }])).toBeCloseTo(5)
  })

  it('polylineGefaellePromille: Δy / L2D', () => {
    const fall = [{ x: 0, y: 10, z: 0 }, { x: 100, y: 9.5, z: 0 }]
    expect(polylineGefaellePromille(fall)).toBeCloseTo(5)
    expect(polylineGefaellePromille([{ x: 0, y: 1, z: 0 }, { x: 10, y: 1, z: 0 }])).toBeNull()
  })

  it('longestSegment findet das längste Teilstück', () => {
    const seg = longestSegment(pts)
    expect(seg.len).toBeCloseTo(5)
    expect(seg).toMatchObject({ x1: 0, z1: 0, x2: 3, z2: 4 })
  })

  it('normalizeTextAngle hält Text lesbar (−90°…+90°]', () => {
    expect(normalizeTextAngle(135)).toBe(-45)
    expect(normalizeTextAngle(-170)).toBe(10)
    expect(normalizeTextAngle(45)).toBe(45)
    expect(normalizeTextAngle(90)).toBe(90)
  })

  it('formatGefaelle: Betrag mit ‰', () => {
    expect(formatGefaelle(5.23)).toBe('5,2 ‰')
    expect(formatGefaelle(-3)).toBe('3 ‰')
    expect(formatGefaelle(null)).toBe('')
  })
})

describe('Die Typkonstanten liegen am MODUL, nicht an der Instanz (13.1)', () => {
  /**
   * Der Fehler: `const typeConst = webIfc[typeName]` griff auf die
   * `IfcAPI`-INSTANZ. Die Konstanten (`IFCPIPESEGMENT = 3612865200`) sind aber
   * Modul-Exporte von web-ifc. Der Zugriff lieferte immer `undefined`, die
   * Schleife übersprang jede Kategorie, und `extractAxisPolylines` gab seit
   * jeher eine LEERE Liste zurück.
   *
   * Still betroffen: `GeometryResolver.getForm('axis')` bekam nie eine echte
   * Achs-Repräsentation und fiel immer auf `skeletonAxis` zurück — jede Achse
   * also „geschätzt", auch wo der Planer eine gezeichnet hat. Und die
   * Haltungsbeschriftung im Lageplan blieb leer.
   *
   * WARUM DER TEST DARÜBER ES NICHT SAH: die Attrappe oben TRÄGT die
   * Konstanten, weil der Testautor sie hingeschrieben hat. Die echte Instanz
   * trägt sie nicht. Wieder eine Schnittstelle geprüft, die es nicht gibt.
   */
  it('löst eine Konstante auf, die die Instanz NICHT kennt', () => {
    expect(typKonstante({}, 'IFCPIPESEGMENT')).toBeGreaterThan(0)
    expect(typKonstante(null, 'IFCMAPCONVERSION')).toBeGreaterThan(0)
  })

  it('lässt die Instanz gewinnen, wenn sie die Konstante doch trägt', () => {
    // Damit vorhandene Attrappen weiter funktionieren und eine künftige
    // Bibliotheksfassung, die sie mitliefert, Vorrang hat.
    expect(typKonstante({ IFCPIPESEGMENT: 42 }, 'IFCPIPESEGMENT')).toBe(42)
  })

  it('gibt null für einen Typ, den es in keinem Schema gibt', () => {
    // `null` heißt „kennt diese Fassung nicht" — bei IFCMAPCONVERSION in
    // einem IFC2x3-Modell ist das der Normalfall, kein Fehler.
    expect(typKonstante({}, 'IFCGIBTSNICHT')).toBe(null)
    expect(typKonstante({}, '')).toBe(null)
  })

  it('liest jetzt auch mit einer Instanz OHNE Konstanten', () => {
    // Der eigentliche Beweis. Diese Attrappe ist so gebaut, wie
    // `ifcLoader.webIfc` WIRKLICH aussieht: keine Typkonstanten als
    // Eigenschaften, und `GetLineIDsWithType` antwortet auf die ECHTE
    // Konstante aus dem Modul. Mit dem alten Code kam hier eine leere Liste.
    const produkte = [pipeProduct([ifcPoint(0, 0, 100), ifcPoint(30, 0, 99.85)])]
    const echteKonstante = typKonstante({}, 'IFCPIPESEGMENT')
    const wieDieEngine = {
      GetLineIDsWithType: (mid, type) =>
        (type === echteKonstante ? produkte.map((_, i) => i + 1) : []),
      GetLine: (mid, id) => produkte[id - 1],
    }
    expect(extractAxisPolylines(wieDieEngine, 0)).toHaveLength(1)
  })
})
