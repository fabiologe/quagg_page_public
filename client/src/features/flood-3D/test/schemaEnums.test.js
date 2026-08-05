// P4.1: das Backend-Schema ist die Wahrheit über Auswahlwerte — die
// Tabellen in feldTypen.js sind Fallback und Untergruppen-Sonderfälle.
import { describe, expect, it } from 'vitest'
import { enumFor, setzeSchema } from '../utils/feldTypen'

const SCHEMA = {
  // Form wie von Pydantic v2 (model_json_schema): const für den
  // Typ-Diskriminator, enum direkt, Optional als anyOf mit null
  $defs: {
    StructWeir: {
      properties: {
        type: { const: 'weir', type: 'string' },
        profile_type: { enum: ['trapez', 'breitkronig', 'neu_aus_schema'] },
      },
    },
    StructCulvert: {
      properties: {
        type: { const: 'culvert', type: 'string' },
        rolle: { anyOf: [{ enum: ['zulauf', 'ablauf'], type: 'string' },
          { type: 'null' }], default: null },
      },
    },
  },
}

describe('Schema als Feldkunde-Quelle', () => {
  it('bevorzugt Schema-Enums je Objekttyp und fällt sonst zurück', () => {
    setzeSchema(SCHEMA)
    expect(enumFor('profile_type', '', 'weir')).toContain('neu_aus_schema')
    // Optional-Felder: null-Zweig wird herausgefiltert
    expect(enumFor('rolle', '', 'culvert')).toEqual(['zulauf', 'ablauf'])
    // Untergruppen-Umdeutung gewinnt weiterhin
    expect(enumFor('shape', 'aussparung', '')).toEqual(['kreis', 'rechteck'])
    // ohne Schema greifen die Tabellen
    setzeSchema(null)
    expect(enumFor('profile_type', '', 'weir')).toEqual(
      ['trapez', 'breitkronig', 'scharfkantig', 'rundkronig'])
  })
})
