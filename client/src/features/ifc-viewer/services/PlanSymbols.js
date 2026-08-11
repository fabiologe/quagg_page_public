/**
 * PlanSymbols — papierfeste Punktsymbole für den Tiefbau-Lageplan (Sprint T1).
 *
 * Ein Schacht ist im Lageplan kein projiziertes 3D-Polygon, sondern ein
 * Symbol (Kreis + Diagonalkreuz, DIN-2425-nah). Der Plotter unterdrückt bei
 * aktivem `symbol`-Stilfeld die Element-Kontur und zeichnet stattdessen das
 * Symbol am Papier-Zentrum der Element-BBox — Größe in mm, maßstabsUNabhängig.
 *
 * Reines Zeichenmodul: nur jsPDF-Primitive (line/circle/triangle/rect),
 * testbar mit einem Mock-doc, das die Aufrufe aufzeichnet.
 */

/**
 * @param {jsPDF} doc
 * @param {string} name   'schacht' | 'pumpe' | 'einlauf' | 'hydrant' | 'armatur'
 * @param {number} cx     Zentrum X (Papier-mm)
 * @param {number} cy     Zentrum Y (Papier-mm)
 * @param {number} sizeMm Symbol-Durchmesser in mm
 * @param {{r,g,b}} rgb   Linienfarbe
 * @returns {boolean}     false wenn unbekanntes Symbol (Caller behält Kontur)
 */
export function drawPlanSymbol(doc, name, cx, cy, sizeMm, rgb) {
    const r = Math.max(0.6, sizeMm / 2);
    const draw = SYMBOLS[name];
    if (!draw) return false;

    doc.setDrawColor(rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([], 0);
    draw(doc, cx, cy, r, rgb);
    return true;
}

const SIN45 = Math.SQRT1_2;

const SYMBOLS = {
    /** Schacht: Kreis + Diagonalkreuz (Lageplan-Konvention). */
    schacht(doc, cx, cy, r) {
        doc.circle(cx, cy, r, 'S');
        const d = r * SIN45;
        doc.line(cx - d, cy - d, cx + d, cy + d);
        doc.line(cx - d, cy + d, cx + d, cy - d);
    },

    /** Pumpe: Kreis mit gefülltem Dreieck (Förderrichtung nach oben). */
    pumpe(doc, cx, cy, r, rgb) {
        doc.circle(cx, cy, r, 'S');
        doc.setFillColor(rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0);
        doc.triangle(cx, cy - r * 0.65, cx - r * 0.55, cy + r * 0.45, cx + r * 0.55, cy + r * 0.45, 'F');
    },

    /** Straßeneinlauf: Rechteck, untere Hälfte gefüllt. */
    einlauf(doc, cx, cy, r, rgb) {
        const w = r * 1.6, h = r * 1.1;
        doc.rect(cx - w / 2, cy - h / 2, w, h, 'S');
        doc.setFillColor(rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0);
        doc.rect(cx - w / 2, cy, w, h / 2, 'F');
    },

    /** Hydrant: Kreis mit Querbalken. */
    hydrant(doc, cx, cy, r) {
        doc.circle(cx, cy, r, 'S');
        doc.line(cx - r, cy, cx + r, cy);
        doc.line(cx - r * 0.5, cy - r * 0.6, cx + r * 0.5, cy - r * 0.6);
    },

    /** Armatur/Schieber: Doppeldreieck (Bowtie). */
    armatur(doc, cx, cy, r, rgb) {
        doc.setFillColor(rgb?.r ?? 0, rgb?.g ?? 0, rgb?.b ?? 0);
        doc.triangle(cx - r, cy - r * 0.6, cx - r, cy + r * 0.6, cx, cy, 'F');
        doc.triangle(cx + r, cy - r * 0.6, cx + r, cy + r * 0.6, cx, cy, 'F');
    },
};

export const PLAN_SYMBOL_NAMES = Object.freeze(Object.keys(SYMBOLS));
