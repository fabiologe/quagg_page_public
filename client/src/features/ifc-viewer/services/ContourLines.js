/**
 * ContourLines — Höhenlinien aus Gelände-Dreiecksnetzen (Sprint T1).
 *
 * Serie horizontaler Schnitte durch das Gelände-Mesh (nur die gewählten
 * Kategorien — NICHT die ganze Szene): je Höhenstufe werden die Dreiecke
 * geschnitten und die Segmente zu Polylinien verkettet. Höhenlinien am
 * DGM-Rand sind OFFEN — deshalb chainSegmentsToPolylines, nicht -Polygons.
 *
 * Haupt-/Nebenlinien: jede `majorEvery`-te Stufe (bezogen auf Vielfache des
 * Intervalls, nicht auf die Reihenfolge — 5,0 m bleibt Hauptlinie, auch wenn
 * das Gelände erst bei 3,2 m beginnt).
 *
 * Reines Modul — Eingabe wie SlopeHatch (TerrainMesh-Positions-Array).
 */

import { chainSegmentsToPolylines } from './SectionContour.js';

/**
 * @param {Float64Array} positions  9 Werte je Dreieck (Welt)
 * @param {number} triCount
 * @param {object} opts
 * @param {number} [opts.interval=0.5]    Höhenstufen-Abstand in Metern
 * @param {number} [opts.majorEvery=5]    jede n-te Stufe = Hauptlinie
 * @param {number} [opts.chainEps=0.005]  Snap-Toleranz beim Verketten
 * @returns {Array<{ level: number, major: boolean,
 *                   polylines: Array<Array<{x, y, z}>> }>}
 */
export function computeContourLines(positions, triCount, opts = {}) {
    const { interval = 0.5, majorEvery = 5, chainEps = 0.005 } = opts;
    if (!positions?.length || !triCount || interval <= 0) return [];

    // Höhenbereich des Meshs
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < triCount * 3; i++) {
        const y = positions[i * 3 + 1];
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
    }
    if (!(yMax > yMin)) return [];

    const firstIdx = Math.ceil(yMin / interval);
    const lastIdx = Math.floor(yMax / interval);
    if (lastIdx < firstIdx) return [];
    const levelCount = lastIdx - firstIdx + 1;

    // Dreiecke in Level-Buckets einsortieren (ein Pass)
    const buckets = Array.from({ length: levelCount }, () => []);
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        const y0 = positions[o + 1], y1 = positions[o + 4], y2 = positions[o + 7];
        const lo = Math.min(y0, y1, y2), hi = Math.max(y0, y1, y2);
        const from = Math.max(firstIdx, Math.ceil(lo / interval));
        const to = Math.min(lastIdx, Math.floor(hi / interval));
        for (let li = from; li <= to; li++) buckets[li - firstIdx].push(t);
    }

    const out = [];
    for (let li = firstIdx; li <= lastIdx; li++) {
        const level = li * interval;
        const segs = [];
        for (const t of buckets[li - firstIdx]) {
            const s = _sliceTriangle(positions, t, level);
            if (s) segs.push(s);
        }
        if (!segs.length) continue;
        const polylines = chainSegmentsToPolylines(segs, chainEps);
        if (!polylines.length) continue;
        out.push({
            level,
            major: ((li % majorEvery) + majorEvery) % majorEvery === 0,
            polylines,
        });
    }
    return out;
}

/**
 * Horizontaler Schnitt eines Dreiecks bei y=level → 0 oder 1 Segment.
 * Direkt auf dem flachen Array (keine Vector3-Allokationen) — dieselbe
 * Mathematik wie trianglePlaneIntersect, spezialisiert auf horizontale Ebenen.
 */
function _sliceTriangle(positions, t, level) {
    const o = t * 9;
    const pts = [];
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const ax = positions[o + i * 3], ay = positions[o + i * 3 + 1], az = positions[o + i * 3 + 2];
        const bx = positions[o + j * 3], by = positions[o + j * 3 + 1], bz = positions[o + j * 3 + 2];
        const da = ay - level, db = by - level;
        if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
            const s = da / (da - db);
            pts.push([ax + s * (bx - ax), az + s * (bz - az)]);
        }
    }
    if (pts.length < 2) return null;
    return { x1: pts[0][0], z1: pts[0][1], x2: pts[1][0], z2: pts[1][1], y1: level, y2: level };
}
