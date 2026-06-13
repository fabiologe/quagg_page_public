/**
 * BridgeMeshLattice — reine Lattice-Logik für 3D-Brückenkörper (kind: 'mesh3d').
 *
 * Ein Brückenkörper ist ein Footprint-Polygon (GIS-Koordinaten) plus ein
 * Kontrollgitter ("lattice") aus zwei Höhen-Sheets (bottomZ = Soffitte,
 * topZ = Deck) über einem Spannweiten-Frame. Der Frame wird aus der längsten
 * Polygonkante abgeleitet: u läuft entlang der Spannachse, v quer dazu.
 * Loop Cuts fügen u-Stationen ein; die Fläche zwischen Stationen ist bilinear.
 *
 * Kein three.js, kein Vue — node-testbar und vom Solver-Export (InputGenerator)
 * direkt mitnutzbar.
 */

const LOOP_CUT_EPS = 0.02;

/** Senkrechte zu spanDir (90° CCW) — definiert die v-Achse des Frames. */
function crossDirOf(spanDir) {
    return { x: -spanDir.y, y: spanDir.x };
}

/** Shoelace-Fläche (vorzeichenbehaftet) — 0 bei degeneriertem/kollinearem Ring. */
export function footprintArea(footprint) {
    let a = 0;
    for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
        a += (footprint[j].x * footprint[i].y) - (footprint[i].x * footprint[j].y);
    }
    return a / 2;
}

/**
 * Frame aus dem Footprint ableiten: längste Kante = Spannachse.
 * @param {Array<{x,y}>} footprint  >= 3 Punkte, nicht geschlossen
 * @returns {{origin:{x,y}, spanDir:{x,y}, spanLen:number, crossLen:number}}
 */
export function deriveFrame(footprint) {
    let best = null, bestLen = -1;
    for (let i = 0; i < footprint.length; i++) {
        const a = footprint[i], b = footprint[(i + 1) % footprint.length];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > bestLen) { bestLen = len; best = [a, b]; }
    }
    if (!best || bestLen < 1e-9) return null;
    const spanDir = { x: (best[1].x - best[0].x) / bestLen, y: (best[1].y - best[0].y) / bestLen };
    const crossDir = crossDirOf(spanDir);

    let sMin = Infinity, sMax = -Infinity, tMin = Infinity, tMax = -Infinity;
    for (const p of footprint) {
        const s = p.x * spanDir.x + p.y * spanDir.y;
        const t = p.x * crossDir.x + p.y * crossDir.y;
        if (s < sMin) sMin = s; if (s > sMax) sMax = s;
        if (t < tMin) tMin = t; if (t > tMax) tMax = t;
    }
    return {
        origin: {
            x: sMin * spanDir.x + tMin * crossDir.x,
            y: sMin * spanDir.y + tMin * crossDir.y,
        },
        spanDir,
        spanLen: sMax - sMin,
        crossLen: tMax - tMin,
    };
}

/**
 * Flaches Start-Lattice (2 Stationen × 2 Querreihen) auf konstanter Höhe.
 * @param {Array<{x,y}>} footprint
 * @param {{soffit:number, deck:number}} params  absolute Höhen [m NHN]
 */
export function createLattice(footprint, { soffit, deck }) {
    const frame = deriveFrame(footprint);
    if (!frame) return null;
    return {
        ...frame,
        nSpan: 2,
        nCross: 2,
        u: [0, 1],
        bottomZ: [[soffit, soffit], [soffit, soffit]],
        topZ: [[deck, deck], [deck, deck]],
    };
}

/**
 * Weltpunkt → (u, v) im Frame, geklemmt auf [0,1].
 */
export function worldToUV(lattice, x, y) {
    const cd = crossDirOf(lattice.spanDir);
    const dx = x - lattice.origin.x, dy = y - lattice.origin.y;
    const u = (dx * lattice.spanDir.x + dy * lattice.spanDir.y) / (lattice.spanLen || 1);
    const v = (dx * cd.x + dy * cd.y) / (lattice.crossLen || 1);
    return {
        u: Math.min(1, Math.max(0, u)),
        v: Math.min(1, Math.max(0, v)),
    };
}

/** (u, v) im Frame → Weltpunkt {x, y}. */
export function uvToWorld(lattice, u, v) {
    const cd = crossDirOf(lattice.spanDir);
    const s = u * lattice.spanLen, t = v * lattice.crossLen;
    return {
        x: lattice.origin.x + s * lattice.spanDir.x + t * cd.x,
        y: lattice.origin.y + s * lattice.spanDir.y + t * cd.y,
    };
}

/**
 * Bilineare Höhenabtastung eines Sheets ([nCross][nSpan]) an (u, v).
 * @param {object} lattice
 * @param {Array<Array<number>>} sheet  lattice.bottomZ oder lattice.topZ
 */
export function sampleSheet(lattice, sheet, u, v) {
    const uu = Math.min(1, Math.max(0, u));
    const vv = Math.min(1, Math.max(0, v));
    const us = lattice.u;

    // u-Intervall finden
    let k = 0;
    while (k < us.length - 2 && uu > us[k + 1]) k++;
    const span = us[k + 1] - us[k];
    const tu = span > 1e-12 ? (uu - us[k]) / span : 0;

    // v-Position über die Querreihen (gleichverteilt)
    const vPos = vv * (lattice.nCross - 1);
    const i0 = Math.min(lattice.nCross - 2, Math.floor(vPos));
    const tv = vPos - i0;

    const rowLerp = (row) => row[k] + tu * (row[k + 1] - row[k]);
    const z0 = rowLerp(sheet[i0]);
    const z1 = rowLerp(sheet[i0 + 1]);
    return z0 + tv * (z1 - z0);
}

/**
 * Loop Cut: neue u-Station einfügen, Höhen beider Sheets interpoliert.
 * @returns {object|null} neues Lattice (deep clone) oder null, wenn uCut
 *          zu nah an einer bestehenden Station liegt (Epsilon 0.02).
 */
export function insertLoopCut(lattice, uCut) {
    const u = Math.min(1, Math.max(0, uCut));
    if (lattice.u.some(uk => Math.abs(uk - u) < LOOP_CUT_EPS)) return null;

    let k = 0;
    while (k < lattice.u.length - 1 && lattice.u[k + 1] < u) k++;
    const t = (u - lattice.u[k]) / (lattice.u[k + 1] - lattice.u[k]);

    const cutRow = (row) => {
        const z = row[k] + t * (row[k + 1] - row[k]);
        const next = row.slice();
        next.splice(k + 1, 0, z);
        return next;
    };
    return {
        ...lattice,
        origin: { ...lattice.origin },
        spanDir: { ...lattice.spanDir },
        nSpan: lattice.nSpan + 1,
        u: [...lattice.u.slice(0, k + 1), u, ...lattice.u.slice(k + 1)],
        bottomZ: lattice.bottomZ.map(cutRow),
        topZ: lattice.topZ.map(cutRow),
    };
}

/**
 * Solver-Richtung der Zellen. Die Spannachse ist die Fahrbahnachse, sie
 * kreuzt das Gewässer: O-W-Bauwerk → 'S' (blockt N-S-Fluss), N-S → 'E'
 * (gleiche Semantik wie discretizeStructureAxis / Linien-Tool).
 * @param {'AUTO'|'NS'|'EW'} mode  NS = N-S-Fluss sperren ('S'), EW = O-W ('E')
 */
export function deriveDirection(lattice, mode = 'AUTO') {
    if (mode === 'NS') return 'S';
    if (mode === 'EW') return 'E';
    return Math.abs(lattice.spanDir.x) >= Math.abs(lattice.spanDir.y) ? 'S' : 'E';
}

/** Ray-Casting Point-in-Polygon für {x,y}-Ringe (Kopie des Rasterizer-Algorithmus). */
export function isPointInPolygon(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].x, yi = ring[i].y;
        const xj = ring[j].x, yj = ring[j].y;
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Footprint → Rasterzellen (Zellzentren-Konvention wie discretizeStructureAxis:
 * Zentrum = xll + col*cellsize, row bottom-up, xll = header.xll ?? xllcorner).
 * BBox-Scan + Point-in-Polygon (Muster: Rasterizer.maskBuildingsAsNoData).
 * @returns {Array<{col:number, row:number, x:number, y:number}>}
 */
export function rasterizeFootprint(footprint, header) {
    const { ncols, nrows, cellsize } = header;
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;

    let minC = ncols, maxC = -1, minR = nrows, maxR = -1;
    for (const p of footprint) {
        const c = Math.round((p.x - xll) / cellsize);
        const r = Math.round((p.y - yll) / cellsize);
        if (c < minC) minC = c; if (c > maxC) maxC = c;
        if (r < minR) minR = r; if (r > maxR) maxR = r;
    }
    minC = Math.max(0, minC - 1);
    maxC = Math.min(ncols - 1, maxC + 1);
    minR = Math.max(0, minR - 1);
    maxR = Math.min(nrows - 1, maxR + 1);
    if (maxC < 0 || maxR < 0 || minC >= ncols || minR >= nrows) return [];

    const cells = [];
    for (let r = minR; r <= maxR; r++) {
        const cy = yll + r * cellsize;
        for (let c = minC; c <= maxC; c++) {
            const cx = xll + c * cellsize;
            if (isPointInPolygon(cx, cy, footprint)) {
                cells.push({ col: c, row: r, x: cx, y: cy });
            }
        }
    }
    return cells;
}

/**
 * Mesh → Solver-Zellen: Footprint rastern, pro Zellzentrum Soffitte/Deck
 * bilinear vom Lattice abtasten, Terrain-z aus gridData (row 0 = Süd).
 *
 * Alle Zellen eines Körpers teilen eine Richtung; in Fließrichtung
 * hintereinanderliegende Zellen wirken als Orifices in Serie — identisch zur
 * per-Zelle-Diskretisierung einer v8-Linienbrücke.
 *
 * @param {object} bridge    mesh3d-Brücke ({footprint, lattice, directionMode, Cd, Tz})
 * @param {object} header    Raster-Header (Editor- oder Export-Zellweite)
 * @param {Float32Array|Array|null} gridData  Terrain (row 0 = Süd) oder null (Export)
 * @returns {Array<{col,row,x,y,z,direction,z_sohle,soffit,deck,width,Cd,Tz}>}
 */
export function latticeToCells(bridge, header, gridData = null) {
    const { lattice, footprint } = bridge;
    if (!lattice || !footprint || footprint.length < 3) return [];
    const direction = deriveDirection(lattice, bridge.directionMode);
    const raster = rasterizeFootprint(footprint, header);

    return raster.map(c => {
        const { u, v } = worldToUV(lattice, c.x, c.y);
        const soffit = sampleSheet(lattice, lattice.bottomZ, u, v);
        const deck = sampleSheet(lattice, lattice.topZ, u, v);
        let z;
        if (gridData) {
            const zi = gridData[c.row * header.ncols + c.col];
            if (zi > -9000) z = zi;
        }
        return {
            col: c.col, row: c.row, x: c.x, y: c.y,
            z, direction,
            z_sohle: z,
            soffit, deck,
            width: header.cellsize,
            Cd: bridge.Cd, Tz: bridge.Tz,
        };
    });
}

/**
 * Terrain-Höhe an einer Weltkoordinate (Zellzentren-Konvention wie
 * rasterizeFootprint, row 0 = Süd). Liefert null außerhalb/NoData.
 * @param {object} header  {ncols, nrows, cellsize, xll|xllcorner, yll|yllcorner}
 * @param {Float32Array|Array} gridData
 */
export function sampleGridZ(header, gridData, x, y) {
    if (!gridData) return null;
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;
    const col = Math.round((x - xll) / header.cellsize);
    const row = Math.round((y - yll) / header.cellsize);
    if (col < 0 || col >= header.ncols || row < 0 || row >= header.nrows) return null;
    const z = gridData[row * header.ncols + col];
    return z > -9000 ? z : null;
}

/**
 * Terrain-Statistik unter dem Footprint (für Formular-Defaults nach dem Zeichnen).
 * @returns {{meanZ:number, minZ:number, maxZ:number, count:number}|null}
 */
export function footprintTerrainStats(footprint, header, gridData) {
    if (!gridData) return null;
    const raster = rasterizeFootprint(footprint, header);
    let sum = 0, min = Infinity, max = -Infinity, n = 0;
    for (const c of raster) {
        const z = gridData[c.row * header.ncols + c.col];
        if (z > -9000) { sum += z; if (z < min) min = z; if (z > max) max = z; n++; }
    }
    if (n === 0) return null;
    return { meanZ: sum / n, minZ: min, maxZ: max, count: n };
}
