import * as THREE from 'three';
import { worldToUV, uvToWorld, sampleSheet } from './BridgeMeshLattice.js';

/**
 * Bridge3DGeometry — three.js-Geometrie für mesh3d-Brückenkörper.
 *
 * Baut aus Footprint + Lattice (siehe BridgeMeshLattice.js) eine indizierte
 * BufferGeometry in Terrain-lokalen Koordinaten: Boden-Cap (Soffitte),
 * Deckel-Cap (Deck) und Seitenwände. Der Footprint-Ring wird an jeder
 * Lattice-Station mit Schnittpunkten angereichert, damit Bogen-/Vouten-Profile
 * an den Stationen sichtbar knicken (zwischen Stationen ist die Fläche bilinear).
 */

/** GIS (UTM, absolut) → Terrain-lokal (Konvention von getLocalPos in useLayerRenderer). */
function toLocal(grid, x, y, z) {
    return new THREE.Vector3(
        x - grid.center.x,
        z - grid.minZ,
        -(y - grid.center.y)
    );
}

/**
 * Footprint-Ring mit Schnittpunkten an den inneren Lattice-Stationen anreichern.
 * u ist entlang jeder Polygonkante affin → lineare Interpolation der Schnittlage.
 * @returns {Array<{x,y,u,v}>} angereicherter Ring (Zeichenreihenfolge)
 */
function augmentRing(footprint, lattice) {
    const ring = footprint.map(p => ({ ...p, ...worldToUV(lattice, p.x, p.y) }));
    const innerU = lattice.u.slice(1, -1);
    if (innerU.length === 0) return ring;

    const out = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        out.push(a);
        const crossings = [];
        for (const uk of innerU) {
            const lo = Math.min(a.u, b.u), hi = Math.max(a.u, b.u);
            if (uk > lo + 1e-9 && uk < hi - 1e-9) {
                const t = (uk - a.u) / (b.u - a.u);
                crossings.push({
                    t,
                    x: a.x + t * (b.x - a.x),
                    y: a.y + t * (b.y - a.y),
                    u: uk,
                    v: a.v + t * (b.v - a.v),
                });
            }
        }
        crossings.sort((p, q) => p.t - q.t);
        out.push(...crossings);
    }
    return out;
}

/**
 * Volumenkörper aus Footprint + Lattice.
 * @param {object} bridge  mesh3d-Brücke ({footprint, lattice})
 * @param {object} grid    aktives Terrain-Grid ({center, minZ})
 * @returns {THREE.BufferGeometry|null} indiziert, Terrain-lokal
 */
export function buildBridge3DGeometry(bridge, grid) {
    const { footprint, lattice } = bridge;
    if (!footprint || footprint.length < 3 || !lattice || !grid?.center) return null;

    const ring = augmentRing(footprint, lattice);
    const n = ring.length;

    // Triangulation in Frame-Koordinaten (metrisch, kein Aspekt-Problem)
    const contour = ring.map(p => new THREE.Vector2(p.u * lattice.spanLen, p.v * lattice.crossLen));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    if (tris.length === 0) return null;

    // Vertices: [0..n) = Boden (Soffitte), [n..2n) = Deckel (Deck)
    const positions = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
        const p = ring[i];
        const zb = sampleSheet(lattice, lattice.bottomZ, p.u, p.v);
        const zt = sampleSheet(lattice, lattice.topZ, p.u, p.v);
        const lb = toLocal(grid, p.x, p.y, zb);
        const lt = toLocal(grid, p.x, p.y, zt);
        positions.set([lb.x, lb.y, lb.z], i * 3);
        positions.set([lt.x, lt.y, lt.z], (n + i) * 3);
    }

    const indices = [];
    for (const [a, b, c] of tris) {
        indices.push(a, c, b);                 // Boden (nach unten)
        indices.push(n + a, n + b, n + c);     // Deckel (nach oben)
    }
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        indices.push(i, j, n + j, i, n + j, n + i); // Seitenwand-Quad
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
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
        const v = i / (lattice.nCross - 1);
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
        const v = i / (lattice.nCross - 1);
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
