// Netz-Vorfüllung: übersetzt EINEN Ingenieurs-Wert („Netz ist zu f·100 % ausgelastet,
// bevor es regnet") unter der Haube in physikalisch konsistente SWMM-Anfangsbedingungen —
// OHNE dass Tagesganglinien/DWF-Patterns gepflegt werden müssen. Bewusst getrennt vom
// individuellen Initialzustand einzelner Bauwerke (Becken-InitDepth = eigenes Thema).
//
// Physik: f = Q/Q_voll je Haltung (Manning). Daraus folgen
//   - der konstante Basisabfluss je Knoten (Bilanz: Σ f·Q_voll ab − Σ f·Q_voll zu),
//     der die Auslastung DAUERHAFT trägt (Export als [DWF]),
//   - die Teilfüllungstiefe y aus der Teilfüllungskurve (Q/Q_voll → y/H, unabhängig
//     von n und Gefälle) für InitFlow/InitDepth, damit der Lauf ohne Auffüll-
//     Transiente startet.
//
// Alle Funktionen sind rein (Node-testbar). Formen: Kreis/Rechteck/Trapez exakt,
// Ei/Maul/Sonstige als Kreis-Näherung über die Profilhöhe.

const TWO_THIRDS = 2 / 3;

/** Benetzte Fläche A und benetzter Umfang P bei Fülltiefe y (0..H). */
export function partialSection(shape, H, W, y) {
    const h = Math.max(1e-9, H);
    const yy = Math.min(Math.max(y, 0), h);
    const s = String(shape || '').toUpperCase();

    if (s.startsWith('RECT')) {
        const w = W > 0 ? W : h;
        return { A: w * yy, P: w + 2 * yy };
    }
    if (s === 'TRAPEZOIDAL') {
        const w = W > 0 ? W : h;          // Sohlbreite
        const m = 1.5;                    // Böschungsneigung (SwmmBuilder-Default geom3/4)
        return { A: yy * (w + m * yy), P: w + 2 * yy * Math.sqrt(1 + m * m) };
    }
    // Kreis (und Kreis-Näherung für EGG/ARCH/…): Kreisabschnitt mit D = H
    const D = h;
    const ratio = Math.min(Math.max(yy / D, 0), 1);
    const theta = 2 * Math.acos(1 - 2 * ratio);
    return { A: (D * D / 8) * (theta - Math.sin(theta)), P: (D / 2) * theta };
}

/** Manning-Leitwert K = A·R^(2/3) bei Fülltiefe y — Q = (1/n)·K·√S. */
function conveyance(shape, H, W, y) {
    const { A, P } = partialSection(shape, H, W, y);
    if (A <= 0 || P <= 0) return 0;
    return A * Math.pow(A / P, TWO_THIRDS);
}

/** Q/Q_voll bei relativer Fülltiefe yRatio (0..1) — unabhängig von n und Gefälle. */
export function flowRatio(shape, H, W, yRatio) {
    const Kf = conveyance(shape, H, W, H);
    if (Kf <= 0) return 0;
    return conveyance(shape, H, W, yRatio * H) / Kf;
}

/**
 * Teilfüllungskurve invertiert: Auslastung f = Q/Q_voll → relative Fülltiefe y/H.
 * Bisektion auf dem monotonen Ast (Kreisprofile haben ihr Q-Maximum bei y/D≈0.94 —
 * darüber wird nicht gesucht, f=1 landet also bei ~0.94 statt Vollfüllung: korrekt,
 * ein Kreisrohr schafft Q_voll schon teilgefüllt).
 */
export function fillDepthRatio(shape, f) {
    const fr = Math.min(Math.max(Number(f) || 0, 0), 1);
    if (fr <= 0) return 0;
    const s = String(shape || '').toUpperCase();
    const cap = (s.startsWith('RECT') || s === 'TRAPEZOIDAL') ? 1.0 : 0.938;
    let lo = 0, hi = cap;
    for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (flowRatio(shape, 1, 1, mid) < fr) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

/** Vollfüllungs-Abfluss nach Manning [m³/s]. */
export function manningQfull(shape, H, W, n, slope) {
    const nn = n > 0 ? n : 0.013;
    const S = Math.max(Number(slope) || 0, 1e-5);   // Mindestgefälle gegen 0-Division
    return (1 / nn) * conveyance(shape, H, W, H) * Math.sqrt(S);
}
