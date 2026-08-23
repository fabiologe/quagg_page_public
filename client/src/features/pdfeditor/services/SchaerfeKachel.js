/**
 * SchaerfeKachel — Geometrie des Scharfstell-Ausschnitts.
 *
 * Großformatige Blätter (A1/A0) können bei hohem Zoom NIE als ganze Seite
 * scharf gerastert werden: A1 bei Zoom 4 × DPR wären ~100 Mio Canvas-Pixel.
 * Deshalb rendert nach Zoom-/Scroll-Ruhe eine KACHEL nur den sichtbaren
 * Seitenausschnitt (+ Rand) in voller Zielskala und legt sich passgenau
 * über das (gedeckelte, CSS-gestreckte) Basisbild.
 *
 * Pur und DOM-frei; alle Koordinaten in Seitenpunkten.
 */

/** Ab diesem Faktor über der Basis-Skala lohnt eine Kachel überhaupt. */
export const KACHEL_SCHWELLE = 1.05;

/** Flächendeckel der Kachel (schnell zu rastern, klein im Speicher). */
export const KACHEL_MAX_PIXEL = 4e6;

/** Braucht diese Seite bei dieser Zielskala eine Kachel? */
export function kachelNoetig(basisSkala, zielSkala) {
    return zielSkala > basisSkala * KACHEL_SCHWELLE;
}

/**
 * Kachel für den sichtbaren Seitenausschnitt.
 * @param {{x:number, y:number, b:number, h:number}} sicht  sichtbarer Bereich
 *   AUF der Seite (Seitenpunkte; darf über die Seitenränder hinausragen)
 * @param {{breitePt:number, hoehePt:number}} seite
 * @param {number} zielSkala   volle Wunschskala (zoom × dpr)
 * @returns {{xPt, yPt, bPt, hPt, skala}|null} null, wenn nichts sichtbar
 */
export function berechneKachel(sicht, seite, zielSkala, {
    maxPixel = KACHEL_MAX_PIXEL,
    randAnteil = 0.25,
} = {}) {
    const randX = sicht.b * randAnteil;
    const randY = sicht.h * randAnteil;
    const x0 = Math.max(0, sicht.x - randX);
    const y0 = Math.max(0, sicht.y - randY);
    const x1 = Math.min(seite.breitePt, sicht.x + sicht.b + randX);
    const y1 = Math.min(seite.hoehePt, sicht.y + sicht.h + randY);
    if (x1 <= x0 || y1 <= y0) return null;

    const bPt = x1 - x0, hPt = y1 - y0;
    let skala = zielSkala;
    if (bPt * hPt * skala * skala > maxPixel) {
        // Extremer Zoom: lieber die Kachel etwas weicher als sie zu sprengen —
        // der Rand schrumpft dabei implizit mit dem nächsten Nachführen.
        skala = Math.sqrt(maxPixel / (bPt * hPt));
    }
    return { xPt: x0, yPt: y0, bPt, hPt, skala };
}

/**
 * Deckt die BESTEHENDE Kachel das Sichtfenster noch ab (kein Neu-Render
 * beim Minimal-Scrollen innerhalb des Rands)?
 * @param {number} mindestSkala  Skala, die eine frisch berechnete Kachel
 *   hätte (berechneKachel(...).skala) — die alte darf kaum weicher sein.
 */
export function kachelDeckt(kachel, sicht, seite, mindestSkala, toleranz = 0.05) {
    if (!kachel) return false;
    if (kachel.skala < mindestSkala * (1 - toleranz)) return false;
    const x0 = Math.max(0, sicht.x);
    const y0 = Math.max(0, sicht.y);
    const x1 = Math.min(seite.breitePt, sicht.x + sicht.b);
    const y1 = Math.min(seite.hoehePt, sicht.y + sicht.h);
    if (x1 <= x0 || y1 <= y0) return true;   // Seite gar nicht im Blick
    return kachel.xPt <= x0 + 0.5 && kachel.yPt <= y0 + 0.5
        && kachel.xPt + kachel.bPt >= x1 - 0.5
        && kachel.yPt + kachel.hPt >= y1 - 0.5;
}
