// classifyDin277 gegen gemockte IFCSPACE-Daten: Klassifikationskette
// (Override → Pset-Reference → Namens-Heuristik → NUF7), Flächenquellen
// (Qto → Pset → BBox-Footprint) und die NGF-Aggregation.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { classifyDin277 } from '../services/Din277Classifier'

function box(w = 2, h = 3, d = 2) {
  return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, h, d))
}

function spaceItem(localId, globalId, name, { qtoArea, psets = [] } = {}) {
  const isDefinedBy = [...psets]
  if (qtoArea != null) {
    isDefinedBy.push({
      Name: { value: 'Qto_SpaceBaseQuantities' },
      HasProperties: [
        { Name: { value: 'NetFloorArea' }, NominalValue: { value: qtoArea } },
      ],
    })
  }
  return {
    _localId: { value: localId },
    GlobalId: { value: globalId },
    Name: { value: name },
    LongName: { value: '' },
    IsDefinedBy: isDefinedBy,
  }
}

function mockSpaces(items, boxes) {
  return {
    categoryGroups: [{
      name: 'IFCSPACE',
      groupData: { get: async () => new Map([['m1', items.map((_, i) => i + 1)]]) },
    }],
    fragmentsList: new Map([['m1', { getBoxes: async () => boxes }]]),
    fragmentsManager: { getData: async () => ({ m1: items }) },
    spatialTree: null,
  }
}

describe('classifyDin277', () => {
  it('klassifiziert über Namens-Heuristiken (Büro → NUF2, Flur → VF, Technik → TF)', async () => {
    const items = [
      spaceItem(1, 'G1', 'Büro 1.01', { qtoArea: 20 }),
      spaceItem(2, 'G2', 'Flur EG', { qtoArea: 10 }),
      spaceItem(3, 'G3', 'Technikraum', { qtoArea: 5 }),
    ]
    const { spaces } = await classifyDin277(mockSpaces(items, [box(), box(), box()]))
    expect(spaces.map(s => s.classCode)).toEqual(['NUF2', 'VF', 'TF'])
  })

  it('fällt ohne Treffer auf NUF7 zurück', async () => {
    const items = [spaceItem(1, 'G1', 'Raum 0815', { qtoArea: 12 })]
    const { spaces } = await classifyDin277(mockSpaces(items, [box()]))
    expect(spaces[0].classCode).toBe('NUF7')
  })

  it('nimmt die Fläche aus Qto vor dem BBox-Fallback', async () => {
    const items = [
      spaceItem(1, 'G1', 'Büro A', { qtoArea: 17.5 }),
      spaceItem(2, 'G2', 'Büro B', {}), // keine Psets → BBox-Footprint 2×2
    ]
    const { spaces } = await classifyDin277(mockSpaces(items, [box(), box(2, 3, 2)]))
    expect(spaces[0].area_m2).toBeCloseTo(17.5)
    expect(spaces[1].area_m2).toBeCloseTo(4)
  })

  it('lässt Overrides gewinnen und markiert die Quelle', async () => {
    const items = [spaceItem(1, 'G1', 'Büro 1.01', { qtoArea: 20 })]
    const { spaces } = await classifyDin277({
      ...mockSpaces(items, [box()]),
      overrides: new Map([['G1', 'VF']]),
    })
    expect(spaces[0].classCode).toBe('VF')
    expect(spaces[0].source).toBe('override')
  })

  it('aggregiert NGF = NUF + VF + TF', async () => {
    const items = [
      spaceItem(1, 'G1', 'Büro', { qtoArea: 20 }),
      spaceItem(2, 'G2', 'Flur', { qtoArea: 10 }),
      spaceItem(3, 'G3', 'Technik', { qtoArea: 5 }),
    ]
    const { totals } = await classifyDin277(mockSpaces(items, [box(), box(), box()]))
    expect(totals.NUF_total).toBeCloseTo(20)
    expect(totals.VF).toBeCloseTo(10)
    expect(totals.TF).toBeCloseTo(5)
    expect(totals.NGF).toBeCloseTo(35)
  })

  it('liefert leere Ergebnisse ohne Engine-Daten', async () => {
    const { spaces, totals } = await classifyDin277({})
    expect(spaces).toEqual([])
    expect(totals.NGF).toBe(0)
  })
})
