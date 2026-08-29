// Die Rule-Engine treibt Vektor-Stile UND die DIN-276-KG-Klassifikation —
// ein Matching-Fehler wirkt in beide Richtungen.

import { describe, expect, it } from 'vitest'
import {
  findMatchingRule, resolveRuleStyle, rulesNeedElementData, rulesForCategory,
} from '../services/VectorRuleEngine'

const wallCtx = {
  category: 'IFCWALL',
  attributes: { Name: 'Außenwand Nord' },
  psets: { Pset_WallCommon: { IsExternal: 'true', FireRating: 'F90' } },
}

describe('findMatchingRule', () => {
  it('lässt die höhere Priorität gewinnen', () => {
    const rules = [
      { id: 'a', priority: 10, condition: { category: 'IFCWALL' }, kgCode: '340' },
      { id: 'b', priority: 20, condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: 'true' }, kgCode: '330' },
    ]
    expect(findMatchingRule(rules, wallCtx)?.kgCode).toBe('330')
  })

  it('überspringt deaktivierte Regeln', () => {
    const rules = [
      { id: 'a', enabled: false, priority: 99, condition: { category: 'IFCWALL' }, kgCode: '999' },
      { id: 'b', priority: 1, condition: { category: 'IFCWALL' }, kgCode: '340' },
    ]
    expect(findMatchingRule(rules, wallCtx)?.kgCode).toBe('340')
  })

  it('matcht Kategorie-Regeln nur auf die richtige Kategorie', () => {
    const rules = [{ id: 'a', condition: { category: 'IFCDOOR' }, kgCode: '334' }]
    expect(findMatchingRule(rules, wallCtx)).toBeNull()
  })

  it('vergleicht Werte case-insensitiv als String (equals/contains)', () => {
    const eq = [{ id: 'a', condition: { category: null, psetName: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: 'TRUE' } }]
    expect(findMatchingRule(eq, wallCtx)).not.toBeNull()
    const contains = [{ id: 'b', condition: { category: null, propertyName: 'Name', operator: 'contains', value: 'nord' } }]
    expect(findMatchingRule(contains, wallCtx)).not.toBeNull()
  })

  it('unterstützt exists auf Pset-Properties', () => {
    const rules = [{ id: 'a', condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'FireRating', operator: 'exists' } }]
    expect(findMatchingRule(rules, wallCtx)).not.toBeNull()
    const missing = [{ id: 'b', condition: { category: 'IFCWALL', psetName: 'Pset_WallCommon', propertyName: 'GibtEsNicht', operator: 'exists' } }]
    expect(findMatchingRule(missing, wallCtx)).toBeNull()
  })
})

describe('Hilfsfunktionen', () => {
  it('resolveRuleStyle liefert den style-Slot des Treffers', () => {
    const rules = [{ id: 'a', condition: { category: 'IFCWALL' }, style: { lineWidth: 0.5 } }]
    expect(resolveRuleStyle(rules, wallCtx)).toEqual({ lineWidth: 0.5 })
  })

  it('rulesNeedElementData erkennt Pset-/Attribut-Bedarf', () => {
    expect(rulesNeedElementData([{ condition: { category: 'IFCWALL' } }])).toBe(false)
    expect(rulesNeedElementData([{ condition: { psetName: 'Pset_WallCommon' } }])).toBe(true)
  })

  it('rulesForCategory filtert auf Kategorie + Alle-Kategorien-Regeln', () => {
    const rules = [
      { id: 'a', condition: { category: 'IFCWALL' } },
      { id: 'b', condition: { category: 'IFCDOOR' } },
      { id: 'c', condition: {} },
    ]
    expect(rulesForCategory(rules, 'IFCWALL').map(r => r.id)).toEqual(['a', 'c'])
  })
})
