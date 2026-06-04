/**
 * useResultCoords.js — zentrale Koordinaten-Mathematik des Result-Viewers.
 *
 * Bündelt die zuvor in ResultMap3D mehrfach duplizierten Umrechnungen an EINER Stelle.
 * Die Formeln spiegeln 1:1 die bisherigen Implementierungen (keine Verhaltensänderung).
 *
 * Konventionen (Terrain ist ein PlaneGeometry, als Gruppe/Mesh um -PI/2 um X rotiert):
 *  - Grid: `idx = row*ncols + col`, row **bottom-up** (row 0 = Süden) — wie geoStore.terrain.gridData.
 *  - Geometrie-Zeile (geomRow) ist **top-down** (0 = Nord): `gridRow = (nrows-1) - geomRow`.
 *  - Plane-lokal: x ∈ [-w/2, w/2], y ∈ [-h/2, h/2].
 *  - bounds.width  = (ncols-1)*cellsize, bounds.height = (nrows-1)*cellsize (Fallback).
 *
 * @param {object} terrain  geoStore.terrain / hydratisiertes Terrain
 */
export function makeResultCoords(terrain) {
  const { ncols, nrows, cellsize, minZ, maxZ, xllcorner, yllcorner, gridData, center } = terrain;
  const cs = cellsize || 1;
  const width  = terrain.bounds?.width  ?? (ncols - 1) * cs;
  const height = terrain.bounds?.height ?? (nrows - 1) * cs;

  const inBounds = (col, row) => col >= 0 && col < ncols && row >= 0 && row < nrows;

  /** Raycast-Treffer (bereits via terrainMesh.worldToLocal in Plane-lokal) → Zelle.
   *  Spiegelt ResultMap3D.onPointerDown. Gibt null bei out-of-bounds/NoData. */
  const localHitToCell = (localPt) => {
    const fracX = (localPt.x + width / 2) / width;
    const fracY = (localPt.y + height / 2) / height;
    const col = Math.floor(fracX * ncols);
    const geomRow = Math.floor((1 - fracY) * nrows);
    const gridRow = (nrows - 1) - geomRow;
    if (!inBounds(col, gridRow)) return null;
    const idx = gridRow * ncols + col;
    const terrainZ = gridData ? gridData[idx] : -9999;
    if (terrainZ <= -9000) return null;
    return {
      col, geomRow, gridRow, idx, terrainZ,
      worldX: xllcorner + (col + 0.5) * cs,
      worldY: yllcorner + (gridRow + 0.5) * cs,
    };
  };

  /** Plane-lokal → reale Geo-Koordinaten (UTM). Spiegelt computeSectionData. */
  const localToReal = (localX, localY) => ({
    x: xllcorner + (localX + width / 2),
    y: yllcorner + (localY + height / 2),
  });

  /** Plane-lokale X aus Spalte. */
  const colToLocalX = (col) => -width / 2 + col * cs;
  /** Plane-lokale Y aus bottom-up Zeile. */
  const rowToLocalY = (rowBottomUp) => -height / 2 + rowBottomUp * cs;
  /** Plane-lokale Y aus top-down Geometrie-Zeile (0 = Nord). */
  const geomRowToLocalY = (geomRow) => height / 2 - geomRow * cs;

  /** Terrainhöhe (absolut, NHN) an Welt-XY (center-basiert, bottom-up gridData). null wenn außerhalb/NoData. */
  const sampleTerrainZ = (wx, wy) => {
    if (!gridData || !center) return null;
    const col  = Math.round((wx - (center.x - width / 2)) / cs);
    const rowBU = Math.round((wy - (center.y - height / 2)) / cs);
    if (!inBounds(col, rowBU)) return null;
    const z = gridData[rowBU * ncols + col];
    return z > -9000 ? z : null;
  };

  return {
    ncols, nrows, cellsize: cs, minZ, maxZ, width, height,
    inBounds, localHitToCell, localToReal,
    colToLocalX, rowToLocalY, geomRowToLocalY, sampleTerrainZ,
  };
}
