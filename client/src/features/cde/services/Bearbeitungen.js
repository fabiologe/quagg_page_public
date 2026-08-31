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
import { feldAusProfil } from './bauform/Typprofile.js';
import { DIN277_CLASSES } from './Din277Classifier.js';
import { KG_DEFAULT_RULES } from './Din276Defaults.js';

/** Die Gruppen ordnen die Einstiege — nicht die Bauteile. */
export const GRUPPEN = Object.freeze({
    merkmale:   { titel: 'Merkmale',   icon: 'info',          einstieg: 'auswahl' },
    parametrik: { titel: 'Maße',       icon: 'measure',       einstieg: 'auswahl' },
    lage:       { titel: 'Lage',       icon: 'pointer',       einstieg: 'auswahl' },
    erzeugen:   { titel: 'Erzeugen',   icon: 'add',           einstieg: 'werkzeug' },
});

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
        rezept: rezept.id,
        mindestPunkte: rezept.mindestPunkte,
        geschlossen: rezept.geschlossen,
        felder: rezept.felder.map(f => ({ ...f, rueckfall: { ...f } })),
        vorbelegung: () => ({ name: '', kategorie: rezept.kategorieVorgabe, hoehe: 0 }),
        anwenden: (el, werte) => erzeugtEintrag({
            rezept: rezept.id,
            kategorie: werte.kategorie,
            name: werte.name ?? '',
            parameter: { punkte: alsRaumpunkte(el?.punkte, werte.hoehe) },
        }),
    };
}

export const BEARBEITUNGEN = Object.freeze([
    ...Object.values(REZEPTE).map(zeichenBearbeitung),
    {
        id: 'kg-setzen',
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
        // Ohne belastbare Form ist eine Höhenfestlegung eine Behauptung.
        mindestGuete: 'geschaetzt',
        brauchtRolle: 'sohlhoehe',
        art: 'lage',
        felder: [{
            name: 'hoehe',
            ausTypprofil: 'sohlhoehe',
            rueckfall: { titel: 'Bezugshöhe', einheit: 'm', typ: 'zahl' },
        }],
        vorbelegung: (el) => ({ hoehe: _rundeM(el?.bezugshoehe ?? el?.anker?.y ?? 0) }),
        anwenden: (el, werte) => {
            const anker = el?.anker ?? null;
            if (!anker) return null;
            // Der Anker ist die Hüllenmitte, die Bezugshöhe die Unterkante.
            // Verschoben wird um die DIFFERENZ, nicht auf den Wert — sonst
            // säße die Mitte auf der Sohle und das Bauteil läge zu hoch.
            const jetzt = el?.bezugshoehe ?? anker.y;
            return { art: 'lage', globalId: el.globalId,
                     nachher: { x: anker.x, y: anker.y + (Number(werte.hoehe) - jetzt), z: anker.z } };
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
            nachher: { rolle: 'profilGroesse', wert: werte.groesse },
        }),
    },
    {
        id: 'din277-setzen',
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
        if (b.brauchtRolle && !typprofil?.felder?.[b.brauchtRolle]) return false;
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
