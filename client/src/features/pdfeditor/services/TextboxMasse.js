/**
 * TextboxMasse — Geometrie eines Textfelds im Seiten-Punktraum.
 *
 * Textfelder haben in v1 NUR manuelle Zeilenumbrüche (kein Auto-Wrap) —
 * damit sind Bildschirm und Export trivially deckungsgleich: beide zeichnen
 * Zeile für Zeile linksbündig, die Box umschließt die längste Zeile.
 *
 * Die Breitenmessung ist injizierbar: der Canvas-Adapter misst mit
 * measureText, der pdf-lib-Adapter mit widthOfTextAtSize. Für Overlay und
 * Treffer-Tests misst `messeTextBreitePt` über ein Offscreen-Canvas
 * (Fallback 0,55 em je Zeichen in Tests/ohne DOM — die bewährte Schätzung
 * aus CanvasDoc).
 */

export const TEXTBOX_POLSTER_PT = 4;
export const TEXTBOX_ZEILENHOEHE = 1.3;
export const TEXTBOX_SCHRIFT = "Helvetica, Arial, sans-serif";

let _messCtx = null;

/** Zeilenbreite in Punkten (Font-Größe in pt, 1 px ≙ 1 pt bei Skala 1). */
export function messeTextBreitePt(text, groessePt) {
    if (typeof document !== 'undefined') {
        if (!_messCtx) _messCtx = document.createElement('canvas').getContext('2d');
        if (_messCtx) {
            _messCtx.font = `${groessePt}px ${TEXTBOX_SCHRIFT}`;
            return _messCtx.measureText(text).width;
        }
    }
    return text.length * groessePt * 0.55;
}

export function textboxZeilen(text) {
    return String(text ?? '').split('\n');
}

/**
 * @param {{text: string, schriftGroessePt: number}} annot
 * @param {(text: string, groessePt: number) => number} [messeBreite]
 * @returns {{zeilen: string[], breite: number, hoehe: number}} inkl. Polster
 */
export function textboxMasse(annot, messeBreite = messeTextBreitePt) {
    const zeilen = textboxZeilen(annot.text);
    const g = annot.schriftGroessePt;
    let maxBreite = 0;
    for (const z of zeilen) {
        maxBreite = Math.max(maxBreite, messeBreite(z, g));
    }
    return {
        zeilen,
        breite: Math.max(maxBreite, g) + 2 * TEXTBOX_POLSTER_PT,
        hoehe: zeilen.length * g * TEXTBOX_ZEILENHOEHE + 2 * TEXTBOX_POLSTER_PT,
    };
}
