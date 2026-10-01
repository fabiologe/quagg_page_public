/**
 * MERKMALSZIELE — ein Rezeptfeld, das zugleich ein bSI-Merkmal ist (Teil XXVI, Z3).
 *
 * Ein Feld darf sagen, wohin sein Wert im IFC gehört:
 *
 *     { name: 'tragend', typ: 'auswahl', optionen: JA_NEIN, vorgabe: 'ja',
 *       setzbar: true, pset: 'Pset_WallCommon.LoadBearing' }
 *
 * Bis Z3 schrieb der Eigenbau KEINEN bSI-Merkmalssatz (Fund 2, gemessen): eine
 * eigene Platte verfehlte die hauseigene IDS-Regel „Decken — Tragend markiert".
 * Das Wissen, WAS eine Platte trägt, gehört an den Katalogeintrag — als Daten,
 * sichtbar und überschreibbar —, nicht in den Schreiber.
 *
 * Wer entscheidet was:
 *   - das KATALOGSCHEMA prüft beim Laden, ob es Satz und Merkmal für die
 *     Vorgabeklasse des Rezepts gibt und ob der Feldtyp zum Merkmal passt
 *     (`zielfehler`), gegen das erzeugte Wörterbuch (`data/pset-templates.js`);
 *   - `merkmaleAusFeldern` SAMMELT nur — Wert oder Vorgabe, umgerechnet in den
 *     Typ der Vorlage;
 *   - der SCHREIBER entscheidet zuletzt, gegen die Klasse, die das Bauteil
 *     WIRKLICH hat (der Planer kann den Typ ändern), und nennt, was er
 *     verwirft (`eigenbau._bsi_merkmale`).
 *
 * Rein: kein Store, keine Engine.
 */
import { PSET_TEMPLATES, getPsetsForType } from '../../data/pset-templates.js';

/** Ja/Nein als Auswahl — ein Formular liefert Text, das Merkmal will einen Wahrheitswert. */
export const JA_NEIN = Object.freeze([
    Object.freeze({ wert: 'ja', titel: 'ja' }),
    Object.freeze({ wert: 'nein', titel: 'nein' }),
]);

const TEXTTYPEN = new Set(['IfcLabel', 'IfcText', 'IfcIdentifier']);
const WAHRHEIT = new Set(['IfcBoolean', 'IfcLogical']);

/** 'Pset_WallCommon.LoadBearing' → { satz, merkmal } — oder null. */
export function merkmalsziel(text) {
    const m = /^(Pset_[A-Za-z0-9]+)\.([A-Za-z][A-Za-z0-9]*)$/.exec(String(text ?? ''));
    return m ? { satz: m[1], merkmal: m[2] } : null;
}

/** Die Vorlage eines Merkmals: { typ, aufzaehlung } — oder null. */
function _merkmalDerVorlage(satz, merkmal) {
    const p = PSET_TEMPLATES[satz]?.props?.find(x => x.name === merkmal);
    return p ? { typ: p.type, aufzaehlung: Array.isArray(p.values) && p.values.length > 0 } : null;
}

/**
 * Was an einem Feld mit `pset` nicht stimmt — oder null.
 * @param feld       das Rezeptfeld
 * @param kategorie  die Vorgabeklasse des Rezepts (`kategorieVorgabe`)
 */
export function zielfehler(feld, kategorie) {
    const ziel = merkmalsziel(feld?.pset);
    if (!ziel) return `Feld „${feld?.name}": \`pset\` heisst „Pset_Satz.Merkmal", nicht „${feld?.pset}".`;
    if (!PSET_TEMPLATES[ziel.satz]) return `Feld „${feld.name}": den Merkmalssatz „${ziel.satz}" kennt das Wörterbuch nicht.`;
    if (!getPsetsForType(kategorie).some(([n]) => n === ziel.satz)) {
        return `Feld „${feld.name}": „${ziel.satz}" gilt nicht für ${kategorie}.`;
    }
    const m = _merkmalDerVorlage(ziel.satz, ziel.merkmal);
    if (!m) return `Feld „${feld.name}": „${ziel.merkmal}" steht nicht in ${ziel.satz}.`;
    if (m.aufzaehlung) return `Feld „${feld.name}": ${ziel.satz}.${ziel.merkmal} ist eine Aufzählung — noch nicht unterstützt.`;
    if (WAHRHEIT.has(m.typ)) {
        const werte = (feld.optionen ?? []).map(o => o?.wert);
        const ok = feld.typ === 'auswahl' && werte.length === 2 && werte.includes('ja') && werte.includes('nein');
        return ok ? null : `Feld „${feld.name}": ${m.typ} braucht eine Auswahl ja/nein (\`JA_NEIN\`).`;
    }
    if (TEXTTYPEN.has(m.typ)) {
        return ['text', 'auswahl'].includes(feld.typ) ? null : `Feld „${feld.name}": ${m.typ} braucht ein Text- oder Auswahlfeld.`;
    }
    return feld.typ === 'zahl' ? null : `Feld „${feld.name}": ${m.typ} braucht ein Zahlenfeld.`;
}

/** Ein Feldwert im Typ der Vorlage — oder undefined, wenn er nicht passt (dann schweigt das Merkmal). */
function _wertFuer(typ, roh) {
    if (roh === undefined || roh === null || roh === '') return undefined;
    if (WAHRHEIT.has(typ)) {
        if (roh === true || roh === 'ja') return true;
        if (roh === false || roh === 'nein') return false;
        return undefined;
    }
    if (TEXTTYPEN.has(typ)) return String(roh).trim() || undefined;
    const z = Number(roh);
    return Number.isFinite(z) ? z : undefined;
}

/**
 * Die bSI-Merkmale eines Bauplans: { 'Pset_WallCommon': { LoadBearing: true } }.
 * Fehlt der Wert im Bauplan, gilt die Vorgabe des Feldes — wie bei jedem Mass
 * (`massAus(…, { rueckfall })`): ein fehlender Parameter heisst „Vorgabe".
 */
export function merkmaleAusFeldern(felder, parameter = {}) {
    const aus = {};
    for (const f of felder ?? []) {
        const ziel = merkmalsziel(f?.pset);
        if (!ziel) continue;
        const m = _merkmalDerVorlage(ziel.satz, ziel.merkmal);
        if (!m) continue;
        const wert = _wertFuer(m.typ, parameter?.[f.name] ?? f.vorgabe);
        if (wert === undefined) continue;
        (aus[ziel.satz] ??= {})[ziel.merkmal] = wert;
    }
    return aus;
}
