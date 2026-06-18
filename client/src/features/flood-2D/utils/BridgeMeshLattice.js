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
const PIER_MIN_U = 1e-4; // schmalstes sinnvolles Pfeilerband in u
const clamp01 = (x) => Math.min(1, Math.max(0, x));

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
        v: [0, 1],
        bottomZ: [[soffit, soffit], [soffit, soffit]],
        topZ: [[deck, deck], [deck, deck]],
        piers: [], // Spann-Bänder {u0,u1}, die die Öffnung lokal voll sperren
    };
}

/**
 * Pfeiler hinzufügen. Ein Pfeiler ist ein EDITIERBARES Polygon im Frame (u,v) —
 * Eckpunkte ziehbar, Kanten unterteilbar (für abgerundete Formen), wie der
 * Brückenkörper. Default = Rechteck (Breite [u0,u1] in der Spannachse, volle
 * Quer-Breite). `zTop` = Kopfhöhe (null = bis Soffitte), rein geometrisch — die
 * hydraulische Sperrung kommt aus der (u,v)-Überdeckung (SGC-Auflösung ist binär).
 * @returns {object} neues Lattice (gleiche Sheets, ergänzte piers)
 */
export function addPier(lattice, uCenter, halfWidthU) {
    const u0 = clamp01(uCenter - halfWidthU);
    const u1 = clamp01(uCenter + halfWidthU);
    if (u1 - u0 < PIER_MIN_U) return lattice;
    const poly = [{ u: u0, v: 0 }, { u: u1, v: 0 }, { u: u1, v: 1 }, { u: u0, v: 1 }];
    return { ...lattice, piers: [...(lattice.piers || []), { poly, zTop: null }] };
}

/** u-Spanne (min,max) eines Pfeiler-Polygons. */
function pierURange(p) {
    const us = p.poly.map(c => c.u);
    return [Math.min(...us), Math.max(...us)];
}

/** Liegt u in der u-Spanne eines Pfeilers? (u-only Hit-Test fürs Toggle/Hover) */
export function uInPier(lattice, u) {
    for (const p of (lattice.piers || [])) {
        if (!p.poly) continue;
        const [lo, hi] = pierURange(p);
        if (u >= lo - 1e-9 && u <= hi + 1e-9) return true;
    }
    return false;
}

/** Liegt die Zelle (u,v) in einem Pfeiler-Polygon? (Export-Klassifikation) */
export function cellInPier(lattice, u, v) {
    for (const p of (lattice.piers || [])) {
        if (p.poly && isPointInPolygon(u, v, p.poly.map(c => ({ x: c.u, y: c.v })))) return true;
    }
    return false;
}

/** Index des Pfeilers, dessen Polygon (u,v) enthält — oder -1. */
export function pierIndexAt(lattice, u, v) {
    const piers = lattice.piers || [];
    for (let i = 0; i < piers.length; i++) {
        if (piers[i].poly && isPointInPolygon(u, v, piers[i].poly.map(c => ({ x: c.u, y: c.v })))) return i;
    }
    return -1;
}

/** Einen Pfeiler patchen ({poly, zTop}); Polygon-Punkte auf [0,1] geklemmt. */
export function updatePier(lattice, index, patch) {
    const piers = (lattice.piers || []).map((p, i) => {
        if (i !== index) return p;
        const n = { ...p, ...patch };
        if (n.poly) n.poly = n.poly.map(c => ({ u: clamp01(c.u), v: clamp01(c.v) }));
        return n;
    });
    return { ...lattice, piers };
}

/** Eine Pfeiler-Ecke (cornerIdx) auf (u,v) verschieben. */
export function movePierCorner(lattice, pierIdx, cornerIdx, u, v) {
    const piers = (lattice.piers || []).map((p, i) => {
        if (i !== pierIdx || !p.poly) return p;
        const poly = p.poly.map((c, k) => k === cornerIdx ? { u: clamp01(u), v: clamp01(v) } : c);
        return { ...p, poly };
    });
    return { ...lattice, piers };
}

/** Pfeiler-Polygon verfeinern: auf jeder Kante einen Mittelpunkt einfügen
 *  (mehr Ecken zum Ziehen → abgerundete Formen). Deckelt bei 32 Punkten. */
export function subdividePier(lattice, pierIdx) {
    const piers = (lattice.piers || []).map((p, i) => {
        if (i !== pierIdx || !p.poly || p.poly.length >= 32) return p;
        const poly = [];
        for (let k = 0; k < p.poly.length; k++) {
            const a = p.poly[k], b = p.poly[(k + 1) % p.poly.length];
            poly.push(a, { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 });
        }
        return { ...p, poly };
    });
    return { ...lattice, piers };
}

/** Pfeiler entfernen, dessen u-Spanne u enthält (Toggle-Semantik im Editor). */
export function removePierAt(lattice, u) {
    const piers = (lattice.piers || []).filter(p => {
        if (!p.poly) return true;
        const [lo, hi] = pierURange(p);
        return !(u >= lo - 1e-9 && u <= hi + 1e-9);
    });
    return { ...lattice, piers };
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
 * Die 4 Eckpunkte des Lattice-Frames (Rechteck) in Weltkoordinaten — die
 * EINZIGE Formquelle der Brücke. Body, Umriss, Greifpunkte, Pfeiler und das
 * Export-Raster leiten sich hieraus ab (keine konkurrierende Polygon-Quelle).
 * @returns {Array<{x,y}>} [u0v0, u1v0, u1v1, u0v1]
 */
export function frameCorners(lattice) {
    return [
        uvToWorld(lattice, 0, 0),
        uvToWorld(lattice, 1, 0),
        uvToWorld(lattice, 1, 1),
        uvToWorld(lattice, 0, 1),
    ];
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

    // v-Intervall über die Querreihen: nicht-uniform via lattice.v, sonst gleichverteilt
    let i0, tv;
    if (lattice.v) {
        const vs = lattice.v;
        i0 = 0;
        while (i0 < vs.length - 2 && vv > vs[i0 + 1]) i0++;
        const vspan = vs[i0 + 1] - vs[i0];
        tv = vspan > 1e-12 ? (vv - vs[i0]) / vspan : 0;
    } else {
        const vPos = vv * (lattice.nCross - 1);
        i0 = Math.min(lattice.nCross - 2, Math.floor(vPos));
        tv = vPos - i0;
    }

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
 * Quer-Loop-Cut: neue v-Station (Querreihe i) einfügen, Höhen beider Sheets
 * interpoliert. Spiegelbild von insertLoopCut, aber über die Reihen statt Spalten.
 * @returns {object|null} neues Lattice oder null (zu nah an bestehender v-Station).
 */
export function insertLoopCutV(lattice, vCut) {
    const v = Math.min(1, Math.max(0, vCut));
    const vs = lattice.v || lattice.bottomZ.map((_, i) => i / (lattice.nCross - 1));
    if (vs.some(vk => Math.abs(vk - v) < LOOP_CUT_EPS)) return null;

    let i = 0;
    while (i < vs.length - 1 && vs[i + 1] < v) i++;
    const t = (v - vs[i]) / (vs[i + 1] - vs[i]);

    // neue Reihe zwischen Reihe i und i+1 interpolieren
    const lerpRow = (sheet) => sheet[i].map((z0, j) => z0 + t * (sheet[i + 1][j] - z0));
    const insertRow = (sheet) => {
        const next = sheet.map(r => r.slice());
        next.splice(i + 1, 0, lerpRow(sheet));
        return next;
    };
    return {
        ...lattice,
        origin: { ...lattice.origin },
        spanDir: { ...lattice.spanDir },
        nCross: lattice.nCross + 1,
        v: [...vs.slice(0, i + 1), v, ...vs.slice(i + 1)],
        bottomZ: insertRow(lattice.bottomZ),
        topZ: insertRow(lattice.topZ),
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
    const { lattice } = bridge;
    if (!lattice) return [];
    // Einzige Formquelle: das Frame-Rechteck (nicht das rohe Footprint-Polygon).
    const footprint = frameCorners(lattice);
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
        // Pfeilerzelle = Zellzentrum liegt in einer Pfeiler-Box (u UND v). Rein
        // geometrisch (kein Terrain nötig): solche Zellen liefern KEIN Orifice und
        // die SGC-Breite darunter wird beim Export 0 — volle Sperrung ohne DGM-Eingriff.
        const pier = cellInPier(lattice, u, v);
        return {
            col: c.col, row: c.row, x: c.x, y: c.y,
            z, direction,
            z_sohle: z,
            soffit, deck,
            width: header.cellsize,
            Cd: bridge.Cd, Tz: bridge.Tz,
            pier,
        };
    });
}

/**
 * Pfeilerzellen ALLER mesh3d-Brücken als Set "col,row" (row bottom-up, row 0 = Süd).
 * Rein geometrisch (kein Terrain nötig) — dieselbe Quelle, die der Export nutzt, um die
 * SGC-Breite an Pfeilern auf 0 zu setzen. Wird im ErgebnisViewer für die Overlay-Maske
 * (Strömungslinien/Pfeile enden am Pfeiler) wiederverwendet — ohne Physik anzufassen.
 * @param {Array} bridges  geoStore.bridges
 * @param {object} header  {ncols, nrows, cellsize, xll|xllcorner, yll|yllcorner}
 * @returns {Set<string>}  "col,row"
 */
export function collectPierCells(bridges, header) {
    const keys = new Set();
    for (const bridge of (bridges || [])) {
        if (bridge.kind !== 'mesh3d' || !bridge.lattice?.piers?.length) continue;
        for (const cell of latticeToCells(bridge, header, null)) {
            if (cell.pier) keys.add(`${cell.col},${cell.row}`);
        }
    }
    return keys;
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
