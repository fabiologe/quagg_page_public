// Gelände außerhalb der Vermessung (E1a): die Maske „gemessen" kommt als
// gepackte Bits vom Server (numpy.packbits), das Panel muss die Außenhöhe
// setzen können. Was der Server rechnet, prüft backend/…/test_gelaende_aussen.py.
import { describe, expect, it } from 'vitest'
import { b64ToBits } from '../services/volume'
import { OPTIONAL_ZAHLEN, TYP_LABELS } from '../utils/feldTypen'

describe('b64ToBits', () => {
  it('entpackt numpy.packbits (höchstwertiges Bit zuerst)', () => {
    // Bits 1 0 1 1 0 0 0 0 | 1 -> Bytes 0b10110000, 0b10000000
    const b64 = btoa(String.fromCharCode(0b10110000, 0b10000000))
    expect(Array.from(b64ToBits(b64, 9))).toEqual([1, 0, 1, 1, 0, 0, 0, 0, 1])
  })

  it('liefert genau n Werte, auch wenn das letzte Byte aufgefüllt ist', () => {
    const b64 = btoa(String.fromCharCode(0xff))
    expect(b64ToBits(b64, 3).length).toBe(3)
    expect(Array.from(b64ToBits(b64, 3))).toEqual([1, 1, 1])
  })
})

describe('Außenhöhe im Panel', () => {
  it('ist ein optionales Zahlenfeld des Geländes mit Beschriftung', () => {
    expect(OPTIONAL_ZAHLEN.terrain).toContain('aussenhoehe')
    expect(TYP_LABELS.terrain.aussenhoehe).toMatch(/Außenhöhe/)
  })
})
