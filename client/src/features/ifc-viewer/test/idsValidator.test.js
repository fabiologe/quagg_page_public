// IDS-Prüfung: Applicability-Filter, Requirement-Arten, Severity-Zusammenfassung.

import { describe, expect, it } from 'vitest'
import { validateIds } from '../services/IdsValidator'
import { IDS_DEFAULT_SPECS } from '../services/IdsDefaults'

function wall(localId, { name = '', isExternal, fireRating } = {}) {
  const props = []
  if (isExternal !== undefined) props.push({ Name: { value: 'IsExternal' }, NominalValue: { value: isExternal } })
  if (fireRating !== undefined) props.push({ Name: { value: 'FireRating' }, NominalValue: { value: fireRating } })
  return {
    _localId: { value: localId },
    GlobalId: { value: `GID-${localId}` },
    Name: { value: name },
    IsDefinedBy: [{ Name: { value: 'Pset_WallCommon' }, HasProperties: props }],
  }
}

function mocks(category, items) {
  return {
    categoryGroups: [{
      name: category,
      groupData: { get: async () => new Map([['m1', items.map((_, i) => i + 1)]]) },
    }],
    fragmentsList: new Map([['m1', {}]]),
    fragmentsManager: { getData: async () => ({ m1: items }) },
  }
}

describe('validateIds', () => {
  it('findet fehlende Pflicht-Properties (IsExternal an Wänden)', async () => {
    const items = [wall(1, { isExternal: true }), wall(2, {})] // 2 hat kein IsExternal
    const specs = IDS_DEFAULT_SPECS.filter(s => s.id === 'spec-wall-external-flag')
    const { perSpec, summary } = await validateIds({ specs, ...mocks('IFCWALL', items) })
    expect(perSpec[0].applicable).toBe(2)
    expect(perSpec[0].passed).toBe(1)
    expect(perSpec[0].failed).toHaveLength(1)
    expect(perSpec[0].failed[0].localId).toBe(2)
    expect(summary.errors).toBe(1) // Spec hat severity error
  })

  it('wendet den psetCondition-Pre-Filter an (FireRating nur für Außenwände)', async () => {
    const items = [
      wall(1, { isExternal: true }),               // außen, kein FireRating → fail
      wall(2, { isExternal: false }),              // innen → nicht anwendbar
      wall(3, { isExternal: true, fireRating: 'F90' }), // außen, ok
    ]
    const specs = IDS_DEFAULT_SPECS.filter(s => s.id === 'spec-wall-fire-rating')
    const { perSpec } = await validateIds({ specs, ...mocks('IFCWALL', items) })
    expect(perSpec[0].applicable).toBe(2) // nur die beiden Außenwände
    expect(perSpec[0].failed.map(f => f.localId)).toEqual([1])
  })

  it('prüft Attribut-Requirements (Raum-Name)', async () => {
    const spaces = [
      { _localId: { value: 1 }, GlobalId: { value: 'G1' }, Name: { value: 'Büro' }, IsDefinedBy: [] },
      { _localId: { value: 2 }, GlobalId: { value: 'G2' }, Name: { value: '' }, IsDefinedBy: [] },
    ]
    const specs = IDS_DEFAULT_SPECS.filter(s => s.id === 'spec-space-name')
    const { perSpec } = await validateIds({ specs, ...mocks('IFCSPACE', spaces) })
    expect(perSpec[0].failed.map(f => f.localId)).toEqual([2])
  })

  it('Score = bestanden / anwendbar über alle Specs', async () => {
    const items = [wall(1, { isExternal: true }), wall(2, {})]
    const specs = IDS_DEFAULT_SPECS.filter(s => s.id === 'spec-wall-external-flag')
    const { summary } = await validateIds({ specs, ...mocks('IFCWALL', items) })
    expect(summary.score).toBeCloseTo(0.5)
    expect(summary.totalApplicable).toBe(2)
    expect(summary.totalFailed).toBe(1)
  })

  it('Kategorien ohne Elemente → Spec läuft leer durch, Score bleibt 1', async () => {
    const specs = IDS_DEFAULT_SPECS.filter(s => s.id === 'spec-chamber-name')
    const { perSpec, summary } = await validateIds({ specs, ...mocks('IFCWALL', []) })
    expect(perSpec[0].applicable).toBe(0)
    expect(summary.score).toBe(1)
  })
})
