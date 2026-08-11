/**
 * SlopeHatch — Böschungsschraffur nach Ingenieurkonvention (Sprint T1).
 *
 * Aus einem Gelände-Dreiecksnetz (Welt-Koordinaten) wird die klassische
 * Lageplan-Darstellung abgeleitet:
 *   - Böschungs-OBERKANTE als kräftige Linie
 *   - von dort alternierend LANGE (bis zur Unterkante) und KURZE (halbe
 *     Länge) Striche senkrecht zur Kante, hangabwärts
 *   - Böschungs-UNTERKANTE als dünne Linie
 *
 * Algorithmus:
 *   1. Vertex-Dedup (1-mm-Quantisierung) + Kanten-Adjazenz (Integer-Keys)
 *   2. Neigung je Dreieck aus der Flächennormale; steil = [minSlopeDeg, maxSlopeDeg]
 *   3. Region-Growing über gemeinsame Kanten steiler Dreiecke
 *   4. Randkanten je Region klassifizieren: Oberkante / Unterkante / Seite
 *      (Schwerpunkt-Höhe des anliegenden Dreiecks vs. Kantenmittel-Höhe)
 *   5. Kanten zu offenen Polylinien verketten (chainSegmentsToPolylines)
 *   6. Sampling entlang der Oberkante im Papier-Abstand, Strahl hangabwärts
 *      gegen die Unterkanten → Strichlänge; gerader Index voll, ungerader halb
 *
 * Reines Modul: keine DOM/WASM/OBC-Abhängigkeit — Eingabe ist die Ausgabe von
 * TerrainMesh.collectCategoryTriangles (oder ein synthetisches Test-Mesh).
 */

import { chainSegmentsToPolylines } from './SectionContour.js';

const DEG = 180 / Math.PI;

/**
 * @param {Float64Array} positions  9 Werte je Dreieck (Welt: x,y,z × a,b,c)
 * @param {number} triCount
 * @param {object} opts
 * @param {number} [opts.minSlopeDeg=20]   ab hier gilt eine Fläche als Böschung
 * @param {number} [opts.maxSlopeDeg=88]   senkrechte Wände ausschließen
 * @param {number} [opts.tickSpacingWorld=1]  Strichabstand in Weltmetern
 *                                            (Exporter: 3 mm Papier × Maßstab)
 * @param {number} [opts.snapEps=0.001]    Vertex-Snap in Metern
 * @param {number} [opts.minRegionArea=0.5]  projizierte Mindestfläche (m²)
 * @param {number} [opts.maxTickLenWorld=Infinity]
 * @param {number} [opts.minTickLenWorld=0]  kürzere Striche verwerfen
 * @returns {{ segments: Array<{x1,z1,x2,z2, kind:'tick'|'tickHalf'|'oberkante'|'unterkante'}>,
 *             stats: { regions: number, ticks: number, steepTris: number } }}
 */
export function computeSlopeHatch(positions, triCount, opts = {}) {
    const {
        minSlopeDeg = 20,
        maxSlopeDeg = 88,
        tickSpacingWorld = 1,
        snapEps = 0.001,
        minRegionArea = 0.5,
        maxTickLenWorld = Infinity,
        minTickLenWorld = 0,
    } = opts;

    const segments = [];
    const stats = { regions: 0, ticks: 0, steepTris: 0 };
    if (!positions?.length || !triCount) return { segments, stats };

    // ── 1. Vertex-Dedup + Kanten-Adjazenz ──────────────────────────────────
    const vertKey = new Map();          // "qx_qy_qz" → vertId
    const vx = [], vy = [], vz = [];
    const vertId = new Int32Array(triCount * 3);
    const q = (v) => Math.round(v / snapEps);

    for (let i = 0; i < triCount * 3; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        const k = `${q(x)}_${q(y)}_${q(z)}`;
        let id = vertKey.get(k);
        if (id === undefined) {
            id = vx.length;
            vertKey.set(k, id);
            vx.push(x); vy.push(y); vz.push(z);
        }
        vertId[i] = id;
    }
    const nVerts = vx.length;

    // edgeMap: Kanten-Key (min*nVerts+max) → [triIdx, triIdx?]
    const edgeMap = new Map();
    const ek = (a, b) => (a < b ? a * nVerts + b : b * nVerts + a);
    for (let t = 0; t < triCount; t++) {
        const a = vertId[t * 3], b = vertId[t * 3 + 1], c = vertId[t * 3 + 2];
        for (const [u, w] of [[a, b], [b, c], [c, a]]) {
            if (u === w) continue; // degenerierte Kante nach Snap
            const k = ek(u, w);
            const arr = edgeMap.get(k);
            if (arr) arr.push(t);
            else edgeMap.set(k, [t]);
        }
    }

    // ── 2. Neigung + Gefällerichtung je Dreieck ────────────────────────────
    const steep = new Uint8Array(triCount);
    const downX = new Float64Array(triCount);  // horizontale Gefällerichtung
    const downZ = new Float64Array(triCount);
    const areaXZ = new Float64Array(triCount); // projizierte Fläche
    const centY = new Float64Array(triCount);

    for (let t = 0; t < triCount; t++) {
        const a = vertId[t * 3], b = vertId[t * 3 + 1], c = vertId[t * 3 + 2];
        const e1x = vx[b] - vx[a], e1y = vy[b] - vy[a], e1z = vz[b] - vz[a];
        const e2x = vx[c] - vx[a], e2y = vy[c] - vy[a], e2z = vz[c] - vz[a];
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-12) continue;
        const slope = Math.acos(Math.min(1, Math.abs(ny) / len)) * DEG;
        if (slope >= minSlopeDeg && slope <= maxSlopeDeg) {
            steep[t] = 1;
            stats.steepTris++;
            // Bergab = horizontale Projektion der (aufwärts zeigenden) Normale
            const s = ny >= 0 ? 1 : -1;
            const hx = s * nx, hz = s * nz;
            const hlen = Math.hypot(hx, hz) || 1;
            downX[t] = hx / hlen;
            downZ[t] = hz / hlen;
        }
        areaXZ[t] = Math.abs(ny) / 2; // |ny|/2 = auf XZ projizierte Dreiecksfläche
        centY[t] = (vy[a] + vy[b] + vy[c]) / 3;
    }

    // ── 3. Region-Growing (BFS über Kanten, beide Dreiecke steil) ──────────
    const region = new Int32Array(triCount).fill(-1);
    const triEdges = (t) => {
        const a = vertId[t * 3], b = vertId[t * 3 + 1], c = vertId[t * 3 + 2];
        return [[a, b], [b, c], [c, a]];
    };
    let regionCount = 0;
    const regionArea = [];
    for (let seed = 0; seed < triCount; seed++) {
        if (!steep[seed] || region[seed] !== -1) continue;
        const r = regionCount++;
        let area = 0;
        const stack = [seed];
        region[seed] = r;
        while (stack.length) {
            const t = stack.pop();
            area += areaXZ[t];
            for (const [u, w] of triEdges(t)) {
                if (u === w) continue;
                for (const nb of edgeMap.get(ek(u, w)) ?? []) {
                    if (nb !== t && steep[nb] && region[nb] === -1) {
                        region[nb] = r;
                        stack.push(nb);
                    }
                }
            }
        }
        regionArea.push(area);
    }

    // ── 4. Randkanten sammeln + klassifizieren ─────────────────────────────
    // Je Region: Kanten-Segmente {x1,y1,z1,x2,y2,z2} nach Klasse getrennt.
    const HEIGHT_EPS = 0.02;
    const COS45 = Math.SQRT1_2;
    const topSegs = [], bottomSegs = [];      // je Region ein Array
    for (let r = 0; r < regionCount; r++) { topSegs.push([]); bottomSegs.push([]); }
    // Bergab-Richtung je Kante (für Strich-Vorzeichen): Key → {dx, dz}
    const edgeDown = new Map();
    const edgePointKey = (x, z, eps) => `${Math.round(x / eps)},${Math.round(z / eps)}`;
    const CHAIN_EPS = 0.005;

    for (const [k, tris] of edgeMap) {
        // Randkante einer Region: genau EIN steiles Dreieck dieser Region anliegend
        let steepTri = -1, steepCount = 0;
        for (const t of tris) {
            if (steep[t] && region[t] !== -1) { steepTri = t; steepCount++; }
        }
        if (steepCount !== 1) continue;
        const r = region[steepTri];
        if (regionArea[r] < minRegionArea) continue;

        const u = Math.floor(k / nVerts), w = k % nVerts;
        const ex = vx[w] - vx[u], ez = vz[w] - vz[u];
        const elen = Math.hypot(ex, ez);
        if (elen < 1e-9) continue;                       // (fast) senkrechte Kante
        const dot = Math.abs((ex / elen) * downX[steepTri] + (ez / elen) * downZ[steepTri]);
        if (dot > COS45) continue;                       // Seitenkante — keine Striche

        const edgeMidY = (vy[u] + vy[w]) / 2;
        const seg = { x1: vx[u], y1: vy[u], z1: vz[u], x2: vx[w], y2: vy[w], z2: vz[w] };
        if (centY[steepTri] < edgeMidY - HEIGHT_EPS) {
            topSegs[r].push(seg);
            // Bergab-Richtung der Kante merken (für Strich-Vorzeichen beim Sampling)
            const mk = edgePointKey((seg.x1 + seg.x2) / 2, (seg.z1 + seg.z2) / 2, CHAIN_EPS);
            edgeDown.set(mk, { dx: downX[steepTri], dz: downZ[steepTri] });
        } else if (centY[steepTri] > edgeMidY + HEIGHT_EPS) {
            bottomSegs[r].push(seg);
        }
        // sonst: höhengleiche Kante → 'seite', ignorieren
    }

    // ── 5.+6. Verketten + Striche werfen ───────────────────────────────────
    for (let r = 0; r < regionCount; r++) {
        if (regionArea[r] < minRegionArea) continue;
        if (!topSegs[r].length) continue;
        stats.regions++;

        const topChains = chainSegmentsToPolylines(topSegs[r], CHAIN_EPS);
        const bottomChains = chainSegmentsToPolylines(bottomSegs[r], CHAIN_EPS);

        // Ober-/Unterkanten als Linien-Segmente ausgeben
        for (const chain of topChains) {
            for (let i = 0; i + 1 < chain.length; i++) {
                segments.push({ x1: chain[i].x, z1: chain[i].z, x2: chain[i + 1].x, z2: chain[i + 1].z, kind: 'oberkante' });
            }
        }
        const bottomFlat = [];
        for (const chain of bottomChains) {
            for (let i = 0; i + 1 < chain.length; i++) {
                const s = { x1: chain[i].x, z1: chain[i].z, x2: chain[i + 1].x, z2: chain[i + 1].z };
                bottomFlat.push(s);
                segments.push({ ...s, kind: 'unterkante' });
            }
        }

        // Striche: Sampling entlang jeder Oberkanten-Kette
        for (const chain of topChains) {
            const ticks = _sampleTicks(chain, tickSpacingWorld, edgeDown, edgePointKey, CHAIN_EPS);
            // 1. Pass: Längen via Strahl gegen Unterkanten
            for (const tick of ticks) {
                tick.len = _rayToSegments(tick.px, tick.pz, tick.dx, tick.dz, bottomFlat, maxTickLenWorld);
            }
            // 2. Pass: Fallback = Median der getroffenen Nachbarn
            const hitLens = ticks.filter(t => t.len != null).map(t => t.len).sort((a, b) => a - b);
            const median = hitLens.length ? hitLens[Math.floor(hitLens.length / 2)] : null;
            let idx = 0;
            for (const tick of ticks) {
                const L = tick.len ?? median;
                if (L == null) continue;                     // keine Referenz → weglassen
                const useLen = (idx % 2 === 0) ? L : L * 0.5;
                idx++;
                if (useLen < minTickLenWorld) continue;
                segments.push({
                    x1: tick.px, z1: tick.pz,
                    x2: tick.px + tick.dx * useLen,
                    z2: tick.pz + tick.dz * useLen,
                    kind: (idx - 1) % 2 === 0 ? 'tick' : 'tickHalf',
                });
                stats.ticks++;
            }
        }
    }

    return { segments, stats };
}

// ── Sampling entlang einer Polylinie ────────────────────────────────────────

/**
 * Sample-Punkte bei spacing/2, 3·spacing/2, … entlang der Kette (XZ-Länge).
 * Strichrichtung = Kanten-Senkrechte, Vorzeichen hangabwärts (aus edgeDown
 * der zugrunde liegenden Randkante; Fallback: Senkrechte beliebig).
 */
function _sampleTicks(chain, spacing, edgeDown, edgePointKey, eps) {
    const ticks = [];
    if (spacing <= 0) return ticks;
    let acc = 0;                 // bereits verbrauchte Länge
    let nextS = spacing / 2;     // nächste Sample-Position (kumulativ)

    for (let i = 0; i + 1 < chain.length; i++) {
        const ax = chain[i].x, az = chain[i].z;
        const bx = chain[i + 1].x, bz = chain[i + 1].z;
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 1e-9) continue;
        const ux = (bx - ax) / segLen, uz = (bz - az) / segLen;

        // Bergab-Richtung dieser Kante (über den Kantenmittelpunkt nachschlagen)
        const down = edgeDown.get(edgePointKey((ax + bx) / 2, (az + bz) / 2, eps)) ?? null;
        // Senkrechte zur Kante; Vorzeichen so, dass sie hangabwärts zeigt
        let dx = -uz, dz = ux;
        if (down && (dx * down.dx + dz * down.dz) < 0) { dx = -dx; dz = -dz; }

        while (nextS <= acc + segLen) {
            const t = (nextS - acc) / segLen;
            ticks.push({ px: ax + (bx - ax) * t, pz: az + (bz - az) * t, dx, dz, len: null });
            nextS += spacing;
        }
        acc += segLen;
    }
    return ticks;
}

// ── 2D-Strahl gegen Segment-Liste ───────────────────────────────────────────

/** Kleinste positive Trefferdistanz des Strahls (p + t·d) auf die Segmente. */
function _rayToSegments(px, pz, dx, dz, segs, maxLen) {
    let best = null;
    for (const s of segs) {
        const rx = s.x2 - s.x1, rz = s.z2 - s.z1;
        const denom = dx * rz - dz * rx;
        if (Math.abs(denom) < 1e-12) continue;           // parallel
        const qx = s.x1 - px, qz = s.z1 - pz;
        const t = (qx * rz - qz * rx) / denom;           // Distanz entlang Strahl
        const u = (qx * dz - qz * dx) / denom;           // Position auf Segment [0..1]
        if (t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
            if (best === null || t < best) best = t;
        }
    }
    if (best === null) return null;
    return Math.min(best, maxLen);
}
