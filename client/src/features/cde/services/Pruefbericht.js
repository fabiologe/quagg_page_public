/**
 * Der Prüfbericht des Prüftors — GELESEN, nicht geurteilt (IFC-Konsistenz, Stufe 6).
 *
 * Das Backend urteilt (`backend/app/ifc/pruefe.py`); hier steht nur, wie der
 * Client einen Befund liest. Die eine Regel, die er dafür braucht — was sperrt —
 * ist dieselbe wie `pruefe.offen`: nicht bestanden (false ODER ungeprüft) UND
 * Schwere „fehler". Ein Befund ohne Schwere ist ein Fehler (so waren alle vor
 * den Stufen gemeint), einer ohne Stufe gehört zum Verbund (Vorgabe von `_befund`).
 *
 * Gehalten gegen einen ECHTEN Bericht: `backend/app/ifc/tests/daten/bericht_pruefe.json`,
 * geschrieben vom Unterprozess selbst (test_bericht.py) — test/pruefberichtPanel.test.js.
 */

/** Die Felder eines Befunds (pruefe._befund). Kommt eins dazu, fällt pruefberichtPanel.test.js. */
export const BEFUND_FELDER = Object.freeze(['id', 'titel', 'ok', 'sagt', 'zahl', 'stufe', 'schwere', 'beispiele', 'teile']);

/** Die Stufen in der Reihenfolge des Prüftors. */
export const STUFEN = Object.freeze([
    Object.freeze({ stufe: 'schema', titel: 'Schema — SPF-Syntax, EXPRESS, Where-Rules' }),
    Object.freeze({ stufe: 'verbund', titel: 'Verbundregeln' }),
    Object.freeze({ stufe: 'ids', titel: 'Projektanforderungen (IDS)' }),
    Object.freeze({ stufe: 'gherkin', titel: 'Normative Regeln (buildingSMART)' }),
    Object.freeze({ stufe: 'motor', titel: 'Zweiter Motor (web-ifc)' }),
]);

/** Sperrt dieser Befund? Dieselbe Regel wie `pruefe.offen`. */
export function istOffen(b) {
    return b?.ok !== true && (b?.schwere ?? 'fehler') === 'fehler';
}

/** Wie der Befund aussieht: 'ok' | 'fehler' | 'warnung' | 'hinweis'. */
export function ampel(b) {
    if (b?.ok === true) return 'ok';
    if (istOffen(b)) return 'fehler';
    return b?.schwere === 'hinweis' ? 'hinweis' : 'warnung';
}

/** Befunde nach Stufe, in der Reihenfolge des Prüftors; unbekannte Stufen hinten, nichts fällt heraus. */
export function gruppiere(befunde) {
    const titel = new Map(STUFEN.map(s => [s.stufe, s.titel]));
    const gruppen = new Map(STUFEN.map(s => [s.stufe, []]));
    for (const b of befunde ?? []) {
        const stufe = b?.stufe || 'verbund';
        if (!gruppen.has(stufe)) gruppen.set(stufe, []);
        gruppen.get(stufe).push(b);
    }
    return [...gruppen]
        .filter(([, liste]) => liste.length)
        .map(([stufe, liste]) => ({ stufe, titel: titel.get(stufe) ?? stufe, befunde: liste }));
}

/** Wie viele sperren, warnen, weisen hin, bestehen. */
export function zaehle(befunde) {
    const z = { sperrend: 0, warnungen: 0, hinweise: 0, bestanden: 0, gesamt: 0 };
    for (const b of befunde ?? []) {
        z.gesamt++;
        const a = ampel(b);
        if (a === 'ok') z.bestanden++;
        else if (a === 'fehler') z.sperrend++;
        else if (a === 'hinweis') z.hinweise++;
        else z.warnungen++;
    }
    return z;
}
