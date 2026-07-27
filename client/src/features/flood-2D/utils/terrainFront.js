/**
 * terrainFront.js — erkennt die "wahre" (ggf. irreguläre) Geländekante eines geclippten
 * DEMs, nicht nur die literale Rechteck-Kante des Rasters.
 *
 * Ein DEM ist oft auf ein irreguläres Einzugsgebiet zugeschnitten (NoData rundherum) —
 * der tatsächliche Geländerand liegt dann nicht auf `col===0/ncols-1`/`row===0/nrows-1`
 * (das prüft `cellEdge`/`snapToNearestEdge` in boundarySegments.js). Dieses Modul liefert
 * die dazu komplementäre Prüfung: liegt ein Punkt nahe der vom Rasterrand aus erreichbaren
 * NoData-Fläche (= der irregulären Außenkante des gültigen Geländes)?
 *
 * computeExteriorMask() ist eine unveränderte Extraktion der Flood-Fill, die bisher nur
 * inline in InputGenerator.js`_fillGlobalBoundary` existierte (Export-Pfad, NoData-Front-
 * Auslauf) — jetzt geteilte Quelle der Wahrheit für Editor (Live-Klassifikation beim
 * Zeichnen) UND Export, kein Drift-Risiko mehr zwischen beiden Kopien.
 *
 * Kein three.js, kein Vue — node-testbar, wie boundarySegments.js/weirGeometry.js.
 */
import { worldToCell } from './weirGeometry.js';

export const NODATA_THRESHOLD = -9990; // identisch zu InputGenerator.js/BoundaryTools
export const EDGE_TOLERANCE_CELLS_DEFAULT = 1.5;  // unverändert (bestehender snapToNearestEdge-Default)
export const FRONT_TOLERANCE_CELLS_DEFAULT = 3;   // großzügiger: eine handgezeichnete irreguläre
// Geländekante braucht mehr Spielraum als die exakte Rechteck-Kante (die der Nutzer visuell
// treffen kann) — bei typischer 5-10m-Auflösung sind 3 Zellen 15-30m Toleranz.

// 8 Richtungen (orthogonal + diagonal) — schiefe/rotierte DGMs erzeugen beim Rastern
// Treppenstufen-Kanten, an denen NoData-Zellen manchmal nur DIAGONAL aneinanderhängen
// (siehe computeExteriorMask-Kommentar). 4-Konnektivität allein lässt die Flood-Fill an
// solchen Diagonal-Übergängen abreißen.
const NEIGHBORS_8 = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
];

/**
 * Vom Rasterrand aus per 8-connected Flood-Fill (orthogonal + diagonal) erreichbare
 * NoData-Zellen — die äußere Hülle eines geclippten/irregulären DEMs. Unerreichbare
 * NoData-Löcher im Inneren (z. B. ein Gebäude-Footprint) zählen NICHT dazu, das
 * unterscheidet diese Funktion von einem naiven "Zelle ist NoData"-Scan.
 *
 * 8- statt 4-Konnektivität ist bewusst: bei einem schiefen/rotierten DGM verläuft die
 * eigentliche (nicht achsparallele) Außenkante als Treppenstufen-Muster im Raster — an
 * jeder "Ecke" der Treppe kann die NoData-Fläche jenseits der Kante nur DIAGONAL mit dem
 * Rest der NoData-Fläche zusammenhängen (ein reiner 4-Konnektivitäts-Flood-Fill reißt dort
 * ab und stuft den dahinterliegenden Teil fälschlich als "isoliertes Loch" statt als
 * erreichbare Außenfläche ein — s. Test "Diagonal-Kette erreicht den Rand nur über Ecken").
 * @param {Float32Array|Array} gridData  bottom-up (row 0 = Süd), NoData < NODATA_THRESHOLD
 * @param {{ncols:number, nrows:number}} header
 * @returns {Uint8Array} 1 = vom Rand erreichbares NoData, 0 = gültiges Gelände oder isoliertes Loch
 */
export function computeExteriorMask(gridData, header) {
    const { ncols, nrows } = header;
    const total = ncols * nrows;
    const exterior = new Uint8Array(total);
    const stack = [];
    const seedExt = (c, r) => {
        if (c < 0 || c >= ncols || r < 0 || r >= nrows) return;
        const k = r * ncols + c;
        if (exterior[k] || gridData[k] > NODATA_THRESHOLD) return;
        exterior[k] = 1; stack.push(k);
    };
    for (let c = 0; c < ncols; c++) { seedExt(c, 0); seedExt(c, nrows - 1); }
    for (let r = 0; r < nrows; r++) { seedExt(0, r); seedExt(ncols - 1, r); }
    while (stack.length) {
        const k = stack.pop();
        const c = k % ncols, r = (k - c) / ncols;
        for (const [dc, dr] of NEIGHBORS_8) seedExt(c + dc, r + dr);
    }
    return exterior;
}

/** Liegt (col,row) innerhalb toleranceCells (Box-Distanz) von einer exterior-Zelle? */
function isCellNearExterior(header, exteriorMask, col, row, toleranceCells) {
    const { ncols, nrows } = header;
    const r = Math.max(0, Math.round(toleranceCells));
    const rowStart = Math.max(0, row - r), rowEnd = Math.min(nrows - 1, row + r);
    const colStart = Math.max(0, col - r), colEnd = Math.min(ncols - 1, col + r);
    for (let rr = rowStart; rr <= rowEnd; rr++) {
        const base = rr * ncols;
        for (let cc = colStart; cc <= colEnd; cc++) {
            if (exteriorMask[base + cc]) return true;
        }
    }
    return false;
}

/**
 * Liegt IRGENDEIN Vertex der Polylinie nahe der (ggf. irregulären) Geländekante? Prüft
 * jeden Vertex, nicht nur die Endpunkte (anders als snapToNearestEdge) — die echte
 * Geländekante verläuft meist nicht gerade, ein Segment kann mittig näher dran sein als
 * an seinen Enden.
 * @param {Array<[number,number]>|Array<{x,y}>} coords  Welt-Koordinaten
 * @param {object} header  {ncols,nrows,cellsize,xll|xllcorner,yll|yllcorner}
 * @param {Uint8Array} exteriorMask  aus computeExteriorMask()
 * @param {number} [toleranceCells]
 * @returns {boolean}
 */
export function isNearExteriorFront(coords, header, exteriorMask, toleranceCells = FRONT_TOLERANCE_CELLS_DEFAULT) {
    for (const p of (coords || [])) {
        const x = Array.isArray(p) ? p[0] : p.x;
        const y = Array.isArray(p) ? p[1] : p.y;
        const { col, row } = worldToCell(header, x, y);
        if (isCellNearExterior(header, exteriorMask, col, row, toleranceCells)) return true;
    }
    return false;
}

/**
 * Kombiniert eine bereits andernorts bestimmte Rechteck-Kante (snapToNearestEdge aus
 * boundarySegments.js — bewusst NICHT hier importiert, um einen Zirkel-Import zu
 * vermeiden: boundarySegments.js importiert selbst aus diesem Modul für migrateBoundaries)
 * mit der Geländefront-Näherung zu einer vollständigen Klassifikation.
 * @param {string|null} edge  Ergebnis von snapToNearestEdge(...).edge
 * @param {Array} coords
 * @param {object} header
 * @param {Float32Array|Array|null} gridData  null ⇒ nearExteriorFront immer false
 * @param {{frontToleranceCells?:number, exteriorMask?:Uint8Array}} [options]
 * @returns {{onRectEdge:boolean, edge:('N'|'S'|'E'|'W'|null), nearExteriorFront:boolean}}
 */
export function classifyBoundaryEdge(edge, coords, header, gridData, options = {}) {
    const { frontToleranceCells = FRONT_TOLERANCE_CELLS_DEFAULT, exteriorMask = null } = options;
    let nearExteriorFront = false;
    if (gridData) {
        const mask = exteriorMask || computeExteriorMask(gridData, header);
        nearExteriorFront = isNearExteriorFront(coords, header, mask, frontToleranceCells);
    }
    return { onRectEdge: !!edge, edge: edge || null, nearExteriorFront };
}

/**
 * Gültige (Nicht-NoData) literale Rechteck-Randzellen — NUR die tatsächliche Array-Kante
 * (col===0/ncols-1 oder row===0/nrows-1), keine Front-Innenzellen. Eigene Funktion (statt
 * nur Teil von collectPerimeterCells), weil manche Verbraucher zwingend eine ECHTE
 * N/S/E/W-Kantenzelle brauchen (z. B. LISFLOOD FREE, das laut Solver-Grammatik nur als
 * native Kanten-Zeile gültig ist — eine Front-Innenzelle wäre grammatisch falsch platziert).
 * @param {Float32Array|Array} gridData
 * @param {object} header  {ncols,nrows}
 * @returns {Set<string>} "col,row"
 */
export function collectLiteralEdgeCells(gridData, header) {
    const { ncols, nrows } = header;
    const isValid = (c, r) => gridData[r * ncols + c] > NODATA_THRESHOLD;
    const keys = new Set();
    for (let c = 0; c < ncols; c++) {
        if (isValid(c, 0)) keys.add(`${c},0`);
        if (isValid(c, nrows - 1)) keys.add(`${c},${nrows - 1}`);
    }
    for (let r = 0; r < nrows; r++) {
        if (isValid(0, r)) keys.add(`0,${r}`);
        if (isValid(ncols - 1, r)) keys.add(`${ncols - 1},${r}`);
    }
    return keys;
}

/**
 * ALLE echten Randzellen des gültigen Geländes: gültige literale Rechteck-Randzellen
 * (collectLiteralEdgeCells) UND gültige Innenzellen, die 8-connected (orthogonal ODER
 * diagonal — "sobald eine Seite ODER Ecke frei ist") an die Außen-NoData-Front grenzen
 * (reine, seiteneffektfreie Verallgemeinerung von `edgeCells`/dem früheren Frontier-Scan
 * aus InputGenerator.js `_fillGlobalBoundary`). 8- statt 4-Konnektivität, weil bei einem
 * schiefen/rotierten DGM die Treppenstufen-Kante Zellen erzeugt, deren einzige offene
 * NoData-Nachbarschaft rein diagonal liegt — mit reiner 4-Konnektivität würden solche
 * Zellen fälschlich NICHT als Randzelle erkannt. Bewusst KEIN Import aus boundarySegments.js
 * (Zirkel-Import, s. Modul-Kopf) — die Rand-Zellen werden hier direkt inline erfasst.
 * @param {Float32Array|Array} gridData
 * @param {object} header  {ncols,nrows}
 * @param {Uint8Array} [exteriorMask]  bereits berechnete computeExteriorMask()
 * @returns {Set<string>} "col,row"
 */
export function collectPerimeterCells(gridData, header, exteriorMask = null) {
    const { ncols, nrows } = header;
    const mask = exteriorMask || computeExteriorMask(gridData, header);
    const isValid = (c, r) => gridData[r * ncols + c] > NODATA_THRESHOLD;
    const keys = collectLiteralEdgeCells(gridData, header);

    // Gültige Innenzellen, 8-connected an die Außen-NoData-Front.
    for (let r = 1; r < nrows - 1; r++) {
        for (let c = 1; c < ncols - 1; c++) {
            if (!isValid(c, r)) continue;
            let nearExterior = false;
            for (const [dc, dr] of NEIGHBORS_8) {
                if (mask[(r + dr) * ncols + (c + dc)]) { nearExterior = true; break; }
            }
            if (nearExterior) keys.add(`${c},${r}`);
        }
    }
    return keys;
}

/**
 * Nächste Randzelle zu (col,row) per einfachem quadriertem Abstand — linearer Scan über
 * die Perimeter-Menge (klein im Vergleich zum Gesamtraster), nur zweimal pro commit() nötig.
 * @returns {{col:number,row:number}|null}
 */
export function findNearestPerimeterCell(col, row, perimeterCells) {
    let best = null, bestDist2 = Infinity;
    for (const key of perimeterCells) {
        const [pc, pr] = key.split(',').map(Number);
        const dc = pc - col, dr = pr - row;
        const d2 = dc * dc + dr * dr;
        if (d2 < bestDist2) { bestDist2 = d2; best = { col: pc, row: pr }; }
    }
    return best;
}

/**
 * In welche(n) Himmelsrichtung(en) grenzt (col,row) UNMITTELBAR (orthogonal, nicht diagonal)
 * an eine NoData-Front/den Rasterrand? Für den Solver-Patch quagg-outflow-free-direction.patch
 * ("P x y FREE <slope> <N|E|S|W>", s. engines/patches/README.md): eine Zelle mit mind. einer
 * orthogonalen Richtung kann DIREKT dort eine Punkt-FREE-Randbedingung bekommen — der Solver
 * wendet dieselbe Manning-Normalabfluss-Formel wie eine native Kanten-FREE-Zeile an, nur auf der
 * Kante DIESER Zelle statt am literalen Rasterrand. Liefert 0 Richtungen für eine reine
 * Eckzelle, die nur DIAGONAL an NoData grenzt (8-Konnektivität, s. collectPerimeterCells) — dafür
 * gibt es keine einzelne gültige Kante, InputGenerator.js muss dort auf die Kanten-Projektion
 * zurückfallen (findNearestPerimeterCell). Konvention wie EDGE_LABEL/cellEdge: row wächst nach
 * Norden (bottom-up, row 0 = Süd) — konsistent zum Rest der App.
 * @returns {Array<'N'|'S'|'E'|'W'>}
 */
export function outwardCardinalDirections(col, row, header, exteriorMask) {
    const { ncols, nrows } = header;
    const isExtOrOutside = (c, r) => {
        if (c < 0 || c >= ncols || r < 0 || r >= nrows) return true;
        return !!exteriorMask[r * ncols + c];
    };
    const dirs = [];
    if (isExtOrOutside(col, row + 1)) dirs.push('N');
    if (isExtOrOutside(col, row - 1)) dirs.push('S');
    if (isExtOrOutside(col + 1, row)) dirs.push('E');
    if (isExtOrOutside(col - 1, row)) dirs.push('W');
    return dirs;
}

