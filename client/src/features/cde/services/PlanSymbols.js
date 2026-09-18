/**
 * PlanSymbols — papierfeste Punktsymbole für den Tiefbau-Lageplan (Sprint T1).
 *
 * Ein Schacht ist im Lageplan kein projiziertes 3D-Polygon, sondern ein
 * Symbol (Kreis + Diagonalkreuz, DIN-2425-nah). Der Plotter unterdrückt bei
 * aktivem `symbol`-Stilfeld die Element-Kontur und zeichnet stattdessen das
 * Symbol am Papier-Zentrum der Element-BBox — Größe in mm, maßstabsUNabhängig.
 *
 * SEIT TEIL XXIII A5 SIND DIE SYMBOLE DATEN: je Symbol eine Liste von
 * Grundformen im Einheitskreis (Radius 1, y nach unten wie auf dem Papier) —
 * `kreis`, `linie`, `dreieck`, `rechteck`. `drawPlanSymbol` deutet sie; ein
 * Symbol aus der Bibliothek ist ein weiterer Eintrag derselben Form, geprüft
 * vom Katalogschema. Titel und Kürzel stehen am Eintrag, nicht in einer
 * zweiten Tabelle der Ansicht.
 *
 * Reines Zeichenmodul: nur jsPDF-Primitive (line/circle/triangle/rect),
 * testbar mit einem Mock-doc, das die Aufrufe aufzeichnet.
 */

const S45 = Math.SQRT1_2;

/** Die Grundformen, die ein Symbol nennen darf. */
export const SYMBOL_FORMEN = Object.freeze(['kreis', 'linie', 'dreieck', 'rechteck']);

export const EINGEBAUTE_SYMBOLE = Object.freeze([
    /** Schacht: Kreis + Diagonalkreuz (Lageplan-Konvention). */
    { id: 'schacht', titel: 'Schacht', kurz: 'S', formen: [
        { art: 'kreis', r: 1 },
        { art: 'linie', von: [-S45, -S45], bis: [S45, S45] },
        { art: 'linie', von: [-S45, S45], bis: [S45, -S45] },
    ] },
    /** Pumpe: Kreis mit gefülltem Dreieck (Förderrichtung nach oben). */
    { id: 'pumpe', titel: 'Pumpe', kurz: 'P', formen: [
        { art: 'kreis', r: 1 },
        { art: 'dreieck', punkte: [[0, -0.65], [-0.55, 0.45], [0.55, 0.45]], gefuellt: true },
    ] },
    /** Straßeneinlauf: Rechteck, untere Hälfte gefüllt. */
    { id: 'einlauf', titel: 'Straßeneinlauf', kurz: 'E', formen: [
        { art: 'rechteck', x: -0.8, y: -0.55, b: 1.6, h: 1.1 },
        { art: 'rechteck', x: -0.8, y: 0, b: 1.6, h: 0.55, gefuellt: true },
    ] },
    /** Hydrant: Kreis mit Querbalken. */
    { id: 'hydrant', titel: 'Hydrant', kurz: 'H', formen: [
        { art: 'kreis', r: 1 },
        { art: 'linie', von: [-1, 0], bis: [1, 0] },
        { art: 'linie', von: [-0.5, -0.6], bis: [0.5, -0.6] },
    ] },
    /** Armatur/Schieber: Doppeldreieck (Bowtie). */
    { id: 'armatur', titel: 'Armatur', kurz: 'A', formen: [
        { art: 'dreieck', punkte: [[-1, -0.6], [-1, 0.6], [0, 0]], gefuellt: true },
        { art: 'dreieck', punkte: [[1, -0.6], [1, 0.6], [0, 0]], gefuellt: true },
    ] },
    /** Pfosten (A4/A5): ein gefülltes Quadrat — Leitpfosten, Poller, Schild. */
    { id: 'pfosten', titel: 'Pfosten', kurz: 'L', formen: [
        { art: 'rechteck', x: -0.5, y: -0.5, b: 1, h: 1, gefuellt: true },
    ] },
]);

// ── Register: eingebaut zuerst, dann die Bibliothek ─────────────────────────
const _eingebaut = new Map(EINGEBAUTE_SYMBOLE.map(s => [s.id, s]));
let _registriert = new Map();

/** Symbole aus der Bibliothek — ERSETZT den bisherigen Satz; eingebaute Ids bleiben eingebaut. */
export function registriereSymbole(liste) {
    _registriert = new Map((liste ?? []).filter(s => s?.id && !_eingebaut.has(s.id)).map(s => [s.id, s]));
}

/** Ein Symbol nach Id — oder null. */
export function symbolNach(id) {
    return _eingebaut.get(id) ?? _registriert.get(id) ?? null;
}

/** Alle Symbole, eingebaute zuerst. */
export function planSymbole() {
    return [...EINGEBAUTE_SYMBOLE, ..._registriert.values()];
}

/**
 * @param {jsPDF} doc
 * @param {string} name   Id eines Symbols (`symbolNach`)
 * @param {number} cx     Zentrum X (Papier-mm)
 * @param {number} cy     Zentrum Y (Papier-mm)
 * @param {number} sizeMm Symbol-Durchmesser in mm
 * @param {{r,g,b}} rgb   Linienfarbe
 * @returns {boolean}     false wenn unbekanntes Symbol (Caller behält Kontur)
 */
export function drawPlanSymbol(doc, name, cx, cy, sizeMm, rgb) {
    const r = Math.max(0.6, sizeMm / 2);
    const sym = symbolNach(name);
    if (!sym) return false;

    doc.setDrawColor(rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([], 0);
    const X = (u) => cx + r * u, Y = (v) => cy + r * v;
    let fuellung = false;
    for (const f of sym.formen) {
        const stil = f.gefuellt ? 'F' : 'S';
        // Die Füllfarbe EINMAL, vor der ersten gefüllten Form — wie bisher.
        if (f.gefuellt && !fuellung) { doc.setFillColor(rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0); fuellung = true; }
        if (f.art === 'kreis') doc.circle(cx, cy, r * (f.r ?? 1), stil);
        else if (f.art === 'linie') doc.line(X(f.von[0]), Y(f.von[1]), X(f.bis[0]), Y(f.bis[1]));
        else if (f.art === 'dreieck') {
            const [a, b, c] = f.punkte;
            doc.triangle(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), X(c[0]), Y(c[1]), stil);
        } else if (f.art === 'rechteck') doc.rect(X(f.x), Y(f.y), r * f.b, r * f.h, stil);
    }
    return true;
}

/** Die eingebauten Namen — für Stil-Editor und Vorgaben, die zur Ladezeit feststehen. */
export const PLAN_SYMBOL_NAMES = Object.freeze(EINGEBAUTE_SYMBOLE.map(s => s.id));
