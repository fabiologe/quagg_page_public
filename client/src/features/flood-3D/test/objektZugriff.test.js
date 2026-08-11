// Tests der Objekt-Zugriffsschicht: Domain-Clamp (K1-UX), Rechen-Spalten
// nach Polygon-Konvention + Kipp-Griff (B6), Vorfüllungs-Wasserspiegel per
// Griff (A1), Ecke-je-Punkt-Flags (B3).
import { describe, expect, it } from 'vitest'
import { erzeugeObjektZugriff } from '../components/pre/editor/objektZugriff'

function zugriff(spec = {}) {
  const store = {
    spec: {
      domain: { extent: [0, 0, 24, 18], z_min: 92, z_max: 100 },
      mesh: { base_cell: 0.5 },
      structures: [],
      ...spec,
    },
    selection: null,
  }
  return erzeugeObjektZugriff({ store, holeGroups: () => ({}) })
}

describe('clampDomain', () => {
  it('klemmt Punkte ans Modellgebiet', () => {
    const { clampDomain } = zugriff()
    expect(clampDomain([30, -5])).toEqual([24, 0])
    expect(clampDomain([12, 9])).toEqual([12, 9])
  })
  it('lässt den Mündungs-Überstand von Rohrachsen zu', () => {
    const { clampDomain, clampMarge } = zugriff()
    const marge = clampMarge({ type: 'culvert' })
    expect(marge).toBeCloseTo(2.0)   // max(4·0,5 m, 1 m)
    expect(clampDomain([-1.5, 9], marge)).toEqual([-1.5, 9])
    expect(clampDomain([-3.5, 9], marge)).toEqual([-2, 9])
  })
})

describe('translateObject mit Gebiets-Klemme', () => {
  it('stoppt eine Wand am Gebietsrand', () => {
    const { translateObject } = zugriff()
    const wand = { type: 'wall',
      alignment: { points: [[20, 9, 98], [23, 9, 98]] } }
    translateObject('structure', wand, 10, 0)
    // maximal +1 m möglich (23 → 24), nicht +10
    expect(wand.alignment.points[1][0]).toBeCloseTo(24)
    expect(wand.alignment.points[0][0]).toBeCloseTo(21)
  })
  it('klemmt Gebiet und Randbedingungen selbst nicht', () => {
    const { translateObject } = zugriff()
    const dom = { extent: [0, 0, 24, 18], z_min: 92, z_max: 100 }
    translateObject('domain', dom, 10, 0)
    expect(dom.extent[2]).toBeCloseTo(34)
  })
  it('lässt ein bereits draußen liegendes Objekt beweglich', () => {
    const { translateObject } = zugriff()
    const wand = { type: 'wall',
      alignment: { points: [[30, 9, 98], [40, 9, 98]] } }
    // zurück ins Gebiet ziehen muss gehen (loX > hiX → keine Klemme)
    translateObject('structure', wand, -20, 0)
    expect(wand.alignment.points[0][0]).toBeCloseTo(10)
  })
})

describe('Rechen (screen)', () => {
  const polygon = () => [[6, 8, 94], [6, 10, 94], [6, 10, 96], [6, 8, 96]]

  it('Grundriss-Zug bewegt die Spalte nach Polygon-Konvention, auch geneigt', () => {
    const { handleAccess } = zugriff()
    const s = { type: 'screen', plane_polygon: polygon() }
    // Ebene neigen: obere Ecken nach x = 7 kippen — im Grundriss liegen
    // die Spalten-Ecken jetzt NICHT mehr übereinander
    s.plane_polygon[2] = [7, 10, 96]
    s.plane_polygon[3] = [7, 8, 96]
    const acc = handleAccess('structure', s)
    acc.write(s, 0, [6.5, 8])
    // Ecke 0 und ihr Partner (n-1-i = 3) wandern gemeinsam
    expect(s.plane_polygon[0].slice(0, 2)).toEqual([6.5, 8])
    expect(s.plane_polygon[3].slice(0, 2)).toEqual([6.5, 8])
    // die andere Spalte bleibt stehen
    expect(s.plane_polygon[1].slice(0, 2)).toEqual([6, 10])
  })

  it('Kipp-Griff verschiebt nur die oberen Ecken (Unterkante = Scharnier)', () => {
    const { handleAccess } = zugriff()
    const s = { type: 'screen', plane_polygon: polygon() }
    const acc = handleAccess('structure', s)
    const n = 4
    expect(acc.points).toHaveLength(n + 1)
    expect(acc.zPunkte).toBe(n)
    // Kipp-Griff (Index n) von der Oberkanten-Mitte (6, 9) nach (7, 9)
    acc.write(s, n, [7, 9])
    expect(s.plane_polygon[2].slice(0, 2)).toEqual([7, 10])
    expect(s.plane_polygon[3].slice(0, 2)).toEqual([7, 8])
    expect(s.plane_polygon[0].slice(0, 2)).toEqual([6, 8])
    expect(s.plane_polygon[1].slice(0, 2)).toEqual([6, 10])
    // Strg-Zug am Kipp-Griff hebt beide obere Ecken
    acc.writeZ(s, n, 0.5)
    expect(s.plane_polygon[2][2]).toBeCloseTo(96.5)
    expect(s.plane_polygon[3][2]).toBeCloseTo(96.5)
    expect(s.plane_polygon[0][2]).toBeCloseTo(94)
  })
})

describe('Vorfüllung (A1)', () => {
  it('Griffe folgen dem Editor-Vertrag, Strg-Zug stellt den Spiegel', () => {
    const { handleAccess } = zugriff()
    const v = { polygon: [[2, 2], [8, 2], [8, 8], [2, 8]], level: 95.5 }
    const acc = handleAccess('vorfuellung', v)
    expect(acc.points).toHaveLength(4)
    expect(acc.zAt()).toBeCloseTo(95.5)
    acc.write(v, 1, [9, 3])
    expect(v.polygon[1]).toEqual([9, 3])
    acc.writeZ(v, 0, 0.4)
    expect(v.level).toBeCloseTo(95.9)
  })
})

describe('Ecke↔Kante (B3)', () => {
  it.each([
    ['wall', { type: 'wall', height: 2, thickness: 0.4,
      alignment: { points: [[2, 2, 98], [8, 2, 98]] } }],
    ['weir', { type: 'weir', crest_polyline: [[2, 2, 96], [8, 2, 96]] }],
    ['culvert', { type: 'culvert', axis: [[2, 2, 94], [8, 2, 94]] }],
  ])('%s meldet Punkt-z (zJePunkt)', (_typ, obj) => {
    const { handleAccess } = zugriff()
    expect(handleAccess('structure', obj).zJePunkt).toBe(true)
  })
  it('Vermessungskante hat Griffe mit Punkt-z', () => {
    const { handleAccess } = zugriff()
    const k = { polyline: [[2, 2, 96], [8, 2, 95.5]] }
    const acc = handleAccess('kante', k)
    expect(acc.zJePunkt).toBe(true)
    acc.writeZ(k, 1, 0.5)
    expect(k.polyline[1][2]).toBeCloseTo(96)
    expect(k.polyline[0][2]).toBeCloseTo(96)
  })
  it('Skalar-Höhen (Becken) melden KEIN Punkt-z', () => {
    const { handleAccess } = zugriff()
    const b = { type: 'basin', footprint: [[2, 2], [8, 2], [8, 8]],
      invert_level: 94, wall_height: 2 }
    expect(handleAccess('structure', b).zJePunkt).toBeUndefined()
  })
})
