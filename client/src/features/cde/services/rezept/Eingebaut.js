/**
 * Die eingebauten Rezepte — als DATEN (Teil XXIII, A4).
 *
 * Hier steht, WAS ein Bauteil ist: Titel, Bauform, IFC-Vorgabe, Felder, Rolle
 * im Netz und die Art seiner Geometrie. WIE daraus Geometrie, Kernel-Form,
 * Verschiebung und Fachmodell werden, weiss `Rezeptbau.js` — einmal für alle.
 * Kein Eintrag enthält Code: `JSON.parse(JSON.stringify(EINGEBAUTE_REZEPTE))`
 * baut dasselbe (`rezeptDeklaration.test.js`). Damit ist ein Rezept aus der
 * Bibliothek (A5) nichts anderes als ein weiterer Eintrag dieser Form.
 *
 * Reihenfolge nach NUTZEN, nicht nach Schwierigkeit: `linie` zuerst, weil sie
 * Trasse, Bruchkante, Grenze und Absteckung auf einmal bedient — und weil das
 * Gerinne sie als Achse braucht. `flaeche` gleich danach, weil das
 * Aushubpolygon dieselbe Eingabe ist. Die Reihenfolge ist auch die der
 * Zeichenwerkzeuge und die, in der `rezeptFuerNetzrolle` sucht.
 *
 * Eintrag:
 *   id, titel, icon      Darstellung
 *   bauform              Schlüssel aus BAUFORMEN — bestimmt, was danach an dem
 *                        Bauteil möglich ist (Ziehen, Operationen, Mengen)
 *   kategorieVorgabe     nur die VORGABE; der Typ ist ein Feld
 *   mindestPunkte        weniger ist kein Bauteil
 *   hoechstPunkte        mehr ist keins (Pfosten: genau ein Ort)
 *   geschlossen          Umriss (Fläche) oder offener Zug (Linie)
 *   hoehenAus            'gelaende': Punkte ohne getippte Höhe liegen auf dem Gelände
 *   felder               wie im Bearbeitungs-Katalog; `hoehe` ist die Höhe der
 *                        PUNKTE in m NN (das Zeichenwerkzeug liest sie so)
 *   netzrolle            'kante' | 'knoten' — die Rolle im Netz (AE)
 *   geometrie            { art, … } — siehe `GEOMETRIE_ARTEN` in `Rezeptbau.js`
 *   symbol               Plansymbol im Lageplan (`PlanSymbols.js`) statt Linienzug
 */

/** Felder, die jedes gezeichnete Bauteil hat. */
const NAME = Object.freeze({ name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true });
const TYP = Object.freeze({ name: 'kategorie', titel: 'IFC-Typ', typ: 'text' });

export const EINGEBAUTE_REZEPTE = Object.freeze([
    {
        id: 'linie',
        titel: 'Linie',
        icon: 'route',
        bauform: 'linie',
        kategorieVorgabe: 'IFCANNOTATION',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Höhe (leer = auf dem Gelände)', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        ],
        // Teil XIV, G5: eine Linie ohne eigene Höhe ist eine BRUCHKANTE — sie
        // liegt auf dem Gelände. Wer eine Höhe tippt, zeichnet eine Trasse.
        hoehenAus: 'gelaende',
        // Eine Linie HAT keine Breite — das Band ist Darstellung (`LINIEN_BAND_M`).
        geometrie: { art: 'band' },
    },
    {
        id: 'flaeche',
        titel: 'Fläche',
        icon: 'areas',
        bauform: 'flaeche',
        kategorieVorgabe: 'IFCANNOTATION',
        mindestPunkte: 3,
        geschlossen: true,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
        ],
        geometrie: { art: 'flaeche' },
    },
    {
        id: 'rohr',
        titel: 'Rohr',
        icon: 'laengsschnitt',
        bauform: 'achse+profil',
        kategorieVorgabe: 'IFCPIPESEGMENT',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Höhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dn', titel: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000, vorgabe: 300 },
        ],
        // DIE ROLLE IM NETZ (Teil XXIII, A3): eine Kante — sie verbindet zwei
        // Knoten und hat ein Gefälle. Der Längsschnitt fragt das, nicht „rohr".
        netzrolle: 'kante',
        // Warum kein Band wie die Linie: eine geteilte Haltung besteht aus zwei
        // HALTUNGEN, nicht aus zwei flachen Streifen — und die Bauform wäre
        // `linie` statt `achse+profil`, womit alle Werkzeuge dieser Form ausfielen.
        geometrie: { art: 'sweep', profil: { art: 'kreis', durchmesser: 'dn', einheit: 'mm', ecken: 12 } },
    },
    {
        id: 'schacht',
        titel: 'Schacht',
        icon: 'schacht',
        bauform: 'koerper',
        kategorieVorgabe: 'IFCDISTRIBUTIONCHAMBERELEMENT',
        // ZWEI Punkte: Sohle und Deckel. Ein Schacht ist geometrisch ein
        // senkrechtes Rohr — deshalb braucht er keine eigene Routine, nur eine
        // andere Achse. Die Tiefe ist der Abstand der beiden Punkte, nicht ein
        // drittes Feld daneben: zwei Wege zu derselben Grösse liefen auseinander.
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Sohlhöhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dn', titel: 'Durchmesser', einheit: 'mm', typ: 'zahl', min: 300, max: 4000, vorgabe: 1000 },
        ],
        netzrolle: 'knoten',
        // Im Lageplan ein SYMBOL (A5): Sohle und Deckel liegen im Grundriss
        // übereinander — als Linienzug war ein eigener Schacht unsichtbar.
        symbol: 'schacht',
        geometrie: { art: 'sweep', profil: { art: 'kreis', durchmesser: 'dn', einheit: 'mm', ecken: 16 } },
    },
    {
        /**
         * EIN ORT, EIN STAB (A4, Befund S5): sechs Typprofile tragen die Bauform
         * `punkt`, gezeichnet werden konnte keins. Leitpfosten, Schild, Poller —
         * ein Punkt auf dem Gelände und ein senkrechtes Profil darauf. Die
         * Klasse ist ein Feld; die Vorgabe `IfcSign` passt zu Leitpfosten und
         * Schild und trägt im Katalog dieselbe Bauform.
         */
        id: 'pfosten',
        titel: 'Pfosten',
        icon: 'cat-column',
        bauform: 'punkt',
        kategorieVorgabe: 'IFCSIGN',
        mindestPunkte: 1,
        hoechstPunkte: 1,
        geschlossen: false,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Fusshöhe (leer = auf dem Gelände)', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'laenge', titel: 'Höhe des Pfostens', einheit: 'm', typ: 'zahl', min: 0.05, max: 30, vorgabe: 1 },
            { name: 'breite', titel: 'Breite', einheit: 'm', typ: 'zahl', min: 0.01, max: 5, vorgabe: 0.12 },
            { name: 'tiefe', titel: 'Tiefe', einheit: 'm', typ: 'zahl', min: 0.01, max: 5, vorgabe: 0.12 },
        ],
        hoehenAus: 'gelaende',
        symbol: 'pfosten',
        geometrie: { art: 'stab', laenge: 'laenge',
                     profil: { art: 'rechteck', breite: 'breite', tiefe: 'tiefe', einheit: 'm' } },
    },
    {
        /**
         * EIN UMRISS MIT DICKE (A4, Befund S5): zwölf Typprofile tragen
         * `flaeche+dicke` — Decke, Belag, Fundament —, erzeugen konnte sie
         * keins. Der Umriss ist die OBERKANTE, die Dicke geht nach unten; jeder
         * Punkt behält seine Höhe wie bei der Fläche.
         */
        id: 'platte',
        titel: 'Platte',
        icon: 'cat-slab',
        bauform: 'flaeche+dicke',
        kategorieVorgabe: 'IFCSLAB',
        mindestPunkte: 3,
        geschlossen: true,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Oberkante', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dicke', titel: 'Dicke', einheit: 'm', typ: 'zahl', min: 0.01, max: 10, vorgabe: 0.2 },
        ],
        geometrie: { art: 'platte', dicke: 'dicke', richtung: 'unten' },
    },
]);
