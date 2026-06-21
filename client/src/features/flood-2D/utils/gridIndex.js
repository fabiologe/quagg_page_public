/**
 * gridIndex.js — eine Quelle der Wahrheit für die Zeilen-Spiegelung zwischen den beiden
 * Raster-Orientierungen, die im Feature koexistieren:
 *
 *   • bottom-up   (terrain.gridData / Editor): row 0 = SÜD,  idx = row*ncols + col
 *   • top-down    (Result-Raster / PlaneGeometry-Vertices): row 0 = NORD
 *
 * Die Umrechnung `(nrows-1-row)` war an >5 Stellen inline dupliziert (useWeirResults,
 * useDangerMarkers, useFlowArrows, useFlowStreamlines …) — fehleranfällig, weil ein
 * vergessenes Flip Norden/Süden vertauscht. Diese Helfer sind selbst-invers.
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
