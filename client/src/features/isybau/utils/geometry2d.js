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

/**
 * Drehwinkel (Grad) für Beschriftungen entlang einer Linie, so gebracht, dass die
 * Schrift nie auf dem Kopf steht: Ergebnis in −90…+90° (Haltungsnamen im 2D-Viewer).
 */
export function schriftWinkel(winkel) {
    let w = ((Number(winkel) % 360) + 540) % 360 - 180; // → −180…180
    if (w > 90) w -= 180;
    else if (w < -90) w += 180;
    return w === 0 ? 0 : w; // −0 vermeiden
}


/**
 * Achsparallele Hülle eines um `winkel` (Grad) gedrehten Rechtecks (Mitte x/y, Breite b, Höhe h).
 * @returns {{x1:number,y1:number,x2:number,y2:number}}
 */
export function gedrehteHuelle(x, y, b, h, winkel) {
    const r = (winkel * Math.PI) / 180;
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const hx = (c * b + s * h) / 2, hy = (s * b + c * h) / 2;
    return { x1: x - hx, y1: y - hy, x2: x + hx, y2: y + hy };
}

const ueberlappt = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/**
 * Kollisionsfreie Auswahl von Beschriftungen (gierig, wie in der Kartografie üblich):
 * Kandidaten nach Priorität absteigend; ein Kandidat wird genommen, wenn seine Hülle
 * weder ein Hindernis (z. B. Knotenbeschriftung) noch eine schon gesetzte Beschriftung
 * berührt. Haltungsnamen im 2D-Viewer: ohne diese Regel lagen in der Übersicht 28 Namen
 * übereinander (Browserprüfung 2026-09-26).
 * @param {Array<{id:string, huelle:Object, prio:number}>} kandidaten
 * @param {Array<Object>} hindernisse  Hüllen {x1,y1,x2,y2}
 * @returns {Set<string>} IDs der gesetzten Beschriftungen
 */
export function waehleBeschriftungen(kandidaten, hindernisse = []) {
    const gesetzt = [...hindernisse];
    const ids = new Set();
    for (const k of [...kandidaten].sort((a, b) => b.prio - a.prio)) {
        // Hindernisse mit `von` gehören zu einem Kandidaten (z. B. dessen eigener Fließpfeil) und zählen für ihn nicht.
        if (gesetzt.some(h => h.von !== k.id && ueberlappt(h, k.huelle))) continue;
        gesetzt.push(k.huelle);
        ids.add(k.id);
    }
    return ids;
}

/**
 * Wie waehleBeschriftungen, aber je Kandidat mehrere mögliche Plätze (in Wunsch-
 * reihenfolge): genommen wird der erste Platz, dessen Hülle nichts Gesetztes berührt.
 * Reihenfolge der Kandidaten = Vorrang (vom Aufrufer sortiert). Kandidaten mit `fest`
 * werden ohne Prüfung gesetzt (vom Nutzer verschobene Schachtbeschriftungen).
 * @param {Array<{id:string, plaetze:Array<Object>, fest?:boolean}>} kandidaten
 * @param {Array<Object>} hindernisse
 * @returns {{ wahl: Map<string, number>, gesetzt: Array<Object> }} Platz-Index je id (−1 = ausgeblendet)
 *          und alle gesetzten Hüllen (für nachfolgende Beschriftungen als Hindernisse)
 */
export function platziereBeschriftungen(kandidaten, hindernisse = []) {
    const gesetzt = [...hindernisse];
    const wahl = new Map();
    for (const k of kandidaten.filter(k => k.fest)) { gesetzt.push(k.plaetze[0]); wahl.set(k.id, 0); }
    for (const k of kandidaten.filter(k => !k.fest)) {
        const i = k.plaetze.findIndex(p => !gesetzt.some(h => ueberlappt(h, p)));
        wahl.set(k.id, i);
        if (i >= 0) gesetzt.push(k.plaetze[i]);
    }
    return { wahl, gesetzt };
}
