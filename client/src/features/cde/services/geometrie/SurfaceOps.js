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

function _normale(positions, o) {
    const nx = (positions[o + 4] - positions[o + 1]) * (positions[o + 8] - positions[o + 2])
             - (positions[o + 5] - positions[o + 2]) * (positions[o + 7] - positions[o + 1]);
    const ny = (positions[o + 5] - positions[o + 2]) * (positions[o + 6] - positions[o])
             - (positions[o + 3] - positions[o]) * (positions[o + 8] - positions[o + 2]);
    const nz = (positions[o + 3] - positions[o]) * (positions[o + 7] - positions[o + 1])
             - (positions[o + 4] - positions[o + 1]) * (positions[o + 6] - positions[o]);
    return { ny, len: Math.hypot(nx, ny, nz) };
}

/**
 * Wie herum ist ein OFFENES Höhenfeld gewickelt? Die Mehrheit der Fläche sagt es.
 *
 * Ein offenes Netz darf so oder so herum kommen. Gemessen (Teil XX,
 * 2026-09-10): die Anzeige des geformten Geländes — ein Rasternetz der CDE,
 * über die Bibliothek zurückgelesen — trug ALLE 99 414 Dreiecke nach unten
 * gewendet. `upfaces` behielt davon keins, der Sampler war leer, `hoeheAn`
 * null — und nach der ersten Formung fand kein Werkzeug mehr eine Höhe.
 * Die Ursache sitzt hier in der Datei: `dreieckeAusRaster` wickelt jede Zelle
 * nach unten, und daraus baut der Autor die Anzeige. Dort wird nichts gedreht
 * — Anzeige und Körper hängen daran; gekurt wird, wer die Wicklung LIEST.
 * Zeigt die Mehrheit nach unten, ist die ganze Fläche umgedreht: dann gilt
 * die Regel gespiegelt. Ein richtig gewickeltes Netz bleibt, wie es war.
 * @returns {1|-1}
 */
export function wicklungVon(positions, triCount) {
    let auf = 0, ab = 0;
    for (let t = 0; t < triCount; t++) {
        const { ny, len } = _normale(positions, t * 9);
        if (len < 1e-12) continue;
        if (ny > 0) auf += len; else if (ny < 0) ab += len;
    }
    return ab > auf ? -1 : 1;
}

function _upfaces(positions, triCount) {
    const out = new Float64Array(triCount * 9);
    const richtung = wicklungVon(positions, triCount);
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
        if (richtung * ny / len < NY_MIN_UP) continue;
        out.set(positions.subarray(o, o + 9), n * 9);
        if (richtung < 0) {
            // Nach oben gewendet ausgeben: wer die Normale liest (Flächenkennzahlen
            // zählen nur ny > 0 als Grundfläche), sieht dann dasselbe wie beim
            // gelieferten Gelände.
            out.set(positions.subarray(o + 6, o + 9), n * 9 + 3);
            out.set(positions.subarray(o + 3, o + 6), n * 9 + 6);
        }
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
export function heightfieldRaster(positions, triCount, cellOpt = null, warnings = [], { bereich = null, gitter = null } = {}) {
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

    // AUF EIN VORHANDENES GITTER LEGEN (Teil XXI, P1b). Ein Korridor wurde
    // bisher an seiner eigenen Box aufgehängt; das gröbere Raster daneben hat
    // seine Knoten woanders. Zwei Flächen, die dasselbe Gelände meinen,
    // durchdringen sich dann um Zentimeter — im Bild ein Flimmern zwischen
    // Erdkörper und Geländeanzeige (gemessen 2026-09-17: 8,5 cm an einer
    // Gerinnesohle). Mit `gitter` beginnt dieses Raster auf einem Knoten des
    // groben und teilt dessen Zelle ganzzahlig: jeder grobe Knoten ist dann
    // auch ein feiner, und beide Flächen liegen aufeinander.
    if (gitter && [gitter.x0, gitter.z0, gitter.cell].every(Number.isFinite) && gitter.cell > 0) {
        const aufKnoten = (wert, ursprung) => {
            const k = Math.floor((wert - ursprung) / gitter.cell + 1e-9);
            let v = ursprung + k * gitter.cell;
            // Nie AUS dem Netz hinaus — sonst stünden Randknoten ohne Treffer.
            while (v < wert - 1e-9) v += gitter.cell;
            return v;
        };
        b = { ...b, minX: aufKnoten(b.minX, gitter.x0), minZ: aufKnoten(b.minZ, gitter.z0) };
        if (!(b.maxX > b.minX) || !(b.maxZ > b.minZ)) { warnings.push('heightfield_bereich_leer'); return null; }
        // Die Zellweite teilt die grobe ganzzahlig — sonst liegt nur der
        // Ursprung auf dem Gitter und jeder weitere Knoten daneben.
        const teile = Math.max(1, Math.round(gitter.cell / (cellOpt ?? gitter.cell)));
        cellOpt = gitter.cell / teile;
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
 * Die Dreiecke EINER Rasterzelle — die eine Regel, nach der `dreieckeAusRaster`
 * zeichnet und `hoeheImRaster` abtastet. Je Zelle 2 Dreiecke (Diagonale entlang
 * geringerer Höhendifferenz — vermeidet Grat-Artefakte), 3 gültige Ecken →
 * 1 Dreieck, NaN-Knoten reissen Löcher statt auf Höhe null zu fallen.
 */
/**
 * Welche Diagonale teilt diese Zelle? Die mit der KLEINEREN Höhendifferenz —
 * sie vermeidet Grate. Als eigene Funktion, weil ein zweiter Leser dieselbe
 * Antwort braucht: `koerperZwischenRastern` legt Deckel und Boden eines
 * Erdkörpers über dieselben Knoten (Teil XXI). Wählt er anders als die
 * Anzeige, entstehen aus einem Rasterstand ZWEI Flächen — gemessen
 * 2026-09-17 am Grubenrand: 0,20 m auseinander, im Bild ein Körper, der aus
 * dem Gelände ragt.
 * @returns {boolean} true = 00–11 (sonst 10–01)
 */
export function diagonale00_11(raster, ix, iz) {
    const { nz, heights } = raster;
    const y00 = heights[ix * nz + iz], y11 = heights[(ix + 1) * nz + iz + 1];
    const y10 = heights[(ix + 1) * nz + iz], y01 = heights[ix * nz + iz + 1];
    return Math.abs(y00 - y11) <= Math.abs(y10 - y01);
}

function _zellDreiecke(raster, ix, iz, X, Z) {
    const { nz, heights } = raster;
    const y00 = heights[ix * nz + iz];
    const y10 = heights[(ix + 1) * nz + iz];
    const y01 = heights[ix * nz + iz + 1];
    const y11 = heights[(ix + 1) * nz + iz + 1];
    const p00 = [X(ix), y00, Z(iz)],     p10 = [X(ix + 1), y10, Z(iz)];
    const p01 = [X(ix), y01, Z(iz + 1)], p11 = [X(ix + 1), y11, Z(iz + 1)];
    const valid = [y00, y10, y01, y11].filter(Number.isFinite).length;
    if (valid === 4) {
        return diagonale00_11(raster, ix, iz)
            ? [[p00, p10, p11], [p00, p11, p01]]
            : [[p00, p10, p01], [p10, p11, p01]];
    }
    if (valid === 3) {
        return [[[y00, p00], [y10, p10], [y11, p11], [y01, p01]]
            .filter(([y]) => Number.isFinite(y)).map(([, p]) => p)];
    }
    return [];
}

/**
 * Die Dreiecke EINER Zelle nach der Regel der Anzeige — für Leser, die nur
 * einen Teil der Zellen zeichnen (die Geländeanzeige mit Aussparung, Teil
 * XXII). Dieselbe Diagonale wie `dreieckeAusRaster`, sonst stünden Anzeige
 * und Erdkörper wieder auf zwei Flächen.
 */
export function zellDreiecke(raster, ix, iz) {
    const X = (i) => rasterKnoten(raster, i, 0).x;
    const Z = (j) => rasterKnoten(raster, 0, j).z;
    return _zellDreiecke(raster, ix, iz, X, Z);
}

/** Raster → Dreiecke (siehe `_zellDreiecke`). */
export function dreieckeAusRaster(raster) {
    const { nx, nz } = raster;
    const tris = [];
    const X = (ix) => rasterKnoten(raster, ix, 0).x;
    const Z = (iz) => rasterKnoten(raster, 0, iz).z;
    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            for (const d of _zellDreiecke(raster, ix, iz, X, Z)) tris.push(d);
        }
    }

    return _alsNetz(tris);
}

function _alsNetz(tris) {
    const out = new Float64Array(tris.length * 9);
    for (let i = 0; i < tris.length; i++) {
        const [a, c, d] = tris[i];
        out.set([...a, ...c, ...d], i * 9);
    }
    return { positions: out, triCount: tris.length };
}

/**
 * Die Höhe der TRIANGULIERTEN Rasterfläche an (x, z) — genau die Fläche, die
 * `dreieckeAusRaster` zeichnet (dieselbe Diagonale, dieselben Löcher), keine
 * bilineare Näherung daneben. null: ausserhalb oder im Loch.
 */
export function hoeheImRaster(raster, x, z) {
    const { x0, z0, cell, nx, nz } = raster ?? {};
    if (!(nx >= 2 && nz >= 2) || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const X = (ix) => rasterKnoten(raster, ix, 0).x;
    const Z = (iz) => rasterKnoten(raster, 0, iz).z;
    const EPS = 1e-9;
    if (x < X(0) - EPS || x > X(nx - 1) + EPS || z < Z(0) - EPS || z > Z(nz - 1) + EPS) return null;
    const ix = Math.min(nx - 2, Math.max(0, Math.floor((x - x0) / cell)));
    const iz = Math.min(nz - 2, Math.max(0, Math.floor((z - z0) / cell)));
    for (const [a, b, c] of _zellDreiecke(raster, ix, iz, X, Z)) {
        const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
        if (Math.abs(d) < 1e-15) continue;
        const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
        const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
        const l3 = 1 - l1 - l2;
        if (l1 >= -EPS && l2 >= -EPS && l3 >= -EPS) return l1 * a[1] + l2 * b[1] + l3 * c[1];
    }
    return null;
}

/**
 * Ein FEINER Flicken über den groben Zellen [ix0, ix1) × [iz0, iz1): k
 * Teilzellen je Zelle. Die Höhen kommen aus der triangulierten groben Fläche
 * (`hoeheImRaster`) — der Flicken IST zunächst dieselbe Fläche, nur feiner
 * zerlegt, und seine Randknoten liegen auf den groben Zellkanten.
 */
export function flickenRaster(grob, { ix0, ix1, iz0, iz1 }, k) {
    const X = (ix) => rasterKnoten(grob, ix, 0).x;
    const Z = (iz) => rasterKnoten(grob, 0, iz).z;
    const nx = (ix1 - ix0) * k + 1, nz = (iz1 - iz0) * k + 1;
    // `maxX` so, dass die Randklemme (`rasterKnoten`: maxX − 1e-9) den letzten
    // Knoten GENAU auf den letzten groben Knoten legt.
    const f = { x0: X(ix0), z0: Z(iz0), maxX: X(ix1) + 1e-9, maxZ: Z(iz1) + 1e-9,
                cell: grob.cell / k, nx, nz, heights: new Float64Array(nx * nz) };
    for (let i = 0; i < nx; i++) {
        const x = rasterKnoten(f, i, 0).x;
        for (let j = 0; j < nz; j++) {
            const y = hoeheImRaster(grob, x, rasterKnoten(f, 0, j).z);
            f.heights[i * nz + j] = y == null ? NaN : y;
        }
    }
    return f;
}

/**
 * Grobes Raster + feine Flicken → EIN Dreiecksnetz. Die groben Zellen unter
 * einem Flicken fallen weg; der Flicken füllt genau sie (seine Box liegt auf
 * ganzen groben Zellen), und sein Rand liegt auf deren Kanten.
 *
 * KEIN T-STOSS (im Browser gesehen 2026-09-11): eine grobe Nachbarzelle hatte
 * an der gemeinsamen Kante zwei Knoten, der Flicken k + 1 — geometrisch
 * dicht, aber jede dieser Kanten gehörte nur EINEM Dreieck, und der Umriss
 * einer Auswahl zeichnete ein Quadrat um jeden Flicken. Jetzt bekommt die
 * Nachbarzelle die Randknoten des Flickens und wird als Fächer von ihrer Mitte
 * aus trianguliert — im selben Umlaufsinn wie jede andere Zelle (sonst
 * verwürfe `upfaces` die Fächer als Unterseiten).
 * @param {Array<{box:{ix0,ix1,iz0,iz1}, raster}>} flicken
 */
export function dreieckeMitFlicken(grob, flicken = []) {
    if (!flicken?.length) return dreieckeAusRaster(grob);
    const liste = flicken.map(f => ({ ...f, k: Math.round((f.raster.nx - 1) / (f.box.ix1 - f.box.ix0)) }));
    const { nx, nz, heights } = grob;
    const X = (ix) => rasterKnoten(grob, ix, 0).x;
    const Z = (iz) => rasterKnoten(grob, 0, iz).z;
    const flickenUnter = (ix, iz) => (ix < 0 || iz < 0 || ix >= nx - 1 || iz >= nz - 1) ? null
        : (liste.find(({ box: b }) => ix >= b.ix0 && ix < b.ix1 && iz >= b.iz0 && iz < b.iz1) ?? null);
    const knoten = (f, i, j) => {
        const p = rasterKnoten(f.raster, i, j);
        return [p.x, f.raster.heights[i * f.raster.nz + j], p.z];
    };
    // Die Randknoten eines Flickens auf EINER Kante der Zelle (ix, iz) — in
    // ihrem Umlauf: s (z = Z(iz), x steigt), o (x = X(ix+1), z steigt),
    // n (z = Z(iz+1), x fällt), w (x = X(ix), z fällt).
    const zwischen = (ix, iz, seite) => {
        const [nbx, nbz] = { s: [ix, iz - 1], o: [ix + 1, iz], n: [ix, iz + 1], w: [ix - 1, iz] }[seite];
        const f = flickenUnter(nbx, nbz);
        if (!f) return [];
        const { box: b, k } = f;
        const aus = [];
        for (let r = 1; r < k; r++) {
            const q = seite === 's' ? knoten(f, (ix - b.ix0) * k + r, f.raster.nz - 1)
                    : seite === 'o' ? knoten(f, 0, (iz - b.iz0) * k + r)
                    : seite === 'n' ? knoten(f, (ix - b.ix0) * k + (k - r), 0)
                    : knoten(f, f.raster.nx - 1, (iz - b.iz0) * k + (k - r));
            if (Number.isFinite(q[1])) aus.push(q);
        }
        return aus;
    };
    const tris = [];
    for (let ix = 0; ix + 1 < nx; ix++) {
        for (let iz = 0; iz + 1 < nz; iz++) {
            if (flickenUnter(ix, iz)) continue;
            const s = zwischen(ix, iz, 's'), o = zwischen(ix, iz, 'o'), n = zwischen(ix, iz, 'n'), w = zwischen(ix, iz, 'w');
            const e = [heights[ix * nz + iz], heights[(ix + 1) * nz + iz], heights[(ix + 1) * nz + iz + 1], heights[ix * nz + iz + 1]];
            if (!(s.length || o.length || n.length || w.length) || !e.every(Number.isFinite)) {
                for (const d of _zellDreiecke(grob, ix, iz, X, Z)) tris.push(d);
                continue;
            }
            const ring = [[X(ix), e[0], Z(iz)], ...s, [X(ix + 1), e[1], Z(iz)], ...o,
                          [X(ix + 1), e[2], Z(iz + 1)], ...n, [X(ix), e[3], Z(iz + 1)], ...w];
            const cx = (X(ix) + X(ix + 1)) / 2, cz = (Z(iz) + Z(iz + 1)) / 2;
            const mitte = [cx, hoeheImRaster(grob, cx, cz) ?? (e[0] + e[1] + e[2] + e[3]) / 4, cz];
            for (let i = 0; i < ring.length; i++) tris.push([mitte, ring[i], ring[(i + 1) % ring.length]]);
        }
    }
    const teile = [_alsNetz(tris), ...liste.map(f => dreieckeAusRaster(f.raster))];
    const n = teile.reduce((sum, t) => sum + t.triCount, 0);
    const positions = new Float64Array(n * 9);
    let o = 0;
    for (const t of teile) { positions.set(t.positions, o); o += t.triCount * 9; }
    return { positions, triCount: n };
}
