/**
 * Blattlage, Maßstab und Ausschnitt des Lageplans (Sprint P, AP-5).
 * Reine Arithmetik — kein Vue, kein THREE, keine Engine.
 *
 * ZWEI GETRENNTE REGLER, das ist der Kern dieses Moduls:
 *
 *   MASSSTAB (1:50 … 1:2000) bestimmt, wie viel Wirklichkeit auf das Blatt
 *   passt. Er steht im Schriftfeld, geht ins PDF und ist eine diskrete Leiter —
 *   „1:137" ist kein Plan, den man abgibt.
 *
 *   BILDSCHIRMZOOM (`pxProMm`) ist eine Lupe auf dasselbe Blatt. Er ändert am
 *   Plan nichts und wird nirgends exportiert.
 *
 * Ohne diese Trennung endet man bei „ich zoome rein und der Maßstab verstellt
 * sich" — der klassische Fehler von Bildschirm-Planvorschauen. Nebeneffekt:
 * Geclippt wird gegen das BLATT, nicht gegen den Bildschirm, deshalb
 * verschwindet beim Reinzoomen nichts.
 */

/** Papierformate in mm (Hochformat). Deckungsgleich mit dem PDF-Exporter. */
export const BLATT_FORMATE = Object.freeze({
    A0: [841, 1189], A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297],
});

export const MASSSTAB_LEITER = Object.freeze([50, 100, 200, 500, 1000, 2000]);

export const RAND_MM = 10;          // Blattrand, wie IfcPdfExporter M
export const SCHRIFTFELD_MM = 40;   // Schriftfeldhöhe, wie IfcPdfExporter TB

/**
 * Zeichenfläche = Blatt minus Ränder minus Schriftfeld.
 * (Ersetzt `drawingDims` aus dem alten Export-Modal.)
 */
export function zeichenflaeche(format = 'A3', ausrichtung = 'portrait') {
    const [pw, ph] = BLATT_FORMATE[format] ?? BLATT_FORMATE.A3;
    const [w, h] = ausrichtung === 'landscape' ? [ph, pw] : [pw, ph];
    return { dw: w - 2 * RAND_MM, dh: h - 2 * RAND_MM - SCHRIFTFELD_MM, blattW: w, blattH: h };
}

/** Welche Weltausdehnung deckt die Zeichenfläche bei diesem Maßstab ab? */
export function haelften(massstab, dw, dh) {
    return {
        halbW: (dw / 1000 * massstab) / 2,
        halbH: (dh / 1000 * massstab) / 2,
    };
}

/**
 * Plot-Frustum für die aktuelle Blattlage.
 *
 * Liefert bewusst exakt die Form von `IfcCamera.getLastPlotFrustum()`, damit
 * ein und dasselbe Objekt den Bildschirmplan zeichnet UND in den PDF-Export
 * geht. Nur so ist die Vorschau strukturell dasselbe wie das Ergebnis und
 * nicht bloß ähnlich.
 */
export function frustumFuerBlatt({ mitte, hoeheY = 0, massstab = 100, dw, dh }) {
    const { halbW, halbH } = haelften(massstab, dw, dh);
    const mx = mitte?.x ?? 0;
    const mz = mitte?.z ?? 0;
    return {
        left: -halbW, right: halbW, top: halbH, bottom: -halbH,
        // Kamera steht über dem Modell und blickt nach unten; up = −Z, damit
        // Papier-Oben auf Welt-−Z fällt (siehe makePaperTransform).
        position: [mx, hoeheY + 10000, mz],
        target: [mx, hoeheY, mz],
        up: [0, 0, -1],
        viewDir: 'top',
        scaleRatio: massstab,
        drawWidthMm: dw,
        drawHeightMm: dh,
    };
}

/** Mittelpunkt der Modellausdehnung. */
export function zentriereAufBounds(bounds) {
    if (!bounds) return { x: 0, z: 0 };
    return {
        x: bounds.centerX ?? (bounds.minX + bounds.maxX) / 2,
        z: bounds.centerZ ?? (bounds.minZ + bounds.maxZ) / 2,
    };
}

/**
 * Kleinster Maßstab der Leiter, bei dem das ganze Modell aufs Blatt passt
 * („Passend"). Passt selbst der gröbste nicht, wird er trotzdem geliefert —
 * ein abgeschnittener Plan ist ehrlicher als gar keiner.
 */
export function passendenMassstab({ bounds, dw, dh }) {
    if (!bounds) return 100;
    const breite = Math.abs((bounds.maxX ?? 0) - (bounds.minX ?? 0));
    const tiefe = Math.abs((bounds.maxZ ?? 0) - (bounds.minZ ?? 0));
    if (!(breite > 0) && !(tiefe > 0)) return MASSSTAB_LEITER[0];
    for (const m of MASSSTAB_LEITER) {
        const { halbW, halbH } = haelften(m, dw, dh);
        if (breite <= halbW * 2 && tiefe <= halbH * 2) return m;
    }
    return MASSSTAB_LEITER[MASSSTAB_LEITER.length - 1];
}

/** Nächster/vorheriger Sprosse auf der Maßstabsleiter. */
export function massstabSchritt(aktuell, richtung) {
    const i = MASSSTAB_LEITER.indexOf(aktuell);
    if (i < 0) return MASSSTAB_LEITER[1];
    return MASSSTAB_LEITER[Math.min(MASSSTAB_LEITER.length - 1, Math.max(0, i + richtung))];
}

/**
 * Pan-Klemme: Das Blatt darf über den Modellrand hinauslaufen (Rand ist Teil
 * eines Plans), aber nicht so weit, dass das Modell ganz aus dem Bild fällt —
 * sonst sucht man auf weißem Grund. Erlaubt wird eine halbe Blattbreite
 * Überstand über die Modellausdehnung hinaus.
 */
export function begrenzeMitte(mitte, bounds, { halbW, halbH }) {
    if (!bounds) return { x: mitte.x, z: mitte.z };
    const minX = (bounds.minX ?? 0) - halbW;
    const maxX = (bounds.maxX ?? 0) + halbW;
    const minZ = (bounds.minZ ?? 0) - halbH;
    const maxZ = (bounds.maxZ ?? 0) + halbH;
    return {
        x: Math.min(maxX, Math.max(minX, mitte.x)),
        z: Math.min(maxZ, Math.max(minZ, mitte.z)),
    };
}

/** Bildschirmpixel → Papier-Millimeter (für Klicks im Plan). */
export function bildschirmZuMm(px, py, { pxProMm = 1, versatz = { x: 0, y: 0 } } = {}) {
    return { x: (px - versatz.x) / pxProMm, y: (py - versatz.y) / pxProMm };
}

/**
 * Bildschirmzoom, bei dem das ganze Blatt in den verfügbaren Bereich passt
 * (mit etwas Luft). Anfangszustand und „Blatt einpassen"-Knopf.
 */
export function zoomFuerBlatt(bereichPx, format, ausrichtung, luft = 0.94) {
    const { blattW, blattH } = zeichenflaeche(format, ausrichtung);
    if (!(bereichPx?.w > 0) || !(bereichPx?.h > 0)) return 1;
    return Math.min(bereichPx.w / blattW, bereichPx.h / blattH) * luft;
}
