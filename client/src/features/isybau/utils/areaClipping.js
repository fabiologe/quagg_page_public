/**
 * Flächen-Clipping/-Snapping — verhindert überlappende Flächen (clipNewArea)
 * und Lücken zwischen angrenzenden Flächen (snapPoint) beim Zeichnen.
 *
 * polygon-clipping erwartet Ringe als [x,y]-Paare (kein {x,y}), geschlossen
 * (erster == letzter Punkt), und liefert MultiPolygon = Polygon[] = Ring[][]
 * zurück (Polygon[0] = äußerer Ring, weitere = Löcher). Area.points selbst
 * ist ein einfacher, offener Ring aus {x,y}-Objekten ohne Löcher — die
 * Konvertierung passiert nur hier, an der Compiler-Grenze zur externen Lib.
 */
// polygon-clipping ist eine Default-Export-Lib: der Named-Import { difference }
// läuft im Dev-Server (lockerer CJS-Interop), bricht aber den Rollup-
// Produktions-Build ("difference is not exported"). Deshalb Default + Destrukt.
import polygonClipping from 'polygon-clipping';
const { difference } = polygonClipping;
import kinks from '@turf/kinks';
import { closestPointOnSegment, dist } from './geometry2d.js';

// Fragmente kleiner als das (Rundungsartefakte an Clip-Kanten) werden verworfen.
const MIN_FRAGMENT_AREA_M2 = 1;

function toRing(points) {
    const ring = points.map(p => [p.x, p.y]);
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    return ring;
}

function fromRing(ring) {
    return ring.slice(0, -1).map(([x, y]) => ({ x, y })); // letzten (== ersten) Punkt weglassen
}

function shoelaceArea(points) {
    let sum = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const a = points[i], b = points[(i + 1) % n];
        sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
}

/**
 * Clippt ein neu gezeichnetes Flächen-Polygon gegen alle bestehenden Flächen.
 * @param {{x:number,y:number}[]} newPoints
 * @param {Array<{points:{x:number,y:number}[]}>} existingAreas
 * @returns {{x:number,y:number}[][]} 0..n Fragment-Polygone — 0 = komplett
 *   von bestehenden Flächen verdeckt, >1 = von bestehenden Flächen zerschnitten.
 */
export function clipNewArea(newPoints, existingAreas) {
    const clippable = (existingAreas || []).filter(a => a.points?.length >= 3);
    if (clippable.length === 0) return [newPoints];

    const subject = [toRing(newPoints)];
    const clips = clippable.map(a => [toRing(a.points)]);

    let result;
    try {
        result = difference(subject, ...clips);
    } catch (e) {
        // polygon-clipping kann bei degenerierten Eingaben (Selbstüberschneidung
        // in den Punkten) werfen — dann lieber ungeclippt zurückgeben als die
        // ganze Zeicheninteraktion abstürzen zu lassen.
        console.warn('Flächen-Clipping fehlgeschlagen, Fläche wird ungeclippt übernommen:', e.message);
        return [newPoints];
    }

    const fragments = [];
    for (const polygon of result) {
        // Löcher (polygon[1..]) werden hier nicht unterstützt — Area.points ist
        // ein einfacher Ring. Seltener Randfall (neue Fläche umschließt eine
        // bestehende komplett); der äußere Ring wird trotzdem übernommen.
        const points = fromRing(polygon[0]);
        if (shoelaceArea(points) < MIN_FRAGMENT_AREA_M2) continue;
        fragments.push(points);
    }
    return fragments;
}

/**
 * Snapt einen neuen Zeichenpunkt an Vertices/Kanten bestehender Flächen, damit
 * direkt angrenzende Flächen keine Lücke lassen. Vertex-Snap hat Priorität
 * vor Kanten-Snap (Ecken sollen exakt zusammenfallen, nicht knapp danebenliegen).
 * @param {{x:number,y:number}} raw
 * @param {Array<{points:{x:number,y:number}[]}>} existingAreas
 * @param {number} toleranceWorld - Toleranz in Weltmetern (bewusst NICHT
 *   zoomabhängig in Bildschirm-Pixeln — ein fester Meter-Wert ist bei jedem
 *   Zoom gleich vorhersehbar).
 * @returns {{x:number,y:number}}
 */
export function snapPoint(raw, existingAreas, toleranceWorld) {
    const areas = existingAreas || [];
    let best = null;
    let bestDist = toleranceWorld;

    for (const area of areas) {
        for (const p of area.points || []) {
            const d = dist(raw.x, raw.y, p.x, p.y);
            if (d < bestDist) { bestDist = d; best = { x: p.x, y: p.y }; }
        }
    }
    if (best) return best;

    for (const area of areas) {
        const pts = area.points || [];
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            const cp = closestPointOnSegment(raw.x, raw.y, a.x, a.y, b.x, b.y);
            const d = dist(raw.x, raw.y, cp.x, cp.y);
            if (d < bestDist) { bestDist = d; best = cp; }
        }
    }
    return best || raw;
}

/**
 * Prüft, ob ein Polygon sich selbst überschneidet (entartete Form nach z.B.
 * einem Eckpunkt-Drag über eine andere Kante hinweg) — für C2-Vertex-Editing
 * in store.updateAreaPoint().
 * @param {{x:number,y:number}[]} points
 * @returns {boolean}
 */
export function hasSelfIntersection(points) {
    if (points.length < 3) return false;
    const result = kinks({ type: 'Polygon', coordinates: [toRing(points)] });
    return result.features.length > 0;
}
