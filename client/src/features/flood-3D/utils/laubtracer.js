// Oberflächentracer für Karte A (Spez. 3.2).
//
// Die tragende Idee: frisches Laub SCHWIMMT. Beim Leerlaufen ist deshalb
// nicht die Sohlschubspannung maßgebend, sondern die zurückweichende
// Wasserlinie — Laub treibt im Oberflächenfilm mit, folgt den
// Konvergenzzonen und strandet dort, wo die Wasserfläche zuletzt steht.
// Das ist rein kinematisch: keine Masse, kein Partikelmodell im Solver,
// nur alpha und U aus dem vorhandenen Ergebnis.
//
// Die Advektion läuft auf den Rasterspalten des Viz-Gitters mit der
// OBERFLÄCHENgeschwindigkeit, die planFields ohnehin je Spalte liefert
// (oberste Nasszelle, composables/useFieldCache.js).
//
// ACHTUNG Abtastung — an echten Daten gemessen: bei dx = 0,5 m, Δt = 1 s
// und 0,5 m/s Oberflächengeschwindigkeit springt ein Tracer je GESPEICHERTEM
// Zeitschritt über eine ganze Rasterzelle (Advektions-CFL ≈ 1). Deshalb
// wird zwischen zwei Schreibzeitpunkten in Unterschritten integriert und
// in der Zeit linear zwischen den beiden Feldern interpoliert. Das macht
// die Integration stabil — Information, die im Schreibintervall verloren
// ging, kann es NICHT zurückholen. Genau dafür meldet das Panel das
// gemessene CFL.

/**
 * Tracer gleichverteilt auf der Anfangswasserfläche aussäen.
 * Deterministisch (fester Zufallsstartwert), damit dieselbe Auswertung
 * dasselbe Bild liefert.
 */
export function saeeTracer({ tiefe, nx, ny, origin, spacing, anzahl,
                             hNass = 0.01, startwert = 20260815 }) {
  const kandidaten = []
  for (let col = 0; col < nx * ny; col++) {
    if (tiefe[col] >= hNass) kandidaten.push(col)
  }
  const n = Math.min(anzahl, kandidaten.length * 40) || 0
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  const lebt = new Uint8Array(n)
  if (!kandidaten.length) {
    return { x, y, lebt, n: 0, gestrandet: 0, draussen: 0, ausgesaet: 0 }
  }
  let s = startwert >>> 0
  const zufall = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let m = 0; m < n; m++) {
    // gleichverteilt: erst eine nasse Zelle, dann eine Stelle DARIN —
    // so liegt die Saat flächentreu, nicht auf den Zellmitten
    const col = kandidaten[Math.floor(zufall() * kandidaten.length)]
    const i = col % nx
    const j = (col - i) / nx
    x[m] = origin[0] + (i + zufall()) * spacing[0]
    y[m] = origin[1] + (j + zufall()) * spacing[1]
    lebt[m] = 1
  }
  return { x, y, lebt, n, gestrandet: 0, draussen: 0, ausgesaet: n }
}

/** Bilineare Abtastung eines Spaltenfeldes; NaN-Nachbarn werden übersprungen. */
function _abtasten(feld, x, y, nx, ny, origin, spacing) {
  const fx = (x - origin[0]) / spacing[0] - 0.5
  const fy = (y - origin[1]) / spacing[1] - 0.5
  const i0 = Math.max(0, Math.min(nx - 2, Math.floor(fx)))
  const j0 = Math.max(0, Math.min(ny - 2, Math.floor(fy)))
  const tx = Math.min(1, Math.max(0, fx - i0))
  const ty = Math.min(1, Math.max(0, fy - j0))
  let summe = 0
  let gewicht = 0
  for (let c = 0; c < 4; c++) {
    const i = i0 + (c & 1)
    const j = j0 + ((c >> 1) & 1)
    const w = ((c & 1) ? tx : 1 - tx) * (((c >> 1) & 1) ? ty : 1 - ty)
    if (w === 0) continue
    const v = feld[j * nx + i]
    if (!Number.isFinite(v)) continue
    summe += w * v
    gewicht += w
  }
  return gewicht > 0 ? summe / gewicht : NaN
}

/**
 * Von Zeitpunkt A nach B advehieren. `a` und `b` sind die Spaltenfelder
 * beider Schreibzeitpunkte ({ ux, uy, tiefe }); dazwischen wird linear
 * interpoliert.
 *
 * Strandungsregel (Spez. 3.2): fällt die Wassertiefe unter `hStrand`,
 * wird der Tracer eingefroren und bleibt liegen — das IST die Ablagerung.
 */
export function advehiere(zustand, a, b, tA, tB, {
  nx, ny, origin, spacing, cDrift = 1.0, hStrand = 0.02, maxCfl = 0.5,
} = {}) {
  const dt = tB - tA
  if (!(dt > 0)) return zustand
  const dx = Math.min(spacing[0], spacing[1])

  // Unterschritte aus der schnellsten Stelle des Feldes bestimmen
  let uMax = 0
  for (let col = 0; col < nx * ny; col++) {
    const ua = Math.abs(a.ux[col]) + Math.abs(a.uy[col])
    if (Number.isFinite(ua) && ua > uMax) uMax = ua
  }
  const schritte = Math.max(1, Math.min(64,
    Math.ceil((uMax * cDrift * dt) / (maxCfl * dx)) || 1))
  const h = dt / schritte

  for (let s = 0; s < schritte; s++) {
    const w = (s + 0.5) / schritte          // Zeitgewicht für die Mitte
    for (let m = 0; m < zustand.n; m++) {
      if (!zustand.lebt[m]) continue
      const x = zustand.x[m]
      const y = zustand.y[m]
      if (x < origin[0] || y < origin[1]
          || x > origin[0] + nx * spacing[0]
          || y > origin[1] + ny * spacing[1]) {
        zustand.lebt[m] = 0
        zustand.draussen++
        continue
      }
      const tiefe = _misch(_abtasten(a.tiefe, x, y, nx, ny, origin, spacing),
                           _abtasten(b.tiefe, x, y, nx, ny, origin, spacing), w)
      if (!(tiefe >= hStrand)) {          // gestrandet — hier bleibt das Laub
        zustand.lebt[m] = 0
        zustand.gestrandet++
        continue
      }
      const ux = _misch(_abtasten(a.ux, x, y, nx, ny, origin, spacing),
                        _abtasten(b.ux, x, y, nx, ny, origin, spacing), w)
      const uy = _misch(_abtasten(a.uy, x, y, nx, ny, origin, spacing),
                        _abtasten(b.uy, x, y, nx, ny, origin, spacing), w)
      if (!Number.isFinite(ux) || !Number.isFinite(uy)) continue
      zustand.x[m] = x + cDrift * ux * h
      zustand.y[m] = y + cDrift * uy * h
    }
  }
  return zustand
}

function _misch(a, b, w) {
  if (!Number.isFinite(a)) return b
  if (!Number.isFinite(b)) return a
  return a + (b - a) * w
}

/**
 * Endpositionen auf das Auswerteraster akkumulieren und auf die
 * Gleichverteilung normieren: 1 = so viel Laub wie im Mittel, 3 = dreifache
 * Konzentration. Der Faktor ist die Aussage, nicht die absolute Anzahl.
 */
export function ablagerungskarte(zustand, { nx, ny, origin, spacing,
                                            gueltig = null } = {}) {
  const dichte = new Float32Array(nx * ny)
  let gezaehlt = 0
  for (let m = 0; m < zustand.n; m++) {
    if (zustand.lebt[m]) continue                 // treibt noch — zählt nicht
    const i = Math.floor((zustand.x[m] - origin[0]) / spacing[0])
    const j = Math.floor((zustand.y[m] - origin[1]) / spacing[1])
    if (i < 0 || j < 0 || i >= nx || j >= ny) continue
    dichte[j * nx + i]++
    gezaehlt++
  }
  let zellen = 0
  for (let col = 0; col < nx * ny; col++) {
    if (!gueltig || gueltig[col]) zellen++
  }
  const mittel = zellen > 0 ? gezaehlt / zellen : 0
  const karte = new Float32Array(nx * ny)
  if (mittel > 0) {
    for (let col = 0; col < nx * ny; col++) karte[col] = dichte[col] / mittel
  }
  return { karte, gezaehlt, mittel }
}

/**
 * Bilanz der Tracer (Akzeptanzkriterium der Spezifikation): gestrandet +
 * noch treibend + außerhalb muss die Aussaat ergeben. Geht das nicht auf,
 * verliert die Advektion still Tracer und die Karte ist wertlos.
 */
export function tracerBilanz(zustand) {
  let treibend = 0
  for (let m = 0; m < zustand.n; m++) if (zustand.lebt[m]) treibend++
  const summe = treibend + zustand.gestrandet + zustand.draussen
  return {
    ausgesaet: zustand.ausgesaet, treibend,
    gestrandet: zustand.gestrandet, draussen: zustand.draussen,
    stimmt: summe === zustand.ausgesaet,
  }
}

/**
 * Das gemessene Advektions-CFL der DATEN (nicht der Rechnung):
 * u·Δt/dx über dem gespeicherten Zeitschritt. Über 1 springt ein Tracer je
 * Schreibintervall über eine ganze Zelle — dann sind Rezirkulationen, in
 * denen sich Laub sammelt, in den Daten gar nicht mehr enthalten.
 */
export function abtastGuete(ux, uy, dt, spacing) {
  const dx = Math.min(spacing[0], spacing[1])
  const werte = []
  for (let col = 0; col < ux.length; col++) {
    const u = Math.hypot(ux[col] || 0, uy[col] || 0)
    if (Number.isFinite(u) && u > 0) werte.push(u)
  }
  if (!werte.length) return { median: 0, p90: 0, cfl: 0, cflP90: 0 }
  werte.sort((a, b) => a - b)
  const median = werte[Math.floor(werte.length * 0.5)]
  const p90 = werte[Math.floor(werte.length * 0.9)]
  return { median, p90, cfl: median * dt / dx, cflP90: p90 * dt / dx }
}
