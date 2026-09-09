/**
 * IFC-Typkonstanten auflösen (Stufe 13.1).
 *
 * DER FEHLER, den diese Datei behebt, ist heute der DRITTE seiner Art:
 *
 *     services/AxisAnnotations.js:42
 *     const typeConst = webIfc[typeName];
 *     if (!typeConst) continue;
 *
 * Die Typkonstanten (`IFCPIPESEGMENT = 3612865200`) sind **Modul-Exporte** von
 * `web-ifc`, keine Eigenschaften der `IfcAPI`-INSTANZ. `ifcLoader.webIfc` ist
 * eine Instanz. `webIfc['IFCPIPESEGMENT']` ist damit immer `undefined`, die
 * Schleife überspringt jede Kategorie, und `extractAxisPolylines` gibt seit
 * jeher eine leere Liste zurück.
 *
 * Folgen, still und in Produktion:
 *   GeometryResolver   `getForm('axis')` bekam NIE eine echte
 *                      Achs-Repräsentation und fiel immer auf `skeletonAxis`
 *                      zurück — jede Achse also „geschätzt", auch wo der Planer
 *                      eine gezeichnet hat.
 *   IfcPdfExporter     die Haltungsbeschriftung im Lageplan blieb leer.
 *
 * WARUM ES KEIN TEST GESEHEN HAT — und das ist das Wiederkehrende:
 * `test/axisAnnotations.test.js` baut ein `fakeWebIfc`, das die Konstanten
 * SEHR WOHL trägt, weil der Testautor sie dort hingeschrieben hat. Die echte
 * Instanz trägt sie nicht. Der Test prüft eine Schnittstelle, die es nicht
 * gibt — genau wie bei `getAllCoordOffsets` (Stufe 13.0).
 *
 * Deshalb: die Konstante kommt aus dem MODUL — und das Modul wird
 * HEREINGEREICHT, nicht importiert. Ein statischer `import 'web-ifc'` in
 * Anwendungscode zöge die Bibliothek in den Auswertungspfad jedes Moduls, das
 * ihn erbt; `IfcQuelle` lädt sie stattdessen dynamisch, erst wenn wirklich
 * eine Datei geöffnet wird.
 */

/**
 * Die Typkonstante zu einem IFC-Klassennamen, oder `null`.
 *
 * `null` heißt „diesen Typ gibt es in dieser Fassung nicht" — bei
 * `IFCMAPCONVERSION` in einem IFC2x3-Modell ist das der Normalfall und kein
 * Fehler.
 */
export function typKonstante(webIfcModul, name) {
    const k = name?.toUpperCase?.();
    if (!k) return null;
    const konst = webIfcModul?.[k];
    if (Number.isFinite(konst)) return konst;
    // CJS-Interop: unter node/vitest kommt das Modul als `{default: {...}}` an.
    // Dieselbe Falle wie bei `polygon-clipping`, die den vite-Build einmal
    // gekostet hat — deshalb beide Wege.
    const ausDefault = webIfcModul?.default?.[k];
    return Number.isFinite(ausDefault) ? ausDefault : null;
}

/** Rückabbildung Zahl → Name, einmal je Modulobjekt gebaut. */
const _rueckwaerts = new WeakMap();

function _index(webIfcModul) {
    const quelle = (webIfcModul && typeof webIfcModul === 'object')
        ? (Number.isFinite(webIfcModul.IFCWALL) ? webIfcModul : (webIfcModul.default ?? webIfcModul))
        : null;
    if (!quelle) return new Map();
    if (_rueckwaerts.has(quelle)) return _rueckwaerts.get(quelle);
    const karte = new Map();
    for (const [name, wert] of Object.entries(quelle)) {
        if (!Number.isFinite(wert) || !/^IFC[A-Z0-9]+$/.test(name)) continue;
        if (!karte.has(wert)) karte.set(wert, name);
    }
    _rueckwaerts.set(quelle, karte);
    return karte;
}

/**
 * Der IFC-Klassenname zu einer Typkonstante — die GEGENRICHTUNG.
 *
 * DER GRUND, warum es sie braucht: `IfcAPI.GetLine(...)` gibt in `.type` die
 * ZAHL zurück, nicht den Namen (`1077100507`, nicht `IFCEARTHWORKSELEMENT`).
 * Wer sie ungeprüft als Kategorie weiterreicht, füttert Typprofile,
 * Bauformregeln und das Wörterbuch mit einer Ziffernfolge — kein Treffer,
 * keine Meldung, und aus der Ferne sieht es aus, als kenne die CDE die Typen
 * dieser Datei einfach nicht. Genau so lag es einen Nachmittag lang in
 * `_gelaendeKontext` und im neuen Elementindex, bevor es auffiel.
 *
 * Nachgemessen: die Bibliothek exportiert 1.143 solcher Konstanten, und
 * KEINE Zahl ist doppelt belegt — die Umkehrung ist also eindeutig.
 *
 * @returns {string|null} Klassenname in Grossschrift, oder `null`
 */
export function typName(webIfcModul, konstante) {
    if (!Number.isFinite(konstante)) return null;
    return _index(webIfcModul).get(konstante) ?? null;
}
