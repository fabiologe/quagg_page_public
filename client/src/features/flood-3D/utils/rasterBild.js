// Bildaufbau einer Rasterkarte, als reine Funktionen: die Höhen-
// schummerung des Geländes (blaugrauer Untergrund) und das Mischen einer
// Farbe darüber.
//
// Eingesammelt aus GrundrissPanel.draw(): die zMin/zMax-Suche samt
// zSpan-Klemme (vorher Z. 513–519), Schummerung und Grundfarbe je Zelle
// (Z. 551–554) und die DREIFACH kopierte Alpha-Mischung (Z. 562–566 im
// Ebenen-Modus, 579–583 im Tiefenbild, 588–591 für die Benetzung).
// Herausgezogen, weil ein zweites Rasterkarten-Panel (Laubkarten) genau
// dieselben Zahlen braucht — nachgebaut wären sie sofort auseinander-
// gelaufen, und eine Karte hätte anders ausgesehen als die andere.
//
// Die Zahlen sind bewusst unverändert übernommen; die Funktionen kennen
// weder Store noch Komponente, sondern nur ihre Argumente.

/**
 * Höhenschummerung des Geländes, je Rasterzelle.
 *
 * Ergebnis ist eine Float64Array — NICHT Float32: die Schummerung geht
 * ungerundet in gelaendeFarbe() ein, und deren Ergebnis landet in einem
 * Uint8ClampedArray. Eine Float32-Zwischenrundung könnte dort einzelne
 * Kanalwerte um 1 kippen, also genau die Optik ändern, die gleich
 * bleiben soll.
 *
 * @param {ArrayLike<number>|null|undefined} terrainZ Geländehöhen der
 *   Säulen (Index j·nx + i); fehlt die Schicht, wird flach 0.5 geschummert
 * @param {number} anzahl Zellen des ZIEL-Rasters (nx·ny) — dieselbe
 *   Zählweise wie das gezeichnete Bild, nicht zwingend terrainZ.length
 * @returns {{shade: Float64Array, zMin: number, zSpan: number}}
 */
export function gelaendeSchummerung(terrainZ, anzahl = terrainZ?.length ?? 0) {
  let zMin = Infinity
  let zMax = -Infinity
  if (terrainZ) {
    for (const z of terrainZ) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z) }
  }
  // Mindestspanne: ein flaches Gelände darf nicht durch 0 teilen
  const zSpan = Math.max(zMax - zMin, 0.01)
  const shade = new Float64Array(anzahl)
  if (terrainZ) {
    for (let c = 0; c < anzahl; c++) {
      shade[c] = 0.35 + 0.5 * ((terrainZ[c] - zMin) / zSpan)
    }
  } else {
    shade.fill(0.5)
  }
  return { shade, zMin, zSpan }
}

/**
 * Grundfarbe einer Zelle aus ihrer Schummerung — der blaugraue Untergrund,
 * auf dem alle weiteren Ebenen liegen.
 * @param {number} shade 0.35 (tiefster Punkt) … 0.85 (höchster Punkt)
 * @returns {[number, number, number]} r/g/b in 0…255
 */
export function gelaendeFarbe(shade) {
  return [34 * shade + 14, 44 * shade + 18, 66 * shade + 30]
}

/**
 * Farbe `rgb` mit Deckkraft `a` über den Untergrund `basis` legen.
 * a = 0 lässt den Untergrund stehen, a = 1 deckt ihn vollständig ab.
 * @param {ArrayLike<number>} basis r/g/b des Untergrunds
 * @param {ArrayLike<number>} rgb r/g/b der aufgelegten Farbe
 * @param {number} a Deckkraft 0…1
 * @returns {[number, number, number]}
 */
export function mische(basis, rgb, a) {
  return [basis[0] * (1 - a) + rgb[0] * a,
    basis[1] * (1 - a) + rgb[1] * a,
    basis[2] * (1 - a) + rgb[2] * a]
}
