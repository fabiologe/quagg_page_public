// Haltungsbeschriftung (Sprint T1/AP-C): Achs-Polylinien aus web-ifc-Strukturen,
// Länge/Gefälle-Berechnung, Offset-Korrektur, Winkel-Normalisierung.

import { describe, expect, it } from 'vitest'
import {
  extractAxisPolylines, polylineLength, polylineGefaellePromille,
  longestSegment, normalizeTextAngle, formatGefaelle,
} from '../services/AxisAnnotations'

// ── Attrappe einer IfcQuelle ────────────────────────────────────────────────
//
// SIE HAT DIE FORM DER ECHTEN: `ids(typ, {untertypen})` und
// `zeile(id, {tief})`. Vorher stand hier ein `fakeWebIfc` mit
// `GetLineIDsWithType`/`GetLine` UND den Typkonstanten als Eigenschaften — eine
// Form, die es nie gab: die Konstanten sind Modul-Exporte von web-ifc, und
// `ifcLoader.webIfc` hatte nie ein Modell offen. Die Tests prüften also eine
// Schnittstelle, die in der CDE gar nicht existierte, und blieben grün, während
// im Betrieb nie eine Achse herauskam.

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

/** Ein Rohr OHNE Axis — so sehen Fabios echte Dateien aus. */
function extrudedPipe({ von = [0, 0, 100], richtung = [0, 0, 1], tiefe = 30, radius = 0.15 } = {}) {
  return {
    ObjectPlacement: null,
    Representation: {
      Representations: [{
        RepresentationIdentifier: { value: 'Body' },
        Items: [{
          Depth: { value: tiefe },
          ExtrudedDirection: { DirectionRatios: richtung.map(v => ({ value: v })) },
          Position: { Location: { Coordinates: von.map(v => ({ value: v })) } },
          SweptArea: { Radius: { value: radius } },
        }],
      }],
    },
  }
}

/** Quelle-Attrappe: `typen` ist eine Karte Typname → Produktliste. */
function fakeQuelle(typen) {
  const ids = new Map()
  const zeilen = new Map()
  let n = 1
  for (const [typ, produkte] of Object.entries(typen)) {
    const liste = []
    for (const p of produkte) { zeilen.set(n, p); liste.push(n); n++ }
    ids.set(typ, liste)
  }
  return {
    ids: (typ) => ids.get(typ) ?? [],
    zeile: (id) => zeilen.get(id) ?? null,
  }
}

describe('extractAxisPolylines — echte Achse', () => {
  it('liefert die Achse als zusammenhängende 3D-Polylinie (IFC-Z → Höhe)', () => {
    // Haltung: 30 m in IFC-X, Sohle fällt von 100,00 auf 99,85 → 5 ‰
    const q = fakeQuelle({ IFCPIPESEGMENT: [pipeProduct([ifcPoint(0, 0, 100), ifcPoint(30, 0, 99.85)])] })
    const [p] = extractAxisPolylines(q)
    expect(p.category).toBe('IFCPIPESEGMENT')
    expect(p.quelle).toBe('axisRep')
    expect(p.polyline).toHaveLength(2)
    expect(p.polyline[0]).toMatchObject({ x: 0, y: 100, z: 0 })
    expect(p.polyline[1].y).toBeCloseTo(99.85)
    expect(p.laenge).toBeCloseTo(30.0, 1)
    expect(p.gefaelle).toBeCloseTo(5, 3) // ‰
  })

  it('2D-Achse (nur X/Y) → gefaelle null, Länge 2D', () => {
    const q = fakeQuelle({ IFCPIPESEGMENT: [pipeProduct([ifcPoint(0, 0), ifcPoint(10, 0), ifcPoint(10, 20)])] })
    const [p] = extractAxisPolylines(q)
    expect(p.gefaelle).toBeNull()
    expect(p.laenge).toBeCloseTo(30)
    expect(p.polyline[2]).toMatchObject({ x: 10, z: 20 })
  })

  it('korrigiert den Koordinations-Offset (roh → Welt)', () => {
    const q = fakeQuelle({ IFCPIPESEGMENT: [pipeProduct([ifcPoint(555010, 0, 100), ifcPoint(555040, 0, 100)])] })
    const [p] = extractAxisPolylines(q, { coordOffset: { x: 555000, y: 0, z: 0 } })
    expect(p.polyline[0].x).toBeCloseTo(10)
    expect(p.polyline[1].x).toBeCloseTo(40)
  })
})

describe('extractAxisPolylines — Achse aus der EXTRUSION', () => {
  // Der Regelfall in der Praxis: Fabios beide Netze (51 und 1.025 Bauteile)
  // tragen NULL Axis-Repräsentationen. Ohne diesen Weg kam jede Achse aus der
  // Skelettierung des Netzes — Güte `geschaetzt`.

  it('gewinnt Anfang, Ende und DN aus dem gezogenen Profil', () => {
    const q = fakeQuelle({ IFCPIPESEGMENT: [extrudedPipe({
      von: [10, 20, 100], richtung: [0, 0, 1], tiefe: 30, radius: 0.15,
    })] })
    const [p] = extractAxisPolylines(q)
    expect(p.quelle).toBe('extrusion')
    // IFC-Z ist die Höhe: die Extrusion läuft nach oben.
    expect(p.polyline[0]).toMatchObject({ x: 10, y: 100, z: 20 })
    expect(p.polyline[1].y).toBeCloseTo(130)
    expect(p.laenge).toBeCloseTo(30)
    expect(p.dn).toBe(300)                    // Radius 0,15 m → DN 300
  })

  it('folgt einer schrägen Extrusionsrichtung', () => {
    const q = fakeQuelle({ IFCPIPESEGMENT: [extrudedPipe({
      von: [0, 0, 100], richtung: [1, 0, 0], tiefe: 50,
    })] })
    const [p] = extractAxisPolylines(q)
    expect(p.polyline[1]).toMatchObject({ x: 50, z: 0 })
    expect(p.polyline[1].y).toBeCloseTo(100)  // waagerecht ⇒ keine Höhenänderung
    expect(p.gefaelle).toBeNull()
  })

  it('die echte Achse gewinnt, wenn es beide gibt', () => {
    // Sie ist die Aussage des Autors; die Extrusion ist die Rekonstruktion.
    const mitBeidem = pipeProduct([ifcPoint(0, 0, 100), ifcPoint(30, 0, 99.85)])
    mitBeidem.Representation.Representations[0].Items = [{
      Depth: { value: 999 },
      ExtrudedDirection: { DirectionRatios: [{ value: 0 }, { value: 0 }, { value: 1 }] },
      Position: { Location: { Coordinates: [{ value: 0 }, { value: 0 }, { value: 0 }] } },
      SweptArea: { Radius: { value: 0.5 } },
    }]
    const [p] = extractAxisPolylines(fakeQuelle({ IFCPIPESEGMENT: [mitBeidem] }))
    expect(p.quelle).toBe('axisRep')
    expect(p.laenge).toBeCloseTo(30, 1)
  })

  it('eine Extrusion ohne Tiefe ergibt keine Achse', () => {
    const q = fakeQuelle({ IFCPIPESEGMENT: [extrudedPipe({ tiefe: 0 })] })
    expect(extractAxisPolylines(q)).toHaveLength(0)
  })

  it('Produkte ohne jede verwertbare Geometrie werden übersprungen', () => {
    const nackt = { Representation: { Representations: [{ RepresentationIdentifier: { value: 'Body' }, Items: [] }] } }
    expect(extractAxisPolylines(fakeQuelle({ IFCPIPESEGMENT: [nackt] }))).toHaveLength(0)
  })
})

describe('Ober- und Untertyp liefern dasselbe Rohr nicht zweimal', () => {
  it('zählt jedes Bauteil genau einmal', () => {
    // `IFCPIPESEGMENT` erbt von `IFCFLOWSEGMENT`, und beide stehen in der
    // Vorgabeliste. An der echten Datei kamen dadurch 48 statt 24 Achsen
    // heraus — jede Zählung, Beschriftung und Strangbildung wäre doppelt.
    const rohr = extrudedPipe()
    const q = {
      ids: () => [1],                       // BEIDE Typen nennen dieselbe Id
      zeile: (id) => (id === 1 ? rohr : null),
    }
    expect(extractAxisPolylines(q)).toHaveLength(1)
  })
})

describe('Ohne lebende Quelle passiert nichts — aber es wirft auch nicht', () => {
  it('gibt eine leere Liste statt zu werfen', () => {
    expect(extractAxisPolylines(null)).toEqual([])
    expect(extractAxisPolylines({})).toEqual([])
    expect(extractAxisPolylines({ ids: () => [1] })).toEqual([])
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
