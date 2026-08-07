/**
 * MeshOps — reine Mesh-Analysen für den GeometryResolver (Sprint G, AP1).
 *
 *   - meshVolume:         Divergenzsatz + Geschlossenheits-Prüfung („Volume-Truth")
 *   - principalDirection: Hauptrichtung via PCA (Power-Iteration)
 *   - skeletonAxis:       Achs-Skelettierung (Scheiben-Zentroide) für Rohre
 *                         OHNE Axis-Repräsentation
 *   - profileAtStation:   Querschnitt senkrecht zur Achse + DN-Schätzung
 *   - meshAreas:          Flächen-Kennwerte (Oberfläche, Grundfläche,
 *                         geneigt/flach), Höhen, Schwerpunkt
 *
 * Alles ohne DOM/WASM/THREE — nur Zahlenrechnen auf Float64Arrays
 * (Eingabeformat: 9 Werte je Dreieck, Welt, wie MeshAcquire).
 */

import { chainSegmentsToPolygons } from '../SectionContour.js';

const DEG = 180 / Math.PI;

// ── Volumen + Geschlossenheit ───────────────────────────────────────────────

/**
 * Volumen per Divergenzsatz: V = |Σ dot(a, cross(b, c)) / 6|.
 * Der Betrag am Ende macht das Ergebnis unabhängig von der (bei IFC-
 * Tessellationen nicht garantierten) Orientierung — vorausgesetzt sie ist
 * KONSISTENT; bei gemischter Orientierung warnt der Geschlossenheits-Check.
 *
 * Geschlossen ⇔ jede (dedupliziertes-Vertex-)Kante kommt genau 1× vorwärts
 * und 1× rückwärts vor. Randkanten (Löcher) → closed:false + Warnung,
 * Volumen bleibt Best-Effort.
 *
 * @returns {{ volume: number, closed: boolean, boundaryEdgeCount: number,
 *             warnings: string[] }}
 */
export function meshVolume(positions, triCount, opts = {}) {
    const snapEps = opts.snapEps ?? 0.001;
    const warnings = [];
    if (!positions?.length || !triCount) {
        return { volume: 0, closed: false, boundaryEdgeCount: 0, warnings: ['mesh_leer'] };
    }

    // Vertex-Dedup (1-mm-Quantisierung, Muster SlopeHatch)
    const { vertId, nVerts } = dedupVertices(positions, triCount, snapEps);

    // Signiertes Volumen + Kanten-Paarung
    let vol6 = 0;
    const edges = new Map(); // key(min*nVerts+max) → {fwd, rev}
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
        const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
        const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
        // dot(a, cross(b, c))
        vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);

        const va = vertId[t * 3], vb = vertId[t * 3 + 1], vc = vertId[t * 3 + 2];
        for (const [u, w] of [[va, vb], [vb, vc], [vc, va]]) {
            if (u === w) continue;
            const key = u < w ? u * nVerts + w : w * nVerts + u;
            const rec = edges.get(key) ?? { fwd: 0, rev: 0 };
            if (u < w) rec.fwd++; else rec.rev++;
            edges.set(key, rec);
        }
    }

    let boundaryEdgeCount = 0;
    let nonManifold = 0;
    for (const rec of edges.values()) {
        const total = rec.fwd + rec.rev;
        if (total === 2 && rec.fwd === 1 && rec.rev === 1) continue; // sauber gepaart
        if (total === 1) boundaryEdgeCount++;
        else nonManifold++; // 2× gleiche Richtung oder >2 Anlieger
    }
    const closed = boundaryEdgeCount === 0 && nonManifold === 0;
    if (boundaryEdgeCount) warnings.push(`mesh_offen: ${boundaryEdgeCount} Randkanten — Volumen unsicher`);
    if (nonManifold) warnings.push(`mesh_nicht_mannigfaltig: ${nonManifold} Kanten`);

    return { volume: Math.abs(vol6 / 6), closed, boundaryEdgeCount, warnings };
}

/** Vertex-Dedup mit Quantisierung — geteilt von Volumen/PCA. */
export function dedupVertices(positions, triCount, snapEps = 0.001) {
    const map = new Map();
    const vertId = new Int32Array(triCount * 3);
    const vx = [], vy = [], vz = [];
    const q = (v) => Math.round(v / snapEps);
    for (let i = 0; i < triCount * 3; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        const k = `${q(x)}_${q(y)}_${q(z)}`;
        let id = map.get(k);
        if (id === undefined) {
            id = vx.length;
            map.set(k, id);
            vx.push(x); vy.push(y); vz.push(z);
        }
        vertId[i] = id;
    }
    return { vertId, nVerts: vx.length, vx, vy, vz };
}

// ── Hauptrichtung (PCA) ─────────────────────────────────────────────────────

/**
 * Größter Eigenvektor der Vertex-Kovarianz via Power-Iteration.
 * Startvektor = längste BBox-Achse; λ1 ≈ λ2 → Warnung + BBox-Fallback.
 *
 * @returns {{ dir: [x,y,z], centroid: [x,y,z], spread: number, warnings: string[] }}
 */
export function principalDirection(positions, triCount, opts = {}) {
    const warnings = [];
    const { vx, vy, vz, nVerts } = dedupVertices(positions, triCount, opts.snapEps ?? 0.001);
    if (nVerts < 3) return { dir: [1, 0, 0], centroid: [0, 0, 0], spread: 0, warnings: ['zu_wenig_vertices'] };

    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < nVerts; i++) { mx += vx[i]; my += vy[i]; mz += vz[i]; }
    mx /= nVerts; my /= nVerts; mz /= nVerts;

    // Kovarianzmatrix (symmetrisch, 6 Einträge)
    let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < nVerts; i++) {
        const dx = vx[i] - mx, dy = vy[i] - my, dz = vz[i] - mz;
        cxx += dx * dx; cxy += dx * dy; cxz += dx * dz;
        cyy += dy * dy; cyz += dy * dz; czz += dz * dz;
        if (vx[i] < minX) minX = vx[i]; if (vx[i] > maxX) maxX = vx[i];
        if (vy[i] < minY) minY = vy[i]; if (vy[i] > maxY) maxY = vy[i];
        if (vz[i] < minZ) minZ = vz[i]; if (vz[i] > maxZ) maxZ = vz[i];
    }

    const mul = ([x, y, z]) => [
        cxx * x + cxy * y + cxz * z,
        cxy * x + cyy * y + cyz * z,
        cxz * x + cyz * y + czz * z,
    ];
    const norm = (v) => {
        const l = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / l, v[1] / l, v[2] / l];
    };

    // Start = längste BBox-Achse
    const spans = [maxX - minX, maxY - minY, maxZ - minZ];
    const bboxDir = [[1, 0, 0], [0, 1, 0], [0, 0, 1]][spans.indexOf(Math.max(...spans))];

    let v = bboxDir.slice();
    let lambda1 = 0;
    for (let it = 0; it < 64; it++) {
        const w = mul(v);
        const l = Math.hypot(w[0], w[1], w[2]);
        if (l < 1e-15) break;
        const next = [w[0] / l, w[1] / l, w[2] / l];
        const delta = Math.abs(1 - Math.abs(next[0] * v[0] + next[1] * v[1] + next[2] * v[2]));
        v = next;
        lambda1 = l;
        if (delta < 1e-9) break;
    }

    // λ2 via Deflation für den Eindeutigkeits-Check
    const defl = ([x, y, z]) => {
        const d = x * v[0] + y * v[1] + z * v[2];
        return [x - d * v[0], y - d * v[1], z - d * v[2]];
    };
    let u = norm(defl(bboxDir[0] === 1 ? [0, 1, 0] : [1, 0, 0]));
    let lambda2 = 0;
    for (let it = 0; it < 32; it++) {
        const w = defl(mul(u));
        const l = Math.hypot(w[0], w[1], w[2]);
        if (l < 1e-15) break;
        u = [w[0] / l, w[1] / l, w[2] / l];
        lambda2 = l;
    }

    const spread = lambda2 > 0 ? lambda1 / lambda2 : Infinity;
    if (spread < 1.5) {
        warnings.push('hauptrichtung_uneindeutig');
        v = bboxDir;
    }
    return { dir: norm(v), centroid: [mx, my, mz], spread, warnings };
}

// ── 3D-Schnitt (Ebene beliebiger Orientierung) ──────────────────────────────

/**
 * Dreieck ∩ Ebene {n·p = d} → 3D-Segment [ax,ay,az,bx,by,bz] oder null.
 * (SectionContour.trianglePlaneIntersect projiziert auf XZ — hier bleiben
 * die vollen 3D-Punkte erhalten, nötig für Skelett/Querschnitt.)
 */
export function trianglePlaneIntersect3D(nx, ny, nz, d, positions, triOffset) {
    const o = triOffset;
    const pts = [];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const ax = positions[o + i * 3], ay = positions[o + i * 3 + 1], az = positions[o + i * 3 + 2];
        const bx = positions[o + j * 3], by = positions[o + j * 3 + 1], bz = positions[o + j * 3 + 2];
        const da = nx * ax + ny * ay + nz * az - d;
        const db = nx * bx + ny * by + nz * bz - d;
        if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
            const s = da / (da - db);
            pts.push([ax + s * (bx - ax), ay + s * (by - ay), az + s * (bz - az)]);
        }
    }
    if (pts.length < 2) return null;
    return [pts[0][0], pts[0][1], pts[0][2], pts[1][0], pts[1][1], pts[1][2]];
}

// ── Achs-Skelettierung ──────────────────────────────────────────────────────

/**
 * Skelett-Achse eines länglichen Körpers (Rohr/Haltung ohne Axis-Rep):
 * Hauptrichtung → Scheiben senkrecht dazu → Zentroid je Scheibe
 * (längengewichtetes Mittel der Schnittsegment-Mittelpunkte — liegt bei
 * Hohlrohren korrekt auf der Achse) → 3D-RDP-Glättung.
 *
 * MVP: gerade Scheiben (Haltungen sind zwischen Schächten gerade; Bögen
 * werden von buildStrang aus kurzen Stücken gekettet). `adaptive` reserviert.
 *
 * @returns {{ polyline: Array<{x,y,z}>, warnings: string[] } | null}
 */
export function skeletonAxis(positions, triCount, opts = {}) {
    const slices = opts.slices ?? 32;
    const warnings = [];
    if (!positions?.length || triCount < 2) return null;

    const pca = principalDirection(positions, triCount, opts);
    warnings.push(...pca.warnings);
    const [dx, dy, dz] = pca.dir;

    // Projektionsbereich entlang der Achse
    let tMin = Infinity, tMax = -Infinity;
    for (let i = 0; i < triCount * 3; i++) {
        const t = positions[i * 3] * dx + positions[i * 3 + 1] * dy + positions[i * 3 + 2] * dz;
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
    }
    const span = tMax - tMin;
    if (span < 1e-6) return null;
    const pad = span * 0.02; // Endkappen meiden

    const centroids = [];
    for (let si = 0; si < slices; si++) {
        const d = tMin + pad + ((span - 2 * pad) * si) / Math.max(1, slices - 1);
        let sumX = 0, sumY = 0, sumZ = 0, sumW = 0;
        for (let t = 0; t < triCount; t++) {
            const seg = trianglePlaneIntersect3D(dx, dy, dz, d, positions, t * 9);
            if (!seg) continue;
            const w = Math.hypot(seg[3] - seg[0], seg[4] - seg[1], seg[5] - seg[2]);
            if (w < 1e-12) continue;
            sumX += ((seg[0] + seg[3]) / 2) * w;
            sumY += ((seg[1] + seg[4]) / 2) * w;
            sumZ += ((seg[2] + seg[5]) / 2) * w;
            sumW += w;
        }
        if (sumW > 1e-12) {
            centroids.push({ x: sumX / sumW, y: sumY / sumW, z: sumZ / sumW });
        }
    }
    if (centroids.length < 2) {
        return null;
    }
    if (centroids.length < slices * 0.5) warnings.push('skelett_lueckig');

    const eps = opts.simplifyEps ?? (span / slices) * 0.02;
    return { polyline: simplifyPolyline3d(centroids, eps), warnings };
}

/**
 * 3D-Ramer-Douglas-Peucker für offene Polylinien ({x,y,z}-Punkte).
 * (PolygonSimplify bleibt unangetastet — dessen Kern ist 2D-Ring-Semantik.)
 */
export function simplifyPolyline3d(pts, eps) {
    if (!pts || pts.length < 3 || eps <= 0) return pts ?? [];
    const keep = new Uint8Array(pts.length);
    keep[0] = 1; keep[pts.length - 1] = 1;

    const stack = [[0, pts.length - 1]];
    while (stack.length) {
        const [i0, i1] = stack.pop();
        const a = pts[i0], b = pts[i1];
        const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
        const abLen2 = abx * abx + aby * aby + abz * abz;
        let maxD = 0, maxI = -1;
        for (let i = i0 + 1; i < i1; i++) {
            const p = pts[i];
            let d;
            if (abLen2 < 1e-18) {
                d = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
            } else {
                // Abstand Punkt–Gerade via Kreuzprodukt
                const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
                const cx = apy * abz - apz * aby;
                const cy = apz * abx - apx * abz;
                const cz = apx * aby - apy * abx;
                d = Math.sqrt((cx * cx + cy * cy + cz * cz) / abLen2);
            }
            if (d > maxD) { maxD = d; maxI = i; }
        }
        if (maxD > eps && maxI > 0) {
            keep[maxI] = 1;
            stack.push([i0, maxI], [maxI, i1]);
        }
    }
    return pts.filter((_, i) => keep[i]);
}

// ── Querschnitt an einer Station ────────────────────────────────────────────

/** DN-Normreihe (mm) für die Rundung der Mesh-Schätzung. */
const DN_REIHE = [100, 125, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 2000];

/**
 * Querschnitt des Meshs senkrecht zur Achse an Station s.
 * @param {Array<{x,y,z}>} axisPolyline
 * @returns {{ rings: Array<Array<[u,v]>>, area: number,
 *             dnEstimate_mm: number|null, dnRaw_mm: number|null,
 *             warnings: string[] } | null}
 */
export function profileAtStation(positions, triCount, axisPolyline, s) {
    if (!axisPolyline || axisPolyline.length < 2) return null;
    const warnings = [];

    // Punkt + Tangente an Station s (2D-Bogenlänge wie Laengsschnitt.pointAt)
    let acc = 0, px = axisPolyline[0].x, py = axisPolyline[0].y, pz = axisPolyline[0].z;
    let tx = 1, ty = 0, tz = 0;
    for (let i = 0; i + 1 < axisPolyline.length; i++) {
        const a = axisPolyline[i], b = axisPolyline[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        if (len < 1e-12) continue;
        if (s <= acc + len || i + 2 === axisPolyline.length) {
            const t = Math.min(1, Math.max(0, (s - acc) / len));
            px = a.x + (b.x - a.x) * t; py = a.y + (b.y - a.y) * t; pz = a.z + (b.z - a.z) * t;
            tx = (b.x - a.x) / len; ty = (b.y - a.y) / len; tz = (b.z - a.z) / len;
            break;
        }
        acc += len;
    }

    // Ebenen-Basis (u,v) senkrecht zur Tangente; u = t × Welt-Y (Sonderfall vertikal)
    let ux = tz, uy = 0, uz = -tx; // t × (0,1,0)
    let ulen = Math.hypot(ux, uy, uz);
    if (ulen < 1e-6) { ux = 1; uy = 0; uz = 0; ulen = 1; } // Achse vertikal
    ux /= ulen; uy /= ulen; uz /= ulen;
    const vxn = ty * uz - tz * uy;
    const vyn = tz * ux - tx * uz;
    const vzn = tx * uy - ty * ux;

    const d = tx * px + ty * py + tz * pz;
    const segs = [];
    for (let t = 0; t < triCount; t++) {
        const seg = trianglePlaneIntersect3D(tx, ty, tz, d, positions, t * 9);
        if (!seg) continue;
        // in (u,v) projizieren — chainSegmentsToPolygons erwartet {x1,z1,x2,z2}
        const u1 = (seg[0] - px) * ux + (seg[1] - py) * uy + (seg[2] - pz) * uz;
        const v1 = (seg[0] - px) * vxn + (seg[1] - py) * vyn + (seg[2] - pz) * vzn;
        const u2 = (seg[3] - px) * ux + (seg[4] - py) * uy + (seg[5] - pz) * uz;
        const v2 = (seg[3] - px) * vxn + (seg[4] - py) * vyn + (seg[5] - pz) * vzn;
        segs.push({ x1: u1, z1: v1, x2: u2, z2: v2 });
    }
    if (!segs.length) return null;

    const rings = chainSegmentsToPolygons(segs).map(ring => ring.map(p => [p.x, p.z]));
    if (!rings.length) return { rings: [], area: 0, dnEstimate_mm: null, dnRaw_mm: null, warnings: ['profil_offen'] };

    // Ringflächen (Shoelace), sortiert — größter = außen, zweitgrößter = innen
    const areas = rings.map(_ringArea).sort((a, b) => b - a);
    let dnRaw = null;
    if (areas.length >= 2) {
        dnRaw = 2 * Math.sqrt(areas[1] / Math.PI) * 1000; // innerer Ring
    } else {
        dnRaw = 2 * Math.sqrt(areas[0] / Math.PI) * 1000;
        warnings.push('nur_aussenkontur');
    }
    // Auf Normreihe runden (±10 %), sonst Rohwert behalten
    let dnEstimate = null;
    for (const dn of DN_REIHE) {
        if (Math.abs(dnRaw - dn) / dn <= 0.1) { dnEstimate = dn; break; }
    }
    return { rings, area: areas[0], dnEstimate_mm: dnEstimate ?? Math.round(dnRaw), dnRaw_mm: dnRaw, warnings };
}

function _ringArea(ring) {
    let a = 0;
    for (let i = 0; i + 1 < ring.length; i++) {
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return Math.abs(a / 2);
}

// ── Flächen-/Lage-Kennwerte ─────────────────────────────────────────────────

/**
 * @returns {{ flaeche_ober, flaeche_grund, flaeche_geneigt, flaeche_flach,
 *             hoehe_ok, hoehe_uk, schwerpunkt: [x,y,z] }}
 */
export function meshAreas(positions, triCount, opts = {}) {
    const flatMaxDeg = opts.flatMaxDeg ?? 5;
    let ober = 0, grund = 0, geneigt = 0, flach = 0;
    let minY = Infinity, maxY = -Infinity;
    let sx = 0, sy = 0, sz = 0, sw = 0;

    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
        const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
        const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
        const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-12) continue;
        const area = len / 2;
        ober += area;
        if (ny / len > 0.05) {
            const projArea = Math.abs(ny) / 2; // XZ-Projektion
            grund += projArea;
            const slope = Math.acos(Math.min(1, Math.abs(ny) / len)) * DEG;
            if (slope <= flatMaxDeg) flach += projArea;
            else geneigt += projArea;
        }
        for (const y of [ay, by, cy]) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        // flächengewichteter Schwerpunkt
        sx += ((ax + bx + cx) / 3) * area;
        sy += ((ay + by + cy) / 3) * area;
        sz += ((az + bz + cz) / 3) * area;
        sw += area;
    }

    return {
        flaeche_ober: ober,
        flaeche_grund: grund,
        flaeche_geneigt: geneigt,
        flaeche_flach: flach,
        hoehe_ok: Number.isFinite(maxY) ? maxY : null,
        hoehe_uk: Number.isFinite(minY) ? minY : null,
        schwerpunkt: sw > 0 ? [sx / sw, sy / sw, sz / sw] : [0, 0, 0],
    };
}
