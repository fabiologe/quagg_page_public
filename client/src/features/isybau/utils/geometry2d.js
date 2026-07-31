/**
 * Kleine 2D-Geometrie-Helfer, geteilt zwischen dem Höhenlinien-Hover
 * (useContourGpuLayer.js) und dem Flächen-Snapping (store/index.js
 * addDrawingPoint) — beide brauchen "nächster Punkt auf einer Strecke".
 */

/** Quadrierter Abstand (ohne sqrt) — für reine Vergleiche günstiger. */
export function distSq(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
    return Math.sqrt(distSq(ax, ay, bx, by));
}

/**
 * Nächster Punkt auf der Strecke a→b zu Punkt p (Lotfußpunkt, auf die
 * Strecke geklemmt — kein unendliches Lot).
 * @returns {{x:number, y:number}}
 */
export function closestPointOnSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq === 0) return { x: ax, y: ay }; // entartete Strecke (a === b)
    let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return { x: ax + t * abx, y: ay + t * aby };
}

export function distanceToSegment(px, py, ax, ay, bx, by) {
    const cp = closestPointOnSegment(px, py, ax, ay, bx, by);
    return dist(px, py, cp.x, cp.y);
}
