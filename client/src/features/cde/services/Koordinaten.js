/**
 * Koordinaten — der Ladeversatz, an einer Stelle geprüft (Stufe 13.0).
 *
 * DER ANLASS: `IfcEngine.getAllCoordOffsets()` lieferte `[x, y, z]`, die
 * Verbraucher griffen mit `.x`/`.y`/`.z` zu, und ein Array antwortet darauf mit
 * `undefined` — ohne zu werfen. Vier Ausgaben wurden dadurch still falsch, zwei
 * davon sichtbar in Produktion (DXF voller `NaN`, „m NN"-Achse mit Welt-Y).
 *
 * Die Form ist jetzt vereinheitlicht. Aber dieselbe Rechnung stand an ZWEI
 * Stellen unabhängig voneinander —
 *
 *     LaengsschnittBuilder.js:156   const firstOff = Object.values(coordOffsets ?? {})[0];
 *     usePlanExport.js:40           const alle = api.getAllCoordOffsets?.() ?? {};
 *
 * — und beide waren gleich falsch. Zwei Wege zu derselben Zahl, wieder. Deshalb
 * steht sie ab hier einmal hier, mit einer echten Prüfung statt eines
 * `??`-Rückfalls: ein Array ist truthy, der Rückfall sprang deshalb nie an.
 *
 * Rein, ohne Vue, ohne Engine.
 */

/** Trägt das wirklich drei Zahlen? Ein Array besteht diese Prüfung NICHT. */
export function istVersatz(v) {
    if (!v || Array.isArray(v)) return false;
    return ['x', 'y', 'z'].every(k => Number.isFinite(v[k]));
}

/** Nullversatz — die ehrliche Antwort, wenn keiner bekannt ist. */
export const OHNE_VERSATZ = Object.freeze({ x: 0, y: 0, z: 0 });

/**
 * Der Versatz des ersten Modells aus `getAllCoordOffsets()`.
 *
 * BEWUSST „das erste": bei mehreren Modellen entscheidet heute die
 * Ladereihenfolge, was das Bezugssystem ist (`IfcEngine.js:201`). Das ist eine
 * Schwäche, aber eine BEKANNTE — sie hier zu verstecken wäre schlimmer als sie
 * zu benennen. Mit der Georeferenz (Stufe 13.1) wird sie ableitbar.
 *
 * @returns {{x, y, z}} nie null — im Zweifel der Nullversatz
 */
export function ersterVersatz(alle) {
    const erster = Object.values(alle ?? {})[0];
    return istVersatz(erster) ? erster : OHNE_VERSATZ;
}

/** Die Höhenkomponente — `m NN = welt.y + versatz.y` (siehe Hoehenbezug.js). */
export function hoehenversatzAus(alle) {
    return ersterVersatz(alle).y;
}
