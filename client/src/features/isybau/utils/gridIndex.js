/**
 * gridIndex.js — eine Quelle der Wahrheit für die Zeilen-Spiegelung zwischen den beiden
 * Raster-Orientierungen, die im DGM-Import koexistieren:
 *
 *   • bottom-up   (terrain.gridData): row 0 = SÜD,  idx = row*ncols + col
 *   • top-down    (PlaneGeometry-Vertices): row 0 = NORD
 *
 * Portiert von flood-2D/utils/gridIndex.js (identische Konvention, hier für das
 * isybau-DGM-Terrain-Mesh benötigt). Die Umrechnung `(nrows-1-row)` selbst-invers
 * an einer Stelle zu bündeln vermeidet ein an mehreren Stellen dupliziertes,
 * fehleranfälliges Inline-Flip.
 */

/** Spiegelt eine Rasterzeile zwischen bottom-up und top-down (selbst-invers). */
export function flipRow(row, nrows) {
    return (nrows - 1) - row;
}

/**
 * Flacher Index in das jeweils ANDERE Orientierungs-Raster: nimmt eine Zeile der einen
 * Orientierung + Spalte und liefert `flipRow(row)*ncols + col`. Da `flipRow` selbst-invers
 * ist, funktioniert dieselbe Funktion in beide Richtungen (bottom-up↔top-down).
 */
export function flippedIndex(row, col, ncols, nrows) {
    return ((nrows - 1) - row) * ncols + col;
}
