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
 * Rotstift im Journal, Randhöhen als Verweis, nichts Abgeleitetes (A7b).
 * Ein Journal trägt `mindestClient`, sobald es Stufe-3-Schreibweisen enthält;
 * ein Client, der weniger KENNT, liest es nur (`nurLesen`) und schreibt nie
 * darüber — ein älterer Tab startete sonst leer und überschriebe es.
 */

/** Was dieser Client LESEN kann. */
export const JOURNAL_KENNT = 3;

/**
 * Was dieser Client SCHREIBT. A7a liefert die Leser mit 2 aus; erst wenn sie
 * überall laufen (eine Auslieferung später, A7b), wird hier 3 gesetzt.
 */
let _schreibt = 2;
export function schreibStufe() { return _schreibt; }
/** Nur für Tests: die Schreibweise von A7b prüfen, bevor sie ausgeliefert wird. */
export function setzeSchreibStufeFuerTests(n) { _schreibt = n; }

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
