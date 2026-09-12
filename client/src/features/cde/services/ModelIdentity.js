/**
 * Stabile Modell-Identität — ersetzt den Dateinamen als Persistenz-Schlüssel.
 *
 * Zweistufig (Stufe B der CDE-Roadmap):
 *   • `projectGlobalId` — GlobalId der IFCPROJECT-Instanz. Revisionsstabil:
 *     eine neue Revision desselben Projekts behält i. d. R. die GlobalId,
 *     Annotationen und Overrides überleben den Planstand-Wechsel.
 *   • `sha256` — Hash der Datei. Revisionsgenau: identifiziert exakt diesen
 *     Stand (Blob-Ablage, spätere Revisionserkennung in Stufe C/G).
 *
 * `key` ist der Persistenz-Schlüssel: GlobalId wenn vorhanden, sonst Hash.
 */

// IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',...) — erstes Argument ist die GlobalId.
// STEP-Physical-File ist ASCII; latin1-Decoding ist verlustfrei und schnell.
const PROJECT_RE = /IFCPROJECT\s*\(\s*'([^']{1,64})'/;

/**
 * GlobalId der IFCPROJECT-Instanz aus dem Roh-Puffer lesen.
 * Scannt erst die ersten 4 MB (dort steht das Projekt praktisch immer),
 * dann notfalls die ganze Datei. null wenn nicht gefunden.
 * @param {Uint8Array} bytes
 * @returns {string|null}
 */
export function extractProjectGlobalId(bytes) {
    if (!bytes?.length) return null;
    const decoder = new TextDecoder('latin1');
    const head = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 4 * 1024 * 1024)));
    let m = PROJECT_RE.exec(head);
    if (!m && bytes.length > 4 * 1024 * 1024) {
        m = PROJECT_RE.exec(decoder.decode(bytes));
    }
    return m?.[1] ?? null;
}

/**
 * SHA-256 der Datei als Hex-String (WebCrypto).
 * @param {Uint8Array} bytes
 * @returns {Promise<string|null>} null wenn WebCrypto fehlt (http ohne TLS)
 */
export async function sha256Hex(bytes) {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    try {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { return null; }
}

/**
 * Vollständige Identität eines IFC-Puffers.
 * @param {Uint8Array} bytes
 * @param {string} name  Dateiname (nur als letzter Fallback für den Key)
 * @returns {Promise<{ key: string, projectGlobalId: string|null, sha256: string|null }>}
 */
export async function computeModelIdentity(bytes, name = 'model') {
    const [projectGlobalId, sha256] = await Promise.all([
        Promise.resolve(extractProjectGlobalId(bytes)),
        sha256Hex(bytes),
    ]);
    const key = projectGlobalId ? `gid:${projectGlobalId}`
              : sha256          ? `sha:${sha256}`
              :                   `name:${name}`;
    return { key, projectGlobalId, sha256 };
}

// ── Der Kopf einer IFC-Datei (2026-09-11) ──────────────────────────────────
//
// Spiegel von backend/app/ifc/kopf.py. Beide lesen dieselbe Falltabelle
// (backend/app/ifc/tests/daten/kopf_faelle.json, test/ifcKopf.test.js) — zwei
// Umsetzungen, eine Tabelle. Abgelehnt wird nur, was SICHER keine IFC-Datei
// ist; Schema und Einheit sind Hinweise.
const STEP_RE = /^(?:\u00ef\u00bb\u00bf)?\s*ISO-10303-21\s*;/;
const SCHEMA_RE = /FILE_SCHEMA\s*\(\s*\(\s*'([A-Za-z0-9_]+)'/;
const LAENGE_RE = /IFCSIUNIT\s*\(\s*\*\s*,\s*\.LENGTHUNIT\.\s*,\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)/;
const VORSILBEN = Object.freeze({
    '$': 'm', '.KILO.': 'km', '.HECTO.': 'hm', '.DECA.': 'dam', '.DECI.': 'dm',
    '.CENTI.': 'cm', '.MILLI.': 'mm', '.MICRO.': 'µm', '.NANO.': 'nm',
});
const KOPF_BYTES = 4 * 1024 * 1024;

/**
 * STEP-/ZIP-Kopf, FILE_SCHEMA, SI-Längeneinheit und IFCPROJECT-GlobalId.
 * @param {Uint8Array} bytes
 * @returns {{istStep: boolean, istZip: boolean, schema: string|null, einheitHinweis: string|null, projectGlobalId: string|null}}
 */
export function leseKopf(bytes) {
    const b = bytes ?? new Uint8Array(0);
    const text = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, KOPF_BYTES)));
    const anfang = text.slice(0, 200);
    const schema = SCHEMA_RE.exec(text)?.[1]?.toUpperCase() ?? null;
    const vorsilbe = LAENGE_RE.exec(text)?.[1] ?? null;
    return {
        istStep: STEP_RE.test(anfang),
        istZip: anfang.startsWith('PK\u0003\u0004'),
        schema,
        einheitHinweis: vorsilbe ? (VORSILBEN[vorsilbe] ?? vorsilbe.replace(/\./g, '').toLowerCase()) : null,
        projectGlobalId: PROJECT_RE.exec(text)?.[1] ?? null,
    };
}

/**
 * Der Grund, warum diese Datei nicht als Modell geladen werden darf — oder null.
 * Nur `.ifc` und `.ifczip` werden geprüft; andere Endungen sind nicht Sache dieses Tors.
 */
export function kopfAblehnung(bytes, name = '') {
    const n = String(name).toLowerCase();
    const endung = n.endsWith('.ifczip') ? '.ifczip' : (n.endsWith('.ifc') ? '.ifc' : '');
    const k = leseKopf(bytes);
    if (endung === '.ifc' && !k.istStep) {
        return "keine IFC-Datei: der STEP-Kopf 'ISO-10303-21;' fehlt am Anfang "
            + '— bitte die Lieferung pruefen (falsche Endung oder beschaedigt?)';
    }
    if (endung === '.ifczip' && !k.istZip) return 'keine IFCZIP-Datei: der ZIP-Kopf fehlt am Anfang';
    return null;
}
