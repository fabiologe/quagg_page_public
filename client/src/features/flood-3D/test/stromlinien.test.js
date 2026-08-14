// Der Stromlinien-Integrator ersetzt vtkImageStreamline (10-s-Blockade:
// ungecachte Bounds je Feldabfrage + Stall statt Abbruch bei v=0). Diese
// Tests pinnen genau die Eigenschaften, deretwegen er existiert.
import { describe, expect, it } from 'vitest'
import { verfolgeStromlinien } from '../utils/stromlinien'

// kleines Gitter, Werte an Zellmitten, U planar
function welt({ nx = 20, ny = 5, nz = 5, vx = 1, wasserBis = Infinity } = {}) {
  const n = nx * ny * nz
  const u = new Float32Array(3 * n).fill(0)
  const alpha = new Float32Array(n).fill(1)
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = (k * ny + j) * nx + i
        u[idx] = vx
        if (k >= wasserBis) alpha[idx] = 0        // Luftdecke
      }
    }
  }
  return { u, alpha, dims: [nx, ny, nz], spacing: [1, 1, 1], origin: [0, 0, 0] }
}

describe('verfolgeStromlinien', () => {
  it('homogenes Feld: gerade Linie bis an den Gitterrand', () => {
    const w = welt({ vx: 1 })
    const { punkte, offsets } = verfolgeStromlinien({
      ...w, seeds: [2.5, 2.5, 2.5] })
    expect(offsets.length).toBe(2)
    const nP = offsets[1]
    expect(nP).toBeGreaterThan(10)
    // läuft in +x, y/z bleiben konstant
    expect(punkte[(nP - 1) * 3]).toBeGreaterThan(18)
    expect(punkte[(nP - 1) * 3 + 1]).toBeCloseTo(2.5, 5)
    // Schrittweite ~ halbe Zellweite, kein Stall (deutlich unter maxSchritte)
    expect(nP).toBeLessThan(60)
  })

  it('Nullfeld: SOFORTIGER Abbruch statt 600 Stall-Schritten', () => {
    const w = welt({ vx: 0 })
    const { punkte, offsets } = verfolgeStromlinien({
      ...w, seeds: [2.5, 2.5, 2.5] })
    // Ein-Punkt-Linien werden verworfen — nichts zu zeichnen, nichts bezahlt
    expect(offsets.length).toBe(1)
    expect(punkte.length).toBe(0)
  })

  it('Luftdecke: Aufwärtsströmung endet an der Wasseroberfläche', () => {
    const w = welt({ nx: 5, ny: 5, nz: 12, wasserBis: 6 })
    const n = 5 * 5 * 12
    w.u.fill(0)
    for (let idx = 0; idx < n; idx++) w.u[2 * n + idx] = 1    // vz = 1
    const { punkte, offsets } = verfolgeStromlinien({
      ...w, seeds: [2.5, 2.5, 1.0] })
    const nP = offsets[1]
    // steigt, aber nie in die Luft (Wassergrenze bei k=6 → z ≈ 5,5…6)
    expect(punkte[(nP - 1) * 3 + 2]).toBeLessThan(6.1)
    expect(nP).toBeLessThan(30)
  })

  it('NaN-Zellen kippen die Interpolation nicht (Gewichts-Renorm)', () => {
    const w = welt({ vx: 2 })
    const n = 20 * 5 * 5
    for (let idx = 0; idx < n; idx += 7) w.u[idx] = NaN   // Löcher wie am Gelände
    const { offsets } = verfolgeStromlinien({ ...w, seeds: [2.5, 2.5, 2.5] })
    expect(offsets.length).toBe(2)
    expect(offsets[1]).toBeGreaterThan(5)
  })

  it('Seed außerhalb des Gitters: leere Rückgabe, kein Fehler', () => {
    const w = welt()
    const { punkte, offsets } = verfolgeStromlinien({
      ...w, seeds: [-50, -50, -50] })
    expect(punkte.length).toBe(0)
    expect(offsets.length).toBe(1)
  })
})
