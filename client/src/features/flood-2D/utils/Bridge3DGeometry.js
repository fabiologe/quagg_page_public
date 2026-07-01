import * as THREE from 'three';
import { uvToWorld, worldToUV, sampleSheet, sampleGridZ, latticeToCells, isPointInPolygon, makeHeightSampler, hasVertexHeights } from './BridgeMeshLattice.js';

/** Punkt-zu-Segment-Abstand (für die Rand-Toleranz von inPoly). */
function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Liegt die Welt-(x,y) im Footprint-Polygon? (Kein Polygon → immer true = kein Clipping.)
 * WICHTIG: mit Rand-TOLERANZ — bei einer Rechteck-Brücke liegen die Lattice-Knoten EXAKT auf
 * der Polygonkante, und isPointInPolygon ist für Randpunkte unzuverlässig (Strahl trifft Ecken).
 * Ohne Toleranz verschwänden dann alle Handles/Käfig-Segmente → Brücke nicht editierbar.
 */
function inPoly(poly, x, y) {
    if (!poly || poly.length < 3) return true;
    if (isPointInPolygon(x, y, poly)) return true;
    // Toleranz = kleiner Bruchteil der BBox-Diagonale: Knoten auf/nahe der Kante zählen als drin,
    // echte Außen-Ecken (z.B. Bounding-Rechteck-Ecke eines L) liegen weit weg und bleiben draußen.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const eps = Math.hypot(maxX - minX, maxY - minY) * 0.02;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (distToSeg(x, y, poly[j].x, poly[j].y, poly[i].x, poly[i].y) <= eps) return true;
    }
    return false;
}

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
    // Freiform: Body wird aus DENSELBEN Zellen gebaut, die der Solver nutzt → Anzeige = Gerechnetes.
    if (bridge.poly && bridge.poly.length >= 3) return buildCellBody(bridge, grid);
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

/** Editor-/Export-Raster-Header in Zellzentren-Konvention (xll = Zentrum von Spalte 0). */
function headerFromGrid(grid) {
    const cs = grid.cellsize;
    return {
        ncols: grid.ncols, nrows: grid.nrows, cellsize: cs,
        xll: grid.center.x - (grid.ncols - 1) * cs / 2,
        yll: grid.center.y - (grid.nrows - 1) * cs / 2,
    };
}

/**
 * Wasserdichtes Zell-Heightfield aus Solver-Zellen: geteilte Zell-Ecken (stetig, keine
 * Stufen/Lücken), Boden-Cap (`bottomZAt`) + Deckel-Cap (`topZAt`) + Randwände nur, wo die
 * Nachbarzelle fehlt (Polygon-/Pfeilerkante). Gemeinsame Basis für Brückenkörper
 * (Soffitte→Deck) UND Pfeiler-Körper (Gelände→Soffitte) → Anzeige = Solver-Diskretisierung.
 * @param {Function} bottomZAt (x,y)→z  untere Fläche
 * @param {Function} topZAt    (x,y)→z  obere Fläche
 */
function cellSolid(grid, header, cells, bottomZAt, topZAt) {
    if (!cells.length) return null;
    const cs = header.cellsize;
    const present = new Set(cells.map(c => `${c.col},${c.row}`));
    const positions = [];
    const vmap = new Map();
    const corner = (ci, ri, layer) => {
        const key = `${ci},${ri},${layer}`;
        let idx = vmap.get(key);
        if (idx !== undefined) return idx;
        const x = header.xll + (ci - 0.5) * cs;   // Welt-Koord der Zell-Ecke
        const y = header.yll + (ri - 0.5) * cs;
        const z = layer === 't' ? topZAt(x, y) : bottomZAt(x, y);
        const w = toLocal(grid, x, y, z);
        idx = positions.length / 3;
        positions.push(w.x, w.y, w.z);
        vmap.set(key, idx);
        return idx;
    };

    const indices = [];
    for (const c of cells) {
        const { col: co, row: ro } = c;
        // Deckel-Cap (oben) + Boden-Cap (unten, umgekehrte Wicklung)
        const t00 = corner(co, ro, 't'), t10 = corner(co + 1, ro, 't'), t11 = corner(co + 1, ro + 1, 't'), t01 = corner(co, ro + 1, 't');
        indices.push(t00, t10, t11, t00, t11, t01);
        const b00 = corner(co, ro, 'b'), b10 = corner(co + 1, ro, 'b'), b11 = corner(co + 1, ro + 1, 'b'), b01 = corner(co, ro + 1, 'b');
        indices.push(b00, b11, b10, b00, b01, b11);
        // Randwände nur dort, wo der Nachbar fehlt (Polygon-/Pfeilerkante)
        const wall = (ciA, riA, ciB, riB) => {
            const bA = corner(ciA, riA, 'b'), tA = corner(ciA, riA, 't');
            const bB = corner(ciB, riB, 'b'), tB = corner(ciB, riB, 't');
            indices.push(bA, tA, bB, bB, tA, tB);
        };
        if (!present.has(`${co},${ro - 1}`)) wall(co, ro, co + 1, ro);         // Süd
        if (!present.has(`${co},${ro + 1}`)) wall(co, ro + 1, co + 1, ro + 1); // Nord
        if (!present.has(`${co - 1},${ro}`)) wall(co, ro, co, ro + 1);         // West
        if (!present.has(`${co + 1},${ro}`)) wall(co + 1, ro, co + 1, ro + 1); // Ost
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
}

function buildCellBody(bridge, grid) {
    const { lattice } = bridge;
    if (!grid.cellsize || !grid.ncols) return null;
    const header = headerFromGrid(grid);
    // ALLE Zellen (auch Pfeilerzellen): der Deck-Slab (Soffitte→Deck) läuft DURCHGEHEND
    // über den Pfeiler — nicht ausstanzen. Der Pfeiler-Körper füllt darunter Gelände→Soffitte
    // (buildPierGeometry), trifft die Slab-Unterkante an der Soffitte. Solver-Export unberührt.
    const cells = latticeToCells(bridge, header, null);
    if (cells.length === 0) return null;

    // Höhen an den geteilten Zell-Ecken: per-Ecke-Modell (baryzentrisch) oder Lattice-Fallback.
    const vz = hasVertexHeights(bridge);
    const sSoffit = vz ? makeHeightSampler(bridge.poly, bridge.vsoffit) : null;
    const sDeck = vz ? makeHeightSampler(bridge.poly, bridge.vdeck) : null;
    const soffitAt = vz
        ? (x, y) => sSoffit.at(x, y)
        : (x, y) => { const { u, v } = worldToUV(lattice, x, y); return sampleSheet(lattice, lattice.bottomZ, u, v); };
    const deckAt = vz
        ? (x, y) => sDeck.at(x, y)
        : (x, y) => { const { u, v } = worldToUV(lattice, x, y); return sampleSheet(lattice, lattice.topZ, u, v); };
    // Brückenkörper: unten Soffitte, oben Deck.
    return cellSolid(grid, header, cells, soffitAt, deckAt);
}

/** Kopf-Höhe einer Pfeiler-Box: zTop (editierbar) oder Soffitte; geklemmt [Boden, Deck]. */
function pierTopZ(pier, soffit, deck, floorZ) {
    const top = (pier.zTop == null) ? soffit : pier.zTop;
    return Math.max(floorZ + 0.1, Math.min(top, deck));
}

/**
 * Pfeiler-Kopfhöhe an einer u/v-Stelle: Soffitte/Deck dort sampeln (Per-Ecke-MVC oder
 * Lattice-Sheet-Fallback) und via pierTopZ klemmen. Single Source für Körper, Wireframe,
 * Griffe und Mittel-Ebene (verhindert die frühere Signatur-Divergenz).
 */
function pierTopAtUV(bridge, p, u, v, floorZ) {
    const { lattice } = bridge;
    const w = uvToWorld(lattice, u, v);
    let soffit, deck;
    if (hasVertexHeights(bridge)) {
        soffit = makeHeightSampler(bridge.poly, bridge.vsoffit).at(w.x, w.y);
        deck = makeHeightSampler(bridge.poly, bridge.vdeck).at(w.x, w.y);
    } else {
        soffit = sampleSheet(lattice, lattice.bottomZ, u, v);
        deck = sampleSheet(lattice, lattice.topZ, u, v);
    }
    return pierTopZ(p, soffit, deck, floorZ);
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
 * Solider Pfeiler-Körper = die ECHTEN Solver-Pfeilerzellen (Footprint ∩ Band) als
 * Zell-Heightfield vom (flachen) Gelände-Boden bis zum Kopf (`pierTopZ` = Soffitte, respektiert
 * user-`zTop`). Baut auf `cellSolid` → automatisch ans Polygon geclippt, deckungsgleich mit der
 * Raster-Vorschau (rote Zellen) und füllt exakt das Loch, das `buildCellBody` an den
 * Pfeilerzellen lässt. Der editierbare u/v-Käfig (Box-Polygon) kommt separat aus
 * `buildPierWireframe`/`pierHandlePositions`.
 * @returns {THREE.BufferGeometry|null}
 */
export function buildPierGeometry(bridge, grid) {
    const { lattice } = bridge;
    const piers = lattice?.piers || [];
    if (!piers.length || !grid?.center || !grid.cellsize || !grid.ncols) return null;

    const header = headerFromGrid(grid);
    const pierCells = latticeToCells(bridge, header, null).filter(c => c.pier);
    if (pierCells.length === 0) return null;

    // Soffitte/Deck am Punkt (Per-Ecke-MVC oder Lattice-Fallback).
    const vz = hasVertexHeights(bridge);
    const sSoffit = vz ? makeHeightSampler(bridge.poly, bridge.vsoffit) : null;
    const sDeck = vz ? makeHeightSampler(bridge.poly, bridge.vdeck) : null;
    const soffitAt = vz
        ? (x, y) => sSoffit.at(x, y)
        : (x, y) => { const { u, v } = worldToUV(lattice, x, y); return sampleSheet(lattice, lattice.bottomZ, u, v); };
    const deckAt = vz
        ? (x, y) => sDeck.at(x, y)
        : (x, y) => { const { u, v } = worldToUV(lattice, x, y); return sampleSheet(lattice, lattice.topZ, u, v); };

    // Flacher Boden = min Gelände unter den Pfeilerzellen (saubere Basis, wie zuvor).
    let floorZ = Infinity;
    for (const c of pierCells) {
        const tz = sampleGridZ(header, grid.gridData, c.x, c.y);
        if (tz != null && tz < floorZ) floorZ = tz;
    }
    if (!Number.isFinite(floorZ)) floorZ = grid.minZ;

    // Kopf = pierTopZ des Pfeilers, in dem der Punkt liegt (respektiert zTop je Pfeiler);
    // am Rand (kein Treffer) → Soffitte.
    const pierAt = (x, y) => {
        const { u, v } = worldToUV(lattice, x, y);
        for (const p of piers) {
            if (p.poly && isPointInPolygon(u, v, p.poly.map(c => ({ x: c.u, y: c.v })))) return p;
        }
        return {};
    };
    const bottomAt = () => floorZ;
    const topZAt = (x, y) => pierTopZ(pierAt(x, y), soffitAt(x, y), deckAt(x, y), floorZ);

    return cellSolid(grid, header, pierCells, bottomAt, topZAt);
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
        const topZ = pierTopAtUV(bridge, p, c.u, c.v, floorZ);
        out.push({ key: `pier:c${k}`, axes: 'XY', pos: toLocal(grid, world[k].x, world[k].y, (floorZ + topZ) / 2) });
    }
    const cu = p.poly.reduce((s, c) => s + c.u, 0) / p.poly.length;
    const cv = p.poly.reduce((s, c) => s + c.v, 0) / p.poly.length;
    const cw = uvToWorld(lattice, cu, cv);
    out.push({ key: 'pier:top', axes: 'Z', pos: toLocal(grid, cw.x, cw.y, pierTopAtUV(bridge, p, cu, cv, floorZ)) });
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
    const topZ = pierTopAtUV(bridge, p, uc, vc, floorZ);
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
        const top = p.poly.map((c, k) => toLocal(grid, world[k].x, world[k].y, pierTopAtUV(bridge, p, c.u, c.v, floorZ)));
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

    // Polygon-Brücke: Käfig folgt dem Umriss. Per-Ecke-Höhen direkt (Soffitte-Ring unten,
    // Deck-Ring oben, Vertikale je Ecke). Jede Ecke ist ein ziehbarer Höhen-Greifpunkt.
    const poly = bridge.poly;
    if (poly && poly.length >= 3) {
        const vz = hasVertexHeights(bridge);
        const zb = (k, p) => vz ? bridge.vsoffit[k] : (() => { const { u, v } = worldToUV(lattice, p.x, p.y); return sampleSheet(lattice, lattice.bottomZ, u, v); })();
        const zt = (k, p) => vz ? bridge.vdeck[k] : (() => { const { u, v } = worldToUV(lattice, p.x, p.y); return sampleSheet(lattice, lattice.topZ, u, v); })();
        const n = poly.length;
        for (let k = 0; k < n; k++) {
            const a = poly[k], b = poly[(k + 1) % n], kb = (k + 1) % n;
            push(a.x, a.y, zb(k, a), b.x, b.y, zb(kb, b)); // Soffitte-Ring
            push(a.x, a.y, zt(k, a), b.x, b.y, zt(kb, b)); // Deck-Ring
            push(a.x, a.y, zb(k, a), a.x, a.y, zt(k, a));  // Vertikale je Ecke
        }
        return new Float32Array(segs);
    }

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
 * Anker der Höhen-Handles. Per-Ecke-Modell: ein Boden- (`b:k`) und ein Deck-Griff (`t:k`)
 * je Polygon-Ecke, exakt auf der Ecke. Fallback (Alt-Brücke ohne vsoffit): Lattice-Knoten
 * `b:i:j`/`t:i:j`.
 * @returns {Array<{key:string, sheet:'b'|'t', pos:THREE.Vector3}>}
 */
export function latticeNodeWorldPositions(bridge, grid) {
    const { lattice } = bridge;
    if (!lattice || !grid?.center) return [];

    // Per-Ecke: eine ziehbare Höhen-Kugel an JEDER Polygon-Ecke (Boden + Deck).
    if (hasVertexHeights(bridge)) {
        const nodes = [];
        bridge.poly.forEach((p, k) => {
            nodes.push({ key: `b:${k}`, sheet: 'b', k, pos: toLocal(grid, p.x, p.y, bridge.vsoffit[k]) });
            nodes.push({ key: `t:${k}`, sheet: 't', k, pos: toLocal(grid, p.x, p.y, bridge.vdeck[k]) });
        });
        return nodes;
    }

    // Fallback: alle Lattice-Knoten als Handles.
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

    const poly = bridge.poly;
    const segs = [];
    const at = (v, sheet) => {
        const w = uvToWorld(lattice, u, v);
        return toLocal(grid, w.x, w.y, sampleSheet(lattice, sheet, u, v));
    };
    if (poly && poly.length >= 3) {
        // Schnittlinie (konstantes u) auf das Polygon-Intervall beschränken (Sampling-Clipping).
        const N = 48;
        for (const sheet of [lattice.bottomZ, lattice.topZ]) {
            for (let k = 0; k < N; k++) {
                const v0 = k / N, v1 = (k + 1) / N;
                const wm = uvToWorld(lattice, u, (v0 + v1) / 2);
                if (!inPoly(poly, wm.x, wm.y)) continue;
                const a = at(v0, sheet), b = at(v1, sheet);
                segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
            }
        }
        return new Float32Array(segs);
    }
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
    const poly = bridge.poly;
    const segs = [];
    const at = (u, sheet) => {
        const w = uvToWorld(lattice, u, v);
        return toLocal(grid, w.x, w.y, sampleSheet(lattice, sheet, u, v));
    };
    if (poly && poly.length >= 3) {
        // Schnittlinie (konstantes v) auf das Polygon-Intervall entlang u beschränken.
        const N = 48;
        for (const sheet of [lattice.bottomZ, lattice.topZ]) {
            for (let k = 0; k < N; k++) {
                const u0 = k / N, u1 = (k + 1) / N;
                const wm = uvToWorld(lattice, (u0 + u1) / 2, v);
                if (!inPoly(poly, wm.x, wm.y)) continue;
                const a = at(u0, sheet), b = at(u1, sheet);
                segs.push(a.x, a.y, a.z, b.x, b.y, b.z);
            }
        }
        return new Float32Array(segs);
    }
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
