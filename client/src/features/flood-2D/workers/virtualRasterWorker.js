/**
 * virtualRasterWorker.js
 *
 * Builds a virtual raster from survey points WITHOUT modifying the terrain.
 * The caller stores the result for preview, then fuses on demand.
 *
 * Strategy:
 *   1. Point-influence mask  – mark every cell within searchRadius of a survey
 *      point. This ensures ALL points are represented, regardless of polyline.
 *   2. Pre-seed exact values – cells that contain a survey point get its exact
 *      Z immediately (hard constraint, bypasses IDW approximation).
 *   3. IDW for remaining     – all other masked cells get IDW-interpolated Z.
 *   4. Thalweg enforcement   – optional monotone downstream sweep along polyline.
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
        polyline_xy, thalwegEnforce, thalwegRadius,
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

    // ── Spatial bin index for IDW ───────────────────────────────────────────
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

    // ── Phase 1: Point-influence mask ──────────────────────────────────────
    // Every cell within searchRadius of any survey point becomes a candidate.
    // This guarantees all survey points are represented in the output.
    const rCells = Math.ceil(sr / cellsize);
    const mask   = new Uint8Array(nrows * ncols);

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
    // Hard constraints: the cell containing a survey point gets its exact Z.
    // Using the nearest-cell rule (Math.round) for sub-cellsize accuracy.
    const resultIdx   = [];
    const resultZ     = [];
    const seededCells = new Set(); // cells already set by a survey point

    for (let pi = 0; pi < nPts; pi++) {
        const c = Math.round((ptsX[pi] - xllcorner) / cellsize);
        const r = Math.round((ptsY[pi] - yllcorner) / cellsize);
        if (c < 0 || c >= ncols || r < 0 || r >= nrows) continue;
        const idx = r * ncols + c;
        if (!mask[idx]) continue; // outside influence area (shouldn't happen)
        if (seededCells.has(idx)) {
            // Two points in same cell — average their Z values
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
    // Snap zone: cells within 2 × cellsize of a survey point bypass minPoints.
    // This guarantees the immediate neighbourhood of every measurement is filled
    // smoothly — no gaps from sparse-point minPoints gating.
    const snapR2       = (cellsize * 2) ** 2;
    const modifiedSet  = new Set(seededCells);
    const REPORT_EVERY = Math.max(1, (candidates.length / 40) | 0);
    const nearby       = [];
    const tmpD2        = [];
    const tmpZ         = [];

    for (let ci = 0; ci < candidates.length; ci++) {
        const idx = candidates[ci];
        if (seededCells.has(idx)) continue; // already exact from survey point

        const r     = (idx / ncols) | 0;
        const c     = idx % ncols;
        const realX = xllcorner + c * cellsize + cellsize / 2;
        const realY = yllcorner + r * cellsize + cellsize / 2;

        nearbyIdx(realX, realY, nearby);
        tmpD2.length = 0;
        tmpZ.length  = 0;

        let inSnapZone = false; // true if any survey point is within 2×cellsize

        for (const pi of nearby) {
            const d2 = (ptsX[pi] - realX) ** 2 + (ptsY[pi] - realY) ** 2;
            if (d2 > r2max) continue;
            if (d2 < 1e-10) {
                tmpD2.length = 0; tmpD2.push(0); tmpZ.push(ptsZ[pi]); break;
            }
            if (d2 <= snapR2) inSnapZone = true;
            tmpD2.push(d2);
            tmpZ.push(ptsZ[pi]);
        }

        if (tmpD2.length === 1 && tmpD2[0] === 0) {
            // exact hit via IDW path — already handled above, but keep as fallback
        } else {
            // Cells in the snap zone only need 1 point; others need full minPoints
            const effectiveMin = inSnapZone ? 1 : minPoints;
            if (tmpD2.length < effectiveMin) continue;
            if (maxPoints > 0 && tmpD2.length > maxPoints) {
                const order = Array.from({ length: tmpD2.length }, (_, i) => i)
                    .sort((a, b) => tmpD2[a] - tmpD2[b])
                    .slice(0, maxPoints);
                const kD2 = order.map(i => tmpD2[i]);
                const kZ  = order.map(i => tmpZ[i]);
                tmpD2.length = 0; tmpZ.length = 0;
                for (let k = 0; k < kD2.length; k++) { tmpD2.push(kD2[k]); tmpZ.push(kZ[k]); }
            }
        }

        let wSum = 0, zSum = 0;
        for (let k = 0; k < tmpD2.length; k++) {
            const w = tmpD2[k] === 0 ? 1e9 : 1 / (tmpD2[k] + nugget2) ** (power / 2);
            zSum += w * tmpZ[k];
            wSum += w;
        }
        const newZ = wSum > 0 ? zSum / wSum : null;
        if (newZ === null) continue;

        let finalZ = newZ;

        // Z-Clamp: cap to surrounding original DEM values
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

        // Forward min-sweep: Z non-increasing downstream
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
