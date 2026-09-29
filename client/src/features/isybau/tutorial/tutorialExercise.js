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
import { checkConduitProfile } from '../utils/preSolveValidation.js';

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

/** Ein KOSTRA-Regen ist uebernommen: der gesetzte Regen ist ein KOSTRA-Blockregen
 *  (RainModelService.kostraBlockRain) — nicht bloss eine Zahl im Store. */
export const kostraRainApplied = (store) =>
    store?.rain?.activeModelRain?.metadata?.source === 'kostra'
    && (store.rain.activeModelRain.series?.length ?? 0) > 0;

/**
 * Ein Modellregen ist gesetzt — also ein VERLAUF ueber die Zeit, nicht nur
 * eine Intensitaet.
 *
 * Geprueft wird die Reihe selbst, nicht ihre Kenndaten: die Aufgabe nennt
 * 3 Jahre und 60 Minuten als das, was man hier ueblicherweise nimmt, aber wer
 * bewusst eine andere Wiederkehrzeit waehlt, hat die Sache trotzdem
 * verstanden. Ein leerer Verlauf zaehlt nicht — den erzeugt das Fenster, wenn
 * die KOSTRA-Spalte fehlt.
 */
export const modelRainApplied = (store) => {
    const regen = store?.rain?.activeModelRain;
    // Nur Euler II: seit „Übernehmen" im KOSTRA-Fenster selbst einen Blockregen
    // setzt, hakte eine reine Längenprüfung diesen Schritt sofort mit ab.
    return !!regen && regen.type === 'euler2' && Array.isArray(regen.series) && regen.series.length > 0;
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
/** Der letzte Lauf wurde von der Vorab-Prüfung wegen eines Profils mit
 *  Fläche 0 gestoppt (ERR_119, utils/preSolveValidation.js). */
export const profilFehlerGemeldet = (store) =>
    store?.simulation?.status === 'error' && store?.simulation?.fehlerCode === 'ERR_119';

/** Keine Haltung mehr mit Höhe/Breite 0 — dieselbe Regel wie die Vorab-Prüfung. */
export const alleProfileGueltig = (store) => {
    const edges = toArray(store?.edges);
    return edges.length > 0 && edges.every(e => !checkConduitProfile(e));
};

/** Neu gerechnet, und diesmal NICHT am Profil gescheitert: Erfolg oder ein
 *  anderer Fehler (den übernimmt dann die Fehlerübergabe). Der alte Stand
 *  „error + ERR_119“ steht noch im Store, bis neu gerechnet wird. */
export const nachProfilGerechnet = (store) =>
    store?.simulation?.status === 'success'
    || (store?.simulation?.status === 'error' && store?.simulation?.fehlerCode !== 'ERR_119');

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
            + 'Die ergänzen wir jetzt zusammen, Schritt für Schritt.',
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
            + 'und jede Fläche ein Stück Land, von dem Regen in den Kanal läuft. '
            + 'Das Raster im Hintergrund ist dein Maßstab — ein Kästchen ist ein Meter.',
    },
    {
        id: 'ex-tour-controls',
        mood: 'asking',
        highlight: 'viewer-controls',
        message:
            'Unten links liegt die Ansichts-Leiste. Dort schaltest du zwischen Ziehen und Auswählen um, '
            + 'stellst das Raster ein und legst die EZG-Karte mit Luftbild und Höhenlinien unter das Netz. '
            + 'Verirrt? Der Rundpfeil holt die Ansicht zurück aufs ganze Netz.',
    },
    {
        id: 'ex-tour-toolbox',
        mood: 'happy',
        highlight: 'editor-toolbox',
        message:
            'Oben in der Mitte hängt das Werkzeug. Damit setzt du Schächte, ziehst Haltungen, '
            + 'zeichnest Flächen, teilst eine Leitung oder löschst, was zu viel ist. '
            + 'Nach dem Speichern legt sich ein Werkzeug von selbst weg.',
    },
    {
        id: 'ex-tour-sidebar',
        mood: 'asking',
        highlight: 'sidebar',
        message:
            'Und links ist die Kommandozentrale. Die gehen wir jetzt von oben nach unten durch — '
            + 'Knopf für Knopf, damit du später weißt, wo du greifen musst.',
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
            '„XML importieren“: So kommt ein fertiges Kanalnetz herein — eine ISYBAU-XML, wie sie dir '
            + 'ein Vermesser oder die Kommune gibt. Dein Übungsnetz ist genau so hereingekommen.',
    },
    {
        id: 'ex-tour-dgm',
        mood: 'asking',
        highlight: 'dgm-import',
        info: 'dgm-gelaende',
        message:
            '„Gelände (DGM) laden“: Das ist die Höhenkarte des Bodens. Damit weiß ich, wie das Land liegt — '
            + 'ich kann dir dann Deckelhöhen vorschlagen und die Neigung deiner Flächen ausrechnen. '
            + 'Ich hab uns schon eins besorgt, vom Geoportal Rheinland-Pfalz, genau über unserem Netz. Soll ich?',
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
            'Da ist die Rückfrage: wie fein soll das Höhenraster werden? Die Punkte liegen 5 m auseinander, '
            + 'aber nicht lückenlos — deshalb schlage ich 10 m vor, das füllt die Löcher sauber auf. '
            + 'Lass einfach alles so, wie es ist, und klick auf „Importieren“.',
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
            'Geschafft — das Gelände liegt jetzt unter dem Netz. Ein ehrlicher Hinweis: dieser Kartenausschnitt '
            + 'deckt rund 87 % unseres Netzes ab, im Norden fehlt ein Streifen. Wo keine Höhe da ist, kann ich '
            + 'auch nichts vorschlagen — das gehört zum Handwerk dazu.',
        requires: (store) => !!store?.terrain,
    },
    {
        id: 'ex-tour-projekte',
        mood: 'happy',
        highlight: 'projekte',
        message:
            '„Projekte“: Dein Speicherfach. Hier legst du den aktuellen Stand ab und holst ihn später zurück — '
            + 'praktisch, bevor du etwas Größeres ausprobierst.',
    },
    {
        id: 'ex-tour-neu-starten',
        mood: 'asking',
        highlight: 'neu-starten',
        info: 'standort-georeferenz',
        message:
            '„Neu starten“: Wenn du OHNE fertige Datei anfangen willst. Du wählst zuerst einen Ort auf der Welt, '
            + 'dann legen sich Luftbild und Höhenlinien passend darunter und du zeichnest dein Netz von Hand.',
    },
    {
        id: 'ex-tour-xml-export',
        mood: 'happy',
        highlight: 'xml-export',
        info: 'isybau-xml',
        message:
            '„XML exportieren“: der Rückweg. Dein bearbeitetes Netz wandert wieder als ISYBAU-XML hinaus — '
            + 'die kannst du weitergeben oder in einem anderen Programm öffnen. Was in so einer '
            + 'Datei steht und wer sich das ausgedacht hat, erklärt [Mehr dazu].',
    },
    {
        id: 'ex-tour-stats',
        mood: 'happy',
        highlight: 'netz-stats',
        message:
            'Diese Zeile ist dein Kassensturz: wie viele Knoten, Haltungen und Flächen gerade im Netz stecken. '
            + 'Knoten sind Schächte und Bauwerke zusammen. Baust du gleich etwas dazu, wächst hier die Zahl.',
    },
    {
        id: 'ex-tour-rain',
        mood: 'rain',
        highlight: 'rain-config',
        info: 'bemessungsregen',
        message:
            'Jetzt der Regen — ohne den passiert nämlich gar nichts. „Modellregen“ baut dir einen künstlichen '
            + 'Regen nach Lehrbuch, „KOSTRA“ holt echte Statistikwerte für deine Koordinaten vom Deutschen Wetterdienst.',
    },
    {
        id: 'ex-tour-daten',
        mood: 'asking',
        highlight: 'daten-bearbeiten',
        message:
            '„Daten bearbeiten“ öffnet die große Tabelle. Dort siehst du alle Schächte, Haltungen und Flächen '
            + 'untereinander und kannst viele auf einmal ändern — schneller als jeden einzeln auf der Karte anzuklicken.',
    },
    {
        id: 'ex-tour-validieren',
        mood: 'asking',
        highlight: 'abfluss-validieren',
        message:
            '„Abfluss validieren“ klingt nach Prüfung — drück ruhig mal, er hat eine eigene Meinung dazu. '
            + 'Die echte Prüfung läuft ohnehin von selbst: Vor jeder Berechnung schaue ich über dein Netz '
            + 'und halte an, wenn etwas nicht rechenbar ist.',
    },
    {
        id: 'ex-tour-dauer',
        mood: 'happy',
        highlight: ['sim-dauer', 'ueberstauverfahren'],
        message:
            'Die Simulationsdauer sagt, wie lange wir das Netz beobachten — länger, als es regnet, weil das '
            + 'Wasser danach noch unterwegs ist. Darunter das „Überstauverfahren“: wie gerechnet wird, wenn '
            + 'Rohre voll laufen. „Automatisch“ passt fast immer.',
    },
    {
        id: 'ex-tour-run',
        mood: 'asking',
        highlight: 'run-simulation',
        info: 'dynamic-wave',
        message:
            '„Berechnung starten“ — der große Knopf darunter. Damit rechnet SWMM direkt hier im Browser, '
            + 'Zeitschritt für Zeitschritt, wie sich das Wasser durch dein Netz schiebt. Dauert es zu lange, '
            + 'hält „Abbrechen“ die Rechnung an.',
    },
    {
        id: 'ex-tour-ansicht',
        mood: 'happy',
        highlight: 'ansicht-nav',
        message:
            'Ganz unten schaltest du die Ansicht um: der 2D-Editor zum Bauen, die 3D-Ansicht zum Anschauen. '
            + 'Sobald gerechnet ist, kommen hier zwei weitere Knöpfe für die Ergebnisse dazu.',
    },
    {
        id: 'ex-tour-theme',
        mood: 'surprised',
        highlight: 'theme-toggle',
        message:
            'Und der Knopf ganz unten links macht das Licht aus. Wir Ratten mögen es ja dunkel — '
            + 'aber probier ruhig, was deinen Augen besser passt. So, jetzt kennst du den Laden. Packen wir an!',
    },
    {
        id: 'ex-add-area',
        mood: 'asking',
        info: 'netzmodell',
        // Wandert mit dem Zeichnen: erst das m²-Werkzeug; beim Zeichnen nichts
        // (der Rahmen laege sonst ueber der Karte); ab drei Punkten der Knopf
        // "Flaeche abschliessen", den viele sonst uebersehen.
        highlight: (store) => {
            const punkte = store?.editor?.drawingPoints?.length ?? 0;
            if (punkte >= 3) return 'flaeche-abschliessen';
            if (store?.editor?.mode === 'addArea') return null;
            return 'werkzeug-flaeche';
        },
        task: 'Zeichne das fehlende Einzugsgebiet ein.',
        message:
            'Schau mal: Ein Stück Wiese fehlt noch — da fällt Regen hin, aber er kommt nirgends an. '
            + 'Ich hab dir den Umriss hingemalt, die Nummern zeigen die Reihenfolge. '
            + 'Nimm das m²-Werkzeug, klick die drei Punkte nach und dann „✓ Fläche abschließen“.',
        hint: 'Werkzeugleiste oben: das Symbol mit m². Der grüne Umriss zeigt, wo — genau treffen musst du nicht.',
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
        // Beide Felder auf einmal: der Wert steht bis zum Speichern nur im
        // Formular, dieser Schritt kann also nicht vorher weiterschalten — mit
        // nur dem ψ-Feld musste man [Weiter] drücken, um den Anschluss zu
        // erfahren (Befund T11, 2026-09-27).
        highlight: ['area-befestigung', 'area-auslass'],
        // Der Text nennt das Feld genau so, wie es im Formular steht. Vorher
        // sagte die Ratte "Befestigungsgrad" — ein Wort, das nirgends auf dem
        // Bildschirm stand: die Testleserin fand das Feld deshalb nicht.
        message:
            'Gut gezeichnet! Jetzt der „Abflussbeiwert ψ“ unter der Größe: welcher Anteil des '
            + 'Regens im Kanal ankommt. Unsere Wiese: trag 0,2 ein — 20 % laufen ab.\n\n'
            + 'Darunter „Auslass“: wohin das Wasser läuft. Klick „Haltung“ an, wähl R_019 '
            + 'und dann „Speichern“.',
        hint: '„Abflussbeiwert ψ (0.0 - 1.0)“: 0,2 → Auslass „Haltung“ → R_019 → „Speichern“.',
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
        task: 'Hänge die Fläche an die Haltung R_019.',
        message:
            'Und zuletzt: Wohin läuft das Wasser? Eine Fläche hängt an einem Knoten oder an einer '
            + 'ganzen Haltung — hier nimm die Haltung R_019. Dann „Speichern“; das Werkzeug legt sich '
            + 'danach von selbst weg.',
        hint: 'Auslass → „Haltung“ anklicken → R_019 aus der Liste → „Speichern“.',
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
        task: 'Gib jeder Fläche einen Abflussbeiwert.',
        message:
            'Die übrigen Flächen haben noch keinen Wert. Das geht schneller in der Tabelle: '
            + '„Daten bearbeiten“, Reiter „Flächen“, Spalte „Abflussbeiwert ψ“ — dann „Übernehmen“.\n\n'
            + 'Faustwerte: Dach/Asphalt 0,9 · Pflaster 0,6 · Schotter 0,4 · Wiese 0,1.',
        hint: 'Mehrere Zeilen anhaken und „✎ Bearbeiten“ setzt den Wert für alle auf einmal. '
            + 'Halb Dach, halb Rasen liegt bei rund 0,5.',
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
        task: 'Ergänze die fehlenden Neigungsklassen.',
        message:
            'Fehlt noch die Neigung: Am Hang ist das Wasser schneller im Kanal als auf ebener Wiese.\n\n'
            + 'ISYBAU kennt fünf Stufen: 1 fast eben (bis 1 %), 2 leicht (bis 4 %), 3 merklich '
            + '(bis 10 %), 4 steil (bis 14 %), 5 sehr steil. Gleiche Tabelle, Spalte „Neigungsklasse“ '
            + '— unsere Wiese: 1 oder 2. Dann „Übernehmen“.',
        hint: 'Ist ein Geländemodell geladen, rechnet der Knopf mit dem Hirn in der Zeile die Stufe aus.',
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
            'Zum Schluss die Auslässe. AL1_RBB und AL2_RRB stehen noch als normale Schächte im Netz — '
            + 'so weiß der Rechner nicht, wo das Wasser das System verlässt. Zwei Elemente auf einmal '
            + 'änderst du am besten in „Daten bearbeiten“. Mach es auf.',
        hint: '„Daten bearbeiten“ in der linken Leiste.',
        optional: true,
        check: (store) => store?.ui?.showPreprocessingModal === true,
    },
    {
        id: 'ex-outfalls-suchen',
        mood: 'asking',
        // Die Datenmaske merkt sich den Reiter — nach den Flächen-Aufgaben
        // steht sie auf „Flächen“, das Suchfeld der Schächte gibt es dann nicht.
        highlight: (store) => (store?.ui?.preprocessingTab === 'nodes' ? 'preprocessing-suche' : 'preprocessing-tabs'),
        message:
            'Die beiden stehen im Reiter „Schächte“. Tipp dort ins Suchfeld über der ID-Spalte „AL“, '
            + 'dann bleiben genau zwei Zeilen übrig.\n\n'
            + 'Hak beide an: das Kästchen ganz links in der Zeile.',
        hint: 'Die Suche filtert während des Tippens. Häkchen ganz links, in beiden Zeilen.',
        requires: (store) => store?.ui?.showPreprocessingModal === true,
        // Weiter, sobald zwei Zeilen angehakt sind — der Nutzer muss nicht
        // zusaetzlich [Weiter] druecken, wenn er die Sache schon getan hat.
        optional: true,
        check: (store) => Number(store?.ui?.preprocessingSelection) >= 2,
    },
    {
        id: 'ex-outfalls-typ',
        mood: 'asking',
        info: 'auslaufbauwerk',
        /*
         * Der Anker wandert mit dem, was gerade auf dem Bildschirm ist:
         * ohne Auswahl gibt es die Leiste nicht, ohne offene Massenbearbeitung
         * keinen "Typ aendern"-Kasten. Frueher zeigte dieser Schritt fest auf
         * "Typ aendern" — ein Kasten, den der Nutzer an dieser Stelle noch gar
         * nicht sehen konnte.
         */
        highlight: (store) => {
            const ui = store?.ui ?? {};
            if (ui.preprocessingBulkOpen) return ['preprocessing-typ', 'sammel-anwenden'];
            if (Number(ui.preprocessingSelection) > 0) return 'sammel-bearbeiten';
            // Nach "Anwenden" ist die Auswahl weg und die Tabelle vorgemerkt —
            // dann ist "Uebernehmen" das Naechste. Ohne diesen Fall zeigte die
            // Ratte an dieser Stelle zurueck aufs Suchfeld, das laengst erledigt war.
            if (ui.preprocessingDirty) return 'preprocessing-uebernehmen';
            return 'preprocessing-suche';
        },
        message:
            'Über der Tabelle steht jetzt „2 ausgewählt“. Klick daneben auf „✎ Bearbeiten“ — das '
            + 'Fenster für beide auf einmal.\n\n'
            + 'Dort „Typ ändern“ auf „Auslaufbauwerk“ stellen und „Anwenden“ drücken. Das geht in '
            + 'EINEM Zug: Du musst nicht erst auf „Bauwerk“ und dann in den anderen Reiter.',
        hint: '2 ausgewählt → ✎ Bearbeiten → Typ ändern → Auslaufbauwerk → Anwenden. '
            + 'Danach stehen die beiden nicht mehr unter „Schächte“, sondern unter „Bauwerke“ — '
            + 'genau so soll es sein.',
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
            'Und nicht vergessen: „Übernehmen“ drücken. Bis dahin sind deine Änderungen nur vorgemerkt — '
            + 'wer vorher schließt, wird gefragt, ob er sie verwerfen will.',
        hint: 'Der Knopf „Übernehmen“ unten rechts im Fenster.',
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
            'Das Netz steht — jetzt fehlt nur noch der Regen. Wie stark es bei uns schüttet, steht nicht '
            + 'im Netz, sondern im KOSTRA-Atlas des Deutschen Wetterdienstes: Regenmengen für jeden '
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
            + 'dann hol ich die Werte für genau diesen Ort. Druck auf „Daten abrufen“.',
        hint: 'Ohne Ergebnis gibt es unten noch nichts zu übernehmen — erst abrufen.',
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
        task: 'Übernimm einen KOSTRA-Regen.',
        message:
            'Da sind sie. Vorausgewählt sind 60 Minuten bei 1 Jahr Wiederkehrzeit — kürzer darf ein '
            + 'Nachweisregen nach DWA-A 118 nicht sein. „Übernehmen“ macht daraus einen Blockregen: '
            + 'diese Stärke, gleichmäßig über die ganze Dauer.',
        hint: 'Eine andere Zeile? „Detaillierte Datentabelle anzeigen“ klappt die Tabelle auf. '
            + 'Kurze Dauern belasten kleine Rohre, lange die großen.',
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
        task: 'Mach aus den KOSTRA-Werten einen Modellregen: 3 Jahre, 60 Minuten.',
        message:
            'Dein Blockregen regnet von Anfang bis Ende gleich stark. Ein echter Regen fängt klein an, '
            + 'wird heftig und klingt aus — und die Spitze ist es, die ein Rohr überlastet.\n\n'
            + 'Mach „Modellregen“ auf und nimm „Euler Typ II“ (geht jetzt, weil die KOSTRA-Werte da sind): '
            + 'Dauer 60 Minuten (steht schon da), Wiederkehrzeit 3 Jahre, dann „Übernehmen“.',
        hint: 'Regendaten → Modellregen → Euler Typ II → Dauer 60 → Wiederkehrzeit „3 Jahre“ '
            + '→ Übernehmen. Die kurze Spitze steckt im 60-min-Regen mit drin.',
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
        hint: 'Das dauert ein paar Sekunden. Der Rechner geht das Netz Zeitschritt für Zeitschritt durch.',
        check: simulationFinished,
    },
    {
        id: 'ex-profil-oeffnen',
        mood: 'sad',
        highlight: 'fehler-element-oeffnen',
        task: 'Öffne die Haltung mit dem kaputten Profil.',
        message:
            'Halt, die Prüfung vor dem Rechnen hat abgebrochen: Eine Haltung hat die Höhe 0 — ein Rohr '
            + 'ohne Querschnitt. So kommt kein Tropfen durch, und SWMM würde gar nicht erst anfangen.\n\n'
            + 'Unter der Meldung steht „→ Element öffnen“. Das bringt dich direkt zur Zeile.',
        hint: 'Die Meldung steht links unter „Berechnung starten“.',
        // Nur, wenn der Lauf wirklich am Profil gescheitert ist — andere
        // Fehler übernimmt die Fehlerübergabe weiter unten.
        requires: profilFehlerGemeldet,
        check: (store) => !!store?.ui?.showPreprocessingModal,
    },
    {
        id: 'ex-profil-korrigieren',
        mood: 'asking',
        task: 'Gib den Haltungen mit Höhe 0 eine echte Höhe.',
        message:
            'Hier ist die Zeile. Rot umrandet ist das Feld in der Spalte „H (mm)“ — und es gibt drei '
            + 'solche Haltungen im Netz. Trag bei jeder eine Höhe ein (beim Kreisprofil ist das der '
            + 'Durchmesser, z. B. 300 für DN 300) und dann „Übernehmen“.',
        hint: 'Spalte „H (mm)“ im Reiter „Haltungen“: rote Felder sind die mit 0. '
            + 'Die Werte der Nachbarhaltungen sind ein guter Anhalt.',
        // Offen: Spalte UND „Übernehmen“ (getippte Zellen setzen
        // preprocessingDirty nicht — das meldet nur Sammeländerungen).
        // Zu: der Knopf, der die Tabelle öffnet.
        highlight: (store) => {
            if (!store?.ui?.showPreprocessingModal) return 'daten-bearbeiten';
            if (store?.ui?.preprocessingTab !== 'edges') return 'preprocessing-tabs';
            return ['haltung-profilhoehe', 'preprocessing-uebernehmen'];
        },
        requires: profilFehlerGemeldet,
        check: alleProfileGueltig,
    },
    {
        id: 'ex-run-2',
        mood: 'asking',
        highlight: 'run-simulation',
        task: 'Rechne noch einmal.',
        message: 'Sieht besser aus. Noch mal „Berechnung starten“ — mal sehen, ob der Rechner jetzt zufrieden ist.',
        hint: 'Meldet die Prüfung noch etwas, führt „→ Element öffnen“ wieder direkt hin.',
        // Gehört zum Profil-Umweg: nur wer ihn gegangen ist, soll neu rechnen.
        requires: profilFehlerGemeldet,
        check: nachProfilGerechnet,
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
                : `Da sind ${warn} Hinweise, die mir nicht gefallen.`;
            return 'Tja. ' + was + '\n\n'
                + 'Ab hier bist du dran. Ein Netz wird selten beim ersten Anlauf sauber: Meldung lesen, '
                + 'nachbessern, neu rechnen — genau das ist die Arbeit. „→ Element öffnen“ neben einer '
                + 'Meldung bringt dich direkt hin.';
        },
        hint: 'Fehler blockieren den Lauf, Warnungen nicht — die sind Hinweise, die du prüfen solltest.',
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
