// Beweis, dass die separable Glaettung der frueheren 27-Nachbarn-Schleife
// entspricht — inklusive der Raender, wo beide ueber die jeweils gueltige
// Nachbarschaft renormieren. Die naive Referenz hier ist 1:1 der alte
// Code aus Raum3DPanel.glaetteFeld.
import { describe, expect, it } from 'vitest'
import { glaetteFeld, glaetteFeldCached } from '../utils/glaettung'

function naiv(values, dims, durchgaenge) {
  const [nx, ny, nz] = dims
  let a = values
  for (let d = 0; d < durchgaenge; d++) {
    const b = new Float32Array(a.length)
    const idx = (i, j, k) => (k * ny + j) * nx + i
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          let sum = 0
          let n = 0
          for (let dk = -1; dk <= 1; dk++) {
            const kk = k + dk
            if (kk < 0 || kk >= nz) continue
            for (let dj = -1; dj <= 1; dj++) {
              const jj = j + dj
              if (jj < 0 || jj >= ny) continue
              for (let di = -1; di <= 1; di++) {
                const ii = i + di
                if (ii < 0 || ii >= nx) continue
                sum += a[idx(ii, jj, kk)]
                n++
              }
            }
          }
          b[idx(i, j, k)] = sum / n
        }
      }
    }
    a = b
  }
  return a
}

function zufallsFeld(n, seed = 7) {
  let s = seed
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  return Float32Array.from({ length: n }, () => rnd())
}

describe('glaetteFeld (separabel)', () => {
  it.each([1, 2, 3])('entspricht der 27-Nachbarn-Referenz (%i Durchgänge)', (p) => {
    const dims = [5, 4, 3]
    const feld = zufallsFeld(5 * 4 * 3)
    const schnell = glaetteFeld(feld, dims, p)
    const referenz = naiv(feld, dims, p)
    for (let i = 0; i < feld.length; i++) {
      expect(Math.abs(schnell[i] - referenz[i]),
        `Zelle ${i}, ${p} Durchgänge`).toBeLessThan(1e-5)
    }
  })

  it('behandelt Einzelzellen-Achsen (nz = 1) wie die Referenz', () => {
    // Toleranz statt exakter Gleichheit: die sequentiellen 1D-Pässe
    // runden in Float32 anders zwischen als die eine 27er-Division
    const dims = [4, 3, 1]
    const feld = zufallsFeld(12)
    const schnell = glaetteFeld(feld, dims, 1)
    const referenz = naiv(feld, dims, 1)
    for (let i = 0; i < feld.length; i++) {
      expect(Math.abs(schnell[i] - referenz[i])).toBeLessThan(1e-6)
    }
  })

  it('cached je Eingabefeld und Stufenzahl', () => {
    const dims = [3, 3, 3]
    const feld = zufallsFeld(27)
    const a = glaetteFeldCached(feld, dims, 2)
    expect(glaetteFeldCached(feld, dims, 2)).toBe(a)      // Identität
    expect(glaetteFeldCached(feld, dims, 1)).not.toBe(a)  // andere Stufe
    expect(glaetteFeldCached(feld, dims, 0)).toBe(feld)   // 0 = Durchreichen
  })
})
