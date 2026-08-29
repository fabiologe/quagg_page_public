// classifyKg gegen gemockte Fragments-Strukturen: Regel-Priorität,
// Pset-Differenzierung außen/innen, Overrides und BBox-Volumen.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { classifyKg } from '../services/KgClassifier'
import { KG_DEFAULT_RULES, kgColor, kgTitle } from '../services/Din276Defaults'

// ── Mock-Bausteine im OBC-Datenformat ───────────────────────────────────────

function box(w = 1, h = 1, d = 1) {
  return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, h, d))
}

function wallItem(localId, globalId, isExternal) {
  return {
    _localId: { value: localId },
    GlobalId: { value: globalId },
    Name: { value: `Wand-${localId}` },
    IsDefinedBy: [{
      Name: { value: 'Pset_WallCommon' },
      HasProperties: [
        { Name: { value: 'IsExternal' }, NominalValue: { value: isExternal } },
      ],
    }],
  }
}

/** categoryGroup + fragmentsList + fragmentsManager für EIN Modell bauen. */
function mockModel({ category, localIds, items, boxes }) {
  return {
    categoryGroups: [{
      name: category,
      groupData: { get: async () => new Map([['m1', localIds]]) },
    }],
    fragmentsList: new Map([['m1', { getBoxes: async () => boxes }]]),
    fragmentsManager: { getData: async () => ({ m1: items }) },
  }
}

describe('classifyKg', () => {
  it('teilt Wände per Pset in Außen (330) und Innen (340)', async () => {
    const mocks = mockModel({
      category: 'IFCWALL',
      localIds: [1, 2],
      items: [wallItem(1, 'GID-A', true), wallItem(2, 'GID-B', false)],
      boxes: [box(), box()],
    })
    const { byKg, unassigned } = await classifyKg({ ...mocks, rules: [...KG_DEFAULT_RULES] })
    expect(byKg.get('330')?.count).toBe(1)
    expect(byKg.get('340')?.count).toBe(1)
    expect(unassigned.count).toBe(0)
  })

  it('klassifiziert Kategorie-Regeln ohne Pset-Fetch (Fundament → 322)', async () => {
    const mocks = mockModel({
      category: 'IFCFOOTING',
      localIds: [7],
      items: [],
      boxes: [box(2, 0.5, 2)],
    })
    // fragmentsManager.getData darf hier nie aufgerufen werden
    mocks.fragmentsManager.getData = async () => { throw new Error('unerwarteter Datenzugriff') }
    const { byKg } = await classifyKg({ ...mocks, rules: [...KG_DEFAULT_RULES] })
    expect(byKg.get('322')?.count).toBe(1)
    expect(byKg.get('322')?.volume_m3).toBeCloseTo(2 * 0.5 * 2)
  })

  it('zählt Kategorien ohne passende Regel als unassigned — inkl. Elementliste (B5)', async () => {
    const mocks = mockModel({
      category: 'IFCUNBEKANNT',
      localIds: [1],
      items: [],
      boxes: [box()],
    })
    const { byKg, unassigned } = await classifyKg({ ...mocks, rules: [...KG_DEFAULT_RULES] })
    expect(byKg.size).toBe(0)
    expect(unassigned.count).toBe(1)
    expect(unassigned.byCategory.get('IFCUNBEKANNT')).toBe(1)
    expect(unassigned.elements).toEqual([
      { modelId: 'm1', localId: 1, globalId: '', category: 'IFCUNBEKANNT' },
    ])
  })

  it('B5: Override greift auch auf Kategorien ohne Pset-Regeln (erzwingt Daten-Fetch)', async () => {
    const footingItem = {
      _localId: { value: 7 },
      GlobalId: { value: 'GID-FUND' },
      Name: { value: 'Fundament-7' },
      IsDefinedBy: [],
    }
    const mocks = mockModel({
      category: 'IFCFOOTING',
      localIds: [7],
      items: [footingItem],
      boxes: [box()],
    })
    const { byKg } = await classifyKg({
      ...mocks,
      rules: [...KG_DEFAULT_RULES],
      overrides: new Map([['GID-FUND', '323']]),
    })
    // Regel sagt 322 (Flachgründung) — Override zwingt auf 323 (Tiefgründung)
    expect(byKg.get('323')?.count).toBe(1)
    expect(byKg.has('322')).toBe(false)
  })

  it('lässt Overrides (GlobalId → KG) vor den Regeln gewinnen', async () => {
    const mocks = mockModel({
      category: 'IFCWALL',
      localIds: [1],
      items: [wallItem(1, 'GID-A', true)],
      boxes: [box()],
    })
    const { byKg } = await classifyKg({
      ...mocks,
      rules: [...KG_DEFAULT_RULES],
      overrides: new Map([['GID-A', '399']]),
    })
    expect(byKg.get('399')?.count).toBe(1)
    expect(byKg.has('330')).toBe(false)
  })

  it('T1/E2: collectLengths erhebt Laufmeter aus Qto, BBox-Fallback nur linear', async () => {
    const pipeItem = {
      _localId: { value: 1 },
      GlobalId: { value: 'GID-ROHR' },
      IsDefinedBy: [{
        Name: { value: 'Qto_PipeSegmentBaseQuantities' },
        HasProperties: [{ Name: { value: 'Length' }, NominalValue: { value: 42.5 } }],
      }],
    }
    const pipeNoQto = { _localId: { value: 2 }, GlobalId: { value: 'GID-ROHR2' }, IsDefinedBy: [] }
    const mocks = mockModel({
      category: 'IFCPIPESEGMENT',
      localIds: [1, 2],
      items: [pipeItem, pipeNoQto],
      boxes: [box(1, 1, 1), box(12, 0.3, 0.3)], // Fallback: längste Kante 12 m
    })
    const { byKg } = await classifyKg({ ...mocks, rules: [...KG_DEFAULT_RULES], collectLengths: true })
    expect(byKg.get('411')?.length_m).toBeCloseTo(42.5 + 12)
  })

  it('T1/E2: ohne collectLengths bleibt length_m 0 (kein Daten-Mehraufwand)', async () => {
    const mocks = mockModel({
      category: 'IFCFOOTING',
      localIds: [7],
      items: [],
      boxes: [box(2, 0.5, 2)],
    })
    const { byKg } = await classifyKg({ ...mocks, rules: [...KG_DEFAULT_RULES] })
    expect(byKg.get('322')?.length_m).toBe(0)
  })

  it('füllt perElement für den KG-Farbmodus', async () => {
    const mocks = mockModel({
      category: 'IFCWALL',
      localIds: [1],
      items: [wallItem(1, 'GID-A', true)],
      boxes: [box()],
    })
    const { perElement } = await classifyKg({ ...mocks, rules: [...KG_DEFAULT_RULES] })
    expect(perElement.get('m1|1')).toBe('330')
  })
})

describe('Din276Defaults', () => {
  it('kgColor läuft auf den Eltern-Code hoch, kgTitle kennt Untergruppen', () => {
    expect(kgColor('322')).toBe(kgColor('320'))
    expect(kgTitle('330')).toMatch(/^330 — /)
    expect(kgTitle('999')).toBe('999')
  })
})
