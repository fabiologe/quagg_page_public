// GeometryResolver (Sprint G): Pfadwahl im Ableitungsgraphen, Element-Cache,
// Provenienz-Durchreichung, Größen-Kaskaden.

import { describe, expect, it, vi } from 'vitest'
import { createGeometryResolver } from '../services/geometry/GeometryResolver'
import { toPositions, box, tube } from './fixtures/solidFixtures'

// ── Stubs ───────────────────────────────────────────────────────────────────

/** Fake-FragmentsModel über den Fallback-Pfad (getItem→getGeometry→getTriangles). */
function stubModel(trisByLocalId) {
  const getItemSpy = vi.fn((localId) => ({
    getGeometry: async () => ({
      getTriangles: async () => {
        const tris = trisByLocalId[localId]
        if (!tris) return []
        return [tris.map(([a, b, c]) => ({
          a: { x: a[0], y: a[1], z: a[2] },
          b: { x: b[0], y: b[1], z: b[2] },
          c: { x: c[0], y: c[1], z: c[2] },
        }))]
      },
    }),
  }))
  return {
    getItem: getItemSpy,
    getBoxes: async (ids) => ids.map((id) => {
      const tris = trisByLocalId[id]
      if (!tris) return { isEmpty: () => true }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const tri of tris) for (const [x, y, z] of tri) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
      }
      return { isEmpty: () => false, min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
    }),
    _getItemSpy: getItemSpy,
  }
}

function stubDeps({ trisByLocalId, category = 'IFCPIPESEGMENT', qtoByLocalId = null, webIfcApis = [], coordOffsets = {} }) {
  const localIds = Object.keys(trisByLocalId).map(Number)
  const model = stubModel(trisByLocalId)
  return {
    deps: {
      categoryGroups: [{ name: category, groupData: { get: async () => new Map([['m1', localIds]]) } }],
      fragmentsList: new Map([['m1', model]]),
      fragmentsManager: qtoByLocalId ? {
        getData: async () => ({
          m1: localIds.map(id => ({
            _localId: { value: id },
            IsDefinedBy: qtoByLocalId[id]
              ? [{ Name: { value: 'Qto_Test' }, HasProperties: Object.entries(qtoByLocalId[id]).map(([k, v]) => ({ Name: { value: k }, NominalValue: { value: v } })) }]
              : [],
          })),
        }),
      } : null,
      webIfcApis, coordOffsets,
    },
    model,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('getForm', () => {
  it('surface: geschlossener Solid → heightfield mit Provenienz-Pfad', async () => {
    const { deps } = stubDeps({ trisByLocalId: { 1: box(10, 5, 10) }, category: 'IFCCIVILELEMENT' })
    const resolver = createGeometryResolver(deps)
    const surf = await resolver.forCategory(['IFCCIVILELEMENT']).getForm('surface')
    expect(surf.data.triCount).toBeGreaterThan(10)
    expect(surf.source).toBe('mesh→surface(heightfield)')
    expect(surf.path).toEqual(['src:fragments', 'mesh', 'surface:heightfield'])
  })

  it('axis: Axis-Repräsentation gewinnt vor dem Skelett', async () => {
    const { tris } = tube()
    const fakeWebIfc = {
      IFCPIPESEGMENT: 9,
      GetLineIDsWithType: (mid, t) => (t === 9 ? [1] : []),
      GetLine: () => ({
        ObjectPlacement: null,
        Representation: { Representations: [{
          RepresentationIdentifier: { value: 'Axis' },
          Items: [{ Points: [
            { Coordinates: [{ value: 0 }, { value: 0 }, { value: 100 }] },
            { Coordinates: [{ value: 10 }, { value: 0 }, { value: 100 }] },
          ] }],
        }] },
      }),
    }
    const { deps } = stubDeps({
      trisByLocalId: { 1: tris },
      webIfcApis: [{ webIfc: fakeWebIfc, modelID: 0, fragmentModelId: 'm1' }],
    })
    const resolver = createGeometryResolver(deps)
    const axis = await resolver.forCategory(['IFCPIPESEGMENT']).getForm('axis')
    expect(axis.perElement[0].source).toBe('axisRep')
    expect(axis.perElement[0].path).toEqual(['src:axisRep', 'axis'])
    expect(axis.perElement[0].polyline[0].y).toBe(100) // IFC-Z → Höhe
  })

  it('axis: ohne Axis-Rep → Skelett aus dem Mesh (ProVI-Fall)', async () => {
    const { tris, axisDir } = tube()
    const { deps } = stubDeps({ trisByLocalId: { 1: tris } })
    const resolver = createGeometryResolver(deps)
    const axis = await resolver.forCategory(['IFCPIPESEGMENT']).getForm('axis')
    const entry = axis.perElement[0]
    expect(entry.source).toBe('mesh')
    expect(entry.path).toContain('axis:skelett')
    expect(entry.polyline.length).toBeGreaterThanOrEqual(2)
    // Richtung des Skeletts ≈ Rohrachse
    const a = entry.polyline[0], b = entry.polyline[entry.polyline.length - 1]
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const dot = Math.abs(((b.x - a.x) * axisDir[0] + (b.y - a.y) * axisDir[1] + (b.z - a.z) * axisDir[2]) / len)
    expect(dot).toBeGreaterThan(0.999)
  })

  it('Cache: zweite Anfrage beschafft nicht erneut', async () => {
    const { deps, model } = stubDeps({ trisByLocalId: { 1: box() } })
    const resolver = createGeometryResolver(deps)
    const handle = resolver.forCategory(['IFCPIPESEGMENT'])
    await handle.getForm('mesh')
    const callsAfterFirst = model._getItemSpy.mock.calls.length
    await handle.getForm('mesh')
    await handle.get('volumen')
    expect(model._getItemSpy.mock.calls.length).toBe(callsAfterFirst)
  })
})

describe('get (Größen-Kaskaden)', () => {
  it('volumen: qto → mesh(closed) → bbox mit Provenienz', async () => {
    const { deps } = stubDeps({
      trisByLocalId: { 1: box(2, 3, 4), 2: box(1, 1, 1) },
      qtoByLocalId: { 1: { NetVolume: 23.5 }, 2: null },
    })
    const resolver = createGeometryResolver(deps)
    const vols = await resolver.forCategory(['IFCPIPESEGMENT']).get('volumen')
    const v1 = vols.get('m1|1')
    expect(v1).toMatchObject({ value: 23.5, unit: 'm3', source: 'qto' })
    const v2 = vols.get('m1|2')
    expect(v2.source).toBe('mesh')
    expect(v2.value).toBeCloseTo(1, 8)
  })

  it('laenge: Achse (Skelett) liefert die Länge mit source mesh', async () => {
    const { tris } = tube(0.1, 0.125, 10, 24)
    const { deps } = stubDeps({ trisByLocalId: { 1: tris } })
    const resolver = createGeometryResolver(deps)
    const lens = await resolver.forCategory(['IFCPIPESEGMENT']).get('laenge')
    const l = lens.get('m1|1')
    expect(l.source).toBe('mesh')
    expect(l.value).toBeGreaterThan(9)
    expect(l.value).toBeLessThanOrEqual(10)
  })

  it('unbekannte Größe → kein stilles Scheitern, Warnung', async () => {
    const { deps } = stubDeps({ trisByLocalId: { 1: box() } })
    const resolver = createGeometryResolver(deps)
    const res = await resolver.forCategory(['IFCPIPESEGMENT']).get('quatsch')
    expect(res.get('m1|1').warnings[0]).toContain('groesse_unbekannt')
  })
})
