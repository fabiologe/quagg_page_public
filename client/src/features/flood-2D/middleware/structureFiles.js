/**
 * structureFiles.js — reine Bauwerks-Diskretisierung für den LISFLOOD-Export.
 *
 * Aus InputGenerator extrahiert (Datei-Schrumpfung + isolierte Testbarkeit): die drei
 * `this`-freien Algorithmus-Helfer für Wehr-/Brücken-Strukturen. Der Orchestrator
 * `generateWeirFile` bleibt in InputGenerator und ruft diese via dünne Delegatoren.
 *
 * Verhalten 1:1 wie zuvor (Regressions-Gate: test_structure_discretize verlangt v5 byte-identisch).
 */
import { getLineCells } from '../utils/weirGeometry.js';
import { collectPierCells } from '../utils/BridgeMeshLattice.js';

/**
 * Welt-Achse → wasserdichte, gerichtete Rasterzellen (4-connected). Jede Zelle bekommt
 * die blockierende Fläche 'E' (Reihenwechsel → blockt E-W) oder 'S' (sonst).
 * @param {Array<[number,number]>} axisCoords  Welt-Polylinie [[x,y],…]
 * @param {object} header  Raster-Header (xll/xllcorner, yll/yllcorner, cellsize)
 * @returns {Array<{x,y,col,rowBottomUp,direction}>}
 */
export function discretizeStructureAxis(axisCoords, header) {
    if (!axisCoords || axisCoords.length < 2) return [];
    const xll = header.xll !== undefined ? header.xll : header.xllcorner;
    const yll = header.yll !== undefined ? header.yll : header.yllcorner;
    const cs = header.cellsize;

    // 4-connected Bresenham — GEMEINSAMER Kern mit Editor/Wehr-Export: getLineCells()
    // aus weirGeometry (eine Quelle der Wahrheit statt dupliziertem Algorithmus).
    // WASSERDICHT (keine Diagonal-Eck-Lücken); jeder Schritt wechselt eindeutig Reihe
    // ODER Spalte → Richtungszuordnung (E/S) pro Zelle wohldefiniert.
    const cells = [];
    const seen = new Set();
    for (let i = 0; i < axisCoords.length - 1; i++) {
        const c0 = Math.round((axisCoords[i][0] - xll) / cs);
        const r0 = Math.round((axisCoords[i][1] - yll) / cs);
        const c1 = Math.round((axisCoords[i + 1][0] - xll) / cs);
        const r1 = Math.round((axisCoords[i + 1][1] - yll) / cs);
        // Defensiv: ungültige (NaN/Inf) Koordinaten würden getLineCells in eine Endlosschleife
        // schicken (c===c1 ist bei NaN nie wahr) → Segment überspringen statt zu hängen.
        if (!Number.isFinite(c0) || !Number.isFinite(r0) || !Number.isFinite(c1) || !Number.isFinite(r1)) continue;
        for (const cell of getLineCells(c0, r0, c1, r1)) {
            const key = `${cell.col},${cell.row}`;
            if (!seen.has(key)) { seen.add(key); cells.push({ x: cell.col, y: cell.row }); }
        }
    }

    // Richtung: Reihenwechsel (lokal N-S-verlaufende Linie) → 'E' (blockt E-W-Fluss),
    // sonst 'S' (blockt N-S). Verifiziert gegen input.cpp Weir_Identx/Identy.
    return cells.map((cell, i) => {
        let direction;
        if (i === 0) {
            direction = (cells.length > 1 && cells[1].y !== cells[0].y) ? 'E' : 'S';
        } else {
            direction = (cell.y !== cells[i - 1].y) ? 'E' : 'S';
        }
        return {
            x: xll + cell.x * cs,
            y: yll + cell.y * cs,
            col: cell.x,
            rowBottomUp: cell.y,
            direction
        };
    });
}

/**
 * Pfeilerzellen aller MESH3D-Brücken (Zellzentren in einem Pfeilerband). Rein geometrisch.
 * Single Source: dieselbe Rasterung nutzt der ErgebnisViewer fürs Overlay.
 * @returns {Set<string>}  Schlüssel "col,row"
 */
export function collectBridgePierCells(bridges, header) {
    return collectPierCells(bridges, header);
}

/**
 * Kollabiert die Zellen EINER mesh3d-Brücke in Fließrichtung auf eine einzige Zellreihe:
 * pro Spannposition (quer zur Fließrichtung) bleibt genau EINE Orifice-Zelle übrig — die
 * mit der niedrigsten (restriktivsten) Soffitte über dem SGC-Gerinne.
 *
 * Grund: LISFLOOD-FP 8 unterdrückt den Sub-Grid-Fluss auf JEDER Wehr-/Brückenkante; zwei
 * in Fließrichtung benachbarte Brückenzellen entziehen sich gegenseitig den verlangten
 * Sub-Grid-Fluss → "Invalid bridge cell. Bridge must have sub grid flows on either side."
 *
 * @param {Array<{col,row,x,y,soffit,direction}>} cells  offene (Nicht-Pfeiler) Zellen
 * @param {object} header
 * @param {Float32Array|null} sgcWidthGrid  bottom-up (0 = kein Gerinne) ODER null
 *        (Floodplain-Brücke ohne SGC) → dann rein geometrischer Collapse.
 * @returns {Array} eine Zelle je Spannposition (1 Zelle tief in Fließrichtung)
 */
export function collapseBridgeCellsToChannel(cells, header, sgcWidthGrid) {
    const { ncols, nrows } = header;
    const sgcAt = (col, row) =>
        (col < 0 || col >= ncols || row < 0 || row >= nrows) ? 0 : (sgcWidthGrid[row * ncols + col] || 0);

    // Quer zur Fließrichtung gruppieren: S/N → Fluss in Reihen → Schlüssel=col;
    // E/W → Fluss in Spalten → Schlüssel=row.
    const groups = new Map();
    for (const c of cells) {
        const flowIsRows = (c.direction === 'S' || c.direction === 'N');
        const key = flowIsRows ? c.col : c.row;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ ...c, flowIsRows });
    }

    const out = [];
    for (const group of groups.values()) {
        // Mit SGC: nur Zellen mit Sub-Grid-Fluss auf BEIDEN Fließseiten sind gültig.
        // Ohne SGC (Floodplain-Brücke): rein geometrisch — alle Zellen gültig.
        const valid = sgcWidthGrid ? group.filter(c => {
            if (sgcAt(c.col, c.row) <= 0) return false;
            return c.flowIsRows
                ? (sgcAt(c.col, c.row - 1) > 0 && sgcAt(c.col, c.row + 1) > 0)
                : (sgcAt(c.col - 1, c.row) > 0 && sgcAt(c.col + 1, c.row) > 0);
        }) : group;
        if (valid.length === 0) continue; // Spannposition kreuzt das Gerinne nicht
        valid.sort((a, b) => a.soffit - b.soffit); // restriktivste Öffnung zuerst
        out.push(valid[0]);
    }
    return out;
}
