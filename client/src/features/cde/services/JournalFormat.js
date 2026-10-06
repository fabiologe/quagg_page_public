/**
 * DIE SCHREIBWEISE DES JOURNALS — und die Stufen, die ein Client kennt
 * (Teil XXIII, A7; Leitplanke 4: erst lesen, eine Auslieferung später schreiben).
 *
 * Das Journal bleibt im Speicher, wie es war: je Schritt ein voller Bauplan
 * (`nachher`, `vorher`). Alle Leser — Faltung, Undo, Rebase, Versatz, Autor —
 * arbeiten darauf unverändert. Neu ist nur die DATEI: ein `erzeugt`-Schritt,
 * der einen früheren Stand desselben Bauteils nur an wenigen Stellen ändert
 * (ein Eckenzug an einem Vorgang mit vier Operationen), wird als PFADÄNDERUNG
 * gegen diesen Stand gespeichert und beim Laden wieder entfaltet.
 *
 *   gespeichert:  nachher: { _pfade: { basis: '<Schritt-Id>', patch: [{pfad, wert} | {pfad, weg: true}] } }
 *
 * Die Basis ist der VORIGE Schritt desselben Bauteils in derselben Datei
 * (Reihenfolge: Commits, dann die offene Sitzung) — explizit per Id, nicht
 * „der davor", damit eine fehlende Basis auffällt statt still falsch zu falten.
 *
 * STUFEN: 2 = volle Baupläne (bis A7a), 3 = Pfadschritte, Planinhalte und
 * Rotstift im Journal, Randhöhen als Verweis, nichts Abgeleitetes (A7b),
 * 4 = neue Haltungen speichern ihre SOHLE (`achsbezug: 'sohle'`, Teil XXIV,
 * K4b). Ein Client, der Stufe 4 nicht kennt, baute eine solche Haltung um
 * DN/2 zu tief — deshalb erst der Leser (K4a), eine Auslieferung später
 * der Schreiber.
 * 5 = OPERATIONEN VERWEISEN AUFEINANDER (Teil XXIV-4): eine Auffüllung füllt
 * „bis zur Fläche" einer anderen Operation, die Böschung eines Planums zeigt
 * auf dessen Fläche statt seine Höhe zu kopieren. Ein Client, der das nicht
 * kennt, liest eine Böschung ohne eigene Höhe als `boeschung_ohne_hoehe`:
 * er zeigte das Planum OHNE Böschung, mit falschen Massen und falschem IFC —
 * und diese Warnung sieht niemand. Deshalb die Stufe.
 * Ein Journal trägt `mindestClient`, sobald es Stufe-3-Schreibweisen enthält;
 * ein Client, der weniger KENNT, liest es nur (`nurLesen`) und schreibt nie
 * darüber — ein älterer Tab startete sonst leer und überschriebe es.
 */

/**
 * Was dieser Client LESEN kann. Seit K4a: `achsbezug` im Bauplan einer Kante;
 * seit Teil XXIV-4: eine Operation, die auf die Fläche einer anderen zeigt;
 * seit Teil XXVI (Z5d): Bauwerke — ein Behälter ohne Körper (Rezept mit
 * `behaelter`) und `parameter.teilVon` an seinen Teilen.
 */
export const JOURNAL_KENNT = 7;

/**
 * Was dieser Client SCHREIBT. A7a lieferte die Leser mit 2 aus (2026-09-18
 * 16:05), K4a den Leser der Sohle mit 4 (2026-09-19 13:21). Seit 2026-09-19
 * (Fabio: „mach das alles") schreibt er 4 — A7b und K4b in EINER Auslieferung:
 * jeder Tab ab 2026-09-18 16:05 kennt `mindestClient` und liest ein neueres
 * Journal nur (`nurLesen`), statt es zu überschreiben. Aus demselben Grund
 * gehen Leser und Schreiber der Stufe 5 (Teil XXIV-4) in EINER Auslieferung:
 * ein Tab von gestern liest ein solches Journal nur und sagt es im Banner,
 * und der Server-Wächter (Fahrplan R9) hält noch ältere ab. Der Preis, offen
 * benannt: bis zum Neuladen kann ein solcher Tab im Lesemodus falsche Massen
 * zeigen und ein falsches IFC ausgeben — dieselbe Klasse wie bei Stufe 4.
 *
 * Stufe 6 (Teil XXVI, Fabios E23) ebenso in EINER Auslieferung: ein älterer
 * Tab läse ein Bauwerk als unbekanntes Rezept und gäbe die Teile ohne ihr
 * Ganzes aus — und nicht jedes Werkzeug trägt ein unbekanntes Feld wie
 * `teilVon` sicher weiter. Mit Stufe 6 liest er nur. Preis, offen: bis zum
 * Neuladen zeigt er die Teile ohne ihr Bauwerk.
 *
 * Stufe 7 (2026-10-06, die 4-MB-Grenze): die Texttabelle (`texteAuslagern`).
 * Leser und Schreiber wieder in EINER Auslieferung — ein älterer Tab sähe
 * `{"§": 12}` statt einer Herleitung; mit `mindestClient: 7` liest er nur.
 * Verlangt wird Stufe 7 nur, wenn wirklich Texte ausgelagert sind.
 */
export const SCHREIBT_AUSGELIEFERT = 7;
let _schreibt = SCHREIBT_AUSGELIEFERT;
export function schreibStufe() { return _schreibt; }

/**
 * In welchem Bezug eine NEUE oder neu geschriebene Kante ihre Höhen speichert
 * (Teil XXIV, K4). Bis Stufe 4 die Rohrmitte — ausdrücklich genannt, und ein
 * älterer Client liest sie richtig, weil sie seine Lesart ist. Ab Stufe 4 die
 * Sohle: die gespeicherte Zahl ist dann, was Werkzeug, Längsschnitt und
 * Kommando „Sohle" nennen.
 */
export function kantenbezugNeu() { return _schreibt >= 4 ? 'sohle' : 'mitte'; }
/** Nur für Tests: eine andere Schreibweise prüfen; ohne Zahl zurück auf die ausgelieferte. */
export function setzeSchreibStufeFuerTests(n) { _schreibt = n ?? SCHREIBT_AUSGELIEFERT; }

import { ABLEITUNGEN } from './ableitung/Ableitungen.js';

// ── Nichts Abgeleitetes in die Datei (B15) ─────────────────────────────────

/**
 * Den PredefinedType eines Ableitungsteils nicht speichern: er folgt aus
 * Rezept, Rolle und Parametern (`Bauteilrezepte.predefinedTypeVon`), und ein
 * gespeicherter Wert veraltete still, sobald ein Werkzeug die Parameter
 * ändert. Im Speicher bleibt er (harmlos — gelesen wird die Ableitung).
 */
export function ohneAbgeleitetes(schritt) {
    if (schritt?.art !== 'erzeugt') return schritt;
    const weg = (w) => {
        if (!w || typeof w !== 'object' || !('predefinedType' in w)) return w;
        const teil = ABLEITUNGEN[w.rezept]?.teile?.find(t => t.rolle === w.rolle);
        if (!teil || teil.predefinedType === undefined) return w;
        const { predefinedType, ...rest } = w;
        return rest;
    };
    const nachher = weg(schritt.nachher), vorher = weg(schritt.vorher);
    return nachher === schritt.nachher && vorher === schritt.vorher ? schritt : { ...schritt, nachher, vorher };
}

// ── Pfade ──────────────────────────────────────────────────────────────────

const _objekt = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Die Pfadänderungen von `alt` nach `neu` — so klein wie möglich: gleiche
 * Objekte und gleich lange Listen werden hineinverfolgt, alles andere als
 * Ganzes ersetzt.
 */
export function patchAus(alt, neu, pfad = [], aus = []) {
    if (Object.is(alt, neu)) return aus;
    if (_objekt(alt) && _objekt(neu)) {
        for (const k of Object.keys(alt)) if (!(k in neu)) aus.push({ pfad: [...pfad, k], weg: true });
        for (const k of Object.keys(neu)) {
            if (k in alt) patchAus(alt[k], neu[k], [...pfad, k], aus);
            else aus.push({ pfad: [...pfad, k], wert: neu[k] });
        }
        return aus;
    }
    if (Array.isArray(alt) && Array.isArray(neu) && alt.length === neu.length) {
        for (let i = 0; i < neu.length; i++) patchAus(alt[i], neu[i], [...pfad, i], aus);
        return aus;
    }
    // Zahlen, Texte, verschieden lange Listen, Typwechsel: als Ganzes.
    if (JSON.stringify(alt) === JSON.stringify(neu)) return aus;
    aus.push({ pfad, wert: neu });
    return aus;
}

/** Einen Patch anwenden — ohne `wert` zu verändern (Kopie entlang der Pfade). */
export function wendeAn(wert, patch) {
    let ergebnis = wert;
    for (const p of patch ?? []) ergebnis = _setze(ergebnis, p.pfad, p.weg ? undefined : p.wert, !!p.weg);
    return ergebnis;
}

function _setze(wert, pfad, neu, weg) {
    if (!pfad.length) return weg ? undefined : neu;
    const [k, ...rest] = pfad;
    const kopie = Array.isArray(wert) ? [...wert] : { ...(wert ?? {}) };
    if (rest.length === 0 && weg) {
        if (Array.isArray(kopie)) kopie.splice(k, 1); else delete kopie[k];
        return kopie;
    }
    kopie[k] = _setze(wert?.[k], rest, neu, weg);
    return kopie;
}

// ── Verdichten und Entfalten ───────────────────────────────────────────────

const _schluessel = (e) => `${e.art}|${e.globalId}`;
const _laenge = (v) => JSON.stringify(v ?? null).length;

/**
 * Schritte für die DATEI verdichten: ein `erzeugt`-Schritt mit einem
 * früheren Schritt desselben Bauteils speichert `nachher` und `vorher` als
 * Pfadänderung gegen dessen `nachher` — wenn das kürzer ist.
 * @returns {{ schritte: object[], verdichtet: number }}
 */
export function verdichte(schritte) {
    const letzter = new Map();          // Schlüssel → { id, nachher }
    let verdichtet = 0;
    const aus = schritte.map((e) => {
        if (e?.art !== 'erzeugt' || !e.id) return e;
        const vor = letzter.get(_schluessel(e));
        letzter.set(_schluessel(e), { id: e.id, nachher: e.nachher });
        if (!vor || !_objekt(vor.nachher)) return e;
        const neu = { ...e };
        for (const feld of ['nachher', 'vorher']) {
            const wert = e[feld];
            if (!_objekt(wert)) continue;
            const patch = patchAus(vor.nachher, wert);
            const form = { _pfade: { basis: vor.id, patch } };
            if (_laenge(form) < _laenge(wert)) { neu[feld] = form; verdichtet += 1; }
        }
        return neu;
    });
    return { schritte: aus, verdichtet };
}

/**
 * Schritte aus der DATEI entfalten. Eine fehlende Basis ist ein Befund, keine
 * Vermutung: der Schritt bleibt, wie er ist, und `fehlend` nennt ihn — der
 * Aufrufer liest das Journal dann nur (es zu speichern hiesse, zu raten).
 * @returns {{ schritte: object[], fehlend: string[] }}
 */
export function entfalte(schritte) {
    const nachherJe = new Map();        // Schritt-Id → entfaltetes nachher
    const fehlend = [];
    const aus = schritte.map((e) => {
        if (!e || typeof e !== 'object') return e;
        let neu = e;
        for (const feld of ['nachher', 'vorher']) {
            const v = e[feld];
            if (!_objekt(v) || !_objekt(v._pfade)) continue;
            const basis = nachherJe.get(v._pfade.basis);
            if (basis === undefined) { fehlend.push(e.id ?? '?'); continue; }
            neu = { ...neu, [feld]: wendeAn(basis, v._pfade.patch) };
        }
        if (neu.id) nachherJe.set(neu.id, neu.nachher);
        return neu;
    });
    return { schritte: aus, fehlend };
}

// ── Texttabelle (Stufe 7) ──────────────────────────────────────────────────

/**
 * DIE TEXTTABELLE (Stufe 7, 2026-10-06): lange Texte, die sich wiederholen — die
 * Herleitung jedes Schachtteils („dInnen: annahme — …"), der Vorgangstitel an
 * jedem Schritt —, stehen EINMAL in `texte` und an ihrer Stelle `{"§": i}`.
 * Gemessen an Fabios echtem Netz: 3,11 MB, davon 650 KB Herleitungen allein
 * am Bauplan (die 4-MB-Grenze des Servers, `MAX_REPO_BYTES`).
 *
 * Nur unter den Schlüsseln aus `TEXT_FELDER` (und darin tief) — nie eine
 * Kennung, Quelle oder Modellsumme: der Server liest das Journal selbst
 * (`cde._bezuege`, globalId und Quellen) und sieht dieselben Werte wie vorher.
 * Im Speicher bleibt alles voll; nur die Datei trägt Verweise.
 */
export const TEXT_FELDER = Object.freeze(new Set(['herleitung', 'vorgangTitel', 'hinweis', 'titel']));
/** Ab dieser Länge lohnt ein Verweis (`{"§":123}` sind 9 Zeichen). */
export const TEXT_AB = 16;
const VERWEIS = '§';

function _texteLaufen(wert, imFeld, besuch) {
    if (typeof wert === 'string') return imFeld && wert.length >= TEXT_AB ? besuch(wert) : wert;
    if (Array.isArray(wert)) {
        let anders = false;
        const aus = wert.map(v => { const n = _texteLaufen(v, imFeld, besuch); if (n !== v) anders = true; return n; });
        return anders ? aus : wert;
    }
    if (_objekt(wert)) {
        let aus = null;
        for (const [k, v] of Object.entries(wert)) {
            const n = _texteLaufen(v, imFeld || TEXT_FELDER.has(k), besuch);
            if (n !== v) { aus ??= { ...wert }; aus[k] = n; }
        }
        return aus ?? wert;
    }
    return wert;
}

/**
 * Wiederholte lange Texte in eine Tabelle legen.
 * @returns {{ wert: object, texte: string[] }}  `texte` leer: nichts ausgelagert, `wert` unverändert
 */
export function texteAuslagern(nutzlast) {
    const zaehler = new Map();
    _texteLaufen(nutzlast, false, (t) => { zaehler.set(t, (zaehler.get(t) ?? 0) + 1); return t; });
    const texte = [], index = new Map();
    for (const [t, n] of zaehler) if (n >= 2) { index.set(t, texte.length); texte.push(t); }
    if (!texte.length) return { wert: nutzlast, texte };
    const wert = _texteLaufen(nutzlast, false, (t) => (index.has(t) ? { [VERWEIS]: index.get(t) } : t));
    return { wert, texte };
}

/** Die Verweise wieder durch ihre Texte ersetzen. Ein Verweis ohne Text ist ein Befund (`fehlend`). */
export function texteEinlagern(wert, texte) {
    const fehlend = [];
    const lauf = (v) => {
        if (Array.isArray(v)) return v.map(lauf);
        if (_objekt(v)) {
            const schluessel = Object.keys(v);
            if (schluessel.length === 1 && schluessel[0] === VERWEIS && Number.isInteger(v[VERWEIS])) {
                const t = texte?.[v[VERWEIS]];
                if (typeof t !== 'string') { fehlend.push(v[VERWEIS]); return v; }
                return t;
            }
            return Object.fromEntries(schluessel.map(k => [k, lauf(v[k])]));
        }
        return v;
    };
    return { wert: Array.isArray(texte) && texte.length ? lauf(wert) : wert, fehlend };
}
