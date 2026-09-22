// Typregister (E4c): EIN Ort für „was kann der Editor mit diesem Typ", gegen
// das echte JSON-Schema der casespec gehalten. Der Schnappschuss
// fixtures/casespec.schema.json kommt aus `python -m app.api.flood3D.cli
// schema`; backend/…/tests/test_schema_schnappschuss.py hält ihn aktuell.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TEMPLATES } from '../utils/preTemplates'
import { RAND_ABLAUF, RAND_MIT_FENSTER, RAND_ZULAUF, TYPEN,
  luecken } from '../utils/typRegister'

const hier = dirname(fileURLToPath(import.meta.url))
const schema = JSON.parse(readFileSync(join(hier, 'fixtures',
  'casespec.schema.json'), 'utf8'))

// alle `type: Literal["…"]` des Modells: pydantic schreibt sie als const
function typKonstanten(s) {
  const aus = new Set()
  for (const def of Object.values(s.$defs ?? {})) {
    const t = def.properties?.type
    if (t?.const) aus.add(t.const)
  }
  return aus
}

describe('Typregister gegen das Modell', () => {
  const konstanten = typKonstanten(schema)

  it('das Schema kennt die Typen, die der Editor voraussetzt', () => {
    expect(konstanten.size).toBeGreaterThan(30)
    for (const t of ['wall', 'graben', 'outflow_constant', 'atmosphere',
      'bruchkante', 'box', 'vorfuellung', 'schnitt']) {
      expect(konstanten.has(t), t).toBe(true)
    }
  })

  it('jeder Backend-Typ hat einen Eintrag im Register', () => {
    const fehlt = [...konstanten].filter((t) => !TYPEN[t])
    expect(fehlt).toEqual([])
  })

  it('kein Eintrag im Register ohne Typ im Modell', () => {
    const tot = Object.keys(TYPEN).filter((t) => !konstanten.has(t))
    expect(tot).toEqual([])
  })

  it('wer eine Vorlage verspricht, hat sie im Objektbaum', () => {
    // TEMPLATES: { art: { 'Beschriftung': { type, … } } }
    const vorlagen = new Set(Object.values(TEMPLATES)
      .flatMap((gruppe) => Object.values(gruppe))
      .map((v) => v.type).filter(Boolean))
    for (const [t, e] of Object.entries(TYPEN)) {
      if (e.vorlage) expect(vorlagen.has(t), `Vorlage ${t}`).toBe(true)
    }
  })

  it('jede Lücke nennt ihren Grund', () => {
    for (const l of luecken()) {
      for (const k of ['marker', 'griffe', 'vorlage']) {
        if (k in l) expect(typeof l[k]).toBe('string')
      }
    }
    // die dokumentierten Lücken vom 2026-09-22 — schrumpft die Liste, ist
    // das ein Fortschritt; wächst sie, muss es jemand begründen
    expect(luecken().length).toBeLessThanOrEqual(20)
  })

  it('Randmengen: Drossel ist ein Ablauf mit Fenster, Atmosphäre nicht', () => {
    expect(RAND_ABLAUF).toContain('outflow_constant')
    expect(RAND_ZULAUF).toEqual(['inflow_hydrograph', 'inflow_constant'])
    expect(RAND_MIT_FENSTER).not.toContain('atmosphere')
    expect(RAND_MIT_FENSTER.length).toBe(5)
  })
})
