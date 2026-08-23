/**
 * Sicherheitsnetz für `drawVectorPlan` (Sprint P, AP-0).
 *
 * Zweck: Der Plotter ist die Fachlogik des Planexports — DIN-Strichstärken,
 * Zeichenreihenfolge, Clipping, Label-Kollision. Beim anstehenden Umbau
 * (Beschaffung raus aus dem Zeichnen, AP-1) darf sich an seiner AUSGABE nichts
 * ändern, nur an seiner Verkabelung. Dieser Test hält die Ausgabe fest.
 *
 * Deshalb sind die Erwartungen bewusst als geteilte Konstanten formuliert: nach
 * AP-1 ändert sich die Aufrufform von `drawVectorPlan` (vorgerechnete Segmente
 * statt Fake-Szene / Fake-web-ifc), die Erwartungen bleiben Zeichen für Zeichen
 * gleich. Ändert sich doch eine, ist das eine Regression und kein Umbau.
 *
 * Papierrechnung dieses Tests (bewusst so gewählt, dass sie im Kopf aufgeht):
 *   Blattfenster M=10, dw=dh=100 → Zeichenfläche [10..110] mm
 *   Kamera ±50 m um den Ursprung → Papier = Welt + 60
 *   also: toX(0) = 60 (Blattmitte), toX(10) = 70, toY(10) = 70
 */

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  drawVectorPlan, computeSectionContour, extractFootprintSegments,
} from '../services/IfcVectorPlotter'
import { erstelleMockDoc } from './helpers/mockDoc'

const M = 10, DW = 100, DH = 100

// Kamera als schlichtes Objekt — makePaperTransform liest nur left/right/top/
// bottom/zoom/position. (Nach AP-2 ist das ohnehin ein Frustum-POJO.)
const KAMERA = {
  left: -50, right: 50, top: 50, bottom: -50, zoom: 1,
  position: { x: 0, y: 100, z: 0 },
}

/** Welt → Papier, wie der Plotter es rechnet. Für lesbare Erwartungen. */
const pX = (wx) => wx + 60
const pY = (wz) => wz + 60

/** Geschlossener Ring (5 Punkte = 4 Kanten) um ein achsparalleles Rechteck. */
function ring(x1, z1, x2, z2) {
  return [[x1, z1], [x2, z1], [x2, z2], [x1, z2], [x1, z1]]
}

/** Ein Stil ohne Schraffur — hält die Erwartungen frei von HatchPatterns. */
const STIL = { TESTCAT: { r: 10, g: 20, b: 30, w: 0.35, hatch: 'none' } }

async function zeichne(opts) {
  const doc = erstelleMockDoc()
  drawVectorPlan(doc, KAMERA, M, DW, DH, opts)
  return doc
}

/** Ein Dreieck, das die Ebene y=0 kreuzt — Fixture für die Schnittkontur. */
function dreieckSzene() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, -1, 0, 10, -1, 0, 0, 1, 0,
  ], 3))
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  mesh.updateMatrixWorld(true)
  const scene = new THREE.Scene()
  scene.add(mesh)
  return scene
}

// ── Konturen und Clipping ────────────────────────────────────────────────────

describe('drawVectorPlan — Element-Konturen', () => {
  const OUTLINES = [
    // A: ganz innen  → 4 Kanten
    { category: 'TESTCAT', rings: [ring(-10, -10, 10, 10)] },
    // B: ganz außerhalb des Blatts → 0 Kanten (Cohen-Sutherland verwirft alles)
    { category: 'TESTCAT', rings: [ring(200, 200, 210, 210)] },
    // C: ragt rechts über den Blattrand → 3 Kanten, eine davon beschnitten
    { category: 'TESTCAT', rings: [ring(40, -5, 60, 5)] },
  ]

  it('zeichnet nur, was aufs Blatt fällt', async () => {
    const doc = await zeichne({ outlines: OUTLINES, styleMap: STIL, showLabels: false })
    expect(doc.zaehl('line')).toBe(7)          // 4 + 0 + 3
  })

  it('beschneidet die überstehende Kante am Blattrand statt sie zu verwerfen', async () => {
    const doc = await zeichne({ outlines: OUTLINES, styleMap: STIL, showLabels: false })
    const linien = doc.nur('line').map(c => c.args.map(v => Math.round(v * 1000) / 1000))
    // Unterkante von C läuft von x=40 (Papier 100) bis x=60 (Papier 120),
    // das Blatt endet bei 110 → der sichtbare Rest ist 100 → 110.
    expect(linien).toContainEqual([pX(40), pY(-5), M + DW, pY(-5)])
    // Die rechte Kante liegt komplett jenseits des Rands und fehlt ganz.
    expect(linien.some(l => l[0] === pX(60) && l[2] === pX(60))).toBe(false)
  })

  it('führt Farbe und Strichstärke aus dem Stil mit', async () => {
    const doc = await zeichne({ outlines: [OUTLINES[0]], styleMap: STIL, showLabels: false })
    const linie = doc.nur('line')[0]
    expect(linie.stil.draw).toEqual({ r: 10, g: 20, b: 30 })
    expect(linie.stil.breite).toBe(0.35)
  })

  it('erste und letzte Aufrufe stehen fest', async () => {
    const doc = await zeichne({ outlines: [OUTLINES[0]], styleMap: STIL, showLabels: false })
    expect(doc.knapp(4)).toEqual([
      ['setDrawColor', 10, 20, 30],
      ['setLineWidth', 0.35],
      ['setLineDashPattern', [], 0],
      ['line', 50, 50, 70, 50],
    ])
    // Aufräumen am Ende: Strichmuster zurück, Zeichenfarbe auf Schwarz
    expect(doc.knapp(2, doc.calls.length - 2)).toEqual([
      ['setLineDashPattern', [], 0],
      ['setDrawColor', 0],
    ])
  })

  it('BBox-Ersatzkonturen werden dünner und gestrichelt gezeichnet', async () => {
    const doc = await zeichne({
      outlines: [{ category: 'TESTCAT', rings: [ring(-10, -10, 10, 10)], fallback: 'bbox' }],
      styleMap: STIL, showLabels: false,
    })
    const linie = doc.nur('line')[0]
    expect(linie.stil.breite).toBe(0.12)       // min(0.35, 0.12)
    expect(linie.stil.dash).toEqual([0.5, 0.5])
  })

  it('Bauteile über der Schnittebene werden gestrichelt und ohne Schraffur gezeichnet', async () => {
    const doc = await zeichne({
      outlines: [{ category: 'TESTCAT', rings: [ring(-10, -10, 10, 10)], aboveCut: true }],
      styleMap: { TESTCAT: { r: 10, g: 20, b: 30, w: 0.35, hatch: 'concrete' } },
      showLabels: false,
    })
    const linie = doc.nur('line')[0]
    expect(linie.stil.breite).toBeCloseTo(0.245, 3)   // 0.35 × 0.7, DIN 1356-1 Tab. 2 Z. 7
    expect(linie.stil.dash).toEqual([0.5, 0.8])
  })
})

// ── Label-Kollision ──────────────────────────────────────────────────────────

describe('drawVectorPlan — Beschriftung', () => {
  // Sechs deckungsgleiche Bauteile, alle beschriftet. Es gibt fünf Ankerplätze
  // (Mitte, oben, unten, rechts, links) — das sechste Label muss entfallen,
  // statt sich auf ein anderes zu legen.
  const SECHS = Array.from({ length: 6 }, () => ({
    category: 'TESTCAT', rings: [ring(-1.5, -1.5, 1.5, 1.5)], label: 'AB',
  }))

  it('vergibt jeden Ankerplatz genau einmal und lässt den Rest weg', async () => {
    const doc = await zeichne({ outlines: SECHS, styleMap: STIL })
    // je Label 4 Halo-Texte + 1 echter = 5 Aufrufe
    expect(doc.zaehl('text')).toBe(25)
  })

  it('ohne Kollisionsprüfung landen alle Labels aufeinander', async () => {
    const doc = await zeichne({
      outlines: SECHS, styleMap: STIL, labelOpts: { collisionCheck: false },
    })
    expect(doc.zaehl('text')).toBe(30)
  })

  it('setzt Labels mit weißem Halo und mittiger Grundlinie', async () => {
    const doc = await zeichne({
      outlines: [SECHS[0]], styleMap: STIL,
    })
    const texte = doc.nur('text')
    expect(texte).toHaveLength(5)
    expect(texte.slice(0, 4).every(t => t.stil.text.r === 255)).toBe(true)
    expect(texte[4].stil.text).toEqual({ r: 0, g: 0, b: 0 })
    expect(texte[4].args[3]).toEqual({ align: 'center', baseline: 'middle' })
    expect(texte[4].args[1]).toBe(60)          // Blattmitte
  })

  it('überspringt zu kleine Bauteile', async () => {
    const doc = await zeichne({
      outlines: [{ category: 'TESTCAT', rings: [ring(-0.5, -0.5, 0.5, 0.5)], label: 'AB' }],
      styleMap: STIL,
    })
    expect(doc.zaehl('text')).toBe(0)          // 1 mm < minElementSize 1,5 mm
  })
})

// ── Gelände: Höhenlinien und Böschung ────────────────────────────────────────

describe('drawVectorPlan — Gelände', () => {
  it('zeichnet Haupt- und Nebenhöhenlinien mit verschiedenen Strichstärken', async () => {
    const doc = await zeichne({
      contours: [
        { level: 100.0, major: true, polylines: [[{ x: -40, z: 0 }, { x: 40, z: 0 }]] },
        { level: 100.5, major: false, polylines: [[{ x: -40, z: 5 }, { x: 40, z: 5 }]] },
      ],
    })
    const linien = doc.nur('line')
    expect(linien).toHaveLength(2)
    expect(linien[0].stil.breite).toBe(0.35)   // Hauptlinie
    expect(linien[1].stil.breite).toBe(0.13)   // Nebenlinie
  })

  it('beschriftet nur Hauptlinien, und nur ab 30 mm Papierlänge', async () => {
    const doc = await zeichne({
      contours: [
        // 80 m → 80 mm Papier: lang genug
        { level: 100.0, major: true, polylines: [[{ x: -40, z: 0 }, { x: 40, z: 0 }]] },
        // 10 m → 10 mm Papier: zu kurz für eine Kote
        { level: 101.0, major: true, polylines: [[{ x: -5, z: 20 }, { x: 5, z: 20 }]] },
      ],
    })
    const echte = doc.nur('text').filter(t => t.stil.text.r !== 255)
    expect(echte.map(t => t.args[0])).toEqual(['100.00'])
  })

  it('gruppiert die Böschungsschraffur nach Kantenart', async () => {
    const doc = await zeichne({
      slopeHatch: [
        { x1: -10, z1: 0, x2: 10, z2: 0, kind: 'oberkante' },
        { x1: -10, z1: 5, x2: 10, z2: 5, kind: 'unterkante' },
        { x1: 0, z1: 0, x2: 0, z2: 5, kind: 'tick' },
      ],
    })
    const linien = doc.nur('line')
    // Reihenfolge unterkante → tick → tickHalf → oberkante (weniger Stilwechsel)
    expect(linien.map(l => l.stil.breite)).toEqual([0.18, 0.18, 0.5])
    // Oberkante kräftig braun, Striche grün — die Vermessungs-Konvention
    expect(linien[2].stil.draw).toEqual({ r: 141, g: 110, b: 99 })
    expect(linien[1].stil.draw).toEqual({ r: 51, g: 105, b: 30 })
  })
})

// ── Schnittkontur (nach AP-1: vorgerechnete Segmente statt Szene) ────────────

describe('drawVectorPlan — Schnittkontur', () => {
  // Erwartung, die den Umbau überlebt: ein Dreieck, das die Schnittebene
  // kreuzt, ergibt genau eine schwarze 0,5-mm-Linie.
  const ERWARTET = { anzahl: 1, breite: 0.5, farbe: { r: 0, g: 0, b: 0 } }

  it('schneidet Dreiecke an der Schnittebene', async () => {
    // Die Naht, die AP-1 gezogen hat: sammeln …
    const segmente = computeSectionContour(
      dreieckSzene(), new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    )
    expect(segmente).toHaveLength(1)
    // … und getrennt davon zeichnen.
    const doc = await zeichne({ sectionSegments: segmente })

    const linien = doc.nur('line')
    expect(linien).toHaveLength(ERWARTET.anzahl)
    expect(linien[0].stil.breite).toBe(ERWARTET.breite)
    expect(linien[0].stil.draw).toEqual(ERWARTET.farbe)
    // Schnittpunkte bei x=5 und x=0 auf Höhe z=0
    expect(linien[0].args).toEqual([pX(5), pY(0), pX(0), pY(0)])
  })
})

// ── FootPrint aus web-ifc (nach AP-1: vorgerechnete Produkte) ────────────────

describe('drawVectorPlan — FootPrint-Kurven', () => {
  function fakeWebIfc() {
    return {
      IFCWALL: 999,
      GetLineIDsWithType: (_mid, typ) => (typ === 999 ? [1] : []),
      GetLine: () => ({
        ObjectPlacement: null,
        Representation: {
          Representations: [{
            RepresentationIdentifier: 'FootPrint',
            Items: [{
              Points: [
                { Coordinates: [0, 0] },
                { Coordinates: [10, 0] },
                { Coordinates: [10, 10] },
              ],
            }],
          }],
        },
      }),
    }
  }

  it('zieht offene Polylinien zu geschlossenen Umrissen zusammen', async () => {
    const produkte = await extractFootprintSegments(fakeWebIfc(), 0, null)
    // 3 Punkte → 2 Kanten + 1 Schlusskante
    expect(produkte[0].segments).toHaveLength(3)

    const doc = await zeichne({ footprintProducts: produkte })
    expect(doc.zaehl('line')).toBe(3)
    expect(doc.nur('line')[2].args).toEqual([pX(10), pY(10), pX(0), pY(0)])
  })

  it('setzt das Strichmuster am Ende zurück', async () => {
    const doc = await zeichne({
      footprintProducts: await extractFootprintSegments(fakeWebIfc(), 0, null),
    })
    const letzte = doc.calls[doc.calls.length - 1]
    expect([letzte.name, letzte.args[0]]).toEqual(['setLineDashPattern', []])
  })
})

// ── Blattelemente ────────────────────────────────────────────────────────────

describe('drawVectorPlan — Maßstabsleiste und Nordpfeil', () => {
  it('rundet die Leiste auf einen glatten Meterwert', async () => {
    const doc = await zeichne({ scaleBar: true, scaleRatio: 100 })
    // 40 mm bei 1:100 wären 4 m → auf 5 m gerundet, also 50 mm Leiste
    const rechtecke = doc.nur('rect')
    expect(rechtecke).toHaveLength(2)
    expect(rechtecke[0].args).toEqual([55, 102, 25, 2, 'F'])
    expect(rechtecke[1].args).toEqual([80, 102, 25, 2, 'S'])
    const texte = doc.nur('text').map(t => t.args[0])
    expect(texte).toEqual(['0', '2.5', '5 m', '1 : 100', 'N'])
  })

  it('dreht den Nordpfeil im Uhrzeigersinn', async () => {
    const doc = await zeichne({ scaleBar: true, scaleRatio: 100, northAngle: 90 })
    const n = doc.nur('text').find(t => t.args[0] === 'N')
    // Bei 90° wandert die Spitze von oben nach rechts: cx + (r + 2,2)
    expect(n.args[1]).toBeCloseTo(100 + 9.2, 3)
    expect(n.args[2]).toBeCloseTo(22 + 1, 3)
  })

  it('zeichnet ohne Maßstab weder Leiste noch Pfeil', async () => {
    const doc = await zeichne({ scaleBar: true })
    expect(doc.calls).toHaveLength(0)
  })
})

// ── Aufsätze: Issues und Messungen ───────────────────────────────────────────

describe('drawVectorPlan — Aufsätze', () => {
  it('setzt Issue-Pins mit weißem Rand und Nummer', async () => {
    const doc = await zeichne({
      annotations: [{ position: [0, 0, 0], idx: 7, text: 'Riss', color: '#ff0000' }],
    })
    const kreis = doc.nur('circle')[0]
    expect(kreis.args).toEqual([60, 60, 1.6, 'FD'])
    expect(kreis.stil.fill).toEqual({ r: 255, g: 0, b: 0 })
    expect(doc.nur('text')[0].args[0]).toBe('7')
  })

  it('zeichnet Messungen in Weltkoordinaten mit Endpunkten und Maßzahl', async () => {
    const doc = await zeichne({
      measurements: [{ p1: { x: -10, y: 0, z: -10 }, p2: { x: 10, y: 0, z: 10 }, dist: 28.284 }],
    })
    expect(doc.nur('line')[0].args).toEqual([50, 50, 70, 70])
    expect(doc.zaehl('circle')).toBe(2)
    const echter = doc.nur('text').filter(t => t.stil.text.r === 255 && t.stil.text.g === 152)
    expect(echter[0].args[0]).toBe('28.3 m')
  })
})

// ── Die Reihenfolge ist Fachlogik: was zuletzt gezeichnet wird, liegt oben ───

describe('drawVectorPlan — Zeichenreihenfolge', () => {
  it('legt Gelände unten, Blattelemente oben', async () => {
    const doc = await zeichne({
      sectionSegments: computeSectionContour(
        dreieckSzene(), new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      ),
      contours: [{ level: 100, major: false, polylines: [[{ x: -40, z: -20 }, { x: 40, z: -20 }]] }],
      slopeHatch: [{ x1: -10, z1: 0, x2: 10, z2: 0, kind: 'tick' }],
      utmGrid: { offset: { x: 0, z: 0 }, spacing: 50 },
      outlines: [{ category: 'TESTCAT', rings: [ring(-10, -10, 10, 10)], label: 'AB' }],
      styleMap: STIL,
      ifcGridAxes: [{ start: { x: -30, z: -30 }, end: { x: 30, z: -30 }, name: 'A' }],
      axisLabels: [{ polyline: [{ x: -20, y: 0, z: 20 }, { x: 20, y: 0, z: 20 }], label: 'DN300', fontMm: 2 }],
      annotations: [{ position: [0, 0, 0], idx: 1, text: '', color: '#ff0000' }],
      measurements: [{ p1: { x: -5, y: 0, z: 30 }, p2: { x: 5, y: 0, z: 30 }, dist: 10 }],
      scaleBar: true, scaleRatio: 100,
    })

    const idx = (pred) => doc.ersterIndex(pred)
    const hoehenlinie = idx(c => c.name === 'line' && c.stil.breite === 0.13)
    const boeschung   = idx(c => c.name === 'line' && c.stil.draw.g === 105)
    const utm         = idx(c => c.name === 'line' && c.stil.draw.r === 70 && c.stil.draw.g === 70)
    const kontur      = idx(c => c.name === 'line' && c.stil.draw.r === 10 && c.stil.draw.b === 30)
    const schnitt     = idx(c => c.name === 'line' && c.stil.breite === 0.5 && c.stil.draw.r === 0)
    const achse       = idx(c => c.name === 'line' && c.stil.draw.r === 110)
    const label       = idx(c => c.name === 'text' && c.args[3]?.baseline === 'middle')
    const achstext    = idx(c => c.name === 'text' && c.args[0] === 'DN300')
    const pin         = idx(c => c.name === 'circle' && c.args[2] === 1.6)
    const messung     = idx(c => c.name === 'line' && c.stil.draw.g === 152)
    const leiste      = idx(c => c.name === 'rect')

    const folge = [hoehenlinie, boeschung, utm, kontur, schnitt, achse,
                   label, achstext, pin, messung, leiste]
    expect(folge.every(i => i >= 0)).toBe(true)
    expect(folge).toEqual([...folge].sort((a, b) => a - b))
  })
})
