/**
 * AnsichtRotation — die Ansicht in 90°-Schritten drehen (rein rechnerisch).
 *
 * Gedreht wird NUR die Anzeige: Annotationen bleiben im unrotierten
 * Seiten-Punktraum gespeichert, deshalb ist der Export von der Drehung
 * völlig unberührt (und eine gedrehte Ansicht kann nichts verfälschen).
 * Die Seitenschicht wird als Ganzes per CSS-transform gedreht; dieses
 * Modul liefert die Abbildung in beide Richtungen.
 *
 * Konvention: Drehung im UHRZEIGERSINN, wie CSS rotate() bei y-nach-unten.
 * Bei 90°/270° tauschen Breite und Höhe der Anzeigebox.
 */

export const DREHSCHRITT = 90;

export function normalisiereDrehung(grad) {
    return (((Math.round((grad ?? 0) / 90) * 90) % 360) + 360) % 360;
}

/** Anzeigemaße der Seite bei dieser Drehung (Punkte). */
export function boxMasse(breitePt, hoehePt, drehung) {
    return normalisiereDrehung(drehung) % 180 === 0
        ? { breitePt, hoehePt }
        : { breitePt: hoehePt, hoehePt: breitePt };
}

/**
 * CSS-transform, der den unrotierten Seitenstapel (breitePx × hoehePx)
 * passgenau in die Anzeigebox legt. transform-origin muss 0 0 sein.
 */
export function inhaltTransform(drehung, breitePx, hoehePx) {
    switch (normalisiereDrehung(drehung)) {
        case 90:  return `translate(${hoehePx}px, 0px) rotate(90deg)`;
        case 180: return `translate(${breitePx}px, ${hoehePx}px) rotate(180deg)`;
        case 270: return `translate(0px, ${breitePx}px) rotate(270deg)`;
        default:  return '';
    }
}

/** Punkt der ANZEIGE (box-lokal, Punkte) → unrotierter Seitenpunkt. */
export function zuSeitenPunkt(lx, ly, drehung, breitePt, hoehePt) {
    switch (normalisiereDrehung(drehung)) {
        case 90:  return [ly, hoehePt - lx];
        case 180: return [breitePt - lx, hoehePt - ly];
        case 270: return [breitePt - ly, lx];
        default:  return [lx, ly];
    }
}

/** Unrotierter Seitenpunkt → Punkt der ANZEIGE (box-lokal, Punkte). */
export function vonSeitenPunkt(x, y, drehung, breitePt, hoehePt) {
    switch (normalisiereDrehung(drehung)) {
        case 90:  return [hoehePt - y, x];
        case 180: return [breitePt - x, hoehePt - y];
        case 270: return [y, breitePt - x];
        default:  return [x, y];
    }
}

/**
 * Zeiger-Delta der Anzeige → Delta im Seitenraum. Nur die Drehung wirkt,
 * keine Verschiebung — für Ziehgesten (verschieben, skalieren).
 */
export function drehDelta(dx, dy, drehung) {
    switch (normalisiereDrehung(drehung)) {
        case 90:  return [dy, -dx];
        case 180: return [-dx, -dy];
        case 270: return [-dy, dx];
        default:  return [dx, dy];
    }
}

/**
 * Achsenparalleles Rechteck der Anzeige → Rechteck im Seitenraum.
 * Bei 90°-Vielfachen bleiben Rechtecke achsenparallel, die Abbildung der
 * beiden Eckpunkte ist deshalb exakt (Textauswahl!).
 */
export function zuSeitenRect(r, drehung, breitePt, hoehePt) {
    const [ax, ay] = zuSeitenPunkt(r.x, r.y, drehung, breitePt, hoehePt);
    const [bx, by] = zuSeitenPunkt(r.x + r.w, r.y + r.h, drehung, breitePt, hoehePt);
    return {
        x: Math.min(ax, bx), y: Math.min(ay, by),
        w: Math.abs(bx - ax), h: Math.abs(by - ay),
    };
}
