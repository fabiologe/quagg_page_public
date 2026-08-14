// Stromlinien-Integrator auf dem Viz-Gitter — Ersatz für vtkImageStreamline.
//
// Warum eigener Code: der vtk.js-Filter rechnet je Feldabfrage die
// Gitter-Bounds NEU (8 Eckpunkt-Allokationen + Matrixtransformationen),
// bricht bei Geschwindigkeit 0 NICHT ab (Linien an der Wasseroberfläche
// „stallten" und zahlten stur alle 600 Schritte) und lief damit ~10 s je
// Anzeige. Hier: RK2 (Midpoint) direkt auf den Float32Arrays, Konstanten
// einmal gebunden, Abbruch bei Stillstand/Luft/Gitterrand, adaptive
// Schrittweite aus der Zellgröße — Größenordnungen schneller, und die
// entarteten Doppelpunkte, die den Rohrfilter aufblähten, entstehen gar
// nicht erst.
//
// Datenlage wie überall im Post: Werte an ZELLMITTEN (origin + (i+0,5)·d),
// U komponenten-planar (u[i], u[n+i], u[2n+i]), Rasterzellen ohne
// Solverzelle tragen NaN.

/**
 * @param {Object} p
 * @param {Float32Array} p.u      Geschwindigkeit, planar, Länge 3·n
 * @param {Float32Array} p.alpha  Phasenfeld, Länge n
 * @param {number[]} p.dims      [nx, ny, nz]
 * @param {number[]} p.spacing   [dx, dy, dz]
 * @param {number[]} p.origin    [x0, y0, z0] (Gitterecke, nicht Zellmitte)
 * @param {ArrayLike<number>} p.seeds  Startpunkte, flach [x,y,z, x,y,z, …]
 * @param {number} [p.maxSchritte=600]
 * @param {number} [p.alphaNass=0.5]   darunter ist Luft → Linie endet
 * @param {number} [p.epsV=1e-3]       darunter ist Stillstand → Linie endet
 * @returns {{punkte: Float32Array, offsets: Uint32Array}}
 *   offsets hat Länge Linienzahl+1; Linie m sind die Punkte
 *   [offsets[m], offsets[m+1]) — Linien mit < 2 Punkten werden verworfen.
 */
export function verfolgeStromlinien({ u, alpha, dims, spacing, origin, seeds,
  maxSchritte = 600, alphaNass = 0.5, epsV = 1e-3 }) {
  const [nx, ny, nz] = dims
  const [dx, dy, dz] = spacing
  const n = nx * ny
  const nGesamt = n * nz
  // Zellmitten-Koordinaten der ersten/letzten Stützstelle je Achse
  const x0 = origin[0] + dx / 2
  const y0 = origin[1] + dy / 2
  const z0 = origin[2] + dz / 2
  // halbe Zellweite Schrittlänge: fein genug für Wirbel, grob genug für Tempo
  const schrittLaenge = 0.5 * Math.min(dx, dy, dz)

  // Trilineare Interpolation an Zellmitten; NaN-Nachbarn werden wie in
  // sampleLinear übersprungen und die Gewichte neu normiert. Schreibt in
  // `ziel` [vx, vy, vz, alpha]; false = außerhalb/nur-NaN.
  const ziel = new Float64Array(4)
  function tastAb(px, py, pz) {
    const fx = (px - x0) / dx
    const fy = (py - y0) / dy
    const fz = (pz - z0) / dz
    if (fx < -0.5 || fy < -0.5 || fz < -0.5
      || fx > nx - 0.5 || fy > ny - 0.5 || fz > nz - 0.5) return false
    const i0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)))
    const j0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)))
    const k0 = Math.max(0, Math.min(nz - 2, Math.floor(fz)))
    const tx = Math.min(1, Math.max(0, fx - i0))
    const ty = Math.min(1, Math.max(0, fy - j0))
    const tz = Math.min(1, Math.max(0, fz - k0))
    let vx = 0; let vy = 0; let vz = 0; let a = 0; let g = 0
    for (let c = 0; c < 8; c++) {
      const ii = i0 + (c & 1)
      const jj = j0 + ((c >> 1) & 1)
      const kk = k0 + ((c >> 2) & 1)
      const idx = (kk * ny + jj) * nx + ii
      const ux = u[idx]
      if (Number.isNaN(ux)) continue
      const w = ((c & 1) ? tx : 1 - tx) * (((c >> 1) & 1) ? ty : 1 - ty)
        * (((c >> 2) & 1) ? tz : 1 - tz)
      if (w === 0) continue
      vx += w * ux
      vy += w * u[nGesamt + idx]
      vz += w * u[2 * nGesamt + idx]
      a += w * alpha[idx]
      g += w
    }
    if (g <= 0) return false
    ziel[0] = vx / g; ziel[1] = vy / g; ziel[2] = vz / g; ziel[3] = a / g
    return true
  }

  const linien = Math.floor(seeds.length / 3)
  // großzügig vorbelegen, am Ende zugeschnitten — KEINE Allokation im Kern
  const punkte = new Float32Array(linien * (maxSchritte + 1) * 3)
  const offsets = new Uint32Array(linien + 1)
  let np = 0
  let nl = 0
  for (let m = 0; m < linien; m++) {
    let px = seeds[m * 3]
    let py = seeds[m * 3 + 1]
    let pz = seeds[m * 3 + 2]
    const start = np
    for (let s = 0; s <= maxSchritte; s++) {
      if (!tastAb(px, py, pz)) break
      const a = ziel[3]
      const v1x = ziel[0]; const v1y = ziel[1]; const v1z = ziel[2]
      const v1 = Math.sqrt(v1x * v1x + v1y * v1y + v1z * v1z)
      if (a < alphaNass || v1 < epsV) break     // Luft/Stillstand: ENDE
      punkte[np * 3] = px; punkte[np * 3 + 1] = py; punkte[np * 3 + 2] = pz
      np++
      // RK2: halber Schritt mit v1, voller Schritt mit der Geschwindigkeit
      // am Mittelpunkt; dt so, dass ein Schritt ~ halbe Zellweite läuft
      const dt = schrittLaenge / v1
      const halb = 0.5 * dt
      if (!tastAb(px + halb * v1x, py + halb * v1y, pz + halb * v1z)) {
        ziel[0] = v1x; ziel[1] = v1y; ziel[2] = v1z   // Randfall: Euler
      }
      px += dt * ziel[0]; py += dt * ziel[1]; pz += dt * ziel[2]
    }
    if (np - start >= 2) {
      nl++
      offsets[nl] = np
    } else {
      np = start                                 // Ein-Punkt-Linie verwerfen
    }
  }
  return { punkte: punkte.slice(0, np * 3),
           offsets: offsets.slice(0, nl + 1) }
}
