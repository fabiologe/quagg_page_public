// Mengen-Kette (Volume-Truth): Qto_*BaseQuantities vor BBox-Fallback,
// Herkunft wird pro Kategorie ausgewiesen.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { summarizeQuantities } from '../services/QuantitySummary'
import { box as solidBox } from './fixtures/solidFixtures'

function box(w = 1, h = 1, d = 1) {
  return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, h, d))
}

function wallWithQto(localId, { netVolume, netSideArea, length } = {}) {
  const props = []
  if (netVolume != null)   props.push({ Name: { value: 'NetVolume' },   NominalValue: { value: netVolume } })
  if (netSideArea != null) props.push({ Name: { value: 'NetSideArea' }, NominalValue: { value: netSideArea } })
  if (length != null)      props.push({ Name: { value: 'Length' },      NominalValue: { value: length } })
  return {
    _localId: { value: localId },
    IsDefinedBy: [{ Name: { value: 'Qto_WallBaseQuantities' }, HasProperties: props }],
  }
}

function mocks({ localIds, items, boxes, withManager = true }) {
  return {
    categoryGroups: [{
      name: 'IFCWALL',
      groupData: { get: async () => new Map([['m1', localIds]]) },
    }],
    fragmentsList: new Map([['m1', { getBoxes: async () => boxes }]]),
    fragmentsManager: withManager ? { getData: async () => ({ m1: items }) } : null,
  }
}

describe('summarizeQuantities', () => {
  it('nimmt NetVolume aus Qto vor der BBox-Näherung', async () => {
    const { byCategory, totals } = await summarizeQuantities({
      ...mocks({
        localIds: [1],
        items: [wallWithQto(1, { netVolume: 3.75, netSideArea: 12.5, length: 5 })],
        boxes: [box(10, 10, 10)], // BBox wäre 1000 m³ — darf nicht zählen
      }),
    })
    const wall = byCategory.get('IFCWALL')
    expect(wall.volume_m3).toBeCloseTo(3.75)
    expect(wall.area_m2).toBeCloseTo(12.5)
    expect(wall.length_m).toBeCloseTo(5)
    expect(wall.sources).toEqual({ qto: 1, mesh: 0, bbox: 0 })
    expect(totals.qtoShare).toBe(1)
  })

  it('fällt ohne Qto auf die BBox zurück und zählt die Herkunft', async () => {
    const { byCategory, totals } = await summarizeQuantities({
      ...mocks({
        localIds: [1, 2],
        items: [wallWithQto(1, { netVolume: 2 }), { _localId: { value: 2 }, IsDefinedBy: [] }],
        boxes: [box(), box(2, 1, 1)],
      }),
    })
    const wall = byCategory.get('IFCWALL')
    expect(wall.volume_m3).toBeCloseTo(2 + 2) // 2 aus Qto + 2 aus BBox
    expect(wall.sources).toEqual({ qto: 1, mesh: 0, bbox: 1 })
    expect(totals.qtoShare).toBeCloseTo(0.5)
  })

  it('funktioniert ohne fragmentsManager (reiner BBox-Modus)', async () => {
    const { byCategory } = await summarizeQuantities({
      ...mocks({ localIds: [1], items: [], boxes: [box(2, 2, 2)], withManager: false }),
    })
    expect(byCategory.get('IFCWALL').volume_m3).toBeCloseTo(8)
    expect(byCategory.get('IFCWALL').sources.bbox).toBe(1)
  })

  it('Sprint G: ohne Qto, aber geschlossenes Mesh → exaktes Mesh-Volumen (source mesh)', async () => {
    // Modell-Stub mit Fallback-Geometrie: geschlossener 2×3×4-Quader
    const tris = solidBox(2, 3, 4)
    const model = {
      getBoxes: async () => [box(10, 10, 10)], // BBox wäre 1000 m³ — darf nicht zählen
      getItem: () => ({
        getGeometry: async () => ({
          getTriangles: async () => [tris.map(([a, b, c]) => ({
            a: { x: a[0], y: a[1], z: a[2] },
            b: { x: b[0], y: b[1], z: b[2] },
            c: { x: c[0], y: c[1], z: c[2] },
          }))],
        }),
      }),
    }
    const { byCategory } = await summarizeQuantities({
      categoryGroups: [{ name: 'IFCWALL', groupData: { get: async () => new Map([['m1', [1]]]) } }],
      fragmentsList: new Map([['m1', model]]),
      fragmentsManager: { getData: async () => ({ m1: [{ _localId: { value: 1 }, IsDefinedBy: [] }] }) },
    })
    const wall = byCategory.get('IFCWALL')
    expect(wall.volume_m3).toBeCloseTo(24, 6)
    expect(wall.sources).toEqual({ qto: 0, mesh: 1, bbox: 0 })
  })

  it('aggregiert nach KG, wenn perElementKg geliefert wird', async () => {
    const { byCategory } = await summarizeQuantities({
      ...mocks({
        localIds: [1],
        items: [wallWithQto(1, { netVolume: 4 })],
        boxes: [box()],
      }),
      perElementKg: new Map([['m1|1', '330']]),
    })
    expect(byCategory.get('IFCWALL').byKg.get('330')).toEqual({ count: 1, volume_m3: 4 })
  })
})
