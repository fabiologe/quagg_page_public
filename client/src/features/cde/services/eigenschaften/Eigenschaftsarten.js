/**
 * DIE EIGENSCHAFTSARTEN — der Vertrag zwischen Operationen und Katalog
 * (Teil XXIII, AE; Audit „Bearbeitungsstruktur" 2026-09-18, Befund S4).
 *
 * Eine Operation fragt nicht, WAS ein Bauteil ist („ein Schacht"), sondern
 * was es HAT: eine Achse, eine Rolle im Netz, eine Grösse, die sein Typ
 * benennt. Die Antwort steht im Katalog — im Rezept eines eigenen Bauteils,
 * im Typprofil einer gelieferten Familie, in einer Bauformregel für einen
 * Proxy —, nie in einer Verzweigung.
 *
 * Für die MASSE gab es den Vertrag schon (`brauchtRolle` → Typprofil-Rolle,
 * seit Stufe 14). Er wird hier verallgemeinert, nicht ersetzt: `brauchtRolle`
 * bleibt die Kurzform von `mass:<rolle>`.
 *
 * Das Vokabular ist bewusst KNAPP (Kriterium 10 des Audits: keine Art ohne
 * echte Nutzer). Lage, Profil, Anschlüsse und Material kommen, wenn eine
 * Operation sie verlangt — bis dahin wären sie Abstraktion auf Vorrat.
 *
 *   achse               eine Linie, entlang der sich stationieren lässt —
 *                       gezählt in `geometrie/Stationierung.js`, ihr Höhenbezug
 *                       (Sohle oder Rohrmitte) in `Achsbezug.js`
 *   netzrolle:knoten    ein Knoten im Netz (Schacht, Bauwerk mit Anschlüssen)
 *   netzrolle:kante     eine Kante im Netz (Haltung, Leitung)
 *   mass:<rolle>        eine Grösse, die der Typ benennt (Typprofil-Rolle)
 *
 * Rein, ohne Vue.
 */

export const EIGENSCHAFTSARTEN = Object.freeze({
    achse:     Object.freeze({ titel: 'Achse', text: 'eine Linie, entlang der sich stationieren lässt' }),
    netzrolle: Object.freeze({ titel: 'Rolle im Netz', werte: Object.freeze(['knoten', 'kante']),
                               text: 'Knoten oder Kante eines Netzes' }),
    mass:      Object.freeze({ titel: 'Grösse', text: 'eine Grösse, die der Typ benennt (Rolle im Typprofil)' }),
});

/** Welche Bauformen eine Achse tragen. */
const MIT_ACHSE = new Set(['achse+profil', 'linie']);

/**
 * Die Rolle im Netz — aus dem Katalog, in dieser Reihenfolge:
 *   1. das REZEPT eines eigenen Bauteils (`netzrolle` am Rezept),
 *   2. die BAUFORMREGEL, die ein Proxy getroffen hat (ProVI: „Haltung", „Schacht"),
 *   3. das TYPPROFIL der gelieferten Familie (`IfcFlowSegment` → Kante).
 * Das Spezifischere gewinnt: das eigene Rezept kennt sein Bauteil, die Regel
 * kennt diesen Export, das Typprofil nur die Familie.
 */
export function netzrolleVon({ rezept = null, regel = null, typprofil = null } = {}) {
    const r = rezept?.netzrolle ?? regel?.netzrolle ?? typprofil?.netzrolle ?? null;
    return EIGENSCHAFTSARTEN.netzrolle.werte.includes(r) ? r : null;
}

/**
 * Was dieses Bauteil HAT — als Menge von Anfragen, die eine Operation stellen kann.
 * @param {object} q
 * @param {string|null} [q.bauform]   aus der Einordnung
 * @param {object|null} [q.typprofil] das wirksame Typprofil (Rollen = Masse, Netzrolle)
 * @param {object|null} [q.rezept]    das Rezept eines EIGENEN Bauteils
 * @param {object|null} [q.regel]     die getroffene Bauformregel (Proxy)
 * @returns {Set<string>}
 */
export function eigenschaftenVon({ bauform = null, typprofil = null, rezept = null, regel = null } = {}) {
    const aus = new Set();
    if (MIT_ACHSE.has(bauform)) aus.add('achse');
    const nr = netzrolleVon({ rezept, regel, typprofil });
    if (nr) aus.add(`netzrolle:${nr}`);
    for (const [rolle, feld] of Object.entries(typprofil?.felder ?? {})) {
        if (feld) aus.add(`mass:${rolle}`);
    }
    return aus;
}

/**
 * Was eine Operation verlangt — `braucht` und die Kurzform `brauchtRolle`
 * zusammen, in EINER Liste. Ein Ort, an dem beides gelesen wird.
 */
export function verlangtVon(bearbeitung) {
    const rollen = bearbeitung?.brauchtRolle == null ? []
        : (Array.isArray(bearbeitung.brauchtRolle) ? bearbeitung.brauchtRolle : [bearbeitung.brauchtRolle]);
    return [...(bearbeitung?.braucht ?? []), ...rollen.map(r => `mass:${r}`)];
}

/** Welche der verlangten Eigenschaften fehlen (leer = alles da). */
export function fehlendeEigenschaften(eigenschaften, verlangt = []) {
    return (verlangt ?? []).filter(a => !eigenschaften?.has?.(a));
}

/**
 * Eine Anfrage als Satz für den Menschen — für „warum nicht?".
 * Die Masse nennen ihre Rolle; die Oberfläche kennt sie aus dem Typprofil.
 */
export function eigenschaftText(anfrage) {
    const [art, wert] = String(anfrage).split(':');
    if (art === 'achse') return 'eine Achse';
    if (art === 'netzrolle') return wert === 'knoten' ? 'die Rolle „Knoten" im Netz' : 'die Rolle „Kante" im Netz';
    if (art === 'mass') return `die Grösse „${wert}"`;
    return String(anfrage);
}
