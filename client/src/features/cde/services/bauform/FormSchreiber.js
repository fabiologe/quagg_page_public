/**
 * FormSchreiber — das Spiegelbild des GeometryResolver (Stufe 9.2).
 *
 * Der Resolver beantwortet „welche Form kann ich aus diesem Bauteil LESEN?"
 * und protokolliert an jedem Ergebnis, woher es kommt. Diese Datei beantwortet
 * die Gegenfrage: „was VERALTET, wenn ich diese Form ändere?"
 *
 * WARUM DAS EINE EIGENE DATEI IST: Der Resolver cached — je Element, je Form,
 * je Ableitungskette. Daneben halten Höhenlinien, Böschungsschraffur,
 * Längsschnitt und der gezeichnete Plan ihre eigenen abgeleiteten Ergebnisse.
 * Wird ein Bauteil verschoben und niemand sagt es weiter, zeigt der Plan
 * DENSELBEN Wert an einer NEUEN Stelle — und sieht dabei völlig richtig aus.
 * Das ist exakt die Fehlerklasse der Prozent-Bemaßung aus Stufe 4: nicht ein
 * Absturz, sondern eine stille Falschaussage, die niemandem auffällt.
 *
 * Die Tabelle unten ist deshalb bewusst GROSSZÜGIG. Einmal zu viel neu rechnen
 * kostet Rechenzeit; einmal zu wenig kostet Glaubwürdigkeit.
 *
 * Rein und ohne WebGL: `veraltet()` ist eine Tabellenabfrage. Das eigentliche
 * Schreiben delegiert an `IfcAutor` — die eine Stelle, die die Editor-API
 * anfasst.
 */

/**
 * Was von einer Änderung betroffen ist.
 *
 * Die Schlüssel sind ABSICHTSNAMEN, keine Dateinamen: der Aufrufer entscheidet,
 * was er darauf hin verwirft. So bleibt diese Tabelle lesbar, auch wenn sich
 * die Verbraucher ändern.
 */
export const VERBRAUCHER = Object.freeze({
    resolverCache: 'Zwischenspeicher des GeometryResolver',
    hoehenlinien:  'Höhenlinien',
    boeschung:     'Böschungsschraffur',
    laengsschnitt: 'Längsschnitt',
    querprofile:   'Querprofile',
    lageplan:      'gezeichneter Lageplan',
    mengen:        'Mengen und Massen',
    bemassung:     'Bemaßung im Plan',
});

/**
 * Welche Verbraucher veralten, wenn sich etwas ändert.
 *
 * `lage` ist die weitreichendste Änderung: ein verschobenes Bauteil ändert
 * seine Geometrie, seine Lage im Plan, seine Station im Längsschnitt und den
 * Bezug jeder Bemaßung, die daran hängt. Nur die MENGEN bleiben — ein Rohr
 * wird beim Verschieben nicht länger.
 */
const TABELLE = Object.freeze({
    lage: ['resolverCache', 'hoehenlinien', 'boeschung', 'laengsschnitt', 'querprofile', 'lageplan', 'bemassung'],
    // Ein geändertes Maß ändert die Form, nicht den Ort — die Bemaßung anderer
    // Bauteile bleibt gültig, die Mengen nicht.
    parametrik: ['resolverCache', 'laengsschnitt', 'querprofile', 'lageplan', 'mengen'],
    erzeugt:    ['resolverCache', 'lageplan', 'mengen', 'hoehenlinien', 'boeschung'],
    geloescht:  ['resolverCache', 'lageplan', 'mengen', 'hoehenlinien', 'boeschung', 'laengsschnitt'],
    // Merkmale berühren keine Geometrie. Der Plan zeigt sie aber an — eine
    // geänderte Kostengruppe färbt Linien um.
    kg:     ['lageplan'],
    din277: ['lageplan'],
    pset:   ['lageplan'],
    // Der Plan beschriftet mit dem Namen — eine Umbenennung ändert das Bild.
    bezeichnung: ['lageplan'],
    // Eine Maßnahme färbt den Plan und geht in die Mengen — der Auszug je
    // Maßnahme rechnet aus Länge und Nennweite.
    massnahme: ['lageplan', 'mengen'],
});

/**
 * Was veraltet durch eine Änderung dieser Art?
 *
 * @param {string} art  Schlüssel aus AENDERUNGS_ARTEN
 * @returns {string[]}  Verbraucher-Schlüssel; leer bei unbekannter Art
 */
export function veraltet(art) {
    return [...(TABELLE[art] ?? [])];
}

/**
 * Dasselbe für mehrere Änderungen auf einmal — ohne Doppelungen.
 *
 * Beim Nachspielen fällt ein ganzer Stapel an; jeden einzeln durch die
 * Verwerfung zu schicken hieße, den Plan zwanzigmal neu zu zeichnen.
 */
export function veraltetDurch(arten) {
    const out = new Set();
    for (const art of arten ?? []) for (const v of veraltet(art)) out.add(v);
    return [...out];
}

/** Verbraucher, deren Veralten heisst: die GEOMETRIE hat sich geändert. */
const GEOMETRIE_VERBRAUCHER = Object.freeze(
    ['laengsschnitt', 'hoehenlinien', 'querprofile', 'boeschung']);

/**
 * Entwertet dieser Stapel die abgeleitete GEOMETRIE (Achsen, Netz, Strang,
 * Prüfliste, Plan-Inhalte)? — Die Frage hinter der Verdrahtung (Stufe 16):
 * `lage`, `parametrik`, `erzeugt`, `geloescht` ⇒ ja; eine Kostengruppe oder
 * ein Name färbt und beschriftet nur. Ohne diese Trennung läse jeder
 * KG-Klick die Achsen neu — mit ihr keiner zu wenig.
 */
export function entwertetGeometrie(arten) {
    return veraltetDurch(arten).some(v => GEOMETRIE_VERBRAUCHER.includes(v));
}

/**
 * Eine Formänderung schreiben und melden, was dadurch veraltet.
 *
 * @param {object} opts
 * @param {object} opts.autor     IfcAutor (oder Attrappe)
 * @param {string} opts.modelId
 * @param {number} opts.localId
 * @param {string} opts.art       'lage' — weitere folgen
 * @param {*}      opts.wert
 * @returns {Promise<{ok, grund?, veraltet: string[]}>}
 */
export async function schreibe({ autor, modelId, localId, art, wert } = {}) {
    if (!autor) return { ok: false, grund: 'kein_autor', veraltet: [] };

    if (art === 'lage') {
        const r = await autor.setzeAnker(modelId, localId, wert);
        // Wurde nichts bewegt (Zug unter der Bautoleranz), veraltet auch
        // nichts — sonst zeichnete jede Rundung den ganzen Plan neu.
        if (r.ok && !r.versatz) return { ok: true, veraltet: [] };
        return { ok: r.ok, grund: r.grund, veraltet: r.ok ? veraltet('lage') : [] };
    }

    return { ok: false, grund: `art_nicht_schreibbar:${art}`, veraltet: [] };
}
