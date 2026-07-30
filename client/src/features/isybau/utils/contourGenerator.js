/**
 * Marching Squares: berechnet Höhenlinien-Liniensegmente aus einem
 * rechteckigen Höhenraster (row-major). marchingSquares() selbst liefert
 * unverkettete Zell-Segmente (einfacher, unabhängig pro Zelle); die
 * Verkettung benachbarter Segmente zu durchgehenden Polylinien passiert
 * separat in stitchSegmentsToPolylines() — siehe dort für die Begründung
 * (Performance, nicht nur Kosmetik).
 *
 * Edge-Indizes je Zelle: 0=top, 1=right, 2=bottom, 3=left.
 * Case-Bits (gesetzt = Eckpunkt-Wert > Level): 8=TL, 4=TR, 2=BR, 1=BL.
 */

function interp(v0, v1, level) {
    if (v1 === v0) return 0.5;
    return (level - v0) / (v1 - v0);
}

// Fälle 5 und 10 sind Sattelpunkte (zwei diagonal gegenüberliegende Ecken
// über dem Level) — hier als zwei getrennte Linien aufgelöst statt
// Mittelwert-Disambiguierung; für eine Lernvisualisierung ausreichend genau.
const CASES = {
    1: [[2, 3]],
    2: [[1, 2]],
    3: [[1, 3]],
    4: [[0, 1]],
    5: [[0, 1], [2, 3]],
    6: [[0, 2]],
    7: [[0, 3]],
    8: [[0, 3]],
    9: [[0, 2]],
    10: [[0, 3], [1, 2]],
    11: [[0, 1]],
    12: [[1, 3]],
    13: [[1, 2]],
    14: [[2, 3]]
};

/**
 * @param {Float32Array|number[]} raster - row-major, Länge width*height.
 *   NaN-Zellen gelten als "keine Daten" (z.B. NODATA-Bereiche eines
 *   hochgeladenen DGM außerhalb der Vermessung) — sie fließen weder in
 *   min/max noch in irgendeine Zelle ein (jede Zelle mit >=1 NaN-Eckpunkt
 *   wird komplett übersprungen). Terrarium-Raster enthalten nie NaN, das
 *   Verhalten für den bestehenden Pfad ist damit unverändert.
 * @param {number} width
 * @param {number} height
 * @param {number} interval - Höhenlinien-Abstand in Metern (> 0)
 * @returns {Array<{elevation:number, x1:number,y1:number,x2:number,y2:number}>}
 *   Koordinaten als fraktionale Pixel-Indizes (x=Spalte, y=Zeile).
 */
export function marchingSquares(raster, width, height, interval) {
    if (width < 2 || height < 2 || !(interval > 0)) return [];

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < raster.length; i++) {
        const v = raster[i];
        if (Number.isNaN(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

    const firstLevel = Math.ceil(min / interval) * interval;
    const segments = [];

    for (let level = firstLevel; level <= max; level += interval) {
        for (let row = 0; row < height - 1; row++) {
            for (let col = 0; col < width - 1; col++) {
                const tl = raster[row * width + col];
                const tr = raster[row * width + col + 1];
                const bl = raster[(row + 1) * width + col];
                const br = raster[(row + 1) * width + col + 1];

                if (Number.isNaN(tl) || Number.isNaN(tr) || Number.isNaN(bl) || Number.isNaN(br)) continue;

                let caseIndex = 0;
                if (tl > level) caseIndex |= 8;
                if (tr > level) caseIndex |= 4;
                if (br > level) caseIndex |= 2;
                if (bl > level) caseIndex |= 1;

                const pairs = CASES[caseIndex];
                if (!pairs) continue; // 0 oder 15: Zelle komplett unter/über dem Level

                const top = { x: col + interp(tl, tr, level), y: row };
                const right = { x: col + 1, y: row + interp(tr, br, level) };
                const bottom = { x: col + interp(bl, br, level), y: row + 1 };
                const left = { x: col, y: row + interp(tl, bl, level) };
                const edgePoints = [top, right, bottom, left];

                for (const [a, b] of pairs) {
                    const p1 = edgePoints[a];
                    const p2 = edgePoints[b];
                    segments.push({ elevation: level, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
                }
            }
        }
    }

    return segments;
}

/**
 * Bildet Pixel-Segmente (aus marchingSquares) über eine beliebige
 * Koordinatenfunktion in Ziel-Koordinaten ab (z.B. lokale ISYBAU-Meter).
 * @param {Array<{elevation:number,x1:number,y1:number,x2:number,y2:number}>} segments
 * @param {(col:number,row:number) => [number,number]} pixelToLocalFn
 * @returns {Array<{elevation:number, points:[{x:number,y:number},{x:number,y:number}]}>}
 */
export function segmentsToLocalCoords(segments, pixelToLocalFn) {
    return segments.map((seg) => {
        const [x1, y1] = pixelToLocalFn(seg.x1, seg.y1);
        const [x2, y2] = pixelToLocalFn(seg.x2, seg.y2);
        return { elevation: seg.elevation, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] };
    });
}

/**
 * Gruppiert lokale Kontur-Segmente nach Höhenlinie — für effizientes
 * Rendering als EIN <path>-Element pro Level (mehrere "M..L.."-Anweisungen
 * in einem Pfad) statt tausender einzelner <line>-Elemente. Bei dichten
 * Höhenrastern ist die Segmentanzahl leicht fünfstellig; ein Element pro
 * Segment lässt SVG-Pan/Zoom spürbar ruckeln, ein Element pro Level nicht.
 * @param {Array<{elevation:number, points:[{x,y},{x,y}]}>} localSegments
 * @returns {Array<{elevation:number, segments:Array<{points:[{x,y},{x,y}]}>}>} nach elevation sortiert
 */
export function groupSegmentsByElevation(localSegments) {
    const byLevel = new Map();
    for (const seg of localSegments) {
        if (!byLevel.has(seg.elevation)) byLevel.set(seg.elevation, []);
        byLevel.get(seg.elevation).push(seg);
    }
    return [...byLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([elevation, segments]) => ({ elevation, segments }));
}

/**
 * Verkettet einzelne 2-Punkt-Segmente zu durchgehenden Polylinien, wo
 * benachbarte Segmente exakt denselben Endpunkt teilen. Bei Rasterdaten ist
 * das an jeder inneren Zellgrenze der Fall: die geteilte Kante zweier
 * Nachbarzellen interpoliert über DIESELBEN Rasterwerte mit DERSELBEN
 * Formel, das Ergebnis ist bitgenau identisch (kein Toleranzvergleich
 * nötig). Ohne Verkettung erzeugt eine einzige durchgehende Höhenlinie über
 * z.B. 500 Rasterzellen 500 separate "M..L.."-Subpaths — jeder Subpath-
 * Wechsel ist für den SVG-Renderer beim Nachzeichnen/Kompositieren teurer
 * als eine reine Linienfortsetzung, das machte sich beim Pannen bemerkbar
 * (Nutzer-Feedback, nachdem DOM-Batching und non-scaling-stroke-Entfernung
 * schon halfen, aber nicht ausreichten).
 * @param {Array<{points:[{x,y},{x,y}]}>} segments
 * @returns {Array<Array<{x:number,y:number}>>} Liste von Punktketten
 */
export function stitchSegmentsToPolylines(segments) {
    const key = (p) => `${p.x},${p.y}`;
    const pointMap = new Map();
    for (const seg of segments) {
        const k0 = key(seg.points[0]);
        const k1 = key(seg.points[1]);
        if (!pointMap.has(k0)) pointMap.set(k0, []);
        if (!pointMap.has(k1)) pointMap.set(k1, []);
        pointMap.get(k0).push(seg);
        pointMap.get(k1).push(seg);
    }

    const used = new Set();

    const findUnusedNeighbor = (pointKey) => {
        const candidates = pointMap.get(pointKey) || [];
        for (const cand of candidates) {
            if (!used.has(cand)) return cand;
        }
        return null;
    };
    const otherEndpoint = (seg, pointKey) => {
        const [p0, p1] = seg.points;
        return key(p0) === pointKey ? p1 : p0;
    };

    const polylines = [];
    for (const seg of segments) {
        if (used.has(seg)) continue;
        used.add(seg);
        const polyline = [seg.points[0], seg.points[1]];

        // Vorwärts ans Ende anhängen
        let tailKey = key(polyline[polyline.length - 1]);
        let next = findUnusedNeighbor(tailKey);
        while (next) {
            const p = otherEndpoint(next, tailKey);
            polyline.push(p);
            used.add(next);
            tailKey = key(p);
            next = findUnusedNeighbor(tailKey);
        }

        // Rückwärts vorne anfügen (falls das Start-Segment mitten in einer Kette lag)
        let headKey = key(polyline[0]);
        let prev = findUnusedNeighbor(headKey);
        while (prev) {
            const p = otherEndpoint(prev, headKey);
            polyline.unshift(p);
            used.add(prev);
            headKey = key(p);
            prev = findUnusedNeighbor(headKey);
        }

        polylines.push(polyline);
    }

    return polylines;
}

function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        const ddx = point.x - lineStart.x, ddy = point.y - lineStart.y;
        return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq;
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    const ddx = point.x - projX, ddy = point.y - projY;
    return Math.sqrt(ddx * ddx + ddy * ddy);
}

/**
 * Douglas-Peucker-Vereinfachung: entfernt Punkte, die weniger als `epsilon`
 * (Meter) von der direkten Verbindungslinie ihrer Nachbarn abweichen. Selbst
 * nach der Verkettung (stitchSegmentsToPolylines) bleiben oft tausende
 * Punkte pro Höhenlinie übrig, viele davon fast kollinear (das Raster
 * erzeugt einen Punkt pro Zellkreuzung, unabhängig davon, ob die Kontur an
 * der Stelle wirklich die Richtung ändert) — für eine Hintergrund-
 * Referenzlinie unnötige Geometrie, die der Renderer bei jedem Repaint
 * trotzdem mitschleppt.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} epsilon Toleranz in Metern
 * @returns {Array<{x:number,y:number}>}
 */
export function simplifyPolyline(points, epsilon) {
    if (points.length < 3) return points;

    let maxDist = 0;
    let maxIndex = 0;
    const start = points[0];
    const end = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistance(points[i], start, end);
        if (dist > maxDist) {
            maxDist = dist;
            maxIndex = i;
        }
    }

    if (maxDist > epsilon) {
        const left = simplifyPolyline(points.slice(0, maxIndex + 1), epsilon);
        const right = simplifyPolyline(points.slice(maxIndex), epsilon);
        return left.slice(0, -1).concat(right);
    }
    return [start, end];
}

