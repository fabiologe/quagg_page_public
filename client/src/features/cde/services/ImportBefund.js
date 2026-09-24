/**
 * Import-Befund — was eine geladene Datei über sich sagt, bevor jemand mit ihr arbeitet.
 *
 * DER CLIENT ZEIGT, DAS BACKEND URTEILT (Fahrplan IFC-Konsistenz, 2026-09-11):
 * hier wird nichts abgelehnt und nichts geändert. Ob eine Lieferung konform
 * ist, sagt das Prüftor im Backend (`backend/app/ifc/pruefe.py`). Was der
 * Client beim Laden ohnehin weiß, soll er aber SAGEN, statt es in einem
 * Kommentar oder einer Konsolenzeile zu verstecken:
 *
 *   * welches Schema die Datei hat — `IfcQuelle.schema()` gab es lange, und
 *     nur ein Test rief es auf,
 *   * welche Klassen abgekündigt sind oder nur in älteren Schemata stehen —
 *     das Wörterbuch weiß es seit es aus dem Schema erzeugt wird,
 *   * welche Klassen KEIN Schema kennt (Eigenerfindungen eines Exporteurs),
 *   * wie viel davon Proxys sind (ProVI liefert Haltung und Schacht so),
 *   * ob der Lesezugriff überhaupt aufging — vorher ein `console.warn`, und
 *     Georeferenz, Achsen und Geschosshöhen fehlten still.
 *
 * Rein: kein DOM, kein web-ifc. Die Engine sammelt die Zahlen
 * (`IfcEngine.importBefund`), hier wird nur bewertet.
 */
import { ENTITY_META } from '../data/entity-schema.js';
import { ABGEKUENDIGT } from '../data/altnamen.js';

export const ZIELSCHEMA = 'IFC4X3_ADD2';
const PROXYS = new Set(['IFCBUILDINGELEMENTPROXY', 'IFCPROXY']);
/** Ab welchem Anteil Proxys der Befund zur Zuordnung rät. */
export const PROXY_ANTEIL = 0.5;

/**
 * Lohnt es, diese Klasse zu zählen? Bauteile (unter IfcElement) und alles,
 * was kein Schema kennt. Geometrie- und Beziehungsklassen gehen zu Zehntausenden
 * in eine Datei und sagen über die Lieferung nichts.
 */
export function zaehltAlsBauteil(typ) {
    const meta = ENTITY_META[String(typ ?? '').toUpperCase()];
    return !meta || meta.hierarchy.includes('IfcElement');
}

/**
 * @param {object} opts
 * @param {string|null} [opts.schema]   aus IfcQuelle.schema()
 * @param {Array<{typ: string, anzahl: number}>} [opts.typen]  nur Bauteile (zaehltAlsBauteil)
 * @param {'ok'|'fehlt'} [opts.quelle]
 * @param {string|null} [opts.grund]    warum die Quelle fehlt
 * @param {string[]} [opts.netz]         was die Achslese nicht lesen konnte (T6)
 * @returns {{schema, quelle, grund, bauteile, proxy, abgekuendigt, waisen, unbekannt, texte}}
 */
export function importBefund({ schema = null, typen = [], quelle = 'ok', grund = null, netz = [] } = {}) {
    const abgekuendigt = [];
    const waisen = [];
    const unbekannt = [];
    let bauteile = 0;
    let proxy = 0;
    for (const { typ, anzahl } of typen) {
        const k = String(typ ?? '').toUpperCase();
        const n = Number(anzahl) || 0;
        if (!n) continue;
        bauteile += n;
        const meta = ENTITY_META[k];
        if (!meta) { unbekannt.push({ typ: k, anzahl: n }); continue; }
        if (PROXYS.has(k)) proxy += n;
        if (ABGEKUENDIGT.includes(k)) abgekuendigt.push({ typ: k, anzahl: n });
        if (!meta.schema.includes(ZIELSCHEMA)) waisen.push({ typ: k, anzahl: n, nachfolger: meta.nachfolger ?? null });
    }

    const texte = [];
    if (quelle !== 'ok') {
        texte.push({ schwere: 'warnung', text: `Die Datei ließ sich nicht zum Lesen öffnen (${grund || 'ohne Grund'}) `
            + '— Georeferenz, Achsen und Geschosshöhen fehlen für dieses Modell.' });
    }
    if (schema && schema !== ZIELSCHEMA) {
        texte.push({ schwere: 'hinweis', text: `Schema ${schema}. Ein Verbund hebt es auf ${ZIELSCHEMA} `
            + '(über IFC4, wenn nötig).' });
    }
    if (unbekannt.length) {
        texte.push({ schwere: 'warnung', text: `${_liste(unbekannt)} — in keinem IFC-Schema. `
            + 'Der Exporteur benutzt eigene Namen; die Vererbung greift dort nicht.' });
    }
    if (waisen.length) {
        texte.push({ schwere: 'hinweis', text: `${_liste(waisen)} — nur in älteren Schemata. `
            + `In ${ZIELSCHEMA}: ${waisen.map(w => w.nachfolger ?? 'gestrichen').join(', ')}.` });
    }
    if (abgekuendigt.length) {
        texte.push({ schwere: 'hinweis', text: `${_liste(abgekuendigt)} — von buildingSMART abgekündigt, `
            + `in ${ZIELSCHEMA} aber noch gültig.` });
    }
    if (bauteile && proxy / bauteile >= PROXY_ANTEIL) {
        texte.push({ schwere: 'hinweis', text: `${proxy} von ${bauteile} Bauteilen sind Proxys — `
            + 'was sie sind, sagt erst eine Bauformregel (Panel „Bauformen").' });
    }
    // DAS NETZ (Tragfähig, T6): eine Haltung ohne Ort fehlt sonst still im
    // Längsschnitt und in der Prüfliste. Genannt wird, was fehlt — die ersten
    // drei beim Namen, der Rest als Zahl.
    if (netz?.length) {
        const erste = netz.slice(0, 3).join('; ');
        texte.push({ schwere: 'warnung', text: `${netz.length} × im Netz nicht verortet: ${erste}`
            + (netz.length > 3 ? ` … und ${netz.length - 3} weitere.` : '.') });
    }
    return { schema, quelle, grund, bauteile, proxy, abgekuendigt, waisen, unbekannt, netz: [...(netz ?? [])], texte };
}

function _liste(eintraege) {
    return eintraege.map(e => `${e.anzahl} × ${ENTITY_META[e.typ]?.name ?? e.typ}`).join(', ');
}
