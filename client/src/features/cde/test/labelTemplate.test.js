// Label-Templates beschriften den Vektor-Planexport — reine String-Logik.

import { describe, expect, it } from 'vitest'
import { renderLabelTemplate, tokensIn } from '../services/LabelTemplate'

const ctx = {
  category: 'IFCWALL',
  localId: 42,
  attributes: { Name: 'Wand-01', ObjectType: 'STB 20' },
  psets: {
    Pset_WallCommon: { IsExternal: true, Thickness: 200 },
    Qto_WallBaseQuantities: { Length: 2.5 },
  },
}

describe('renderLabelTemplate', () => {
  it('löst Attribut- und Pset-Tokens auf', () => {
    expect(renderLabelTemplate('{Name}', ctx)).toBe('Wand-01')
    expect(renderLabelTemplate('{Pset_WallCommon.IsExternal}', ctx)).toBe('true')
    expect(renderLabelTemplate('{category} #{localId}', ctx)).toBe('IFCWALL #42')
  })

  it('nimmt in der Fallback-Kette den ersten nicht-leeren Wert', () => {
    expect(renderLabelTemplate('{Fehlt|ObjectType|Name}', ctx)).toBe('STB 20')
  })

  it('ist bei Pset- und Property-Namen case-insensitiv', () => {
    expect(renderLabelTemplate('{pset_wallcommon.isexternal}', ctx)).toBe('true')
  })

  it('wendet Formatter an (mm, m, upper, trim)', () => {
    expect(renderLabelTemplate('{Pset_WallCommon.Thickness:mm}', ctx)).toBe('200 mm')
    expect(renderLabelTemplate('{Qto_WallBaseQuantities.Length:m}', ctx)).toBe('2.50 m')
    expect(renderLabelTemplate('{Name:upper}', ctx)).toBe('WAND-01')
    expect(renderLabelTemplate('{Name:trim5}', ctx)).toBe('Wand…')
  })

  it('teilt an ";" in Mehrzeilen-Labels und lässt leere Segmente weg', () => {
    expect(renderLabelTemplate('{Name};{ObjectType};', ctx))
      .toEqual(['Wand-01', 'STB 20'])
  })

  it('gibt null zurück, wenn nichts auflösbar ist', () => {
    expect(renderLabelTemplate('{GibtEsNicht}', ctx)).toBeNull()
    expect(renderLabelTemplate('', ctx)).toBeNull()
  })
})

describe('tokensIn', () => {
  it('listet alle referenzierten Tokens inkl. Fallback-Ketten', () => {
    expect(tokensIn('{Name|ObjectType} — {Pset_WallCommon.Thickness:mm}').sort())
      .toEqual(['Name', 'ObjectType', 'Pset_WallCommon.Thickness'])
  })
})
