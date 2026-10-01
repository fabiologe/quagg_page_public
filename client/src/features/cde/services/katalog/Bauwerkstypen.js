/**
 * BAUWERKSTYPEN — die Klassifizierung eines Bauwerks (Teil XXVI, Z7).
 *
 * IfcFacility hat keinen PredefinedType, und eine Klasse „Becken" gibt es in
 * IFC nicht (docs/cde/ifc-sonderbauwerk.md, Abschn. 0). Was ein Bauwerk IST,
 * sagt eine KLASSIFIZIERUNG: der Schreiber macht daraus IfcClassification +
 * IfcClassificationReference am Bauwerk — nachschlagbar, versioniert.
 *
 * Die Kürzel sind DATEN mit Quelle, nicht Code. Aufgenommen ist nur, was in der
 * Bibliothek wörtlich belegt ist (NormRAG, 2026-10-01):
 *
 *   „Kürzel der Bauwerktypen — PW Pumpwerk · RUEB Regenüberlaufbecken (Becken) ·
 *    RKB Regenklärbecken (Becken) · RRB Regenrückhaltebecken (Becken) ·
 *    RRSB Regenrückstaubecken (Becken) · RRG …"
 *   — Arbeitshilfen Abwasser, Stand 2015-12, Anhang A-1
 *
 * Die Liste geht dort weiter; was dahinter steht, ist NICHT gelesen und deshalb
 * nicht hier. Wer ein Kürzel braucht, schlägt es nach und trägt es mit Fundstelle ein.
 * Das isybau-Werkzeug kennt dieselben Kürzel — es wird NICHT importiert (kein
 * Feature importiert aus einem anderen); die fachliche Doppelung ist der Preis.
 */
export const BAUWERKSKLASSIFIKATION = Object.freeze({
    system: 'Arbeitshilfen Abwasser',
    edition: '2015-12',
    quelle: 'Arbeitshilfen Abwasser (Stand 2015-12), Anhang A-1 „Kürzel der Bauwerktypen"',
    typen: Object.freeze({
        RUEB: Object.freeze({ name: 'Regenüberlaufbecken', gruppe: 'Becken' }),
        RKB: Object.freeze({ name: 'Regenklärbecken', gruppe: 'Becken' }),
        RRB: Object.freeze({ name: 'Regenrückhaltebecken', gruppe: 'Becken' }),
        RRSB: Object.freeze({ name: 'Regenrückstaubecken', gruppe: 'Becken' }),
        PW: Object.freeze({ name: 'Pumpwerk', gruppe: 'Pumpwerk' }),
    }),
});

/** Die Auswahl im Formular: Kürzel und Name. */
export const BAUWERKSTYP_OPTIONEN = Object.freeze(
    Object.entries(BAUWERKSKLASSIFIKATION.typen).map(([wert, t]) => Object.freeze({ wert, titel: `${wert} — ${t.name}` })));

/** Die Klassifizierung fürs Paket — oder null, wenn der Code nicht im Katalog steht. */
export function klassifikationVon(code) {
    const t = BAUWERKSKLASSIFIKATION.typen[code];
    if (!t) return null;
    const { system, edition, quelle } = BAUWERKSKLASSIFIKATION;
    return { system, edition, code, name: t.name, quelle };
}
