/**
 * weirGeometry — reine Diskretisierung einer Wehr-Polylinie zu Rasterzellen.
 *
 * Ein Wehr ist eine offene Polylinie (Weltpunkte). Für den LISFLOOD-Export wird
 * sie 4-connected (Bresenham) auf das Raster gelegt; jede Zelle erhält die
 * blockierenden Flächen (Richtung) aus ihren Nachbarn. Kein three.js, kein Vue —
 * node-testbar und vom Tool wie vom Export gemeinsam genutzt.
 */

/** 4-connected Bresenham zwischen zwei Rasterzellen (col,row). */
export function getLineCells(c0, r0, c1, r1) {
    const dx = Math.abs(c1 - c0);
    const dy = -Math.abs(r1 - r0);
    const sx = c0 < c1 ? 1 : -1;
    const sy = r0 < r1 ? 1 : -1;
    let err = dx + dy;
    let c = c0, r = r0;
    const cells = [];
    while (true) {
        cells.push({ col: c, row: r });
        if (c === c1 && r === r1) break;
        const e2 = 2 * err;
        if (e2 > dy && e2 < dx) {            // diagonaler Schritt → 4-connected aufteilen
            err += dy; c += sx;
            cells.push({ col: c, row: r });
            err += dx; r += sy;
        } else if (e2 > dy) {
            err += dy; c += sx;
        } else if (e2 < dx) {
            err += dx; r += sy;
        }
    }
    return cells;
}

/** Blockierende Wandfläche zwischen zwei Nachbarzellen: Reihenwechsel → 'E', sonst 'S'. */
export function stepFace(a, b) {
    return a.row !== b.row ? 'E' : 'S';
}

/** Header-Ursprung (Zellzentrum von Spalte/Reihe 0). */
function originOf(header) {
    return {
        xll: header.xll !== undefined ? header.xll : header.xllcorner,
        yll: header.yll !== undefined ? header.yll : header.yllcorner,
    };
}

/** Weltpunkt → Rasterzelle (col,row), Zellzentren-Konvention, row 0 = Süd. */
export function worldToCell(header, x, y) {
    const { xll, yll } = originOf(header);
    return {
        col: Math.round((x - xll) / header.cellsize),
        row: Math.round((y - yll) / header.cellsize),
    };
}

/** Rasterzelle (col,row) → Welt-Zellzentrum. */
export function cellToWorld(header, col, row) {
    const { xll, yll } = originOf(header);
    return { x: xll + col * header.cellsize, y: yll + row * header.cellsize };
}

/** Haben alle Polylinien-Punkte eine Kronenhöhe z? (sonst Fallback line.hc) */
function hasCrestZ(points) {
    return points.every(p => Number.isFinite(p.z));
}

// ── Öffnungstypen (Querschnitt im Wand-Profil: s entlang Linie, z absolut) ──────
/** Wirksame Öffnungsbreite [m] entlang der Linie (für die Zell-Überdeckung). */
export function openingWidth(o) {
    if (o.type === 'rect') return o.width || 1;
    if (o.type === 'poly' && o.points?.length) {
        const ss = o.points.map(p => p.s);
        return Math.max(...ss) - Math.min(...ss);
    }
    return o.width ?? o.w ?? 1; // round: Durchmesser
}
/** Oberkante (Soffit) der Öffnung [m NHN]. */
export function openingSoffit(o) {
    if (o.type === 'poly' && o.points?.length) return Math.max(...o.points.map(p => p.z));
    return o.soffit ?? 0;
}
/** Querschnitts-Polygon [{s,z}] je Typ (s entlang Linie, z absolut). */
export function openingSection(o) {
    if (o.type === 'rect') {
        const w = (o.width || 1) / 2, top = o.soffit ?? 0, h = o.height ?? 1;
        return [{ s: -w, z: top - h }, { s: w, z: top - h }, { s: w, z: top }, { s: -w, z: top }];
    }
    if (o.type === 'poly' && o.points?.length >= 3) return o.points.map(p => ({ s: p.s, z: p.z }));
    const r = (o.width ?? o.w ?? 1) / 2, cz = (o.soffit ?? 0) - r, pts = []; // round
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push({ s: r * Math.cos(a), z: cz + r * Math.sin(a) }); }
    return pts;
}
/**
 * Öffnung so beschneiden, dass sie IM Wehr bleibt: Oberkante ≤ Krone, Unterkante
 * ≥ Gelände, Breite ≤ verfügbare Linienlänge. Reine Funktion (testbar).
 */
export function clampOpening(o, crestZ, terrainZ, maxHalfWidth) {
    const out = { ...o };
    out.soffit = Math.max(terrainZ + 0.1, Math.min(out.soffit ?? crestZ, crestZ)); // nicht über die Krone
    if (out.type === 'poly' && out.points) {
        out.points = out.points.map(p => ({
            s: Math.max(-maxHalfWidth, Math.min(maxHalfWidth, p.s)),
            z: Math.max(terrainZ, Math.min(crestZ, p.z)),
        }));
    } else {
        out.height = Math.min(out.height ?? (out.soffit - terrainZ), out.soffit - terrainZ); // nicht unter Gelände
        out.width = Math.max(0.2, Math.min(out.width ?? (out.w ?? 1), 2 * maxHalfWidth));
    }
    return out;
}

/** Kronenhöhe an (x,y): Punkt auf die Polylinie projizieren, z linear interpolieren. */
export function crestZAt(points, x, y) {
    let bestD = Infinity, bestZ;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const vx = b.x - a.x, vy = b.y - a.y;
        const len2 = vx * vx + vy * vy;
        let t = len2 > 1e-9 ? ((x - a.x) * vx + (y - a.y) * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
        if (d < bestD) { bestD = d; bestZ = a.z + t * (b.z - a.z); }
    }
    return bestZ;
}

/** Liegt (x,y) in einer Öffnung? → { soffit } (Oberkante) oder null. */
function orificeAt(openings, x, y, cellsize) {
    for (const o of (openings || [])) {
        const r = Math.max(openingWidth(o) / 2, cellsize * 0.6);
        if (Math.hypot(x - o.x, y - o.y) <= r) return { soffit: openingSoffit(o) };
    }
    return null;
}

/**
 * Wehr-Polylinie → Zellen. Alle Segmente werden Bresenham-gerastert, doppelte
 * Zellen zusammengefasst; Eckzellen bekommen beide Flächen (L-Form), damit die
 * Barriere lückenlos bleibt (Muster aus useWeirTool.stepFace).
 *
 * Optional: Kronenhöhe `hc` pro Zelle aus dem z-Profil der Punkte interpoliert;
 * Zellen in einer Öffnung bekommen `orifice:{soffit}` (Rohr/Durchlass).
 *
 * @param {Array<{x,y,z?}>} points  Welt-Polylinie (>= 2 Punkte)
 * @param {object} header        Raster-Header
 * @param {Float32Array|Array|null} gridData  Terrain (row 0 = Süd) oder null
 * @param {{openings?: Array<{x,y,soffit,w?}>}} [opts]
 * @returns {Array<{col,row,x,y,z,direction,hc?,orifice?}>}
 */
export function discretizeWeirPolyline(points, header, gridData = null, opts = {}) {
    if (!points || points.length < 2) return [];
    const { ncols, nrows } = header;
    const openings = opts.openings || [];
    const withZ = hasCrestZ(points);
    const cs = header.cellsize;
    const annotate = (cell) => {
        if (withZ) cell.hc = crestZAt(points, cell.x, cell.y);
        const o = orificeAt(openings, cell.x, cell.y, cs);
        if (o) cell.orifice = o;
        return cell;
    };

    // Polylinie → lückenlose Zellfolge (ohne Duplikate an Segmentnähten)
    const seq = [];
    for (let s = 0; s < points.length - 1; s++) {
        const a = worldToCell(header, points[s].x, points[s].y);
        const b = worldToCell(header, points[s + 1].x, points[s + 1].y);
        const seg = getLineCells(a.col, a.row, b.col, b.row);
        for (const cell of seg) {
            const last = seq[seq.length - 1];
            if (!last || last.col !== cell.col || last.row !== cell.row) seq.push(cell);
        }
    }
    if (seq.length === 0) return [];
    if (seq.length === 1) {
        const c = seq[0];
        if (c.col < 0 || c.col >= ncols || c.row < 0 || c.row >= nrows) return [];
        const w = cellToWorld(header, c.col, c.row);
        return [annotate({ col: c.col, row: c.row, x: w.x, y: w.y, z: zAt(gridData, header, c), direction: 'S' })];
    }

    const out = [];
    for (let i = 0; i < seq.length; i++) {
        const cell = seq[i];
        if (cell.col < 0 || cell.col >= ncols || cell.row < 0 || cell.row >= nrows) continue;
        const faces = new Set();
        if (i > 0) faces.add(stepFace(seq[i - 1], cell));
        if (i < seq.length - 1) faces.add(stepFace(cell, seq[i + 1]));
        if (faces.size === 0) faces.add('S');
        const w = cellToWorld(header, cell.col, cell.row);
        const z = zAt(gridData, header, cell);
        for (const direction of faces) {
            out.push(annotate({ col: cell.col, row: cell.row, x: w.x, y: w.y, z, direction }));
        }
    }
    return out;
}

function zAt(gridData, header, cell) {
    if (!gridData) return undefined;
    const z = gridData[cell.row * header.ncols + cell.col];
    return z > -9000 ? z : undefined;
}
