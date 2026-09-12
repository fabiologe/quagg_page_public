/**
 * IDS 1.0 (buildingSMART) → das Eigenformat der Vorschau (IdsDefaults.js).
 *
 * KANONISCH IST DIE IDS-DATEI (Fahrplan IFC-Konsistenz, Stufe 5). Das Backend
 * prüft sie verbindlich mit ifctester (`backend/app/ifc/pruefe.py`, Stufe ids);
 * der Client zeigt eine VORSCHAU am geladenen Modell über seine eigene
 * Pset-Lesung (IdsValidator.js). Dafür wird hier übersetzt — nur, was die
 * Vorschau kann. Den Rest BENENNT `nichtInVorschau`, statt ihn still zu
 * verwerfen: eine Anforderung, die im Cockpit fehlt, gilt im Backend trotzdem.
 *
 * Die Vorschau kann: Anwendbarkeit = genau eine Klasse (dazu höchstens eine
 * Property — mit Wert oder nur vorhanden); Anforderungen = Attribut vorhanden,
 * Property vorhanden, Property = Wert.
 *
 * SCHWERE: IDS kennt keine. Die CDE liest sie aus `instructions` der
 * Spezifikation („Schwere: Fehler | Warnung | Hinweis"), Vorgabe Warnung —
 * dieselbe Konvention steht im Kopf der Starter-Datei.
 *
 * fast-xml-parser statt DOMParser: läuft im Browser UND in den Node-Tests.
 */
import { XMLParser } from 'fast-xml-parser';

const LISTEN = new Set(['specification', 'entity', 'attribute', 'property', 'classification', 'material', 'partOf']);
const _parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    isArray: name => LISTEN.has(name),
});
const SCHWEREN = Object.freeze({ fehler: 'error', warnung: 'warning', hinweis: 'info' });

/** `<simpleValue>X</simpleValue>` → {wert, einfach}; eine xs:restriction kann die Vorschau nicht. */
function _wert(knoten) {
    if (knoten == null) return { wert: null, einfach: true };
    if (typeof knoten !== 'object') return { wert: String(knoten), einfach: true };
    if ('simpleValue' in knoten) return { wert: String(knoten.simpleValue), einfach: true };
    return { wert: null, einfach: false };
}

function _anwendbarkeit(anw, gruende) {
    const entitaeten = anw?.entity ?? [];
    if (entitaeten.length !== 1) gruende.push('Anwendbarkeit braucht genau eine Klasse');
    const klasse = _wert(entitaeten[0]?.name);
    if (!klasse.einfach) gruende.push('Klasse als Muster oder Aufzählung');
    if (entitaeten[0]?.predefinedType != null) gruende.push('PredefinedType in der Anwendbarkeit');
    for (const art of ['attribute', 'classification', 'material', 'partOf']) {
        if ((anw?.[art] ?? []).length) gruende.push(`Anwendbarkeit über ${art}`);
    }
    const bedingungen = anw?.property ?? [];
    if (bedingungen.length > 1) gruende.push('mehr als eine Property in der Anwendbarkeit');
    let psetCondition;
    if (bedingungen.length === 1) {
        const [ps, name, wert] = ['propertySet', 'baseName', 'value'].map(k => _wert(bedingungen[0][k]));
        if (!ps.einfach || !name.einfach || !wert.einfach) {
            gruende.push('Property-Bedingung als Muster oder Aufzählung');
        } else {
            // Ohne <value> heißt die Bedingung in IDS 1.0 „die Property ist da" (ifctester
            // facet.Property: vorhanden und nicht leer) → `value: null`. So erkennt die
            // Starter-IDS ein Element der CDE: es trägt Quagg_CDE.CdeId (Fahrplan
            // Erdbau-Container, Stufe 4).
            psetCondition = { psetName: ps.wert, propertyName: name.wert, value: wert.wert };
        }
    }
    const out = { category: String(klasse.wert ?? '').toUpperCase() };
    if (psetCondition) out.psetCondition = psetCondition;
    return out;
}

function _anforderungen(req, gruende) {
    const out = [];
    for (const a of req?.attribute ?? []) {
        const name = _wert(a.name);
        if (!name.einfach || a.value != null) { gruende.push(`Attribut ${name.wert ?? '(Muster)'} mit Wertvorgabe`); continue; }
        out.push({ kind: 'attribute', name: name.wert, message: a['@_instructions'] ?? `${name.wert} fehlt` });
    }
    for (const p of req?.property ?? []) {
        const [ps, name, wert] = ['propertySet', 'baseName', 'value'].map(k => _wert(p[k]));
        if (!ps.einfach || !name.einfach || !wert.einfach) { gruende.push('Property als Muster oder Aufzählung'); continue; }
        const message = p['@_instructions'] ?? `${ps.wert}.${name.wert} fehlt`;
        out.push(wert.wert == null
            ? { kind: 'pset', psetName: ps.wert, propertyName: name.wert, message }
            : { kind: 'pset-equals', psetName: ps.wert, propertyName: name.wert, value: wert.wert, message });
    }
    for (const art of ['entity', 'classification', 'material', 'partOf']) {
        if ((req?.[art] ?? []).length) gruende.push(`Anforderung über ${art}`);
    }
    return out;
}

/**
 * @param {string} xml  eine IDS-1.0-Datei
 * @returns {{titel: string, specs: object[], nichtInVorschau: Array<{id, name, gruende: string[]}>}}
 */
export function parseIds(xml) {
    const wurzel = _parser.parse(String(xml ?? ''))?.ids;
    if (!wurzel) throw new Error('keine IDS-Datei: die Wurzel <ids> fehlt');
    const specs = [];
    const nichtInVorschau = [];
    (wurzel.specifications?.specification ?? []).forEach((s, i) => {
        const id = s['@_identifier'] || `ids-${i + 1}`;
        const name = s['@_name'] ?? `Spezifikation ${i + 1}`;
        const gruende = [];
        const applicability = _anwendbarkeit(s.applicability, gruende);
        const requirements = _anforderungen(s.requirements, gruende);
        if (gruende.length || !applicability.category) {
            nichtInVorschau.push({ id, name, gruende });
            return;
        }
        const schwere = /Schwere:\s*(\p{L}+)/iu.exec(String(s['@_instructions'] ?? ''))?.[1]?.toLowerCase();
        specs.push({
            id, name, description: s['@_description'] ?? '', enabled: true,
            severity: SCHWEREN[schwere] ?? 'warning', applicability, requirements,
        });
    });
    return { titel: String(wurzel.info?.title ?? ''), specs, nichtInVorschau };
}
