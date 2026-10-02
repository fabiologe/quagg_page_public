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
 *                        PUNKTE in m NN (das Zeichenwerkzeug liest sie so);
 *                        `setzbar: true` bringt ein Werkzeug „… ändern" mit (A6)
 *   netzrolle            'kante' | 'knoten' — die Rolle im Netz (AE)
 *   geometrie            { art, … } — siehe `GEOMETRIE_ARTEN` in `Rezeptbau.js`
 *   symbol               Plansymbol im Lageplan (`PlanSymbols.js`) statt Linienzug
 */

import { JA_NEIN } from '../katalog/Merkmalsziele.js';

/** Felder, die jedes gezeichnete Bauteil hat. */
const NAME = Object.freeze({ name: 'name', titel: 'Bezeichnung', typ: 'text', leerErlaubt: true });
const TYP = Object.freeze({ name: 'kategorie', titel: 'IFC-Typ', typ: 'text' });

/**
 * DIE AUSFÜHRUNG (Fund 8, Teil XXVI): der PredefinedType der IFC-Klasse —
 * Bodenplatte `BASESLAB`, Decke `ROOF`, Stützwand `RETAININGWALL`. Bis hierher
 * schrieb kein Zeichenwerkzeug ihn, jede eigene Platte kam als `NOTDEFINED`
 * ins IFC. Geprüft wird gegen das Wörterbuch der GEWÄHLTEN Klasse
 * (`pruefeBauplan`); `USERDEFINED` verlangt den Objekttyp — den deutschen
 * Fachbegriff, etwa „Überlaufschwelle". Leer heisst: die Vorgabe des Rezepts.
 */
const ausfuehrung = (vorgabe = undefined, objektTyp = undefined) => [
    { name: 'predefinedType', titel: 'Ausführung (IFC-PredefinedType)', typ: 'text', leerErlaubt: true, setzbar: true,
      ...(vorgabe ? { vorgabe } : {}) },
    { name: 'objektTyp', titel: 'Objekttyp (Pflicht bei USERDEFINED)', typ: 'text', leerErlaubt: true, setzbar: true,
      ...(objektTyp ? { vorgabe: objektTyp } : {}) },
];

/**
 * Tragend — ein Feld, das zugleich ein bSI-Merkmal ist (Teil XXVI, Z3, Fabios E22).
 * Vorgabe „ja": eine Platte, eine Wand, ein Fundament trägt, wenn niemand etwas
 * anderes sagt. Ein Belag ist ein anderer Typ (IfcCovering) — für den gilt der
 * Satz nicht, und der Schreiber lässt ihn weg und sagt es.
 *
 * LEER ERLAUBT, und leer heisst Vorgabe. Ein NEUES Feld an einem BESTEHENDEN
 * Rezept darf kein Pflichtfeld sein: `pruefe` füllt keine Vorgabe auf, und
 * jedes alte Kommando „Platte zeichnen" ohne dieses Feld wäre abgelehnt worden
 * (gefunden von der Reichweite-Ratsche, Z3). Die Vorgabe greift beim Sammeln
 * der Merkmale (`merkmaleAusFeldern`), wie ein fehlendes Mass beim Bauen.
 */
const tragend = (satz) => Object.freeze({ name: 'tragend', titel: 'Tragend (leer = ja)', typ: 'auswahl', optionen: JA_NEIN,
                                         vorgabe: 'ja', leerErlaubt: true, setzbar: true, pset: `${satz}.LoadBearing` });

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
            // Die SOHLE (Teil XXIV, K4 — E7): eine neue Haltung liegt mit ihrer
            // Sohle auf den gezeichneten Punkten, nicht mit ihrer Mitte.
            { name: 'hoehe', titel: 'Sohlhöhe', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dn', titel: 'DN', einheit: 'mm', typ: 'zahl', min: 50, max: 4000, gueltig: { ueber: 0 }, vorgabe: 300, setzbar: true },
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
            { name: 'dn', titel: 'Durchmesser', einheit: 'mm', typ: 'zahl', min: 300, max: 4000, gueltig: { ueber: 0 }, vorgabe: 1000, setzbar: true },
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
            { name: 'laenge', titel: 'Höhe des Pfostens', einheit: 'm', typ: 'zahl', min: 0.05, max: 30, gueltig: { ueber: 0 }, vorgabe: 1, setzbar: true },
            { name: 'breite', titel: 'Breite', einheit: 'm', typ: 'zahl', min: 0.01, max: 5, gueltig: { ueber: 0 }, vorgabe: 0.12 },
            { name: 'tiefe', titel: 'Tiefe', einheit: 'm', typ: 'zahl', min: 0.01, max: 5, gueltig: { ueber: 0 }, vorgabe: 0.12 },
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
            { name: 'dicke', titel: 'Dicke', einheit: 'm', typ: 'zahl', min: 0.01, max: 10, gueltig: { ueber: 0 }, vorgabe: 0.2, setzbar: true,
              griff: { richtung: 'y', von: 'oberkante' } },
            tragend('Pset_SlabCommon'),
            ...ausfuehrung(),
        ],
        geometrie: { art: 'platte', dicke: 'dicke', richtung: 'unten' },
        // Mengen (Teil XXVI, Z4) nach Qto_SlabBaseQuantities: Fläche und Umfang in der Draufsicht.
        menge: { depth: 'dicke', netArea: 'grundflaeche', perimeter: 'umfang', netVolume: 'volumen' },
    },
    {
        /**
         * EINE STEHENDE SCHEIBE ENTLANG EINER LINIE (Teil XXVI, Z2): Beckenwand,
         * Stützwand, Kammerwand. Zwölf Typprofile tragen `flaeche+dicke`, eine
         * Wand konnte keins erzeugen — `platte` ist waagerecht, `pfosten` ein Stab.
         *
         * Die gezeichnete Linie ist der FUSS (Unterkante in m NN, Fabios E20):
         * im Tiefbau steht die Wand auf der Bodenplatte, deren Oberkante kennt
         * der Planer. Dafür nennt die Geometrie ihren Höhenbezug fest
         * (`achsbezug: 'sohle'`) — derselbe Mechanismus wie bei der Haltung.
         * Ohne ihn stünde die Wand mit halber Höhe im Boden.
         *
         * Keine Netzrolle: eine Wand bekommt keine Haltungswerkzeuge.
         */
        id: 'wand',
        titel: 'Wand',
        icon: 'cat-wall',
        // Gezeichnet ist sie eine ACHSE MIT PROFIL — bearbeitet wird sie an ihrer
        // Linie, und das Katalogschema lässt einen Sweep nichts anderes tragen.
        // Eine GELIEFERTE Wand bleibt `flaeche+dicke` (Typprofil IFCWALL): dort
        // ist sie eine Scheibe, deren Achse niemand kennt.
        bauform: 'achse+profil',
        kategorieVorgabe: 'IFCWALL',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Fusshöhe (Unterkante)', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dicke', titel: 'Dicke', einheit: 'm', typ: 'zahl', min: 0.05, max: 3, gueltig: { ueber: 0 }, vorgabe: 0.3, setzbar: true,
              griff: { richtung: 'quer' } },
            { name: 'wandhoehe', titel: 'Wandhöhe', einheit: 'm', typ: 'zahl', min: 0.1, max: 30, gueltig: { ueber: 0 }, vorgabe: 2.5, setzbar: true,
              griff: { richtung: 'y', von: 'unterkante' } },
            tragend('Pset_WallCommon'),
            // Aussen: im Tiefbau steht die Wand meist im Erdreich (IDS „Wände — IsExternal").
            { name: 'aussen', titel: 'Aussenwand (leer = ja)', typ: 'auswahl', optionen: JA_NEIN, vorgabe: 'ja',
              leerErlaubt: true, setzbar: true, pset: 'Pset_WallCommon.IsExternal' },
            ...ausfuehrung(),
        ],
        hoehenAus: 'gelaende',
        geometrie: { art: 'sweep', achsbezug: 'sohle',
                     profil: { art: 'rechteck', breite: 'dicke', tiefe: 'wandhoehe', einheit: 'm' } },
        // Qto_WallBaseQuantities: „Length — along center line" = die gezeichnete Achse.
        menge: { length: 'achslaenge', width: 'dicke', height: 'wandhoehe', netVolume: 'volumen' },
    },
    {
        /**
         * DAS STREIFENFUNDAMENT (Teil XXVI, Z2): geometrisch dasselbe wie die
         * Wand — eine Linie mit Rechteckprofil, nur breiter und flacher. Ein
         * Muster, zwei Katalogeinträge. Die Linie ist die Sohle des Fundaments.
         */
        id: 'streifenfundament',
        titel: 'Streifenfundament',
        icon: 'cat-footing',
        bauform: 'achse+profil',
        kategorieVorgabe: 'IFCFOOTING',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Sohle des Fundaments', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'breite', titel: 'Breite', einheit: 'm', typ: 'zahl', min: 0.1, max: 10, gueltig: { ueber: 0 }, vorgabe: 0.6, setzbar: true,
              griff: { richtung: 'quer' } },
            { name: 'dicke', titel: 'Dicke', einheit: 'm', typ: 'zahl', min: 0.05, max: 5, gueltig: { ueber: 0 }, vorgabe: 0.4, setzbar: true,
              griff: { richtung: 'y', von: 'unterkante' } },
            tragend('Pset_FootingCommon'),
            // Das Rezept HEISST so — die Vorgabe ist kein Raten.
            ...ausfuehrung('STRIP_FOOTING'),
        ],
        hoehenAus: 'gelaende',
        geometrie: { art: 'sweep', achsbezug: 'sohle',
                     profil: { art: 'rechteck', breite: 'breite', tiefe: 'dicke', einheit: 'm' } },
        menge: { length: 'achslaenge', width: 'breite', height: 'dicke', netVolume: 'volumen' },
    },
    {
        /**
         * DIE ÜBERLAUFSCHWELLE (Teil XXVI, Z8): geometrisch eine niedrige Wand —
         * dieselbe Linie mit Rechteckprofil, gezeichnet am Fuss. Was sie zur
         * Schwelle macht, sind drei Zahlen, die keine bSI-Vorlage kennt
         * (`Quagg_Entlastung`, Katalog `backend/app/ifc/daten/quagg-merkmale.json`):
         * Schwellenhöhe, Überfalllänge, Überfallbeiwert.
         *
         * Die SCHWELLENHÖHE ist die Oberkante des Körpers — gemessen
         * (`lagemerkmale`), nie getippt: Fuss + Höhe ist schon die Zahl.
         * Im IFC: `IfcWall/USERDEFINED`, ObjectType „Überlaufschwelle" (Fund 8).
         * Nicht tragend und innen — sie steht im Becken, nicht im Erdreich.
         */
        id: 'ueberlaufschwelle',
        titel: 'Überlaufschwelle',
        icon: 'cat-wall',
        bauform: 'achse+profil',
        kategorieVorgabe: 'IFCWALL',
        mindestPunkte: 2,
        geschlossen: false,
        felder: [
            NAME, TYP,
            { name: 'hoehe', titel: 'Fusshöhe (Unterkante)', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'dicke', titel: 'Dicke', einheit: 'm', typ: 'zahl', min: 0.05, max: 3, gueltig: { ueber: 0 }, vorgabe: 0.3 },
            { name: 'wandhoehe', titel: 'Höhe über dem Fuss', einheit: 'm', typ: 'zahl', min: 0.05, max: 10, gueltig: { ueber: 0 }, vorgabe: 0.5, setzbar: true,
              griff: { richtung: 'y', von: 'unterkante' } },
            { name: 'tragend', titel: 'Tragend (leer = nein)', typ: 'auswahl', optionen: JA_NEIN, vorgabe: 'nein',
              leerErlaubt: true, pset: 'Pset_WallCommon.LoadBearing' },
            { name: 'aussen', titel: 'Aussenwand (leer = nein)', typ: 'auswahl', optionen: JA_NEIN, vorgabe: 'nein',
              leerErlaubt: true, pset: 'Pset_WallCommon.IsExternal' },
            { name: 'ueberlaufart', titel: 'Art des Überlaufs', typ: 'auswahl', leerErlaubt: true, setzbar: true,
              optionen: [{ wert: 'Beckenüberlauf', titel: 'Beckenüberlauf' }, { wert: 'Klärüberlauf', titel: 'Klärüberlauf' },
                         { wert: 'Notüberlauf', titel: 'Notüberlauf' }],
              pset: 'Quagg_Entlastung.Art' },
            { name: 'schwellenlaenge', titel: 'Wirksame Überfalllänge (leer = nicht angegeben)', einheit: 'm', typ: 'zahl',
              min: 0, gueltig: { ueber: 0 }, leerErlaubt: true, setzbar: true, pset: 'Quagg_Entlastung.Schwellenlaenge' },
            { name: 'ueberfallbeiwert', titel: 'Überfallbeiwert µ', typ: 'zahl', min: 0.3, max: 1, gueltig: { ueber: 0 },
              leerErlaubt: true, setzbar: true, pset: 'Quagg_Entlastung.Ueberfallbeiwert' },
            { name: 'herleitung', titel: 'Herleitung des Beiwerts', typ: 'text', leerErlaubt: true, setzbar: true,
              pset: 'Quagg_Entlastung.Herleitung' },
            ...ausfuehrung('USERDEFINED', 'Überlaufschwelle'),
        ],
        lagemerkmale: { 'Quagg_Entlastung.SchwellenhoeheNN': 'oberkante' },
        hoehenAus: 'gelaende',
        geometrie: { art: 'sweep', achsbezug: 'sohle',
                     profil: { art: 'rechteck', breite: 'dicke', tiefe: 'wandhoehe', einheit: 'm' } },
        menge: { length: 'achslaenge', width: 'dicke', height: 'wandhoehe', netVolume: 'volumen' },
    },
    {
        /**
         * DER RAUM (Teil XXVI, Z6): das Speichervolumen eines Beckens ist kein
         * Bauteil, es ist ein RAUM — der Hohlraum zwischen Wand und Platte. Der
         * Umriss ist der Fussboden (m NN), die lichte Höhe geht nach oben; das
         * Volumen kommt aus dem Körper, nicht aus einer Eingabe.
         *
         * Die eine Ausnahme vom Tor aus Z1: ein Rezept mit `raum: true` darf eine
         * IfcSpace schreiben. Der Schreiber zerlegt sie unter ihre Anlage (WR41),
         * nie enthalten (WR31). Kein Typ-Feld: ein Raum ist immer eine IfcSpace.
         * Die Bezeichnung ist Pflicht — die IDS verlangt sie („Räume — Name vorhanden").
         */
        id: 'raum',
        titel: 'Raum',
        icon: 'space',
        bauform: 'koerper',
        kategorieVorgabe: 'IFCSPACE',
        raum: true,
        mindestPunkte: 3,
        geschlossen: true,
        felder: [
            { name: 'name', titel: 'Bezeichnung', typ: 'text' },
            { name: 'hoehe', titel: 'Fussboden', einheit: 'm', typ: 'zahl', leerErlaubt: true },
            { name: 'raumhoehe', titel: 'Lichte Höhe', einheit: 'm', typ: 'zahl', min: 0.1, max: 100, gueltig: { ueber: 0 }, vorgabe: 2.5, setzbar: true,
              griff: { richtung: 'y', von: 'unterkante' } },
            // Innen, solange niemand „offen" sagt (Fund 8) — ein offenes Becken ist EXTERNAL.
            ...ausfuehrung('INTERNAL'),
            // Quagg_Speicherraum (Z8): die Höhe, bei der die Schwelle anspringt — eine Eingabe.
            { name: 'betriebswasser', titel: 'Betriebswasserspiegel', einheit: 'm NN', typ: 'zahl', leerErlaubt: true,
              setzbar: true, pset: 'Quagg_Speicherraum.BetriebswasserNN' },
        ],
        // Die Sohle des Raums ist sein Boden — gemessen, nicht getippt.
        lagemerkmale: { 'Quagg_Speicherraum.SohlhoeheNN': 'unterkante' },
        geometrie: { art: 'platte', dicke: 'raumhoehe', richtung: 'oben' },
        // Qto_SpaceBaseQuantities — die Fläche verlangt die IDS („Räume — Fläche dokumentiert").
        menge: { netFloorArea: 'grundflaeche', height: 'raumhoehe', netVolume: 'volumen' },
    },
]);
