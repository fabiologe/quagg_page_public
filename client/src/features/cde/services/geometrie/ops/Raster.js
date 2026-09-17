/**
 * Raster-Operationen des Kernels (Teil XIV, G1).
 *
 * Das Höhenraster ist die tragende Form der 2,5D-Welt — Gelände, Planum,
 * Böschung, Graben, Aushub sind alle Aussagen über z = f(x, y). Was hier
 * steht, ist der Unterbau für `koerperZwischenRastern` und für jede
 * Ableitung, die zwei Raster vergleicht.
 *
 * DIE EINE REGEL: `cell` kommt von AUSSEN. `heightfieldRaster` rechnet die
 * Zellweite sonst aus der Dreieckszahl der Quelle — zwei Quellen ergäben zwei
 * Bezüge, und `gleicherBezug` fiele. Deshalb ist `rasterAusMesh` ohne `cell`
 * ein Vertragsbruch (wirft), und jede Ableitung schreibt ihre Zellweite in den
 * Bauplan.
 *
 * Rein: kein Vue, kein three, kein DOM — läuft im Worker und in vitest.
 */
import { heightfieldRaster, rasterKnoten } from '../../geometry/SurfaceOps.js';
import { gleicherBezug } from '../../gelaende/Operationen.js';

/**
 * Dreiecke → Raster mit VORGEGEBENER Zellweite.
 * @returns {{ergebnis: raster|null, warnungen: string[]}}
 */
export function rasterAusMesh({ mesh } = {}, { cell, bereich = null, gitter = null } = {}) {
    if (!(cell > 0)) throw new Error('rasterAusMesh: `cell` ist Pflicht (sonst kein gemeinsamer Bezug)');
    const warnungen = [];
    // `gitter` (Teil XXI): auf den Knoten eines gröberen Rasters aufsetzen —
    // damit Korridor und Anzeige dieselbe Fläche zeigen, nicht zwei fast gleiche.
    const raster = heightfieldRaster(mesh.positions, mesh.triCount, cell, warnungen, { bereich, gitter });
    if (!raster) return { ergebnis: null, warnungen: ['kein_raster: Netz ohne Ausdehnung'] };
    return { ergebnis: raster, warnungen };
}

/**
 * Höhe an beliebiger Stelle — bilinear zwischen den vier umliegenden Knoten.
 * NaN, wenn die Stelle ausserhalb liegt oder einer der vier Knoten NaN ist
 * (kein Treffer bleibt kein Treffer, Gesetz aus Operationen.js).
 */
export function rasterAbtasten(raster, x, z) {
    const { x0, z0, cell, nx, nz, heights } = raster;
    const fx = (x - x0) / cell;
    const fz = (z - z0) / cell;
    if (fx < -1e-9 || fz < -1e-9 || fx > nx - 1 + 1e-9 || fz > nz - 1 + 1e-9) return NaN;
    const ix = Math.min(nx - 2, Math.max(0, Math.floor(fx)));
    const iz = Math.min(nz - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix));
    const tz = Math.min(1, Math.max(0, fz - iz));
    const h00 = heights[ix * nz + iz];
    const h10 = heights[(ix + 1) * nz + iz];
    const h01 = heights[ix * nz + iz + 1];
    const h11 = heights[(ix + 1) * nz + iz + 1];
    if (![h00, h10, h01, h11].every(Number.isFinite)) return NaN;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

/**
 * Ein Raster auf den Bezug eines anderen umrechnen (bilinear).
 * Der Bezug ist `{x0, z0, maxX, maxZ, cell, nx, nz}` — ein Raster taugt.
 */
export function rasterResample({ raster } = {}, { bezug } = {}) {
    if (!bezug) throw new Error('rasterResample: `bezug` ist Pflicht');
    const { x0, z0, maxX, maxZ, cell, nx, nz } = bezug;
    const heights = new Float64Array(nx * nz);
    const knoten = { x0, z0, maxX, maxZ, cell };
    for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
            const k = rasterKnoten(knoten, ix, iz);
            heights[ix * nz + iz] = rasterAbtasten(raster, k.x, k.z);
        }
    }
    return { ergebnis: { x0, z0, maxX, maxZ, cell, nx, nz, heights }, warnungen: [] };
}

/**
 * b − a auf dem Bezug von a. Fremder Bezug wird auf a umgerechnet — und
 * GEMELDET, denn das ist eine Näherung.
 */
export function rasterDifferenz({ a, b } = {}) {
    const warnungen = [];
    let bb = b;
    if (!gleicherBezug(a, b)) {
        bb = rasterResample({ raster: b }, { bezug: a }).ergebnis;
        warnungen.push('bezug_angeglichen: b wurde bilinear auf den Bezug von a umgerechnet');
    }
    const heights = new Float64Array(a.heights.length);
    for (let i = 0; i < heights.length; i++) {
        const ha = a.heights[i], hb = bb.heights[i];
        heights[i] = (Number.isFinite(ha) && Number.isFinite(hb)) ? hb - ha : NaN;
    }
    return { ergebnis: { ...a, heights }, warnungen };
}

/**
 * Das Prüfmass einer Quelle — die Momentaufnahme, die eine Ableitung beim
 * Setzen mitschreibt (`quellBasis`, Gegenstück zu `bezug.zielBasis`).
 * Translationsinvariant (nur Zahl und Ausdehnung), damit die
 * Rahmen-Nachführung es nicht anfassen muss; cm-gerundet.
 */
export function pruefmassVon(mesh) {
    const p = mesh?.positions;
    if (!p?.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cm = (v) => Math.round(v * 100) / 100;
    return { triCount: mesh.triCount, spanX: cm(maxX - minX), spanY: cm(maxY - minY), spanZ: cm(maxZ - minZ) };
}

/**
 * Das ACHSMASS einer Rohrachse (B3): Länge, DN, Höhenunterschied — cm-gerundet,
 * translationsinvariant. Ein Prüfmass ohne Netz, für viele Rohre auf einmal.
 */
export function achsmassAus(linie) {
    const pts = linie?.punkte ?? [];
    if (pts.length < 2) return null;
    let laenge = 0;
    for (let i = 1; i < pts.length; i++) laenge += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    const cm = (v) => Math.round(v * 100) / 100;
    return { achse: true, laenge: cm(laenge), dn: Number.isFinite(linie.dn) ? linie.dn : null, dy: cm(pts[pts.length - 1].y - pts[0].y) };
}

/** Zwei Prüfmasse gleich? (cm-Toleranz steckt in der Rundung) — Netzmass oder Achsmass. */
export function pruefmassGleich(a, b) {
    if (!a || !b) return false;
    if (a.achse || b.achse) return !!a.achse && !!b.achse && a.laenge === b.laenge && a.dn === b.dn && a.dy === b.dy;
    return a.triCount === b.triCount && a.spanX === b.spanX && a.spanY === b.spanY && a.spanZ === b.spanZ;
}

/**
 * Eine Zellweite aus dem Prüfmass — die Automatik von `heightfieldRaster`,
 * nur auf Viertelmeter gerundet und nach oben bei 2 m gedeckelt, damit ein
 * grobes Gelände nicht mit 5-m-Zellen ein 1,5-m-Gerinne verschluckt.
 */
export function zellweiteVorschlag(pruefmass) {
    if (!pruefmass?.triCount) return 1;
    const span = Math.max(pruefmass.spanX ?? 0, pruefmass.spanZ ?? 0, 1e-6);
    const roh = span / Math.sqrt(2 * pruefmass.triCount);
    return Math.min(2, Math.max(0.25, Math.round(roh * 4) / 4));
}
