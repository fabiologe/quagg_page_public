// Unified Geometry Engine — Coupling Detector (G1, der Kern der Schwierigkeit).
//
// Erkennt GEOMETRISCH, wo 2D-Raster und 1D-Netz Wasser tauschen, statt es manuell zu
// deklarieren. Das Wichtige (vom User betont): das Raster liefert Wasser NUR dort in einen
// Knoten, wo das Gelände es hinträgt. Der harte Fall ist eine **Rasterdelle/Senke über einem
// Knoten**: dort sammelt sich Wasser dauerhaft → der Knoten bleibt gefüllt/eingestaut.
//
// Ausgabe je Kopplungsknoten: Zelle, `sink`-Flag (liegt in einer Geländesenke → wird stetig
// gespeist), `quality` (sink|flat|ridge) und Diagnose-Warnungen (z. B. Knoten auf einem Rücken,
// der KEIN Oberflächenwasser fängt). Die eigentliche Austauschphysik (Einzug/Überstau) macht
// der Solver (quagg-coupling.patch, coupling.cpp) — der Detector platziert/flaggt die Punkte.

import { COUPLING_ROLES } from './entities.js';

// Zelle (col,row top-down) einer Weltkoordinate im DEM-Header.
export function worldToCell(x, y, header) {
    const col = Math.floor((x - header.xllcorner) / header.cellsize);
    const row = header.nrows - 1 - Math.floor((y - header.yllcorner) / header.cellsize);
    return { col, row };
}
const inBounds = (c, r, h) => c >= 0 && c < h.ncols && r >= 0 && r < h.nrows;
const at = (grid, c, r, h) => grid[r * h.ncols + c];

/**
 * Klassifiziert eine Zelle relativ zu ihren 8 Nachbarn:
 *   'sink'  = lokales Minimum (≤ alle gültigen Nachbarn, mind. einer echt höher) → Wasser sammelt sich
 *   'ridge' = lokales Maximum (≥ alle Nachbarn) → Wasser läuft weg, kein Einzug
 *   'flat'  = dazwischen
 */
export function classifyCell(grid, col, row, header) {
    const nodata = header.NODATA_value ?? -9999;
    const z = at(grid, col, row, header);
    if (z === nodata) return 'nodata';
    let higher = 0, lower = 0, valid = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        const c = col + dc, r = row + dr;
        if (!inBounds(c, r, header)) continue;
        const nz = at(grid, c, r, header);
        if (nz === nodata) continue;
        valid++;
        if (nz > z + 1e-6) higher++;
        else if (nz < z - 1e-6) lower++;
    }
    if (valid === 0) return 'flat';
    // Echte Grube: ALLE gültigen Nachbarn strikt höher (sonst könnte Wasser seitlich
    // abfließen → flach). Rücken: ALLE strikt niedriger. Verhindert Falsch-Senken auf
    // flachem Gelände, das nur zufällig an einen Buckel grenzt.
    if (higher === valid) return 'sink';
    if (lower === valid) return 'ridge';
    return 'flat';
}

/**
 * Sucht innerhalb `radius` Zellen die nächste Senkenzelle (lokales Minimum). Für den Fall
 * „Knoten liegt neben einer Delle": das Wasser sammelt sich dort und speist den Knoten,
 * wenn er in Reichweite ist. Liefert {col,row,dist} oder null.
 */
export function nearestSink(grid, col, row, header, radius = 3) {
    let best = null;
    for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
        const c = col + dc, r = row + dr;
        if (!inBounds(c, r, header)) continue;
        if (classifyCell(grid, c, r, header) !== 'sink') continue;
        const dist = Math.hypot(dc, dr);
        if (!best || dist < best.dist) best = { col: c, row: r, dist };
    }
    return best;
}

/**
 * Erkennt die Kopplungsknoten geometrisch.
 * @param {NetworkModel} model
 * @param {{grid:Float32Array|number[], header:object}} dem   DEM-Raster (row-major top-down)
 * @param {object} opts { snapRadius=3, Cw=1.0, Amax=0 }
 * @returns {{couplingNodes:Array, warnings:string[], diagnostics:Array}}
 */
export function detectCouplingNodes(model, dem, opts = {}) {
    const { snapRadius = 3, Cw = 1.0, Amax = 0 } = opts;
    const { grid, header } = dem;
    const couplingNodes = [];
    const warnings = [];
    const diagnostics = [];

    for (const n of model.nodeList) {
        if (!COUPLING_ROLES.has(n.role)) continue;
        // Explizit verdeckelt (Panel „koppelt nicht"): kein 2D-Austausch — Amax=0 hieße
        // im Solver „unbegrenzt", darum wird der Knoten hier ganz ausgelassen.
        if (n.attrs.couple === false) continue;
        const { col, row } = worldToCell(n.geom.x, n.geom.y, header);
        if (!inBounds(col, row, header)) {
            warnings.push(`Knoten ${n.id} liegt außerhalb des DEM — nicht koppelbar.`);
            continue;
        }
        const nodata = header.NODATA_value ?? -9999;
        const demZ = at(grid, col, row, header);
        if (demZ === nodata || !Number.isFinite(demZ)) {
            warnings.push(`Knoten ${n.id} liegt auf einer NoData-Zelle (${col},${row}) — nicht koppelbar `
                + `(Austausch dort würde Wasser außerhalb des Geländes erzeugen).`);
            continue;
        }
        // Deckelhöhe plausibilisieren: fehlendes coverZ fällt im Adapter auf 0 zurück —
        // ein rim unter Geländehöhe würde im Solver Dauereinzug erzeugen (Wasser
        // "verschwindet" im Netz und taucht als Überstau an anderer Stelle wieder auf).
        let rim = Number(n.geom.rim);
        if (!Number.isFinite(rim) || rim < demZ - 0.02) {
            if (Number.isFinite(rim) && rim !== 0) {
                warnings.push(`Knoten ${n.id}: Deckelhöhe ${rim.toFixed(2)} liegt unter Gelände `
                    + `(${demZ.toFixed(2)}) — auf Geländehöhe gesetzt.`);
            }
            rim = demZ;
        }
        const cls = classifyCell(grid, col, row, header);
        let quality = cls === 'sink' ? 'sink' : cls === 'ridge' ? 'ridge' : 'flat';
        let fedBySink = cls === 'sink';
        let sinkCell = cls === 'sink' ? { col, row } : null;

        if (!fedBySink) {
            const s = nearestSink(grid, col, row, header, snapRadius);
            if (s) { fedBySink = true; sinkCell = s; if (quality !== 'ridge') quality = 'near-sink'; }
        }

        // Outfalls koppeln IMMER (Randwasserstand), auch auf flachem/erhöhtem Gelände.
        if (n.role === 'outfall') quality = quality === 'ridge' ? 'flat' : quality;

        if (quality === 'ridge' && n.role !== 'outfall') {
            warnings.push(`Knoten ${n.id} sitzt auf einem Geländerücken (Zelle ${col},${row}) — `
                + `fängt KEIN Oberflächenwasser; ${sinkCell ? 'nächste Senke in Reichweite.' : 'keine Senke in Reichweite.'}`);
        }

        couplingNodes.push({
            id: n.id, x: n.geom.x, y: n.geom.y, rim,
            Cw: n.attrs.Cw ?? Cw, Amax: n.attrs.Amax ?? Amax,
            sink: fedBySink, quality, cell: { col, row }, sinkCell,
        });
        diagnostics.push({ id: n.id, cell: { col, row }, quality, fedBySink });
    }
    return { couplingNodes, warnings, diagnostics };
}
