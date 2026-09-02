/**
 * Bearbeitungs-Katalog (Stufe 9.0) — was sich an einem Bauteil tun lässt.
 *
 * Das Haus führt dieses Muster bereits dreimal: `usePanels` (Fenster),
 * `useCommands` (Befehle), `AENDERUNGS_ARTEN` (Änderungsarten), jeweils mit der
 * Regel „hier ergänzen — sonst nirgends". Dies ist der vierte Fall.
 *
 * Die registrierte Einheit ist weder ein Werkzeug noch ein Elementtyp, sondern
 * eine BEARBEITUNG, die über sich selbst Auskunft gibt. Drei Verbraucher lesen
 * dieselbe Liste und filtern nur anders:
 *   1. Kontextmenü am Bauteil  → `passende(einordnung)`
 *   2. Werkzeugleiste          → nach `gruppe`
 *   3. Befehls-Palette (Strg+K)→ alles
 * Dadurch kann es keinen Weg geben, der in einem Einstieg existiert und im
 * anderen fehlt.
 *
 * WORAN EINE BEARBEITUNG HÄNGT: an der BAUFORM (siehe bauform/Bauformen.js),
 * nicht am IFC-Typ. „Sohlhöhe setzen" gilt für `achse+profil` und bedient damit
 * Rohr, Kanal und Bordstein — und den Typ, den noch niemand gesehen hat. Ein
 * `bauform: '*'` gilt für alles (Merkmale brauchen keine Geometrie).
 *
 * WAS EINE BEARBEITUNG NICHT TUT: sie ändert nichts. `anwenden` GIBT einen
 * Journaleintrag ZURÜCK. Damit erbt jede neue Bearbeitung Rücknahme und
 * Nachvollziehbarkeit aus Stufe 7, ohne eine Zeile dafür zu schreiben — und
 * bleibt ohne Vue, ohne WebGL prüfbar.
 *
 * `pset` fehlt hier noch mit Absicht: sein Wert ist ein Objekt, und
 * `useAenderungen.eintragen` vergleicht heute mit `===`. Das kommt zusammen mit
 * der Vergleichsfunktion in Stufe 9.1 — nicht davor, sonst entstünde ein
 * Journal, dessen „zurück" nicht zurückführt.
 */

import { guetegenuegt } from './bauform/Bauformen.js';
import { REZEPTE, erzeugtEintrag } from './Bauteilrezepte.js';
import { MASSNAHMEN } from './Sanierung.js';
import { nnAusWelt, weltAusNn } from './Hoehenbezug.js';
import { feldAusProfil } from './bauform/Typprofile.js';
import { DIN277_CLASSES } from './Din277Classifier.js';
import { KG_DEFAULT_RULES } from './Din276Defaults.js';

/**
 * WOMIT eine Bearbeitung gefüttert wird (Stufe 12.2, im Kleinen).
 *
 * Bisher gab es genau zwei Fälle, und beide waren im Programm verdrahtet:
 * Werte aus einem Formular, oder ein gezeichneter Zug bei den
 * Erzeugen-Werkzeugen. „Trasse ändern" ist der erste Fall, der BEIDES braucht
 * — ein vorhandenes Bauteil UND einen gezeichneten Zug —, und daran wird
 * sichtbar, dass die Eingabeart eine Eigenschaft der Bearbeitung ist und kein
 * Sonderfall des Zeichnens.
 *
 * Absichtlich klein gehalten: drei Arten, kein Register mit Filtern und
 * Kardinalitäten. Die grosse Fassung aus Stufe 12.2 wird gebraucht, sobald
 * eine Bearbeitung ein ZWEITES Bauteil als Bezug will (Rohr an Schacht) —
 * dann, und nicht auf Vorrat.
 */
export const EINGABEN = Object.freeze({
    wert:   'nur Formularwerte',
    zug:    'ein gezeichneter Linienzug im Lageplan',
    umriss: 'ein geschlossener Umriss im Lageplan',
});

/** Welche Eingabe eine Bearbeitung braucht. Vorgabe: nur Werte. */
export function eingabeArt(bearbeitung) {
    const art = bearbeitung?.eingabe;
    return art && art in EINGABEN ? art : 'wert';
}

/** Die Gruppen ordnen die Einstiege — nicht die Bauteile. */
export const GRUPPEN = Object.freeze({
    merkmale:   { titel: 'Merkmale',   icon: 'info',          einstieg: 'auswahl' },
    parametrik: { titel: 'Maße',       icon: 'measure',       einstieg: 'auswahl' },
    lage:       { titel: 'Lage',       icon: 'pointer',       einstieg: 'auswahl' },
    erzeugen:   { titel: 'Erzeugen',   icon: 'add',           einstieg: 'werkzeug' },
    gelaende:   { titel: 'Gelände',    icon: 'terrain',       einstieg: 'auswahl' },
});

/**
 * Der Punkt auf der Achse bei dieser Station, oder null.
 *
 * Von „Haltung teilen" UND „Schacht einfügen" gebraucht. Zweimal geschrieben
 * liefe er auseinander — und die beiden müssen bis auf den Millimeter
 * dasselbe rechnen, sonst passen die Stücke nach dem Einfügen nicht mehr
 * zusammen.
 *
 * Am Ende zu teilen ist kein Teilen: es ergäbe ein Bauteil der Länge null.
 */
function _teilpunkt(achse, station) {
    const laenge = Number(achse?.laenge) || 0;
    const s = Number(station);
    if (!achse?.anfang || !achse?.ende) return null;
    if (!Number.isFinite(s) || s <= 0.01 || s >= laenge - 0.01) return null;
    const anteil = s / laenge;
    return {
        x: achse.anfang.x + (achse.ende.x - achse.anfang.x) * anteil,
        y: achse.anfang.y + (achse.ende.y - achse.anfang.y) * anteil,
        z: achse.anfang.z + (achse.ende.z - achse.anfang.z) * anteil,
    };
}

/** Ein Raumpunkt als Zahlenpaar-Tripel, wie die Rezepte es lesen. */
function _alsTripel(p) {
    return [p.x, p.y, p.z];
}

/**
 * Einen Namen aus einem Muster bilden.
 *
 * Platzhalter, absichtlich nur zwei:
 *   `{n}`    die laufende Nummer
 *   `{n:3}`  dieselbe, mit Nullen auf drei Stellen aufgefüllt
 *   `{alt}`  der bisherige Name — für „H-{n} ({alt})"
 *
 * Mehr wäre eine kleine Sprache, und die will gepflegt und dokumentiert
 * werden. Diese drei decken ab, was im Kanalbau tatsächlich vorkommt.
 */
export function nameAusMuster(muster, { nummer = 1, alt = '' } = {}) {
    const m = String(muster ?? '');
    if (!m) return '';
    return m
        .replace(/\{n:(\d)\}/g, (_, breite) => String(nummer).padStart(Number(breite), '0'))
        .replace(/\{n\}/g, String(nummer))
        .replace(/\{alt\}/g, String(alt ?? ''));
}

/** Millimetergenau — Baumaße brauchen nicht mehr, und mehr liest sich schlecht. */
function _rundeM(v) {
    const z = Number(v);
    return Number.isFinite(z) ? Math.round(z * 1000) / 1000 : 0;
}

/** Die Kostengruppen, die die Regelvorgabe kennt — als Auswahl statt Freitext. */
function _kgOptionen() {
    const codes = new Set();
    for (const regel of KG_DEFAULT_RULES) {
        if (regel?.kgCode) codes.add(String(regel.kgCode));
    }
    return [...codes].sort().map(code => ({ wert: code, titel: code }));
}

/**
 * Der Katalog. Neue Bearbeitungen hier ergänzen — sonst nirgends.
 *
 * Eintrag:
 *   id            eindeutig, wird Befehls-Id
 *   titel, icon   Darstellung
 *   gruppe        Schlüssel aus GRUPPEN
 *   bauform       '*' oder ein Schlüssel aus BAUFORMEN
 *   mindestGuete  ab welcher Belastbarkeit angeboten wird
 *   felder        [{ name, ausTypprofil?, rueckfall|... }]
 *   art           Änderungsart fürs Journal
 *   vorbelegung   (el) => werte
 *   anwenden      (el, werte) => Journaleintrag (MUTIERT NICHT)
 */
/**
 * Punkte aus dem Lageplan in Journalform bringen.
 *
 * Der Plan liefert `{x, z}` — er kennt keine Höhe, weil man von oben zeichnet.
 * Das Journal führt `[x, y, z]` mit Y als Höhe (three-Konvention, festgelegt im
 * Kopf von Bauteilrezepte.js). Die Höhe aus dem Formular wird HIER eingesetzt,
 * nicht erst im Rezept: dann steht im Journal der wirkliche Raumpunkt, und ein
 * späterer Zug an einem einzelnen Punkt (Bruchkante mit eigenen Höhen, Stufe
 * 10) braucht keine zweite Regel, wo die Höhe herkommt.
 */
function alsRaumpunkte(punkte, hoehe = 0) {
    const h = Number(hoehe) || 0;
    return (punkte ?? []).map((p) => {
        if (Array.isArray(p)) return [Number(p[0]) || 0, Number.isFinite(p[1]) ? Number(p[1]) : h, Number(p[2]) || 0];
        return [Number(p?.x) || 0, Number.isFinite(p?.y) ? Number(p.y) : h, Number(p?.z) || 0];
    });
}

/**
 * Aus einem Rezept wird eine Zeichen-Bearbeitung.
 *
 * ABGELEITET STATT ABGESCHRIEBEN: Jedes Rezept in `REZEPTE` ist genau eine
 * Zeichenoperation, und zwei Listen, die dasselbe aufzählen, laufen
 * auseinander — dieselbe Fehlerklasse wie die zwei Dokumentregister aus
 * Stufe 3. Wer ein Rezept ergänzt, bekommt seine Bearbeitung mit.
 *
 * ERZEUGEN HAT KEIN SUBJEKT. Deshalb ist `el` hier nicht das angeklickte
 * Bauteil, sondern das GEZEICHNETE: `{ punkte }`. Das ist der Grund, warum
 * diese Einträge in `GRUPPEN.erzeugen` mit `einstieg: 'werkzeug'` stehen und
 * `passende()` sie am Bauteil NICHT anbietet.
 */
function zeichenBearbeitung(rezept) {
    return {
        id: `${rezept.id}-zeichnen`,
        titel: `${rezept.titel} zeichnen`,
        icon: rezept.icon,
        gruppe: 'erzeugen',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'erzeugt',
        // Abgeleitet, nicht abgeschrieben: ob ein Rezept einen offenen Zug
        // oder einen geschlossenen Umriss will, steht schon im Rezept.
        eingabe: rezept.geschlossen ? 'umriss' : 'zug',
        rezept: rezept.id,
        mindestPunkte: rezept.mindestPunkte,
        geschlossen: rezept.geschlossen,
        // DIE HÖHE IST EINE HÖHE ÜBER NN, wie überall sonst auch.
        //
        // Hier ging der eingetragene Wert direkt als Three-Welt-Y in die
        // Punkte, während „Bezugshöhe setzen" zwei Katalogeinträge weiter in
        // m NN rechnet. Dieselbe Größe, zwei Systeme, im selben Katalog: wer
        // an Fabios Netz „305" zeichnete, landete 318 m zu hoch — genau der
        // Betrag des Ladeversatzes.
        //
        // Der Versatz kommt mit dem Gezeichneten herein (`useZeichnen` legt
        // ihn ins Subjekt), nicht aus einer zweiten Rechnung hier.
        felder: rezept.felder.map(f => ({
            ...f,
            rueckfall: { ...f, ...(f.name === 'hoehe' ? { einheit: 'm NN' } : {}) },
        })),
        vorbelegung: (el) => ({
            name: '', kategorie: rezept.kategorieVorgabe,
            hoehe: _rundeM(nnAusWelt(0, el?.hoehenversatz ?? 0)),
            // Was das Rezept als Vorgabe nennt (etwa DN 300). Ohne sie stünde
            // ein Pflichtfeld leer und das Formular wäre ab dem Aufschlagen
            // ungültig — derselbe Fehler wie bei den Festlegungen ohne `stand`.
            ...Object.fromEntries(rezept.felder
                .filter(f => f.vorgabe !== undefined)
                .map(f => [f.name, f.vorgabe])),
        }),
        anwenden: (el, werte) => erzeugtEintrag({
            rezept: rezept.id,
            kategorie: werte.kategorie,
            name: werte.name ?? '',
            parameter: {
                punkte: alsRaumpunkte(
                    el?.punkte,
                    weltAusNn(Number(werte.hoehe), el?.hoehenversatz ?? 0),
                ),
                // Alles, was das Rezept sonst noch braucht (DN beim Rohr).
                ...Object.fromEntries(rezept.felder
                    .filter(f => !['name', 'kategorie', 'hoehe'].includes(f.name))
                    .map(f => [f.name, werte[f.name]])),
            },
        }),
    };
}

/**
 * Gelände formen — zwei Wege zu EINEM Muster (Stufe 15).
 *
 * Erste Formung an einem GELIEFERTEN Gelände: das Original wird ausgeblendet
 * (`geloescht` heisst ausblenden, nie löschen) und daneben entsteht das
 * geformte Gelände als CDE-Bauteil — Rezept `gelaende`, Parameter sind
 * QUELLE + OPERATIONSLISTE, nie ein Raster (Gesetz 5). Dasselbe Muster wie
 * „Trasse ändern".
 *
 * Jede WEITERE Formung wählt das geformte Gelände selbst und hängt ihre
 * Operation an: ein neuer `erzeugt`-Eintrag mit der VOLLEN Liste — absolute
 * Zielzustände (Gesetz 4), die Faltung „letzter gewinnt" bleibt unberührt,
 * und „zurück" stellt exakt die vorige Liste wieder her.
 */
function _gelaendeSchritte(el, neueOps) {
    const bauplan = el?.stand?.bauplan;
    if (bauplan?.rezept === 'gelaende') {
        const bisher = bauplan.parameter ?? {};
        return erzeugtEintrag({
            rezept: 'gelaende',
            kategorie: bauplan.kategorie,
            name: bauplan.name ?? el.name ?? '',
            globalId: el.globalId,
            parameter: {
                quelle: bisher.quelle,
                operationen: [...(bisher.operationen ?? []), ...neueOps],
            },
        });
    }
    return [
        { art: 'geloescht', globalId: el.globalId, nachher: true },
        erzeugtEintrag({
            rezept: 'gelaende',
            name: el.name ? `${el.name} (geformt)` : 'Gelände (geformt)',
            parameter: { quelle: el.globalId, operationen: neueOps },
        }),
    ];
}

export const BEARBEITUNGEN = Object.freeze([
    ...Object.values(REZEPTE).map(zeichenBearbeitung),
    {
        id: 'kg-setzen',
        mehrfach: true,
        titel: 'Kostengruppe setzen',
        icon: 'kg',
        gruppe: 'merkmale',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'kg',
        felder: [{
            name: 'kg',
            rueckfall: { titel: 'Kostengruppe (DIN 276)', typ: 'auswahl', optionen: _kgOptionen(), leerErlaubt: true },
        }],
        vorbelegung: (el) => ({ kg: el?.stand?.kg ?? null }),
        anwenden: (el, werte) => ({ art: 'kg', globalId: el.globalId, nachher: werte.kg || null }),
    },
    {
        /**
         * Bezugshöhe setzen — die erste Bearbeitung, die an der FORM hängt.
         *
         * Sie heißt bewusst nicht „Sohlhöhe setzen": WIE der Typ seine
         * Bezugshöhe nennt, steht im Typprofil, nicht hier. Am Rohr ist es die
         * „Sohlhöhe", am Bordstein die „Oberkante" — eine Operation, ein
         * Programmcode, zwei Beschriftungen. Stünde „Sohlhöhe" im Katalog,
         * bekäme der Bordstein die falsche Beschriftung, und man müsste eine
         * zweite Operation dafür schreiben. Das ist der Anfang von O(Typen).
         *
         * Sie schreibt eine `lage`: gemessen wird am ANKER (Hüllenmitte), wie
         * überall in diesem Modul. Der Versatz ist die Differenz zwischen der
         * heutigen und der gewünschten Bezugshöhe; alles andere bleibt stehen.
         */
        id: 'bezugshoehe-setzen',
        titel: 'Bezugshöhe setzen',
        icon: 'laengsschnitt',
        gruppe: 'lage',
        bauform: ['achse+profil', 'koerper'],
        /**
         * KEINE Güteschranke — und das ist kein Nachlassen, sondern die
         * Korrektur eines Denkfehlers.
         *
         * Die Schranke prüft die Güte der Form, die die BAUFORM braucht: bei
         * `achse+profil` ist das die Achse. Diese Bearbeitung braucht die
         * Achse aber gar nicht — sie braucht die HÜLLE, und die liegt immer
         * vor (aus ihr kommt schon der Anker). Ein Rohr, dessen Achse sich
         * nicht skelettieren lässt, hat trotzdem eine wohlbestimmte
         * Unterkante.
         *
         * Mit Schranke wäre ausgerechnet an Fabios erstem echten IFC4-Netz
         * nichts gegangen: dort steht kein einziges 'Axis', nur 'Body'.
         * Fehlt die Hülle wirklich, gibt `anwenden` `null` zurück — dann
         * entsteht kein Eintrag, statt einen auf Höhe null zu schreiben.
         */
        mindestGuete: 'unbekannt',
        brauchtRolle: 'sohlhoehe',
        art: 'lage',
        felder: [{
            name: 'hoehe',
            ausTypprofil: 'sohlhoehe',
            rueckfall: { titel: 'Bezugshöhe', einheit: 'm', typ: 'zahl' },
        }],
        // ANGEZEIGT UND EINGEGEBEN WIRD IN WIRKLICHEN HÖHEN (m NN), gerechnet
        // wird in der Three-Welt. Das Modell wird beim Laden zum Ursprung
        // verschoben; ohne diese Umrechnung stünde im Feld „−17,4" statt
        // „301,0", und wer die echte Sohlhöhe einträgt, verschöbe sein Bauteil
        // um mehrere hundert Meter. Die Umrechnung steht in Hoehenbezug.js.
        vorbelegung: (el) => ({
            hoehe: _rundeM(nnAusWelt(el?.bezugshoehe ?? el?.anker?.y ?? 0, el?.hoehenversatz ?? 0)),
        }),
        anwenden: (el, werte) => {
            const anker = el?.anker ?? null;
            if (!anker) return null;
            // Der Anker ist die Hüllenmitte, die Bezugshöhe die Unterkante.
            // Verschoben wird um die DIFFERENZ, nicht auf den Wert — sonst
            // säße die Mitte auf der Sohle und das Bauteil läge zu hoch.
            const jetzt = el?.bezugshoehe ?? anker.y;
            const ziel = weltAusNn(Number(werte.hoehe), el?.hoehenversatz ?? 0);
            return { art: 'lage', globalId: el.globalId,
                     nachher: { x: anker.x, y: anker.y + (ziel - jetzt), z: anker.z } };
        },
    },
    {
        /**
         * Querschnittsgröße festlegen — die erste, die an der ROLLE hängt.
         *
         * Sie erscheint an JEDEM Typ, dessen Typprofil `profilGroesse` nennt,
         * und übernimmt dessen Beschriftung, Einheit und Grenzen: am Rohr
         * „DN [mm], 50–4000", am Träger „Profilreihe" als Text. Kein Zweig im
         * Programm kennt einen dieser Typen.
         *
         * WAS SIE TUT UND WAS NICHT: Sie schreibt eine Festlegung ins Journal,
         * sie ändert die Geometrie NICHT. Ein Sweep lässt sich nicht
         * nachträglich aufweiten, ohne ihn neu zu bauen — und das gelieferte
         * Modell gehört dem Planer. Nach ISO 19650 ist genau das richtig: die
         * CDE ändert das Autorenmodell nicht, sie stellt eine FORDERUNG. Die
         * landet im Änderungsbericht (Stufe 9.5).
         */
        id: 'profilgroesse-setzen',
        mehrfach: true,
        titel: 'Querschnittsgröße festlegen',
        icon: 'measure',
        gruppe: 'parametrik',
        bauform: '*',
        mindestGuete: 'unbekannt',
        brauchtRolle: 'profilGroesse',
        art: 'parametrik',
        nurFestlegung: true,        // wirkt nicht auf die Geometrie — siehe oben
        felder: [{
            name: 'groesse',
            ausTypprofil: 'profilGroesse',
            rueckfall: { titel: 'Querschnittsgröße', typ: 'zahl' },
        }],
        vorbelegung: (el) => ({ groesse: el?.stand?.profilGroesse ?? null }),
        anwenden: (el, werte) => ({
            art: 'parametrik', globalId: el.globalId,
            // Karte Rolle → Wert: an einem Bauteil gelten mehrere Masse
            // nebeneinander (siehe `falte` in useAenderungen).
            nachher: { profilGroesse: werte.groesse },
        }),
    },
    {
        /**
         * Profilform festlegen — Rolle `profilform` (Stufe 16).
         *
         * Die Kur des Befunds `profilform_widerspruch`: die Geometrie sagt
         * Kreis, Beschreibung und Pset sagen Trapez. Festgelegt wird die
         * FORDERUNG (ein fertiger Sweep lässt sich nicht umformen); sie
         * wandert wie jede Parametrik in den Änderungsbericht.
         */
        id: 'profilform-setzen',
        mehrfach: true,
        titel: 'Profilform festlegen',
        icon: 'querprofil',
        gruppe: 'parametrik',
        bauform: '*',
        mindestGuete: 'unbekannt',
        brauchtRolle: 'profilform',
        art: 'parametrik',
        nurFestlegung: true,
        felder: [{
            name: 'profilform',
            ausTypprofil: 'profilform',
            rueckfall: { titel: 'Profilform', typ: 'auswahl', optionen: [
                { wert: 'kreis', titel: 'Kreis' }, { wert: 'trapez', titel: 'Trapez' },
            ] },
        }],
        vorbelegung: (el) => ({ profilform: el?.stand?.profilform ?? null }),
        anwenden: (el, werte) => ({
            art: 'parametrik', globalId: el.globalId,
            nachher: { profilform: werte.profilform },
        }),
    },
    {
        /**
         * Stärke festlegen — Rolle `dicke`.
         *
         * Heißt an der Wand „Wandstärke", an der Platte „Plattenstärke", an der
         * Tragschicht „Schichtdicke", am Belag „Belagsdicke", am Dach
         * „Aufbaudicke". Fünf Wörter, ein Katalogeintrag.
         *
         * Wie die Querschnittsgröße eine FESTLEGUNG, keine Geometrieänderung:
         * eine Wand nachträglich zu verdicken hiesse, ihren Körper neu zu
         * bauen — und das gelieferte Modell gehört dem Planer.
         */
        id: 'staerke-setzen',
        mehrfach: true,
        titel: 'Stärke festlegen',
        icon: 'measure',
        gruppe: 'parametrik',
        bauform: '*',
        mindestGuete: 'unbekannt',
        brauchtRolle: 'dicke',
        art: 'parametrik',
        nurFestlegung: true,
        felder: [{
            name: 'dicke',
            ausTypprofil: 'dicke',
            rueckfall: { titel: 'Stärke', einheit: 'm', typ: 'zahl' },
        }],
        vorbelegung: (el) => ({ dicke: el?.stand?.dicke ?? null }),
        anwenden: (el, werte) => ({
            art: 'parametrik', globalId: el.globalId,
            nachher: { dicke: werte.dicke },
        }),
    },
    {
        /**
         * Sohlhöhen festlegen — die tägliche Arbeit im Kanalbau.
         *
         * ZWEI ENDEN, nicht eine Höhe. Aus ihrer Differenz folgt das Gefälle,
         * und daraus folgt alles andere: Selbstreinigung, Überdeckung,
         * Anschlusshöhen. Bis Stufe 14.2 liess sich eine Haltung nur als
         * Ganzes heben und senken — die Hülle ist eine Bounding-Box und weiss
         * nicht, welches Ende oben liegt.
         *
         * GÜTESCHRANKE `gemessen`, und die ist hier nicht Strenge um ihrer
         * selbst willen: auf einer SKELETTIERTEN Achse ist „Anfang" willkürlich
         * — welches Ende zuerst kommt, entscheidet der Algorithmus, nicht das
         * Bauwerk. Sohlhöhen darauf zu setzen hiesse, sie mit einer Münze zu
         * verteilen. Seit die Achse aus der Extrusion kommt (14.1), ist die
         * Schranke an echten Daten erfüllt.
         *
         * FESTLEGUNG, keine Formänderung: zwei verschiedene Sohlhöhen ändern
         * die Gestalt des Rohres, und das gelieferte Modell gehört dem Planer
         * (Fabios Entscheidung: geliefert = Forderung, Eigenes = echt). Sie
         * geht in den Änderungsbericht. Für CDE-eigene Bauteile wird sie
         * später wirklich gebaut — dort ist die Achse ein Wert.
         */
        id: 'sohlhoehen-setzen',
        titel: 'Sohlhöhen festlegen',
        icon: 'laengsschnitt',
        gruppe: 'parametrik',
        bauform: ['achse+profil', 'linie'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'parametrik',
        nurFestlegung: true,
        felder: [
            { name: 'anfang', ausTypprofil: 'sohlhoeheAnfang',
              rueckfall: { titel: 'Sohle Anfang', einheit: 'm NN', typ: 'zahl' } },
            { name: 'ende', ausTypprofil: 'sohlhoeheEnde',
              rueckfall: { titel: 'Sohle Ende', einheit: 'm NN', typ: 'zahl' } },
        ],
        vorbelegung: (el) => {
            // Was GILT: erst die Festlegung, sonst die Achse aus der Datei.
            const v = el?.hoehenversatz ?? 0;
            const a = el?.achse ?? null;
            return {
                anfang: _rundeM(el?.stand?.sohlhoeheAnfang ?? (a ? nnAusWelt(a.anfang.y, v) : 0)),
                ende:   _rundeM(el?.stand?.sohlhoeheEnde   ?? (a ? nnAusWelt(a.ende.y, v)   : 0)),
            };
        },
        anwenden: (el, werte) => {
            const anfang = Number(werte.anfang);
            const ende = Number(werte.ende);
            if (!Number.isFinite(anfang) || !Number.isFinite(ende)) return null;
            return {
                art: 'parametrik', globalId: el.globalId,
                nachher: { sohlhoeheAnfang: anfang, sohlhoeheEnde: ende },
            };
        },
    },
    {
        /**
         * Haltung teilen — die erste Bearbeitung, die MEHRERE Bauteile ergibt.
         *
         * Ein Löschen und zwei Erzeugen, gebunden durch einen Vorgang. Der
         * Journaleintrag behält dabei genau EIN Subjekt: an dieser Invariante
         * hängen fünfzehn Stellen, von der Faltung bis zum Drei-Wege-Vergleich.
         * Die Klammer ist der `vorgang`, kein Bauteil-Array — den zu bauen
         * hiesse, alle fünfzehn umzuschreiben.
         *
         * GELÖSCHT HEISST AUSGEBLENDET (siehe `IfcAutor.wendeAn`): das
         * gelieferte Modell gehört dem Planer, und ein echtes Löschen wäre
         * nicht zurücknehmbar. Die Forderung „hier gehört ein Schacht hin"
         * steht im Änderungsbericht.
         *
         * DIE STATION IST EIN FELD, kein Klick. Der Eingabe-Motor für
         * Punktepicken kommt erst mit Stufe 12.3; bis dahin ist „bei Meter X
         * ab Anfang" die ehrliche Form — sie braucht keine neue Maschinerie
         * und ist im Kanalbau ohnehin die übliche Angabe.
         */
        id: 'haltung-teilen',
        titel: 'Haltung teilen',
        icon: 'section',
        gruppe: 'lage',
        bauform: ['achse+profil', 'linie'],
        mindestGuete: 'gemessen',
        art: 'erzeugt',
        felder: [{
            name: 'station', titel: 'Teilen bei', einheit: 'm ab Anfang', typ: 'zahl', min: 0,
        }],
        vorbelegung: (el) => ({ station: _rundeM((el?.achse?.laenge ?? 0) / 2) }),
        anwenden: (el, werte) => {
            const a = el?.achse;
            if (!a || !el?.globalId) return null;
            const teilung = _teilpunkt(a, werte.station);
            if (!teilung) return null;
            const punkt = _alsTripel;
            const name = el?.name ?? '';
            const stueck = (von, bis, zusatz) => erzeugtEintrag({
                rezept: 'rohr',
                kategorie: el.category ?? 'IFCPIPESEGMENT',
                name: name ? `${name}${zusatz}` : '',
                parameter: { punkte: [punkt(von), punkt(bis)], dn: a.dn ?? 300 },
            });

            // Reihenfolge mit Absicht: erst das Alte weg, dann das Neue. Beim
            // Nachspielen läuft dieselbe Folge, und ein halb angewandter
            // Vorgang zeigt dann eher zu wenig als doppelt.
            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                stueck(a.anfang, teilung, ' (1)'),
                stueck(teilung, a.ende, ' (2)'),
            ];
        },
    },
    {
        /**
         * Deckelhöhe festlegen — die zweite Höhe am Schacht.
         *
         * Sohle und Deckel ergeben zusammen die Schachttiefe, und die
         * entscheidet über Einstieg, Absturzbauwerk und die Überdeckung der
         * abgehenden Haltung. Sie hängt an der ROLLE, nicht am Typ: jedes
         * Bauwerk, dessen Typprofil `deckelhoehe` nennt, bekommt sie.
         *
         * Vorbelegt aus der OBERKANTE der Hülle — das ist bei einem Schacht
         * der Deckel. Anders als bei der Haltung braucht es dafür keine Achse.
         */
        id: 'deckelhoehe-setzen',
        mehrfach: true,
        titel: 'Deckelhöhe festlegen',
        icon: 'measure',
        gruppe: 'parametrik',
        bauform: '*',
        brauchtRolle: 'deckelhoehe',
        mindestGuete: 'unbekannt',
        art: 'parametrik',
        nurFestlegung: true,
        felder: [{
            name: 'deckel', ausTypprofil: 'deckelhoehe',
            rueckfall: { titel: 'Deckelhöhe', einheit: 'm NN', typ: 'zahl' },
        }],
        vorbelegung: (el) => ({
            deckel: _rundeM(el?.stand?.deckelhoehe
                ?? nnAusWelt(el?.oberkante ?? el?.anker?.y ?? 0, el?.hoehenversatz ?? 0)),
        }),
        anwenden: (el, werte) => {
            const d = Number(werte.deckel);
            if (!Number.isFinite(d) || !el?.globalId) return null;
            return { art: 'parametrik', globalId: el.globalId, nachher: { deckelhoehe: d } };
        },
    },
    {
        /**
         * Fliessrichtung umkehren.
         *
         * Im Kanalbau keine Kleinigkeit: die Richtung entscheidet über Zulauf
         * und Ablauf, über „DN nimmt nicht ab", über die Strangbildung und
         * über jeden Gefälle-Befund. In Fabios A64-Netz laufen drei Haltungen
         * bergauf — das ist entweder ein Digitalisierfehler (dann ist ein
         * Klick hier die Kur) oder Absicht (Druckleitung), und dann steht der
         * Befund zu Recht.
         *
         * EINE FESTLEGUNG, keine Geometrieänderung: das gelieferte Modell
         * gehört dem Planer. Die CDE rechnet aber ab sofort mit der
         * korrigierten Richtung — Befunde und Strang folgen ihr.
         *
         * Ein Auswahlfeld statt eines blossen Knopfes, damit die Bearbeitung
         * IDEMPOTENT bleibt: zweimal „umgekehrt" ist einmal umgekehrt, nicht
         * wieder zurück. Ein Umschalt-Knopf hinge sonst am Zufall, wie oft
         * jemand geklickt hat.
         */
        id: 'fliessrichtung-setzen',
        mehrfach: true,
        titel: 'Fliessrichtung',
        icon: 'pointer',
        gruppe: 'lage',
        bauform: ['achse+profil', 'linie'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'parametrik',
        nurFestlegung: true,
        felder: [{
            name: 'richtung',
            rueckfall: {
                titel: 'Läuft', typ: 'auswahl',
                optionen: [
                    { wert: 'wie_geliefert', titel: 'wie geliefert' },
                    { wert: 'umgekehrt', titel: 'umgekehrt' },
                ],
            },
        }],
        vorbelegung: (el) => ({ richtung: el?.stand?.fliessrichtung ?? 'wie_geliefert' }),
        anwenden: (el, werte) => {
            if (!el?.globalId) return null;
            return {
                art: 'parametrik', globalId: el.globalId,
                nachher: { fliessrichtung: werte.richtung === 'umgekehrt' ? 'umgekehrt' : 'wie_geliefert' },
            };
        },
    },
    {
        /**
         * Sohlhöhen über den ganzen STRANG — das erste Werkzeug der Sorte
         * „Kette" (Stufe 14.6).
         *
         * Man gibt die Sohle am Anfang und am Ende der Kette an; dazwischen
         * wird das Gefälle GLEICHMÄSSIG verteilt, nach Länge gewichtet. Das
         * ist die tägliche Arbeit an einem Kanalstrang: zwei Zwangspunkte, und
         * alles dazwischen ergibt sich.
         *
         * n Bauteile, n Einträge, EIN Vorgang — und jeder Eintrag hat weiter
         * genau ein Subjekt. „Zurück" nimmt den ganzen Strang zurück, nicht
         * eine Haltung davon.
         *
         * DIE KETTE KOMMT AM BAUTEIL HEREIN (`el.strang`), damit diese Datei
         * rein bleibt: kein Netz, keine Engine, kein Zustand. Sie endet am
         * Abzweig — welche Haltung dort gemeint ist, entscheidet ein Mensch.
         */
        id: 'strang-gefaelle-setzen',
        titel: 'Sohlhöhen über den Strang',
        icon: 'laengsschnitt',
        gruppe: 'parametrik',
        bauform: ['achse+profil'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'parametrik',
        nurFestlegung: true,
        felder: [
            { name: 'anfang', rueckfall: { titel: 'Sohle am Anfang', einheit: 'm NN', typ: 'zahl' } },
            { name: 'ende', rueckfall: { titel: 'Sohle am Ende', einheit: 'm NN', typ: 'zahl' } },
        ],
        vorbelegung: (el) => {
            const s = el?.strang ?? [];
            const v = el?.hoehenversatz ?? 0;
            if (!s.length) return { anfang: 0, ende: 0 };
            return {
                anfang: _rundeM(nnAusWelt(s[0].anfang.y, v)),
                ende: _rundeM(nnAusWelt(s[s.length - 1].ende.y, v)),
            };
        },
        anwenden: (el, werte) => {
            const s = el?.strang ?? [];
            const v = el?.hoehenversatz ?? 0;
            const von = Number(werte.anfang);
            const bis = Number(werte.ende);
            if (!s.length || !Number.isFinite(von) || !Number.isFinite(bis)) return null;

            const gesamt = s.reduce((n, k) => n + (Number(k.laenge) || 0), 0);
            if (!(gesamt > 0)) return null;

            // Gleichmässig nach LÄNGE, nicht nach Anzahl: zwei kurze und eine
            // lange Haltung bekommen sonst dasselbe Gefälle-Drittel, und der
            // Strang knickt an jedem Schacht.
            let gelaufen = 0;
            const hoeheBei = (s0) => von - ((von - bis) * (s0 / gesamt));
            return s.map((k) => {
                const anfang = hoeheBei(gelaufen);
                gelaufen += Number(k.laenge) || 0;
                const ende = hoeheBei(gelaufen);
                return {
                    art: 'parametrik', globalId: k.globalId,
                    nachher: {
                        sohlhoeheAnfang: _rundeM(anfang),
                        sohlhoeheEnde: _rundeM(ende),
                    },
                };
            });
            // `v` bleibt ungenutzt: die Eingabe ist bereits m NN, und die
            // Ausgabe ist es auch. Der Versatz wird nur für die VORBELEGUNG
            // gebraucht, die aus Weltkoordinaten kommt.
        },
    },
    {
        /**
         * Schacht einfügen — Teilen und Erzeugen in einem Vorgang.
         *
         * Der Fall, den man im Kanalbau ständig hat: eine zu lange Haltung
         * bekommt in der Mitte ein Bauwerk. Vier Einträge — die alte Haltung
         * weg, zwei Stücke und ein Schacht — unter EINEM Vorgang, damit
         * „zurück" nicht drei Viertel davon stehen lässt.
         *
         * DAS NETZ FINDET SICH VON SELBST WIEDER: der Schacht steht an
         * derselben XY-Stelle, an der die beiden Stücke enden bzw. beginnen,
         * und die Topologie kommt aus genau dieser Koinzidenz (siehe
         * `Netztopologie.js`). Es braucht also keine Beziehung, die irgendwo
         * eingetragen werden müsste — es gibt in den echten Dateien ohnehin
         * keine.
         *
         * Die Sohle des Schachts ist die Sohle an der Teilstelle. Der Deckel
         * ist ein FELD und mit 2,50 m Tiefe vorbelegt — die Geländehöhe kennt
         * die CDE hier noch nicht, und eine erfundene wäre schlechter als eine
         * offen sichtbare Annahme.
         */
        id: 'schacht-einfuegen',
        titel: 'Schacht einfügen',
        icon: 'add',
        gruppe: 'lage',
        bauform: ['achse+profil'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'erzeugt',
        felder: [
            { name: 'station', titel: 'Einfügen bei', einheit: 'm ab Anfang', typ: 'zahl', min: 0 },
            { name: 'deckel', titel: 'Deckelhöhe', einheit: 'm NN', typ: 'zahl' },
            { name: 'durchmesser', titel: 'Durchmesser', einheit: 'mm', typ: 'zahl', min: 300, max: 4000 },
        ],
        vorbelegung: (el) => {
            const a = el?.achse;
            const v = el?.hoehenversatz ?? 0;
            const mitte = a ? _teilpunkt(a, (Number(a.laenge) || 0) / 2) : null;
            return {
                station: _rundeM((Number(a?.laenge) || 0) / 2),
                // 2,50 m Regeltiefe — sichtbar als Annahme, nicht als Wahrheit.
                deckel: _rundeM(mitte ? nnAusWelt(mitte.y, v) + 2.5 : 0),
                durchmesser: 1000,
            };
        },
        anwenden: (el, werte) => {
            const a = el?.achse;
            if (!a || !el?.globalId) return null;
            const teilung = _teilpunkt(a, werte.station);
            if (!teilung) return null;

            const v = el?.hoehenversatz ?? 0;
            const deckelWelt = weltAusNn(Number(werte.deckel), v);
            if (!Number.isFinite(deckelWelt) || deckelWelt <= teilung.y) return null;

            const name = el?.name ?? '';
            const stueck = (von, bis, zusatz) => erzeugtEintrag({
                rezept: 'rohr',
                kategorie: el.category ?? 'IFCPIPESEGMENT',
                name: name ? `${name}${zusatz}` : '',
                parameter: { punkte: [_alsTripel(von), _alsTripel(bis)], dn: a.dn ?? 300 },
            });

            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                erzeugtEintrag({
                    rezept: 'schacht',
                    kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT',
                    name: name ? `${name} (Schacht)` : '',
                    parameter: {
                        punkte: [_alsTripel(teilung), [teilung.x, deckelWelt, teilung.z]],
                        dn: Number(werte.durchmesser) || 1000,
                    },
                }),
                stueck(a.anfang, teilung, ' (1)'),
                stueck(teilung, a.ende, ' (2)'),
            ];
        },
    },
    {
        /**
         * Schacht verschieben — und was mit den Anschlüssen geschieht (14.8).
         *
         * DER PUNKT, UM DEN ES GEHT: Die angeschlossenen Haltungen können sich
         * nicht starr mitbewegen. Bei einer Haltung wandert nur EIN Ende, das
         * andere bleibt am Nachbarschacht — das ist eine FORMänderung, keine
         * Verschiebung. Und Formänderungen am gelieferten Modell sind nach
         * Fabios Entscheidung Forderungen, keine Eingriffe.
         *
         * Deshalb ein REGLER statt einer stillen Annahme:
         *
         *   „als Forderung" (Vorgabe) — der Schacht bewegt sich, die Haltungen
         *       bleiben stehen und bekommen einen dokumentierten
         *       Anschlusspunkt. Ehrlich, und die Herkunft bleibt unangetastet.
         *       Preis: bis zur nächsten Lieferung meldet die Prüfliste lose
         *       Enden — zu Recht, denn genau das ist der Zustand.
         *
         *   „wirklich mitführen" — jede angeschlossene Haltung wird gelöscht
         *       und mit verschobenem Ende neu erzeugt. Sie folgt sichtbar,
         *       wandert dafür ins CDE-Modell und verliert die Herkunft
         *       „geliefert". Bei vielen Schachtverschiebungen wird aus einem
         *       fremden Netz nach und nach ein eigenes — das soll man wissen,
         *       bevor man es tut.
         *
         * EINGABE IN PROJEKTKOORDINATEN, absolut. Ein Zuwachs („1,20 m nach
         * Osten") wäre bequemer und wäre falsch: zweimal angewandt verschöbe er
         * doppelt, und das Journal ruht auf absoluten Werten (Entscheidung 1
         * aus Stufe 9.1). Gilt eine MapConversion, ist die Umkehrung nicht mehr
         * diese Formel — dann wird die Bearbeitung nicht angeboten.
         */
        id: 'schacht-verschieben',
        titel: 'Schacht verschieben',
        icon: 'pointer',
        gruppe: 'lage',
        bauform: ['koerper'],
        brauchtRolle: 'deckelhoehe',
        mindestGuete: 'unbekannt',
        art: 'lage',
        felder: [
            { name: 'ost', titel: 'Rechtswert', einheit: 'm', typ: 'zahl' },
            { name: 'nord', titel: 'Hochwert', einheit: 'm', typ: 'zahl' },
            {
                name: 'mitfuehren',
                rueckfall: {
                    titel: 'Angeschlossene Haltungen', typ: 'auswahl',
                    optionen: [
                        { wert: 'forderung', titel: 'als Forderung führen' },
                        { wert: 'wirklich', titel: 'wirklich mitführen (werden CDE-Bauteile)' },
                    ],
                },
            },
        ],
        vorbelegung: (el) => ({
            ost: _rundeM(el?.lage?.ost ?? 0),
            nord: _rundeM(el?.lage?.nord ?? 0),
            mitfuehren: 'forderung',
        }),
        anwenden: (el, werte) => {
            if (!el?.globalId || !el?.anker || !el?.versatz) return null;
            // Ohne umkehrbare Abbildung lieber gar nichts als eine Verschiebung
            // an die falsche Stelle.
            if (el.lageUmkehrbar === false) return null;
            const ost = Number(werte.ost);
            const nord = Number(werte.nord);
            if (!Number.isFinite(ost) || !Number.isFinite(nord)) return null;

            // Die Umkehrung von `_alsProjekt(_rohAus(welt, versatz))`:
            //   ost  = welt.x + versatz.x        ⇒ welt.x =  ost  − versatz.x
            //   nord = −(welt.z + versatz.z)     ⇒ welt.z = −nord − versatz.z
            const zielX = ost - el.versatz.x;
            const zielZ = -nord - el.versatz.z;
            const dx = zielX - el.anker.x;
            const dz = zielZ - el.anker.z;
            if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return null;

            const eintraege = [{
                art: 'lage', globalId: el.globalId,
                // Die Höhe bleibt — verschoben wird in der Ebene. Wer die Sohle
                // ändern will, hat dafür ein eigenes Werkzeug.
                nachher: { x: zielX, y: el.anker.y, z: zielZ },
            }];

            const anschluesse = el.anschluesse ?? [];
            if (werte.mitfuehren !== 'wirklich') {
                // ALS FORDERUNG: der neue Anschlusspunkt wird festgeschrieben,
                // die Geometrie bleibt beim Planer.
                for (const k of anschluesse) {
                    eintraege.push({
                        art: 'parametrik', globalId: k.globalId,
                        nachher: { anschlusspunkt: { ende: k.ende, ost: _rundeM(ost), nord: _rundeM(nord) } },
                    });
                }
                return eintraege;
            }

            // WIRKLICH MITFÜHREN: löschen und mit verschobenem Ende neu bauen.
            // Dieselbe Mechanik wie beim Teilen — nur bewegt sich hier ein Ende
            // statt dass ein Punkt dazukommt.
            for (const k of anschluesse) {
                const bleibt = k.ende === 'anfang' ? k.ende_ : k.anfang;
                const wandert = k.ende === 'anfang' ? k.anfang : k.ende_;
                const neu = { x: zielX, y: wandert.y, z: zielZ };
                const punkte = k.ende === 'anfang'
                    ? [_alsTripel(neu), _alsTripel(bleibt)]
                    : [_alsTripel(bleibt), _alsTripel(neu)];
                eintraege.push({ art: 'geloescht', globalId: k.globalId, nachher: true });
                eintraege.push(erzeugtEintrag({
                    rezept: 'rohr',
                    kategorie: k.kategorie ?? 'IFCPIPESEGMENT',
                    name: k.name ?? '',
                    parameter: { punkte, dn: k.dn ?? 300 },
                }));
            }
            return eintraege;
        },
    },
    {
        /**
         * An Schacht anschliessen — der erste Eintrag mit BEZUG (Stufe 16,
         * ehemals 12.5).
         *
         * Der Tipp im Lageplan IST der zweite Schlitz: er wählt den
         * Zielschacht (nächster Knoten im Fangradius). Das wandernde Ende
         * ist das dem SCHACHT nähere — nie ein Index, die Achsrichtung kann
         * willkürlich sein (Landmine aus Teil V). Verschoben wird STARR
         * (`setzeAnker` kann nicht strecken): sitzt das ferne Ende schon
         * auf einem Schacht, risse der Zug es ab — dann lieber nichts.
         * Damit ist das Werkzeug genau die Kur des Befunds `loses_ende`.
         *
         * Der Eintrag trägt `bezug` mit `zielBasis` — das Pfand für den
         * zweiten Drei-Wege-Vergleich beim Nachspielen: bewegt der PLANER
         * den Schacht, wird der Anker nachgeführt statt still daneben zu
         * stehen. (`gleichPunkt` sieht den Bezug beim Eintragen NICHT —
         * gleicher Anker mit anderem Bezug gälte als „galt schon"; bewusst
         * so belassen, der Bezug ist reine Herleitung. Teil-V-Landmine 1.)
         */
        id: 'an-schacht-anschliessen',
        titel: 'An Schacht anschliessen',
        icon: 'haltung',
        gruppe: 'lage',
        bauform: ['achse+profil'],
        mindestGuete: 'unbekannt',
        art: 'lage',
        eingabe: 'zug',
        mindestPunkte: 1,
        felder: [],
        vorbelegung: () => ({}),
        anwenden: (el, _werte, { zug = [] } = {}) => {
            const a = el?.achse;
            const knoten = el?.schachtKnoten ?? [];
            if (!el?.globalId || !el?.anker || !a?.anfang || !a?.ende) return null;
            if (!zug.length || !knoten.length) return null;

            const tipp = zug[0];
            let ziel = null;
            let dTipp = Infinity;
            for (const k of knoten) {
                const d = Math.hypot(k.punkt.x - tipp.x, k.punkt.z - tipp.z);
                if (d < dTipp) { dTipp = d; ziel = k; }
            }
            // Fangradius 10 m: ein Tipp ins Leere soll nicht den 300 m
            // entfernten Schacht erwischen.
            if (!ziel || dTipp > 10) return null;

            const abstand = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
            const dA = abstand(a.anfang, ziel.punkt);
            const dE = abstand(a.ende, ziel.punkt);
            const ende = dA <= dE ? 'anfang' : 'ende';
            const wandert = ende === 'anfang' ? a.anfang : a.ende;
            const bleibt = ende === 'anfang' ? a.ende : a.anfang;

            // Das ferne Ende sitzt schon auf einem Schacht? Starr verschieben
            // risse es ab.
            for (const k of knoten) {
                if (abstand(k.punkt, bleibt) <= 0.001) return null;
            }

            const dx = ziel.punkt.x - wandert.x;
            const dz = ziel.punkt.z - wandert.z;
            if (Math.hypot(dx, dz) < 1e-4) return null;   // sitzt schon

            return {
                art: 'lage', globalId: el.globalId,
                // Starr in der EBENE — die Sohle bleibt; dafür gibt es die
                // Sohlhöhen-Werkzeuge.
                nachher: { x: el.anker.x + dx, y: el.anker.y, z: el.anker.z + dz },
                bezug: {
                    art: 'anschluss', ziel: ziel.globalId, ende,
                    zielBasis: { x: ziel.punkt.x, y: ziel.punkt.y, z: ziel.punkt.z },
                },
            };
        },
    },
    {
        /**
         * Schacht entfernen — die UMKEHRUNG von „Schacht einfügen" (Stufe 16).
         *
         * Nur für den sauberen Durchgangsfall: genau EIN Zulauf und EIN
         * Ablauf. Die zusammengelegte Haltung behält den Ort des entfernten
         * Schachts als Knickpunkt (die Trasse bewegt sich NICHT — zwei
         * Geraden zu einer zu begradigen wäre eine Lageänderung, die niemand
         * bestellt hat) und die Sohle des Zulaufs an dieser Stelle. Vier
         * Einträge, ein Vorgang: drei mal ausblenden, einmal erzeugen —
         * dieselbe Mechanik wie beim Teilen, rückwärts.
         */
        id: 'schacht-entfernen',
        titel: 'Schacht entfernen (Haltungen zusammenlegen)',
        icon: 'delete',
        gruppe: 'lage',
        bauform: ['koerper'],
        brauchtRolle: 'deckelhoehe',
        mindestGuete: 'unbekannt',
        art: 'erzeugt',
        felder: [],
        vorbelegung: () => ({}),
        anwenden: (el) => {
            const a = el?.anschluesse ?? [];
            if (!el?.globalId || a.length !== 2) return null;
            const zu = a.find(k => k.ende === 'ende');     // fliesst HIER hinein
            const ab = a.find(k => k.ende === 'anfang');   // beginnt hier
            // Hoch- oder Tiefpunkt (zweimal Zulauf / zweimal Ablauf): das ist
            // keine Durchgangs-Zusammenlegung — lieber nichts als Unsinn.
            if (!zu || !ab) return null;

            const fernZu = zu.anfang;                      // Anfang des Zulaufs
            const fernAb = ab.ende_;                       // Ende des Ablaufs
            const knick = { x: zu.ende_.x, y: zu.ende_.y, z: zu.ende_.z };
            const punkte = [
                [fernZu.x, fernZu.y, fernZu.z],
                [knick.x, knick.y, knick.z],
                [fernAb.x, fernAb.y, fernAb.z],
            ];
            const dn = Math.max(Number(zu.dn) || 0, Number(ab.dn) || 0) || 300;

            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                { art: 'geloescht', globalId: zu.globalId, nachher: true },
                { art: 'geloescht', globalId: ab.globalId, nachher: true },
                erzeugtEintrag({
                    rezept: 'rohr',
                    kategorie: zu.kategorie ?? 'IFCPIPESEGMENT',
                    name: zu.name || ab.name || '',
                    parameter: { punkte, dn },
                }),
            ];
        },
    },
    {
        /**
         * Umbenennen — der Musterfall fürs Mehrfachbearbeiten (Stufe 14.10).
         *
         * In Fabios A64-Netz passen 456 von 500 Haltungsnamen nicht zum
         * Schacht, sind auf 15 Zeichen abgeschnitten und teils
         * Encoding-beschädigt (`A064-Anschlu\X2\FFFD`). Von Hand ist das
         * nicht zu machen.
         *
         * `mehrfach: true` heisst: die Bearbeitung wird auf JEDES Bauteil der
         * Auswahl angewandt, und `nummer` zählt dabei hoch. Die Reihenfolge ist
         * die der Auswahl — bei einem Rahmen also willkürlich. Wer entlang
         * eines Strangs nummerieren will, nimmt `strang-umbenennen`; dort ist
         * die Reihenfolge die Fliessrichtung und damit die einzig sinnvolle.
         */
        id: 'umbenennen',
        titel: 'Umbenennen',
        icon: 'info',
        gruppe: 'merkmale',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'bezeichnung',
        mehrfach: true,
        felder: [
            { name: 'muster', titel: 'Muster', typ: 'text' },
            { name: 'beginnBei', titel: 'Beginnt bei', typ: 'zahl', min: 0 },
        ],
        vorbelegung: (el) => ({ muster: el?.name ?? '', beginnBei: 1 }),
        anwenden: (el, werte, { nummer = 0 } = {}) => {
            if (!el?.globalId) return null;
            const name = nameAusMuster(werte.muster, {
                nummer: (Number(werte.beginnBei) || 0) + nummer,
                alt: el.name ?? '',
            });
            if (!name) return null;
            return { art: 'bezeichnung', globalId: el.globalId, nachher: name };
        },
    },
    {
        /**
         * Entlang des Strangs durchnummerieren.
         *
         * Die Reihenfolge ist die FLIESSRICHTUNG — bei einer Kette die einzige,
         * die etwas bedeutet. Ein Rahmen liefert seine Treffer in beliebiger
         * Folge, und „H-001, H-002" wäre dann eine Nummerierung nach Zufall.
         */
        id: 'strang-umbenennen',
        titel: 'Strang durchnummerieren',
        icon: 'info',
        gruppe: 'merkmale',
        bauform: ['achse+profil'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'bezeichnung',
        felder: [
            { name: 'muster', titel: 'Muster', typ: 'text' },
            { name: 'beginnBei', titel: 'Beginnt bei', typ: 'zahl', min: 0 },
        ],
        vorbelegung: () => ({ muster: 'H-{n:3}', beginnBei: 1 }),
        anwenden: (el, werte) => {
            const s = el?.strang ?? [];
            if (!s.length) return null;
            const start = Number(werte.beginnBei) || 0;
            const eintraege = s.map((k, i) => {
                const name = nameAusMuster(werte.muster, { nummer: start + i, alt: k.name ?? '' });
                return name ? { art: 'bezeichnung', globalId: k.globalId, nachher: name } : null;
            }).filter(Boolean);
            return eintraege.length ? eintraege : null;
        },
    },
    {
        /**
         * Sanierungsmaßnahme festlegen (Stufe 14.11).
         *
         * Eine Entscheidung, kein Messwert — deshalb ein geschlossenes
         * Vokabular wie bei der Kostengruppe und nicht ein Freitextfeld. Die
         * Liste ist ein DATENSATZ (`services/Sanierung.js`) und gehört auf die
         * Büro-Ebene: was ein Büro unter „Renovierung" führt — Kurzliner,
         * Schlauchliner, Berstlining —, ist seine Verfeinerung, nicht unsere.
         *
         * `mehrfach`, weil es fast immer viele auf einmal sind: man saniert
         * einen Abschnitt, nicht eine Haltung.
         */
        id: 'massnahme-setzen',
        titel: 'Maßnahme festlegen',
        icon: 'quality',
        gruppe: 'merkmale',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'massnahme',
        mehrfach: true,
        felder: [{
            name: 'massnahme',
            rueckfall: {
                titel: 'Sanierung', typ: 'auswahl', leerErlaubt: true,
                optionen: MASSNAHMEN.map(m => ({ wert: m.wert, titel: m.titel })),
            },
        }],
        vorbelegung: (el) => ({ massnahme: el?.stand?.massnahme ?? null }),
        anwenden: (el, werte) => (el?.globalId
            ? { art: 'massnahme', globalId: el.globalId, nachher: werte.massnahme || null }
            : null),
    },
    {
        /**
         * Maßnahme über den ganzen Strang — der Sanierungsabschnitt.
         *
         * Das ist die Form, in der im Kanalbau tatsächlich entschieden wird:
         * nicht „diese Haltung bekommt einen Liner", sondern „von Schacht A
         * bis Schacht D". Die Kette liefert die Reihenfolge und das Ende.
         */
        id: 'strang-massnahme',
        titel: 'Sanierungsabschnitt festlegen',
        icon: 'quality',
        gruppe: 'merkmale',
        bauform: ['achse+profil'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'massnahme',
        felder: [{
            name: 'massnahme',
            rueckfall: {
                titel: 'Sanierung', typ: 'auswahl',
                optionen: MASSNAHMEN.map(m => ({ wert: m.wert, titel: m.titel })),
            },
        }],
        vorbelegung: (el) => ({ massnahme: el?.stand?.massnahme ?? 'renovierung' }),
        anwenden: (el, werte) => {
            const s = el?.strang ?? [];
            if (!s.length || !werte.massnahme) return null;
            return s.map(k => ({
                art: 'massnahme', globalId: k.globalId, nachher: werte.massnahme,
            }));
        },
    },
    {
        /**
         * Trasse ändern — die erste Bearbeitung, die ein BAUTEIL und einen
         * gezeichneten Zug braucht (Stufe 14.12).
         *
         * NUR DIE ZWISCHENPUNKTE werden gezeichnet. Anfang und Ende bleiben,
         * wo sie sind — im Kanalbau stehen die Schächte, und nur der Weg
         * dazwischen ändert sich. Das erspart ein Fangen an den Schächten
         * (das erst gebaut werden müsste) und trifft zugleich genau, was
         * gemeint ist: eine Haltung wird um ein Hindernis herumgeführt.
         *
         * DIE HÖHEN WERDEN NEU VERTEILT, gleichmässig über die neue Länge. Die
         * gezeichneten Punkte haben keine sinnvolle Höhe — der Lageplan ist
         * eine Draufsicht. Sie aus dem Gefälle zu interpolieren ist das, was
         * ein Planer ohnehin täte.
         *
         * Ergebnis wie beim Teilen: die alte Haltung wird ausgeblendet, die
         * neue entsteht im CDE-Modell — ein Vorgang, ein „zurück".
         */
        id: 'trasse-aendern',
        titel: 'Trasse ändern',
        icon: 'trasse',
        gruppe: 'lage',
        bauform: ['achse+profil', 'linie'],
        mindestGuete: 'gemessen',
        art: 'erzeugt',
        eingabe: 'zug',
        mindestPunkte: 1,
        felder: [],
        vorbelegung: () => ({}),
        anwenden: (el, werte, { zug = [] } = {}) => {
            const a = el?.achse;
            if (!a?.anfang || !a?.ende || !el?.globalId || !zug.length) return null;

            // Die neue Achse: Anfang, das Gezeichnete, Ende. Die Höhen der
            // Zwischenpunkte folgen der Strecke.
            const grundriss = [
                { x: a.anfang.x, z: a.anfang.z },
                ...zug.map(p => ({ x: Number(p.x) || 0, z: Number(p.z) || 0 })),
                { x: a.ende.x, z: a.ende.z },
            ];
            const abschnitt = [];
            let gesamt = 0;
            for (let i = 0; i + 1 < grundriss.length; i++) {
                const d = Math.hypot(grundriss[i + 1].x - grundriss[i].x,
                                     grundriss[i + 1].z - grundriss[i].z);
                abschnitt.push(d);
                gesamt += d;
            }
            if (!(gesamt > 0)) return null;

            let gelaufen = 0;
            const punkte = grundriss.map((p, i) => {
                if (i > 0) gelaufen += abschnitt[i - 1];
                const y = a.anfang.y - (a.anfang.y - a.ende.y) * (gelaufen / gesamt);
                return [p.x, y, p.z];
            });

            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                erzeugtEintrag({
                    rezept: 'rohr',
                    kategorie: el.category ?? 'IFCPIPESEGMENT',
                    name: el.name ?? '',
                    parameter: { punkte, dn: a.dn ?? 300 },
                }),
            ];
        },
    },
    {
        /**
         * Gerinne einschneiden (Stufe 15) — die erste Geländeoperation.
         *
         * Subjekt ist das GELÄNDE (Bauform hoehenfeld), die Achse wird im
         * Lageplan gezeichnet (eingabe 'zug' — dieselbe Maschinerie wie
         * „Trasse ändern"). Sohlhöhen sind ABSOLUTE NN-Werte, die Operation
         * ist schneidend und damit idempotent; gerechnet wird sie nie hier,
         * sondern beim Neuaufbau aus dem Journal (services/gelaende/).
         */
        id: 'gerinne-einschneiden',
        titel: 'Gerinne einschneiden',
        icon: 'gerinne',
        gruppe: 'gelaende',
        bauform: 'hoehenfeld',
        art: 'erzeugt',
        eingabe: 'zug',
        mindestPunkte: 2,
        felder: [
            { name: 'sohleAnfang', titel: 'Sohle am Anfang', einheit: 'm NN', typ: 'zahl' },
            { name: 'sohleEnde', titel: 'Sohle am Ende', einheit: 'm NN', typ: 'zahl', leerErlaubt: true },
            { name: 'sohlbreite', titel: 'Sohlbreite', einheit: 'm', typ: 'zahl', vorgabe: 1 },
            { name: 'boeschung', titel: 'Böschung 1 : n', typ: 'zahl', vorgabe: 1.5 },
        ],
        vorbelegung: () => ({ sohlbreite: 1, boeschung: 1.5 }),
        anwenden: (el, werte, { zug = [] } = {}) => {
            if (!el?.globalId || zug.length < 2) return null;
            if (!Number.isFinite(Number(werte?.sohleAnfang))) return null;
            return _gelaendeSchritte(el, [{
                art: 'gerinne',
                parameter: {
                    achse: zug.map(p => ({ x: Number(p.x) || 0, z: Number(p.z) || 0 })),
                    sohlbreite: Number(werte.sohlbreite) || 0,
                    boeschung: Number(werte.boeschung) || 1.5,
                    sohleAnfang: Number(werte.sohleAnfang),
                    sohleEnde: Number.isFinite(Number(werte.sohleEnde))
                        ? Number(werte.sohleEnde) : Number(werte.sohleAnfang),
                },
            }]);
        },
    },
    {
        /**
         * Planum herstellen — Umriss zeichnen, Sollhöhe setzen; mit
         * Böschungsneigung schliesst gleich der Anschluss ans gewachsene
         * Gelände an (zwei Operationen, EIN Eintrag).
         */
        id: 'planum-herstellen',
        titel: 'Planum herstellen',
        icon: 'planum',
        gruppe: 'gelaende',
        bauform: 'hoehenfeld',
        art: 'erzeugt',
        eingabe: 'umriss',
        mindestPunkte: 3,
        felder: [
            { name: 'hoehe', titel: 'Planumshöhe', einheit: 'm NN', typ: 'zahl' },
            { name: 'neigung', titel: 'Böschung 1 : n (leer = ohne Anschluss)', typ: 'zahl', leerErlaubt: true },
        ],
        vorbelegung: (el) => ({ hoehe: el?.bezugshoehe ?? null }),
        anwenden: (el, werte, { zug = [] } = {}) => {
            if (!el?.globalId || zug.length < 3) return null;
            const hoehe = Number(werte?.hoehe);
            if (!Number.isFinite(hoehe)) return null;
            const umriss = zug.map(p => ({ x: Number(p.x) || 0, z: Number(p.z) || 0 }));
            const ops = [{ art: 'planum', parameter: { umriss, hoehe } }];
            const n = Number(werte?.neigung);
            if (Number.isFinite(n) && n > 0) {
                ops.push({ art: 'boeschung', parameter: { umriss, hoehe, neigung: n } });
            }
            return _gelaendeSchritte(el, ops);
        },
    },
    {
        id: 'din277-setzen',
        mehrfach: true,
        titel: 'DIN-277-Klasse setzen',
        icon: 'areas',
        gruppe: 'merkmale',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'din277',
        felder: [{
            name: 'din277',
            rueckfall: {
                titel: 'DIN-277-Klasse', typ: 'auswahl', leerErlaubt: true,
                optionen: Object.values(DIN277_CLASSES).map(k => ({ wert: k.code, titel: `${k.code} — ${k.label}` })),
            },
        }],
        vorbelegung: (el) => ({ din277: el?.stand?.din277 ?? null }),
        anwenden: (el, werte) => ({ art: 'din277', globalId: el.globalId, nachher: werte.din277 || null }),
    },
]);

// ── Auswahl ─────────────────────────────────────────────────────────────────

/**
 * Welche Bearbeitungen passen zu diesem Bauteil?
 *
 * Gefiltert wird über BAUFORM und GÜTE — nie über den Kategorienamen. Die
 * Güteschranke ist der Grund, warum eine Operation auf schlecht modellierten
 * Daten lieber gar nicht erscheint, als still Unsinn zu rechnen: Wer eine
 * Sohlhöhe festschreiben will, braucht eine Achse, die der Planer gezeichnet
 * hat — keine, die aus dem Netz geschätzt wurde.
 *
 * @param {{bauform, guete}} einordnung  Ergebnis aus `bestimme()`
 * @param {object} opts
 * @param {string} [opts.gruppe]   nur diese Gruppe
 * @param {Array}  [opts.katalog]  für Tests
 */
export function passende(einordnung, { gruppe = null, katalog = BEARBEITUNGEN, typprofil = null } = {}) {
    const bauform = einordnung?.bauform ?? null;
    const guete = einordnung?.guete ?? 'unbekannt';
    return katalog.filter((b) => {
        // DIE ROLLE IST DER ZWEITE FILTER — und der eigentlich skalierbare.
        //
        // `bauform` fragt: welche FORM hat das Bauteil? Davon gibt es acht.
        // `brauchtRolle` fragt: kennt dieser TYP diese Größe überhaupt? Davon
        // gibt es beliebig viele, und die Antwort steht als DATEN im Typprofil,
        // nicht als Verzweigung hier.
        //
        // Beispiel: „Bezugshöhe setzen" braucht die Rolle `sohlhoehe`. Am Rohr
        // heißt sie „Sohlhöhe", am Bordstein „Oberkante" — dieselbe Operation,
        // derselbe Programmcode, zwei Beschriftungen. Und ein IFC-Typ, den
        // niemand vorhergesehen hat, bekommt sie, sobald irgendein Typprofil
        // über ihm im Vererbungsbaum die Rolle nennt. Ohne Auslieferung.
        // `brauchtRolle` darf MEHRERE Rollen nennen — dann müssen alle da
        // sein. „Sohlhöhen festlegen" braucht Anfang UND Ende; eine davon
        // allein ergibt kein Gefälle. Dieselbe Erweiterung wie bei `bauform`,
        // die auch als Liste geschrieben werden darf.
        if (b.brauchtRolle) {
            const noetig = Array.isArray(b.brauchtRolle) ? b.brauchtRolle : [b.brauchtRolle];
            if (!noetig.every(r => typprofil?.felder?.[r])) return false;
        }
        if (gruppe && b.gruppe !== gruppe) return false;
        // ERZEUGEN HAT KEIN SUBJEKT. Die Trennlinie ist nicht der Elementtyp,
        // sondern die Frage „woran hängt die Operation?" — Bearbeiten immer an
        // einem Bauteil (Klick), Erzeugen an nichts (Werkzeugleiste). Ohne
        // diese Zeile böte das Kontextmenü am Rohr „Linie zeichnen" an, und
        // das gezeichnete Ergebnis hätte mit dem angeklickten Rohr nichts zu
        // tun. `einstieg` steht seit 9.0 in GRUPPEN und wird hier endlich
        // benutzt, statt ein zweites Mal beschrieben zu werden.
        if (!gruppe && GRUPPEN[b.gruppe]?.einstieg === 'werkzeug') return false;
        if (b.bauform !== '*') {
            // Eine Liste ist erlaubt: „Bezugshöhe setzen" gilt für die Achse
            // (Rohrsohle) UND für den Körper (Schachtsohle). Das ist keine
            // Aufweichung der Bauform-Idee — die Operation hängt weiter an der
            // FORM, nur eben an zweien.
            const erlaubt = Array.isArray(b.bauform) ? b.bauform : [b.bauform];
            if (!bauform || !erlaubt.includes(bauform)) return false;
        }
        if (!guetegenuegt(guete, b.mindestGuete ?? 'unbekannt')) return false;
        if (typeof b.gilt === 'function' && !b.gilt(einordnung)) return false;
        return true;
    });
}

/** Bearbeitungen einer Gruppe, unabhängig von einer Auswahl (Werkzeugleiste). */
export function ausGruppe(gruppe, katalog = BEARBEITUNGEN) {
    return katalog.filter(b => b.gruppe === gruppe);
}

/** Eine Bearbeitung nach Id. */
export function nachId(id, katalog = BEARBEITUNGEN) {
    return katalog.find(b => b.id === id) ?? null;
}

/**
 * Die Felder einer Bearbeitung für ein konkretes Bauteil auflösen.
 *
 * Der Katalog nennt eine ROLLE (`ausTypprofil: 'profilGroesse'`) und einen
 * Rückfall; das Typprofil des Bauteils liefert Beschriftung, Einheit und
 * Grenzen. So heißt dasselbe Feld am Rohr „DN" und am Träger „Profilreihe",
 * ohne dass irgendwo nach Typ verzweigt würde.
 */
export function felderFuer(bearbeitung, typprofil = null) {
    return (bearbeitung?.felder ?? []).map((feld) => {
        const aufgeloest = feld.ausTypprofil
            ? feldAusProfil(feld.ausTypprofil, typprofil, feld.rueckfall ?? null)
            : (feld.rueckfall ?? feld);
        return { name: feld.name, ...(aufgeloest ?? {}) };
    });
}

/**
 * Fehlt ein Pflichtwert oder liegt einer außerhalb seiner Grenze?
 * @returns {string[]} leere Liste heißt „in Ordnung"
 */
export function pruefe(felder, werte) {
    const fehler = [];
    for (const feld of felder) {
        const wert = werte?.[feld.name];
        const leer = wert === null || wert === undefined || wert === '';
        if (leer) {
            if (!feld.leerErlaubt) fehler.push(`${feld.name}: fehlt`);
            continue;
        }
        if (feld.typ === 'zahl') {
            const z = Number(wert);
            if (!Number.isFinite(z)) { fehler.push(`${feld.name}: keine Zahl`); continue; }
            if (feld.min != null && z < feld.min) fehler.push(`${feld.name}: kleiner als ${feld.min}`);
            if (feld.max != null && z > feld.max) fehler.push(`${feld.name}: größer als ${feld.max}`);
        }
        if (feld.typ === 'auswahl' && Array.isArray(feld.optionen) && feld.optionen.length) {
            if (!feld.optionen.some(o => o.wert === wert)) fehler.push(`${feld.name}: nicht in der Auswahl`);
        }
    }
    return fehler;
}
