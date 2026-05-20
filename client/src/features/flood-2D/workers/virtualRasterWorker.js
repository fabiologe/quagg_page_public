/**
 * virtualRasterWorker.js
 *
 * Builds a virtual raster from survey points WITHOUT modifying the terrain.
 * The caller stores the result for preview, then fuses on demand.
 *
 * Two masking modes (selected by presence of polygon_xy):
 *
 *   A) Polygon mode  (polygon_xy provided)
 *      1. Point-in-polygon — ALL cells inside the Flussschlauch-Polygon are candidates.
 *         Guarantees lückenlose Kanalabdeckung regardless of survey point distribution.
 *      2. Pre-seed exact values — cells containing a survey point get exact Z.
 *      3a. IDW for cells with ≥minPoints nearby survey points (within searchRadius).
 *      3b. Fallback global IDW — cells inside polygon with 0 nearby points → IDW
 *          from ALL survey points (fills gaps between measured cross-sections).
 *      4. Thalweg enforcement (optional).
 *
 *   B) Point-influence mode  (polygon_xy absent, legacy behaviour)
 *      1. Circle mask — cells within searchRadius of any survey point.
 *      2–4. Same as polygon mode (no fallback needed — mask already matches points).
 *
 * Input (postMessage):
 *   pts_xyz        Float64Array  – [x0,y0,z0, x1,y1,z1, …]
 *   ncols/nrows    number
 *   cellsize       number        [m]
 *   xllcorner/yllcorner number
 *   searchRadius   number        IDW search radius [m]
 *   power          number        IDW exponent
 *   minPoints      number        min neighbours required for IDW
 *   maxPoints      number        K-nearest limit (0 = all in radius)
 *   nugget         number        smoothing offset [m]
 *   zClamp         boolean       cap result to surrounding DEM values
 *   gridData       Float32Array  DEM values (needed for zClamp)
 *   polygon_xy     Float64Array? [x0,y0, x1,y1, …]  Flussschlauch polygon
 *   polyline_xy    Float64Array? [x0,y0, x1,y1, …]  (for thalweg only)
 *   thalwegEnforce boolean
 *   thalwegRadius  number        thalweg corridor half-width [m]
 *
 * Output:
 *   { type: 'progress', value: 0–100, cellCount? }
 *   { type: 'done', indices: Uint32Array, zValues: Float32Array }  (Transferable)
 */
self.onmessage = function ({ data }) {
    const {
        pts_xyz,
        ncols, nrows, cellsize, xllcorner, yllcorner,
        searchRadius, power, minPoints, maxPoints, nugget, zClamp, gridData,
        polygon_xy, polyline_xy, thalwegEnforce, thalwegRadius,
    } = data;

    const sr      = searchRadius;
    const r2max   = sr * sr;
    const nugget2 = nugget * nugget;

    // ── Unpack survey points ────────────────────────────────────────────────
    const nPts = pts_xyz.length / 3;
    const ptsX = new Float64Array(nPts);
    const ptsY = new Float64Array(nPts);
    const ptsZ = new Float64Array(nPts);
    for (let i = 0; i < nPts; i++) {
        ptsX[i] = pts_xyz[i * 3];
        ptsY[i] = pts_xyz[i * 3 + 1];
        ptsZ[i] = pts_xyz[i * 3 + 2];
    }

    // ── Spatial bin index for local IDW ────────────────────────────────────
    const binMap = new Map();
    for (let i = 0; i < nPts; i++) {
        const br  = Math.floor(ptsY[i] / sr);
        const bc  = Math.floor(ptsX[i] / sr);
        const key = br * 1_000_003 + bc;
        let bin = binMap.get(key);
        if (!bin) { bin = []; binMap.set(key, bin); }
        bin.push(i);
    }

    function nearbyIdx(realX, realY, out) {
        out.length = 0;
        const br = Math.floor(realY / sr);
        const bc = Math.floor(realX / sr);
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const bin = binMap.get((br + dr) * 1_000_003 + (bc + dc));
                if (bin) for (const i of bin) out.push(i);
            }
        }
    }

    // ── Point-in-polygon (ray casting) ─────────────────────────────────────
    // Returns true if (px, py) is inside the polygon defined by poly_x/poly_y.
    function pointInPolygon(px, py, polyX, polyY, n) {
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polyX[i], yi = polyY[i];
            const xj = polyX[j], yj = polyY[j];
            if ((yi > py) !== (yj > py)) {
                const xCross = (xj - xi) * (py - yi) / (yj - yi) + xi;
                if (px < xCross) inside = !inside;
            }
        }
        return inside;
    }

    const usePolygon = polygon_xy && polygon_xy.length >= 6;

    // ── Phase 1: Build mask ─────────────────────────────────────────────────
    const mask = new Uint8Array(nrows * ncols);

    if (usePolygon) {
        // Unpack polygon and compute bbox for fast rejection
        const nPoly = (polygon_xy.length / 2) | 0;
        const polyX = new Float64Array(nPoly);
        const polyY = new Float64Array(nPoly);
        let bboxXMin = Infinity, bboxXMax = -Infinity;
        let bboxYMin = Infinity, bboxYMax = -Infinity;
        for (let i = 0; i < nPoly; i++) {
            polyX[i] = polygon_xy[i * 2];
            polyY[i] = polygon_xy[i * 2 + 1];
            if (polyX[i] < bboxXMin) bboxXMin = polyX[i];
            if (polyX[i] > bboxXMax) bboxXMax = polyX[i];
            if (polyY[i] < bboxYMin) bboxYMin = polyY[i];
            if (polyY[i] > bboxYMax) bboxYMax = polyY[i];
        }

        // Column and row bounds for the bbox
        const cMin = Math.max(0, Math.floor((bboxXMin - xllcorner) / cellsize) - 1);
        const cMax = Math.min(ncols - 1, Math.ceil((bboxXMax - xllcorner) / cellsize) + 1);
        const rMin = Math.max(0, Math.floor((bboxYMin - yllcorner) / cellsize) - 1);
        const rMax = Math.min(nrows - 1, Math.ceil((bboxYMax - yllcorner) / cellsize) + 1);

        for (let r = rMin; r <= rMax; r++) {
            const cy = yllcorner + r * cellsize + cellsize / 2;
            for (let c = cMin; c <= cMax; c++) {
                const cx = xllcorner + c * cellsize + cellsize / 2;
                if (pointInPolygon(cx, cy, polyX, polyY, nPoly)) {
                    mask[r * ncols + c] = 1;
                }
            }
        }
    } else {
        // Legacy: circle mask around every survey point
        const rCells = Math.ceil(sr / cellsize);
        for (let pi = 0; pi < nPts; pi++) {
            const px = ptsX[pi], py = ptsY[pi];
            const cC = Math.round((px - xllcorner) / cellsize);
            const cR = Math.round((py - yllcorner) / cellsize);
            for (let dr = -rCells; dr <= rCells; dr++) {
                const r = cR + dr;
                if (r < 0 || r >= nrows) continue;
                const ry  = yllcorner + r * cellsize + cellsize / 2;
                const dy2 = (ry - py) ** 2;
                if (dy2 > r2max) continue;
                for (let dc = -rCells; dc <= rCells; dc++) {
                    const c = cC + dc;
                    if (c < 0 || c >= ncols) continue;
                    const rx = xllcorner + c * cellsize + cellsize / 2;
                    if (dy2 + (rx - px) ** 2 <= r2max) mask[r * ncols + c] = 1;
                }
            }
        }
    }

    const candidates = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) candidates.push(i);

    self.postMessage({ type: 'progress', value: 5, cellCount: candidates.length });

    if (!candidates.length) {
        self.postMessage(
            { type: 'done', indices: new Uint32Array(0), zValues: new Float32Array(0) },
            [],
        );
        return;
    }

    // ── Phase 2: Pre-seed exact values at survey point cells ───────────────
    const resultIdx   = [];
    const resultZ     = [];
    const seededCells = new Set();

    for (let pi = 0; pi < nPts; pi++) {
        const c = Math.round((ptsX[pi] - xllcorner) / cellsize);
        const r = Math.round((ptsY[pi] - yllcorner) / cellsize);
        if (c < 0 || c >= ncols || r < 0 || r >= nrows) continue;
        const idx = r * ncols + c;
        if (!mask[idx]) continue;
        if (seededCells.has(idx)) {
            const existing = resultIdx.indexOf(idx);
            if (existing >= 0) resultZ[existing] = (resultZ[existing] + ptsZ[pi]) / 2;
            continue;
        }
        seededCells.add(idx);
        resultIdx.push(idx);
        resultZ.push(ptsZ[pi]);
    }

    self.postMessage({ type: 'progress', value: 10 });

    // ── Phase 3: IDW for remaining masked cells ─────────────────────────────
    const snapR2       = (cellsize * 2) ** 2;
    const modifiedSet  = new Set(seededCells);
    const REPORT_EVERY = Math.max(1, (candidates.length / 40) | 0);
    const nearby       = [];
    const tmpD2        = [];
    const tmpZ         = [];

    // Pre-compute all-points squared distances only when fallback IDW is needed
    // (polygon mode). We re-run it per cell lazily — acceptable since fallback
    // cells are typically sparse.
    function globalIDW(realX, realY) {
        let wSum = 0, zSum = 0, count = 0;
        for (let pi = 0; pi < nPts; pi++) {
            const d2 = (ptsX[pi] - realX) ** 2 + (ptsY[pi] - realY) ** 2;
            const w  = d2 < 1e-10 ? 1e9 : 1 / (d2 + nugget2) ** (power / 2);
            zSum += w * ptsZ[pi];
            wSum += w;
            count++;
        }
        return count > 0 && wSum > 0 ? zSum / wSum : null;
    }

    for (let ci = 0; ci < candidates.length; ci++) {
        const idx = candidates[ci];
        if (seededCells.has(idx)) continue;

        const r     = (idx / ncols) | 0;
        const c     = idx % ncols;
        const realX = xllcorner + c * cellsize + cellsize / 2;
        const realY = yllcorner + r * cellsize + cellsize / 2;

        nearbyIdx(realX, realY, nearby);
        tmpD2.length = 0;
        tmpZ.length  = 0;

        let inSnapZone = false;

        for (const pi of nearby) {
            const d2 = (ptsX[pi] - realX) ** 2 + (ptsY[pi] - realY) ** 2;
            if (d2 > r2max) continue;
            if (d2 < 1e-10) {
                tmpD2.length = 0; tmpD2.push(0); tmpZ.length = 0; tmpZ.push(ptsZ[pi]); break;
            }
            if (d2 <= snapR2) inSnapZone = true;
            tmpD2.push(d2);
            tmpZ.push(ptsZ[pi]);
        }

        let newZ = null;

        if (tmpD2.length > 0) {
            const effectiveMin = inSnapZone ? 1 : minPoints;
            if (tmpD2.length >= effectiveMin) {
                let kD2 = tmpD2, kZ = tmpZ;
                if (maxPoints > 0 && tmpD2.length > maxPoints) {
                    const order = Array.from({ length: tmpD2.length }, (_, i) => i)
                        .sort((a, b) => tmpD2[a] - tmpD2[b])
                        .slice(0, maxPoints);
                    kD2 = order.map(i => tmpD2[i]);
                    kZ  = order.map(i => tmpZ[i]);
                }
                let wSum = 0, zSum = 0;
                for (let k = 0; k < kD2.length; k++) {
                    const w = kD2[k] === 0 ? 1e9 : 1 / (kD2[k] + nugget2) ** (power / 2);
                    zSum += w * kZ[k];
                    wSum += w;
                }
                if (wSum > 0) newZ = zSum / wSum;
            }
        }

        // Fallback: no nearby points — use global IDW from ALL survey points.
        // Only applies in polygon mode to guarantee lückenlose Kanalabdeckung.
        if (newZ === null && usePolygon && nPts > 0) {
            newZ = globalIDW(realX, realY);
        }

        if (newZ === null) continue;

        let finalZ = newZ;

        if (zClamp && gridData) {
            let maxN = -Infinity;
            const W = 2;
            for (let dr = -W; dr <= W; dr++) {
                for (let dc = -W; dc <= W; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nr >= nrows || nc < 0 || nc >= ncols) continue;
                    const ni = nr * ncols + nc;
                    if (gridData[ni] > -9000 && !modifiedSet.has(ni) && gridData[ni] > maxN)
                        maxN = gridData[ni];
                }
            }
            if (maxN > -Infinity && finalZ > maxN) finalZ = maxN;
        }

        resultIdx.push(idx);
        resultZ.push(finalZ);
        modifiedSet.add(idx);

        if (ci % REPORT_EVERY === 0) {
            self.postMessage({ type: 'progress', value: 10 + ((ci / candidates.length) * 85 | 0) });
        }
    }

    // ── Phase 4: Monotone thalweg enforcement (optional) ───────────────────
    if (thalwegEnforce && polyline_xy && polyline_xy.length >= 4 && thalwegRadius > 0 && resultIdx.length > 0) {
        const nPolyPts = (polyline_xy.length / 2) | 0;
        const nSegs    = nPolyPts - 1;
        const tr2      = thalwegRadius * thalwegRadius;

        const cumStation = new Float64Array(nPolyPts);
        for (let i = 0; i < nSegs; i++) {
            const dx = polyline_xy[(i + 1) * 2]     - polyline_xy[i * 2];
            const dy = polyline_xy[(i + 1) * 2 + 1] - polyline_xy[i * 2 + 1];
            cumStation[i + 1] = cumStation[i] + Math.sqrt(dx * dx + dy * dy);
        }

        const stationOf = new Float64Array(resultIdx.length).fill(-1);
        for (let ci = 0; ci < resultIdx.length; ci++) {
            const idx = resultIdx[ci];
            const r   = (idx / ncols) | 0;
            const c   = idx % ncols;
            const px  = xllcorner + c * cellsize + cellsize / 2;
            const py  = yllcorner + r * cellsize + cellsize / 2;

            let bestD2 = Infinity, bestS = 0;
            for (let s = 0; s < nSegs; s++) {
                const ax = polyline_xy[s * 2],       ay = polyline_xy[s * 2 + 1];
                const bx = polyline_xy[(s + 1) * 2], by = polyline_xy[(s + 1) * 2 + 1];
                const sdx = bx - ax, sdy = by - ay;
                const lSq = sdx * sdx + sdy * sdy;
                if (lSq < 1e-12) continue;
                const t  = Math.max(0, Math.min(1, ((px - ax) * sdx + (py - ay) * sdy) / lSq));
                const ex = px - (ax + t * sdx), ey = py - (ay + t * sdy);
                const d2 = ex * ex + ey * ey;
                if (d2 < bestD2) { bestD2 = d2; bestS = cumStation[s] + t * Math.sqrt(lSq); }
            }
            if (bestD2 <= tr2) stationOf[ci] = bestS;
        }

        const corridorIdx = [];
        for (let ci = 0; ci < resultIdx.length; ci++) {
            if (stationOf[ci] >= 0) corridorIdx.push(ci);
        }
        corridorIdx.sort((a, b) => stationOf[a] - stationOf[b]);

        let runMin = Infinity;
        for (const ci of corridorIdx) {
            if (resultZ[ci] < runMin) runMin = resultZ[ci];
            else if (resultZ[ci] > runMin) resultZ[ci] = runMin;
        }
    }

    self.postMessage({ type: 'progress', value: 100 });

    const indices = new Uint32Array(resultIdx);
    const zValues = new Float32Array(resultZ);
    self.postMessage(
        { type: 'done', indices, zValues },
        [indices.buffer, zValues.buffer],
    );
};
