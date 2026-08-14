// Reine Rechenhelfer für die Randbilanz: kumulierte Volumina aus den
// discharge-Zeitreihen der Rand-Patches (patchflow-functionObjects,
// Vorzeichen: positiv = Wasser verlässt das Gebiet), Interpolation am
// Zeitcursor und die Verortung eines Rand-Fensters im Raum. Bewusst ohne
// jede UI-Abhängigkeit — Grundriss und Raum (3D) rechnen damit dasselbe.

// Kumuliertes Volumen V(t) = ∫ Q dt per Trapezregel, gleich lang wie t.
// V[0] = 0 — gezählt wird ab dem ersten Ausgabezeitpunkt der Reihe.
export function kumuliere(t, q) {
  const n = Math.min(t?.length ?? 0, q?.length ?? 0)
  const V = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    V[i] = V[i - 1] + 0.5 * (q[i] + q[i - 1]) * (t[i] - t[i - 1])
  }
  return V
}

// Linear interpolierter Wert der Reihe (t, v) am Zeitpunkt `zeit`.
// Außerhalb der Reihe wird an die Ränder geklemmt (der Solver hält den
// letzten Wert, vor dem ersten Ausgabezeitpunkt gibt es nichts Besseres).
export function wertBei(t, v, zeit) {
  const n = Math.min(t?.length ?? 0, v?.length ?? 0)
  if (!n || !Number.isFinite(zeit)) return null
  if (zeit <= t[0]) return v[0]
  if (zeit >= t[n - 1]) return v[n - 1]
  // erste Stützstelle rechts vom Cursor suchen
  let i = 1
  while (i < n - 1 && t[i] < zeit) i++
  const dt = t[i] - t[i - 1]
  if (!(dt > 0)) return v[i]
  const f = (zeit - t[i - 1]) / dt
  return v[i - 1] + (v[i] - v[i - 1]) * f
}

// Randtyp aus dem Spezifikationstyp: 'zu' (inflow_*), 'ab' (outflow_*),
// sonst null (atmosphere und alles Unbekannte gehören nicht in die Bilanz).
export function randTyp(bc) {
  const typ = bc?.type ?? ''
  if (typ.startsWith('inflow')) return 'zu'
  if (typ.startsWith('outflow')) return 'ab'
  return null
}

// Seite eines Rands: explizit gesetzt oder meshgen-Vorbelegung
// (Zufluss x_min, Abfluss x_max — wie assign_faces im Backend).
export function randFace(bc) {
  return bc?.face
    ?? (randTyp(bc) === 'zu' ? 'x_min' : randTyp(bc) === 'ab' ? 'x_max' : null)
}

// Intervall [a, b] eines Fensters entlang der Gebietskante (e0…e1).
// Kein Fenster (oder follow-Fenster, dessen Lage erst das Backend
// auflöst) → die ganze Kante.
export function fensterSpanne(win, e0, e1) {
  if (win && !win.follow) {
    if (win.span) {
      return [Math.min(win.span[0], win.span[1]),
        Math.max(win.span[0], win.span[1])]
    }
    if (win.shape === 'kreis' && win.center != null) {
      const r = (win.diameter ?? 0) / 2
      return [win.center - r, win.center + r]
    }
    if (win.shape === 'trapez' && win.center != null) {
      const b = Math.max(win.top_width ?? 0, win.bottom_width ?? 0) / 2
      return [win.center - b, win.center + b]
    }
    if (win.shape === 'polygon' && win.points?.length) {
      let lo = Infinity
      let hi = -Infinity
      for (const [e] of win.points) { lo = Math.min(lo, e); hi = Math.max(hi, e) }
      return [lo, hi]
    }
  }
  return [Math.min(e0, e1), Math.max(e0, e1)]
}

// Höhenlage eines Fensters (Mittelwert); ohne Angabe die Mitte z0…z1.
function fensterHoehe(win, z0, z1) {
  if (win && !win.follow) {
    if (win.z_center != null) return win.z_center
    if (win.z_min != null && win.z_max != null) return (win.z_min + win.z_max) / 2
    if (win.shape === 'polygon' && win.points?.length) {
      let s = 0
      for (const [, z] of win.points) s += z
      return s / win.points.length
    }
  }
  return (z0 + z1) / 2
}

// Weltpunkt in der Mitte eines Rand-Fensters — der rechnerische Anker,
// wenn kein Solver-Patch (meshPatches-Actor) zum Verorten da ist.
// grid: { origin, spacing, dims } des Darstellungsrasters.
export function fensterMittelpunkt(bc, grid) {
  if (!grid) return null
  const { origin, spacing, dims } = grid
  const x0 = origin[0]
  const x1 = origin[0] + dims[0] * spacing[0]
  const y0 = origin[1]
  const y1 = origin[1] + dims[1] * spacing[1]
  const z0 = origin[2]
  const z1 = origin[2] + dims[2] * spacing[2]
  const face = randFace(bc)
  if (face === 'z_max') return [(x0 + x1) / 2, (y0 + y1) / 2, z1]
  const win = bc?.window
  const z = fensterHoehe(win, z0, z1)
  if (face === 'x_min' || face === 'x_max') {
    const [a, b] = fensterSpanne(win, y0, y1)
    return [face === 'x_min' ? x0 : x1, (a + b) / 2, z]
  }
  if (face === 'y_min' || face === 'y_max') {
    const [a, b] = fensterSpanne(win, x0, x1)
    return [(a + b) / 2, face === 'y_min' ? y0 : y1, z]
  }
  return null
}
