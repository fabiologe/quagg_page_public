/**
 * weirWall — three.js-Geometrie für die freie Wehr-Wand (geoStore.weirLines).
 *
 * Die Wand ist ein 3D-Balken mit Breite (line.width), der **entlang des Rasters
 * verdichtet** wird: pro Zellweite ein Stützpunkt, dessen Unterkante die
 * Geländehöhe abtastet → die Wand klebt am Terrain (schwebt nicht). Oberkante =
 * per-Ecke-Kronenprofil (interpoliert). Öffnungen = Rohre, die QUER (in
 * Fließrichtung) durch die Wand gehen.
 *
 * Kein node-Test (three.js) — die Hydraulik-Diskretisierung liegt in weirGeometry.js.
 */
import * as THREE from 'three';
import { sampleGridZ } from './BridgeMeshLattice.js';
import { openingSection } from './weirGeometry.js';

function headerOf(grid) {
    return {
        ncols: grid.ncols, nrows: grid.nrows, cellsize: grid.cellsize,
        xll: grid.center.x - (grid.ncols - 1) * grid.cellsize / 2,
        yll: grid.center.y - (grid.nrows - 1) * grid.cellsize / 2,
    };
}
/** GIS → Terrain-lokal (Konvention wie getLocalPos/Bridge3DGeometry.toLocal). */
function toLocal(grid, x, y, z) {
    return new THREE.Vector3(x - grid.center.x, z - grid.minZ, -(y - grid.center.y));
}
function terrainZ(grid, hdr, x, y) {
    return hdr ? (sampleGridZ(hdr, grid.gridData, x, y) ?? grid.minZ) : grid.minZ;
}
function crestOf(line, p, grid) {
    return Number.isFinite(p.z) ? p.z : (line.hc ?? grid.minZ + 1);
}

/** Polylinie entlang des Rasters verdichten: Unterkante = Gelände, Oberkante = Kronenprofil. */
function densify(line, grid) {
    const pts = line?.points || [];
    if (pts.length < 2) return [];
    const hdr = grid.gridData ? headerOf(grid) : null;
    const step = Math.max(0.3, (grid.cellsize || 1) / 3); // fein genug, dass Loch-Formen sauber folgen
    const out = [];
    let arcBase = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const n = Math.max(1, Math.ceil(len / step));
        const za = crestOf(line, a, grid), zb = crestOf(line, b, grid);
        const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
        for (let k = (i > 0 ? 1 : 0); k <= n; k++) {
            const t = k / n;
            const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
            out.push({ x, y, baseZ: terrainZ(grid, hdr, x, y), crestZ: za + t * (zb - za), dx, dy, vertex: (k === 0 || k === n), arc: arcBase + t * len });
        }
        arcBase += len;
    }
    return out;
}

/** Bogenlängen-Position einer Öffnung (Projektion auf die Linie). */
function openingArc(line, o) {
    const pts = line.points || []; let acc = 0, sBest = 0, bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], vx = b.x - a.x, vy = b.y - a.y, len = Math.hypot(vx, vy) || 1;
        const t = Math.max(0, Math.min(1, ((o.x - a.x) * vx + (o.y - a.y) * vy) / (len * len)));
        const d = Math.hypot(o.x - (a.x + t * vx), o.y - (a.y + t * vy));
        if (d < bestD) { bestD = d; sBest = acc + t * len; }
        acc += len;
    }
    return sBest;
}

/** Vier Eckpunkte (links/rechts × Boden/Krone) eines verdichteten Stützpunkts. */
function sampleCorners(grid, s, hw) {
    const px = -s.dy, py = s.dx; // Normale (Fließrichtung)
    const Lx = s.x + px * hw, Ly = s.y + py * hw;
    const Rx = s.x - px * hw, Ry = s.y - py * hw;
    return {
        bl: toLocal(grid, Lx, Ly, s.baseZ), tl: toLocal(grid, Lx, Ly, s.crestZ),
        br: toLocal(grid, Rx, Ry, s.baseZ), tr: toLocal(grid, Rx, Ry, s.crestZ),
    };
}

/** Eckpunkte eines Stützpunkts für eine z-Bande [zLo,zHi] (links/rechts × unten/oben). */
function bandCorners(grid, s, hw, zLo, zHi) {
    const px = -s.dy, py = s.dx;
    const Lx = s.x + px * hw, Ly = s.y + py * hw, Rx = s.x - px * hw, Ry = s.y - py * hw;
    return {
        bl: toLocal(grid, Lx, Ly, zLo), tl: toLocal(grid, Lx, Ly, zHi),
        br: toLocal(grid, Rx, Ry, zLo), tr: toLocal(grid, Rx, Ry, zHi),
    };
}

/** Gesamtlänge der Polylinie. */
function lineTotalLength(line) {
    const p = line.points || []; let t = 0;
    for (let i = 0; i < p.length - 1; i++) t += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
    return t;
}
/** Linienpunkt an Bogenlänge `arc`: {x,y,baseZ,crestZ,dx,dy}. */
function sampleAtArc(line, grid, arc, hdr) {
    const p = line.points; let acc = 0;
    for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        if (arc <= acc + len || i === p.length - 2) {
            const t = Math.max(0, Math.min(1, (arc - acc) / len));
            const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
            const za = crestOf(line, a, grid), zb = crestOf(line, b, grid);
            return { x, y, baseZ: terrainZ(grid, hdr, x, y), crestZ: za + t * (zb - za), dx: (b.x - a.x) / len, dy: (b.y - a.y) / len };
        }
        acc += len;
    }
    return null;
}

/**
 * Solider Wand-Balken (Breite line.width) mit ECHTEN Durchlässen. Wand außerhalb
 * der Öffnungen = solide Banden (folgen dem Gelände); an jeder Öffnung wird ein
 * Panel gebaut, aus dem die Querschnittsform als LOCH ausgeschnitten ist
 * (triangulateShape mit Hole) und durch die Wanddicke extrudiert wird.
 */
export function buildWeirWall(line, grid) {
    if (!grid?.center || (line?.points?.length ?? 0) < 2) return null;
    const hdr = grid.gridData ? headerOf(grid) : null;
    const hw = (line.width ?? grid.cellsize) / 2;
    const total = lineTotalLength(line);
    const step = Math.max(0.3, (grid.cellsize || 1) / 3);

    const pos = [];
    const quad = (a, b, d, e) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z, a.x, a.y, a.z, d.x, d.y, d.z, e.x, e.y, e.z);
    const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);

    // Solide Wand über das Bogenintervall [a0,a1] (mit Stirnkappen an den Enden).
    const buildSolid = (a0, a1) => {
        if (a1 - a0 < 0.01) return;
        const n = Math.max(1, Math.ceil((a1 - a0) / step));
        let prev = null;
        for (let k = 0; k <= n; k++) {
            const s = sampleAtArc(line, grid, a0 + (a1 - a0) * k / n, hdr);
            const c = bandCorners(grid, s, hw, s.baseZ, s.crestZ);
            if (prev) { quad(prev.tl, c.tl, c.tr, prev.tr); quad(prev.bl, c.bl, c.br, prev.br); quad(prev.bl, c.bl, c.tl, prev.tl); quad(prev.br, c.br, c.tr, prev.tr); }
            else quad(c.bl, c.br, c.tr, c.tl); // Stirnkappe Start
            prev = c;
            if (k === n) quad(c.bl, c.br, c.tr, c.tl); // Stirnkappe Ende
        }
    };

    // Öffnungs-Panel: Außenkontur (Trapez base..crest) mit Loch (Querschnitt), extrudiert.
    const buildPanel = (op) => {
        const ctr = sampleAtArc(line, grid, op.arc, hdr);
        const nL = sampleAtArc(line, grid, op.arc - op.sExt, hdr), nR = sampleAtArc(line, grid, op.arc + op.sExt, hdr);
        const contour = [{ s: -op.sExt, z: nL.baseZ }, { s: op.sExt, z: nR.baseZ }, { s: op.sExt, z: nR.crestZ }, { s: -op.sExt, z: nL.crestZ }]; // CCW
        // Loch muss zur CCW-Außenkontur GEGENläufig (CW) sein, sonst wird nicht ausgeschnitten.
        let area = 0; for (let i = 0; i < op.section.length; i++) { const a = op.section[i], b = op.section[(i + 1) % op.section.length]; area += a.s * b.z - b.s * a.z; }
        const hole = area > 0 ? op.section.slice().reverse() : op.section;
        const tris = THREE.ShapeUtils.triangulateShape(contour.map(p => new THREE.Vector2(p.s, p.z)), [hole.map(p => new THREE.Vector2(p.s, p.z))]);
        const all = [...contour, ...hole];
        const fnx = -ctr.dy, fny = ctr.dx; // Fließrichtung (Normale)
        const map = (p, e) => toLocal(grid, op.o.x + ctr.dx * p.s + fnx * e, op.o.y + ctr.dy * p.s + fny * e, p.z);
        const front = all.map(p => map(p, hw)), back = all.map(p => map(p, -hw));
        for (const [a, b, c] of tris) { tri(front[a], front[b], front[c]); tri(back[a], back[c], back[b]); }
        for (let i = 0; i < 4; i++) { const a = i, b = (i + 1) % 4; quad(front[a], back[a], back[b], front[b]); } // Außenkanten
    };

    const ops = (line.openings || []).map(o => {
        const section = openingSection(o);
        return { o, section, arc: openingArc(line, o), sExt: Math.max(...section.map(p => Math.abs(p.s))) };
    }).filter(op => op.sExt > 1e-3 && op.arc - op.sExt < total && op.arc + op.sExt > 0).sort((a, b) => a.arc - b.arc);

    let cursor = 0;
    for (const op of ops) {
        const aL = Math.max(0, op.arc - op.sExt), aR = Math.min(total, op.arc + op.sExt);
        buildSolid(cursor, Math.max(cursor, aL));
        buildPanel(op);
        cursor = Math.max(cursor, aR);
    }
    buildSolid(cursor, total);

    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
}

/** Kantenlinien des Wand-Balkens (Kronen-/Boden-Schienen + Vertikalen an den Ecken). */
export function buildWeirWallWire(line, grid) {
    if (!grid?.center) return null;
    const samples = densify(line, grid);
    if (samples.length < 2) return null;
    const hw = (line.width ?? grid.cellsize) / 2;
    const c = samples.map(s => sampleCorners(grid, s, hw));
    const seg = [];
    const push = (a, b) => seg.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let i = 0; i < c.length - 1; i++) {
        push(c[i].tl, c[i + 1].tl); push(c[i].tr, c[i + 1].tr); // Kronen-Schienen
        push(c[i].bl, c[i + 1].bl); push(c[i].br, c[i + 1].br); // Boden-Schienen
    }
    for (let i = 0; i < c.length; i++) {
        if (!samples[i].vertex) continue; // Vertikalen nur an den echten Ecken
        push(c[i].bl, c[i].tl); push(c[i].br, c[i].tr);
    }
    return new Float32Array(seg);
}

/** Lokale Linienrichtung (world dx,dy) am nächstgelegenen Segment zu (x,y). */
function lineDirAt(points, x, y) {
    let bestD = Infinity, dir = { dx: 1, dy: 0 };
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
        let t = len2 > 1e-9 ? ((x - a.x) * vx + (y - a.y) * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy));
        const len = Math.hypot(vx, vy) || 1;
        if (d < bestD) { bestD = d; dir = { dx: vx / len, dy: vy / len }; }
    }
    return dir;
}

/**
 * Öffnungs-Körper: das Querschnitts-Polygon (s entlang Linie, z absolut) wird QUER
 * (Fließrichtung) durch die Wand extrudiert — rund, rechteckig oder frei-polygonal,
 * je `opening.type`. Geht durch die ganze Wanddicke (line.width) hindurch.
 * @returns {Array<THREE.BufferGeometry>}
 */
export function buildWeirOpenings(line, grid) {
    const out = [];
    if (!grid?.center) return out;
    const L = (line.width ?? grid.cellsize) + 0.6; // durch die Wand + etwas Überstand
    for (const o of (line.openings || [])) {
        const section = openingSection(o);
        if (!section || section.length < 3) continue;
        const dir = lineDirAt(line.points, o.x, o.y);          // Linienrichtung (world)
        const nx = -dir.dy, ny = dir.dx;                        // Fließrichtung (Normale)
        const n = section.length;
        const front = [], back = [];
        for (const p of section) {
            const wx = o.x + dir.dx * p.s, wy = o.y + dir.dy * p.s;
            front.push(toLocal(grid, wx + nx * (L / 2), wy + ny * (L / 2), p.z));
            back.push(toLocal(grid, wx - nx * (L / 2), wy - ny * (L / 2), p.z));
        }
        const pos = [];
        const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        const tris = THREE.ShapeUtils.triangulateShape(section.map(p => new THREE.Vector2(p.s, p.z)), []);
        for (const [a, b, c] of tris) { tri(front[a], front[b], front[c]); tri(back[a], back[c], back[b]); } // Stirnflächen
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; tri(front[i], front[j], back[j]); tri(front[i], back[j], back[i]); } // Wände
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        out.push(geo);
    }
    return out;
}
