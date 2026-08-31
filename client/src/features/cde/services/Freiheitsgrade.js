/**
 * Freiheitsgrade — wie weit sich eine Bauform ziehen lässt (Stufe 9.3).
 *
 * DER ZAHLTAG DER BAUFORM-SCHICHT: Der Zwang beim Ziehen ist eine Funktion der
 * BAUFORM, nicht des IFC-Typs. „Entlang der Achse" gilt für Rohr, Kanal,
 * Bordstein — und für den Typ, den noch niemand gesehen hat.
 *
 * Warum überhaupt geführt: Ein Rohr frei im Raum zu verschieben ist im Tiefbau
 * kein Anwendungsfall. Gebraucht wird „entlang der Achse", „quer dazu" und
 * „in der Höhe" — und auf dem Finger trifft man eine einzelne Achse ohnehin
 * viel sicherer als einen freien Punkt.
 *
 * Rein und ohne three: `TransformControls` bekommt daraus nur `showX/Y/Z`,
 * `space` und `translationSnap` gesetzt. Die Prüfung braucht kein WebGL.
 *
 * KOORDINATEN: three-Welt. X und Z spannen den Grundriss, Y ist die HÖHE.
 * Im lokalen Raum (`space: 'local'`) zeigt X entlang der Bauteilachse — das
 * ist der Grund, warum `achse+profil` mit `space: 'local'` arbeitet und alles
 * andere mit `'world'`.
 */

/** Rastermass in Metern, auf das beim Ziehen gefangen wird. */
export const RASTER_M = 0.05;

/**
 * Wie darf sich diese Bauform bewegen?
 *
 * @param {{bauform: string, guete?: string}} einordnung
 * @returns {{x, y, z, space, raster, titel} | null}  null = gar nicht ziehbar
 */
export function freiheitsgradeFuer(einordnung) {
    const bauform = einordnung?.bauform ?? null;
    switch (bauform) {
        case 'achse+profil':
            // Lokales X IST die Bauteilachse. Quer dazu (Z) bleibt zu, weil
            // eine Haltung seitlich zu versetzen fast immer heisst, dass die
            // ganze Trasse falsch liegt — dafür zieht man die Achse, nicht das
            // Rohr.
            return { x: true, y: true, z: false, space: 'local', raster: RASTER_M,
                     titel: 'Entlang der Achse und in der Höhe' };

        case 'koerper':
        case 'punkt':
            // Ein Schacht darf im Grundriss wandern und in der Höhe.
            return { x: true, y: true, z: true, space: 'world', raster: RASTER_M,
                     titel: 'Im Grundriss und in der Höhe' };

        case 'flaeche+dicke':
            // Eine Wand im Grundriss, nicht in der Höhe: ihre Höhe kommt vom
            // Geschoss, und sie dort zu verschieben hiesse, sie vom Geschoss
            // zu lösen.
            return { x: true, y: false, z: true, space: 'world', raster: RASTER_M,
                     titel: 'Im Grundriss' };

        case 'hoehenfeld':
            // Gelände wird geformt, nicht verschoben (Stufe 10).
            return null;

        case 'linie':
        case 'flaeche':
            // Sie werden an ihren STÜTZPUNKTEN bearbeitet, nicht als Ganzes
            // gezogen. Das ist ein eigenes Werkzeug und kommt mit 9.4.
            return null;

        default:
            // 'netz' und Unbekanntes: keine verlässliche Achse, kein Zwang, den
            // man rechtfertigen könnte. Lieber gar nicht anbieten.
            return null;
    }
}

/**
 * Darf an diesem Bauteil überhaupt gezogen werden?
 *
 * Die GÜTE zählt mit: Eine aus dem Netz geschätzte Achse taugt zum Anzeigen,
 * aber nicht als Richtung, entlang der man ein Bauteil verschiebt und das
 * Ergebnis festschreibt. Wer auf schlechten Daten zieht, bekommt ein Ergebnis,
 * das genauso aussieht wie ein gutes.
 */
export function darfZiehen(einordnung) {
    if (!freiheitsgradeFuer(einordnung)) return false;
    if (einordnung?.bauform !== 'achse+profil') return true;
    if (einordnung?.guete === 'gemessen') return true;
    // DEKLARIERTE Formen dürfen auch mit geschätzter Achse gezogen werden.
    //
    // Die Schranke oben schützt vor einer RATEREI der Maschine: eine
    // Skelettachse bekommt man auch aus einem Würfel, und sie zur Grundlage
    // einer Sohlhöhe zu machen wäre geraten. Hat aber ein MENSCH gesagt, dass
    // das eine Leitung ist (Regel oder Typprofil), ist die Form nicht mehr
    // geraten — nur die Richtung kommt aus dem Netz. Dann ist Ziehen
    // vertretbar, solange es dabei steht.
    //
    // Ohne diese Ausnahme wäre Fabios ganzer Kanalbestand unbearbeitbar: ProVI
    // exportiert Haltungen als IFCBUILDINGELEMENTPROXY ohne Achs-Repräsentation.
    return einordnung?.quelle === 'regel' || einordnung?.quelle === 'typprofil';
}

/** Ein Hinweis, der stehen bleibt, auch wenn gezogen werden DARF. */
export function guetehinweisZiehen(einordnung) {
    if (!darfZiehen(einordnung)) return '';
    if (einordnung?.bauform === 'achse+profil' && einordnung?.guete !== 'gemessen') {
        return 'Achse aus dem Netz geschätzt — Richtung prüfen.';
    }
    return '';
}

/**
 * Der Grund, warum nicht — für den Hinweis am Bauteil.
 *
 * „Geht nicht" ohne Grund ist die schlechteste Rückmeldung: der Nutzer probiert
 * es weiter, weil er nicht weiss, ob er etwas falsch macht.
 */
export function grundOhneZiehen(einordnung) {
    if (darfZiehen(einordnung)) return '';
    const bauform = einordnung?.bauform ?? null;
    if (bauform === 'hoehenfeld') return 'Gelände wird geformt, nicht verschoben.';
    if (bauform === 'linie' || bauform === 'flaeche') return 'Wird an den Stützpunkten bearbeitet.';
    if (bauform === 'achse+profil') return 'Achse nur aus dem Netz geschätzt — Verschieben wäre geraten.';
    return 'Für diese Form gibt es keine verlässliche Richtung.';
}
