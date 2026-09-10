/**
 * Herkunft — woraus die CDE ein Dokument ERZEUGT hat (Stufe 3 des
 * Aushub-Fachmodells, 2026-09-10). Rein: kein Vue, kein Netz.
 *
 * Der Server schreibt die Herkunft seit dem ersten Verbund ins Manifest
 * (`verbund_lauf._herkunft`), aber bis Stufe 3 kam sie beim Viewer nie an —
 * `dokumentAusManifest` liess sie fallen. Hier steht, was der Viewer daraus
 * macht: den Chip im Register und die Vorschau, welches gelieferte Gelände im
 * Verbund WEGFÄLLT, weil es in einem Erdbau-Dokument steckt. Dieselbe Regel
 * wie `verbund_lauf.auftrag_bauen` — der Dialog soll nicht etwas anderes
 * ankündigen, als der Server tut.
 */

function _pruefung(h) {
    if (!h?.pruefung) return 'ungeprüft';
    const n = h.pruefung.verstoesse;
    return n === 0 ? 'geprüft, 0 Verstöße' : `${n} Verstöße`;
}

/**
 * Der Chip je Registerzeile — `null` für ein hochgeladenes Dokument (woher es
 * kam, weiss der Planer, nicht die CDE).
 *
 * @returns {{art: string, text: string, titel: string}|null}
 */
export function herkunftChip(dok) {
    const h = dok?.herkunft;
    if (!h?.art) return null;
    const quellen = Array.isArray(h.quellen) ? h.quellen : [];
    const satz = h.satz_name ? `Satz „${h.satz_name}“` : '';
    if (h.art === 'erdbau') {
        const erste = quellen[0];
        const aus = erste ? (erste.datei ?? String(erste.sha256 ?? '').slice(0, 12)) : '—';
        const journal = h.journal?.commit
            ? `Journalstand ${h.journal.commit}${h.journal.sitzungOffen ? ' + offene Sitzung' : ''}` : '';
        return {
            art: 'erdbau',
            text: `Erdbau · aus ${aus}${quellen.length > 1 ? ` +${quellen.length - 1}` : ''}`,
            titel: ['Erdbau-Dokument: Ur-Gelände unverändert, Aushub und Auftrag je Vorgang, Mengen',
                    satz, _pruefung(h), journal,
                    ...quellen.map(q => `Quelle ${q.datei ?? q.sha256} Rev. ${q.revision ?? '?'}`)].filter(Boolean).join(' · '),
        };
    }
    if (h.art === 'verbund') {
        const n = quellen.length + (h.eigenbau ? 1 : 0);
        return {
            art: 'verbund',
            text: `Verbund · ${n} ${n === 1 ? 'Quelle' : 'Quellen'}`,
            titel: [satz, _pruefung(h), ...(h.weggelassen ?? []).map(w => `${w.datei}: ${w.grund}`)].filter(Boolean).join(' · '),
        };
    }
    return { art: String(h.art), text: String(h.art), titel: satz };
}

/**
 * Welche Dokumente eines Satzes stecken in einem Erdbau-Dokument DESSELBEN
 * Satzes? — sha256 → Name des Erdbau-Dokuments. Was darin steckt, fällt im
 * Verbund weg (Server: `weggelassen`, Grund „steckt in …").
 *
 * Nimmt Registerzeilen beider Formen: vom Server aufgelöst (`datei`) oder aus
 * `dokumentAusManifest` (`name`).
 */
export function imErdbauEnthalten(dokumente) {
    const aus = new Map();
    for (const d of dokumente ?? []) {
        if (d?.herkunft?.art !== 'erdbau') continue;
        for (const q of d.herkunft.quellen ?? []) {
            if (q?.sha256 && !aus.has(q.sha256)) aus.set(q.sha256, d.datei ?? d.name);
        }
    }
    return aus;
}
