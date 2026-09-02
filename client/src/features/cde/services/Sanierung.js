/**
 * Sanierung — Maßnahmen und ihr Mengenauszug (Stufe 14.11).
 *
 * DIE MASSNAHMEN SIND DATEN, wie die Grenzwerte und die Typprofile. Ein Büro
 * arbeitet mit seinen eigenen Bezeichnungen, und die Liste unten ist die
 * Vorgabe, nicht das Gesetz. Sie gehört auf die Büro-Ebene (`repo.buero`,
 * Vorrang Projekt → Büro → eingebaut).
 *
 * Die drei Gruppen folgen der üblichen Einteilung im Kanalbau: reparieren
 * (örtlich), renovieren (die alte Leitung bleibt und wird ausgekleidet),
 * erneuern (die alte Leitung geht). Was ein Büro darunter im Einzelnen führt —
 * Kurzliner, Schlauchliner, Berstlining — ist eine Verfeinerung derselben drei
 * und gehört in seinen eigenen Satz.
 *
 * DER MENGENAUSZUG ist der Grund, warum das Ganze mehr ist als eine Farbe: Aus
 * „dieser Strang bekommt einen Liner" wird erst dann etwas, wenn danebensteht,
 * wie viele Meter DN 300 Beton das sind. Er rechnet aus dem, was ohnehin da
 * ist — Achse (Länge, DN) und Merkmalssatz (Material) —, und speichert nichts.
 *
 * Reines Modul: kein Vue, kein three, kein WebGL, keine Engine.
 */

export const MASSNAHMEN = Object.freeze([
    { wert: 'keine',       titel: 'keine Maßnahme',  kurz: '—' },
    { wert: 'inspektion',  titel: 'Inspektion nötig', kurz: 'INSP' },
    { wert: 'reparatur',   titel: 'Reparatur',        kurz: 'REP' },
    { wert: 'renovierung', titel: 'Renovierung (Liner)', kurz: 'REN' },
    { wert: 'erneuerung',  titel: 'Erneuerung',       kurz: 'ERN' },
]);

/** Die Maßnahme nachschlagen — nie `undefined` durchreichen. */
export function massnahmeNach(wert) {
    return MASSNAHMEN.find(m => m.wert === wert) ?? null;
}

/** Nur die, die wirklich etwas kosten — „keine" gehört in keinen Auszug. */
export function istMassnahme(wert) {
    return !!wert && wert !== 'keine' && !!massnahmeNach(wert);
}

/**
 * Mengen je Maßnahme, Nennweite und Material.
 *
 * @param {object} opts
 * @param {Array<{globalId, laenge, dn}>} opts.bauteile  aus den Achsen
 * @param {Map<string, string>} opts.stand   GlobalId → Maßnahme (aus dem Journal)
 * @param {Map<string, object>} [opts.merkmale] GlobalId → Merkmalssatz
 * @returns {{zeilen: Array, summe: {anzahl, laenge}}}
 *
 * Sortiert nach Maßnahme, dann absteigend nach Länge — die Position, die am
 * meisten ausmacht, steht oben. Ein Auszug, den man von oben liest, ist mehr
 * wert als einer, den man erst sortieren muss.
 */
export function mengenNachMassnahme({ bauteile = [], stand = new Map(), merkmale = new Map() } = {}) {
    const gruppen = new Map();
    let summeAnzahl = 0;
    let summeLaenge = 0;

    for (const b of bauteile) {
        const massnahme = stand.get(b.globalId);
        if (!istMassnahme(massnahme)) continue;

        const m = merkmale.get(b.globalId) ?? {};
        // Kein Material in der Datei ist kein Fehler — es ist eine Auskunft.
        // „unbekannt" als eigene Zeile ist ehrlicher, als es unter ein
        // beliebiges Material zu mischen.
        const material = String(m.Material ?? '').trim() || 'unbekannt';
        const dn = Number.isFinite(Number(b.dn)) && Number(b.dn) > 0 ? Number(b.dn) : null;
        const laenge = Number(b.laenge) || 0;

        const schluessel = `${massnahme}|${dn ?? '—'}|${material}`;
        if (!gruppen.has(schluessel)) {
            gruppen.set(schluessel, { massnahme, dn, material, anzahl: 0, laenge: 0 });
        }
        const z = gruppen.get(schluessel);
        z.anzahl++;
        z.laenge += laenge;
        summeAnzahl++;
        summeLaenge += laenge;
    }

    const rang = (w) => MASSNAHMEN.findIndex(m => m.wert === w);
    const zeilen = [...gruppen.values()]
        .map(z => ({ ...z, laenge: Math.round(z.laenge * 100) / 100 }))
        .sort((a, b) => rang(a.massnahme) - rang(b.massnahme) || b.laenge - a.laenge);

    return {
        zeilen,
        summe: { anzahl: summeAnzahl, laenge: Math.round(summeLaenge * 100) / 100 },
    };
}
