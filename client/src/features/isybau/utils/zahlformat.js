/**
 * Zahl für die Anzeige: deutsches Komma, feste Nachkommastellen, „–" für fehlend.
 * Eine Quelle für Ergebnisfenster, Info-Fenster und 3D-Panel (vorher mischten die
 * Panels toFixed — „262.0 l/s" neben „262,0 l/s" im Ergebnisfenster).
 */
export const fmtZahl = (v, stellen = 2) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '–'
    : Number(v).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen }));
