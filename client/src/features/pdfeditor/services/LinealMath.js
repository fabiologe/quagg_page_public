/**
 * LinealMath — Geometrie des OneNote-artigen Lineals, aber maßstabsgetreu:
 * die Zeichenkante ist eine Gerade im Seiten-Punktraum, Striche in Kanten-
 * nähe werden auf sie projiziert, und die Skalenstriche kommen aus der
 * Kalibrierung (realProPt), nicht aus Pixeln — Zoom ändert nur die
 * Tick-DICHTE, nie die Werte.
 */

/** Winkel-Magnetraste: nahe der üblichen Konstruktionswinkel einrasten. */
const RASTEN = [0, 30, 45, 60, 90, 120, 135, 150, 180];

export function rasteWinkel(grad, toleranz = 2) {
    const norm = ((grad % 180) + 180) % 180;
    for (const r of RASTEN) {
        if (Math.abs(norm - r) <= toleranz) return r % 180;
    }
    return norm;
}

/**
 * Zeichenkante als Gerade: Anker + Einheitsrichtung.
 * Winkel in Grad, 0 = horizontal, positiv = im Uhrzeigersinn (Seitenraum,
 * y nach unten — deckt sich mit CSS rotate()).
 */
export function kantenLinie(lineal) {
    const rad = (lineal.winkelGrad * Math.PI) / 180;
    return { px: lineal.x, py: lineal.y, rx: Math.cos(rad), ry: Math.sin(rad) };
}

/** Senkrechter Abstand eines Punkts zur Kante (Punkte). */
export function abstandZurKante(x, y, linie) {
    return Math.abs(-(x - linie.px) * linie.ry + (y - linie.py) * linie.rx);
}

/** Punkt senkrecht auf die Kante projizieren. */
export function projiziereAufKante(x, y, linie) {
    const t = (x - linie.px) * linie.rx + (y - linie.py) * linie.ry;
    return [linie.px + t * linie.rx, linie.py + t * linie.ry];
}

// ── Skalenstriche ────────────────────────────────────────────────────────────

const LEITER_M = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
const LEITER_CM_PAPIER = [0.5, 1, 2, 5, 10, 20];
export const PT_PRO_CM = 72 / 2.54;

/**
 * Wählt den kleinsten Skalenschritt, dessen Tick-Abstand auf dem Bildschirm
 * mindestens `minPx` beträgt.
 *
 * @param {{realProPt: number}|null} kal   Kalibrierung der Seite oder null
 * @param {number} zoom                    CSS-px je Seitenpunkt
 * @returns {{wert: number, laengePt: number, einheit: 'm'|'cm'}}
 *   einheit 'cm' = Papier-Zentimeter (unkalibrierter Rückfall)
 */
export function tickSchritt(kal, zoom, minPx = 40) {
    if (kal?.realProPt > 0) {
        for (const wert of LEITER_M) {
            const laengePt = wert / kal.realProPt;
            if (laengePt * zoom >= minPx) return { wert, laengePt, einheit: 'm' };
        }
        const wert = LEITER_M[LEITER_M.length - 1];
        return { wert, laengePt: wert / kal.realProPt, einheit: 'm' };
    }
    for (const wert of LEITER_CM_PAPIER) {
        const laengePt = wert * PT_PRO_CM;
        if (laengePt * zoom >= minPx) return { wert, laengePt, einheit: 'cm' };
    }
    const wert = LEITER_CM_PAPIER[LEITER_CM_PAPIER.length - 1];
    return { wert, laengePt: wert * PT_PRO_CM, einheit: 'cm' };
}
