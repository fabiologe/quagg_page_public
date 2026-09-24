// Fahrplan C3: Wasseroberflaeche aus dem Rechennetz und Sohlschub auf dem
// Erdkoerper — Paketformat gegen backend core/oberflaeche.py, reine Hilfen.
import { describe, expect, it } from 'vitest'
import { parseOberflaeche } from '../services/volume'
import { dreieckeAlsZellen, knotenBetrag, oberflaechenZeit, schubAufKoerper }
  from '../utils/oberflaeche3d'

// Paket wie pack_oberflaeche: 3 Punkte, 1 Dreieck, U
function paket() {
  const kopf = new TextEncoder().encode(JSON.stringify({
    time: 2, punkte: 3, dreiecke: 1, felder: [{ name: 'U', components: 3 }] }))
  const hl = kopf.length + ((4 - (kopf.length % 4)) % 4)
  const buf = new ArrayBuffer(8 + hl + 36 + 12 + 36)
  const u8 = new Uint8Array(buf)
  u8.set(new TextEncoder().encode('F3DS'), 0)
  new DataView(buf).setUint32(4, hl, true)
  u8.set(kopf, 8)
  for (let k = kopf.length; k < hl; k++) u8[8 + k] = 32
  const start = 8 + hl
  new Float32Array(buf, start, 9).set([0, 0, 100, 1, 0, 100, 0, 1, 100.5])
  new Uint32Array(buf, start + 36, 3).set([0, 1, 2])
  new Float32Array(buf, start + 48, 9).set([3, 4, 0, 0, 0, 0, 1, 0, 0])
  return buf
}

describe('Wasseroberflaeche aus dem Rechennetz', () => {
  it('liest das F3DS-Paket', () => {
    const o = parseOberflaeche(paket())
    expect(o.time).toBe(2)
    expect([...o.punkte.slice(6)]).toEqual([0, 1, 100.5])
    expect([...o.dreiecke]).toEqual([0, 1, 2])
    expect([...knotenBetrag(o.felder.U)]).toEqual([5, 0, 1])
  })

  it('nimmt nur die Flaeche genau zur Feldzeit — t = 0 hat keine', () => {
    expect(oberflaechenZeit([1, 2, 3], 2)).toBe(2)
    expect(oberflaechenZeit([1, 2, 3], 0)).toBeNull()
    expect(oberflaechenZeit([1, 2, 3], 2.5)).toBeNull()
    expect(oberflaechenZeit([], 1)).toBeNull()
  })

  it('schreibt Dreiecke als vtk-Zellen', () => {
    expect([...dreieckeAlsZellen(Uint32Array.from([0, 1, 2, 2, 1, 3]))])
      .toEqual([3, 0, 1, 2, 3, 2, 1, 3])
  })
})

describe('Sohlschub auf dem Erdkoerper', () => {
  const raster = { nx: 2, ny: 1, origin: [0, 0], spacing: [1, 1] }
  const gelaende = Float32Array.from([10, 11])
  const tau = Float32Array.from([2, 7])

  it('faerbt nur Punkte auf der Gelaendeoberflaeche', () => {
    const punkte = Float32Array.from([
      0.5, 0.5, 10,      // Oberflaeche Saeule 0
      1.5, 0.5, 11.02,   // Oberflaeche Saeule 1 (leicht darueber)
      1.5, 0.5, 9,       // Bohrung / Unterseite
    ])
    const s = schubAufKoerper(punkte, tau, gelaende, raster, 0.1)
    expect(s[0]).toBe(2)
    expect(s[1]).toBe(7)
    expect(Number.isNaN(s[2])).toBe(true)
  })
})
