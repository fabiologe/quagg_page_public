/**
 * Kostenkennwerte je DIN-276-Kostengruppe (Kosten Stufe 1 — Kennwertschätzung).
 *
 * Kosten = Menge × Kennwert, je KG:
 *   einheit 'm3'  → Menge = Volumen aus dem KG-Klassifikator (Qto/BBox)
 *   einheit 'stk' → Menge = Elementanzahl
 *
 * Die Default-Werte sind grobe BKI-artige Anhaltswerte (Kostenstand ~2025,
 * Neubau, brutto) — sie sind AUSGANGSPUNKT, kein Ersatz für projektspezifische
 * Kennwerte. Der Nutzer pflegt sie im Kosten-Tab; Persistenz via RepoFacade
 * (Key 'kg-kennwerte'), projektbezogen sobald Projekt-Scopes aktiv sind.
 *
 * GAEB/LV-Positionen sind bewusst NICHT Teil dieser Stufe (ERP-Territorium,
 * Roadmap Stufe H).
 */

export const KENNWERT_EINHEITEN = ['m3', 'stk'];

export const DEFAULT_KENNWERTE = Object.freeze({
    // KG 300 — Bauwerk / Baukonstruktionen
    '320': { einheit: 'm3',  wert: 350 },   // Gründung gesamt
    '322': { einheit: 'm3',  wert: 320 },   // Flachgründungen
    '323': { einheit: 'm3',  wert: 480 },   // Tiefgründungen
    '330': { einheit: 'm3',  wert: 550 },   // Außenwände (roh, gedämmt)
    '334': { einheit: 'stk', wert: 1600 },  // Außentüren/-fenster
    '337': { einheit: 'm3',  wert: 900 },   // Elementierte Außenwände / Curtain Wall
    '340': { einheit: 'm3',  wert: 420 },   // Innenwände
    '343': { einheit: 'm3',  wert: 650 },   // Innenstützen
    '350': { einheit: 'm3',  wert: 500 },   // Decken
    '360': { einheit: 'm3',  wert: 450 },   // Dächer
    '370': { einheit: 'stk', wert: 900 },   // Baukonstruktive Einbauten

    // KG 400 — Technische Anlagen
    '411': { einheit: 'stk', wert: 600 },   // Abwasseranlagen (Haltung/Formstück/Schacht gemittelt)
    '412': { einheit: 'stk', wert: 350 },   // Wasseranlagen
    '420': { einheit: 'stk', wert: 1200 },  // Wärmeversorgung
    '430': { einheit: 'stk', wert: 400 },   // Raumlufttechnik
    '440': { einheit: 'stk', wert: 250 },   // Elektro
    '460': { einheit: 'stk', wert: 8000 },  // Förderanlagen
});

/** Gespeicherte Kennwerte mit den Defaults mergen (Defaults liefern Neues nach). */
export function mergeKennwerte(stored) {
    const out = {};
    for (const [code, kw] of Object.entries(DEFAULT_KENNWERTE)) out[code] = { ...kw };
    if (stored && typeof stored === 'object') {
        for (const [code, kw] of Object.entries(stored)) {
            if (kw && typeof kw === 'object') out[code] = { ...out[code], ...kw };
        }
    }
    return out;
}

/**
 * Kostenzeilen aus KG-Klassifikation × Kennwerten.
 *
 * @param {Map} byKg        aus KgClassifier: kgCode → { count, volume_m3 }
 * @param {object} kennwerte  kgCode → { einheit, wert }
 * @returns {{ rows: Array<{kgCode, count, volume_m3, menge, einheit, wert, betrag, hasKennwert}>, summe: number }}
 */
export function computeKosten(byKg, kennwerte) {
    const rows = [];
    let summe = 0;
    if (!byKg?.size) return { rows, summe };

    for (const [kgCode, bucket] of [...byKg.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const kw = kennwerte?.[kgCode] ?? null;
        const einheit = kw?.einheit ?? 'm3';
        const wert = Number(kw?.wert);
        const menge = einheit === 'stk' ? bucket.count : bucket.volume_m3;
        const hasKennwert = Number.isFinite(wert) && wert > 0;
        const betrag = hasKennwert ? menge * wert : 0;
        rows.push({
            kgCode,
            count: bucket.count,
            volume_m3: bucket.volume_m3,
            menge, einheit,
            wert: hasKennwert ? wert : null,
            betrag,
            hasKennwert,
        });
        summe += betrag;
    }
    return { rows, summe };
}
