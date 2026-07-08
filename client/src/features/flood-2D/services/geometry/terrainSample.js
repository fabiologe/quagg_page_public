// Gelände-Sampler für die Kanalnetz↔Raster-Abgleiche. Spiegelt useLayerRenderer.sampleTerrainZ:
// geoStore.terrain.gridData ist BOTTOM-UP (row 0 = Süden), zentriert auf terrain.center.

/**
 * @param {object} terrain  geoStore.terrain ({gridData, center, cellsize, ncols, nrows, minZ})
 * @returns {{ sampleZ:(x,y)=>number|null, inBounds:(x,y)=>boolean, center, ncols, nrows, cellsize }|null}
 */
export function makeTerrainSampler(terrain) {
    if (!terrain || !terrain.gridData || !terrain.center || !terrain.cellsize) return null;
    const { gridData: data, center, cellsize: cs, ncols, nrows } = terrain;
    if (!ncols || !nrows) return null;
    const width = (ncols - 1) * cs, height = (nrows - 1) * cs;
    const originX = center.x - width / 2, originY = center.y - height / 2;

    function sampleZ(x, y) {
        const col = Math.round((x - originX) / cs);
        const rowS = Math.round((y - originY) / cs);
        if (col < 0 || col >= ncols || rowS < 0 || rowS >= nrows) return null;
        const z = data[rowS * ncols + col];
        return (z > -9000) ? z : null;   // NoData → null
    }
    return {
        sampleZ,
        inBounds: (x, y) => sampleZ(x, y) !== null,
        center: { x: center.x, y: center.y, z: terrain.minZ ?? 0 },
        ncols, nrows, cellsize: cs,
        // DGM-Ausdehnung in Weltkoordinaten (für CRS-/Frame-Abgleich mit dem Netz).
        bounds: { minX: originX, maxX: originX + width, minY: originY, maxY: originY + height },
    };
}
