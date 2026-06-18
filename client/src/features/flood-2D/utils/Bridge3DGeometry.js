import * as THREE from 'three';
import { uvToWorld, sampleSheet, sampleGridZ } from './BridgeMeshLattice.js';

/**
 * Bridge3DGeometry — three.js-Geometrie für mesh3d-Brückenkörper.
 *
 * Body, Umriss (Wireframe) und Greifpunkte stammen ALLE aus dem Lattice-Gitter
 * (nCross×nSpan) — eine einzige Formquelle (kein konkurrierendes Footprint-
 * Polygon mehr). Der Body ist Soffit-Cap (unten), Deck-Cap (oben) und die
 * Seitenwände am Frame-Umfang; zwischen Stationen ist die Fläche bilinear.
 */

/** GIS (UTM, absolut) → Terrain-lokal (Konvention von getLocalPos in useLayerRenderer). */
function toLocal(grid, x, y, z) {
    return new THREE.Vector3(
        x - grid.center.x,
        z - grid.minZ,
        -(y - grid.center.y)
    );
}

/** Querstation v an Reihe i (nicht-uniform via lattice.v, sonst gleichverteilt). */
function vAtRow(lattice, i) {
    return lattice.v ? lattice.v[i] : i / (lattice.nCross - 1);
}

/**
 * Volumenkörper aus dem Lattice-Gitter (Soffit-/Deck-Sheet je Knoten).
 * @param {object} bridge  mesh3d-Brücke ({lattice})
 * @param {object} grid    aktives Terrain-Grid ({center, minZ})
 * @returns {THREE.BufferGeometry|null} indiziert, Terrain-lokal
 */
export function buildBridge3DGeometry(bridge, grid) {
    const { lattice } = bridge;
    if (!lattice || !grid?.center) return null;
    const { nCross, nSpan, u } = lattice;
    if (nCross < 2 || nSpan < 2) return null;

    const N = nCross * nSpan;
    const positions = new Float32Array(N * 2 * 3);
    const node = (i, j, sheet) => {
        const w = uvToWorld(lattice, u[j], vAtRow(lattice, i));
        return toLocal(grid, w.x, w.y, sheet[i][j]);
    };
    for (let i = 0; i < nCross; i++) {
        for (let j = 0; j < nSpan; j++) {
            const k = i * nSpan + j;
            const b = node(i, j, lattice.bottomZ);
            const t = node(i, j, lattice.topZ);
            positions.set([b.x, b.y, b.z], k * 3);
            positions.set([t.x, t.y, t.z], (N + k) * 3);
        }
    }

    const bi = (i, j) => i * nSpan + j;          // Boden-Index (Soffitte)
    const ti = (i, j) => N + i * nSpan + j;      // Deckel-Index (Deck)
    const indices = [];
    for (let i = 0; i < nCross - 1; i++) {
        for (let j = 0; j < nSpan - 1; j++) {
            // Boden-Cap (nach unten) + Deckel-Cap (nach oben)
            indices.push(bi(i, j), bi(i + 1, j), bi(i, j + 1), bi(i, j + 1), bi(i + 1, j), bi(i + 1, j + 1));
            indices.push(ti(i, j), ti(i, j + 1), ti(i + 1, j), ti(i + 1, j), ti(i, j + 1), ti(i + 1, j + 1));
        }
    }
    // Seitenwände am Frame-Umfang (Material ist DoubleSide → Wicklung egal)
    const wall = (aI, aJ, bI, bJ) =>
        indices.push(bi(aI, aJ), ti(aI, aJ), bi(bI, bJ), bi(bI, bJ), ti(aI, aJ), ti(bI, bJ));
    for (let j = 0; j < nSpan - 1; j++) { wall(0, j, 0, j + 1); wall(nCross - 1, j, nCross - 1, j + 1); }
    for (let i = 0; i < nCross - 1; i++) { wall(i, 0, i + 1, 0); wall(i, nSpan - 1, i + 1, nSpan - 1); }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
}

/** Kopf-Höhe einer Pfeiler-Box an (u,v): zTop (editierbar) oder Soffitte; geklemmt [Boden, Deck]. */
function pierTopZ(lattice, pier, u, v, floorZ) {
    const soffit = sampleSheet(lattice, lattice.bottomZ, u, v);
    const deck = sampleSheet(lattice, lattice.topZ, u, v);
    const top = (pier.zTop == null) ? soffit : pier.zTop;
    return Math.max(floorZ + 0.1, Math.min(top, deck));
}

/** Editor-Raster-Header (Zellzentren) aus einem Terrain-Grid, falls gridData da ist. */
function headerOf(grid) {
    if (!grid?.gridData || grid.ncols == null) return null;
    return {
        ncols: grid.ncols, nrows: grid.nrows, cellsize: grid.cellsize,
        xll: grid.center.x - (grid.ncols - 1) * grid.cellsize / 2,
        yll: grid.center.y - (grid.nrows - 1) * grid.cellsize / 2,
    };
}

/** Geländehöhe unter den Polygon-Eckpunkten (Minimum; sonst grid.minZ). */
function pierFloorZ(world, grid, hdr) {
    let floorZ = Infinity;
    if (hdr) for (const w of world) {
        const tz = sampleGridZ(hdr, grid.gridData, w.x, w.y);
        if (tz != null && tz < floorZ) floorZ = tz;
    }
    return Number.isFinite(floorZ) ? floorZ : grid.minZ;
}

/**
 * Solide Pfeilerkörper (lattice.piers) als Prismen über dem editierbaren Polygon
 * (p.poly in u,v) von der Geländehöhe bis zum Kopf (zTop/Soffitte). Senkrechte
 * Wände — die Soffit-/Deck-Sheets bleiben unberührt (kein „Einbrechen").
 * @returns {THREE.BufferGeometry|null}
 */
export function buildPierGeometry(bridge, grid) {
    const { lattice } = bridge;
    const piers = lattice?.piers || [];
    if (!piers.length || !grid?.center) return null;

    const hdr = headerOf(grid);
    const positions = [];
    const indices = [];
    let base = 0;

    for (const p of piers) {
        if (!p.poly || p.poly.length < 3) continue;
        const n = p.poly.length;
        const world = p.poly.map(c => uvToWorld(lattice, c.u, c.v));
        const floorZ = pierFloorZ(world, grid, hdr);
        // Boden-Ring (0..n-1) auf Geländehöhe
        for (let k = 0; k < n; k++) {
            const lb = toLocal(grid, world[k].x, world[k].y, floorZ);
            positions.push(lb.x, lb.y, lb.z);
        }
        // Kopf-Ring (n..2n-1): zTop oder bündig an die Soffitte (gegen Z-Fighting polygonOffset)
        for (let k = 0; k < n; k++) {
            const c = p.poly[k];
            const lt = toLocal(grid, world[k].x, world[k].y, pierTopZ(lattice, p, c.u, c.v, floorZ));
            positions.push(lt.x, lt.y, lt.z);
        }
        // Caps via Triangulation in Frame-Metrik (konvex/konkav-tauglich)
        const contour = p.poly.map(c => new THREE.Vector2(c.u * lattice.spanLen, c.v * lattice.crossLen));
        const tris = THREE.ShapeUtils.triangulateShape(contour, []);
        for (const [a, b, c] of tris) {
            indices.push(base + a, base + c, base + b);           // Boden (nach unten)
            indices.push(base + n + a, base + n + b, base + n + c); // Kopf (nach oben)
        }
        for (let k = 0; k < n; k++) {                              // Wände
            const j = (k + 1) % n;
            indices.push(base + k, base + j, base + n + j, base + k, base + n + j, base + n + k);
        }
        base += 2 * n;
    }

    if (!positions.length) return null;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
}

/**
 * Greifpunkte eines Pfeiler-Polygons (für useControlPointEditor): eine Ecke je
 * Polygonpunkt (horizontal ziehbar, key 'pier:cK') + ein Kopf-Handle am
 * Schwerpunkt (Höhe, key 'pier:top').
 * @returns {Array<{key:string, axes:'XY'|'Z', pos:THREE.Vector3}>}
 */
export function pierHandlePositions(bridge, grid, index) {
    const { lattice } = bridge;
    const p = lattice?.piers?.[index];
    if (!p?.poly || !grid?.center) return [];
    const hdr = headerOf(grid);
    const world = p.poly.map(c => uvToWorld(lattice, c.u, c.v));
    const floorZ = pierFloorZ(world, grid, hdr);
    const out = [];
    for (let k = 0; k < p.poly.length; k++) {
        const c = p.poly[k];
        const topZ = pierTopZ(lattice, p, c.u, c.v, floorZ);
        out.push({ key: `pier:c${k}`, axes: 'XY', pos: toLocal(grid, world[k].x, world[k].y, (floorZ + topZ) / 2) });
    }
    const cu = p.poly.reduce((s, c) => s + c.u, 0) / p.poly.length;
    const cv = p.poly.reduce((s, c) => s + c.v, 0) / p.poly.length;
    const cw = uvToWorld(lattice, cu, cv);
    out.push({ key: 'pier:top', axes: 'Z', pos: toLocal(grid, cw.x, cw.y, pierTopZ(lattice, p, cu, cv, floorZ)) });
    return out;
}

/**
 * Mittellinie/-ebene eines Pfeilers: die längs-zentrale Achse bei u = uc
 * (Schwerpunkt-u), über die v-Spanne des Polygons, von der Geländehöhe bis zum
 * Kopf. Bezug für die Bemaßung beim Ecken-Ziehen + dauerhafte gelbe Ebene.
 * @returns {{uc:number, planeCorners:THREE.Vector3[]}|null}
 */
export function pierCenterInfo(bridge, grid, index) {
    const { lattice } = bridge;
    const p = lattice?.piers?.[index];
    if (!p?.poly || !grid?.center) return null;
    const us = p.poly.map(c => c.u), vs = p.poly.map(c => c.v);
    const uc = us.reduce((a, b) => a + b, 0) / us.length;
    const vMin = Math.min(...vs), vMax = Math.max(...vs), vc = (vMin + vMax) / 2;
    const world = p.poly.map(c => uvToWorld(lattice, c.u, c.v));
    const floorZ = pierFloorZ(world, grid, headerOf(grid));
    const topZ = pierTopZ(lattice, p, uc, vc, floorZ);
    const a0 = uvToWorld(lattice, uc, vMin), a1 = uvToWorld(lattice, uc, vMax);
    const planeCorners = [
        toLocal(grid, a0.x, a0.y, floorZ),
        toLocal(grid, a1.x, a1.y, floorZ),
        toLocal(grid, a1.x, a1.y, topZ),
        toLocal(grid, a0.x, a0.y, topZ),
    ];
    return { uc, vMin, vMax, floorZ, topZ, planeCorners };
}

/** Vertikale Mittel-Ebene des Pfeilers (Quad) als BufferGeometry, terrain-lokal. */
export function buildPierCenterPlane(bridge, grid, index) {
    const info = pierCenterInfo(bridge, grid, index);
    if (!info) return null;
    const c = info.planeCorners;
    const positions = new Float32Array([
        c[0].x, c[0].y, c[0].z, c[1].x, c[1].y, c[1].z, c[2].x, c[2].y, c[2].z,
        c[0].x, c[0].y, c[0].z, c[2].x, c[2].y, c[2].z, c[3].x, c[3].y, c[3].z,
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
}

/**
 * Kantenlinien der Pfeiler-Prismen (Boden-Ring + Kopf-Ring + Vertikalen) als
 * LineSegments-Positionen — derselbe Wireframe-Stil wie der Brückenkörper.
 * @returns {Float32Array|null}
 */
export function buildPierWireframe(bridge, grid) {
    const { lattice } = bridge;
    const piers = lattice?.piers || [];
    if (!piers.length || !grid?.center) return null;

    const hdr = headerOf(grid);
    const segs = [];
    const push = (a, b) => segs.push(a.x, a.y, a.z, b.x, b.y, b.z);

    for (const p of piers) {
        if (!p.poly || p.poly.length < 2) continue;
        const n = p.poly.length;
        const world = p.poly.map(c => uvToWorld(lattice, c.u, c.v));
        const floorZ = pierFloorZ(world, grid, hdr);
        const floor = world.map(w => toLocal(grid, w.x, w.y, floorZ));
        const top = p.poly.map((c, k) => toLocal(grid, world[k].x, world[k].y, pierTopZ(lattice, p, c.u, c.v, floorZ)));
        for (let k = 0; k < n; k++) {
            const j = (k + 1) % n;
            push(floor[k], floor[j]); // Boden-Ring
            push(top[k], top[j]);     // Kopf-Ring
            push(floor[k], top[k]);   // Vertikale
        }
    }
    return new Float32Array(segs);
}

/**
 * Kontrollkäfig als LineSegments-Positionen: Querlinien an jeder Station
 * (beide Sheets), Längskanten an v=0/1 und Vertikalen an jedem Lattice-Knoten.
 * @returns {Float32Array|null}
 */
export function buildLatticeWireframe(bridge, grid) {
    const { lattice } = bridge;
    if (!lattice || !grid?.center) return null;

    const segs = [];
    const push = (x1, y1, z1, x2, y2, z2) => {
        const a = toLocal(grid, x1, y1, z1), b = toLocal(grid, x2, y2, z2);
        segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
    };
    const nodeWorld = (j, i, sheet) => {
        const v = vAtRow(lattice, i);
        const w = uvToWorld(lattice, lattice.u[j], v);
        const z = sampleSheet(lattice, sheet, lattice.u[j], v);
        return { ...w, z };
    };

    for (let j = 0; j < lattice.nSpan; j++) {
        for (const sheet of [lattice.bottomZ, lattice.topZ]) {
            for (let i = 0; i < lattice.nCross - 1; i++) {
                const a = nodeWorld(j, i, sheet), b = nodeWorld(j, i + 1, sheet);
                push(a.x, a.y, a.z, b.x, b.y, b.z); // Querlinie an Station j
            }
        }
        for (let i = 0; i < lattice.nCross; i++) {
            const a = nodeWorld(j, i, lattice.bottomZ), b = nodeWorld(j, i, lattice.topZ);
            push(a.x, a.y, a.z, b.x, b.y, b.z);     // Vertikale am Knoten
        }
    }
    for (let j = 0; j < lattice.nSpan - 1; j++) {
        for (let i = 0; i < lattice.nCross; i++) {
            for (const sheet of [lattice.bottomZ, lattice.topZ]) {
                const a = nodeWorld(j, i, sheet), b = nodeWorld(j + 1, i, sheet);
                push(a.x, a.y, a.z, b.x, b.y, b.z); // Längskante
            }
        }
    }
    return new Float32Array(segs);
}

/**
 * Anker der Vertex-Handles: ein Knoten pro Lattice-Position und Sheet.
 * key-Format 'b:i:j' / 't:i:j' (i = Querreihe, j = Station).
 * @returns {Array<{key:string, sheet:'b'|'t', i:number, j:number, pos:THREE.Vector3}>}
 */
export function latticeNodeWorldPositions(bridge, grid) {
    const { lattice } = bridge;
    if (!lattice || !grid?.center) return [];

    const nodes = [];
    for (let i = 0; i < lattice.nCross; i++) {
        const v = vAtRow(lattice, i);
        for (let j = 0; j < lattice.nSpan; j++) {
            const w = uvToWorld(lattice, lattice.u[j], v);
            for (const [sheetKey, sheet] of [['b', lattice.bottomZ], ['t', lattice.topZ]]) {
                const z = sheet[i][j];
                nodes.push({
                    key: `${sheetKey}:${i}:${j}`,
                    sheet: sheetKey, i, j,
                    pos: toLocal(grid, w.x, w.y, z),
                });
            }
        }
    }
    return nodes;
}

/**
 * Loop-Cut-Vorschau: Querlinien bei u auf beiden Sheets (+ Vertikalen).
 * @returns {Float32Array|null} LineSegments-Positionen
 */
export function buildCutPreview(bridge, grid, u) {
    const { lattice } = bridge;
    if (!lattice || !grid?.center || u == null) return null;

    const segs = [];
    const at = (v, sheet) => {
        const w = uvToWorld(lattice, u, v);
        return toLocal(grid, w.x, w.y, sampleSheet(lattice, sheet, u, v));
    };
    for (const sheet of [lattice.bottomZ, lattice.topZ]) {
        const a = at(0, sheet), b = at(1, sheet);
        segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (const v of [0, 1]) {
        const a = at(v, lattice.bottomZ), b = at(v, lattice.topZ);
        segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    return new Float32Array(segs);
}

/**
 * Quer-Loop-Cut-Vorschau: Längslinien bei fester Querposition v entlang u
 * (auf beiden Sheets) + Vertikalen an den Enden.
 * @returns {Float32Array|null}
 */
export function buildCutPreviewV(bridge, grid, v) {
    const { lattice } = bridge;
    if (!lattice || !grid?.center || v == null) return null;
    const segs = [];
    const at = (u, sheet) => {
        const w = uvToWorld(lattice, u, v);
        return toLocal(grid, w.x, w.y, sampleSheet(lattice, sheet, u, v));
    };
    const us = lattice.u;
    for (const sheet of [lattice.bottomZ, lattice.topZ]) {
        for (let j = 0; j < us.length - 1; j++) {
            const a = at(us[j], sheet), b = at(us[j + 1], sheet);
            segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
    }
    for (const u of [0, 1]) {
        const a = at(u, lattice.bottomZ), b = at(u, lattice.topZ);
        segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    return new Float32Array(segs);
}
