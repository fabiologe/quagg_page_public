/**
 * Vorbelegung des Import-Dialogs (Etappe E2c, Audit C8/I2/I7).
 *
 * Vorher: ab 5 000 Einheiten Spannweite sprang der Dialog kommentarlos auf
 * Millimeter; der Offset-Vorschlag gab es nur für Netze; „Gebiet ableiten"
 * hing an der Rollenvermutung „gelaende" allein.
 */
import { describe, expect, it } from 'vitest'

import { offsetAusVerortung, vorbelegung } from '../utils/importVorbelegung'

// Import-Konvention des Servers (casespec.transform_import):
// t = −R(θ)·off
function verortung(off, grad, unit = 1) {
  const a = (grad * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { unit_factor: unit, rotation_deg: grad,
    translation: [-(c * off[0] - s * off[1]), -(s * off[0] + c * off[1])] }
}

describe('Einheit', () => {
  it('kommt aus der Zeichnung, nie aus der Spannweite', () => {
    expect(vorbelegung({ einheit: { code: 4, faktor: 0.001 }, candidates: [] })
      .unitFactor).toBe(0.001)
    // 6 km in Metern, die Zeichnung sagt Meter: kein Verdacht, Faktor 1
    const m = vorbelegung({ einheit: { code: 6, faktor: 1 }, unit_suspect: false,
      candidates: [] })
    expect(m.unitFactor).toBe(1)
    expect(m.einheitUnklar).toBe(false)
  })

  it('bleibt bei 1 und stellt die Frage, wenn die Zeichnung schweigt', () => {
    const v = vorbelegung({ einheit: null, unit_suspect: true, candidates: [] })
    expect(v.unitFactor).toBe(1)             // vorher: 0.001, kommentarlos
    expect(v.einheitUnklar).toBe(true)
  })
})

describe('Offset', () => {
  const OFF = [2500000.2, 5400000.2]

  it('gibt offsetAusVerortung den Import-Offset zurück (mit Drehung)', () => {
    const o = offsetAusVerortung(verortung(OFF, 37))
    expect(o[0]).toBeCloseTo(OFF[0], 6)
    expect(o[1]).toBeCloseTo(OFF[1], 6)
    expect(offsetAusVerortung(null)).toBeNull()
  })

  it('nimmt den Vorschlag der Datei, wenn der Fall keine Verortung hat', () => {
    const v = vorbelegung({ offset_suggest: OFF, candidates: [] })
    expect([v.offX, v.offY]).toEqual([2500000.2, 5400000.2])
    expect(v.lageQuelle).toBe('datei')
    expect(v.rotation).toBe(0)
  })

  it('nimmt die Verortung des Falls, wenn die Datei in seiner Welt liegt', () => {
    const t = verortung([2500003.0, 5400001.5], 12, 1)
    const v = vorbelegung({ offset_suggest: OFF, candidates: [] }, t)
    expect(v.offX).toBeCloseTo(2500003.0, 2)
    expect(v.offY).toBeCloseTo(5400001.5, 2)
    expect(v.rotation).toBe(12)
    expect(v.lageQuelle).toBe('fall')
  })

  it('ignoriert eine Verortung aus einer anderen Welt', () => {
    const t = verortung([3500000.0, 5900000.0], 12)   // > 10 km entfernt
    const v = vorbelegung({ offset_suggest: OFF, candidates: [] }, t)
    expect(v.offX).toBe(2500000.2)
    expect(v.lageQuelle).toBe('datei')
    expect(v.rotation).toBe(0)
  })

  it('rechnet den Vorschlag in die Zieleinheit um', () => {
    const v = vorbelegung({ offset_suggest: [2500000000, 5400000000],
      einheit: { code: 4, faktor: 0.001 }, candidates: [] })
    expect(v.offX).toBe(2500000)
  })

  it('lässt eine lokale Datei bei 0', () => {
    const v = vorbelegung({ offset_suggest: null, candidates: [] },
      verortung(OFF, 0))
    expect([v.offX, v.offY, v.lageQuelle]).toEqual([0, 0, null])
  })
})

describe('Gebiet ableiten', () => {
  it('folgt Gelände-Netzen UND Kanten-Dateien', () => {
    expect(vorbelegung({ candidates: [{ role_guess: 'gelaende' }] }).deriveDomain)
      .toBe(true)
    expect(vorbelegung({ candidates: [{ role_guess: 'bruchkante' },
      { role_guess: 'ablaufrohr' }] }).deriveDomain).toBe(true)  // vorher false
    expect(vorbelegung({ candidates: [{ role_guess: 'wand' }] }).deriveDomain)
      .toBe(false)
  })
})
