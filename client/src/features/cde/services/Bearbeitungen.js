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

import { BAUFORMEN, guetegenuegt } from './bauform/Bauformen.js';
import { REZEPTE, ableitungsSchritte, erzeugtEintrag, rezeptNach, drehePunktliste, spiegelePunktliste, schwerpunktXZ,
         versetzePunktliste, trimmePunktliste, teilePunktlisteAnStation, teileRingMitGerade, vereinigeRinge,
         modellVon, istAnzeigeform, rezeptFuerNetzrolle, operationenMitKennung } from './Bauteilrezepte.js';
import { vorgangstitel } from './ableitung/Bezuege.js';
import { MASSNAHMEN } from './Sanierung.js';
import { nnAusWelt, weltAusNn } from './Hoehenbezug.js';
import { feldAusProfil } from './bauform/Typprofile.js';
import { DIN277_CLASSES } from './Din277Classifier.js';
import { KG_DEFAULT_RULES, kgOptionen } from './Din276Defaults.js';

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

import { AUFLOCKERUNG, AUFLOCKERUNG_FELD, WANDFORMEN, BODENKLASSEN, GRABENREGELN, auflockerungFuer, auflockerungOder, schaechteAnKanten } from './gelaende/Grabenregeln.js';
import { hatInnenring, innenEcken, innenFeld, randFuerInnenecke } from './gelaende/Innenecken.js';
// Die Bauformen, an denen eine Aussparung fachlich geht — DIE Liste des
// Rezepts, nicht eine Kopie daneben (Gesetz 7).
import { achsmassAus } from './geometrie/hilfen.js';

import { ACHSBEZUEGE, sohleAnAchse } from './Achsbezug.js';
import { gefaelle, punkteDerAchse } from './geometrie/Stationierung.js';
import { kantenbezugNeu } from './JournalFormat.js';
import { eigenschaftenVon, fehlendeEigenschaften, verlangtVon } from './eigenschaften/Eigenschaftsarten.js';
import { registerStand, registrierte } from './rezept/Register.js';
import { GELAENDE_OPS } from './gelaende/Operationen.js';
import { regeltabelle, regelwert } from './regeln/Regelwerk.js';

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

/** Die Länge einer Bauplan-Punktliste (Summe der Abschnitte, XYZ). */
function _bauplanLaenge(el) {
    const p = el?.stand?.bauplan?.parameter?.punkte;
    if (!Array.isArray(p) || p.length < 2) return 0;
    let l = 0;
    for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
    return l;
}

/**
 * Einen Stützpunkt bei `station` (m ab Anfang, entlang der Abschnitte) in eine
 * Punktliste einfügen — oder null, wenn die Station daneben liegt. Bei einer
 * geschlossenen Fläche zählt auch der Schlussabschnitt zurück zum ersten Punkt.
 */
function _stationEinfuegen(punkte, station, geschlossen = false) {
    const s = Number(station);
    if (!Array.isArray(punkte) || punkte.length < 2 || !Number.isFinite(s) || s <= 0.01) return null;
    const kette = geschlossen ? [...punkte, punkte[0]] : punkte;
    let gelaufen = 0;
    for (let i = 1; i < kette.length; i++) {
        const a = kette[i - 1], b = kette[i];
        const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (d < 1e-9) continue;
        if (s < gelaufen + d - 0.01) {
            const t = (s - gelaufen) / d;
            const neu = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
            const aus = [...punkte];
            // i ist der Index in `kette`; beim geschlossenen Ring ist der
            // letzte Abschnitt (i === punkte.length) das Anhängen ans Ende.
            aus.splice(Math.min(i, punkte.length), 0, neu);
            return aus;
        }
        gelaufen += d;
    }
    return null;
}

/** Ein Raumpunkt als Zahlenpaar-Tripel, wie die Rezepte es lesen. */
/**
 * Die Anschlüsse eines Schachts nachführen, wenn er wandert — EINE Logik für
 * „Schacht verschieben" und „Verschieben": als FORDERUNG (der neue
 * Anschlusspunkt wird festgeschrieben, die Geometrie bleibt beim Planer) oder
 * WIRKLICH (löschen und mit verschobenem Ende neu bauen — dieselbe Mechanik
 * wie beim Teilen). Gibt nur die ZUSÄTZLICHEN Einträge zurück.
 */
/**
 * Die angeschlossenen Haltungen einem verschobenen Schacht nachführen.
 *
 * DAS NAHE ENDE WANDERT UM DAS DELTA — nicht auf den Zielpunkt des Ankers.
 *
 * Das war der Unterschied zwischen „Netz bleibt heil" und „Netz reisst".
 * Der ANKER ist der Bezugspunkt der Hülle (Box-Mitte), der NETZKNOTEN ist
 * der Sohlpunkt der Achse — dieselbe Unterscheidung, die schon beim
 * Höhenversatz 10,21 m gekostet hat. Bei den ENQUIER-Schächten liegen die
 * beiden 10 mm auseinander. Wer die Rohrenden auf den ANKER setzt, legt
 * sie also 10 mm neben den Knoten; die Netztoleranz ist 1 mm, und damit
 * war der Schacht nach dem Mitführen topologisch allein: gemessen 4
 * Anschlüsse vorher, 0 nachher, und mit ihnen fielen Strang, Fang,
 * Prüfliste und Kanalgraben an dieser Stelle aus.
 *
 * Mit dem DELTA bleibt jede Beziehung erhalten, die vorher bestand — auch
 * eine, die schon vorher nicht exakt sass: verschoben wird die ganze
 * Nachbarschaft starr, nicht auf einen neu berechneten Punkt.
 */
function _anschluesseNachfuehren(el, werte, { ost, nord, zielX, zielZ }) {
    const dxN = zielX - (el?.anker?.x ?? 0);
    const dzN = zielZ - (el?.anker?.z ?? 0);
    const anschluesse = el?.anschluesse ?? [];
    const eintraege = [];
    if (werte?.mitfuehren !== 'wirklich') {
        for (const k of anschluesse) {
            eintraege.push({
                art: 'parametrik', globalId: k.globalId,
                nachher: { anschlusspunkt: { ende: k.ende, ost: _rundeM(ost), nord: _rundeM(nord) } },
            });
        }
        return eintraege;
    }
    for (const k of anschluesse) {
        const bleibt = k.ende === 'anfang' ? k.ende_ : k.anfang;
        const wandert = k.ende === 'anfang' ? k.anfang : k.ende_;
        // Um das Delta, nicht auf den Anker (siehe Kopf).
        const neu = { x: wandert.x + dxN, y: wandert.y, z: wandert.z + dzN };
        const punkte = k.ende === 'anfang'
            ? [_alsTripel(neu), _alsTripel(bleibt)]
            : [_alsTripel(bleibt), _alsTripel(neu)];
        eintraege.push({ art: 'geloescht', globalId: k.globalId, nachher: true });
        eintraege.push(erzeugtEintrag({
            rezept: rezeptFuerNetzrolle('kante'),
            kategorie: k.kategorie ?? 'IFCPIPESEGMENT',
            name: k.name ?? '',
            // Das mitgeführte Ende hängt am verschobenen Knoten — und nennt ihn (K8).
            parameter: _mitAnschluss(_kanteAusFremdenHoehen(punkte, k.dn ?? 300, punkte.map(() => k)),
                                     { [k.ende === 'anfang' ? 'anfang' : 'ende']: el.globalId }),
        }));
    }
    return eintraege;
}

/**
 * Die Parameter eines ersetzten Netzteils (Teil XXIII, A5).
 *
 * Ein EIGENES Bauteil, das sein Rezept behält (dieselbe Rolle im Netz),
 * behält auch seine Parameter — Profil, Vorlagenbezug (A1) —, nur die Punkte
 * sind neu. Bis hierher stand fest `{ punkte, dn }`: ein Rechteckkanal aus der
 * Bibliothek verlor beim Teilen Breite und Höhe, ein Rohr aus einer Vorlage
 * seinen Bezug. Ein GELIEFERTES Bauteil hat keine Parameter — es bekommt,
 * was die Achse weiss.
 */
function _netzParameter(bauplan, rolle, punkte, dn, quelle = null) {
    const behaelt = !!bauplan?.rezept && rezeptNach(bauplan.rezept)?.netzrolle === rolle;
    // Behält es sein Rezept, stammen die Punkte von SEINER Achse — sie stehen
    // schon in seinem Bezug, und `achsbezug` kommt mit den Parametern mit.
    if (behaelt) return { ...bauplan.parameter, punkte };
    return rolle === 'kante'
        ? _kanteAusFremdenHoehen(punkte, dn ?? 300, punkte.map(() => quelle))
        : { punkte, dn: dn ?? 300 };
}

/**
 * Eine NEUE eigene Kante aus Punkten fremder Achsen (Teil XXIV, K4).
 *
 * Die Höhen stammen von einer anderen Achse — einer gelieferten (isyifc
 * schreibt sie auf Sohlniveau, eine Extrusion liegt in der Rohrmitte) oder
 * einer eigenen (ihr Bauplan sagt es). Bis K4 gingen sie roh in den neuen
 * Bauplan, und der gilt ohne Angabe als Rohrmitte: „Haltung teilen" an
 * einer gelieferten isyifc-Haltung legte die Teile DN/2 zu tief. Jetzt wird
 * jede Höhe mit dem Bezug IHRER Achse zur Sohle, und die Kante speichert sie
 * im Bezug der Schreibstufe (`kantenbezugNeu`).
 *
 * Sagt eine Quelle nichts über ihren Bezug, bleibt es beim bisherigen Lesen
 * (Rohrmitte) — eine Achse ohne Angabe soll nicht still wandern.
 *
 * @param {Array<[x,y,z]>} punkte
 * @param {Array<object|null>} quellen  je Punkt die Achse, von der seine Höhe stammt
 */
function _kanteAusFremdenHoehen(punkte, dn, quellen) {
    const neu = { punkte, dn };
    const sohlen = rezeptNach(rezeptFuerNetzrolle('kante'))?.sohlen;
    if (!sohlen) return neu;
    // Kennt die Quelle ihr DN nicht, gilt das der neuen Kante — sonst rechnete
    // die Sohle mit r = 0 und das Speichern mit r, und das Rohr stiege um r.
    return sohlen.speichere(neu, punkte.map((p, i) => sohleAnAchse(p[1], { ...quellen[i], dn: quellen[i]?.dn ?? dn }, { vorgabe: 'mitte' })),
                            { bezug: kantenbezugNeu() });
}

function _alsTripel(p) {
    return [p.x, p.y, p.z];
}

/**
 * DER ANSCHLUSS EINES STÜCKS (Teil XXIV, K8). Aus einer Kante werden Stücke
 * (Teilen, Schacht einfügen): jedes Stück behält nur, was an SEINEM Ende
 * stimmt — `anfang` vom ersten Stück, `ende` vom letzten, dazwischen der neue
 * Knoten (oder keiner). Eine Kopie nennt gar keinen: sie liegt woanders, und
 * eine erklärte Verbindung zum alten Schacht wäre eine falsche Aussage.
 */
function _mitAnschluss(parameter, anschluss) {
    const { anschluss: _alt, ...rest } = parameter ?? {};
    const neu = Object.fromEntries(Object.entries(anschluss ?? {}).filter(([, g]) => typeof g === 'string' && g));
    return Object.keys(neu).length ? { ...rest, anschluss: neu } : rest;
}
const _ohneAnschluss = (parameter) => _mitAnschluss(parameter, null);

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

/**
 * Die Kostengruppen als Auswahl — Code UND Wortlaut aus dem ganzen Baum
 * (Abnahme 2026-09-12: „bei Kostengruppen reicht es nicht, die Zahl zu
 * schreiben"; 511 fehlte vorher ganz). Ein Code, den nur eine Regel kennt,
 * bleibt wählbar.
 */
function _kgOptionen() {
    const optionen = kgOptionen();
    const bekannt = new Set(optionen.map(o => o.wert));
    for (const regel of KG_DEFAULT_RULES) {
        const code = regel?.kgCode ? String(regel.kgCode) : null;
        if (code && !bekannt.has(code)) { optionen.push({ wert: code, titel: code }); bekannt.add(code); }
    }
    return optionen;
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
 * SETZER ALS DATEN (Teil XXIII, A6; Befund B7).
 *
 * Ein Werkzeug, das einen Wert ins Journal schreibt, ist Muster (Formular) +
 * allgemeine Operation + Katalogeintrag (Rolle, Merkmal) — kein eigener Code.
 * Die Deklaration nennt `setzt: { art, … }`; `werkzeugAusSetzer` macht daraus
 * `vorbelegung` und `anwenden`. Vier Operationen tragen elf Werkzeuge:
 *
 *   mass      Grössen je Rolle als Festlegung (`parametrik`), faltet je Rolle;
 *             mit `amOrt: '<feld>'` (O6) setzt das eine Feld die Rolle, deren
 *             Ort (`ort` je Wert) am getippten Punkt liegt — die Sohle am
 *             Schacht, gezogen im Längsschnitt oder getippt im Raum
 *   merkmal   ein Wert unter seiner Journalart (kg, din277, massnahme, bauform,
 *             geloescht) — leer heisst zurücknehmen
 *   benennen  Name nach Muster, bei Mehrfachauswahl durchnummeriert
 *   hoehe     die Lage um die Differenz der Bezugshöhe verschieben
 *   parameter ein Parameter eines EIGENEN Bauteils (Rezeptfeld `setzbar`) —
 *             ein neuer Bauplan unter derselben Kennung
 *   satz      ein Eintrag einer Karte unter seinem Namen (der Merkmalssatz,
 *             O6) — die übrigen Sätze bleiben, wie sie gelten
 */
const _VORBELEGUNG_WELT = Object.freeze({
    // Welt-y oder null — umgerechnet in m NN wird beim Vorbelegen.
    // Die SOHLE der Achse (Teil XXIV, K4): mit ihrem Bezug. Bis K4 stand die
    // rohe Achshöhe im Feld „Sohle" — bei eigenen Haltungen und Achsen aus
    // der Extrusion die Rohrmitte (Messbefund E7).
    'achse.anfang': (el) => (el?.achse?.anfang ? sohleAnAchse(el.achse.anfang.y, el.achse) : null),
    'achse.ende': (el) => (el?.achse?.ende ? sohleAnAchse(el.achse.ende.y, el.achse) : null),
    // Der Deckel ist die Oberkante der Hülle; ohne sie der Anker, ohne ihn 0.
    'oberkante': (el) => el?.oberkante ?? el?.anker?.y ?? 0,
});

/**
 * EIGENES WIRD ECHT (Teil XXIV, K4). Ein Setzer, der `amBauplan` nennt, schreibt
 * an einem eigenen Bauteil, dessen Rezept diese Fähigkeit hat, den BAUPLAN
 * fort statt einer Forderung. Das Rezept entscheidet, nicht der Bauteiltyp
 * (Abgleich A2, U7: „Sohlhöhen festlegen" war an einer eigenen Haltung eine
 * Forderung, die niemand las — und die Kur, die der Gefällebefund nannte,
 * eine Schleife ohne Wirkung).
 */
function _amBauplan(s, el) {
    const plan = el?.stand?.bauplan;
    const faehigkeit = s?.amBauplan && plan?.rezept ? rezeptNach(plan.rezept)?.[s.amBauplan] : null;
    return faehigkeit ? { plan, faehigkeit } : null;
}

/** Schreibt dieses Werkzeug an diesem Bauteil den Bauplan fort statt einer Forderung? (Hinweis in der Kontextleiste.) */
export function schreibtAmBauplan(werkzeug, el) {
    return !!_amBauplan(werkzeug?.setzt, el);
}

/**
 * WO EINE ROLLE SITZT (O6): der Ort am Subjekt, an dem ihr Wert gilt — die
 * Sohle Anfang am Anfang der Achse. Nur Lage (x, z); die Höhe ist der Wert.
 */
const _ORTE = Object.freeze({
    'achse.anfang': (el) => el?.achse?.anfang ?? null,
    'achse.ende': (el) => el?.achse?.ende ?? null,
});

/**
 * Welche Rolle am Punkt `p` sitzt: die, deren Ort ihm in der Draufsicht am
 * nächsten liegt — und das höchstens so weit, wie das Netz zwei Enden noch
 * für DENSELBEN Ort hält (`netzToleranzM`). Kein Radius zum Fangen: bei
 * Mehrfachauswahl zöge ein Fangradius die Haltung am Nachbarschacht mit.
 */
function _rolleAmOrt(s, el, p) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    let beste = null, abstand = Infinity;
    for (const w of s.werte) {
        const o = _ORTE[w.ort]?.(el);
        if (!o) continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < abstand) { abstand = d; beste = w; }
    }
    return beste && abstand <= regelwert('netzToleranzM') ? beste : null;
}

/**
 * Das Feld am Ort schreiben (O6). Eigenes: nur DIESES Ende — der Bauplan
 * behält das andere exakt (dieselbe Fähigkeit `sohlen` wie „Sohlhöhen
 * festlegen"). Geliefertes: die volle Rollenkarte (Gesetz 4), das andere
 * Ende mit seiner WIRKSAMEN Höhe — so schrieb der Längsschnitt-Zug seit 17.2.
 */
function _massAmOrt(s, el, werte, { zug = [] } = {}) {
    const w = _rolleAmOrt(s, el, zug[0]);
    if (!w) return null;
    const ohneOrt = { ...s, amOrt: undefined };
    const wert = werte?.[s.amOrt];
    if (_amBauplan(s, el)) return SETZ_OPERATIONEN.mass.schreibe({ ...ohneOrt, werte: [w] }, el, { [w.feld]: wert });
    const jetzt = Object.fromEntries(s.werte.map(x => [x.feld, _vorbelegtMass(x, el, null)]));
    return SETZ_OPERATIONEN.mass.schreibe(ohneOrt, el, { ...jetzt, [w.feld]: wert });
}

/** Die zwei Sohlen einer Haltung — je Rolle ihr Feld, ihr Ort und was ohne Festlegung gilt. */
const SOHLEN_WERTE = Object.freeze([
    { feld: 'anfang', rolle: 'sohlhoeheAnfang', ort: 'achse.anfang', zahl: true, runden: true, sonst: { welt: 'achse.anfang', leer: 0 } },
    { feld: 'ende', rolle: 'sohlhoeheEnde', ort: 'achse.ende', zahl: true, runden: true, sonst: { welt: 'achse.ende', leer: 0 } },
]);

function _vorbelegtMass(w, el, echt = null) {
    // Am eigenen Bauplan gilt der Bauplan — eine alte Forderung daneben
    // (vor K4 geschrieben) wird nicht mehr gelesen, sie wirkte nie.
    const stand = echt ? null : el?.stand?.[w.rolle];
    let wert = stand ?? null;
    if (wert == null && w.sonst) {
        const welt = _VORBELEGUNG_WELT[w.sonst.welt]?.(el) ?? null;
        wert = welt == null ? (w.sonst.leer ?? null) : nnAusWelt(welt, el?.hoehenversatz ?? 0);
    }
    if (wert == null && w.werte) wert = w.werte[0];
    return w.runden && wert != null ? _rundeM(wert) : wert;
}

const SETZ_OPERATIONEN = Object.freeze({
    mass: {
        vorbelege: (s, el) => {
            // Am Ort: welche Rolle es wird, sagt erst der Punkt — das Feld bleibt leer.
            if (s.amOrt) return { [s.amOrt]: null };
            const echt = _amBauplan(s, el);
            return Object.fromEntries(s.werte.map(w => [w.feld, _vorbelegtMass(w, el, echt)]));
        },
        schreibe: (s, el, werte, kontext) => {
            if (s.amOrt) return _massAmOrt(s, el, werte, kontext);
            const echt = _amBauplan(s, el);
            if (echt) {
                // Die Felder sind Höhen in m NN — die Fähigkeit nimmt sie in der Welt.
                const welt = {};
                for (const w of s.werte) {
                    const z = Number(werte?.[w.feld]);
                    if (!Number.isFinite(z)) return null;
                    welt[w.feld] = weltAusNn(z, el?.hoehenversatz ?? 0);
                }
                const parameter = echt.faehigkeit.enden(echt.plan.parameter, welt, { bezug: kantenbezugNeu() });
                if (!parameter) return null;
                return erzeugtEintrag({
                    rezept: echt.plan.rezept, kategorie: echt.plan.kategorie, name: echt.plan.name ?? '',
                    globalId: el.globalId, parameter,
                });
            }
            const nachher = {};
            for (const w of s.werte) {
                const roh = werte?.[w.feld];
                if (w.zahl) {
                    const z = Number(roh);
                    if (!Number.isFinite(z)) return null;
                    nachher[w.rolle] = z;
                } else if (w.werte) {
                    nachher[w.rolle] = w.werte.includes(roh) ? roh : w.werte[0];
                } else {
                    nachher[w.rolle] = roh;
                }
            }
            return { art: 'parametrik', globalId: el.globalId, nachher };
        },
        warumNicht: (s, el, _werte, { zug = [] } = {}) => ((s.amOrt && zug.length && !_rolleAmOrt(s, el, zug[0]))
            ? `${el?.name || el?.globalId || 'Das Bauteil'}: kein Ende liegt am Punkt — gesetzt wird nur, was dort anschliesst.`
            : null),
    },
    satz: {
        // Welcher Satz, sagt erst die Eingabe — leer vorbelegt.
        vorbelege: (s) => ({ [s.name]: '', [s.feld]: {} }),
        schreibe: (s, el, werte) => {
            const name = String(werte?.[s.name] ?? '').trim();
            // Der Inhalt ist, was das Fenster liefert — beim Merkmalssatz die Liste
            // `[{name, value}]` aus dem Pset-Browser. Nur „nichts" wird nicht geschrieben.
            const inhalt = werte?.[s.feld];
            if (!name || inhalt == null || typeof inhalt !== 'object') return null;
            // Voller Zielzustand im Eintrag: alle Sätze, dieser neu (Lücke ⑧, 2026-09-02).
            return { art: s.journal, globalId: el.globalId, nachher: { ...(el?.stand?.[s.standFeld] ?? {}), [name]: inhalt } };
        },
    },
    merkmal: {
        vorbelege: (s, el) => (s.feld ? { [s.feld]: el?.stand?.[s.standFeld ?? s.feld] ?? null } : {}),
        schreibe: (s, el, werte) => ({ art: s.journal, globalId: el.globalId,
                                       nachher: 'wert' in s ? s.wert : (werte?.[s.feld] || null) }),
    },
    benennen: {
        vorbelege: (s, el) => ({ [s.muster]: el?.name ?? '', [s.beginn]: 1 }),
        schreibe: (s, el, werte, { nummer = 0 } = {}) => {
            const name = nameAusMuster(werte?.[s.muster], {
                nummer: (Number(werte?.[s.beginn]) || 0) + nummer, alt: el.name ?? '',
            });
            return name ? { art: 'bezeichnung', globalId: el.globalId, nachher: name } : null;
        },
    },
    hoehe: {
        // ANGEZEIGT UND EINGEGEBEN WIRD IN WIRKLICHEN HÖHEN (m NN), gerechnet
        // in der Three-Welt (`Hoehenbezug.js`).
        vorbelege: (s, el) => ({
            [s.feld]: _rundeM(nnAusWelt(el?.bezugshoehe ?? el?.anker?.y ?? 0, el?.hoehenversatz ?? 0)),
        }),
        schreibe: (s, el, werte) => {
            const anker = el?.anker ?? null;
            if (!anker) return null;
            // Der Anker ist die Hüllenmitte, die Bezugshöhe die Unterkante.
            // Verschoben wird um die DIFFERENZ, nicht auf den Wert — sonst
            // säße die Mitte auf der Sohle und das Bauteil läge zu hoch.
            const jetzt = el?.bezugshoehe ?? anker.y;
            const ziel = weltAusNn(Number(werte?.[s.feld]), el?.hoehenversatz ?? 0);
            return { art: 'lage', globalId: el.globalId,
                     nachher: { x: anker.x, y: anker.y + (ziel - jetzt), z: anker.z } };
        },
    },
    parameter: {
        vorbelege: (s, el) => ({ [s.feld]: el?.stand?.bauplan?.parameter?.[s.feld] ?? null }),
        schreibe: (s, el, werte) => {
            const plan = el?.stand?.bauplan;
            if (!plan || plan.rezept !== s.rezept) return null;
            const roh = werte?.[s.feld];
            const wert = s.zahl ? Number(roh) : roh;
            if (s.zahl && !Number.isFinite(wert)) return null;
            if (plan.parameter?.[s.feld] === wert) return null;           // nichts zu tun
            // DIE SOHLE BLEIBT (Teil XXIV, K4): ein grösseres DN an einer
            // Haltung in Rohrmitte hob sonst ihre Sohle um die halbe Differenz.
            const sohlen = rezeptNach(plan.rezept)?.sohlen;
            const parameter = sohlen
                ? sohlen.speichere({ ...plan.parameter, [s.feld]: wert }, sohlen.lies(plan.parameter), { bezug: kantenbezugNeu() })
                : { ...plan.parameter, [s.feld]: wert };
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                globalId: el.globalId, parameter,
            });
        },
    },
});

/** Aus einer Setzer-Deklaration wird ein Werkzeug — `vorbelegung` und `anwenden` aus der Operation. */
function werkzeugAusSetzer(d) {
    const op = SETZ_OPERATIONEN[d.setzt?.art];
    if (!op) throw new Error(`Setzer „${d.id}": Operation „${d.setzt?.art}" gibt es nicht`);
    return {
        ...d,
        vorbelegung: (el) => op.vorbelege(d.setzt, el),
        // OHNE KENNUNG KEIN EINTRAG — eine Regel für alle Setzer (vorher gab
        // es zwei: fünf lieferten null, sechs einen Eintrag mit leerer
        // Kennung). Bei Mehrfachauswahl zählt der Store das als übersprungen,
        // allein nennt er den Grund aus `warumNicht`.
        anwenden: (el, werte, kontext) => (el?.globalId ? op.schreibe(d.setzt, el, werte, kontext) : null),
        warumNicht: (el, werte, kontext) => (el?.globalId
            ? (op.warumNicht?.(d.setzt, el, werte, kontext) ?? null)
            : 'Dem Bauteil fehlt die GlobalId — es lässt sich nicht eintragen.'),
    };
}

/**
 * Die Setzer eines Rezepts: je Feld mit `setzbar: true` eins (A6) — damit
 * bekommt ein Rezept aus der Bibliothek seine Bearbeitung ohne Code. Nur an
 * EIGENEN Bauteilen DIESES Rezepts; es entsteht ein neuer Bauplan unter
 * derselben Kennung, die Geometrie folgt beim Neuaufbau.
 */
function setzerFuerRezept(rezept) {
    return (rezept?.felder ?? []).filter(f => f?.setzbar).map(f => werkzeugAusSetzer({
        id: `${rezept.id}-${f.name}-setzen`,
        titel: `${f.titel ?? f.name} ändern`,
        icon: rezept.icon ?? 'edit',
        gruppe: 'parametrik',
        bauform: '*',
        mindestGuete: 'unbekannt',
        nurEigene: true,
        nurRezept: rezept.id,
        ausRezept: rezept.id,
        art: 'erzeugt',
        felder: [{ ...f, leerErlaubt: false }],
        setzt: { art: 'parameter', feld: f.name, zahl: f.typ === 'zahl', rezept: rezept.id },
    }));
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
        // Aus Muster + Katalogeintrag ERZEUGT — der Architektur-Wächter (W7)
        // ordnet es darüber ein, nicht über eine Namensliste.
        ausRezept: rezept.id,
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
        // HÖCHSTENS (A4): ein Pfosten steht an EINEM Ort — mit dem Tipp ist der
        // Zug voll. Dieselbe Erklärung, mit der „An Schacht anschliessen" seinen
        // einen Punkt nennt; die Musterschicht kennt sie schon.
        ...((rezept.hoechstPunkte || rezept.netzrolle === 'kante') ? { eingaben: [{
            schlitz: rezept.geschlossen ? 'umriss' : 'zug',
            ...(rezept.hoechstPunkte ? { anzahl: { min: rezept.mindestPunkte, max: rezept.hoechstPunkte } } : {}),
            // EINE KANTE FÄNGT AUF KNOTEN (Teil XXIV, K9): ein gezeichneter
            // Punkt nahe einem Schacht springt auf dessen Mitte — sonst fiele
            // das Netz über die 1-mm-Koinzidenz nur zufällig zusammen. Fachblind:
            // die Netzrolle des Rezepts entscheidet, nicht sein Name.
            ...(rezept.netzrolle === 'kante' ? { fang: 'knoten' } : {}),
        }] } : {}),
        // Teil XIV: Punkte AUF dem Gelände, wenn das Rezept es sagt (Bruchkante).
        hoehenAus: rezept.hoehenAus ?? null,
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
            // Auf dem Gelände bleibt das Feld LEER — die Höhe kommt aus dem
            // Sampler; eine getippte Höhe überstimmt sie (Trasse statt Bruchkante).
            hoehe: rezept.hoehenAus === 'gelaende' ? '' : _rundeM(nnAusWelt(0, el?.hoehenversatz ?? 0)),
            // Was das Rezept als Vorgabe nennt (etwa DN 300). Ohne sie stünde
            // ein Pflichtfeld leer und das Formular wäre ab dem Aufschlagen
            // ungültig — derselbe Fehler wie bei den Festlegungen ohne `stand`.
            ...Object.fromEntries(rezept.felder
                .filter(f => f.vorgabe !== undefined)
                .map(f => [f.name, f.vorgabe])),
        }),
        anwenden: (el, werte) => {
            const roh = el?.punkte ?? [];
            let parameter = {
                // Eine GETIPPTE Höhe gilt für alle Punkte — auch für solche, die
                // vom Gelände eine mitbringen. Leer heisst: das Gelände gilt.
                // AUSSER für einen Punkt, dessen Höhe feststeht (K8): er sitzt auf
                // einem eigenen Schacht und übernimmt dessen Sohle, oder das
                // Kommando nennt seine Höhe ausdrücklich.
                punkte: (werte.hoehe === '' || werte.hoehe === null || werte.hoehe === undefined)
                    ? alsRaumpunkte(roh, 0)
                    : alsRaumpunkte(roh.map(p => (p?.hoeheFest ? p : Array.isArray(p) ? [p[0], NaN, p[2]] : { x: p?.x, z: p?.z })),
                                    weltAusNn(Number(werte.hoehe), el?.hoehenversatz ?? 0)),
                // Alles, was das Rezept sonst noch braucht (DN beim Rohr).
                ...Object.fromEntries(rezept.felder
                    .filter(f => !['name', 'kategorie', 'hoehe'].includes(f.name))
                    .map(f => [f.name, werte[f.name]])),
                // WOHER ES STAMMT (Teil XXIII, A1): aus einer Vorlage gezeichnet
                // trägt das Bauteil deren Id. Kein Formularfeld — der Bezug
                // entsteht beim Start aus der Bibliothek (`vorbelegeAusVorlage`).
                ...(werte.vorlage ? { vorlage: String(werte.vorlage) } : {}),
            };
            // DER ANSCHLUSS (Teil XXIV, K8 — Fabios E6): beginnt oder endet eine
            // KANTE auf einem Knoten, nennt der Bauplan ihn. Das Netz nimmt die
            // Erklärung vor der Koinzidenz; weicht der Ort später ab, ist es ein Befund.
            if (rezept.netzrolle === 'kante') {
                const anschluss = {
                    ...(roh[0]?.knoten ? { anfang: String(roh[0].knoten) } : {}),
                    ...(roh.length > 1 && roh[roh.length - 1]?.knoten ? { ende: String(roh[roh.length - 1].knoten) } : {}),
                };
                if (Object.keys(anschluss).length) parameter.anschluss = anschluss;
            }
            // EINE NEUE KANTE WIRD AUF IHRER SOHLE GEZEICHNET (Teil XXIV, K4 —
            // Fabios E7): die gezeichneten oder getippten Höhen sind Sohlhöhen.
            // Bis K4 lag dort die Rohrmitte, und das Rohr ragte DN/2 unter die
            // Linie, die man gezogen hatte. Gespeichert wird im Bezug der
            // Schreibstufe; die Fähigkeit rechnet um.
            const sohlen = rezeptNach(rezept.id)?.sohlen;
            if (sohlen) {
                parameter = sohlen.speichere(parameter, parameter.punkte.map(p => p[1]), { bezug: kantenbezugNeu() });
            }
            return erzeugtEintrag({
                rezept: rezept.id,
                kategorie: werte.kategorie,
                name: werte.name ?? '',
                parameter,
            });
        },
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
/**
 * Gelände formen = eine ABLEITUNG mit drei Teilen (Teil XIV, G2): Aushub,
 * Auftrag, neues DGM — aus einer Rechnung, in einem Vorgang.
 *
 *   Erstformung   (geliefertes Gelände): Quelle ausblenden + drei Teile.
 *   Jede Anwendung ein EIGENER Vorgang (Teil XX, Fabio 2026-09-10): eigener
 *                 Cut/Fill, eigene Mengen, eigene Gruppe im IFC — gerechnet
 *                 nacheinander im Erdbau-Stapel. Bis hierher hängte sich eine
 *                 Formung an den letzten Vorgang, und Gerinne plus Ausheben
 *                 standen als EIN Cut mit EINER Masse da.
 *   Altbestand    (Subjekt ist ein `gelaende`-Bauteil von vor Teil XIV):
 *                 wird bei der nächsten Formung in die Ableitung überführt —
 *                 die Quelle bleibt das ORIGINAL, die alte Liste läuft mit.
 */

/**
 * EIN KNICKPUNKT EINER OPERATION (Teil XXI, P5) — {op, feld, index, punkt}.
 *
 * Welche Ecken ein Vorgang hat, fragt das Werkzeug das REZEPT
 * (`punktlisten`, Teil XXIII A2) — nicht eine Tabelle, die es dafür kennen
 * müsste. Ohne Angabe: der erste gefundene Punkt — das ist die Vorbelegung
 * des Formulars.
 */
function _erdbauPunkt(bauplan, op = null, feld = null, index = 0) {
    const listen = rezeptNach(bauplan?.rezept)?.punktlisten?.(bauplan?.parameter) ?? [];
    for (const l of listen) {
        if (op != null && l.op !== Number(op)) continue;
        if (feld && l.feld !== feld) continue;
        if (!l.punkte.length) continue;
        const k = Number(index) || 0;
        const punkt = l.punkte[k];
        if (!punkt || ![punkt.x, punkt.y, punkt.z].every(v => Number.isFinite(Number(v)))) continue;
        return { op: l.op, feld: l.feld, index: k, punkt, liste: l.punkte };
    }
    return null;
}

/**
 * ADRESSEN (Teil XXIV — Fabios E3): Felder, die im Formular eine NUMMER tragen
 * (Stützpunkt, Knickpunkt, Operation), stehen im Kommando als das, was sie
 * meinen — der alte Punkt, die Kennung der Operation. Die Werkzeuge rechnen
 * weiter mit der Nummer; übersetzt wird an der Naht (`kommando/Kommando.js`),
 * je Adressart über die Liste, in die die Nummer zeigt.
 *
 *   stuetzpunkt  Stützpunkte des Bauplans (`parameter.punkte`), Höhe in Welt
 *   knickpunkt   Punkte der Operationsliste, in die das Erdbau-Werkzeug zeigt
 *                (Operation `op`, Liste `feld`) — Höhen dort in m NN
 *   operation    die Operationen des Vorgangs, mit Kennung (K2b)
 */
export const ADRESSEN = Object.freeze({
    stuetzpunkt: {
        hoeheInNn: false,
        liste: (el) => (el?.stand?.bauplan?.parameter?.punkte ?? [])
            .map(p => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p)),
    },
    knickpunkt: {
        hoeheInNn: true,
        liste: (el, werte) => _erdbauPunkt(el?.stand?.bauplan, werte?.op, werte?.feld || null, 0)?.liste ?? [],
    },
    operation: {
        liste: (el) => operationenMitKennung(el?.stand?.bauplan?.parameter?.operationen),
    },
});

/**
 * Den gezogenen Knickpunkt zurückschreiben — als VOLLE Operationsliste über
 * `ableitungsSchritte({bestehend})`, damit alle Teile des Vorgangs denselben
 * Parametersatz behalten.
 */
function _erdbauStuetzpunktSchritte(el, werte) {
    const plan = el?.stand?.bauplan;
    if (!el?.globalId || !plan?.ableitung || !rezeptNach(plan.rezept)?.erdbau) return null;
    const treffer = _erdbauPunkt(plan, werte?.op, werte?.feld || null, werte?.index);
    if (!treffer) return null;
    const ost = Number(werte?.ost), nord = Number(werte?.nord), hoehe = Number(werte?.hoehe);
    if (![ost, nord, hoehe].every(Number.isFinite)) return null;
    const v = el.versatz ?? { x: 0, y: 0, z: 0 };
    let operationen;
    if (werte?.bezug === 'innen') {
        // EINE INNERE ECKE (Teil XXII): Sohle einer Grube, Krone einer
        // Schüttung. Gespeichert wird weiter nur der äussere Umriss — die
        // Höhe des Griffs ist die neue Sohle (Krone) des ganzen Körpers, die
        // Lage wird zur äusseren Ecke zurückgerechnet (Neigung bleibt).
        const op = plan.parameter.operationen[treffer.op];
        if (!hatInnenring(op)) return null;
        const hoehenFeld = innenFeld(op);
        const mitHoehe = { ...op, parameter: { ...op.parameter, [hoehenFeld]: hoehe } };
        // Nur die Höhe gezogen (die Lage ist die der Ecke vorher): der Rand
        // bleibt auf dem Gelände, die Sohle (Krone) wandert — so erwartet man
        // es von „tiefer ausheben". Sonst: der Rand folgt der Ecke.
        const ziel = { x: ost - v.x, z: -nord - v.z };
        const vorher = innenEcken(op)?.[treffer.index] ?? null;
        const nurHoehe = vorher && Math.hypot(vorher.x - ziel.x, vorher.z - ziel.z) < 2e-3;   // Griffwerte sind auf mm gerundet
        const rand = nurHoehe ? { x: treffer.punkt.x, z: treffer.punkt.z } : randFuerInnenecke(mitHoehe, treffer.index, ziel);
        if (!rand) return null;
        const alt = treffer.punkt;
        const hoeheGleich = Math.abs(Number(op.parameter[hoehenFeld]) - hoehe) < 1e-4;
        if (hoeheGleich && Math.abs(alt.x - rand.x) < 1e-4 && Math.abs(alt.z - rand.z) < 1e-4) return null;
        operationen = plan.parameter.operationen.map((o, j) => (j !== treffer.op ? o : {
            ...mitHoehe,
            parameter: { ...mitHoehe.parameter,
                         umriss: treffer.liste.map((p, k) => (k === treffer.index ? { ...p, x: rand.x, z: rand.z } : p)) },
        }));
    } else {
        // Die Höhe bleibt in NN — die Op-Punktlisten tragen sie so.
        const neu = { ...treffer.punkt, x: ost - v.x, y: hoehe, z: -nord - v.z };
        const alt = treffer.punkt;
        if (Math.abs(alt.x - neu.x) < 1e-4 && Math.abs(alt.y - neu.y) < 1e-4 && Math.abs(alt.z - neu.z) < 1e-4) return null;
        operationen = plan.parameter.operationen.map((op, j) => (j !== treffer.op ? op : {
            ...op,
            parameter: { ...op.parameter,
                         [treffer.feld]: treffer.liste.map((p, k) => (k === treffer.index ? neu : p)) },
        }));
    }
    // Die TEILE des Vorgangs: ohne sie bekämen Aushub und Auftrag neue
    // Kennungen, und im Raum stünde der Vorgang doppelt. Sie kommen aus
    // `el.stand.teile` — der Store legt sie beim Einordnen an
    // (`useBearbeitung._standVon`). Bis 2026-09-18 stand hier ein eigenes
    // `vorgangTeile`, das der Viewer nie füllen konnte (er fragte nach
    // `stand`, bevor es den gab): je Zug bekam der Auftrag eine neue Kennung.
    const teile = _teileObjekt(el.stand?.teile);
    return _anModell(ableitungsSchritte({
        rezept: plan.rezept,
        quellen: plan.parameter.quellen ?? {},
        quellBasis: plan.parameter.quellBasis ?? {},
        raster: plan.parameter.raster ?? {},
        operationen,
        auflockerung: plan.parameter.auflockerung ?? null,
        name: _vorgangsStamm(plan.name),
        bestehend: { ableitung: plan.ableitung, teile: teile ?? { [plan.rolle]: { globalId: el.globalId, bauplan: plan } } },
    }), el.modellSha);
}

/** `stand.teile` (Map Rolle → {globalId, bauplan}) als Objekt für `ableitungsSchritte({bestehend})`, oder null. */
function _teileObjekt(teile) {
    if (teile instanceof Map) return teile.size ? Object.fromEntries(teile) : null;
    return teile && typeof teile === 'object' && Object.keys(teile).length ? teile : null;
}

/** Der Name eines Vorgangs ohne den Teil-Anhang — `ableitungsSchritte` hängt ihn neu an. */
function _vorgangsStamm(name) {
    return String(name ?? '').replace(/ · (Aushub|Auftrag|Graben|Verfüllung|Baugrube|Anzeige)$/, '');
}

/**
 * Der Name des Ur-Geländes — ohne die Anhänge, die Anzeige und Alt-Teile
 * tragen. Er wird Namensstamm aller Teile und der Anzeige.
 */
function _urName(el, eb = null, alt = null) {
    const roh = eb?.anzeige?.bauplan?.name ?? alt?.name ?? el?.stand?.bauplan?.name ?? el?.name ?? '';
    return String(roh).replace(/ \((geformt|mit Graben|mit Baugrube|Anzeige)\)$/, '') || 'Gelände';
}

/**
 * VERBERGEN, was die Anzeige ersetzt (Stufe 1): das Ur-Gelände (ausblenden,
 * nie löschen — gilt es schon, schreibt das Journal es nicht noch einmal),
 * dazu jedes eigene Gelände aus der Zeit vor Stufe 1 (`altDgm`, Altbestand
 * `gelaende`), das sonst neben der Anzeige stünde. Die Anzeige selbst nie.
 */
function _verbergen(ur, eb, subjektGid = null) {
    const eigen = (gid) => (modellVon(gid) === 'cde' ? { modell: 'cde' } : {});
    const out = [{ art: 'geloescht', globalId: ur, nachher: true, ...eigen(ur) }];
    const weitere = new Set(eb?.altDgm ?? []);
    if (subjektGid && subjektGid !== ur && subjektGid !== eb?.anzeige?.globalId && modellVon(subjektGid) === 'cde') weitere.add(subjektGid);
    for (const gid of weitere) out.push({ art: 'geloescht', globalId: gid, nachher: true, modell: 'cde' });
    return out;
}

/**
 * Die ANZEIGE des Ur-Geländes (Stufe 1): je Ur genau eine — beim ersten
 * Vorgang angelegt, bei jedem weiteren mit der um ihn verlängerten
 * `vorgaenge`-Liste neu geschrieben (dieselbe GlobalId, volle Liste). Ohne
 * neuen Vorgang und mit vorhandener Anzeige: nichts zu schreiben.
 */
function _anzeigeSchritte(eb, neuerVorgang, { ur, quellBasis, raster, name }) {
    if (eb?.anzeige && !neuerVorgang) return [];
    const vorgaenge = [...(eb?.vorgaenge ?? []), ...(neuerVorgang ? [neuerVorgang] : [])];
    return ableitungsSchritte({
        rezept: 'anzeige',
        bestehend: eb?.anzeige
            ? { ableitung: eb.anzeige.bauplan.ableitung, teile: { anzeige: { globalId: eb.anzeige.globalId, bauplan: eb.anzeige.bauplan } } }
            : null,
        quellen: { gelaende: ur }, quellBasis, raster, operationen: [], name, vorgaenge,
    });
}

/**
 * Jeder Schritt eines Erdbau-Vorgangs hängt an der DATEI seines Ur-Geländes
 * (Stufe 4, Lücke L6) — auch wenn das Subjekt ein Rohr oder ein Bauwerk aus
 * einer anderen Lieferung ist. Ohne bekannte sha bleibt es beim Aufrufer.
 */
function _anModell(schritte, sha) {
    return sha ? schritte.map(s => ({ ...s, modellSha: sha })) : schritte;
}

/**
 * EIN ERDBAU-VORGANG auf einem Gelände-Kandidaten (Kanalgraben, Bauwerksgrube):
 * Quelle ist immer das UR-Gelände, die Anzeige bekommt den Vorgang angehängt,
 * verborgen wird, was sie ersetzt. Dass Graben und Grube sich vorher von
 * DGM zu DGM ketteten — jeder mit eigener Geländekopie — war der Grund für
 * drei TERRAIN im Raum und 6,5 MB Paket.
 */
/**
 * Das vorbelegte Gelände einer Erdbau-Bearbeitung: das erste GELIEFERTE
 * (Fahrplan Erdbau-Container, Stufe 1). Eine Anzeige der CDE als Vorgabe
 * führte über `erdbau.ur` meist zum Ur — aber nicht, wenn die Ansicht veraltet
 * war. Gibt es kein geliefertes, bleibt es beim ersten Kandidaten.
 */
function _vorbelegtesGelaende(el) {
    const kandidaten = el?.gelaendeQuellen ?? [];
    return (kandidaten.find(g => g.herkunft !== 'cde') ?? kandidaten[0])?.globalId ?? '';
}

function _erdbauVorgang(quelle, { rezept, quellen, quellBasis, operationen, name, auflockerung = null }) {
    const eb = quelle?.erdbau ?? null;
    const ur = eb?.ur ?? quelle.globalId;
    const basisMass = { gelaende: eb?.quellBasis ?? quelle.pruefmass ?? null };
    const raster = { cell: eb?.cell ?? quelle.cell ?? null };
    const neu = ableitungsSchritte({
        rezept, quellen: { ...quellen, gelaende: ur }, quellBasis: { ...quellBasis, ...basisMass }, raster, operationen, name,
        auflockerung,
    });
    const urName = _urName({ name: quelle.name }, eb);
    return _anModell([
        ..._verbergen(ur, eb, quelle.globalId),
        ..._anzeigeSchritte(eb, { ableitung: neu[0].nachher.ableitung, art: rezept, titel: vorgangstitel(neu[0].nachher, rezeptNach(rezept)) },
                            { ur, quellBasis: basisMass, raster, name: urName }),
        ...neu,
    ], quelle.modellSha);
}

function _gelaendeSchritte(el, neueOps, { titel = null, auflockerung = null } = {}) {
    const bauplan = el?.stand?.bauplan;
    const eb = el?.erdbau ?? null;
    // Altbestand vor Teil XIV: das Rezept, das sein Quellraster HEREINGEREICHT
    // braucht (`{quelle, operationen}`) — gefragt wird diese Eigenschaft.
    const alt = rezeptNach(bauplan?.rezept)?.braucht === 'quellraster' ? bauplan : null;
    // Das UR: aus der Anreicherung; ohne sie (headless) wenigstens EIN Hop
    // hinauf, wenn das Subjekt selbst eine Anzeigeform oder ein Teil eines
    // Erdbau-Vorgangs ist — sonst würde auf eine Kopie gesetzt.
    const ur = eb?.ur ?? alt?.parameter?.quelle
        ?? ((istAnzeigeform(bauplan) || rezeptNach(bauplan?.rezept)?.erdbau) ? bauplan.parameter?.quellen?.gelaende : null)
        ?? el.globalId;
    const name = _urName(el, eb, alt);
    const quellBasis = { gelaende: eb?.quellBasis ?? el.quellmass?.pruefmass ?? null };
    const raster = { cell: eb?.cell ?? el.quellmass?.cell ?? null };
    const verbergen = _verbergen(ur, eb, el.globalId);

    // JEDE ANWENDUNG EIN EIGENER VORGANG (Teil XX, Fabio 2026-09-10): eigener
    // Cut/Fill mit eigenen Mengen, gerechnet nach allen Vorgängern im Stapel.
    // Die Teile tragen den Werkzeugtitel im Namen („Urgelände · Ausheben ·
    // Aushub") — so heissen auch die Zeile im Mengen-Reiter und die Gruppe
    // im IFC nach dem, was der Planer getan hat.
    const neu = ableitungsSchritte({
        rezept: 'erdbau',
        quellen: { gelaende: ur }, quellBasis, raster,
        operationen: [...(alt?.parameter?.operationen ?? []), ...neueOps],
        // Der Auflockerungsfaktor gehört dem Vorgang (Teil XXI, P4) — er ändert
        // keine Geometrie, nur die Menge, die abgefahren wird.
        auflockerung,
        name: titel ? `${name} · ${titel}` : name,
    });
    const vorgangTitel = titel ? `${name} · ${titel}` : vorgangstitel(neu[0].nachher, rezeptNach('erdbau'));
    return _anModell([
        ...verbergen,
        ..._anzeigeSchritte(eb, { ableitung: neu[0].nachher.ableitung, art: 'erdbau', titel: vorgangTitel },
                            { ur, quellBasis, raster, name }),
        ...neu,
    ], el?.modellSha);
}

/**
 * Kanalgraben ableiten (Teil XIV, G6): die erste Bearbeitung mit ZWEI Quellen.
 * Das Subjekt ist das Rohr; das Gelände kommt aus der Auswahl der Kandidaten,
 * die der Viewer ans Subjekt hängt (`gelaendeQuellen`, mit Prüfmass und
 * Zellweite). Ein geliefertes Gelände wird ausgeblendet; ein eigenes
 * DGM-Teil bleibt im Stand (der Lauf braucht es) und wird nur verborgen.
 */
/**
 * Kanalgraben (Teil XVII, B3): eine Haltung oder der STRANG ab hier — die
 * Rohre und die Schächte an ihren Enden werden LISTEN in den Quellen; die
 * Baugruben rechnet das Rezept aus den Knoten. Grabenbreite und Wand nach
 * DIN EN 1610 / DIN 4124 (`Grabenregeln.js`), als Parameter der Operation.
 *
 * Prüfmasse: das Gelände wie bisher (Netzmass am Subjekt-Kontext); die Rohre
 * bekommen ein ACHSMASS (Länge, DN, Höhenunterschied — billig, für viele
 * Rohre); Schächte kein Mass (ihr Knoten kommt jedes Mal frisch aus dem
 * Fachmodell, ein verschobener Schacht wandert mit).
 */
function _achsmass(k) {
    const punkte = (Array.isArray(k?.polyline) && k.polyline.length >= 2 ? k.polyline : [k?.anfang, k?.ende])
        .filter(p => p && [p.x, p.y, p.z].every(Number.isFinite));
    return punkte.length >= 2 ? achsmassAus({ punkte, dn: Number.isFinite(k?.dn) ? k.dn : null }) : null;
}
function _kanalgrabenSchritte(el, werte) {
    if (!el?.globalId) return null;
    const quelle = (el.gelaendeQuellen ?? []).find(g => g.globalId === werte?.gelaende) ?? null;
    if (!quelle) return null;
    const strang = werte?.umfang === 'strang';
    const kanten = [{ globalId: el.globalId, anfang: el.achse?.anfang, ende: el.achse?.ende, polyline: el.achse?.polyline, dn: el.achse?.dn }];
    if (strang) {
        for (const k of el.strang ?? []) if (k?.globalId && k.globalId !== el.globalId && k.anfang && k.ende) kanten.push(k);
    }
    const rohre = kanten.map(k => k.globalId);
    const schaechte = schaechteAnKanten(kanten, el.knotenImNetz ?? []).map(s => s.globalId).filter(Boolean);
    const name = el.name || el.achse?.name || 'Haltung';
    const zahlOderNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    return _erdbauVorgang(quelle, {
            rezept: 'kanalgraben',
            quellen: { rohre, schaechte },
            quellBasis: { rohre: kanten.map(_achsmass), schaechte: schaechte.map(() => null) },
            operationen: [{ art: 'kanalgraben', parameter: {
                umfang: strang ? 'strang' : 'haltung',
                achsbezug: ACHSBEZUEGE[werte?.achsbezug] ? werte.achsbezug : 'quelle',
                wandform: WANDFORMEN[werte?.wandform] ? werte.wandform : 'verbau',
                boden: BODENKLASSEN[werte?.boden] ? werte.boden : 'nichtbindig',
                winkelGrad: zahlOderNull(werte?.winkel),
                wanddickeMm: zahlOderNull(werte?.wanddicke) ?? 0,
                breite: zahlOderNull(werte?.breite),
                bettung: zahlOderNull(werte?.bettung) ?? regeltabelle('grabenregeln', GRABENREGELN).bettung.ueblich,
                schachtMass: zahlOderNull(werte?.schachtMass) ?? 1.0,
                dn: zahlOderNull(werte?.dn),
            } }],
            auflockerung: auflockerungOder(werte?.auflockerung),
            name: strang ? `${name} · Strang` : name,
    });
}

/**
 * BAUWERKSGRUBE (Teil XIX): Subjekt ist das BAUTEIL, das Gelände kommt aus
 * der Kandidatenliste am Subjekt — dieselbe Anordnung wie beim Kanalgraben,
 * nur dass dort ein Rohr steht und hier ein Bauwerk.
 *
 * KEINE DATEN GEHEN VERLOREN: das Bauteil ist QUELLE, es wird nicht
 * angefasst. Das Ur-Gelände wird verborgen (bei einem gelieferten heisst das
 * ausblenden, nie löschen), und die Grube entsteht als eigenes Element.
 */
function _bauwerksgrubeSchritte(el, werte) {
    if (!el?.globalId) return null;
    const quelle = (el.gelaendeQuellen ?? []).find(g => g.globalId === werte?.gelaende) ?? null;
    if (!quelle) return null;
    const zahlOderNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    return _erdbauVorgang(quelle, {
            rezept: 'bauwerksgrube',
            quellen: { bauteil: el.globalId },
            quellBasis: { bauteil: el.quellmass?.pruefmass ?? null },
            operationen: [{ art: 'bauwerksgrube', parameter: {
                wandform: WANDFORMEN[werte?.wandform] ? werte.wandform : 'boeschung',
                boden: BODENKLASSEN[werte?.boden] ? werte.boden : 'nichtbindig',
                winkelGrad: zahlOderNull(werte?.winkel),
                arbeitsraum: zahlOderNull(werte?.arbeitsraum),
                sohle: zahlOderNull(werte?.sohle),
            } }],
            auflockerung: auflockerungOder(werte?.auflockerung),
            name: el.name || 'Bauwerk',
    });
}

/**
 * Ein GELÄNDEWERKZEUG aus seiner Operation (Teil XXIII, A6).
 *
 * Das Muster folgt aus der Wirkfläche der Operation: ein RING wird als Umriss
 * gezeichnet (≥ 3 Punkte), alles andere als Zug (≥ 2). Felder, Vorbelegung
 * und die Übersetzung in Operationen stehen am Eintrag (`werkzeug`); hier
 * bleibt die EINE Operation „Gelände formen" (`_gelaendeSchritte`): jede
 * Anwendung ein eigener Vorgang im Erdbau-Stapel.
 */
export function formwerkzeugFuer(art, op = GELAENDE_OPS[art]) {
    const w = op?.werkzeug;
    if (!w) return null;
    const ring = op.wirkflaeche?.form === 'ring';
    const mindestPunkte = ring ? 3 : 2;
    return {
        id: w.id, titel: w.titel, icon: w.icon,
        gruppe: 'gelaende', bauform: 'hoehenfeld', art: 'erzeugt',
        eingabe: ring ? 'umriss' : 'zug', mindestPunkte,
        operation: art,
        felder: w.felder,
        vorbelegung: (el) => w.vorbelegung?.(el) ?? {},
        // Die Punkte liegen AUF dem Gelände (Teil XIV).
        hoehenAus: 'gelaende',
        ...(w.nachZug ? { nachZug: (el, zug) => w.nachZug(zug, { versatz: el?.hoehenversatz ?? 0 }) } : {}),
        anwenden: (el, werte, { zug = [] } = {}) => {
            if (!el?.globalId || zug.length < mindestPunkte) return null;
            const r = w.ausEingabe(werte, zug, { versatz: el.hoehenversatz ?? 0 });
            return r ? _gelaendeSchritte(el, r.ops, { titel: r.titel, auflockerung: r.auflockerung ?? null }) : null;
        },
    };
}

/** Alle Geländewerkzeuge, in der Reihenfolge ihres `rang`. */
function formwerkzeuge(ops = GELAENDE_OPS) {
    return Object.entries(ops)
        .filter(([, op]) => op?.werkzeug)
        .sort(([, a], [, b]) => (a.werkzeug.rang ?? 99) - (b.werkzeug.rang ?? 99))
        .map(([art, op]) => formwerkzeugFuer(art, op));
}

/** Setzer-Deklarationen werden Werkzeuge; alles andere bleibt, wie es geschrieben ist (A6). */
function _ausDaten(liste) {
    return liste.map(b => (b.setzt ? werkzeugAusSetzer(b) : b));
}

/** Aussparung (G7): Subjekt = Bauwerkskörper, Werkzeug = eigener Körper aus dem Subjekt-Kontext. */
function _aussparungSchritte(el, werte) {
    if (!el?.globalId) return null;
    const werkzeug = (el.koerperQuellen ?? []).find(k => k.globalId === werte?.werkzeug) ?? null;
    if (!werkzeug || werkzeug.globalId === el.globalId) return null;
    return [
        { art: 'geloescht', globalId: el.globalId, nachher: true, ...(el.modelId === 'cde-eigenbau' ? { modell: 'cde' } : {}) },
        ...ableitungsSchritte({
            rezept: 'aussparung',
            quellen: { bauwerk: el.globalId, werkzeug: werkzeug.globalId },
            quellBasis: { bauwerk: el.quellmass?.pruefmass ?? null },
            raster: {},
            operationen: [{ art: 'aussparung', parameter: {
                kategorie: String(el.category ?? el.type ?? 'IFCBUILDINGELEMENTPROXY').toUpperCase(),
            } }],
            name: el.name || 'Bauteil',
        }),
    ];
}

export const BEARBEITUNGEN = Object.freeze(_ausDaten([
    // NUR REZEPTE, DIE AUS EINEM ZUG BAUEN (2026-09-17). „Gelände zeichnen"
    // stand hier, weil es sich aus dem Rezept-Register von selbst ergab — und
    // war ein toter Knopf: `gelaende` hat `baue: null` (es baut mit
    // `baueMit(parameter, quellraster)` aus Quelle + Operationen, nicht aus
    // Punkten), `mindestPunkte: 0` und keine Felder. Wer ihn drückte, legte
    // einen Bauplan an, den sein eigenes Rezept nicht bauen kann. Ein Gelände
    // entsteht über die Erdbau-Werkzeuge, nie über einen gezeichneten Zug.
    ...Object.values(REZEPTE).filter(r => typeof r.baue === 'function').map(zeichenBearbeitung),
    {
        id: 'aussparung-ableiten',
        titel: 'Aussparung ableiten',
        icon: 'schnitt',
        gruppe: 'gelaende',
        // SO WEIT WIE DAS REZEPT (2026-09-17): `aussparung` verlangt am Bauwerk
        // Körper, Fläche+Dicke, Achse+Profil, weil die Aussparung in einer
        // WAND der Regelfall schlechthin ist und eine Rohrdurchführung das
        // kanonische Werkzeug. Der Katalog liess nur `koerper` zu; am
        // Wand-Bauteil erschien das Werkzeug deshalb nie. Gelesen wird die
        // Deklaration des Rezepts (`braucht.bauwerk`), nicht eine Kopie davon.
        bauform: rezeptNach('aussparung').braucht.bauwerk,
        mindestGuete: 'unbekannt',
        art: 'erzeugt',
        felder: [
            { name: 'werkzeug', titel: 'Abzuziehender eigener Körper', typ: 'auswahl',
              aus: { geste: 'auswahl', herkunft: 'cde', liefert: 'globalId' },
              optionen: (el) => (el?.koerperQuellen ?? [])
                  .filter(k => k.globalId !== el?.globalId)
                  .map(k => ({ wert: k.globalId, titel: k.name || k.globalId })) },
        ],
        vorbelegung: (el) => ({ werkzeug: (el?.koerperQuellen ?? []).find(k => k.globalId !== el?.globalId)?.globalId ?? '' }),
        anwenden: (el, werte) => _aussparungSchritte(el, werte),
    },
    {
        /**
         * BAUGRUBE UMS BAUWERK (Teil XIX) — das Gelände passt sich an ein
         * vorhandenes Bauteil an, statt an einen gezeichneten Umriss.
         *
         * Subjekt ist das BAUWERK (Fundament, Schacht, Widerlager, Station).
         * Sein Grundriss kommt aus der Geometrie, der Arbeitsraum aus
         * DIN 4124 (0,50 m geböscht / 0,60 m verbaut), der Böschungswinkel
         * aus der Bodenklasse — alles überschreibbar, alles beraten statt
         * verboten (Gesetz 6).
         *
         * Der Unterschied zum Kanalgraben ist nur die Quelle: dort eine
         * Rohrachse, hier ein Grundriss. Alles danach ist dieselbe Kette.
         */
        id: 'bauwerksgrube-ableiten',
        titel: 'Baugrube ums Bauwerk',
        icon: 'ausheben',
        gruppe: 'gelaende',
        bauform: ['koerper', 'flaeche+dicke', 'netz'],
        mindestGuete: 'unbekannt',
        art: 'erzeugt',
        felder: [
            { name: 'gelaende', titel: 'Gelände', typ: 'auswahl',
              aus: { geste: 'auswahl', bauform: 'hoehenfeld', liefert: 'globalId' },
              optionen: (el) => (el?.gelaendeQuellen ?? []).map(g => ({
                  wert: g.globalId, titel: g.name || g.globalId + (g.herkunft === 'cde' ? ' (eigenes)' : ''),
              })) },
            { name: 'arbeitsraum', titel: 'Arbeitsraum (leer = DIN 4124)', einheit: 'm', typ: 'zahl', min: 0, max: 5, gueltig: { min: 0 }, leerErlaubt: true },
            { name: 'wandform', titel: 'Grubenwand', typ: 'auswahl',
              optionen: Object.entries(WANDFORMEN).map(([wert, w]) => ({ wert, titel: w.titel })) },
            { name: 'boden', titel: 'Bodenklasse (Böschungswinkel ohne Nachweis, DIN 4124)', typ: 'auswahl',
              optionen: Object.entries(BODENKLASSEN).map(([wert, b]) => ({ wert, titel: b.titel })) },
            { name: 'winkel', titel: 'Böschungswinkel (leer = aus der Bodenklasse)', einheit: '°', typ: 'zahl', min: 10, max: 89, gueltig: { ueber: 0, unter: 90 }, leerErlaubt: true },
            { name: 'sohle', titel: 'Sohle (leer = Unterkante des Bauwerks)', einheit: 'm NN', typ: 'zahl', leerErlaubt: true },
            AUFLOCKERUNG_FELD,
        ],
        vorbelegung: (el) => ({
            gelaende: _vorbelegtesGelaende(el),
            arbeitsraum: '', wandform: 'boeschung', boden: 'nichtbindig', winkel: '', sohle: '',
            auflockerung: auflockerungFuer('nichtbindig'),
        }),
        anwenden: (el, werte) => _bauwerksgrubeSchritte(el, werte),
    },
    {
        id: 'kanalgraben-ableiten',
        titel: 'Kanalgraben ableiten',
        icon: 'gerinne',
        gruppe: 'gelaende',
        bauform: ['achse+profil'],
        // KEINE Güteschranke — gebraucht wird die Achse, und die liegt an
        // Fabios Netzen seit 14.1 exakt vor (Extrusion), nie als Skelett.
        mindestGuete: 'unbekannt',
        art: 'erzeugt',
        /**
         * B3: Grabenbreite und Wand NACH NORM (DIN EN 1610 Tab. 1/2, DIN 4124),
         * als Regler mit Herkunft — kein geratener Arbeitsraum mehr. Der
         * Umfang „Strang" nimmt die Kette stromab samt Schächten (Baugruben).
         */
        felder: [
            { name: 'gelaende', titel: 'Gelände', typ: 'auswahl',
              // Teil XVI: statt aus der Liste — das Gelände im Raum antippen.
              aus: { geste: 'auswahl', bauform: ['hoehenfeld'], liefert: 'globalId' },
              optionen: (el) => (el?.gelaendeQuellen ?? []).map(g => ({
                  wert: g.globalId, titel: `${g.name || g.globalId}${g.herkunft === 'cde' ? ' (eigenes DGM)' : ''}` })) },
            { name: 'umfang', titel: 'Umfang', typ: 'auswahl', optionen: [
                { wert: 'haltung', titel: 'Nur diese Haltung' },
                { wert: 'strang', titel: 'Strang ab hier — Kette stromab, mit Schachtbaugruben' },
            ] },
            // WO DIE ACHSE LIEGT (Teil XXI, E4): „aus der Quelle" leitet es aus
            // der Herkunft ab — eine Achs-Repräsentation ist auf Sohlniveau
            // geschrieben, eine aus der Extrusion oder dem Netz gewonnene liegt
            // in der Rohrmitte. Sichtbar und umstellbar, weil „axisRep = Sohle"
            // für isyifc belegt ist, nicht für jedes Fremdsystem.
            { name: 'achsbezug', titel: 'Achshöhe der Haltung', typ: 'auswahl', optionen: [
                { wert: 'quelle', titel: 'Aus der Quelle — Achs-Repräsentation = Sohle, Extrusion/Netz = Rohrmitte' },
                { wert: 'sohle', titel: 'Sohle' },
                { wert: 'mitte', titel: 'Rohrmitte' },
            ] },
            { name: 'wandform', titel: 'Grabenwand', typ: 'auswahl',
              optionen: Object.entries(WANDFORMEN).map(([wert, w]) => ({ wert, titel: w.titel })) },
            { name: 'boden', titel: 'Bodenklasse (Böschungswinkel ohne Nachweis, DIN 4124)', typ: 'auswahl',
              optionen: Object.entries(BODENKLASSEN).map(([wert, b]) => ({ wert, titel: b.titel })) },
            { name: 'winkel', titel: 'Böschungswinkel (leer = aus der Bodenklasse)', einheit: '°', typ: 'zahl', min: 10, max: 89, gueltig: { ueber: 0, unter: 90 }, leerErlaubt: true },
            { name: 'breite', titel: 'Sohlbreite (leer = Mindestbreite DIN EN 1610)', einheit: 'm', typ: 'zahl', min: 0.3, max: 10, gueltig: { ueber: 0 }, leerErlaubt: true },
            { name: 'wanddicke', titel: 'Rohrwanddicke (OD = DN + 2·s)', einheit: 'mm', typ: 'zahl', min: 0, max: 200, gueltig: { min: 0 }, vorgabe: 0 },
            { name: 'bettung', titel: 'Untere Bettung (0,10 üblich · 0,15 Fels)', einheit: 'm', typ: 'zahl', min: 0, max: 1, gueltig: { min: 0 }, vorgabe: GRABENREGELN.bettung.ueblich },
            { name: 'schachtMass', titel: 'Schacht-Außenmaß (Ø oder Kantenlänge) — Baugrube eckig', einheit: 'm', typ: 'zahl', min: 0.3, max: 5, gueltig: { ueber: 0 }, vorgabe: 1.0 },
            { name: 'dn', titel: 'DN (leer = aus der Achse)', einheit: 'mm', typ: 'zahl', min: 50, max: 4000, gueltig: { ueber: 0 }, leerErlaubt: true },
            AUFLOCKERUNG_FELD,
        ],
        vorbelegung: (el) => ({
            gelaende: _vorbelegtesGelaende(el),
            auflockerung: auflockerungFuer('nichtbindig'),
            umfang: 'haltung', achsbezug: 'quelle', wandform: 'verbau', boden: 'nichtbindig', winkel: null, breite: null,
            wanddicke: 0, bettung: regeltabelle('grabenregeln', GRABENREGELN).bettung.ueblich, schachtMass: 1.0,
            // Der DN ist ein sichtbarer Regler: vorbelegt aus der Festlegung
            // (parametrik), sonst aus der Achse — nie still geraten.
            dn: el?.stand?.profilGroesse ?? el?.achse?.dn ?? null,
        }),
        anwenden: (el, werte) => _kanalgrabenSchritte(el, werte),
    },
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
        setzt: { art: 'merkmal', journal: 'kg', feld: 'kg' },
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
        setzt: { art: 'hoehe', feld: 'hoehe' },
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
        // Karte Rolle → Wert: an einem Bauteil gelten mehrere Masse
        // nebeneinander (siehe `falte` in useAenderungen).
        setzt: { art: 'mass', werte: [{ feld: 'groesse', rolle: 'profilGroesse' }] },
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
        setzt: { art: 'mass', werte: [{ feld: 'profilform', rolle: 'profilform' }] },
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
        setzt: { art: 'mass', werte: [{ feld: 'dicke', rolle: 'dicke' }] },
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
         * seit Teil XXIV (K4) wirklich gebaut — dort ist die Achse ein Wert
         * (`setzt.amBauplan`, die Fähigkeit `sohlen` des Rezepts).
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
        // Was GILT: erst die Festlegung, sonst die Sohle der Achse (m NN).
        // An einem EIGENEN Bauteil, dessen Rezept seine Sohlen kennt, wird der
        // Bauplan fortgeschrieben (K4) — geliefert bleibt es eine Forderung.
        setzt: { art: 'mass', amBauplan: 'sohlen', werte: SOHLEN_WERTE },
    },
    {
        /**
         * Sohle am Punkt setzen (Teil XXIV, O6) — was der Griff im Längsschnitt
         * tut, als Werkzeug und damit als Kommando: EINE Höhe für jedes Ende,
         * das am Punkt liegt. Am Schacht zieht ein Griff Zulauf-Ende und
         * Ablauf-Anfang zugleich; „Sohlhöhen festlegen" kann das nicht, weil
         * jede Haltung dort ein ANDERES Ende hätte. Das Ende adressiert der
         * Ort, nie eine Nummer (E3). Geliefert: Forderung; eigen: Bauplan (K4).
         */
        id: 'sohle-ziehen',
        titel: 'Sohle am Punkt setzen',
        icon: 'laengsschnitt',
        gruppe: 'parametrik',
        bauform: ['achse+profil', 'linie'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'parametrik',
        nurFestlegung: true,
        // Mehrere Haltungen, EIN Ort: gesetzt wird nur, was dort endet.
        mehrfach: true,
        eingabe: 'zug',
        mindestPunkte: 1,
        // Ein Punkt; er fängt auf Knoten (K9) — ein Tipp neben die Schachtmitte trifft ihre Enden.
        eingaben: [{ schlitz: 'zug', anzahl: { min: 1, max: 1 }, fang: 'knoten' }],
        felder: [{ name: 'hoehe', titel: 'Sohle am Punkt', einheit: 'm NN', typ: 'zahl' }],
        setzt: { art: 'mass', amBauplan: 'sohlen', amOrt: 'hoehe', werte: SOHLEN_WERTE },
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
        // WAS DAS WERKZEUG BRAUCHT (Teil XXIII, AE): eine Achse, die eine KANTE im
        // Netz ist. Vorher genügte die Bauform — und Träger, Pfähle, Trassen
        // bekamen „Haltung teilen", das daraus Rohre machte.
        braucht: ['achse', 'netzrolle:kante'],
        mindestGuete: 'gemessen',
        // Eine EIGENE Linie hat keine Achse und würde hier zu zwei Rohren —
        // sie hat ihr eigenes Werkzeug (`linie-teilen`, S9). Das eigene Rohr
        // bleibt: es hat eine Achse im Fachmodell und wird richtig geteilt.
        gilt: (e, ctx) => !(ctx?.eigenes && e?.bauform === 'linie'),
        art: 'erzeugt',
        felder: [{
            name: 'station', titel: 'Teilen bei', einheit: 'm ab Anfang', typ: 'zahl', min: 0, gueltig: { min: 0 },
            // Teil XVI: die Station bleibt ein FELD — die Geste ist nur der
            // andere Weg hinein (Ort auf der Achse zeigen).
            aus: { geste: 'punkt', auf: 'achse', liefert: 'station' },
        }],
        vorbelegung: (el) => ({ station: _rundeM((el?.achse?.laenge ?? 0) / 2) }),
        anwenden: (el, werte) => {
            const a = el?.achse;
            if (!a || !el?.globalId) return null;
            const teilung = _teilpunkt(a, werte.station);
            if (!teilung) return null;
            const punkt = _alsTripel;
            const name = el?.name ?? '';
            const alt = el?.stand?.bauplan?.parameter?.anschluss ?? {};
            const stueck = (von, bis, zusatz, anschluss) => erzeugtEintrag({
                rezept: rezeptFuerNetzrolle('kante', el?.stand?.bauplan),
                kategorie: el.category ?? 'IFCPIPESEGMENT',
                name: name ? `${name}${zusatz}` : '',
                parameter: _mitAnschluss(_netzParameter(el?.stand?.bauplan, 'kante', [punkt(von), punkt(bis)], a.dn, a), anschluss),
            });

            // Reihenfolge mit Absicht: erst das Alte weg, dann das Neue. Beim
            // Nachspielen läuft dieselbe Folge, und ein halb angewandter
            // Vorgang zeigt dann eher zu wenig als doppelt.
            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                stueck(a.anfang, teilung, ' (1)', { anfang: alt.anfang }),
                stueck(teilung, a.ende, ' (2)', { ende: alt.ende }),
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
        setzt: { art: 'mass', werte: [
            { feld: 'deckel', rolle: 'deckelhoehe', zahl: true, runden: true, sonst: { welt: 'oberkante' } },
        ] },
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
        // Die Rolle im Netz, ausdrücklich (AE) — die Grössen darunter bleiben,
        // wo das Werkzeug sie liest oder schreibt.
        braucht: ['netzrolle:kante'],
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
        setzt: { art: 'mass', werte: [{ feld: 'richtung', rolle: 'fliessrichtung', werte: ['wie_geliefert', 'umgekehrt'] }] },
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
         *
         * SEIT TEIL XXIV (K4/K5): die Sohlen sind Sohlen (Vorbelegung mit dem
         * Bezug der Achse), verteilt wird nach der WAAGERECHTEN Weglänge (vorher
         * nach der räumlichen), und ein EIGENES Glied bekommt seinen Bauplan
         * fortgeschrieben statt einer Forderung, die niemand las — die
         * Baupläne der anderen Glieder reicht der Kontext (`bauplanVon`).
         */
        id: 'strang-gefaelle-setzen',
        titel: 'Sohlhöhen über den Strang',
        icon: 'laengsschnitt',
        gruppe: 'parametrik',
        bauform: ['achse+profil'],
        // Die Rolle im Netz, ausdrücklich (AE) — die Grössen darunter bleiben,
        // wo das Werkzeug sie liest oder schreibt.
        braucht: ['netzrolle:kante'],
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
                anfang: _rundeM(nnAusWelt(sohleAnAchse(s[0].anfang.y, s[0]), v)),
                ende: _rundeM(nnAusWelt(sohleAnAchse(s[s.length - 1].ende.y, s[s.length - 1]), v)),
            };
        },
        anwenden: (el, werte, { bauplanVon = null } = {}) => {
            const s = el?.strang ?? [];
            const v = el?.hoehenversatz ?? 0;
            const von = Number(werte.anfang);
            const bis = Number(werte.ende);
            if (!s.length || !Number.isFinite(von) || !Number.isFinite(bis)) return null;

            // Gleichmässig nach LÄNGE, nicht nach Anzahl: zwei kurze und eine
            // lange Haltung bekommen sonst dasselbe Gefälle-Drittel, und der
            // Strang knickt an jedem Schacht. Die Länge ist die WAAGERECHTE
            // Weglänge (K5) — dieselbe, gegen die das Gefälle gemessen wird;
            // mit der räumlichen fiele es ungleich aus.
            const laengen = s.map(k => gefaelle(punkteDerAchse(k)).laenge2d);
            const gesamt = laengen.reduce((n, l) => n + l, 0);
            if (!(gesamt > 0)) return null;

            let gelaufen = 0;
            const hoeheBei = (s0) => von - ((von - bis) * (s0 / gesamt));
            return s.map((k, i) => {
                const anfang = hoeheBei(gelaufen);
                gelaufen += laengen[i];
                const ende = hoeheBei(gelaufen);
                // EIN EIGENES GLIED WIRD ECHT (K4): sein Bauplan kennt seine Sohlen.
                const plan = k.globalId === el.globalId ? el?.stand?.bauplan : bauplanVon?.(k.globalId);
                const sohlen = plan?.rezept ? rezeptNach(plan.rezept)?.sohlen : null;
                if (sohlen) {
                    const parameter = sohlen.enden(plan.parameter,
                        { anfang: weltAusNn(anfang, v), ende: weltAusNn(ende, v) }, { bezug: kantenbezugNeu() });
                    if (parameter) {
                        return erzeugtEintrag({ rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                                                globalId: k.globalId, parameter });
                    }
                }
                return {
                    art: 'parametrik', globalId: k.globalId,
                    nachher: {
                        sohlhoeheAnfang: _rundeM(anfang),
                        sohlhoeheEnde: _rundeM(ende),
                    },
                };
            });
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
        // Die Rolle im Netz, ausdrücklich (AE) — die Grössen darunter bleiben,
        // wo das Werkzeug sie liest oder schreibt.
        braucht: ['achse', 'netzrolle:kante'],
        brauchtRolle: ['sohlhoeheAnfang', 'sohlhoeheEnde'],
        mindestGuete: 'gemessen',
        art: 'erzeugt',
        felder: [
            { name: 'station', titel: 'Einfügen bei', einheit: 'm ab Anfang', typ: 'zahl', min: 0, gueltig: { min: 0 },
              aus: { geste: 'punkt', auf: 'achse', liefert: 'station' } },
            { name: 'deckel', titel: 'Deckelhöhe', einheit: 'm NN', typ: 'zahl' },
            { name: 'durchmesser', titel: 'Durchmesser', einheit: 'mm', typ: 'zahl', min: 300, max: 4000, gueltig: { ueber: 0 } },
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
        /**
         * Warum nicht? Fast immer liegt die Station ausserhalb der Haltung —
         * und dann sucht der Nutzer nach einem fehlenden „Bezug", den es
         * nicht gibt. Die Grenzen kommen aus derselben Rechnung wie
         * `_teilpunkt`, damit Grund und Regel dasselbe messen.
         */
        warumNicht: (el, werte) => {
            const l = Number(el?.achse?.laenge) || 0;
            const s = Number(werte?.station);
            if (!el?.achse) return null;
            if (!Number.isFinite(s)) return 'Ohne Station lässt sich nicht teilen.';
            if (s <= 0.01 || s >= l - 0.01) {
                // Deutsche Zahlschreibweise wie überall sonst im Haus.
                const m = (v) => Number(v).toFixed(2).replace('.', ',');
                return `Station ${m(s)} m liegt nicht auf der Haltung (0 … ${m(l)} m).`;
            }
            return null;
        },
        anwenden: (el, werte) => {
            const a = el?.achse;
            if (!a || !el?.globalId) return null;
            const teilung = _teilpunkt(a, werte.station);
            if (!teilung) return null;

            const v = el?.hoehenversatz ?? 0;
            const deckelWelt = weltAusNn(Number(werte.deckel), v);
            // Der Schacht steht auf der SOHLE der Haltung (K4) — ein Knoten ist
            // seine Sohle; die Achshöhe einer Haltung in Rohrmitte liegt DN/2
            // darüber. Ohne Angabe der Achse bleibt es bei ihrer Höhe.
            const sohleTeilung = sohleAnAchse(teilung.y, a);
            if (!Number.isFinite(deckelWelt) || deckelWelt <= sohleTeilung) return null;

            const name = el?.name ?? '';
            const alt = el?.stand?.bauplan?.parameter?.anschluss ?? {};
            const stueck = (von, bis, zusatz, anschluss) => erzeugtEintrag({
                rezept: rezeptFuerNetzrolle('kante', el?.stand?.bauplan),
                kategorie: el.category ?? 'IFCPIPESEGMENT',
                name: name ? `${name}${zusatz}` : '',
                parameter: _mitAnschluss(_netzParameter(el?.stand?.bauplan, 'kante', [_alsTripel(von), _alsTripel(bis)], a.dn, a), anschluss),
            });
            // Der Schacht zuerst — die Stücke NENNEN ihn (K8).
            const schacht = erzeugtEintrag({
                rezept: rezeptFuerNetzrolle('knoten'),
                kategorie: 'IFCDISTRIBUTIONCHAMBERELEMENT',
                name: name ? `${name} (Schacht)` : '',
                parameter: {
                    punkte: [[teilung.x, sohleTeilung, teilung.z], [teilung.x, deckelWelt, teilung.z]],
                    dn: Number(werte.durchmesser) || 1000,
                },
            });

            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                schacht,
                stueck(a.anfang, teilung, ' (1)', { anfang: alt.anfang, ende: schacht.globalId }),
                stueck(teilung, a.ende, ' (2)', { anfang: schacht.globalId, ende: alt.ende }),
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
        // Die Rolle im Netz, ausdrücklich (AE) — die Grössen darunter bleiben,
        // wo das Werkzeug sie liest oder schreibt.
        braucht: ['netzrolle:knoten'],
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
        /**
         * Warum nicht? Wer denselben Ort noch einmal einträgt, ändert
         * nichts — das ist kein fehlender Bezug, sondern eine Nullbewegung.
         */
        warumNicht: (el, werte) => {
            if (!el?.anker || !el?.versatz) return null;
            if (el?.lageUmkehrbar === false) {
                return 'Die Lage dieses Bauteils lässt sich nicht umkehrbar abbilden — Verschieben wäre ein Raten.';
            }
            const dO = Number(werte?.ost) - Number(el?.lage?.ost);
            const dN = Number(werte?.nord) - Number(el?.lage?.nord);
            if (Number.isFinite(dO) && Number.isFinite(dN) && Math.hypot(dO, dN) < 0.01) {
                return 'Der Schacht liegt schon dort — es gibt nichts zu verschieben.';
            }
            return null;
        },
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

            eintraege.push(..._anschluesseNachfuehren(el, werte, { ost, nord, zielX, zielZ }));
            return eintraege;
        },
    },
    {
        /**
         * Verschieben — das GANZE Bauteil entlang Ost, Nord oder Höhe (Teil XVI, S5).
         *
         * Das Werkzeug hinter dem Bauteil-Griff am Auswahlpunkt (`Achszug.js`):
         * die Achse wählt die Zugrichtung, getippt geht es genauso. Absoluter
         * Zielzustand des ANKERS in Projektkoordinaten (Ost/Nord/m NN):
         *
         *   geliefert → `lage` am Anker (die Bibliothek verschiebt das Bauteil
         *               starr; ein Rohr löst dabei seine Anschlüsse — das sagt
         *               die Prüfliste, hier wird beraten, nicht verboten)
         *   eigen     → der BAUPLAN wandert (`rezept.verschiebe`), als
         *               `erzeugt` mit derselben GlobalId — echt, keine Forderung
         *
         * Ein Schacht führt seine Anschlüsse nach wie bei „Schacht verschieben"
         * — DIESELBE Logik (`_anschluesseNachfuehren`), der Regler erscheint
         * nur, wenn es Anschlüsse gibt (`nurWenn`). Gelände wird nicht
         * geschoben, sondern geformt (`achsenErlaubt`).
         */
        id: 'verschieben',
        titel: 'Verschieben',
        icon: 'pointer',
        gruppe: 'lage',
        bauform: ['punkt', 'linie', 'achse+profil', 'flaeche', 'flaeche+dicke', 'koerper', 'netz'],
        mindestGuete: 'unbekannt',
        art: 'lage',
        felder: [
            { name: 'ost', titel: 'Rechtswert', einheit: 'm', typ: 'zahl' },
            { name: 'nord', titel: 'Hochwert', einheit: 'm', typ: 'zahl' },
            { name: 'hoehe', titel: 'Höhe', einheit: 'm NN', typ: 'zahl' },
            {
                name: 'mitfuehren',
                nurWenn: (el) => (el?.anschluesse?.length ?? 0) > 0,
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
            hoehe: _rundeM(nnAusWelt(el?.anker?.y ?? 0, el?.hoehenversatz ?? 0)),
            ...((el?.anschluesse?.length ?? 0) > 0 ? { mitfuehren: 'forderung' } : {}),
        }),
        anwenden: (el, werte) => {
            if (!el?.globalId || !el?.anker || !el?.versatz) return null;
            if (el.lageUmkehrbar === false) return null;
            const ost = Number(werte.ost), nord = Number(werte.nord), hoehe = Number(werte.hoehe);
            if (![ost, nord, hoehe].every(Number.isFinite)) return null;
            const ziel = { x: ost - el.versatz.x, y: weltAusNn(hoehe, el.hoehenversatz ?? 0), z: -nord - el.versatz.z };
            const d = { x: ziel.x - el.anker.x, y: ziel.y - el.anker.y, z: ziel.z - el.anker.z };
            if ([d.x, d.y, d.z].every(v => Math.abs(v) < 1e-4)) return null;

            const plan = el.stand?.bauplan;
            if (plan?.rezept) {
                const rezept = rezeptNach(plan.rezept);
                if (typeof rezept?.verschiebe !== 'function') return null;
                return erzeugtEintrag({
                    rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                    globalId: el.globalId, parameter: rezept.verschiebe(plan.parameter, d),
                });
            }
            const eintraege = [{ art: 'lage', globalId: el.globalId, nachher: ziel }];
            eintraege.push(..._anschluesseNachfuehren(el, werte, { ost, nord, zielX: ziel.x, zielZ: ziel.z }));
            return eintraege;
        },
    },
    {
        /**
         * KNICKPUNKT EINES ERDBAU-VORGANGS ZIEHEN (Teil XX Stufe C / Teil XXI, P5).
         *
         * Fabio (2026-09-10): „Knickpunkte XYZ-ziehbar." Ein Erdbau-Vorgang
         * hat keine `punkte` im Bauplan — seine Ecken stecken in den
         * OPERATIONEN (`umriss`, `linie`, `stationen`), und ihre Höhen stehen
         * dort in m NN. Deshalb ein eigenes Werkzeug neben
         * `stuetzpunkt-verschieben`: derselbe Weg, andere Fundstelle.
         *
         * GESCHRIEBEN WIRD DIE VOLLE OPERATIONSLISTE über `ableitungsSchritte`
         * mit `bestehend` — eine Klammer, ein Parametersatz, dieselben
         * GlobalIds für Aushub UND Auftrag. Ein Eintrag nur am gezogenen Teil
         * liesse die Geschwister mit einem alten Bauplan zurück (Befund
         * `ableitung_uneinheitlich`).
         *
         * DIE HÖHE BLEIBT IN NN: die Punktlisten der Operationen tragen sie so
         * (`punktfelder` ihres Registry-Eintrags), und `_opsInWelt` rechnet sie an genau einer
         * Grenze um. Wer hier Welt-Y schriebe, verschöbe den Punkt um den
         * Höhenversatz.
         */
        id: 'erdbau-stuetzpunkt-verschieben',
        titel: 'Knickpunkt verschieben',
        icon: 'pointer',
        gruppe: 'gelaende',
        bauform: ['koerper'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            // `adresse` (Teil XXIV, E3): im KOMMANDO steht nicht die Nummer, sondern
            // die Kennung der Operation bzw. der alte Punkt — siehe `ADRESSEN`.
            { name: 'op', titel: 'Operation Nr.', typ: 'zahl', min: 0, gueltig: { min: 0 }, aus: { geste: 'griff' }, adresse: 'operation' },
            { name: 'feld', titel: 'Punktliste', typ: 'text' },
            { name: 'index', titel: 'Knickpunkt Nr.', typ: 'zahl', min: 0, gueltig: { min: 0 }, adresse: 'knickpunkt' },
            { name: 'ost', titel: 'Rechtswert', einheit: 'm', typ: 'zahl' },
            { name: 'nord', titel: 'Hochwert', einheit: 'm', typ: 'zahl' },
            { name: 'hoehe', titel: 'Höhe', einheit: 'm NN', typ: 'zahl' },
        ],
        vorbelegung: (el) => {
            const p = _erdbauPunkt(el?.stand?.bauplan, 0, null, 0);
            const v = el?.versatz ?? { x: 0, y: 0, z: 0 };
            if (!p) return { op: 0, feld: '', index: 0 };
            return { op: p.op, feld: p.feld, index: 0,
                     ost: _rundeM(p.punkt.x + v.x), nord: _rundeM(-(p.punkt.z + v.z)),
                     hoehe: _rundeM(Number(p.punkt.y)) };
        },
        anwenden: (el, werte) => _erdbauStuetzpunktSchritte(el, werte),
    },
    {
        /**
         * Stützpunkt verschieben — der Griff an EIGENEN Bauteilen (Teil XVI, S4).
         *
         * Ein eigenes Rohr, eine Linie, eine Fläche, ein Schacht: ihr Ort lebt
         * im BAUPLAN (Parameter `punkte`), nicht in einer `lage`. Verschoben
         * wird deshalb ein Punkt des Bauplans — als `erzeugt`-Eintrag mit
         * DERSELBEN GlobalId (die Faltung ersetzt den Bauplan, wie bei der
         * Folgeformung des Geländes). Absoluter Zielzustand, idempotent.
         *
         * NUR FÜR EIGENES (`nurEigene`): am gelieferten Bauteil gibt es keinen
         * Bauplan — dort ist „Trasse ändern" der Weg (Forderung + Neubau).
         * Der Griff im Raum füllt die Felder; getippt geht es genauso.
         */
        id: 'stuetzpunkt-verschieben',
        titel: 'Stützpunkt verschieben',
        icon: 'pointer',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil', 'flaeche', 'koerper'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'index', titel: 'Stützpunkt Nr.', typ: 'zahl', min: 0, gueltig: { min: 0 }, aus: { geste: 'griff' }, adresse: 'stuetzpunkt' },
            { name: 'ost', titel: 'Rechtswert', einheit: 'm', typ: 'zahl' },
            { name: 'nord', titel: 'Hochwert', einheit: 'm', typ: 'zahl' },
            { name: 'hoehe', titel: 'Höhe', einheit: 'm NN', typ: 'zahl' },
        ],
        vorbelegung: (el) => {
            const p = el?.stand?.bauplan?.parameter?.punkte?.[0];
            const v = el?.versatz ?? { x: 0, y: 0, z: 0 };
            if (!Array.isArray(p)) return { index: 0 };
            return {
                index: 0,
                ost: _rundeM(p[0] + v.x), nord: _rundeM(-(p[2] + v.z)),
                hoehe: _rundeM(nnAusWelt(p[1], el?.hoehenversatz ?? 0)),
            };
        },
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!el?.globalId || !plan?.rezept || !Array.isArray(punkte)) return null;
            if (el.lageUmkehrbar === false) return null;
            const i = Number(werte.index);
            const ost = Number(werte.ost), nord = Number(werte.nord), hoehe = Number(werte.hoehe);
            if (!Number.isInteger(i) || i < 0 || i >= punkte.length) return null;
            if (![ost, nord, hoehe].every(Number.isFinite)) return null;
            const v = el.versatz ?? { x: 0, y: 0, z: 0 };
            const neu = [ost - v.x, weltAusNn(hoehe, el.hoehenversatz ?? 0), -nord - v.z];
            const alt = punkte[i];
            if (Array.isArray(alt) && alt.length >= 3
                && Math.abs(alt[0] - neu[0]) < 1e-4 && Math.abs(alt[1] - neu[1]) < 1e-4 && Math.abs(alt[2] - neu[2]) < 1e-4) return null;
            return erzeugtEintrag({
                rezept: plan.rezept,
                kategorie: plan.kategorie,
                name: plan.name ?? '',
                globalId: el.globalId,
                parameter: { ...plan.parameter, punkte: punkte.map((p, k) => (k === i ? neu : p)) },
            });
        },
    },
    {
        /**
         * Löschen — das eine Werkzeug, das JEDE Bauform kennt (S8).
         *
         * Geliefert: ein `geloescht` mit `modell:'geliefert'` (der Aufrufer
         * stempelt es) blendet das Bauteil AUS — im fremden Modell wird nichts
         * wirklich gelöscht, es ist eine Entfernungs-Forderung (ISO 19650).
         * Eigen: `modell:'cde'` → der Neuaufbau lässt es weg. Beides derselbe
         * Eintrag, dieselbe Faltung.
         *
         * Die NACHBARN erledigt das Fachmodell von selbst: was verdeckt ist,
         * fällt aus Achsen und Knoten, und ein Rohr am gelöschten Schacht
         * meldet sein loses Ende in der Prüfliste. Kein Kaskadieren im Katalog.
         */
        id: 'loeschen',
        titel: 'Löschen',
        icon: 'delete',
        gruppe: 'lage',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'geloescht',
        felder: [],
        setzt: { art: 'merkmal', journal: 'geloescht', wert: true },
    },
    {
        /**
         * Kopieren — ein zweites Exemplar eines EIGENEN Bauteils, versetzt (S8).
         *
         * Nur eigenes: ein geliefertes Bauteil hat keinen Bauplan, aus dem sich
         * eine Kopie bauen liesse (Gesetz 8). Das Kopieren ist ein `erzeugt`
         * mit NEUER GlobalId und dem verschobenen Bauplan — derselbe Weg wie
         * beim Zeichnen, nur die Punkte kommen aus dem Original.
         */
        id: 'kopieren',
        titel: 'Kopieren',
        icon: 'add',
        gruppe: 'lage',
        bauform: ['punkt', 'linie', 'achse+profil', 'flaeche', 'flaeche+dicke', 'koerper'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'ost', titel: 'Versatz Ost', einheit: 'm', typ: 'zahl', vorgabe: 2 },
            { name: 'nord', titel: 'Versatz Nord', einheit: 'm', typ: 'zahl', vorgabe: 0 },
            { name: 'hoehe', titel: 'Versatz Höhe', einheit: 'm', typ: 'zahl', vorgabe: 0 },
        ],
        vorbelegung: () => ({ ost: 2, nord: 0, hoehe: 0 }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const rezept = plan?.rezept ? rezeptNach(plan.rezept) : null;
            if (!plan?.rezept || typeof rezept?.verschiebe !== 'function') return null;
            const ost = Number(werte.ost), nord = Number(werte.nord), hoehe = Number(werte.hoehe);
            if (![ost, nord, hoehe].every(Number.isFinite)) return null;
            if (Math.abs(ost) < 1e-4 && Math.abs(nord) < 1e-4 && Math.abs(hoehe) < 1e-4) return null;
            // Ost/Nord/Höhe → Welt-Δ: Nord = −z, Höhe = +y.
            const delta = { x: ost, y: hoehe, z: -nord };
            return erzeugtEintrag({
                rezept: plan.rezept,
                kategorie: plan.kategorie,
                name: plan.name ? `${plan.name} Kopie` : '',
                parameter: _ohneAnschluss(rezept.verschiebe(plan.parameter, delta)),
            });
        },
    },
    {
        /**
         * Reihe — mehrere Kopien eines EIGENEN Bauteils in gleichem Abstand (S8).
         *
         * Für Baumreihen, Leuchten, Absteckpunkte. `anzahl` Kopien (das
         * Original bleibt), je um `abstand` weiter in Richtung Ost/Nord. Alle
         * in EINEM Vorgang (`ausfuehren` klammert mehrteilige Einträge).
         */
        id: 'reihe',
        titel: 'Reihe',
        icon: 'add',
        gruppe: 'lage',
        bauform: ['punkt', 'koerper', 'linie', 'flaeche'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'anzahl', titel: 'Anzahl Kopien', typ: 'zahl', min: 1, max: 200, gueltig: { min: 1 }, vorgabe: 3 },
            { name: 'ost', titel: 'Abstand Ost', einheit: 'm', typ: 'zahl', vorgabe: 5 },
            { name: 'nord', titel: 'Abstand Nord', einheit: 'm', typ: 'zahl', vorgabe: 0 },
        ],
        vorbelegung: () => ({ anzahl: 3, ost: 5, nord: 0 }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const rezept = plan?.rezept ? rezeptNach(plan.rezept) : null;
            if (!plan?.rezept || typeof rezept?.verschiebe !== 'function') return null;
            const anzahl = Math.round(Number(werte.anzahl));
            const ost = Number(werte.ost), nord = Number(werte.nord);
            if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > 200) return null;
            if (![ost, nord].every(Number.isFinite) || (Math.abs(ost) < 1e-4 && Math.abs(nord) < 1e-4)) return null;
            const aus = [];
            for (let k = 1; k <= anzahl; k++) {
                aus.push(erzeugtEintrag({
                    rezept: plan.rezept,
                    kategorie: plan.kategorie,
                    name: plan.name ? `${plan.name} (${k + 1})` : '',
                    parameter: _ohneAnschluss(rezept.verschiebe(plan.parameter, { x: ost * k, y: 0, z: -nord * k })),
                }));
            }
            return aus;
        },
    },
    {
        /**
         * Drehen — ein EIGENES Bauteil in der Waagerechten ausrichten (S8).
         *
         * Um den Schwerpunkt, Winkel in Grad. Nur eigenes (Bauplan); ein
         * gedrehtes geliefertes Bauteil bräuchte eine `lage` MIT Drehung, und
         * die Editor-Verschiebung kann heute nur translatieren — das ist ein
         * eigener Schritt (Teil XVI, offen). Der `punkt` hat keine Ausdehnung,
         * die man drehen könnte; er steht darum nicht in der Liste.
         */
        id: 'drehen',
        titel: 'Drehen',
        icon: 'route',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil', 'flaeche', 'flaeche+dicke', 'koerper'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'winkel', titel: 'Winkel', einheit: '°', typ: 'zahl', min: -360, max: 360, vorgabe: 90,
              aus: { geste: 'griff' } },
        ],
        vorbelegung: () => ({ winkel: 90 }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            const w = Number(werte.winkel);
            if (!plan?.rezept || !Array.isArray(punkte) || !Number.isFinite(w)) return null;
            if (Math.abs(w % 360) < 1e-6) return null;
            return erzeugtEintrag({
                rezept: plan.rezept,
                kategorie: plan.kategorie,
                name: plan.name ?? '',
                globalId: el.globalId,
                parameter: drehePunktliste(plan.parameter, w),
            });
        },
    },
    {
        /**
         * Spiegeln — ein EIGENES Bauteil an einer Achse durch seinen
         * Schwerpunkt (Teil XXIII, A6; im Tiefbau täglich: die Schachtreihe
         * auf der anderen Strassenseite). Wahlweise als KOPIE mit neuer
         * Kennung — dann bleibt das Original stehen. Wie beim Drehen nur
         * eigenes: ein geliefertes Bauteil hat keinen Bauplan (Gesetz 8).
         */
        id: 'spiegeln',
        titel: 'Spiegeln',
        icon: 'route',
        gruppe: 'lage',
        bauform: ['punkt', 'linie', 'achse+profil', 'flaeche', 'flaeche+dicke', 'koerper'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'achse', titel: 'Spiegelachse (0° = Ost–West)', einheit: '°', typ: 'zahl', min: -360, max: 360, vorgabe: 0 },
            { name: 'kopie', titel: 'Ergebnis', typ: 'auswahl', optionen: [
                { wert: 'nein', titel: 'Bauteil spiegeln' },
                { wert: 'ja', titel: 'gespiegelte Kopie, Original bleibt' },
            ] },
        ],
        vorbelegung: () => ({ achse: 0, kopie: 'nein' }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            const w = Number(werte.achse);
            if (!plan?.rezept || !el?.globalId || !Array.isArray(punkte) || !Number.isFinite(w)) return null;
            // Ein Punkt (Pfosten) gespiegelt am eigenen Schwerpunkt bleibt, wo er ist.
            if (punkte.length < 2) return null;
            const kopie = werte.kopie === 'ja';
            return erzeugtEintrag({
                rezept: plan.rezept,
                kategorie: plan.kategorie,
                name: kopie && plan.name ? `${plan.name} (gespiegelt)` : (plan.name ?? ''),
                globalId: kopie ? null : el.globalId,
                // Gespiegelt liegt es nicht mehr an seinen Schächten (K8).
                parameter: _ohneAnschluss(spiegelePunktliste(plan.parameter, w)),
            });
        },
    },
    {
        /**
         * Stützpunkt einfügen — an einer EIGENEN Linie/Fläche/Achse (S8).
         *
         * Die Station kommt als Punkt-Geste auf der Achse (wie „Haltung
         * teilen"), der neue Stützpunkt wird zwischen die beiden nächsten
         * Punkte gehängt. `erzeugt` mit derselben GlobalId — der Bauplan
         * bekommt einen Punkt mehr.
         */
        id: 'stuetzpunkt-einfuegen',
        titel: 'Stützpunkt einfügen',
        icon: 'add',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil', 'flaeche'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [{
            name: 'station', titel: 'Einfügen bei', einheit: 'm ab Anfang', typ: 'zahl', min: 0, gueltig: { min: 0 },
            aus: { geste: 'punkt', auf: 'achse', liefert: 'station' },
        }],
        vorbelegung: (el) => ({ station: _rundeM((el?.achse?.laenge ?? _bauplanLaenge(el)) / 2) }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || !Array.isArray(punkte) || punkte.length < 2) return null;
            const eingefuegt = _stationEinfuegen(punkte, Number(werte.station), !!REZEPTE[plan.rezept]?.geschlossen);
            if (!eingefuegt) return null;
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                globalId: el.globalId, parameter: { ...plan.parameter, punkte: eingefuegt },
            });
        },
    },
    {
        /**
         * Stützpunkt entfernen — an einer EIGENEN Linie/Fläche (S8).
         *
         * Der Griff (S4) benennt den Stützpunkt über `index`; das Feld ist
         * per Griff füllbar. Eine Linie behält mindestens zwei Punkte, eine
         * Fläche mindestens drei — sonst ist es kein Objekt mehr.
         */
        id: 'stuetzpunkt-entfernen',
        titel: 'Stützpunkt entfernen',
        icon: 'delete',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil', 'flaeche'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'index', titel: 'Stützpunkt Nr.', typ: 'zahl', min: 0, gueltig: { min: 0 }, aus: { geste: 'griff' }, adresse: 'stuetzpunkt' },
        ],
        vorbelegung: (el) => ({ index: Math.max(0, (el?.stand?.bauplan?.parameter?.punkte?.length ?? 1) - 1) }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || !Array.isArray(punkte)) return null;
            const mindest = REZEPTE[plan.rezept]?.geschlossen ? 3 : 2;
            const i = Number(werte.index);
            if (!Number.isInteger(i) || i < 0 || i >= punkte.length || punkte.length <= mindest) return null;
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                globalId: el.globalId, parameter: { ...plan.parameter, punkte: punkte.filter((_, k) => k !== i) },
            });
        },
    },
    {
        /**
         * Linie teilen — eine EIGENE Linie an einer Station in zwei (S9).
         *
         * Das Gegenstück zu „Haltung teilen" für Bauteile MIT Bauplan: die
         * Punktliste wird an der Station geschnitten, beide Teile behalten
         * Rezept, Typ und alle übrigen Parameter (eine Trasse bleibt eine
         * Trasse). Drei Einträge, EIN Vorgang — dieselbe Folge wie beim Rohr:
         * erst das Alte weg (am eigenen Bauteil heisst das: verborgen), dann
         * das Neue.
         */
        id: 'linie-teilen',
        titel: 'Linie teilen',
        icon: 'section',
        gruppe: 'lage',
        bauform: ['linie'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [{
            name: 'station', titel: 'Teilen bei', einheit: 'm ab Anfang', typ: 'zahl', min: 0, gueltig: { min: 0 },
            aus: { geste: 'punkt', auf: 'achse', liefert: 'station' },
        }],
        vorbelegung: (el) => ({ station: _rundeM(_bauplanLaenge(el) / 2) }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || REZEPTE[plan.rezept]?.geschlossen || !Array.isArray(punkte) || !el?.globalId) return null;
            const teile = teilePunktlisteAnStation(punkte, Number(werte.station));
            if (!teile) return null;
            const stueck = (pts, zusatz) => erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie,
                name: plan.name ? `${plan.name}${zusatz}` : '',
                parameter: { ...plan.parameter, punkte: pts },
            });
            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                stueck(teile[0], ' (1)'),
                stueck(teile[1], ' (2)'),
            ];
        },
    },
    {
        /**
         * Linie trimmen / verlängern — ein Ende entlang seines letzten
         * Abschnitts (S9). Positiv verlängert, negativ kürzt; der Abschnitt
         * darf dabei nicht verschwinden. `erzeugt` mit derselben GlobalId.
         */
        id: 'linie-trimmen',
        titel: 'Linie verlängern / kürzen',
        icon: 'measure',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'ende', titel: 'Welches Ende', typ: 'auswahl', optionen: [
                { wert: 'ende', titel: 'Ende' }, { wert: 'anfang', titel: 'Anfang' },
            ] },
            { name: 'laenge', titel: 'Um (+ verlängert, − kürzt)', einheit: 'm', typ: 'zahl', vorgabe: 1 },
        ],
        vorbelegung: () => ({ ende: 'ende', laenge: 1 }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || REZEPTE[plan.rezept]?.geschlossen || !Array.isArray(punkte) || !el?.globalId) return null;
            const neu = trimmePunktliste(punkte, werte.ende === 'anfang' ? 'anfang' : 'ende', Number(werte.laenge));
            if (!neu) return null;
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                globalId: el.globalId, parameter: { ...plan.parameter, punkte: neu },
            });
        },
    },
    {
        /**
         * Linie versetzen — eine Parallele im Grundriss (S9).
         *
         * DIESELBE Gehrung wie der Offset des Kernels; die Höhe je Stützpunkt
         * bleibt. Positiv = links in Laufrichtung. Als KOPIE (neue GlobalId,
         * wie im CAD) oder an Ort und Stelle.
         */
        id: 'linie-versetzen',
        titel: 'Linie versetzen',
        icon: 'route',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'abstand', titel: 'Abstand (+ links in Laufrichtung)', einheit: 'm', typ: 'zahl', vorgabe: 1 },
            { name: 'ergebnis', titel: 'Ergebnis', typ: 'auswahl', optionen: [
                { wert: 'kopie', titel: 'Als Kopie daneben' }, { wert: 'ersetzen', titel: 'Diese Linie verschieben' },
            ] },
        ],
        vorbelegung: () => ({ abstand: 1, ergebnis: 'kopie' }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || REZEPTE[plan.rezept]?.geschlossen || !Array.isArray(punkte) || !el?.globalId) return null;
            const neu = versetzePunktliste(punkte, Number(werte.abstand), { geschlossen: false });
            if (!neu) return null;
            const kopie = werte.ergebnis !== 'ersetzen';
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie,
                name: kopie ? (plan.name ? `${plan.name} (versetzt)` : '') : (plan.name ?? ''),
                globalId: kopie ? null : el.globalId,
                parameter: { ...plan.parameter, punkte: neu },
            });
        },
    },
    {
        /**
         * Linie umkehren — Anfang wird Ende (S9).
         *
         * Kein Randfall (Teil IX): bei einem eigenen Rohr entscheidet die
         * Punktfolge über die FLIESSRICHTUNG, und daran hängen Zulauf/Ablauf,
         * „DN nimmt nicht ab" und der Strang. Die Geometrie bleibt dieselbe.
         */
        id: 'linie-umkehren',
        titel: 'Richtung umkehren',
        icon: 'route',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [],
        vorbelegung: () => ({}),
        anwenden: (el) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || REZEPTE[plan.rezept]?.geschlossen || !Array.isArray(punkte) || punkte.length < 2 || !el?.globalId) return null;
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                globalId: el.globalId, parameter: { ...plan.parameter, punkte: [...punkte].reverse() },
            });
        },
    },
    {
        /**
         * Fläche versetzen — den Ring nach aussen (+) oder innen (−) (S9).
         *
         * „Nach aussen" wird an der FLÄCHE abgelesen, nicht an der Wicklung
         * vorausgesetzt. Als Kopie oder an Ort und Stelle.
         */
        id: 'flaeche-versetzen',
        titel: 'Fläche versetzen',
        icon: 'areas',
        gruppe: 'lage',
        bauform: ['flaeche'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'abstand', titel: 'Abstand (+ nach aussen)', einheit: 'm', typ: 'zahl', vorgabe: 1 },
            { name: 'ergebnis', titel: 'Ergebnis', typ: 'auswahl', optionen: [
                { wert: 'kopie', titel: 'Als Kopie' }, { wert: 'ersetzen', titel: 'Diese Fläche ändern' },
            ] },
        ],
        vorbelegung: () => ({ abstand: 1, ergebnis: 'kopie' }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || !REZEPTE[plan.rezept]?.geschlossen || !Array.isArray(punkte) || punkte.length < 3 || !el?.globalId) return null;
            const neu = versetzePunktliste(punkte, Number(werte.abstand), { geschlossen: true });
            if (!neu) return null;
            const kopie = werte.ergebnis !== 'ersetzen';
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie,
                name: kopie ? (plan.name ? `${plan.name} (versetzt)` : '') : (plan.name ?? ''),
                globalId: kopie ? null : el.globalId,
                parameter: { ...plan.parameter, punkte: neu },
            });
        },
    },
    {
        /**
         * Fläche teilen — mit einer Geraden aus zwei Punkten (S9).
         *
         * Der Zug hat GENAU zwei Punkte (im Lageplan oder im Raum); die Gerade
         * durch beide schneidet den Ring in zwei Ringe (Halbebenen-Zuschnitt,
         * Höhen an den Schnittpunkten interpoliert). Drei Einträge, ein
         * Vorgang, wie beim Teilen einer Linie.
         */
        id: 'flaeche-teilen',
        titel: 'Fläche teilen',
        icon: 'section',
        gruppe: 'lage',
        bauform: ['flaeche'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        eingabe: 'zug',
        mindestPunkte: 2,
        eingaben: [{ schlitz: 'zug', anzahl: { min: 2, max: 2 } }],
        felder: [],
        vorbelegung: () => ({}),
        anwenden: (el, werte, { zug = [] } = {}) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || !REZEPTE[plan.rezept]?.geschlossen || !Array.isArray(punkte) || !el?.globalId) return null;
            if (zug.length < 2) return null;
            const p1 = { x: Number(zug[0].x), z: Number(zug[0].z) }, p2 = { x: Number(zug[1].x), z: Number(zug[1].z) };
            if (![p1.x, p1.z, p2.x, p2.z].every(Number.isFinite)) return null;
            const teile = teileRingMitGerade(punkte, p1, p2);
            if (!teile) return null;
            const stueck = (pts, zusatz) => erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie,
                name: plan.name ? `${plan.name}${zusatz}` : '',
                parameter: { ...plan.parameter, punkte: pts },
            });
            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                stueck(teile[0], ' (1)'),
                stueck(teile[1], ' (2)'),
            ];
        },
    },
    {
        /**
         * Flächen vereinigen — diese mit einer ANDEREN eigenen Fläche (S9).
         *
         * Die andere kommt als Auswahl-Geste (im Raum antippen) oder aus der
         * Liste; ihre Punkte hängen am Subjekt (`eigeneFlaechen`, aus dem
         * Journal), damit `anwenden` synchron rechnet. Ergebnis: beide
         * verborgen, EINE neue Fläche — oder ein Grund (getrennt, Loch).
         */
        id: 'flaeche-vereinigen',
        titel: 'Flächen vereinigen',
        icon: 'areas',
        gruppe: 'lage',
        bauform: ['flaeche'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'andere', titel: 'Mit dieser eigenen Fläche', typ: 'auswahl',
              aus: { geste: 'auswahl', herkunft: 'cde', liefert: 'globalId' },
              optionen: (el) => (el?.eigeneFlaechen ?? [])
                  .filter(f => f.globalId !== el?.globalId)
                  .map(f => ({ wert: f.globalId, titel: f.name || f.globalId })) },
        ],
        vorbelegung: (el) => ({ andere: (el?.eigeneFlaechen ?? []).find(f => f.globalId !== el?.globalId)?.globalId ?? '' }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!plan?.rezept || !REZEPTE[plan.rezept]?.geschlossen || !Array.isArray(punkte) || !el?.globalId) return null;
            const andere = (el.eigeneFlaechen ?? []).find(f => f.globalId === werte?.andere && f.globalId !== el.globalId);
            if (!andere) return null;
            const vereinigt = vereinigeRinge(punkte, andere.punkte);
            if (!vereinigt.punkte) return null;
            return [
                { art: 'geloescht', globalId: el.globalId, nachher: true },
                { art: 'geloescht', globalId: andere.globalId, nachher: true },
                erzeugtEintrag({
                    rezept: plan.rezept, kategorie: plan.kategorie,
                    name: plan.name ? `${plan.name} + ${andere.name || ''}`.trim() : '',
                    parameter: { ...plan.parameter, punkte: vereinigt.punkte },
                }),
            ];
        },
    },
    {
        /**
         * Tauschen aus der Bibliothek (9.8, S9) — ein EIGENES Bauteil bekommt
         * die Vorgaben einer Vorlage DESSELBEN Rezepts: der Schacht DN 1000
         * wird zum DN 1200, das Rohr DN 300 zum DN 500. Lage und Punkte
         * bleiben, nur die Parameter der Vorlage wandern in den Bauplan;
         * der IFC-Typ folgt der Vorlage, wenn sie einen nennt. `erzeugt`
         * mit derselben GlobalId. Ein geliefertes Bauteil lässt sich nicht
         * tauschen — es hat keinen Bauplan (Gesetz 8), dort bleibt es die
         * Festlegung „Querschnittsgrösse".
         */
        id: 'koerper-tauschen',
        titel: 'Tauschen (Bibliothek)',
        icon: 'schacht',
        gruppe: 'parametrik',
        bauform: ['koerper', 'achse+profil', 'linie'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'vorlage', titel: 'Vorlage', typ: 'auswahl',
              optionen: (el) => (el?.vorlagen ?? [])
                  .filter(v => v.rezept === el?.stand?.bauplan?.rezept)
                  .map(v => ({ wert: v.id, titel: v.name })) },
        ],
        vorbelegung: (el) => ({ vorlage: (el?.vorlagen ?? []).find(v => v.rezept === el?.stand?.bauplan?.rezept)?.id ?? '' }),
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            if (!plan?.rezept || !el?.globalId) return null;
            const vorlage = (el.vorlagen ?? []).find(v => v.id === werte?.vorlage && v.rezept === plan.rezept);
            if (!vorlage) return null;
            const { kategorie, name: _n, vorlage: _v, ...vorgaben } = vorlage.vorgaben ?? {};
            // Die Vorgaben wandern in den Bauplan — UND die Id der Vorlage
            // (Teil XXIII, A1). Vorher war die Herkunft nach dem Tausch weg.
            const parameter = { ...plan.parameter, ...vorgaben, vorlage: vorlage.id };
            const neueKategorie = (kategorie ?? plan.kategorie ?? '').toUpperCase() || plan.kategorie;
            // Nichts zu tun erst, wenn auch der BEZUG schon stimmt: ein Bauteil,
            // das zufällig die Masse einer Vorlage hat, bekommt ihre Herkunft.
            const gleich = Object.keys(vorgaben).every(k => plan.parameter?.[k] === vorgaben[k])
                && neueKategorie === plan.kategorie && plan.parameter?.vorlage === vorlage.id;
            if (gleich) return null;
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: neueKategorie, name: plan.name ?? '',
                globalId: el.globalId, parameter,
            });
        },
    },
    {
        /**
         * Kante verschieben — beide Endpunkte einer EIGENEN Kante parallel (S10).
         *
         * Die Wand eines Baufelds, die Flanke einer Trasse: man fasst die
         * Kante an, nicht ihre zwei Ecken. Der Zielwert ist die neue Lage der
         * KANTENMITTE (absolut, wie jeder Anker) — `anwenden` rechnet daraus
         * das Delta und legt es auf beide Endpunkte. Damit bleibt der Eintrag
         * idempotent: zweimal angewandt steht die Kante an derselben Stelle.
         *
         * `index` ist der ERSTE Punkt der Kante; der zweite ergibt sich (beim
         * Ring schliesst die letzte Kante zum Punkt 0 zurück). Er kommt nicht
         * ins Feld, damit der Katalog nicht zwei Wahrheiten über dieselbe
         * Kante führt.
         */
        id: 'kante-verschieben',
        titel: 'Kante verschieben',
        icon: 'pointer',
        gruppe: 'lage',
        bauform: ['linie', 'achse+profil', 'flaeche'],
        mindestGuete: 'unbekannt',
        nurEigene: true,
        art: 'erzeugt',
        felder: [
            { name: 'index', titel: 'Kante ab Stützpunkt Nr.', typ: 'zahl', min: 0, gueltig: { min: 0 }, aus: { geste: 'griff' }, adresse: 'stuetzpunkt' },
            { name: 'ost', titel: 'Kantenmitte Rechtswert', einheit: 'm', typ: 'zahl' },
            { name: 'nord', titel: 'Kantenmitte Hochwert', einheit: 'm', typ: 'zahl' },
            { name: 'hoehe', titel: 'Kantenmitte Höhe', einheit: 'm NN', typ: 'zahl' },
        ],
        vorbelegung: (el) => {
            const punkte = el?.stand?.bauplan?.parameter?.punkte;
            const v = el?.versatz ?? { x: 0, y: 0, z: 0 };
            if (!Array.isArray(punkte) || punkte.length < 2) return { index: 0 };
            const a = punkte[0], b = punkte[1];
            return {
                index: 0,
                ost: _rundeM((a[0] + b[0]) / 2 + v.x), nord: _rundeM(-((a[2] + b[2]) / 2 + v.z)),
                hoehe: _rundeM(nnAusWelt((a[1] + b[1]) / 2, el?.hoehenversatz ?? 0)),
            };
        },
        anwenden: (el, werte) => {
            const plan = el?.stand?.bauplan;
            const punkte = plan?.parameter?.punkte;
            if (!el?.globalId || !plan?.rezept || !Array.isArray(punkte) || punkte.length < 2) return null;
            if (el.lageUmkehrbar === false) return null;
            const i = Number(werte.index);
            const ost = Number(werte.ost), nord = Number(werte.nord), hoehe = Number(werte.hoehe);
            if (!Number.isInteger(i) || i < 0 || i >= punkte.length) return null;
            if (![ost, nord, hoehe].every(Number.isFinite)) return null;
            const geschlossen = !!REZEPTE[plan.rezept]?.geschlossen;
            const j = i + 1 < punkte.length ? i + 1 : (geschlossen ? 0 : -1);
            if (j < 0) return null;                       // die offene Linie hat hinter dem letzten Punkt keine Kante
            const a = punkte[i], b = punkte[j];
            if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) return null;
            const v = el.versatz ?? { x: 0, y: 0, z: 0 };
            const ziel = [ost - v.x, weltAusNn(hoehe, el.hoehenversatz ?? 0), -nord - v.z];
            const mitte = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            const d = [ziel[0] - mitte[0], ziel[1] - mitte[1], ziel[2] - mitte[2]];
            if (Math.hypot(d[0], d[1], d[2]) < 1e-4) return null;
            const neu = punkte.map((p, k) => (
                (k === i || k === j) && Array.isArray(p) && p.length >= 3
                    ? [p[0] + d[0], p[1] + d[1], p[2] + d[2]]
                    : p));
            return erzeugtEintrag({
                rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '',
                globalId: el.globalId, parameter: { ...plan.parameter, punkte: neu },
            });
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
        // WAS DAS WERKZEUG BRAUCHT (Teil XXIII, AE): eine Achse, die eine KANTE im
        // Netz ist. Vorher genügte die Bauform — und Träger, Pfähle, Trassen
        // bekamen „Haltung teilen", das daraus Rohre machte.
        braucht: ['achse', 'netzrolle:kante'],
        mindestGuete: 'unbekannt',
        art: 'lage',
        eingabe: 'zug',
        mindestPunkte: 1,
        // Teil XVI: GENAU ein Punkt, und der fängt auf Schachtmitten — der
        // Motor liefert dann den exakten Knoten, und der 10-m-Fang unten
        // sieht dTipp = 0. `anwenden` bleibt unverändert.
        eingaben: [{ schlitz: 'zug', anzahl: { min: 1, max: 1 }, fang: 'knoten' }],
        felder: [],
        vorbelegung: () => ({}),
        anwenden: (el, _werte, { zug = [] } = {}) => {
            const a = el?.achse;
            const knoten = el?.knotenImNetz ?? [];
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
            if (!ziel || dTipp > regelwert('fangKnotenM')) return null;

            const abstand = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
            const dA = abstand(a.anfang, ziel.punkt);
            const dE = abstand(a.ende, ziel.punkt);
            const ende = dA <= dE ? 'anfang' : 'ende';
            const wandert = ende === 'anfang' ? a.anfang : a.ende;
            const bleibt = ende === 'anfang' ? a.ende : a.anfang;

            const dx = ziel.punkt.x - wandert.x;
            const dz = ziel.punkt.z - wandert.z;

            // EIN EIGENES ROHR (Teil XXIV, K8 — Fabios E6): der Bauplan NENNT den
            // Knoten, und nur dieses Ende rückt auf ihn — die Sohle bleibt.
            // Sitzt es schon dort, fehlt vielleicht nur die Erklärung.
            const plan = el?.stand?.bauplan;
            const eigenKante = plan?.rezept && rezeptNach(plan.rezept)?.netzrolle === 'kante' && Array.isArray(plan.parameter?.punkte);
            if (eigenKante) {
                const alt = plan.parameter.anschluss ?? {};
                if (Math.hypot(dx, dz) < 1e-4 && alt[ende] === ziel.globalId) return null;
                const punkte = plan.parameter.punkte.map(p => [...p]);
                const i = ende === 'anfang' ? 0 : punkte.length - 1;
                punkte[i] = [ziel.punkt.x, punkte[i][1], ziel.punkt.z];
                return erzeugtEintrag({
                    rezept: plan.rezept, kategorie: plan.kategorie, name: plan.name ?? '', globalId: el.globalId,
                    parameter: _mitAnschluss({ ...plan.parameter, punkte }, { ...alt, [ende]: ziel.globalId }),
                });
            }
            // GELIEFERT wird starr verschoben — sitzt das ferne Ende schon auf
            // einem Schacht, risse es ab. (Ein eigenes Rohr oben rückt nur sein Ende.)
            for (const k of knoten) {
                if (abstand(k.punkt, bleibt) <= 0.001) return null;
            }
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
        // Die Rolle im Netz, ausdrücklich (AE) — die Grössen darunter bleiben,
        // wo das Werkzeug sie liest oder schreibt.
        braucht: ['netzrolle:knoten'],
        brauchtRolle: 'deckelhoehe',
        mindestGuete: 'unbekannt',
        art: 'erzeugt',
        felder: [],
        vorbelegung: () => ({}),
        /**
         * Warum nicht? Ein ENDschacht hat einen Anschluss, ein Knoten mit
         * drei Zuläufen hat drei — beide lassen sich nicht „herausnehmen",
         * weil danach nicht klar wäre, welche Haltungen durchzuverbinden
         * sind. Die Ablehnung ist richtig; sie muss nur sagen, warum
         * (gemessen am ENQUIER-Netz, 2026-09-09).
         */
        warumNicht: (el) => {
            const n = (el?.anschluesse ?? []).length;
            if (n === 2) return null;
            return n === 1
                ? `„${el?.name ?? 'Der Schacht'}" ist ein Endschacht (1 Anschluss) — entfernen geht nur beim Durchgangsschacht mit genau zwei.`
                : `„${el?.name ?? 'Der Schacht'}" hat ${n} Anschlüsse — entfernen geht nur beim Durchgangsschacht mit genau zwei.`;
        },
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
                    rezept: rezeptFuerNetzrolle('kante'),
                    kategorie: zu.kategorie ?? 'IFCPIPESEGMENT',
                    name: zu.name || ab.name || '',
                    // Zwei Punkte vom Zulauf, einer vom Ablauf — je mit dem Bezug SEINER Achse (K4).
                    parameter: _kanteAusFremdenHoehen(punkte, dn, [zu, zu, ab]),
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
        setzt: { art: 'benennen', muster: 'muster', beginn: 'beginnBei' },
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
        // Die Rolle im Netz, ausdrücklich (AE) — die Grössen darunter bleiben,
        // wo das Werkzeug sie liest oder schreibt.
        braucht: ['netzrolle:kante'],
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
        setzt: { art: 'merkmal', journal: 'massnahme', feld: 'massnahme' },
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
        // Die Rolle im Netz, ausdrücklich (AE) — die Grössen darunter bleiben,
        // wo das Werkzeug sie liest oder schreibt.
        braucht: ['netzrolle:kante'],
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
        // WAS DAS WERKZEUG BRAUCHT (Teil XXIII, AE): eine Achse, die eine KANTE im
        // Netz ist. Vorher genügte die Bauform — und Träger, Pfähle, Trassen
        // bekamen „Haltung teilen", das daraus Rohre machte.
        braucht: ['achse', 'netzrolle:kante'],
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
                    rezept: rezeptFuerNetzrolle('kante', el?.stand?.bauplan),
                    kategorie: el.category ?? 'IFCPIPESEGMENT',
                    name: el.name ?? '',
                    parameter: _netzParameter(el?.stand?.bauplan, 'kante', punkte, a.dn, a),
                }),
            ];
        },
    },
    // Die GELÄNDEWERKZEUGE entstehen aus ihrer Operation (Teil XXIII, A6):
    // Muster (Zug oder Umriss) + `GELAENDE_OPS[art]` + dessen Felder.
    ...formwerkzeuge(),
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
        setzt: { art: 'merkmal', journal: 'din277', feld: 'din277' },
    },
    {
        /**
         * Merkmalssatz setzen (Teil XXIV, O6) — was das Merkmalsfenster tut, als
         * Werkzeug und damit als Kommando: ein Satz unter seinem Namen, die
         * übrigen Sätze bleiben. Sein Formular IST das Merkmalsfenster (Name +
         * Tabelle der Merkmale); eine Karte als Feld in der Werkzeugleiste wäre
         * unbedienbar — deshalb `eigeneOberflaeche`: die Leiste bietet es nicht an.
         */
        id: 'merkmalssatz-setzen',
        titel: 'Merkmalssatz setzen',
        icon: 'info',
        gruppe: 'merkmale',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'pset',
        eigeneOberflaeche: 'merkmalsfenster',
        felder: [
            { name: 'satz', titel: 'Satzname', typ: 'text' },
            { name: 'merkmale', titel: 'Merkmale', typ: 'karte' },
        ],
        setzt: { art: 'satz', journal: 'pset', name: 'satz', feld: 'merkmale', standFeld: 'pset' },
    },
    {
        /**
         * Bauform auslegen — der Ausweg, wenn Typ UND Geometrie schweigen.
         *
         * DER FALL: ein Tiefbau-Planer liefert sein Geländemodell als
         * geschlossenen Volumenkörper unter `IFCCIVILELEMENT` (in IFC 4.3
         * gestrichen, in älteren Lieferungen überall) oder als schlichten
         * Proxy. Beide Typen sagen über die Form ABSICHTLICH nichts
         * (`bauform: null` in Typprofile.js — eine Sperre gegen die
         * Vererbung, kein fehlender Eintrag), und der Geometrie-Rückfall
         * kann `hoehenfeld` GAR NICHT liefern: er kennt Achse, Körper und
         * Netz. Der Körper landet also zwangsläufig auf `koerper`, und die
         * Gelände-Werkzeuge erscheinen nie.
         *
         * WARUM `bauform: '*'` UND NICHT ENGER: Henne und Ei. Filterte dieser
         * Eintrag auf `koerper` oder `netz`, wäre er genau dort nicht da, wo
         * die Einordnung schon falsch ist — man käme nie an das Werkzeug, mit
         * dem man sie richtigstellt. Der Preis ist, dass er an jedem Bauteil
         * in „Immer möglich" steht; das ist vertretbar, denn die Frage „ist
         * das hier vielleicht etwas anderes?" ist an jedem Proxy legitim.
         *
         * WARUM NICHT EINFACH EINE REGEL: eine Bauformregel gilt klassenweit
         * und ist der Normalweg (`Bauformregeln.js`, Panel „Bauformen
         * zuordnen"). Sie kann aber nicht sagen „nur DIESER eine Körper ist
         * das Gelände, die anderen IfcCivilElement sind Stützwände". Genau
         * dafür ist dieser Eintrag da — und deshalb steht der Einzelfall in
         * der Rangfolge ÜBER der Regel.
         *
         * Leeres Feld nimmt die Auslegung zurück; danach entscheidet wieder
         * die Regel, sonst das Typprofil, sonst die Geometrie.
         */
        id: 'bauform-auslegen',
        mehrfach: true,
        titel: 'Bauform auslegen',
        icon: 'bauform',
        gruppe: 'merkmale',
        bauform: '*',
        mindestGuete: 'unbekannt',
        art: 'bauform',
        felder: [{
            name: 'bauform',
            rueckfall: {
                titel: 'Als welche Form lesen?', typ: 'auswahl', leerErlaubt: true,
                optionen: Object.entries(BAUFORMEN)
                    // `netz` ist der Rückfall, kein Ziel — es auszuwählen
                    // hiesse, freiwillig auf jede Operation zu verzichten.
                    .filter(([wert]) => wert !== 'netz')
                    .map(([wert, b]) => ({ wert, titel: `${b.titel} — ${b.beschreibung}` })),
            },
        }],
        setzt: { art: 'merkmal', journal: 'bauform', feld: 'bauform', standFeld: 'bauformAusnahme' },
    },
    // Die Setzer der Rezepte (A6): je Feld mit `setzbar` eins — Muster
    // Formular, Operation „Parameter", Katalogeintrag das Rezept.
    ...Object.values(REZEPTE).flatMap(setzerFuerRezept),
]));

// ── Auswahl ─────────────────────────────────────────────────────────────────

/**
 * DER Werkzeugkatalog — die eingebauten Werkzeuge und je Rezept aus der
 * Bibliothek ein Zeichenwerkzeug (Teil XXIII, A5).
 *
 * `BEARBEITUNGEN` bleibt die eingebaute Liste (Wächter, Tests); gefragt wird
 * hier. Die Zeichenwerkzeuge der Bibliothek stehen hinter den eingebauten —
 * aus demselben Muster (`zeichenBearbeitung`), also ohne eine Zeile Code je
 * Rezept. Neu gebaut, sobald das Rezept-Register wandert.
 */
let _katalog = { stand: -1, liste: BEARBEITUNGEN };
export function werkzeugKatalog() {
    const stand = registerStand();
    if (_katalog.stand !== stand) {
        const zusatz = registrierte().filter(r => typeof r.baue === 'function').map(zeichenBearbeitung);
        let hinter = -1;
        BEARBEITUNGEN.forEach((b, k) => { if (b.gruppe === 'erzeugen') hinter = k; });
        // Und ihre Setzer (A6) — hinten, bei den übrigen.
        const setzer = registrierte().flatMap(setzerFuerRezept);
        _katalog = { stand, liste: Object.freeze([...BEARBEITUNGEN.slice(0, hinter + 1), ...zusatz,
                                                  ...BEARBEITUNGEN.slice(hinter + 1), ...setzer]) };
    }
    return _katalog.liste;
}

/**
 * Die Typprofil-Rollen, nach denen die Werkzeuge fragen (`brauchtRolle`,
 * `braucht: ['mass:…']`, Felder `ausTypprofil`). Das Katalogschema prüft ein
 * Büro-Typprofil dagegen: eine Rolle, die keiner kennt, ist ein Tippfehler.
 */
export function werkzeugRollen(katalog = werkzeugKatalog()) {
    const r = new Set();
    for (const b of katalog) {
        for (const a of verlangtVon(b)) if (a.startsWith('mass:')) r.add(a.slice(5));
        for (const f of b.felder ?? []) if (f?.ausTypprofil) r.add(f.ausTypprofil);
    }
    return r;
}

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
export function passende(einordnung, { gruppe = null, katalog = werkzeugKatalog(), typprofil = null, eigenes = false,
                                      rezept = null, regel = null } = {}) {
    const bauform = einordnung?.bauform ?? null;
    const guete = einordnung?.guete ?? 'unbekannt';
    // WAS DAS BAUTEIL HAT (Teil XXIII, AE) — einmal je Aufruf, aus dem Katalog:
    // Rezept (eigen), Bauformregel (Proxy), Typprofil (Familie).
    const eigenschaften = eigenschaftenVon({ bauform, typprofil, rezept, regel });
    return katalog.filter((b) => {
        // Ein Werkzeug mit EIGENER Oberfläche (O6: das Merkmalsfenster) bietet
        // die Werkzeugleiste nicht an — es läuft als Kommando aus seinem Fenster.
        if (b.eigeneOberflaeche) return false;
        // Teil XVI: manche Werkzeuge gibt es nur an EIGENEN Bauteilen (Bauplan).
        if (b.nurEigene && !eigenes) return false;
        // Der Setzer eines Rezeptfelds (A6) gilt nur für Bauteile DIESES Rezepts.
        if (b.nurRezept && rezept?.id !== b.nurRezept) return false;
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
        // allein ergibt kein Gefälle.
        //
        // SEIT AE (Teil XXIII) ist die Rolle EINE Eigenschaftsart unter
        // mehreren: `braucht: ['netzrolle:kante', 'achse']` fragt genauso, was
        // das Bauteil HAT — und `brauchtRolle` ist die Kurzform für `mass:…`.
        // Ein Weg, eine Prüfung (`verlangtVon`, `fehlendeEigenschaften`).
        if (fehlendeEigenschaften(eigenschaften, verlangtVon(b)).length) return false;
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
        // `gilt` sieht zusätzlich den Kontext (S9): ob das Bauteil EIGEN ist,
        // steht nicht in der Einordnung, entscheidet aber, ob „Haltung teilen"
        // (macht Rohre) oder „Linie teilen" (hält den Bauplan) das Werkzeug ist.
        if (typeof b.gilt === 'function' && !b.gilt(einordnung, { eigenes, typprofil })) return false;
        return true;
    });
}

/** Bearbeitungen einer Gruppe, unabhängig von einer Auswahl (Werkzeugleiste). */
export function ausGruppe(gruppe, katalog = werkzeugKatalog()) {
    return katalog.filter(b => b.gruppe === gruppe);
}

/** Eine Bearbeitung nach Id. */
export function nachId(id, katalog = werkzeugKatalog()) {
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
export function felderFuer(bearbeitung, typprofil = null, el = null) {
    // Ein Feld darf vom SUBJEKT abhängen (`nurWenn`): der Anschluss-Regler von
    // „Verschieben" hat an einem Rohr nichts zu sagen, an einem Schacht alles.
    return (bearbeitung?.felder ?? []).filter(f => typeof f.nurWenn !== 'function' || !!f.nurWenn(el)).map((feld) => {
        const aufgeloest = feld.ausTypprofil
            ? feldAusProfil(feld.ausTypprofil, typprofil, feld.rueckfall ?? null)
            : (feld.rueckfall ?? feld);
        // Optionen dürfen vom SUBJEKT abhängen (G6: welche Gelände kommen als
        // Quelle in Frage) — dann sind sie eine Funktion, hier aufgelöst.
        const optionen = typeof aufgeloest?.optionen === 'function'
            ? (aufgeloest.optionen(el) ?? []) : aufgeloest?.optionen;
        return { name: feld.name, ...(aufgeloest ?? {}), ...(optionen !== undefined ? { optionen } : {}) };
    });
}

/**
 * Ist das TECHNISCH ausführbar? (Teil XXIV, K10 — Fabios E5)
 *
 * Abgelehnt wird nur, was sich nicht bauen oder speichern lässt: ein fehlender
 * Pflichtwert, keine Zahl, ein Wert ausserhalb der Auswahl, und was ein Feld
 * als technische Grenze erklärt (`gueltig: {min, max, ueber, unter}` — ein DN
 * von 0 baut keinen Körper, ein Böschungswinkel von 90° keine Böschung).
 * Die FACHGRENZEN (`min`/`max`) sperren nicht mehr: sie werden ausgeführt und
 * markiert (`Befunde.befundeFuerWerte`). Bis K10 sperrte hier jede Grenze —
 * „Beraten, nicht verbieten" galt für die Befunde, aber nicht fürs Formular.
 *
 * @returns {string[]} leere Liste heißt „ausführbar"
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
            const g = feld.gueltig ?? {};
            if (g.min != null && z < g.min) fehler.push(`${feld.name}: kleiner als ${g.min} — so lässt es sich nicht bauen`);
            if (g.max != null && z > g.max) fehler.push(`${feld.name}: größer als ${g.max} — so lässt es sich nicht bauen`);
            if (g.ueber != null && !(z > g.ueber)) fehler.push(`${feld.name}: muss größer als ${g.ueber} sein`);
            if (g.unter != null && !(z < g.unter)) fehler.push(`${feld.name}: muss kleiner als ${g.unter} sein`);
        }
        if (feld.typ === 'auswahl' && Array.isArray(feld.optionen) && feld.optionen.length) {
            if (!feld.optionen.some(o => o.wert === wert)) fehler.push(`${feld.name}: nicht in der Auswahl`);
        }
    }
    return fehler;
}
