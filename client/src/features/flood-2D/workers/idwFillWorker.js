/**
 * idwFillWorker.js
 *
 * Runs IDW auto-fill entirely off the main thread.
 *
 * Input (postMessage):
 *   pts_xyz        Float64Array  – survey points packed as [x0,y0,z0, x1,y1,z1, …]
 *   gridData       Float32Array  – DEM values (copy of terrain.gridData)
 *   ncols/nrows    number
 *   cellsize       number        – [m]
 *   xllcorner/yllcorner number  – grid origin
 *   searchRadius   number        – IDW search radius [m]
 *   power          number        – IDW exponent
 *   minPoints      number        – min neighbours required
 *   maxPoints      number        – K-nearest limit (0 = all in radius)
 *   nugget         number        – smoothing offset [m]
 *   zClamp         boolean       – limit result to max of unmodified neighbours
 *   onlyNoData     boolean       – only fill NoData cells (≤ -9000)
 *   polyline_xy    Float64Array  – (optional) channel centerline [x0,y0, x1,y1, …]
 *   thalwegRadius  number        – corridor half-width for thalweg enforcement [m]
 *
 * Output messages:
 *   { type: 'progress', value: 0–100, candidateCount? }
 *   { type: 'done', indices: Uint32Array, zValues: Float32Array }  (Transferable)
 */
self.onmessage = function ({ data }) {
    const {
        pts_xyz, gridData,
        ncols, nrows, cellsize, xllcorner, yllcorner,
        searchRadius, power, minPoints, maxPoints, nugget, zClamp, onlyNoData,
        polyline_xy, thalwegRadius,
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

    // ── Phase 1: Räumlicher Index (Bin-Grid, Bin-Größe = searchRadius) ──────
    // Integer-Schlüssel: kein String-Alloc im Hot-Loop
    const binMap = new Map();
    for (let i = 0; i < nPts; i++) {
        const br  = Math.floor(ptsY[i] / sr);
        const bc  = Math.floor(ptsX[i] / sr);
        const key = br * 1_000_003 + bc;
        let bin = binMap.get(key);
        if (!bin) { bin = []; binMap.set(key, bin); }
        bin.push(i);
    }

    // Gibt Punkt-Indizes zurück, deren Bin zu (realX,realY) benachbart ist
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

    // ── Phase 2: Kandidaten-Maske ───────────────────────────────────────────
    // Nur Zellen im Einflussbereich der Punkte werden verarbeitet
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

    self.postMessage({ type: 'progress', value: 10, candidateCount: candidates.length });

    if (!candidates.length) {
        self.postMessage(
            { type: 'done', indices: new Uint32Array(0), zValues: new Float32Array(0) },
            [],
        );
        return;
    }

    // ── Phase 3: IDW pro Kandidat ───────────────────────────────────────────
    const modifiedSet  = new Set();
    const resultIdx    = [];
    const resultZ      = [];
    const REPORT_EVERY = Math.max(1, (candidates.length / 40) | 0);
    const nearby       = [];   // reused buffer for nearbyIdx

    // Temporäre Arrays für K-nearest sort (vermeidet GC-Druck)
    const tmpD2 = [];
    const tmpZ  = [];

    for (let ci = 0; ci < candidates.length; ci++) {
        const idx = candidates[ci];
        if (onlyNoData && gridData[idx] > -9000) continue;

        const r     = (idx / ncols) | 0;
        const c     = idx % ncols;
        const realX = xllcorner + c * cellsize + cellsize / 2;
        const realY = yllcorner + r * cellsize + cellsize / 2;

        // IDW mit räumlich vorgefilterter Nachbarliste
        nearbyIdx(realX, realY, nearby);
        tmpD2.length = 0;
        tmpZ.length  = 0;

        for (const pi of nearby) {
            const d2 = (ptsX[pi] - realX) ** 2 + (ptsY[pi] - realY) ** 2;
            if (d2 > r2max) continue;
            if (d2 < 1e-10) { tmpD2.length = 0; tmpD2.push(0); tmpZ.push(ptsZ[pi]); break; }
            tmpD2.push(d2);
            tmpZ.push(ptsZ[pi]);
        }

        if (tmpD2.length === 1 && tmpD2[0] === 0) {
            // Exakter Treffer
        } else {
            if (tmpD2.length < minPoints) continue;
            if (maxPoints > 0 && tmpD2.length > maxPoints) {
                // K-nearest: sortiere nach d2, behalte erste K
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
        let newZ = wSum > 0 ? zSum / wSum : null;
        if (newZ === null) continue;

        // Z-Clamp
        if (zClamp) {
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
            if (maxN > -Infinity && newZ > maxN) newZ = maxN;
        }

        resultIdx.push(idx);
        resultZ.push(newZ);
        modifiedSet.add(idx);

        if (ci % REPORT_EVERY === 0) {
            self.postMessage({ type: 'progress', value: 10 + ((ci / candidates.length) * 90 | 0) });
        }
    }

    // ── Phase 4: Monotone Thalweg Enforcement (optional) ───────────────────
    if (polyline_xy && polyline_xy.length >= 4 && thalwegRadius > 0 && resultIdx.length > 0) {
        const nPolyPts = (polyline_xy.length / 2) | 0;
        const nSegs    = nPolyPts - 1;
        const tr2      = thalwegRadius * thalwegRadius;

        // Cumulative station along polyline
        const cumStation = new Float64Array(nPolyPts);
        for (let i = 0; i < nSegs; i++) {
            const dx = polyline_xy[(i+1)*2]   - polyline_xy[i*2];
            const dy = polyline_xy[(i+1)*2+1] - polyline_xy[i*2+1];
            cumStation[i+1] = cumStation[i] + Math.sqrt(dx*dx + dy*dy);
        }

        // Project each modified cell onto the polyline
        const stationOf = new Float64Array(resultIdx.length);
        stationOf.fill(-1); // -1 = outside corridor

        for (let ci = 0; ci < resultIdx.length; ci++) {
            const idx  = resultIdx[ci];
            const r    = (idx / ncols) | 0;
            const c    = idx % ncols;
            const px   = xllcorner + c * cellsize + cellsize / 2;
            const py   = yllcorner + r * cellsize + cellsize / 2;

            let bestD2 = Infinity, bestS = 0;
            for (let s = 0; s < nSegs; s++) {
                const ax = polyline_xy[s*2],     ay = polyline_xy[s*2+1];
                const bx = polyline_xy[(s+1)*2], by = polyline_xy[(s+1)*2+1];
                const sdx = bx - ax, sdy = by - ay;
                const lenSq = sdx*sdx + sdy*sdy;
                if (lenSq < 1e-12) continue;
                const t  = Math.max(0, Math.min(1, ((px-ax)*sdx + (py-ay)*sdy) / lenSq));
                const ex = px - (ax + t*sdx), ey = py - (ay + t*sdy);
                const d2 = ex*ex + ey*ey;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    bestS  = cumStation[s] + t * Math.sqrt(lenSq);
                }
            }
            if (bestD2 <= tr2) stationOf[ci] = bestS;
        }

        // Sort corridor cells by station (upstream → downstream)
        const corridorIdx = [];
        for (let ci = 0; ci < resultIdx.length; ci++) {
            if (stationOf[ci] >= 0) corridorIdx.push(ci);
        }
        corridorIdx.sort((a, b) => stationOf[a] - stationOf[b]);

        // Forward min-sweep: Z must be non-increasing downstream
        // If a cell's Z is higher than what came upstream, lower it.
        let runMin = Infinity;
        for (const ci of corridorIdx) {
            const z = resultZ[ci];
            if (z < runMin) {
                runMin = z;
            } else if (z > runMin) {
                resultZ[ci] = runMin;
            }
        }

        self.postMessage({ type: 'progress', value: 99 });
    }

    const indices = new Uint32Array(resultIdx);
    const zValues = new Float32Array(resultZ);
    self.postMessage(
        { type: 'done', indices, zValues },
        [indices.buffer, zValues.buffer],
    );
};
