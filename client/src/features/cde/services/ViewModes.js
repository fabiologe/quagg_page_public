/**
 * Ansichts-Modi des Arbeitsbereichs (Sprint P, AP-4) — reine Logik, ohne Vue.
 *
 * Muster: `services/StoreyModes.js`. Katalog und Regeln liegen als reine
 * Funktionen hier, der Zustand in einem kleinen Store, die Darstellung in der
 * Komponente. So ist die Frage „welcher Modus ist gerade überhaupt sinnvoll?"
 * prüfbar, ohne eine Engine hochzufahren.
 *
 *   '3d'            — das Modell im Raum (Normalfall, immer verfügbar)
 *   'lageplan'      — der gezeichnete 2D-Plan, maßstäblich auf dem Blatt
 *   'laengsschnitt' — Stationierung entlang des Haltungsstrangs
 *
 * `normalisiereModus` ist zugleich der Rückfall für gespeicherte Ansichten aus
 * der Zeit vor diesem Sprint: Wo kein Modus steht, ist '3d' gemeint.
 */

// 'dokumente' (Kassensturz E2): das Register füllt die Mitte, statt als
// Klapptafel das Bild nach unten zu schieben.
export const ANSICHTS_MODI = Object.freeze(['3d', 'lageplan', 'laengsschnitt', 'dokumente']);

// Icon-Namen sind die semantischen Namen aus `components/ui/CdeIcon.vue`.
// `kurz` steht im Umschalter — ausgeschrieben, denn „Schnitt" hiess dort der
// Längsschnitt und in der Werkzeugleiste die Schnittebene.
const BESCHRIFTUNG = Object.freeze({
    '3d':            { titel: 'Modell',       kurz: '3D',           taste: '1', icon: 'cde' },
    'lageplan':      { titel: 'Lageplan',     kurz: 'Lageplan',     taste: '2', icon: 'karte' },
    'laengsschnitt': { titel: 'Längsschnitt', kurz: 'Längsschnitt', taste: '3', icon: 'laengsschnitt' },
    'dokumente':     { titel: 'Dokumente',    kurz: 'Dokumente',    taste: '4', icon: 'documents' },
});

/** Unbekanntes, Leeres und Altbestände werden zu '3d'. */
export function normalisiereModus(wert) {
    return ANSICHTS_MODI.includes(wert) ? wert : '3d';
}

/**
 * Ist der Modus mit dem aktuellen Modellstand bedienbar?
 *
 * Ein leerer Lageplan wäre ein weißes Blatt, ein Längsschnitt ohne Haltungs-
 * achsen eine leere Station — beides ist kein Zustand, in den man den Nutzer
 * laufen lassen sollte. Der Umschalter sperrt sie deshalb sichtbar.
 */
export function istVerfuegbar(modus, { hatModell = false, hatAchsen = false, hatProjekt = false } = {}) {
    switch (normalisiereModus(modus)) {
        case 'lageplan':      return !!hatModell;
        case 'laengsschnitt': return !!hatModell && !!hatAchsen;
        // Das Register liegt im Projektordner — ohne Projekt gibt es keins.
        case 'dokumente':     return !!hatProjekt;
        default:              return true;              // '3d' trägt auch den Leerzustand
    }
}

/** Zyklisch weiterschalten, Nichtverfügbares überspringen. */
export function naechsterModus(aktuell, stand = {}) {
    const start = ANSICHTS_MODI.indexOf(normalisiereModus(aktuell));
    for (let i = 1; i <= ANSICHTS_MODI.length; i++) {
        const kandidat = ANSICHTS_MODI[(start + i) % ANSICHTS_MODI.length];
        if (istVerfuegbar(kandidat, stand)) return kandidat;
    }
    return '3d';
}

/** Titel, Kurzform, Taste und Icon-Name für die Oberfläche. */
export function modusBeschriftung(modus) {
    return BESCHRIFTUNG[normalisiereModus(modus)];
}

/** Alle Modi mit Beschriftung — Datenquelle für Umschalter und Befehle. */
export function modusListe() {
    return ANSICHTS_MODI.map(id => ({ id, ...BESCHRIFTUNG[id] }));
}
