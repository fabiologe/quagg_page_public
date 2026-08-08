// Gemeinsamer, feld-selektiver Volumen-Cache (Perf-Audit): ein Eintrag je
// (Lauf, Zeit), Felder werden nachgeladen und gemerged statt jedes Mal
// alles neu zu holen; parallele Anfragen teilen sich einen Abruf.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const abrufe = []

vi.mock('../services/volume', () => ({
  fetchTimesteps: vi.fn(),
  fetchGeometry: vi.fn(),
  fetchVolume: vi.fn(async (runId, time, fields) => {
    abrufe.push(fields ? [...fields] : null)
    // dieser "Lauf" hat kein bed_shear — wie ein Lauf ohne Gelaende
    const vorhandene = ['alpha', 'U', 'p_rgh']
    const geliefert = fields
      ? fields.filter((f) => vorhandene.includes(f)) : vorhandene
    return {
      time,
      grid: { dims: [1, 1, 2], origin: [0, 0, 0], spacing: [1, 1, 1] },
      fields: Object.fromEntries(geliefert.map((f) => [f,
        { data: new Float32Array(f === 'U' ? 6 : 2) }])),
    }
  }),
}))

const { getVolume, planFieldsCached } = await import('../composables/useFieldCache')

beforeEach(() => { abrufe.length = 0 })

describe('getVolume — feld-selektiver Cache', () => {
  it('lädt nur die angefragten Felder und cached den Eintrag', async () => {
    const a = await getVolume('lauf-a', 10, ['alpha', 'U'])
    expect(abrufe).toEqual([['alpha', 'U']])
    expect(Object.keys(a.fields).sort()).toEqual(['U', 'alpha'])

    const b = await getVolume('lauf-a', 10, ['alpha', 'U'])
    expect(b).toBe(a)              // Identität — kein neuer Abruf
    expect(abrufe).toHaveLength(1)
  })

  it('lädt fehlende Felder nach und merged sie in denselben Eintrag', async () => {
    const a = await getVolume('lauf-b', 10, ['alpha'])
    const b = await getVolume('lauf-b', 10, ['alpha', 'p_rgh'])
    expect(b).toBe(a)
    expect(abrufe).toEqual([['alpha'], ['p_rgh']])   // nur das Delta
    expect(Object.keys(b.fields).sort()).toEqual(['alpha', 'p_rgh'])
  })

  it('fragt ein im Lauf nicht vorhandenes Feld nur einmal an', async () => {
    await getVolume('lauf-c', 10, ['alpha', 'bed_shear'])
    await getVolume('lauf-c', 10, ['alpha', 'bed_shear'])
    expect(abrufe).toHaveLength(1)
    const vol = await getVolume('lauf-c', 10, ['alpha', 'bed_shear'])
    expect(vol.fields.bed_shear).toBeUndefined()
  })

  it('teilt parallele Anfragen auf denselben Abruf auf', async () => {
    const [a, b] = await Promise.all([
      getVolume('lauf-d', 10, ['alpha', 'U']),
      getVolume('lauf-d', 10, ['alpha']),
    ])
    expect(a).toBe(b)
    expect(abrufe).toHaveLength(1)
  })

  it('behandelt felder = null weiterhin als "alles"', async () => {
    const vol = await getVolume('lauf-e', 10)
    expect(abrufe).toEqual([null])
    expect(Object.keys(vol.fields).sort()).toEqual(['U', 'alpha', 'p_rgh'])
    await getVolume('lauf-e', 10, ['alpha'])   // schon da — kein Abruf
    expect(abrufe).toHaveLength(1)
  })
})

describe('planFieldsCached', () => {
  it('rechnet je Eintrag nur einmal — bis ein Feld nachgeladen wird', async () => {
    const vol = await getVolume('lauf-f', 10, ['alpha'])
    const terrain = Float32Array.from([0])
    const p1 = planFieldsCached(vol, terrain)
    expect(planFieldsCached(vol, terrain)).toBe(p1)       // memoisiert

    await getVolume('lauf-f', 10, ['alpha', 'U'])         // U kommt dazu
    const p2 = planFieldsCached(vol, terrain)
    expect(p2).not.toBe(p1)                               // neu gerechnet
    expect(planFieldsCached(vol, terrain)).toBe(p2)

    // anderes Terrain-Array = anderer Schluessel
    expect(planFieldsCached(vol, Float32Array.from([0]))).not.toBe(p2)
  })
})
