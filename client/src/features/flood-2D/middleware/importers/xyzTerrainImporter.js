/**
 * xyzTerrainImporter.js
 *
 * Robuster Import von XYZ-Punktwolken zu einem regulären DGM-Raster — auch für
 * IRREGULÄRE (scattered) und SEHR GROSSE Dateien.
 *
 * Kernproblem der Alt-Logik: Die Zellweite wurde aus dem Abstand der ersten zwei
 * X-Werte abgeleitet. Bei unregelmäßigen Daten ist dieser Abstand winzig → ncols*nrows
 * explodiert → `new Float32Array(...)` wirft `RangeError: Invalid array length`.
 *
 * Dieses Modul:
 *   1. parseXyzPoints()   – eine kanonische, speichereffiziente Parse-Logik.
 *   2. analyzeGeometry()  – erkennt regulär vs. irregulär, schlägt eine sichere
 *                           Zellweite vor (Zellbudget-Deckel → nie Overflow).
 *   3. buildRegularDem()  – TIN (Delaunay, baryzentrisch linear) + IDW-Fallback.
 *   4. makeTerrainObject()– kanonische Terrain-Form für geoStore.importTerrain().
 *
 * Konventionen (identisch zum Rest der Codebase):
 *   - gridData bottom-up: row 0 = Süden, row nrows-1 = Norden.
 *   - gridData[row * ncols + col]; Zellzentrum(col,row) = (xll + col*cs, yll + row*cs).
 *   - NODATA = -9999.
 */

import Delaunator from 'delaunator';

export const NODATA = -9999;

// Obergrenze für ncols*nrows. Hält Speicher/Zeit im Browser beherrschbar und
// garantiert, dass die Zell-Anzahl endlich bleibt (kein Float32Array-Overflow).
export const MAX_CELLS = 40_000_000;

// „Schöne" Zellweiten in Metern, auf die der Auto-Vorschlag snappt.
const NICE_STEPS = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

/** Kleinste NICE_STEP-Zellweite ≥ v (bzw. die größte, falls v alle übersteigt). */
function niceSnap(v) {
    if (!(v > 0) || !isFinite(v)) return 1;
    for (const s of NICE_STEPS) if (s >= v) return s;
    return NICE_STEPS[NICE_STEPS.length - 1];
}

/** Nächstgrößere NICE_STEP-Zellweite (für Budget-Vergröberung). */
function nextNice(cs) {
    for (const s of NICE_STEPS) if (s > cs + 1e-9) return s;
    return cs * 2;
}

function median(sortedAscending) {
    const n = sortedAscending.length;
    if (n === 0) return 0;
    const mid = n >> 1;
    return n % 2 ? sortedAscending[mid] : (sortedAscending[mid - 1] + sortedAscending[mid]) / 2;
}

/**
 * Parst XYZ/ASC/TXT-Text zu einem gepackten Float64Array [x0,y0,z0, x1,y1,z1, …].
 * Überspringt Kommentare (#), ASC-Grid-Header und nicht-numerische Zeilen.
 * Trennzeichen: Whitespace, Komma, Semikolon.
 *
 * @param {string} text
 * @returns {Float64Array}  gepackt, Länge = 3 * Punktanzahl
 */
export function parseXyzPoints(text) {
    if (!text) throw new Error('Keine XYZ-Daten übergeben.');
    const lines = text.split(/\r?\n/);
    // Worst-case-Kapazität vorab allokieren, am Ende zuschneiden.
    const buf = new Float64Array(lines.length * 3);
    let n = 0;
    const ASC_HEADER = new Set(['ncols', 'nrows', 'xllcorner', 'yllcorner', 'xllcenter', 'yllcenter', 'cellsize', 'nodata_value']);

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l || l.charCodeAt(0) === 35 /* # */) continue;
        const parts = l.split(/[\s,;]+/);
        if (parts.length < 3) continue;
        const first = parts[0].toLowerCase();
        if (ASC_HEADER.has(first)) continue;
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
        buf[n * 3] = x; buf[n * 3 + 1] = y; buf[n * 3 + 2] = z;
        n++;
    }

    if (n === 0) throw new Error('Keine gültigen X Y Z Punkte in der Datei gefunden.');
    return buf.subarray(0, n * 3);
}

/**
 * Analysiert die Punktwolken-Geometrie und schlägt eine sichere Zellweite vor.
 *
 * @param {Float64Array} pts  gepackt [x,y,z,…]
 * @returns {{
 *   count:number, extent:{minX,maxX,minY,maxY,width,height},
 *   isRegular:boolean, detectedSpacing:number,
 *   suggestedCellsize:number, estCols:number, estRows:number
 * }}
 */
export function analyzeGeometry(pts) {
    const count = pts.length / 3;
    if (count < 1) throw new Error('Leere Punktwolke.');

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
        const x = pts[i * 3], y = pts[i * 3 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const extent = { minX, maxX, minY, maxY, width, height };

    // ── Regulär-Erkennung über Median der Lücken eindeutiger X/Y-Werte ─────────
    // (Auf eine sinnvolle Stichprobe begrenzt, damit riesige Dateien schnell bleiben.)
    const SAMPLE = 200_000;
    const stride = Math.max(1, Math.floor(count / SAMPLE));
    const round6 = v => Math.round(v * 1e6) / 1e6;
    const xsSet = new Set(), ysSet = new Set();
    for (let i = 0; i < count; i += stride) {
        xsSet.add(round6(pts[i * 3]));
        ysSet.add(round6(pts[i * 3 + 1]));
    }
    const uniqX = [...xsSet].sort((a, b) => a - b);
    const uniqY = [...ysSet].sort((a, b) => a - b);

    const gapMedian = (uniq) => {
        const gaps = [];
        for (let i = 1; i < uniq.length; i++) {
            const g = uniq[i] - uniq[i - 1];
            if (g > 1e-6) gaps.push(g);
        }
        gaps.sort((a, b) => a - b);
        return { med: median(gaps), min: gaps.length ? gaps[0] : 0, gaps };
    };
    const gx = gapMedian(uniqX);
    const gy = gapMedian(uniqY);

    // Zellweite = kleinerer der beiden Median-Abstände (robust gegen Ausreißer,
    // NICHT der erste/kleinste Abstand → keine Explosion mehr).
    let detectedSpacing = Math.min(gx.med || Infinity, gy.med || Infinity);
    if (!isFinite(detectedSpacing) || detectedSpacing <= 0) {
        detectedSpacing = width > 0 ? width / Math.max(1, uniqX.length - 1) : 1;
    }

    // Reguläres Gitter, wenn die X- und Y-Lücken nahezu uniform sind UND die
    // Punktzahl grob zu cols*rows passt.
    const uniform = (g) => {
        if (g.gaps.length < 2) return true;
        const spread = (g.gaps[g.gaps.length - 1] - g.gaps[0]) / (g.med || 1);
        return spread < 0.15; // <15 % Streuung der Lücken
    };
    const estColsNative = width > 0 ? Math.round(width / detectedSpacing) + 1 : 1;
    const estRowsNative = height > 0 ? Math.round(height / detectedSpacing) + 1 : 1;
    const fillRatio = count / Math.max(1, estColsNative * estRowsNative);
    const isRegular = uniform(gx) && uniform(gy) && fillRatio > 0.6 && fillRatio < 1.5;

    // ── Zellweite vorschlagen ─────────────────────────────────────────────────
    let cs;
    if (isRegular) {
        cs = detectedSpacing;              // native Auflösung beibehalten
    } else {
        const area = Math.max(width * height, 1e-6);
        cs = niceSnap(Math.sqrt(area / count)); // ~1 Zelle pro Punkt im Mittel
    }
    // Zellbudget erzwingen — auch für reguläre Gitter, die selbst zu groß wären.
    let estCols = width > 0 ? Math.round(width / cs) + 1 : 1;
    let estRows = height > 0 ? Math.round(height / cs) + 1 : 1;
    while (estCols * estRows > MAX_CELLS) {
        cs = nextNice(cs);
        estCols = width > 0 ? Math.round(width / cs) + 1 : 1;
        estRows = height > 0 ? Math.round(height / cs) + 1 : 1;
    }

    return {
        count,
        extent,
        isRegular,
        detectedSpacing,
        suggestedCellsize: Math.round(cs * 1000) / 1000,
        estCols,
        estRows,
    };
}

/**
 * Baut einen sicheren Grid-Header aus Ausdehnung + Zellweite.
 * Clampt Dimensionen gegen MAX_CELLS und garantiert cellsize > 0.
 * @returns {{ncols,nrows,cellsize,xllcorner,yllcorner,xll,yll}}
 */
export function buildHeader(extent, cellsize) {
    let cs = Number(cellsize);
    if (!(cs > 0) || !isFinite(cs)) cs = 1;
    const { minX, minY, width, height } = extent;

    let ncols = width > 0 ? Math.round(width / cs) + 1 : 1;
    let nrows = height > 0 ? Math.round(height / cs) + 1 : 1;
    ncols = Math.max(1, ncols);
    nrows = Math.max(1, nrows);

    // Harte Sicherung: sollte die gewählte Zellweite das Budget doch sprengen,
    // Zellweite vergröbern statt zu werfen.
    while (ncols * nrows > MAX_CELLS) {
        cs = nextNice(cs);
        ncols = Math.max(1, width > 0 ? Math.round(width / cs) + 1 : 1);
        nrows = Math.max(1, height > 0 ? Math.round(height / cs) + 1 : 1);
    }

    return {
        ncols,
        nrows,
        cellsize: cs,
        xllcorner: minX - cs / 2,
        yllcorner: minY - cs / 2,
        xll: minX, // Zentrum der Zelle (0,0)
        yll: minY,
    };
}

/**
 * TIN-Interpolation: Delaunay-Triangulierung der Punkte, dann pro Ziel-Zellzentrum
 * baryzentrische lineare z-Interpolation im enthaltenden Dreieck. Zellen außerhalb
 * der Konvexhülle bleiben NODATA.
 *
 * @param {Float32Array} data  Ausgabe-Grid (in-place gefüllt), bottom-up
 * @param {object} header
 * @param {Float64Array} pts   gepackt [x,y,z,…]
 * @returns {number} Anzahl gefüllter Zellen
 */
function tinInterpolate(data, header, pts) {
    const { ncols, nrows, cellsize, xll, yll } = header;
    const count = pts.length / 3;
    if (count < 3) return 0;

    // Delaunator arbeitet auf flachen [x0,y0,x1,y1,…]-Koordinaten.
    const coords = new Float64Array(count * 2);
    for (let i = 0; i < count; i++) {
        coords[i * 2] = pts[i * 3];
        coords[i * 2 + 1] = pts[i * 3 + 1];
    }

    let del;
    try {
        del = new Delaunator(coords);
    } catch {
        return 0;
    }
    const tris = del.triangles;
    if (!tris || tris.length === 0) return 0;

    let filled = 0;
    for (let t = 0; t < tris.length; t += 3) {
        const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
        const ax = coords[ia * 2], ay = coords[ia * 2 + 1], az = pts[ia * 3 + 2];
        const bx = coords[ib * 2], by = coords[ib * 2 + 1], bz = pts[ib * 3 + 2];
        const cx = coords[ic * 2], cy = coords[ic * 2 + 1], cz = pts[ic * 3 + 2];

        // Baryzentrischer Nenner (2× Dreiecksfläche, vorzeichenbehaftet)
        const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(denom) < 1e-12) continue; // entartetes Dreieck
        const invDenom = 1 / denom;

        // Grid-Bounding-Box des Dreiecks
        const triMinX = Math.min(ax, bx, cx), triMaxX = Math.max(ax, bx, cx);
        const triMinY = Math.min(ay, by, cy), triMaxY = Math.max(ay, by, cy);
        let c0 = Math.floor((triMinX - xll) / cellsize);
        let c1 = Math.ceil((triMaxX - xll) / cellsize);
        let r0 = Math.floor((triMinY - yll) / cellsize);
        let r1 = Math.ceil((triMaxY - yll) / cellsize);
        if (c0 < 0) c0 = 0;
        if (r0 < 0) r0 = 0;
        if (c1 > ncols - 1) c1 = ncols - 1;
        if (r1 > nrows - 1) r1 = nrows - 1;

        for (let row = r0; row <= r1; row++) {
            const py = yll + row * cellsize;
            for (let col = c0; col <= c1; col++) {
                const px = xll + col * cellsize;
                // Baryzentrische Koordinaten
                const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) * invDenom;
                const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) * invDenom;
                const l3 = 1 - l1 - l2;
                if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue; // außerhalb
                const idx = row * ncols + col;
                if (data[idx] <= -9000) filled++;
                data[idx] = l1 * az + l2 * bz + l3 * cz;
            }
        }
    }
    return filled;
}

/**
 * Setzt jeden Punkt in seine nächste Rasterzelle (Nearest-Binning).
 * Grundlage für den reinen IDW-Modus (ohne TIN).
 */
function rasterizeNearest(data, header, pts) {
    const { ncols, nrows, cellsize, xll, yll } = header;
    const count = pts.length / 3;
    for (let i = 0; i < count; i++) {
        const col = Math.round((pts[i * 3] - xll) / cellsize);
        const row = Math.round((pts[i * 3 + 1] - yll) / cellsize);
        if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
            data[row * ncols + col] = pts[i * 3 + 2];
        }
    }
}

/**
 * Füllt verbleibende NODATA-Zellen per IDW aus den Quellpunkten (bottom-up
 * konsistent). Räumlicher Bin-Index hält es auch für große Wolken schnell.
 * Betrifft nach TIN nur noch den Hüllen-Rand → kleine Zellmenge.
 */
function idwFill(data, header, pts, opts = {}) {
    const { ncols, nrows, cellsize, xll, yll } = header;
    const count = pts.length / 3;
    if (count === 0) return;

    const searchRadius = opts.searchRadius ?? cellsize * 8;
    const power = opts.power ?? 2;
    const maxPts = opts.maxPoints ?? 16;
    const r2max = searchRadius * searchRadius;
    const binSize = Math.max(searchRadius, cellsize);

    // Bin-Index der Punkte (Integer-Schlüssel, kein String-Alloc)
    const bins = new Map();
    const keyOf = (bc, br) => br * 73856093 + bc;
    for (let i = 0; i < count; i++) {
        const bc = Math.floor(pts[i * 3] / binSize);
        const br = Math.floor(pts[i * 3 + 1] / binSize);
        const k = keyOf(bc, br);
        let bin = bins.get(k);
        if (!bin) { bin = []; bins.set(k, bin); }
        bin.push(i);
    }

    const cand = []; // { d2, z }
    for (let row = 0; row < nrows; row++) {
        const cy = yll + row * cellsize;
        for (let col = 0; col < ncols; col++) {
            const idx = row * ncols + col;
            if (data[idx] > -9000) continue; // schon gültig
            const cx = xll + col * cellsize;

            cand.length = 0;
            const bc = Math.floor(cx / binSize);
            const br = Math.floor(cy / binSize);
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const bin = bins.get(keyOf(bc + dc, br + dr));
                    if (!bin) continue;
                    for (const pi of bin) {
                        const dx = pts[pi * 3] - cx;
                        const dy = pts[pi * 3 + 1] - cy;
                        const d2 = dx * dx + dy * dy;
                        if (d2 <= r2max) cand.push({ d2, z: pts[pi * 3 + 2] });
                    }
                }
            }
            if (cand.length === 0) continue;

            cand.sort((a, b) => a.d2 - b.d2);
            const use = maxPts > 0 && cand.length > maxPts ? cand.slice(0, maxPts) : cand;

            let sumW = 0, sumWZ = 0, zMin = Infinity, zMax = -Infinity;
            for (const c of use) {
                const w = c.d2 < 1e-18 ? 1e9 : 1 / Math.pow(c.d2, power / 2);
                sumW += w; sumWZ += w * c.z;
                if (c.z < zMin) zMin = c.z;
                if (c.z > zMax) zMax = c.z;
            }
            let z = sumWZ / sumW;
            if (opts.zClamp !== false) z = Math.min(zMax, Math.max(zMin, z));
            data[idx] = z;
        }
    }
}

/**
 * Baut aus Punkten + Header ein reguläres DGM.
 *
 * @param {Float64Array} pts     gepackt [x,y,z,…]
 * @param {object} header        aus buildHeader()
 * @param {object} [opts]
 * @param {'tin'|'idw'} [opts.method='tin']
 * @param {(pct:number)=>void} [opts.onProgress]
 * @returns {{data:Float32Array, header:object}}
 */
export function buildRegularDem(pts, header, opts = {}) {
    const method = opts.method ?? 'tin';
    const report = opts.onProgress ?? (() => {});
    const data = new Float32Array(header.ncols * header.nrows).fill(NODATA);

    report(10);
    if (method === 'tin') {
        const filled = tinInterpolate(data, header, pts);
        report(70);
        // TIN leer (z. B. kollineare Punkte) oder Rand-Zellen offen → IDW-Fallback.
        if (filled === 0) rasterizeNearest(data, header, pts);
        idwFill(data, header, pts, opts);
    } else {
        rasterizeNearest(data, header, pts);
        report(40);
        idwFill(data, header, pts, opts);
    }
    report(100);
    return { data, header };
}

/**
 * Verpackt ein DGM-Raster in die kanonische Terrain-Form, die
 * geoStore.importTerrain() / buildTerrainMesh() erwarten.
 *
 * @param {Float32Array} data
 * @param {object} header  { ncols, nrows, cellsize, xllcorner, yllcorner, xll?, yll? }
 * @returns {object}
 */
export function makeTerrainObject(data, header) {
    const { ncols, nrows, cellsize } = header;
    const xllcorner = header.xllcorner ?? (header.xll - cellsize / 2);
    const yllcorner = header.yllcorner ?? (header.yll - cellsize / 2);
    const xll = header.xll ?? (xllcorner + cellsize / 2);
    const yll = header.yll ?? (yllcorner + cellsize / 2);

    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (v <= -9000) continue;
        if (v < minZ) minZ = v;
        if (v > maxZ) maxZ = v;
    }
    if (!isFinite(minZ)) { minZ = 0; maxZ = 0; }

    const width = (ncols - 1) * cellsize;
    const height = (nrows - 1) * cellsize;

    return {
        gridData: data,
        ncols, nrows, cellsize,
        xllcorner, yllcorner, xll, yll,
        minZ, maxZ,
        center: { x: xll + width / 2, y: yll + height / 2 },
        bounds: { width: width || 100, height: height || 100 },
        stats: { cols: ncols, rows: nrows, cellsize, minZ, maxZ },
    };
}

/**
 * Komfort-Einschritt: Text → kanonisches Terrain-Objekt.
 * (Für den Nicht-Worker-Pfad / Tests.)
 *
 * @param {string} text
 * @param {object} [opts]  { cellsize?, method? }  cellsize=undefined → Auto-Vorschlag
 * @returns {{ terrain:object, analysis:object }}
 */
export function importXyzTerrain(text, opts = {}) {
    const pts = parseXyzPoints(text);
    const analysis = analyzeGeometry(pts);
    const cellsize = opts.cellsize > 0 ? opts.cellsize : analysis.suggestedCellsize;
    const header = buildHeader(analysis.extent, cellsize);
    const { data } = buildRegularDem(pts, header, opts);
    return { terrain: makeTerrainObject(data, header), analysis };
}
