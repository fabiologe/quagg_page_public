/**
 * Interaktive Übungs-Tour ("Kanalratten-Werkstatt").
 *
 * `tutorialSteps.js` enthält nur noch die Begrüßung (Einstiegspunkt) und die
 * reaktiven Kommentare. Der eigentliche Ablauf steht hier: Ein Schritt gilt
 * erst als erledigt, wenn `check(store, snap)` true liefert — geprüft wird
 * also der Zustand des Modells, nicht ein Klick.
 *
 * Aufbau bewusst deklarativ und die Prüfungen bewusst als reine Funktionen:
 * so sind sie ohne Vue/Pinia testbar und die Texte bleiben an EINER Stelle.
 *
 * Step-Schema (zusätzlich zu tutorialSteps.js):
 *   task      kurze Handlungsanweisung (erscheint als Aufgabe)
 *   check     (store, snapshot) => boolean — erledigt?
 *   hint      optionaler Tipp, wenn es hakt
 *   autoAdvance  false = trotz erfüllter Bedingung auf [Weiter] warten
 *   optional  true = hat zwar ein `check` (schaltet also von selbst weiter),
 *             zählt aber NICHT als Aufgabe. Für Schritte, die dem Nutzer nur
 *             folgen, statt ihm etwas abzuverlangen — z.B. das DGM-Angebot:
 *             wer es ausschlägt, hat nichts falsch gemacht.
 *   action    optionales Angebot der Ratte: `{ label, run(store) }`. Erscheint
 *             als zusaetzlicher Knopf in der Sprechblase (z.B. "DGM laden").
 *             `run` darf ein Promise liefern; solange es laeuft, ist der Knopf
 *             gesperrt. Rueckgabe `{ok:false, error}` wird als Warnung gemeldet.
 *   focus     Element, das der Viewer anfahren und neon umkreisen soll
 *             ("SmartZoomer") — entweder fest `{type, id}` ODER eine Funktion
 *             `(store) => {type, id} | null` für dynamische Ziele, z.B. "die
 *             Fläche, der noch die Neigung fehlt". Wird als 'sticky' gesetzt,
 *             bleibt also stehen, solange die Ratte darüber spricht.
 *   draw      Umriss, den der Nutzer selbst zeichnen soll: [{x,y}, …] in
 *             Weltkoordinaten. Der Viewer malt ihn als Geisterumriss vor, der
 *             sich in Schleife selbst nachzieht, und faehrt die Kamera hin —
 *             Antwort auf "wo soll ich denn zeichnen?". Anders als `focus`
 *             zeigt das auf etwas, das es noch NICHT gibt.
 *   requires  (store) => boolean — Voraussetzung. Trifft sie beim Weiterschalten
 *             nicht zu, wird der Schritt übersprungen statt ins Leere zu zeigen
 *             (z.B. die DGM-Auflösungs-Rückfrage, die es nur gibt, wenn der
 *             Nutzer das Angebot auch angenommen hat).
 *
 * `snapshot` ist der bei Übungsstart eingefrorene Ausgangszustand (siehe
 * makeSnapshot) — nötig für Aufgaben der Art "füge etwas NEUES hinzu".
 */

import { loadTutorialDgm } from './loadTutorialDgm.js';

// ── Hilfen: Store-Zugriff robust gegen Map/Array/Objekt ──────────────────────
export const toArray = (collection) => {
    if (!collection) return [];
    if (collection instanceof Map) return Array.from(collection.values());
    if (Array.isArray(collection)) return collection;
    return Object.values(collection);
};

const getNode = (store, id) => {
    const nodes = store?.nodes;
    if (nodes instanceof Map) return nodes.get(id) ?? null;
    return toArray(nodes).find(n => n?.id === id) ?? null;
};

const num = (v) => {
    const f = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(f) ? f : null;
};

// ── Das Übungs-Einzugsgebiet ────────────────────────────────────────────────
// Eine Wiese über der Haltung R_019 (R_014 -> FK001). Die Eckpunkte stammen
// vom Nutzer; der zweite war als 409059.31 angegeben, was 630 m westlich und
// damit weit ausserhalb des Netzes läge (X-Ausdehnung 409572..409924) —
// hier als 409659.31 gelesen, womit der Punkt 1,4 m neben FK001 sitzt und
// das Dreieck sauber über der Haltung liegt (rund 313 m²).
export const TUTORIAL_AREA_POINTS = [
    { x: 409688.42, y: 5480067.15 },
    { x: 409659.31, y: 5480079.21 },
    { x: 409650.86, y: 5480061.20 },
];
/** Haltung, an die das Übungsgebiet entwässern soll. */
export const TUTORIAL_AREA_EDGE = 'R_019';
/** Ihre Endknoten — der Store löst eine Haltungs-Zuordnung intern in genau
 *  diesen 50/50-Split auf, beides ist hydraulisch dasselbe. */
export const TUTORIAL_AREA_EDGE_NODES = ['R_014', 'FK001'];
/** Befestigungsgrad einer Wiese: nur 20 % der Fläche sind abflusswirksam. */
export const TUTORIAL_AREA_RUNOFF = 0.2;

/**
 * Die beiden Knoten, die noch als Schacht im Netz stehen, aber Auslässe sind.
 * ACHTUNG auf die Schreibweise: AL1 endet auf **RBB**, AL2 auf **RRB** — die
 * Asymmetrie steckt so in der Beispiel-XML. Deshalb sucht man im Tutorial
 * nach "AL" und nicht nach der vollen Kennung.
 */
export const TUTORIAL_OUTFALL_NODES = ['AL1_RBB', 'AL2_RRB'];

/** Ausgangszustand einfrieren, damit "neu hinzugefügt" erkennbar bleibt. */
export function makeSnapshot(store) {
    return {
        areaIds: new Set(toArray(store?.areas).map(a => a?.id)),
        areaCount: toArray(store?.areas).length,
        nodeCount: toArray(store?.nodes).length,
    };
}

// ── Wiederverwendbare Prüfungen (rein, ohne Vue/Pinia) ───────────────────────

/**
 * Steht der "Flaeche erstellen"-Dialog offen? Das ist das Signal, dass der
 * Nutzer den Umriss fertig gezeichnet hat — die Flaeche selbst entsteht erst
 * beim Speichern, eine reine Zaehlung der Flaechen wuerde hier also noch
 * nichts melden.
 */
export const areaModalOpen = (store) =>
    store?.ui?.showElementModal === true && store?.ui?.elementModal?.mode === 'area';

/**
 * Die neu gezeichnete Flaeche ist fertig verdrahtet: richtiger
 * Befestigungsgrad UND an der vorgesehenen Haltung. Geprueft wird nur, was
 * NEU dazugekommen ist (Abgleich gegen den Ausgangs-Schnappschuss) — sonst
 * wuerde eine zufaellig passende Bestandsflaeche die Aufgabe erfuellen.
 */
export const newAreaIsWiredUp = (store, snap) => {
    const bekannt = snap?.areaIds ?? new Set();
    return toArray(store?.areas).some(a => {
        if (!a || bekannt.has(a.id)) return false;
        const psi = num(a.runoffCoeff);
        if (psi == null || Math.abs(psi - TUTORIAL_AREA_RUNOFF) >= 0.005) return false;
        // Haltung direkt ODER einer ihrer Endknoten: wer die Haltung waehlt,
        // bekommt vom Store ohnehin den 50/50-Split auf genau diese beiden.
        return String(a.edgeId ?? '').trim() === TUTORIAL_AREA_EDGE
            || TUTORIAL_AREA_EDGE_NODES.includes(String(a.nodeId ?? '').trim());
    });
};

/** Nur der Befestigungsgrad — ohne Anspruch an den Anschluss. */
export const newAreaHasRunoff = (store, snap) => {
    const bekannt = snap?.areaIds ?? new Set();
    return toArray(store?.areas).some(a => {
        if (!a || bekannt.has(a.id)) return false;
        const psi = num(a.runoffCoeff);
        return psi != null && Math.abs(psi - TUTORIAL_AREA_RUNOFF) < 0.005;
    });
};

/**
 * Die Berechnung ist durch — egal ob sauber oder mit Fehler. Bewusst BEIDES:
 * die Uebung ist an dieser Stelle vorbei, sobald der Nutzer den Knopf gedrueckt
 * und der Rechner geantwortet hat. Was danach kommt, ist echte Arbeit am Netz.
 */
export const simulationFinished = (store) =>
    ['success', 'error'].includes(store?.simulation?.status);

/** Ein KOSTRA-Regen ist uebernommen (Methode umgestellt UND Wert gesetzt). */
export const kostraRainApplied = (store) =>
    store?.rain?.method === 'kostra' && Number(store?.rain?.intensity) > 0;

/**
 * Ein Modellregen ist gesetzt — also ein VERLAUF ueber die Zeit, nicht nur
 * eine Intensitaet.
 *
 * Geprueft wird die Reihe selbst, nicht ihre Kenndaten: die Aufgabe nennt
 * 3 Jahre und 15 Minuten als das, was man hier ueblicherweise nimmt, aber wer
 * bewusst eine andere Wiederkehrzeit waehlt, hat die Sache trotzdem
 * verstanden. Ein leerer Verlauf zaehlt nicht — den erzeugt das Fenster, wenn
 * die KOSTRA-Spalte fehlt.
 */
export const modelRainApplied = (store) => {
    const regen = store?.rain?.activeModelRain;
    return !!regen && Array.isArray(regen.series) && regen.series.length > 0;
};

/** Jede Fläche hat einen plausiblen Abflussbeiwert (0 < ψ ≤ 1). */
export const allAreasHaveRunoffCoeff = (store) => {
    const areas = toArray(store?.areas);
    if (!areas.length) return false;
    return areas.every(a => {
        const v = num(a?.runoffCoeff);
        return v != null && v > 0 && v <= 1;
    });
};

/** Jede Fläche hat eine gültige Neigungsklasse (1–5). */
export const allAreasHaveSlope = (store) => {
    const areas = toArray(store?.areas);
    if (!areas.length) return false;
    return areas.every(a => [1, 2, 3, 4, 5].includes(Number(a?.slope)));
};

/** Alle genannten Knoten sind Auslaufbauwerke (Bauwerkstyp 5). */
export const nodesAreOutfalls = (store, ids = []) =>
    ids.length > 0 && ids.every(id => {
        const n = getNode(store, id);
        if (!n) return false;
        return Number(n.bauwerkstyp) === 5 || Number(n.type) === 5;
    });

// ── Übungs-Schritte ──────────────────────────────────────────────────────────
// Reihenfolge = Ablauf. Texte/Aufgaben sind bewusst knapp gehalten und werden
// beim Feinschliff des Skripts ergänzt.
export const EXERCISE_STEPS = [
    {
        id: 'ex-intro',
        mood: 'happy',
        // Lernkarte hing frueher am Begruessungs-Schritt der alten Fuehrung;
        // seit die entfallen ist, gehoert sie hierher an den Tutorial-Anfang.
        info: 'swmm-ueberblick',
        message:
            'Willkommen in meiner Werkstatt, Kanaltaucher! Ich hab dir ein Netz mitgebracht — da fehlen noch ein paar Sachen. '
            + 'Die ergaenzen wir jetzt zusammen, Schritt fuer Schritt.',
        // Reiner Begruessungsschritt: kein check -> [Weiter] schaltet weiter.
    },

    // ── Orientierung: erst die grobe Werkstatt zeigen, dann arbeiten ─────────
    // Ohne diese vier Schritte stuende der Nutzer direkt vor einer Aufgabe,
    // ohne zu wissen, wo ueberhaupt was liegt.
    {
        id: 'ex-tour-map',
        mood: 'happy',
        highlight: 'viewer-map',
        message:
            'Das hier ist deine Baustelle: die Karte. Jeder Punkt ist ein Schacht, jede Linie eine Haltung, '
            + 'und jede Flaeche ein Stueck Land, von dem Regen in den Kanal laeuft. '
            + 'Das Raster im Hintergrund ist dein Massstab — ein Kaestchen ist ein Meter.',
    },
    {
        id: 'ex-tour-controls',
        mood: 'asking',
        highlight: 'viewer-controls',
        message:
            'Unten links liegt die Ansichts-Leiste. Dort schaltest du zwischen Ziehen und Auswaehlen um, '
            + 'stellst das Raster ein und legst die EZG-Karte mit Luftbild und Hoehenlinien unter das Netz. '
            + 'Verirrt? Der Rundpfeil holt die Ansicht zurueck aufs ganze Netz.',
    },
    {
        id: 'ex-tour-toolbox',
        mood: 'happy',
        highlight: 'editor-toolbox',
        message:
            'Oben in der Mitte haengt das Werkzeug. Damit setzt du Schaechte, ziehst Haltungen, '
            + 'zeichnest Flaechen, teilst eine Leitung oder loeschst, was zu viel ist. '
            + 'Ein Klick auf dasselbe Werkzeug legt es wieder weg.',
    },
    {
        id: 'ex-tour-sidebar',
        mood: 'asking',
        highlight: 'sidebar',
        message:
            'Und links ist die Kommandozentrale. Die gehen wir jetzt von oben nach unten durch — '
            + 'Knopf fuer Knopf, damit du spaeter weisst, wo du greifen musst.',
    },

    // ── Kommandozentrale, Knopf fuer Knopf ──────────────────────────────────
    // Bewusst je ein Schritt pro Bedienelement (Nutzer-Wunsch). Die
    // Ergebnis-Knoepfe (Ergebnisse anzeigen / Debug / .inp / .json) fehlen
    // hier absichtlich: sie haengen an v-if="success" und existieren waehrend
    // des Rundgangs noch gar nicht — ein Highlight darauf ginge ins Leere.
    {
        id: 'ex-tour-xml-import',
        mood: 'happy',
        highlight: 'xml-import',
        info: 'isybau-xml',
        message:
            '"XML importieren": So kommt ein fertiges Kanalnetz herein — eine ISYBAU-XML, wie sie dir '
            + 'ein Vermesser oder die Kommune gibt. Dein Uebungsnetz ist genau so hereingekommen.',
    },
    {
        id: 'ex-tour-dgm',
        mood: 'asking',
        highlight: 'dgm-import',
        info: 'dgm-gelaende',
        message:
            '"Gelaende (DGM) laden": Das ist die Hoehenkarte des Bodens. Damit weiss ich, wie das Land liegt — '
            + 'ich kann dir dann Deckelhoehen vorschlagen und die Neigung deiner Flaechen ausrechnen. '
            + 'Ich hab uns schon eins besorgt, vom Geoportal Rheinland-Pfalz, genau ueber unserem Netz. Soll ich?',
        action: {
            label: 'DGM laden',
            run: (store) => loadTutorialDgm(store),
        },
        // Sobald die Auflösungs-Rückfrage steht, weiter zum "Importieren"-Knopf.
        // `optional`, weil das kein Arbeitsauftrag ist — wer nicht mag, klickt
        // [Weiter] und die Aufgabenzählung bleibt davon unberührt.
        optional: true,
        check: (store) => store?.ui?.demImportPanelOpen === true,
    },
    {
        id: 'ex-tour-dgm-import',
        mood: 'asking',
        highlight: 'dgm-importieren',
        info: 'dgm-gelaende',
        message:
            'Da ist die Rueckfrage: wie fein soll das Hoehenraster werden? Die Punkte liegen 5 m auseinander, '
            + 'aber nicht lueckenlos — deshalb schlage ich 10 m vor, das fuellt die Loecher sauber auf. '
            + 'Lass einfach alles so, wie es ist, und klick auf "Importieren".',
        hint: 'Feiner ist nicht besser: unter dem Punktabstand erfindet die Rasterung nur Zwischenwerte.',
        optional: true,
        // Nur zeigen, wenn die Rueckfrage wirklich offen steht — wer das
        // Angebot mit [Weiter] uebergeht, soll nicht zu einem Knopf gelotst
        // werden, den es gerade nicht gibt.
        requires: (store) => store?.ui?.demImportPanelOpen === true,
        check: (store) => !!store?.terrain,
    },
    {
        id: 'ex-tour-dgm-fertig',
        mood: 'happy',
        message:
            'Geschafft — das Gelaende liegt jetzt unter dem Netz. Ein ehrlicher Hinweis: dieser Kartenausschnitt '
            + 'deckt rund 87 % unseres Netzes ab, im Norden fehlt ein Streifen. Wo keine Hoehe da ist, kann ich '
            + 'auch nichts vorschlagen — das gehoert zum Handwerk dazu.',
        requires: (store) => !!store?.terrain,
    },
    {
        id: 'ex-tour-projekte',
        mood: 'happy',
        highlight: 'projekte',
        message:
            '"Projekte": Dein Speicherfach. Hier legst du den aktuellen Stand ab und holst ihn spaeter zurueck — '
            + 'praktisch, bevor du etwas Groesseres ausprobierst.',
    },
    {
        id: 'ex-tour-neu-starten',
        mood: 'asking',
        highlight: 'neu-starten',
        info: 'standort-georeferenz',
        message:
            '"Neu starten": Wenn du OHNE fertige Datei anfangen willst. Du waehlst zuerst einen Ort auf der Welt, '
            + 'dann legen sich Luftbild und Hoehenlinien passend darunter und du zeichnest dein Netz von Hand.',
    },
    {
        id: 'ex-tour-xml-export',
        mood: 'happy',
        highlight: 'xml-export',
        info: 'isybau-xml',
        message:
            '"XML exportieren": der Rueckweg. Dein bearbeitetes Netz wandert wieder als ISYBAU-XML hinaus — '
            + 'die kannst du weitergeben oder in einem anderen Programm oeffnen. Was in so einer '
            + 'Datei steht und wer sich das ausgedacht hat, erklaert [Mehr dazu].',
    },
    {
        id: 'ex-tour-stats',
        mood: 'happy',
        highlight: 'netz-stats',
        message:
            'Diese Zeile ist dein Kassensturz: wie viele Schaechte, Haltungen und Flaechen gerade im Netz stecken. '
            + 'Wenn du gleich etwas dazubaust, kannst du hier zuschauen, wie die Zahl waechst.',
    },
    {
        id: 'ex-tour-rain',
        mood: 'rain',
        highlight: 'rain-config',
        info: 'bemessungsregen',
        message:
            'Jetzt der Regen — ohne den passiert naemlich gar nichts. "Modellregen" baut dir einen kuenstlichen '
            + 'Regen nach Lehrbuch, "KOSTRA" holt echte Statistikwerte fuer deine Koordinaten vom Deutschen Wetterdienst.',
    },
    {
        id: 'ex-tour-daten',
        mood: 'asking',
        highlight: 'daten-bearbeiten',
        message:
            '"Daten bearbeiten" oeffnet die grosse Tabelle. Dort siehst du alle Schaechte, Haltungen und Flaechen '
            + 'untereinander und kannst viele auf einmal aendern — schneller als jeden einzeln auf der Karte anzuklicken.',
    },
    {
        id: 'ex-tour-validieren',
        mood: 'asking',
        highlight: 'abfluss-validieren',
        message:
            '"Abfluss validieren" ist mein Spuersinn: Ich schaue vorher ueber deine Flaechen und melde, was unplausibel '
            + 'aussieht — ein fehlender Beiwert, eine Flaeche ohne Anschluss. Lieber hier stolpern als mitten in der Rechnung.',
    },
    {
        id: 'ex-tour-dauer',
        mood: 'happy',
        highlight: 'sim-dauer',
        message:
            'Die Simulationsdauer sagt, wie lange wir das Netz beobachten. Der Regen ist meist nach kurzer Zeit vorbei, '
            + 'aber das Wasser braucht noch, bis es durch ist — deshalb rechnet man laenger als es regnet.',
    },
    {
        id: 'ex-tour-run',
        mood: 'asking',
        highlight: 'run-simulation',
        info: 'dynamic-wave',
        message:
            '"Berechnung starten" — der grosse rote Knopf. Damit rechnet der SWMM-Solver direkt hier im Browser durch, '
            + 'Zeitschritt fuer Zeitschritt, wie sich das Wasser durch dein Netz schiebt.',
    },
    {
        id: 'ex-tour-ansicht',
        mood: 'happy',
        highlight: 'ansicht-nav',
        message:
            'Ganz unten schaltest du die Ansicht um: der 2D-Editor zum Bauen, die 3D-Ansicht zum Anschauen. '
            + 'Sobald gerechnet ist, kommen hier zwei weitere Knoepfe fuer die Ergebnisse dazu.',
    },
    {
        id: 'ex-tour-theme',
        mood: 'surprised',
        highlight: 'theme-toggle',
        message:
            'Und der Knopf ganz unten links macht das Licht aus. Wir Ratten moegen es ja dunkel — '
            + 'aber probier ruhig, was deinen Augen besser passt. So, jetzt kennst du den Laden. Packen wir an!',
    },
    {
        id: 'ex-add-area',
        mood: 'asking',
        info: 'netzmodell',
        highlight: 'editor-toolbox',
        task: 'Zeichne das fehlende Einzugsgebiet ein.',
        message:
            'Schau mal: Ein Stueck Wiese fehlt noch — da faellt Regen hin, aber er kommt nirgends an. '
            + 'Ich hab dir den Umriss hingemalt: drei Punkte, die Reihenfolge steht dran. '
            + 'Nimm das Flaechen-Werkzeug und fahr ihn nach — Doppelklick schliesst die Flaeche.',
        hint: 'Werkzeugleiste oben: das Symbol mit m². Der gruene Umriss zeigt, wo — genau treffen musst du nicht.',
        // Geisterumriss + Kamerafahrt dorthin (siehe composables/useDrawingHint.js).
        draw: TUTORIAL_AREA_POINTS,
        // Fertig gezeichnet = der Erstellen-Dialog steht. Die Flaeche selbst
        // entsteht erst beim Speichern, danach wird sie in ex-area-anschluss geprueft.
        check: areaModalOpen,
    },
    {
        id: 'ex-area-befestigung',
        mood: 'asking',
        info: 'befestigungsgrad',
        highlight: 'area-befestigung',
        // Der Text nennt das Feld genau so, wie es im Formular steht. Vorher
        // sagte die Ratte "Befestigungsgrad" — ein Wort, das nirgends auf dem
        // Bildschirm stand: die Testleserin fand das Feld deshalb nicht.
        message:
            'Gut gezeichnet! Das Formular fragt jetzt nach dem "Versiegelungsgrad" — das Feld '
            + 'gleich unter der Groesse. Der Wert sagt, welcher Anteil des Regens von dieser '
            + 'Flaeche ueberhaupt im Kanal ankommt: 1 waere ein Dach, von dem alles ablaeuft, '
            + '0 ein Boden, der alles schluckt.\n\n'
            + 'Wir haben hier Wiese — trag 0.2 ein. Also: 20 % laufen ab, der Rest versickert.',
        hint: 'Zweites Feld von oben, "Versiegelungsgrad (0.0 - 1.0)": 0.2 eintragen.',
        // Nur sinnvoll, solange der Dialog steht — bricht der Nutzer ab, wird
        // dieser Schritt uebersprungen statt ins Leere zu zeigen.
        requires: areaModalOpen,
        // Fuellt der Nutzer das Formular in einem Rutsch aus und speichert,
        // merkt die Ratte das und wartet nicht auf ein [Weiter].
        optional: true,
        check: newAreaHasRunoff,
    },
    {
        id: 'ex-area-anschluss',
        mood: 'asking',
        info: 'flaechenanschluss',
        highlight: 'area-auslass',
        task: 'Haenge die Flaeche an die Haltung R_019.',
        message:
            'Und zuletzt: wohin laeuft das Wasser? Du kannst eine Flaeche an einen Schacht haengen '
            + 'oder an eine ganze Haltung — hier nimm die Haltung R_019. Dann speichern.',
        hint: 'Auslass -> "Haltung" anklicken -> R_019 aus der Liste -> Speichern.',
        // Bewusst OHNE `requires`: hier zaehlt der Endzustand, nicht der offene
        // Dialog. Waere der Dialog Bedingung, wuerde der Schritt beim Speichern
        // mit falschem Anschluss stillschweigend uebersprungen — der Nutzer
        // bekaeme seinen Fehler nie zu sehen.
        check: newAreaIsWiredUp,
    },
    /*
     * Die beiden folgenden Schritte liefen frueher ueber die Karte: die Ratte
     * flog zur naechsten unfertigen Flaeche und der Nutzer klickte sie an.
     * Sie laufen jetzt durch die Tabelle in "Daten bearbeiten" — dort stehen
     * alle Flaechen untereinander, mit Sammelbearbeitung und dem
     * DGM-Vorschlag. Deshalb auch kein `focus` mehr: die Kamerafahrt liefe
     * hinter dem geoeffneten Fenster ab, und der neonfarbene Ring bliebe nach
     * dem Schliessen an einer Flaeche stehen, um die es laengst nicht mehr geht.
     */
    {
        id: 'ex-runoff-coeff',
        mood: 'asking',
        info: 'befestigungsgrad',
        task: 'Gib jeder Flaeche einen Versiegelungsgrad.',
        message:
            'Die uebrigen Flaechen im Netz haben noch keinen Wert. Das machst du nicht einzeln '
            + 'auf der Karte, sondern in der Tabelle: "Daten bearbeiten" oeffnen, Reiter '
            + '"Flaechen", Spalte "Versiegelungsgrad". Eine Zeile je Flaeche, eine Zahl je Zeile.\n\n'
            + 'Faustwerte: Dach oder Asphalt 0.9 — Pflaster mit Fugen 0.6 — Schotter 0.4 — '
            + 'Wiese 0.1. Beispiel: ein Grundstueck, halb Dach und halb Rasen, liegt bei rund 0.5.',
        hint: 'Daten bearbeiten -> Reiter "Flaechen" -> Spalte "Versiegelungsgrad (0-1)". '
            + 'Mehrere Zeilen anhaken und "Bearbeiten" setzt den Wert fuer alle auf einmal.',
        // Wandert mit: solange das Fenster zu ist, leuchtet der Knopf, der es
        // oeffnet; danach der Reiter bzw. die Spalte selbst (siehe
        // resolveStepHighlight — der Anker darf vom Zustand abhaengen).
        highlight: (store) => {
            if (!store?.ui?.showPreprocessingModal) return 'daten-bearbeiten';
            return store?.ui?.preprocessingTab === 'areas'
                ? 'flaechen-versiegelung'
                : 'preprocessing-tabs';
        },
        check: allAreasHaveRunoffCoeff,
    },
    {
        id: 'ex-slope',
        mood: 'asking',
        info: 'neigungsklasse',
        task: 'Ergaenze die fehlenden Neigungsklassen.',
        message:
            'Fehlt noch die Neigung. Sie entscheidet, wie schnell das Wasser unten ankommt: auf '
            + 'einer ebenen Wiese sickert es in Ruhe weg, am Hang steht es sofort im Kanal.\n\n'
            + 'Statt eines Winkels gibt ISYBAU fuenf Stufen vor: 1 ist fast eben (bis 1 %), '
            + '2 leicht geneigt (bis 4 %), 3 eine merkliche Boeschung (bis 10 %), 4 steil '
            + '(bis 14 %), 5 sehr steil. Dieselbe Tabelle wie eben, Spalte "Neigungsklasse". '
            + 'Beispiel: unsere Wiese in ebener Ortslage — Klasse 1 oder 2.',
        hint: 'Daten bearbeiten -> Reiter "Flaechen" -> Spalte "Neigungsklasse". Ist ein '
            + 'Gelaendemodell geladen, rechnet der Knopf mit dem Hirn daneben die Stufe aus.',
        highlight: (store) => {
            if (!store?.ui?.showPreprocessingModal) return 'daten-bearbeiten';
            return store?.ui?.preprocessingTab === 'areas'
                ? 'flaechen-neigung'
                : 'preprocessing-tabs';
        },
        check: allAreasHaveSlope,
    },
    {
        id: 'ex-outfalls-oeffnen',
        mood: 'asking',
        info: 'auslaufbauwerk',
        highlight: 'daten-bearbeiten',
        message:
            'Zum Schluss die Auslaesse. AL1_RBB und AL2_RRB stehen noch als normale Schaechte im Netz — '
            + 'so weiss der Rechner nicht, wo das Wasser das System ueberhaupt verlaesst. '
            + 'Zwei Elemente auf einmal aendert man am besten in der Datenbearbeitung. Mach sie auf.',
        hint: '"Daten bearbeiten" in der Kommandoleiste.',
        optional: true,
        check: (store) => store?.ui?.showPreprocessingModal === true,
    },
    {
        id: 'ex-outfalls-suchen',
        mood: 'asking',
        highlight: 'preprocessing-suche',
        message:
            'Im Suchfeld ueber der ID-Spalte "AL" eintippen — dann bleiben nur unsere beiden uebrig. '
            + 'Beide anhaken, links in der Zeile.',
        hint: 'Die Suche filtert waehrend des Tippens. Haekchen ganz links in jeder Zeile.',
        requires: (store) => store?.ui?.showPreprocessingModal === true,
    },
    {
        id: 'ex-outfalls-typ',
        mood: 'asking',
        info: 'auslaufbauwerk',
        highlight: ['preprocessing-typ', 'preprocessing-tabs'],
        message:
            'Jetzt oben bei "Typ aendern" von Schacht auf Bauwerk stellen. Damit wandern die beiden '
            + 'in den Reiter "Bauwerke" — dort waehlst du fuer beide "Auslaufbauwerk".',
        hint: 'Typ aendern -> Bauwerk. Danach Reiter wechseln, erneut beide anhaken, Typ -> Auslaufbauwerk.',
        requires: (store) => store?.ui?.showPreprocessingModal === true,
    },
    {
        id: 'ex-outfalls-uebernehmen',
        mood: 'asking',
        // Der Schritt ueberlebt das Schliessen des Fensters (siehe unten) —
        // der Knopf darin nicht. Also zeigt die Ratte dann auf den Weg zurueck.
        highlight: (store) => (store?.ui?.showPreprocessingModal
            ? 'preprocessing-uebernehmen'
            : 'daten-bearbeiten'),
        task: 'Mach AL1_RBB und AL2_RRB zu Auslaufbauwerken.',
        message:
            'Und nicht vergessen: "Uebernehmen" druecken. Bis dahin sind deine Aenderungen nur vorgemerkt '
            + 'und waeren beim Schliessen wieder weg.',
        hint: 'Der gruene Knopf unten rechts im Fenster.',
        // Bewusst OHNE `requires`: es zaehlt der Endzustand. Waere das offene
        // Fenster Bedingung, wuerde der Schritt beim Schliessen ohne
        // Uebernehmen stillschweigend uebersprungen.
        check: (store) => nodesAreOutfalls(store, TUTORIAL_OUTFALL_NODES),
    },
    {
        id: 'ex-rain-kostra',
        mood: 'asking',
        highlight: ['rain-config', 'kostra-oeffnen'],
        message:
            'Das Netz steht — jetzt fehlt nur noch der Regen. Wie stark es bei uns schuettet, steht nicht '
            + 'im Netz, sondern im KOSTRA-Atlas des Deutschen Wetterdienstes: Regenmengen fuer jeden '
            + 'Punkt in Deutschland, nach Dauer und Wiederkehrzeit. Mach das KOSTRA-Fenster auf.',
        hint: 'Regendaten -> KOSTRA.',
        optional: true,
        check: (store) => store?.ui?.showKostraModal === true,
    },
    {
        id: 'ex-rain-abrufen',
        mood: 'asking',
        highlight: 'kostra-abrufen',
        message:
            'Deine Netzmitte ist schon eingetragen — ich brauch nur noch das passende Koordinatensystem, '
            + 'dann hol ich die Werte fuer genau diesen Ort. Druck auf "Daten abrufen".',
        hint: 'Ohne Ergebnis gibt es unten noch nichts zu uebernehmen — erst abrufen.',
        requires: (store) => store?.ui?.showKostraModal === true,
        optional: true,
        // Ergebnis da ODER schon uebernommen: wer schnell klickt, wird nicht
        // hinterher noch nach einem [Weiter] gefragt. Gefragt wird nach
        // `rain.kostraData` — der Rohtabelle, die der Abruf ohnehin in den
        // Store legt. Ein eigenes Tutorial-Flag daneben (frueher
        // `ui.kostraResultReady`) waere eine zweite Buchfuehrung ueber
        // dieselbe Tatsache, und die lief auseinander: das Fenster haengt an
        // v-if, sein lokales `result` starb beim Schliessen, das Flag blieb.
        check: (store) => !!store?.rain?.kostraData || kostraRainApplied(store),
    },
    {
        id: 'ex-rain-uebernehmen',
        mood: 'asking',
        // Wie bei den Auslaessen: ohne offenes Fenster gibt es keinen
        // "Uebernehmen"-Knopf — dann zeigt die Ratte auf den Weg dorthin.
        highlight: (store) => (store?.ui?.showKostraModal ? 'kostra-uebernehmen' : 'kostra-oeffnen'),
        task: 'Uebernimm einen KOSTRA-Regen.',
        message:
            'Da sind sie. Such dir eine Zeile aus — fuer eine normale Bemessung nimmt man gern 5 Minuten '
            + 'Dauer bei einer Wiederkehrzeit von 1 Jahr. Dann "Uebernehmen", und der Wert landet in '
            + 'deiner Berechnung.',
        hint: 'Kurz und heftig oder lang und sanft: kurze Dauern belasten kleine Rohre, lange die grossen.',
        // Bewusst OHNE `requires`: es zaehlt, dass der Regen wirklich gesetzt
        // ist. Waere das offene Fenster Bedingung, wuerde der Schritt beim
        // Schliessen ohne Uebernehmen stillschweigend uebersprungen.
        check: kostraRainApplied,
    },
    {
        id: 'ex-rain-modellregen',
        mood: 'rain',
        info: 'bemessungsregen',
        // Ohne offenes Fenster gibt es keinen "Uebernehmen"-Knopf — dann zeigt
        // die Ratte auf den Weg dorthin (wie bei KOSTRA und den Auslaessen).
        highlight: (store) => (store?.ui?.showRainModal
            ? 'modellregen-uebernehmen'
            : ['rain-config', 'modellregen-oeffnen']),
        task: 'Mach aus den KOSTRA-Werten einen Modellregen: 3 Jahre, 15 Minuten.',
        message:
            'Der KOSTRA-Wert ist eine einzelne Zahl — so viel kommt im Schnitt runter. Ein echter '
            + 'Regen faengt aber klein an, wird heftig und klingt wieder aus. Genau diesen Verlauf '
            + 'braucht der Solver, sonst rechnet er mit Dauerberieselung.\n\n'
            + 'Mach "Modellregen" auf und nimm "Euler Typ II" — das ist jetzt waehlbar, weil die '
            + 'KOSTRA-Werte da sind. Dauer 15 Minuten, Wiederkehrzeit 3 Jahre. Dann uebernehmen.',
        hint: 'Regendaten -> Modellregen -> Euler Typ II -> Dauer 15 -> Wiederkehrzeit "3 Jahre" '
            + '-> Uebernehmen. Die Vorschau daneben zeigt den Verlauf, den du baust.',
        // Wie bei KOSTRA bewusst OHNE `requires`: es zaehlt, dass der Regen am
        // Ende steht — nicht, ob das Fenster gerade offen ist.
        check: modelRainApplied,
    },
    {
        id: 'ex-run',
        mood: 'asking',
        highlight: 'run-simulation',
        task: 'Starte die Berechnung.',
        message:
            'Das Netz steht, der Regen hat einen Verlauf. Jetzt lass rechnen — und dann schauen wir '
            + 'zusammen, was das Modell dazu sagt.',
        hint: 'Das dauert ein paar Sekunden. Der Rechner geht das Netz Zeitschritt fuer Zeitschritt durch.',
        check: simulationFinished,
    },
    {
        id: 'ex-handover-fehler',
        mood: 'sad',
        highlight: 'daten-bearbeiten',
        message: (store) => {
            const warn = toArray(store?.simulation?.preSolveWarnings).length;
            const fehler = store?.simulation?.error;
            const was = fehler
                ? `Es hakt hier: ${fehler}`
                : `Da sind ${warn} Sachen, die mir nicht gefallen.`;
            return 'Tja. ' + was + '\n\n'
                + 'Ich hab getan, was ich konnte — ab hier bist du dran. So ein Netz wird selten beim '
                + 'ersten Anlauf sauber, und das ist normal: Meldungen abarbeiten, nachbessern, neu '
                + 'rechnen. Genau das ist die Arbeit. Klick auf "-> Element oeffnen" neben einer '
                + 'Meldung, dann bring ich dich direkt hin.';
        },
        hint: 'Fehler blockieren den Lauf, Warnungen nicht — die sind Hinweise, die du pruefen solltest.',
        // Nur zeigen, wenn es tatsaechlich etwas zu meckern gibt.
        requires: (store) =>
            !!store?.simulation?.error || toArray(store?.simulation?.preSolveWarnings).length > 0,
    },
    {
        id: 'ex-done',
        mood: 'happy',
        message:
            'Durchgerechnet, ohne Klagen. Schau dir die Ergebnisse an — und wenn du ein eigenes Netz '
            + 'hast, kennst du den Weg jetzt. Ich bin in der Ecke, falls du mich brauchst.',
        // Gegenstueck zum Fehler-Schritt: einer von beiden greift immer.
        requires: (store) =>
            !store?.simulation?.error && toArray(store?.simulation?.preSolveWarnings).length === 0,
    },
];

/* Hier standen firstAreaMissingSlope() und firstAreaMissingRunoffCoeff() —
   sie suchten die naechste unfertige Flaeche fuer die Kamerafahrt der beiden
   Flaechen-Schritte. Die laufen jetzt durch die Tabelle statt ueber die Karte
   (siehe dort), damit hatte die Suche keinen Aufrufer mehr. Ob eine Flaeche
   vollstaendig ist, prueft weiterhin allAreasHaveSlope/-RunoffCoeff oben. */

/**
 * Fokus-Ziel eines Schrittes aufloesen.
 *
 * `focus` darf fest oder dynamisch sein — dynamisch ist wichtig, weil sich
 * das Ziel waehrend der Uebung veraendert ("die NAECHSTE Flaeche, der noch
 * etwas fehlt"). Liefert null, wenn es gerade nichts zu zeigen gibt.
 *
 * @returns {{type:'node'|'edge'|'area', id:string}|null}
 */
export function resolveStepFocus(step, store) {
    const f = step?.focus;
    if (!f) return null;
    try {
        const ref = typeof f === 'function' ? f(store) : f;
        if (!ref || !ref.type || ref.id == null) return null;
        return { type: ref.type, id: String(ref.id) };
    } catch {
        return null; // Ein kaputtes Fokus-Ziel darf die Uebung nie blockieren.
    }
}

/**
 * Umriss eines Schritts als Punktliste — oder null. Wie resolveStepFocus
 * bewusst fehlertolerant: ein kaputter Umriss darf die Uebung nie blockieren.
 *
 * @returns {Array<{x:number,y:number}>|null}
 */
export function resolveStepDraw(step, store) {
    const d = step?.draw;
    if (!d) return null;
    try {
        const pts = typeof d === 'function' ? d(store) : d;
        if (!Array.isArray(pts) || pts.length < 2) return null;
        const gueltig = pts.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
        return gueltig.length >= 2 ? gueltig : null;
    } catch {
        return null;
    }
}

/**
 * Anker eines Schrittes aufloesen, die der Viewer hervorheben soll.
 *
 * Wie `message`, `focus` und `draw` darf auch `highlight` eine Funktion des
 * Stores sein. Das ist kein Luxus, sondern noetig: Schritte, die den
 * Endzustand pruefen (und deshalb bewusst OHNE `requires` gebaut sind),
 * ueberleben das Schliessen ihres Fensters — der Anker darin aber nicht.
 * Fest verdrahtet zeigte die Ratte dann auf einen Knopf, den es nicht gab,
 * und `useHighlight` gab nach fuenf Versuchen still auf.
 *
 * Immer als Liste zurueck, damit der Aufrufer nur einen Fall kennen muss.
 *
 * @returns {string[]|null}
 */
export function resolveStepHighlight(step, store) {
    const h = step?.highlight;
    if (!h) return null;
    try {
        const anker = typeof h === 'function' ? h(store) : h;
        if (!anker) return null;
        const liste = (Array.isArray(anker) ? anker : [anker]).filter(a => typeof a === 'string' && a);
        return liste.length ? liste : null;
    } catch {
        return null; // Ein kaputtes Ziel darf die Uebung nie blockieren.
    }
}

/**
 * Ist ein Schritt erledigt? Schritte ohne `check` sind reine Erzaehlschritte
 * und gelten nie als automatisch erledigt (der Nutzer klickt [Weiter]).
 */
export function isStepComplete(step, store, snapshot) {
    if (typeof step?.check !== 'function') return false;
    try {
        return !!step.check(store, snapshot);
    } catch {
        return false; // Ein kaputter Check darf die Uebung nie blockieren.
    }
}
