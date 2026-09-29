/**
 * Regeln für den Bemessungsregen — EINE Stelle für Modellregen-Fenster,
 * KOSTRA-Fenster, Vorab-Prüfung und Ergebnis/PDF.
 *
 * DWA-A 118 (Januar 2024), Abschn. 5.5.1: „Einzelmodellregen eignen sich für
 * kleinere bis mittlere Einzugsgebiete. Die Regendauer sollte der doppelten
 * Fließzeit im Einzugsgebiet entsprechen, mindestens aber 60 min betragen.“
 * (Fahrplan „Grenzen beheben“, Stufe 2; doc/GrenzenEvaluierung.md B3.)
 */

export const MIN_REGENDAUER_MIN = 60;

/** Wiederkehrzeiten der KOSTRA-Spalten (RN_*); kurz für Tabellenköpfe, lang für Texte. */
export const WIEDERKEHRZEITEN = [
    { key: 'RN_001A', jahre: 1 },
    { key: 'RN_002A', jahre: 2 },
    { key: 'RN_003A', jahre: 3 },
    { key: 'RN_005A', jahre: 5 },
    { key: 'RN_010A', jahre: 10 },
    { key: 'RN_020A', jahre: 20 },
    { key: 'RN_030A', jahre: 30 },
    { key: 'RN_050A', jahre: 50 },
    { key: 'RN_100A', jahre: 100 },
].map(w => ({ ...w, kurz: `${w.jahre} a`, lang: w.jahre === 1 ? '1 Jahr' : `${w.jahre} Jahre` }));

export const wiederkehrText = (key) => WIEDERKEHRZEITEN.find(w => w.key === key)?.lang ?? key ?? '';

/**
 * Dauerstufen, die die KOSTRA-Daten wirklich enthalten, aufsteigend, bis `maxMin`.
 * Vorher fest 5 … 120 min — die Daten reichen bis 7 d, und für die „doppelte
 * Fließzeit“ größerer Netze fehlten die längeren Stufen. Nicht-numerische
 * Schlüssel (z. B. „_quelle“ der Fixture) fallen heraus.
 */
export function kostraDauern(kostraDaten, maxMin = 1440) {
    if (!kostraDaten) return [];
    return Object.keys(kostraDaten)
        .map(Number)
        .filter(d => Number.isFinite(d) && d > 0 && d <= maxMin)
        .sort((a, b) => a - b);
}

/** Dauer eines Regens in Minuten: aus den Metadaten, sonst Schritte × Intervall. */
export function regenDauerMin(regen) {
    if (!regen) return null;
    const d = Number(regen.metadata?.duration);
    if (Number.isFinite(d) && d > 0) return d;
    const n = regen.series?.length ?? 0;
    const iv = Number(regen.metadata?.interval) || 5;
    return n > 0 ? n * iv : null;
}

/** Hinweistext, wenn ein Regen kürzer ist als A 118:2024 verlangt; sonst ''. */
export function regenDauerHinweis(dauerMin) {
    if (!(dauerMin > 0) || dauerMin >= MIN_REGENDAUER_MIN) return '';
    return `Regendauer ${dauerMin} min < ${MIN_REGENDAUER_MIN} min — nach DWA-A 118:2024 (5.5.1) kein `
        + `Nachweisregen: mindestens ${MIN_REGENDAUER_MIN} min, besser die doppelte Fließzeit.`;
}

/** Empfohlene Regendauer aus der Fließzeit: max(60, 2·t_f), auf 5 min aufgerundet. */
export const empfohleneRegendauer = (fliesszeitMin) =>
    Math.max(MIN_REGENDAUER_MIN, Math.ceil((2 * (Number(fliesszeitMin) || 0)) / 5) * 5);
