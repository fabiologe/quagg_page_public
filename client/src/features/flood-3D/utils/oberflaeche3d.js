// Reine Hilfen fuer Raum3D (Fahrplan C3): Wasseroberflaeche aus dem
// Rechennetz und Sohlschub auf dem Erdkoerper. Ohne vtk — die Arrays gehen
// danach unveraendert in vtkPolyData.

// Die Oberflaeche zur Feldzeit t, oder null. Das functionObject schreibt zu
// jeder Feld-Ausgabe AUSSER t = 0; der Server liefert die naechstgelegene —
// fuer t = 0 waere das die Flaeche von 1 s. Deshalb nur bei Gleichheit.
export function oberflaechenZeit(zeiten, t) {
  if (!zeiten?.length) return null
  const tol = 1e-6 * Math.max(1, Math.abs(t))
  for (const z of zeiten) if (Math.abs(z - t) <= tol) return z
  return null
}

// Dreiecke (a, b, c, …) als vtk-Zellenliste [3, a, b, c, 3, …]
export function dreieckeAlsZellen(dreiecke) {
  const m = dreiecke.length / 3
  const zellen = new Uint32Array(m * 4)
  for (let k = 0; k < m; k++) {
    zellen[4 * k] = 3
    zellen[4 * k + 1] = dreiecke[3 * k]
    zellen[4 * k + 2] = dreiecke[3 * k + 1]
    zellen[4 * k + 3] = dreiecke[3 * k + 2]
  }
  return zellen
}

// |U| je Knoten aus (ux, uy, uz, ux, …)
export function knotenBetrag(U) {
  const n = U.length / 3
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = Math.hypot(U[3 * i], U[3 * i + 1], U[3 * i + 2])
  }
  return out
}

// Sohlschub auf die Punkte des Erdkoerpers: τ der Rastersaeule unter dem
// Punkt, aber nur fuer Punkte AUF der Gelaendeoberflaeche (z nicht tiefer
// als Gelaende − toleranz). Bohrungen, Seiten und Unterseite bleiben NaN
// und erscheinen in der Gelaendefarbe (nanColor). Vorher schrieb Raum3D τ
// auf das Hoehenfeld, das bei einem Erdkoerper gar nicht gezeichnet wird.
export function schubAufKoerper(punkte, tau, gelaendeZ, raster, toleranz) {
  const { nx, ny, origin, spacing } = raster
  const n = punkte.length / 3
  const out = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    const x = punkte[3 * p]
    const y = punkte[3 * p + 1]
    const z = punkte[3 * p + 2]
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - origin[0]) / spacing[0])))
    const j = Math.min(ny - 1, Math.max(0, Math.floor((y - origin[1]) / spacing[1])))
    const c = j * nx + i
    out[p] = z >= gelaendeZ[c] - toleranz ? tau[c] : NaN
  }
  return out
}
