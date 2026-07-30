// Vereinfachte, im Code klar gekennzeichnete Tagesganglinien-Näherung für den
// Trockenwetter-Tagesspitzenfaktor — KEINE Norm-Tabelle, da keine zitierfähige
// Stundenfaktor-Quelle in der Fachbibliothek vorlag (Nachtabsenkung/Morgenspitze/
// Mittagsplateau/kleinere Abendspitze). Einzige Quelle für diese Kurve — von
// core/services/SwmmBuilder.js (SWMM [PATTERNS]-Export) UND
// components/common/DwfPatternPreview.vue (Live-Vorschau) genutzt, damit beide
// nie auseinanderlaufen.
export const DWF_BASE_SHAPE_24H = [
    0.45, 0.35, 0.28, 0.25, 0.30, 0.50,  // 0-5h  Nacht
    0.90, 1.40, 1.55, 1.30, 1.10, 1.00,  // 6-11h Morgenanstieg/-spitze
    1.00, 1.05, 1.00, 0.95, 1.00, 1.15,  // 12-17h Mittagsplateau
    1.40, 1.50, 1.30, 1.05, 0.85, 0.65   // 18-23h Abendspitze/-abfall
];

const mean = DWF_BASE_SHAPE_24H.reduce((a, b) => a + b, 0) / 24;
export const DWF_NORMALIZED_SHAPE_24H = DWF_BASE_SHAPE_24H.map(v => v / mean); // Mittelwert exakt 1.0
export const DWF_SHAPE_MAX = Math.max(...DWF_NORMALIZED_SHAPE_24H);

/**
 * Skaliert die Basiskurve so, dass ihr Maximum exakt dem angegebenen
 * Tagesspitzenfaktor entspricht, während der Mittelwert 1.0 bleibt (sonst
 * stimmt der [DWF]-avgValue nicht mehr als Tagesmittel).
 * @param {number|null|undefined} peakFactor - <=1/null/undefined => konstant 1.0
 *   (entspricht dem tatsächlichen SWMM-Verhalten ohne Pattern)
 * @returns {number[]} 24 Stundenfaktoren
 */
export function buildDwfPatternValues(peakFactor) {
    if (peakFactor == null || peakFactor <= 1.0) return DWF_NORMALIZED_SHAPE_24H.map(() => 1.0);
    const scale = (peakFactor - 1.0) / (DWF_SHAPE_MAX - 1.0);
    // Untergrenze gegen negative Pattern-Werte bei extremen/fehlerhaften
    // Spitzenfaktoren (SWMM würde einen negativen Zufluss-Multiplikator sonst
    // klaglos übernehmen).
    return DWF_NORMALIZED_SHAPE_24H.map(v => Math.max(0.05, 1.0 + (v - 1.0) * scale));
}
