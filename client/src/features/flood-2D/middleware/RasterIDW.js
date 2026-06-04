/**
 * RasterIDW.js
 * Fills NoData cells in a Float32Array grid using Inverse Distance Weighting.
 *
 * Standalone module — no Worker dependency, no Bathymetry pipeline coupling.
 *
 * @param {Float32Array} gridData  - flat row-major grid, -9999 = NoData
 * @param {object} header          - { ncols, nrows, cellsize, xll/xllcorner, yll/yllcorner }
 * @param {Array<{x,y,z}>} points  - source survey points in world coordinates
 * @param {object} [opts]
 * @param {number} [opts.searchRadius]  - max search radius in world units (default: cellsize × 8)
 * @param {number} [opts.power]         - IDW distance exponent (default: 2.0)
 * @param {number} [opts.maxPoints]     - max neighbours to use per cell (0 = unlimited, default: 16)
 * @param {boolean}[opts.zClamp]        - clamp result to min/max of used neighbours (default: true)
 * @returns {Float32Array}  new array with NoData cells interpolated where possible
 */
export function idwFillNoData(gridData, header, points, opts = {}) {
    const ncols    = header.ncols;
    const nrows    = header.nrows;
    const cellsize = header.cellsize;
    const xllv     = header.xll ?? header.xllcorner ?? 0;
    const yllv     = header.yll ?? header.yllcorner ?? 0;

    const searchRadius = opts.searchRadius ?? cellsize * 8;
    const power        = opts.power        ?? 2.0;
    const maxPts       = opts.maxPoints    ?? 16;
    const zClamp       = opts.zClamp       !== false;

    const r2limit = searchRadius * searchRadius;
    const out = new Float32Array(gridData);

    // Pre-build spatial index: bucket points by rough cell to skip distant points quickly
    const bucketSize = Math.max(1, Math.floor(searchRadius / cellsize));

    for (let row = 0; row < nrows; row++) {
        for (let col = 0; col < ncols; col++) {
            const idx = row * ncols + col;
            if (out[idx] > -9000) continue; // already valid — skip

            // World coordinates of cell centre (bottom-up Y)
            const cx = xllv + (col + 0.5) * cellsize;
            const cy = yllv + ((nrows - 1 - row) + 0.5) * cellsize;

            // Collect candidates within search radius
            const candidates = [];
            for (let pi = 0; pi < points.length; pi++) {
                const pt = points[pi];
                const dx = pt.x - cx;
                const dy = pt.y - cy;
                const d2 = dx * dx + dy * dy;
                if (d2 <= r2limit) candidates.push({ d2, z: pt.z });
            }

            if (candidates.length === 0) continue; // no neighbour found — leave as NoData

            // Sort by distance ascending, take closest maxPts
            candidates.sort((a, b) => a.d2 - b.d2);
            const use = (maxPts > 0 && candidates.length > maxPts)
                ? candidates.slice(0, maxPts)
                : candidates;

            // IDW accumulation
            let sumW = 0, sumWZ = 0;
            for (const c of use) {
                const d = Math.sqrt(c.d2);
                const w = d < 1e-9 ? 1e9 : 1.0 / Math.pow(d, power);
                sumW  += w;
                sumWZ += w * c.z;
            }

            let z = sumWZ / sumW;

            if (zClamp) {
                let zMin = use[0].z, zMax = use[0].z;
                for (const c of use) {
                    if (c.z < zMin) zMin = c.z;
                    if (c.z > zMax) zMax = c.z;
                }
                z = Math.min(zMax, Math.max(zMin, z));
            }

            out[idx] = z;
        }
    }

    return out;
}
