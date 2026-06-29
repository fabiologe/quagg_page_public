/**
 * boundarySegments — reine Geometrie-Helfer für Modellkanten-Randbedingungen.
 *
 * Eine Boundary ist physikalisch entweder ein KANTEN-SEGMENT (liegt auf dem
 * Rasterrand N/S/E/W → LISFLOOD gibt dort echten Impuls) oder eine INNEN-QUELLE
 * (richtungslose Punkt-/Linienquelle). Diese Helfer entscheiden, ob/auf welche
 * Kante eine gezeichnete Linie gehört, und fassen Kantenzellen zu Welt-Intervallen
 * [a,b] zusammen — exakt im Format der LISFLOOD-.bci-Kantenzeilen.
 *
 * Konventionen (identisch zu weirGeometry/InputGenerator):
 *  - gridData bottom-up: row 0 = Süd, row nrows-1 = Nord. Index = row*ncols+col.
 *  - LISFLOOD-Kantenbuchstabe = physische Kante: W=col 0, E=col ncols-1, S=row 0, N=row nrows-1.
 *  - Intervall-Math nutzt ZELLKANTEN: a = origin + run*cs, b = origin + (runEnd+1)*cs.
 *  - Kein three.js, kein Vue → node-testbar.
 */

import { worldToCell } from './weirGeometry.js';

/** @typedef {'N'|'S'|'E'|'W'} Edge */

/** Header-Ursprung (Welt-Koordinate von Spalte/Reihe 0). */
function originOf(header) {
    return {
        xll: header.xll !== undefined ? header.xll : header.xllcorner,
        yll: header.yll !== undefined ? header.yll : header.yllcorner,
    };
}

/**
 * Auf welcher physischen Rasterkante liegt die Zelle (col,row) — oder null (innen)?
 * Eckzellen erfüllen zwei Kanten; deterministische Priorität W > E > S > N,
 * damit eine Ecke genau EINER Kante zugeordnet wird (Ownership-Dedup).
 * @returns {Edge|null}
 */
export function cellEdge(header, col, row) {
    const { ncols, nrows } = header;
    if (col === 0) return 'W';
    if (col === ncols - 1) return 'E';
    if (row === 0) return 'S';
    if (row === nrows - 1) return 'N';
    return null;
}

/**
 * Achse + fixe Kanten-Koordinate einer Kante.
 *  W: col=0, variiert über row ; E: col=ncols-1, variiert über row
 *  S: row=0, variiert über col ; N: row=nrows-1, variiert über col
 * @returns {{ vertical: boolean, fixed: number }} vertical=true ⇒ Spanne über Reihen (W/E)
 */
export function edgeAxis(header, edge) {
    const { ncols, nrows } = header;
    switch (edge) {
        case 'W': return { vertical: true, fixed: 0 };
        case 'E': return { vertical: true, fixed: ncols - 1 };
        case 'S': return { vertical: false, fixed: 0 };
        case 'N': return { vertical: false, fixed: nrows - 1 };
        default: throw new Error(`edgeAxis: ungültige Kante '${edge}'`);
    }
}

/**
 * Iteriert die Perimeter-Zellen einer Kante (für Ownership-Claiming/Gap-Fill).
 * Liefert {col,row} pro Zelle entlang der Kante.
 */
export function* edgeCells(header, edge) {
    const { ncols, nrows } = header;
    const { vertical, fixed } = edgeAxis(header, edge);
    if (vertical) {
        for (let row = 0; row < nrows; row++) yield { col: fixed, row };
    } else {
        for (let col = 0; col < ncols; col++) yield { col, row: fixed };
    }
}

/**
 * Distanz (in Zellen) einer Zelle zu jeder der 4 Kanten.
 * @returns {{W:number,E:number,S:number,N:number}}
 */
function edgeDistances(header, col, row) {
    const { ncols, nrows } = header;
    return { W: col, E: ncols - 1 - col, S: row, N: nrows - 1 - row };
}

/**
 * Linie auf die nächste Rasterkante einrasten, falls innerhalb `thresholdCells`.
 *
 * Vorgehen: für beide Endpunkte die Zell-Distanz zu jeder Kante bilden; die Kante
 * wählen, deren MAXIMALE Endpunkt-Distanz am kleinsten ist UND ≤ thresholdCells.
 * Bei Treffer wird jeder Vertex auf die Kantenlinie projiziert (Quer-Achse auf die
 * Welt-Koordinate der Kante gesetzt, Längs-Achse bleibt). Sonst edge=null.
 *
 * @param {Array<[number,number]>|Array<{x,y}>} coords  Welt-Polylinie (>= 2 Punkte)
 * @param {object} header  Raster-Header
 * @param {number} [thresholdCells=1.5]
 * @returns {{ edge: Edge|null, snappedCoords: Array<[number,number]> }}
 */
export function snapToNearestEdge(coords, header, thresholdCells = 1.5) {
    const pts = (coords || []).map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
    const asPairs = pts.map(p => [p.x, p.y]);
    if (pts.length < 2) return { edge: null, snappedCoords: asPairs };

    const ends = [pts[0], pts[pts.length - 1]];
    const distsPerEnd = ends.map(p => {
        const c = worldToCell(header, p.x, p.y);
        return edgeDistances(header, c.col, c.row);
    });

    // Für jede Kante: max. Endpunkt-Distanz
    let best = null;
    for (const edge of ['W', 'E', 'S', 'N']) {
        const maxDist = Math.max(...distsPerEnd.map(d => d[edge]));
        if (maxDist <= thresholdCells && (best === null || maxDist < best.maxDist)) {
            best = { edge, maxDist };
        }
    }
    if (!best) return { edge: null, snappedCoords: asPairs };

    const { xll, yll } = originOf(header);
    const cs = header.cellsize;
    const { vertical, fixed } = edgeAxis(header, best.edge);
    // Welt-Koordinate der Kantenlinie (Zellzentrum-Konvention wie worldToCell)
    const edgeWorld = vertical ? (xll + fixed * cs) : (yll + fixed * cs);
    const snappedCoords = pts.map(p => vertical ? [edgeWorld, p.y] : [p.x, edgeWorld]);

    return { edge: best.edge, snappedCoords };
}

/**
 * Kantenzellen zu zusammenhängenden Welt-Intervallen [a,b] zusammenfassen.
 * Repliziert exakt die Intervall-Math des alten tryEmitDirectedEdgeInflow
 * (Zellkanten: a = origin + run*cs, b = origin + (runEnd+1)*cs).
 *
 * @param {Array<{x?:number,y?:number,col?:number,row?:number}>} cells  Zellen AUF dieser Kante
 *   (akzeptiert {x,y} = {col,row}-Indices ODER {col,row})
 * @param {Edge} edge
 * @param {object} header
 * @returns {Array<{a:number,b:number}>}  Welt-Intervalle (sortiert, Läufe gemerged)
 */
export function mergeCellsToIntervals(cells, edge, header) {
    if (!cells || cells.length === 0) return [];
    const { xll, yll } = originOf(header);
    const cs = header.cellsize;
    const { vertical } = edgeAxis(header, edge);
    const origin = vertical ? yll : xll;
    // Index entlang der Kante: W/E variiert über row, S/N über col
    const idxOf = (c) => {
        const col = c.col !== undefined ? c.col : c.x;
        const row = c.row !== undefined ? c.row : c.y;
        return vertical ? row : col;
    };

    const sorted = [...cells].sort((p, q) => idxOf(p) - idxOf(q));
    const intervals = [];
    let runStart = null, runPrev = null;
    const flush = () => {
        if (runStart === null) return;
        intervals.push({ a: origin + runStart * cs, b: origin + (runPrev + 1) * cs });
    };
    for (const c of sorted) {
        const k = idxOf(c);
        if (runStart === null) { runStart = k; runPrev = k; continue; }
        if (k === runPrev) continue;             // Duplikat überspringen
        if (k === runPrev + 1) { runPrev = k; continue; } // Lauf fortsetzen
        flush(); runStart = k; runPrev = k;       // neuer Lauf
    }
    flush();
    return intervals;
}

/**
 * Alte Boundaries auf das Kanten-Segment-Modell migrieren (idempotent, rein).
 *
 *  - Fehlt `properties.edge`: Geometrie an die nächste Kante snappen (snapToNearestEdge);
 *    bei Treffer edge setzen + Koordinaten auf die Kante projizieren, sonst edge=null.
 *  - Bereits gesetzte `edge` bleibt unangetastet (neue Projekte / erneutes Laden).
 *  - Veraltete Assignment-Felder `inflowMode`/`direction` werden entfernt.
 *
 * Mutiert die übergebenen Objekte in-place. Gibt eine Statistik zurück.
 *
 * @param {{features:Array}} boundariesFC  GeoJSON FeatureCollection (geoStore.boundaries)
 * @param {Object<string,object>} assignments  hyd.assignments
 * @param {object} header  Raster-Header
 * @returns {{ snapped:number, interior:number, fieldsStripped:number }}
 */
export function migrateBoundaries(boundariesFC, assignments, header) {
    const stats = { snapped: 0, interior: 0, fieldsStripped: 0 };
    const features = boundariesFC?.features || [];

    for (const f of features) {
        if (!f.properties) f.properties = {};
        if (f.properties.edge === undefined) {
            if (f.geometry?.type === 'LineString' && header) {
                const { edge, snappedCoords } = snapToNearestEdge(f.geometry.coordinates, header, 1.5);
                f.properties.edge = edge;
                if (edge) { f.geometry.coordinates = snappedCoords; stats.snapped++; }
                else stats.interior++;
            } else {
                f.properties.edge = null; // Punkte/Polygone: Innenquelle
                stats.interior++;
            }
        }
    }

    for (const id of Object.keys(assignments || {})) {
        const a = assignments[id];
        if (!a) continue;
        if ('inflowMode' in a) { delete a.inflowMode; stats.fieldsStripped++; }
        if ('direction' in a) { delete a.direction; stats.fieldsStripped++; }
    }

    return stats;
}
