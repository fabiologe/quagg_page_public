/**
 * Der ISO-19650-Status-Arbeitsfluss (Lücke ④, 2026-09-02).
 *
 * Spiegel von `backend/app/api/projekt/core/cde.py::STATUS_UEBERGAENGE` —
 * der Client-Guard ist Kosmetik, der Türsteher ist das Backend (dieselbe
 * Formel wie in services/rollen.js). Hier geht es darum, im Auswahlfeld
 * keine Wege anzubieten, die der Server ablehnt, und den GRUND zu nennen.
 *
 * Der Status geht VORWÄRTS (WIP → Shared → Published → Archived); zurück ist
 * eine bewusste Rücknahme mit Rang. ADMIN darf jeden Sprung (Korrektur) —
 * auditiert wird ohnehin jeder Wechsel.
 */
import { hatMindestens, normalisiert } from '@/services/rollen';

export const STATUS_UEBERGAENGE = Object.freeze({
    'WIP':       { 'Shared': 'WERKSTUDENT' },
    'Shared':    { 'WIP': 'MITARBEITER', 'Published': 'MITARBEITER' },
    'Published': { 'Archived': 'MITARBEITER', 'Shared': 'ADMIN' },
    'Archived':  { 'Published': 'ADMIN' },
});

/**
 * Stufe 4b (IFC-Konsistenz, 2026-09-11): wer ein MODELL teilt, soll wissen, was
 * das Prüftor zu ihm sagt. Verlangt wird ein VORHANDENER Prüfbericht, kein
 * grüner. Spiegel von cde.py::UEBERGANG_VERLANGT_PRUEFUNG — test_cde.py hält
 * beide gleich.
 */
export const UEBERGANG_VERLANGT_PRUEFUNG = Object.freeze([['WIP', 'Shared']]);

/**
 * Eignung (Fahrplan Erdbau-Container, E3): WOFÜR ein Dokument taugt — neben dem
 * Status, der sagt, WO es steht (ISO 19650-2, Codes nach dem britischen Anhang NA).
 * Spiegel von cde.py::EIGNUNG — test_cde.py hält beide gleich.
 */
export const EIGNUNG = Object.freeze({
    S1: 'Koordination', S2: 'Information', S3: 'Prüfung und Kommentar',
    S4: 'Freigabe', A1: 'Freigegeben', CR: 'Bestand',
});

/**
 * @param {object} opts {von, nach, rolle, art, hatPruefung}  rolle null = unbekannt (lokal,
 *   nicht angemeldet): dann gilt der GRAPH, aber keine Rangschranke — der
 *   Server prüft sie ohnehin, und ein lokales Repo hat keinen Nutzer.
 * @returns {{ok: boolean, grund: string|null}}
 */
export function pruefeStatuswechsel({ von, nach, rolle = null, art = null, hatPruefung = true } = {}) {
    if (von === nach) return { ok: false, grund: 'Der Status gilt schon.' };
    if (normalisiert(rolle) === 'ADMIN') return { ok: true, grund: null };
    const mindest = STATUS_UEBERGAENGE[von]?.[nach];
    if (!mindest) {
        return { ok: false, grund: `${von} → ${nach} ist kein ISO-19650-Weg — erst über die Zwischenstufe.` };
    }
    if (rolle != null && !hatMindestens(rolle, mindest)) {
        return { ok: false, grund: `${von} → ${nach} braucht mindestens ${mindest}.` };
    }
    if (art === 'modell' && !hatPruefung
        && UEBERGANG_VERLANGT_PRUEFUNG.some(([a, b]) => a === von && b === nach)) {
        return { ok: false, grund: `${von} → ${nach} braucht einen Prüfbericht — erst „Prüfen" `
            + 'in der Registerzeile (Verstöße dürfen drinstehen, der Bericht muss nur da sein).' };
    }
    return { ok: true, grund: null };
}

/** Fürs Auswahlfeld: je Zielstatus {status, ok, grund}. */
export function statusZiele(von, rolle = null, alle = ['WIP', 'Shared', 'Published', 'Archived'], dok = {}) {
    return alle.map(nach => (nach === von
        ? { status: nach, ok: true, grund: null }
        : { status: nach, ...pruefeStatuswechsel({
            von, nach, rolle, art: dok.art ?? null, hatPruefung: dok.hatPruefung ?? true,
        }) }));
}
