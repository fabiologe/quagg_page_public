/**
 * Höhenbezug — von der Three-Welt auf wirkliche Höhen (Stufe 12.0c).
 *
 * DER BEFUND: Fabio meldete „die Höhe ist bei −17,4 bei Elementen, die relativen
 * Höhenverhältnisse sind richtig, aber das Modell liegt nicht auf den realen
 * Höhen". Genau so sieht es aus, und der Grund liegt im Ladepfad.
 *
 * `ifcLoader.load(data, true, name)` schaltet in web-ifc `COORDINATE_TO_ORIGIN`
 * ein: das Modell wird zum Ursprung verschoben, damit die Float32-Puffer von
 * three.js nicht an UTM- oder Gauß-Krüger-Größenordnungen zerbrechen (bei
 * 2.577.000 verlöre man rund 3 cm allein durch die Rundung). Das ist richtig
 * so — nur ist die Höhe damit ebenfalls verschoben, und was man sieht, ist
 * nicht mehr NN.
 *
 * Der Versatz wird beim Laden gemerkt (`IfcEngine._coordOffsets`), und die
 * Umrechnung ist im Haus längst aufgeschrieben — in `LaengsschnittBuilder.js`:
 *
 *     m NN = welt.y + offset.y
 *
 * ABER SIE STAND NUR DORT. Der Längsschnitt zeigte richtige Sohlhöhen, die
 * Bearbeitung zeigte und verlangte Three-Koordinaten. Dieselbe Größe, zwei
 * Systeme, kein Hinweis darauf — und ein Nutzer, der in ein Feld „Sohlhöhe [m]"
 * eine echte Höhe eintippt, verschiebt sein Bauteil um mehrere hundert Meter.
 *
 * Deshalb steht die Umrechnung ab hier an EINER Stelle, rein und geprüft.
 *
 * WAS DAS NICHT LÖST (und die eigentliche Frage dahinter): der Versatz stammt
 * aus dem GELADENEN MODELL, nicht aus seiner Georeferenz. Er ist damit an den
 * Inhalt der Datei gebunden. Was das für das Journal bedeutet, steht bei
 * `journalWarnung` weiter unten.
 */

/** Ohne Modellbezug ist keine Umrechnung möglich — dann gilt die Rohzahl. */
export function hatHoehenbezug(versatz) {
    return Number.isFinite(versatz) && versatz !== 0;
}

/**
 * Three-Welt → wirkliche Höhe (m NN).
 * @param {number} y        Höhe in der Three-Welt
 * @param {number} versatz  `offset.y` des Modells
 */
export function nnAusWelt(y, versatz = 0) {
    const v = Number.isFinite(versatz) ? versatz : 0;
    return (Number(y) || 0) + v;
}

/** Wirkliche Höhe (m NN) → Three-Welt. Die Gegenrichtung, für Eingaben. */
export function weltAusNn(hoehe, versatz = 0) {
    const v = Number.isFinite(versatz) ? versatz : 0;
    return (Number(hoehe) || 0) - v;
}

/** Eine Höhe für die Anzeige — mit Einheit, und ehrlich über ihren Bezug. */
export function beschreibeHoehe(y, versatz = 0) {
    const roh = Number(y);
    if (!Number.isFinite(roh)) return '—';
    if (!hatHoehenbezug(versatz)) return `${roh.toFixed(3)} m (ohne Höhenbezug)`;
    return `${nnAusWelt(roh, versatz).toFixed(3)} m NN`;
}

/**
 * Warum ein gespeicherter Anker nicht ohne Weiteres über Revisionen trägt.
 *
 * `COORDINATE_TO_ORIGIN` leitet den Ursprung aus dem Modell ab, nicht aus einer
 * Georeferenz. Liefert der Planer eine Revision mit anderem Inhalt, kann der
 * Versatz ein anderer sein — und dann bedeutet jeder im Journal abgelegte
 * Three-Anker etwas anderes als beim Eintragen, ohne dass es irgendwo auffiele.
 *
 * Das ist genau die Sorte stiller Falschaussage, gegen die das Journal
 * angetreten ist. Die saubere Kur ist, im Journal ROHKOORDINATEN zu führen
 * (die sind vom Autor gesetzt und ändern sich nicht) und erst beim Anwenden
 * umzurechnen. Das ist ein Formatwechsel mit Migration und gehört nicht in
 * denselben Schritt wie die Anzeige — hier steht der Text, damit der Befund
 * nicht verlorengeht.
 */
export const JOURNAL_WARNUNG = 'Die Lage gespeicherter Schritte hängt am Ladeversatz '
    + 'des Modells — über Revisionen hinweg ist sie nicht sicher stabil.';
