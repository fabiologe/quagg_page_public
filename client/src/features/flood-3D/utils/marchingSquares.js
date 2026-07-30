// Höhenlinien auf einem 2D-Skalarfeld (marching squares, 16 Fälle).
// Rückgabe: Liniensegmente in Gitterkoordinaten [[i0,j0,i1,j1], ...];
// NaN-Zellen (z. B. trockene Bereiche) werden ausgelassen.

export function isoSegments(values, nx, ny, level) {
  const segs = []
  const v = (i, j) => values[j * nx + i]

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = v(i, j)
      const b = v(i + 1, j)
      const c = v(i + 1, j + 1)
      const d = v(i, j + 1)
      if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) continue
      let idx = 0
      if (a >= level) idx |= 1
      if (b >= level) idx |= 2
      if (c >= level) idx |= 4
      if (d >= level) idx |= 8
      if (idx === 0 || idx === 15) continue

      const lerp = (p, q) => (level - p) / (q - p || 1e-12)
      // Kantenpunkte: unten, rechts, oben, links (in Gitterkoordinaten)
      const bottom = [i + lerp(a, b), j]
      const right = [i + 1, j + lerp(b, c)]
      const top = [i + lerp(d, c), j + 1]
      const left = [i, j + lerp(a, d)]
      const push = (p, q) => segs.push([p[0], p[1], q[0], q[1]])

      switch (idx) {
        case 1: case 14: push(left, bottom); break
        case 2: case 13: push(bottom, right); break
        case 3: case 12: push(left, right); break
        case 4: case 11: push(right, top); break
        case 6: case 9: push(bottom, top); break
        case 7: case 8: push(left, top); break
        case 5: push(left, bottom); push(right, top); break
        case 10: push(bottom, right); push(left, top); break
      }
    }
  }
  return segs
}
