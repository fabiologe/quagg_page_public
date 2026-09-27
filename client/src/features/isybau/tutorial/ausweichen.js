/**
 * Ratte weicht aus, wenn sie ihr eigenes Ziel verdeckt.
 *
 * Gemessen 2026-09-27: In der Datenmaske liegt „Übernehmen“ unten rechts —
 * genau unter der Sprechblase. Die Ratte leuchtete den Knopf an, den sie selbst
 * zudeckte, und der Klick traf die Blase. Jetzt: überschneidet sich die Ratte
 * (an ihrem Stammplatz rechts unten) mit einem hervorgehobenen Element, zieht
 * sie nach links unten.
 */

/** Überschneiden sich zwei Rechtecke ({left, top, right, bottom})? */
export const ueberlappt = (a, b) =>
    !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * @param {Array<{left,top,right,bottom}>} ratte  Rechtecke der Ratte (Blase, Figur) AM STAMMPLATZ
 * @param {Array<{left,top,right,bottom}>} ziele  Rechtecke der hervorgehobenen Elemente
 */
export const mussAusweichen = (ratte, ziele) =>
    ratte.some(r => ziele.some(z => z.right > z.left && z.bottom > z.top && ueberlappt(r, z)));

/** Rechteck um dx verschoben (für den Stammplatz, während die Ratte links steht). */
export const verschoben = (r, dx) => ({ left: r.left + dx, right: r.right + dx, top: r.top, bottom: r.bottom });
