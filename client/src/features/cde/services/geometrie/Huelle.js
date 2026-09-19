/**
 * Die HÜLLE eines Bauteils aus seinen Grenzen — Anker, Unter- und Oberkante.
 *
 * Eine Rechnung für zwei Quellen (Teil XXIV, K3): die Box, die fragments für
 * ein gebautes Bauteil liefert (`IfcAutor.huelleAusBox`), und die Box der
 * Rezeptgeometrie, die der Kommandoweg ohne Oberfläche rechnet
 * (`kommando/Subjekt.js`). Gemessen im Browser (2026-09-18, 42069): beide
 * Boxen eines eigenen Rohrs und Schachts sind bitgleich — gleich bleiben sie
 * nur, solange die Formel an einer Stelle steht.
 *
 * Der Anker ist die Mitte, die Unterkante die Bezugshöhe, mit der im Tiefbau
 * gearbeitet wird (bei einem Rohr mit Gefälle die Unterkante am tiefen Ende —
 * eine Näherung, deshalb heisst sie nicht „Sohle").
 */

/**
 * @param {{x,y,z}} min
 * @param {{x,y,z}} max
 * @returns {{anker:{x,y,z}, unterkante:number, oberkante:number, box:{min,max}}|null}
 */
export function huelleAusGrenzen(min, max) {
    if (!min || !max) return null;
    const w = [min.x, min.y, min.z, max.x, max.y, max.z];
    if (!w.every(Number.isFinite) || min.x > max.x || min.y > max.y || min.z > max.z) return null;
    return {
        anker: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 },
        unterkante: min.y,
        oberkante: max.y,
        box: { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } },
    };
}
