/**
 * TextRects — aus den Client-Rects einer Textauswahl werden saubere
 * ZEILENBOXEN: Browser liefern je Textknoten/Span ein eigenes Rect,
 * oft überlappend und fragmentiert; markiert werden soll aber die Zeile.
 *
 * Alle Koordinaten in Seitenpunkten.
 */

/**
 * @param {Array<{x:number, y:number, w:number, h:number}>} rects
 * @returns {Array<{x:number, y:number, w:number, h:number}>} eine Box je Zeile
 */
export function vereinigeZeilenRects(rects) {
    const gueltig = rects.filter(r => r.w > 0.1 && r.h > 0.1);
    if (!gueltig.length) return [];

    // Nach Zeilenmitte sortieren, dann clustern: gleiche Zeile = die
    // vertikale Überlappung deckt mehr als die Hälfte des kleineren Rects.
    const sortiert = [...gueltig].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    const zeilen = [];
    for (const r of sortiert) {
        const letzte = zeilen[zeilen.length - 1];
        if (letzte && _gleicheZeile(letzte, r)) {
            letzte.x2 = Math.max(letzte.x2, r.x + r.w);
            letzte.x = Math.min(letzte.x, r.x);
            letzte.y2 = Math.max(letzte.y2, r.y + r.h);
            letzte.y = Math.min(letzte.y, r.y);
        } else {
            zeilen.push({ x: r.x, y: r.y, x2: r.x + r.w, y2: r.y + r.h });
        }
    }
    return zeilen.map(z => ({ x: z.x, y: z.y, w: z.x2 - z.x, h: z.y2 - z.y }));
}

function _gleicheZeile(zeile, r) {
    const ueberlappung = Math.min(zeile.y2, r.y + r.h) - Math.max(zeile.y, r.y);
    const kleinere = Math.min(zeile.y2 - zeile.y, r.h);
    return ueberlappung > kleinere * 0.5;
}

/** Trifft ein Punkt (mit Radius) eine der Boxen? (Radierer auf Text-Highlights) */
export function trifftRects(rects, x, y, radius = 0) {
    return rects.some(r =>
        x >= r.x - radius && x <= r.x + r.w + radius &&
        y >= r.y - radius && y <= r.y + r.h + radius);
}
