/**
 * Der Beleg eines Vorgangs (Teil XXIV, K2 und O4).
 *
 * Jeder Vorgang im Journal trägt am ersten Eintrag die Absicht, aus der er
 * entstand (Fabios E1). Für eine Bearbeitung ist das ihr Kommando. Für einen
 * Vorgang, den niemand mit einem Werkzeug ausgelöst hat — Rückgängig,
 * Wiederholen, Revert, Rebase, eine Konfliktentscheidung — ist es ein
 * SYSTEMBELEG: dasselbe Schema, das Werkzeug heisst `system:<name>`. Damit gilt
 * „jeder Vorgang hat genau einen Beleg" ohne Ausnahme.
 *
 * Ein Systembeleg ist ein Nachweis, kein ausführbares Kommando: `fuehreAus`
 * lehnt ihn ab (`pruefeKommando`).
 *
 * Keinen Beleg bekommt „auf die Auftragsebene heben": es entsteht kein neuer
 * Vorgang, der Eintrag WANDERT mit seinem Beleg (`gehobenVon` sagt, wer).
 *
 * Absichtlich ohne Importe — der Journal-Store liest dieses Modul, und der
 * Werkzeugkatalog soll nicht in seinen Importgraphen.
 */

/** Die Version des Kommando-Schemas. Ein Leser, der sie nicht kennt, lehnt ab (E5). */
export const KOMMANDO_SCHEMA = 1;

/** Die Systemvorgänge und ihr Titel. Ein neuer Name ist ein Eintrag hier, keine Zeichenkette irgendwo. */
export const SYSTEM_VORGAENGE = Object.freeze({
    zuruecknehmen:       'Rückgängig',
    wiederholen:         'Wiederholt',
    revert:              'Commit zurückgenommen',
    rebase:              'Auf neue Revision umgehängt',
    uebernahme:          'Übernahme',
    'basis-heben':       'Meiner gilt — gegen den neuen Wert des Planers',
    verwerfen:           'Konflikt verworfen — der Planerwert gilt',
    uebertragen:         'Konflikt übertragen',
    'art-verwerfen':     'Festlegungen verworfen',
    'vorgang-entfernen': 'Vorgang entfernt',
});

/** Das Präfix, an dem ein Systembeleg zu erkennen ist. */
export const SYSTEM_PRAEFIX = 'system:';

/** Eine Kommandokennung `ko-<Zeit>-<Zufall>` — sie wird die Vorgangskennung. */
export function neueKommandoId() {
    return `ko-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Ein Systembeleg.
 *
 * @param {string} name   Schlüssel aus `SYSTEM_VORGAENGE`
 * @param {object} [opts] `ziel` (GlobalIds), `werte` (was den Vorgang beschreibt:
 *                        der zurückgenommene Vorgang, der Commit, die Zuordnung …), `wer`
 */
export function systemBeleg(name, { ziel = [], werte = {}, wer = '', jetzt = new Date() } = {}) {
    if (!SYSTEM_VORGAENGE[name]) throw new Error(`Systemvorgang „${name}" gibt es nicht`);
    return {
        schema: KOMMANDO_SCHEMA,
        id: neueKommandoId(),
        werkzeug: `${SYSTEM_PRAEFIX}${name}`,
        ziel: [...new Set((ziel ?? []).filter(z => typeof z === 'string' && z))],
        werte: JSON.parse(JSON.stringify(werte ?? {})),
        wer: wer ?? '',
        wann: jetzt.toISOString(),
    };
}

/** Ist das ein Systembeleg? */
export function istSystemBeleg(beleg) {
    return typeof beleg?.werkzeug === 'string' && beleg.werkzeug.startsWith(SYSTEM_PRAEFIX);
}
