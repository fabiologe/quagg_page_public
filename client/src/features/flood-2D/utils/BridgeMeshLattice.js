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
/**
 * Bei einem VIERECK (4 Ecken): die 4 Polygon-Ecken in u/v-Reihenfolge [c00,c10,c11,c01]
 * ordnen (über die affine Frame-Projektion). Dann mappt das Frame bilinear auf das echte
 * Viereck → Käfig-Knoten/Griffe sitzen EXAKT auf den Polygon-Ecken (jede Ecke ziehbar).
 * @returns {Array<{x,y}>|null} 4 Ecken oder null (kein sauberes Viereck).
 */
function quadCorners(footprint, frame) {
    if (!footprint || footprint.length !== 4) return null;
    const cd = crossDirOf(frame.spanDir);
    const uv = footprint.map(p => {
        const dx = p.x - frame.origin.x, dy = p.y - frame.origin.y;
        return {
            p,
            u: (dx * frame.spanDir.x + dy * frame.spanDir.y) / (frame.spanLen || 1),
            v: (dx * cd.x + dy * cd.y) / (frame.crossLen || 1),
        };
    });
    const pick = (uHi, vHi) => {
        let best = null, bd = Infinity;
        for (const q of uv) {
            const d = (q.u - (uHi ? 1 : 0)) ** 2 + (q.v - (vHi ? 1 : 0)) ** 2;
            if (d < bd) { bd = d; best = q.p; }
        }
        return best;
    };
    const c = [pick(false, false), pick(true, false), pick(true, true), pick(false, true)];
    return new Set(c).size === 4 ? c.map(p => ({ x: p.x, y: p.y })) : null;
}

export function createLattice(footprint, { soffit, deck }) {
    const frame = deriveFrame(footprint);
    if (!frame) return null;
    const corners = quadCorners(footprint, frame); // null bei ≠4 Ecken → affines Rechteck-Frame
    return {
        ...frame,
        ...(corners ? { corners } : {}),
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
    // Viereck-Frame: inverses bilineares Mapping (Standard, Inigo-Quilez-Form).
    if (lattice.corners) {
        const [a, b, c, d] = lattice.corners; // c00, c10, c11, c01
        const cross = (mx, my, nx, ny) => mx * ny - my * nx;
        const ex = b.x - a.x, ey = b.y - a.y;
        const fx = d.x - a.x, fy = d.y - a.y;
        const gx = a.x - b.x + c.x - d.x, gy = a.y - b.y + c.y - d.y;
        const hx = x - a.x, hy = y - a.y;
        const k2 = cross(gx, gy, fx, fy);
        const k1 = cross(ex, ey, fx, fy) + cross(hx, hy, gx, gy);
        const k0 = cross(hx, hy, ex, ey);
        let v;
        if (Math.abs(k2) < 1e-9) {
            v = Math.abs(k1) < 1e-12 ? 0 : -k0 / k1;
        } else {
            const disc = k1 * k1 - 4 * k0 * k2;
            const sq = disc > 0 ? Math.sqrt(disc) : 0;
            const v1 = (-k1 + sq) / (2 * k2);
            v = (v1 >= -0.01 && v1 <= 1.01) ? v1 : (-k1 - sq) / (2 * k2);
        }
        const denX = ex + gx * v, denY = ey + gy * v;
        const u = Math.abs(denX) > Math.abs(denY) ? (hx - fx * v) / (denX || 1) : (hy - fy * v) / (denY || 1);
        return { u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)) };
    }
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
    // Viereck-Frame: bilinear über die 4 echten Ecken.
    if (lattice.corners) {
        const [a, b, c, d] = lattice.corners; // c00, c10, c11, c01
        const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w11 = u * v, w01 = (1 - u) * v;
        return {
            x: w00 * a.x + w10 * b.x + w11 * c.x + w01 * d.x,
            y: w00 * a.y + w10 * b.y + w11 * c.y + w01 * d.y,
        };
    }
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
 * @param {number} [minSpacingWorld=0] Welt-Mindestabstand (z.B. DEM-Zellweite): feiner als das
 *        Rechengitter ist nicht abbildbar → Cut wird abgelehnt. Umgerechnet via spanLen.
 * @returns {object|null} neues Lattice (deep clone) oder null, wenn uCut zu nah an einer
 *          bestehenden Station liegt (max aus Epsilon und Welt-Mindestabstand).
 */
export function insertLoopCut(lattice, uCut, minSpacingWorld = 0) {
    const u = Math.min(1, Math.max(0, uCut));
    const minU = Math.max(LOOP_CUT_EPS, minSpacingWorld / (lattice.spanLen || 1));
    if (lattice.u.some(uk => Math.abs(uk - u) < minU)) return null;

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
export function insertLoopCutV(lattice, vCut, minSpacingWorld = 0) {
    const v = Math.min(1, Math.max(0, vCut));
    const vs = lattice.v || lattice.bottomZ.map((_, i) => i / (lattice.nCross - 1));
    const minV = Math.max(LOOP_CUT_EPS, minSpacingWorld / (lattice.crossLen || 1));
    if (vs.some(vk => Math.abs(vk - v) < minV)) return null;

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
 * Nicht-mutierende Prüfung: würde ein Loop-Cut an `pos` (axis 'u'|'v') abgelehnt
 * (zu nah an einer Station / feiner als `minSpacingWorld`)? Spiegelt insertLoopCut(V)
 * für visuelles Feedback (rote Vorschau), ohne ein Lattice zu bauen.
 */
export function loopCutBlocked(lattice, pos, axis = 'u', minSpacingWorld = 0) {
    const p = Math.min(1, Math.max(0, pos));
    if (axis === 'v') {
        const vs = lattice.v || lattice.bottomZ.map((_, i) => i / (lattice.nCross - 1));
        const minV = Math.max(LOOP_CUT_EPS, minSpacingWorld / (lattice.crossLen || 1));
        return vs.some(vk => Math.abs(vk - p) < minV);
    }
    const minU = Math.max(LOOP_CUT_EPS, minSpacingWorld / (lattice.spanLen || 1));
    return lattice.u.some(uk => Math.abs(uk - p) < minU);
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

// ── Per-Ecke-Höhenmodell: baryzentrische Interpolation über eine Polygon-Triangulierung ──
// THREE-frei (node-testbar). Reines Ear-Clipping; Höhen werden je Polygon-Ecke gespeichert
// (bridge.vsoffit/vdeck) und für Körper/Zellen/Käfig daraus interpoliert.

/**
 * Höhen-Sampler über **Mean-Value-Koordinaten** (Floater 2003): glatte verallgemeinerte
 * baryzentrische Koordinaten über ein BELIEBIGES einfaches Polygon. `at(x,y)` = gewichtete
 * Höhe aus `zArr` (eine Höhe je Ecke). Eigenschaften, die das frühere Ear-Clipping NICHT
 * hatte:
 *   - JEDE Ecke beeinflusst JEDEN Innenpunkt (eine Ecke ziehen kippt die GANZE Fläche
 *     glatt, statt nur die anliegenden Dreiecke → keine Triangulierungs-„Zacken").
 *   - C∞-glatt im Inneren, keine willkürlichen Diagonal-Knicke.
 *   - reproduziert lineare Daten EXAKT (flache Brücke bleibt flach, lineare Kippung exakt).
 *
 * @param {Array<{x,y}>} poly
 * @param {Array<number>} zArr  Höhe je Ecke (parallel zu poly)
 */
export function makeHeightSampler(poly, zArr) {
    const n = poly.length;
    return {
        at(x, y) {
            if (n < 3) return zArr[0] ?? 0;
            const EPS = 1e-7;
            const dx = new Array(n), dy = new Array(n), r = new Array(n);
            for (let i = 0; i < n; i++) {
                dx[i] = poly[i].x - x; dy[i] = poly[i].y - y;
                r[i] = Math.hypot(dx[i], dy[i]);
                if (r[i] < EPS) return zArr[i];                  // exakt auf einer Ecke
            }
            // tan(α_i/2) für den (signierten) Winkel zwischen Ecke i und i+1, von P aus.
            const tanHalf = new Array(n);
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                const dot = dx[i] * dx[j] + dy[i] * dy[j];
                const cross = dx[i] * dy[j] - dy[i] * dx[j];
                const alpha = Math.atan2(cross, dot);            // (-π, π]
                if (Math.PI - Math.abs(alpha) < 1e-5) {          // P liegt auf Kante i→j
                    const t = r[i] / (r[i] + r[j]);
                    return (1 - t) * zArr[i] + t * zArr[j];
                }
                tanHalf[i] = Math.tan(alpha / 2);
            }
            let wsum = 0, vsum = 0;
            for (let i = 0; i < n; i++) {
                const im1 = (i - 1 + n) % n;
                const w = (tanHalf[im1] + tanHalf[i]) / r[i];
                wsum += w; vsum += w * zArr[i];
            }
            if (Math.abs(wsum) < 1e-12) {                        // entartet → nächste Ecke
                let best = 0, bd = Infinity;
                for (let i = 0; i < n; i++) { if (r[i] < bd) { bd = r[i]; best = i; } }
                return zArr[best];
            }
            return vsum / wsum;
        },
    };
}

/** Hat die Brücke ein gültiges Per-Ecke-Höhenmodell (vsoffit/vdeck parallel zu poly)? */
export function hasVertexHeights(bridge) {
    return !!(bridge.poly && bridge.vsoffit && bridge.vdeck
        && bridge.poly.length >= 3
        && bridge.vsoffit.length === bridge.poly.length
        && bridge.vdeck.length === bridge.poly.length);
}

/**
 * (x,y) auf die NÄCHSTE Polygonkante projizieren. Liefert die Kante (k = Index der Start-
 * ecke), den Parameter t∈[0,1] auf ihr und den Fußpunkt (px,py). Single Source für das
 * Stützpunkt-Einfügen UND die Hover-Vorschau (beide zeigen denselben Punkt).
 * @returns {{k:number,t:number,px:number,py:number,dist:number}|null}
 */
export function projectToNearestEdge(poly, x, y) {
    if (!poly || poly.length < 3) return null;
    const n = poly.length;
    let best = null, bd = Infinity;
    for (let k = 0; k < n; k++) {
        const a = poly[k], b = poly[(k + 1) % n];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + t * dx, py = a.y + t * dy;
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < bd) { bd = d; best = { k, t, px, py, dist: Math.sqrt(d) }; }
    }
    return best;
}

/**
 * Stützpunkt einfügen: (x,y) auf die NÄCHSTE Polygonkante projizieren und dort eine neue
 * Ecke einsetzen (vsoffit/vdeck linear interpoliert). Ergibt einen neuen ziehbaren Höhen-
 * Greifpunkt (z.B. Mitte hochziehen = Bogen). Lattice (Pfeiler/Frame) bleibt unverändert.
 * @returns {{poly:Array,vsoffit:Array,vdeck:Array}|null}
 */
export function insertPolyVertex(bridge, x, y) {
    const poly = bridge.poly;
    if (!poly || poly.length < 3) return null;
    const n = poly.length;
    const best = projectToNearestEdge(poly, x, y);
    if (!best) return null;
    const { k, t, px, py } = best;
    const ka = k, kb = (k + 1) % n;
    const vz = hasVertexHeights(bridge);
    const sN = vz ? bridge.vsoffit[ka] + t * (bridge.vsoffit[kb] - bridge.vsoffit[ka]) : (bridge.soffit ?? 2);
    const dN = vz ? bridge.vdeck[ka] + t * (bridge.vdeck[kb] - bridge.vdeck[ka]) : (bridge.deck ?? 3);
    const newPoly = poly.slice(); newPoly.splice(k + 1, 0, { x: px, y: py });
    const newVs = (bridge.vsoffit || poly.map(() => sN)).slice(); newVs.splice(k + 1, 0, sN);
    const newVd = (bridge.vdeck || poly.map(() => dN)).slice(); newVd.splice(k + 1, 0, dN);
    return { poly: newPoly, vsoffit: newVs, vdeck: newVd };
}

/**
 * Schnittpunkte einer u/v-**Stationslinie** mit dem Polygonrand. `axis='u'` → Linie bei
 * konstantem u (quer über die Breite → für Bögen ENTLANG der Spannweite/„Längs"); `axis='v'`
 * → konstantes v (Profil über die Breite/„Quer"). Liefert die **2 äußersten** Schnittpunkte
 * (Eintritt/Austritt) auf den ECHTEN Kanten — funktioniert für BELIEBIGE (auch irreguläre)
 * Polygone, weil nicht „die zwei Längskanten" angenommen, sondern der reale Rand geschnitten
 * wird. Das u/v-Frame existiert für jedes Polygon (deriveFrame).
 * @returns {[{x,y},{x,y}]|null}
 */
export function polyStationHits(poly, lattice, axis, station) {
    if (!poly || poly.length < 3 || !lattice) return null;
    const a = axis === 'v' ? uvToWorld(lattice, 0, station) : uvToWorld(lattice, station, 0);
    const b = axis === 'v' ? uvToWorld(lattice, 1, station) : uvToWorld(lattice, station, 1);
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx * dx + dy * dy < 1e-12) return null;
    const n = poly.length;
    const hits = [];
    for (let i = 0; i < n; i++) {
        const A = poly[i], B = poly[(i + 1) % n];
        const ex = B.x - A.x, ey = B.y - A.y;
        const det = (dx * -ey) - (-ex * dy);          // -dx·ey + ex·dy
        if (Math.abs(det) < 1e-12) continue;            // Kante ∥ Station
        const rx = A.x - a.x, ry = A.y - a.y;
        const te = (dx * ry - rx * dy) / det;           // Param auf der Kante [0,1]
        if (te < -1e-9 || te > 1 + 1e-9) continue;
        const px = A.x + te * ex, py = A.y + te * ey;
        const proj = (px - a.x) * dx + (py - a.y) * dy; // Lage entlang der Station
        hits.push({ x: px, y: py, proj });
    }
    if (hits.length < 2) return null;
    hits.sort((u, v) => u.proj - v.proj);
    const p1 = hits[0], p2 = hits[hits.length - 1];     // äußerste = Eintritt/Austritt
    if (Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-6) return null;
    return [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
}

/**
 * Längs/Quer-Stützpunkt: an einer u/v-Station BEIDE Rand-Schnittpunkte als neue Ecken
 * einfügen (Höhen interpoliert). Gemeinsam hochgezogen ergeben sie einen symmetrischen
 * Bogen über die volle Breite. `axis='u'` = Längs (Bogen entlang Spannweite), `'v'` = Quer.
 * @returns {{poly,vsoffit,vdeck,newIndices:number[]}|null}
 */
export function insertPolyStation(bridge, axis, station) {
    const pts = polyStationHits(bridge.poly, bridge.lattice, axis, station);
    if (!pts) return null;
    let cur = bridge;
    for (const p of pts) {
        // Station trifft eine BESTEHENDE Ecke (z.B. Dreieck-Spitze) → nicht doppelt
        // einfügen; diese Ecke wird einfach als Bogen-Endpunkt mitbenutzt.
        const dup = cur.poly.some(q => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6);
        if (dup) continue;
        const r = insertPolyVertex(cur, p.x, p.y);
        if (!r) return null;
        cur = { ...cur, poly: r.poly, vsoffit: r.vsoffit, vdeck: r.vdeck };
    }
    const newIndices = [];
    cur.poly.forEach((q, i) => {
        if (pts.some(p => Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6)) newIndices.push(i);
    });
    return { poly: cur.poly, vsoffit: cur.vsoffit, vdeck: cur.vdeck, newIndices: [...new Set(newIndices)] };
}

/**
 * Offene Breite QUER zur Fließrichtung innerhalb einer Zelle (sub-grid `w` fürs Orifice):
 * die Zell-Querachse (⊥ `direction`) mit N Subpunkten abtasten und den Anteil zählen, der im
 * Footprint UND außerhalb jedes Pfeilers liegt → `anteil × cellsize`. So werden Rand-/Eng-/
 * Sub-Pfeiler-Zellen nicht mehr auf die volle Zellweite überschätzt (Solver: `Area = w × Z`).
 * direction S/N → Fluss in y → Querachse x; E/W → Fluss in x → Querachse y.
 */
function cellOpenWidth(lattice, footprint, cx, cy, direction, cs) {
    const N = 20; // feinere Quer-Abtastung → sub-zell-schmale Pfeiler genauer aufgelöst
    const axisX = (direction === 'S' || direction === 'N');
    let open = 0;
    for (let k = 0; k < N; k++) {
        const t = (k + 0.5) / N - 0.5;          // -0.45 .. 0.45
        const sx = axisX ? cx + t * cs : cx;
        const sy = axisX ? cy : cy + t * cs;
        if (!isPointInPolygon(sx, sy, footprint)) continue;
        const { u, v } = worldToUV(lattice, sx, sy);
        if (cellInPier(lattice, u, v)) continue;
        open++;
    }
    return (open / N) * cs;
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
 * @param {{openWidth?:boolean}} [opts]  openWidth=true → `width` = reale offene Breite pro Zelle
 *        (Export/Hydraulik). Default false (Rendering/Masken brauchen es nicht → günstiger).
 * @returns {Array<{col,row,x,y,z,direction,z_sohle,soffit,deck,width,Cd,Tz,pier}>}
 */
export function latticeToCells(bridge, header, gridData = null, opts = {}) {
    const { lattice } = bridge;
    if (!lattice) return [];
    // Freiform: das ROH gezeichnete Polygon ist die Formquelle der Zellen (rasterizeFootprint
    // macht echtes Point-in-Polygon). Fallback auf das Frame-Rechteck für Alt-Brücken ohne poly.
    const footprint = (bridge.poly && bridge.poly.length >= 3) ? bridge.poly : frameCorners(lattice);
    const direction = deriveDirection(lattice, bridge.directionMode);
    const raster = rasterizeFootprint(footprint, header);
    const cs = header.cellsize;

    // Per-Ecke-Höhenmodell: Soffitte/Deck baryzentrisch aus den Eck-Höhen interpolieren
    // (jede Ecke editierbar). Fallback auf das Lattice-Sheet für Alt-Brücken ohne vsoffit/vdeck.
    const vz = hasVertexHeights(bridge);
    const sSoffit = vz ? makeHeightSampler(bridge.poly, bridge.vsoffit) : null;
    const sDeck = vz ? makeHeightSampler(bridge.poly, bridge.vdeck) : null;

    return raster.map(c => {
        const { u, v } = worldToUV(lattice, c.x, c.y);
        const soffit = vz ? sSoffit.at(c.x, c.y) : sampleSheet(lattice, lattice.bottomZ, u, v);
        const deck = vz ? sDeck.at(c.x, c.y) : sampleSheet(lattice, lattice.topZ, u, v);
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
            // openWidth: reale offene Breite quer zur Strömung (Export/Hydraulik); sonst Zellweite.
            width: opts.openWidth ? cellOpenWidth(lattice, footprint, c.x, c.y, direction, cs) : cs,
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
 * ALLE Zellen aller mesh3d-Brückenkörper (nicht nur Pfeiler) als Set "col,row"
 * (row bottom-up). Der Deck-Slab (Bridge3DGeometry.js buildCellBody) läuft
 * DURCHGEHEND über die gesamte Fußabdruck-Fläche (auch über Pfeiler) und wird im
 * Ergebnis-Viewer als solides Mesh gerendert — Fließpfeile/Streamlines (depthTest:
 * false) würden sonst sichtbar durch die ganze Brücke laufen, nicht nur an
 * Pfeilern. Bewusst OHNE piers-Guard: auch pfeilerlose Brücken (reine Deck-Platte)
 * müssen über ihre volle Fläche maskiert werden. Ist eine strikte Obermenge von
 * collectPierCells().
 * @param {Array} bridges  geoStore.bridges
 * @param {object} header  {ncols, nrows, cellsize, xll|xllcorner, yll|yllcorner}
 * @returns {Set<string>}  "col,row"
 */
export function collectBridgeCells(bridges, header) {
    const keys = new Set();
    for (const bridge of (bridges || [])) {
        if (bridge.kind !== 'mesh3d' || !bridge.lattice) continue;
        for (const cell of latticeToCells(bridge, header, null)) {
            keys.add(`${cell.col},${cell.row}`);
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

/** Achse (Polylinie) um width/2 versetzen → geschlossenes Streifen-Polygon (links vor + rechts zurück). */
function bufferAxis(axis, width) {
    const h = (width || 1) / 2;
    const left = [], right = [];
    for (let i = 0; i < axis.length; i++) {
        const a = axis[Math.max(0, i - 1)], b = axis[Math.min(axis.length - 1, i + 1)];
        let dx = b.x - a.x, dy = b.y - a.y;
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const nx = -dy, ny = dx; // Senkrechte
        left.push({ x: axis[i].x + nx * h, y: axis[i].y + ny * h });
        right.push({ x: axis[i].x - nx * h, y: axis[i].y - ny * h });
    }
    return [...left, ...right.reverse()];
}

/**
 * Migriert eine Alt-Brücke auf das Polygon-mesh3d-Modell (idempotent — nur wenn `poly` fehlt):
 *   - mesh3d ohne poly  → poly = frameCorners(lattice) (Rechteck).
 *   - LINE-Brücke (axis+width) → Streifen-Polygon + frisches Lattice, kind='mesh3d'.
 * Gibt die (ggf. unveränderte) Brücke zurück.
 */
export function migrateBridgeShape(b) {
    if (!b) return b;
    let out = b;
    // 1) poly sicherstellen
    if (!(out.poly && out.poly.length >= 3)) {
        if (out.kind === 'mesh3d' && out.lattice) {
            out = { ...out, poly: frameCorners(out.lattice) };
        } else if (Array.isArray(out.axis) && out.axis.length >= 2) {
            const soffit = out.soffit ?? 2.0, deck = out.deck ?? 3.0;
            const poly = bufferAxis(out.axis, out.width ?? 5.0);
            const lattice = createLattice(poly, { soffit, deck });
            if (!lattice) return out;
            out = {
                ...out, kind: 'mesh3d', poly, lattice,
                directionMode: out.directionMode ?? 'AUTO', Cd: out.Cd ?? 0.8, Tz: out.Tz ?? 1.5,
            };
        } else {
            return out; // nicht migrierbar
        }
    }
    // 2) Per-Ecke-Höhen sicherstellen — aus dem Lattice an den Ecken sampeln (flach = soffit/deck)
    if (!hasVertexHeights(out) && out.lattice) {
        const vsoffit = out.poly.map(p => { const { u, v } = worldToUV(out.lattice, p.x, p.y); return sampleSheet(out.lattice, out.lattice.bottomZ, u, v); });
        const vdeck = out.poly.map(p => { const { u, v } = worldToUV(out.lattice, p.x, p.y); return sampleSheet(out.lattice, out.lattice.topZ, u, v); });
        out = { ...out, vsoffit, vdeck };
    }
    return out;
}
