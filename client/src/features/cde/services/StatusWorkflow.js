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
 * @param {object} opts {von, nach, rolle}  rolle null = unbekannt (lokal,
 *   nicht angemeldet): dann gilt der GRAPH, aber keine Rangschranke — der
 *   Server prüft sie ohnehin, und ein lokales Repo hat keinen Nutzer.
 * @returns {{ok: boolean, grund: string|null}}
 */
export function pruefeStatuswechsel({ von, nach, rolle = null } = {}) {
    if (von === nach) return { ok: false, grund: 'Der Status gilt schon.' };
    if (normalisiert(rolle) === 'ADMIN') return { ok: true, grund: null };
    const mindest = STATUS_UEBERGAENGE[von]?.[nach];
    if (!mindest) {
        return { ok: false, grund: `${von} → ${nach} ist kein ISO-19650-Weg — erst über die Zwischenstufe.` };
    }
    if (rolle != null && !hatMindestens(rolle, mindest)) {
        return { ok: false, grund: `${von} → ${nach} braucht mindestens ${mindest}.` };
    }
    return { ok: true, grund: null };
}

/** Fürs Auswahlfeld: je Zielstatus {status, ok, grund}. */
export function statusZiele(von, rolle = null, alle = ['WIP', 'Shared', 'Published', 'Archived']) {
    return alle.map(nach => (nach === von
        ? { status: nach, ok: true, grund: null }
        : { status: nach, ...pruefeStatuswechsel({ von, nach, rolle }) }));
}
