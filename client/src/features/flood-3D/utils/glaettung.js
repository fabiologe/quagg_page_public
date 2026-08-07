// 3D-Box-Glaettung (3x3x3-Mittel mit Randnormierung) fuer das Alphafeld
// vor Marching Cubes. Als drei separierbare 1D-Paesse statt der frueheren
// 27-Nachbarn-Schleife: mathematisch IDENTISCH — auch am Rand, weil die
// gueltige 3x3x3-Nachbarschaft dort ein Produktmengen-Ausschnitt ist und
// sich der Zaehler (cx·cy·cz) genauso faktorisiert wie die Summe —, aber
// rund 9x weniger Speicherzugriffe. Der Test vergleicht gegen die naive
// Referenz, inklusive Raender.
//
// Dazu ein Ergebnis-Cache je Eingabefeld: die Glaettung lief vorher bei
// JEDEM Szenen-Update neu (jeder Layer-Toggle, jeder Regler), obwohl sich
// Feld und Stufenzahl gar nicht geaendert hatten.

function passe(a, dims, achse) {
  const [nx, ny, nz] = dims
  const out = new Float32Array(a.length)
  const stride = achse === 0 ? 1 : achse === 1 ? nx : nx * ny
  const groesse = dims[achse]
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      const basis = (k * ny + j) * nx
      for (let i = 0; i < nx; i++) {
        const idx = basis + i
        const c = achse === 0 ? i : achse === 1 ? j : k
        let sum = a[idx]
        let n = 1
        if (c > 0) { sum += a[idx - stride]; n++ }
        if (c < groesse - 1) { sum += a[idx + stride]; n++ }
        out[idx] = sum / n
      }
    }
  }
  return out
}

export function glaetteFeld(values, dims, durchgaenge) {
  let a = values
  for (let d = 0; d < durchgaenge; d++) {
    a = passe(passe(passe(a, dims, 0), dims, 1), dims, 2)
  }
  return a
}

// WeakMap auf das Eingabe-Array: verschwindet das Volumen aus dem
// LRU-Cache, raeumt der GC die Glaettungen automatisch mit ab.
const cache = new WeakMap()

export function glaetteFeldCached(values, dims, durchgaenge) {
  if (!durchgaenge || durchgaenge <= 0) return values
  let stufen = cache.get(values)
  if (!stufen) {
    stufen = new Map()
    cache.set(values, stufen)
  }
  if (!stufen.has(durchgaenge)) {
    stufen.set(durchgaenge, glaetteFeld(values, dims, durchgaenge))
  }
  return stufen.get(durchgaenge)
}
