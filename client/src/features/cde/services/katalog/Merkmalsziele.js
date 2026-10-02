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

/**
 * 'Pset_WallCommon.LoadBearing' → { satz, merkmal } — oder null.
 *
 * Auch ein HAUSEIGENER Satz (`Quagg_Entlastung.Ueberfallbeiwert`, Fund 10 aus
 * Teil XXVI): ob es ihn gibt, sagt dasselbe Wörterbuch — der Katalog
 * `backend/app/ifc/daten/quagg-merkmale.json`, von `generiere_client` neben die
 * bSI-Vorlagen gelegt. Ein vertippter Satzname wird so kein neuer Satz.
 */
export function merkmalsziel(text) {
    const m = /^((?:Pset|Quagg)_[A-Za-z0-9]+)\.([A-Za-z][A-Za-z0-9]*)$/.exec(String(text ?? ''));
    return m ? { satz: m[1], merkmal: m[2] } : null;
}

/**
 * LAGEMASSE (Fund 10): Höhen über NN, die der gebaute Körper schon KENNT. Ein
 * Merkmal, das eine davon ist — die Schwellenhöhe einer Überlaufschwelle ist ihre
 * Oberkante —, wird nicht eingetippt, sonst stünde dieselbe Zahl zweimal da und
 * liefe beim ersten Zug am Griff auseinander. Gemessen am Paket, in m NN.
 */
export const LAGEMASSE = Object.freeze({
    oberkante: 'höchster Punkt des Körpers, m NN',
    unterkante: 'tiefster Punkt des Körpers, m NN',
});
const LAENGEN = new Set(['IfcLengthMeasure', 'IfcPositiveLengthMeasure', 'IfcNonNegativeLengthMeasure']);

/** Was an einer Deklaration `lagemerkmale: { 'Satz.Merkmal': 'oberkante' }` nicht stimmt — Liste. */
export function lagezielfehler(lagemerkmale, kategorie) {
    const fehler = [];
    if (!lagemerkmale || typeof lagemerkmale !== 'object' || Array.isArray(lagemerkmale)) {
        return ['`lagemerkmale` ist ein Objekt { "Satz.Merkmal": Lagemass }.'];
    }
    for (const [text, mass] of Object.entries(lagemerkmale)) {
        const ziel = merkmalsziel(text);
        if (!ziel) { fehler.push(`Lagemerkmal „${text}": heisst „Satz.Merkmal".`); continue; }
        if (!LAGEMASSE[mass]) { fehler.push(`Lagemerkmal „${text}": „${mass}" ist kein Lagemass (${Object.keys(LAGEMASSE).join(', ')}).`); continue; }
        if (!PSET_TEMPLATES[ziel.satz]) { fehler.push(`Lagemerkmal „${text}": den Merkmalssatz „${ziel.satz}" kennt das Wörterbuch nicht.`); continue; }
        if (!getPsetsForType(kategorie).some(([n]) => n === ziel.satz)) { fehler.push(`Lagemerkmal „${text}": „${ziel.satz}" gilt nicht für ${kategorie}.`); continue; }
        const m = _merkmalDerVorlage(ziel.satz, ziel.merkmal);
        if (!m) fehler.push(`Lagemerkmal „${text}": „${ziel.merkmal}" steht nicht in ${ziel.satz}.`);
        else if (!LAENGEN.has(m.typ)) fehler.push(`Lagemerkmal „${text}": ${m.typ} ist keine Länge — ein Lagemass ist eine Höhe in m.`);
    }
    return fehler;
}

/** Die Lagemerkmale eines Bauteils aus seinen gemessenen Höhen: { Satz: { Merkmal: Zahl } }. */
export function lagemerkmaleAus(lagemerkmale, hoehen) {
    const aus = {};
    for (const [text, mass] of Object.entries(lagemerkmale ?? {})) {
        const ziel = merkmalsziel(text);
        const wert = hoehen?.[mass];
        if (!ziel || !Number.isFinite(wert)) continue;
        (aus[ziel.satz] ??= {})[ziel.merkmal] = Math.round(wert * 1000) / 1000;
    }
    return aus;
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
    if (!ziel) return `Feld „${feld?.name}": \`pset\` heisst „Pset_Satz.Merkmal" (hauseigen: „Quagg_…"), nicht „${feld?.pset}".`;
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
    if (feld.typ !== 'zahl') return `Feld „${feld.name}": ${m.typ} braucht ein Zahlenfeld.`;
    // EINE LÄNGE (Teil XXVII, Fund 14) steht im IFC in Metern; ein Feld in mm wird
    // umgerechnet — eine andere Einheit kann hier niemand erraten.
    if (LAENGEN.has(m.typ) && !['m', 'm NN', 'mm', undefined].includes(feld.einheit)) {
        return `Feld „${feld.name}": ${m.typ} braucht ein Feld in m (auch m NN) oder mm, nicht „${feld.einheit}".`;
    }
    return null;
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
        let wert = _wertFuer(m.typ, parameter?.[f.name] ?? f.vorgabe);
        if (wert === undefined) continue;
        // Millimeter → Meter: DN 300 ist NominalDiameter 0,3 (Fund 14).
        if (LAENGEN.has(m.typ) && f.einheit === 'mm') wert = Math.round(wert) / 1000;
        (aus[ziel.satz] ??= {})[ziel.merkmal] = wert;
    }
    return aus;
}
