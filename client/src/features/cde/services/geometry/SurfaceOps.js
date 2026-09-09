/**
 * SurfaceOps — solid→surface: die „obere Hülle" (Sprint G, AP2).
 *
 * Löst den Repräsentations-Mismatch für Gelände-Analysen: Böschungsschraffur,
 * Höhenlinien und Höhen-Sampler brauchen eine offene 2,5D-OBERFLÄCHE — ein
 * IfcCivilElement-Erdkörper kommt aber als geschlossener VOLUMENKÖRPER.
 *
 * Zwei Methoden:
 *   'upfaces'     — nur aufwärts gerichtete Dreiecke behalten. Schnell und
 *                   verlustfrei (Kanten bleiben scharf); versagt bei
 *                   Überhängen/Innengeometrie (Innen-Decken zählen mit).
 *   'heightfield' — Raster über die XZ-BBox, je Knoten der HÖCHSTE Treffer
 *                   (makeHeightSampler ist genau diese Auflösung), dann
 *                   Re-Triangulation des Rasters zum TIN. Robust für JEDEN
 *                   Körper; glättet scharfe Kanten auf Zellrasterbreite.
 *   'auto'        — geschlossener Solid → heightfield, offenes Mesh (DGM,
 *                   bereits Oberfläche) → upfaces.
 *
 * Ausgabe-Kontrakt identisch zu collectCategoryTriangles: {positions, triCount}
 * — SlopeHatch/ContourLines/HeightSampler konsumieren das unverändert.
 */

import { makeHeightSampler } from './HeightSampler.js';
import { meshVolume } from './MeshOps.js';

const NY_MIN_UP = -0.05;      // wie der bisherige Gelände-Filter (Böschungsflanken behalten!)
const CELL_MIN = 0.25;        // m
const CELL_MAX = 5;           // m
const CELL_BUDGET = 250000;   // max. Rasterzellen

/**
 * @param {Float64Array} positions  9 Werte je Dreieck (Welt)
 * @param {number} triCount
 * @param {object} [opts]
 * @param {'auto'|'upfaces'|'heightfield'} [opts.method='auto']
 * @param {number|null} [opts.cell=null]  Zellweite m (heightfield); null = Automatik
 * @returns {{ positions: Float64Array, triCount: number, method: string,
 *             warnings: string[] }}
 */
export function deriveSurface(positions, triCount, opts = {}) {
    const warnings = [];
    if (!positions?.length || !triCount) {
        return { positions: new Float64Array(0), triCount: 0, method: 'none', warnings: ['mesh_leer'] };
    }

    let method = opts.method ?? 'auto';
    if (method === 'auto') {
        const { closed } = meshVolume(positions, triCount);
        method = closed ? 'heightfield' : 'upfaces';
    }

    if (method === 'upfaces') {
        const out = _upfaces(positions, triCount);
        return { ...out, method, warnings };
    }
    const out = _heightfield(positions, triCount, opts.cell ?? null, warnings);
    return { ...out, method, warnings };
}

// ── 'upfaces' ───────────────────────────────────────────────────────────────

function _upfaces(positions, triCount) {
    const out = new Float64Array(triCount * 9);
    let n = 0;
    for (let t = 0; t < triCount; t++) {
        const o = t * 9;
        const nx = (positions[o + 4] - positions[o + 1]) * (positions[o + 8] - positions[o + 2])
                 - (positions[o + 5] - positions[o + 2]) * (positions[o + 7] - positions[o + 1]);
        const ny = (positions[o + 5] - positions[o + 2]) * (positions[o + 6] - positions[o])
                 - (positions[o + 3] - positions[o]) * (positions[o + 8] - positions[o + 2]);
        const nz = (positions[o + 3] - positions[o]) * (positions[o + 7] - positions[o + 1])
                 - (positions[o + 4] - positions[o + 1]) * (positions[o + 6] - positions[o]);
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-12) continue;
        if (ny / len < NY_MIN_UP) continue;
        out.set(positions.subarray(o, o + 9), n * 9);
        n++;
    }
    return { positions: out.subarray(0, n * 9).slice(), triCount: n };
}

// ── 'heightfield' ───────────────────────────────────────────────────────────

function _heightfield(positions, triCount, cellOpt, warnings) {
    const raster = heightfieldRaster(positions, triCount, cellOpt, warnings);
    if (!raster) return { positions: new Float64Array(0), triCount: 0 };
    return dreieckeAusRaster(raster);
}

/**
 * Stufe 15 (10.1): das Höhenraster SELBST herausreichen — zweiter Ausgang,
 * kein zweiter Rechenweg. Die Geländeoperationen arbeiten auf diesem Raster
 * und geben es über `dreieckeAusRaster` in die Szene zurück; beide Seiten
 * benutzen exakt die Abtastung und Triangulation, die `deriveSurface` schon
 * immer benutzt hat.
 *
 * @returns {{x0,z0,maxX,maxZ,cell,nx,nz,heights:Float64Array}|null}
 *  `maxX`/`maxZ` gehören zum BEZUG: die Randknoten wurden leicht nach innen
 *  abgetastet (siehe unten) — wer die Knotenlage reproduzieren will, braucht
 *  die Klemme, nicht nur x0+ix·cell.
 */
export function heightfieldRaster(positions, triCount, cellOpt = null, warnings = [], { bereich = null } = {}) {
    const sampler = makeHeightSampler(positions, triCount);
    let b = sampler.bounds;
    if (!b) return null;
    // ZUSCHNITT (Teil XVII, B3): ein Korridor statt des ganzen Geländes — so
    // kann ein 0,9-m-Graben mit 0,5-m-Zellen gerechnet werden, ohne dass das
    // Budget das ganze DGM vergröbert. Geschnitten wird mit den Netzgrenzen;
    // ein Bereich neben dem Gelände ergibt null.
    if (bereich && [bereich.minX, bereich.maxX, bereich.minZ, bereich.maxZ].every(Number.isFinite)) {
        const c = { minX: Math.max(b.minX, bereich.minX), maxX: Math.min(b.maxX, bereich.maxX),
                    minZ: Math.max(b.minZ, bereich.minZ), maxZ: Math.min(b.maxZ, bereich.maxZ) };
        if (!(c.maxX > c.minX) || !(c.maxZ > c.minZ)) { warnings.push('heightfield_bereich_leer'); return null; }
        b = c;
    }

    const spanX = Math.max(b.maxX - b.minX, 1e-6);
    const spanZ = Math.max(b.maxZ - b.minZ, 1e-6);
    const span = Math.max(spanX, spanZ);

    let cell = cellOpt ?? Math.min(CELL_MAX, Math.max(CELL_MIN, span / Math.sqrt(2 * triCount)));
    // Budget einhalten
    let nx = Math.max(2, Math.ceil(spanX / cell) + 1);
    let nz = Math.max(2, Math.ceil(spanZ / cell) + 1);
    if (nx * nz > CELL_BUDGET) {
        const scale = Math.sqrt((nx * nz) / CELL_BUDGET);
        cell *= scale;
        nx = Math.max(2, Math.ceil(spanX / cell) + 1);
        nz = Math.max(2, Math.ceil(spanZ / cell) + 1);
        warnings.push(`heightfield_vergroebert: Zellweite ${cell.toFixed(2)} m (Budget)`);
    }

    // Höhen an den Rasterknoten (Zellrand leicht nach innen sampeln, damit
    // Randknoten das Gelände noch treffen)
    const heights = new Float64Array(nx * nz).fill(NaN);
    for (let ix = 0; ix < nx; ix++) {
        const x = Math.min(b.maxX - 1e-9, b.minX + ix * cell);
        for (let iz = 0; iz < nz; iz++) {
            const z = Math.min(b.maxZ - 1e-9, b.minZ + iz * cell);
            const y = sampler.sample(x, z);
            if (y != null) heights[ix * nz + iz] = y;
        }
    }

    return { x0: b.minX, z0: b.minZ, maxX: b.maxX, maxZ: b.maxZ, cell, nx, nz, heights };
}

/** Die Knotenlage eines Rasters — MIT der Randklemme der Abtastung. */
export function rasterKnoten(raster, ix, iz) {
    return {
        x: Math.min(raster.maxX - 1e-9, raster.x0 + ix * raster.cell),
        z: Math.min(raster.maxZ - 1e-9, raster.z0 + iz * raster.cell),
    };
}

/**
 * Raster → Dreiecke. Je Zelle 2 Dreiecke (Diagonale entlang geringerer
 * Höhendifferenz — vermeidet Grat-Artefakte), 3 gültige Ecken → 1 Dreieck,
 * NaN-Knoten reissen Löcher statt auf Höhe null zu fallen.
 */
export function dreieckeAusRaster(raster) {
    const { nx, nz, heights } = raster;
    const tris = [];
    const X = (ix) => rasterKnoten(raster, ix, 0).x;
    const Z = (iz) => rasterKnoten(raster, 0, iz).z;
    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            const y00 = heights[ix * nz + iz];
            const y10 = heights[(ix + 1) * nz + iz];
            const y01 = heights[ix * nz + iz + 1];
            const y11 = heights[(ix + 1) * nz + iz + 1];
            const p00 = [X(ix), y00, Z(iz)],     p10 = [X(ix + 1), y10, Z(iz)];
            const p01 = [X(ix), y01, Z(iz + 1)], p11 = [X(ix + 1), y11, Z(iz + 1)];
            const valid = [y00, y10, y01, y11].filter(Number.isFinite).length;
            if (valid === 4) {
                // Diagonale wählen: 00–11 vs. 10–01
                if (Math.abs(y00 - y11) <= Math.abs(y10 - y01)) {
                    tris.push([p00, p10, p11], [p00, p11, p01]);
                } else {
                    tris.push([p00, p10, p01], [p10, p11, p01]);
                }
            } else if (valid === 3) {
                const pts = [[y00, p00], [y10, p10], [y11, p11], [y01, p01]]
                    .filter(([y]) => Number.isFinite(y)).map(([, p]) => p);
                tris.push(pts);
            }
        }
    }

    const out = new Float64Array(tris.length * 9);
    for (let i = 0; i < tris.length; i++) {
        const [a, c, d] = tris[i];
        out.set([...a, ...c, ...d], i * 9);
    }
    return { positions: out, triCount: tris.length };
}
