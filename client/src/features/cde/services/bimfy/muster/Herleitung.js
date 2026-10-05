/**
 * MUSTER · Herleitung — woher ein Mass stammt, als Datum und als Satz.
 *
 *   isybau | vorlage   gegeben (Datei bzw. Werte der Vorlage)
 *   vorgabe            eine Vorgabe des Auftraggebers (Fabio), mit Datum im Text
 *   norm               Normwert, mit Beleg {norm, stelle}
 *   norm-pruefen       Normwert, dessen Lesung am Original zu prüfen ist
 *   annahme            keine Norm im Bestand — ein Faustwert mit Grund
 *
 * Im IFC steht sie als Text in `Quagg_CDE.Herleitung` (BIMFY I5).
 */

/** Die Herleitung eines Masses. */
export const herleitung = (art, text, belegt = null) => Object.freeze({ art, text, ...(belegt ? { beleg: belegt } : {}) });

/** Alle Herleitungen eines Teils als ein Satz je Mass: „hoehe: norm — Regelbauhöhe 1000 mm (DIN 4034-1:2020-04, 4.3.3.8.4)". */
export function herleitungText(h) {
    if (typeof h === 'string') return h.trim() || null;     // schon ein Satz (Feld am Rohr)
    if (!h || typeof h !== 'object') return null;
    const zeilen = Object.entries(h)
        .filter(([, w]) => w && typeof w === 'object' && w.art)
        .map(([mass, w]) => `${mass}: ${w.art} — ${w.text}${w.beleg ? ` (${w.beleg.norm}, ${w.beleg.stelle}${w.beleg.pruefen ? ', am Original prüfen' : ''})` : ''}`);
    return zeilen.length ? zeilen.join('; ') : null;
}
