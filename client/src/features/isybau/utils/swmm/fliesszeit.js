/**
 * Kanalfließzeit des Netzes nach dem Lauf — Grundlage für die Regendauer nach
 * DWA-A 118:2024 (5.5.1): „der doppelten Fließzeit im Einzugsgebiet …, mindestens
 * aber 60 min“ (utils/regenNorm.js, Fahrplan „Grenzen beheben“, Stufe 2).
 *
 * Fließzeit = längste Summe L / v vom Anschlussknoten einer Fläche bis zu einem
 * Knoten ohne Abfluss (Auslass), wie im Fließzeitverfahren mit der
 * Vollfüllgeschwindigkeit v_voll = Q_voll / A_voll (Q_voll von SWMM, siehe
 * ResultsAssembler; A_voll aus dem Profil). Für Profile ohne einfache Fläche
 * dient die gerechnete Höchstgeschwindigkeit als Ersatz.
 *
 * Nicht enthalten: die Fließzeit auf der Oberfläche bis zum Kanal — die Angabe
 * ist ausdrücklich eine KANALfließzeit.
 */

/** Vollfüllfläche (m²) eines Profils in ISYBAU-Profilart; null, wenn nicht einfach bestimmbar. */
export function vollflaeche(profil) {
    const h = Number(profil?.height), b = Number(profil?.width);
    if (!(h > 0)) return null;
    switch (Number(profil?.type)) {
        case 0: case 4: return Math.PI * h * h / 4;              // Kreis (auch doppelwandig)
        case 1: return 0.5105 * h * h;                            // Ei 3:2 nach DIN 4263 (A = 4,594 r², H = 3 r)
        case 3: case 5: return (b > 0 ? b : h) * h;             // Rechteck geschlossen/offen (Breite fehlt → = Höhe, wie SwmmBuilder)
        case 8: {                                                // Trapez: Sohlbreite b, Böschung 1:m (SwmmBuilder: profile.slope, Vorgabe 1,5)
            const m = Number(profil.slope) > 0 ? Number(profil.slope) : 1.5;
            return b > 0 ? (b + m * h) * h : null;
        }
        default: return null;
    }
}

/**
 * @param {object} args
 * @param {Array} args.edges      Haltungen (fromNodeId, toNodeId, length, profile)
 * @param {Array} args.areas      Flächen (nodeId, nodeId2)
 * @param {object} args.ergebnis  results.edges: id → { capacity (l/s), maxVelocity (m/s) }
 * @returns {{ minuten: number, von: string, nach: string, haltungen: string[] } | null}
 */
export function kanalfliesszeit({ edges = [], areas = [], ergebnis = {} }) {
    const ab = new Map(); // Knoten → [{ ziel, sekunden, id }]
    for (const e of edges) {
        const von = e.fromNodeId ?? e.from, nach = e.toNodeId ?? e.to;
        const L = Number(e.length);
        if (!von || !nach || !(L > 0)) continue;
        const r = ergebnis[e.id] || {};
        const A = vollflaeche(e.profile);
        let v = A && r.capacity > 0 ? (r.capacity / 1000) / A : null;
        if (!(v > 0.05)) v = Number(r.maxVelocity) > 0.05 ? Number(r.maxVelocity) : null;
        if (!v) continue; // ohne Geschwindigkeit keine Aussage für diese Haltung
        if (!ab.has(von)) ab.set(von, []);
        ab.get(von).push({ ziel: nach, sekunden: L / v, id: e.id });
    }

    // Längste Zeit bis zum Ende des Netzes, je Knoten gemerkt; Maschen (Kreise)
    // werden beim zweiten Betreten abgeschnitten.
    const memo = new Map();
    const unterwegs = new Set();
    const bisEnde = (knoten) => {
        if (memo.has(knoten)) return memo.get(knoten);
        if (unterwegs.has(knoten)) return { sekunden: 0, weg: [], ende: knoten };
        unterwegs.add(knoten);
        let best = { sekunden: 0, weg: [], ende: knoten };
        for (const k of ab.get(knoten) || []) {
            const rest = bisEnde(k.ziel);
            const t = k.sekunden + rest.sekunden;
            if (t > best.sekunden) best = { sekunden: t, weg: [k.id, ...rest.weg], ende: rest.ende };
        }
        unterwegs.delete(knoten);
        memo.set(knoten, best);
        return best;
    };

    let ergebnisMax = null;
    const starts = new Set(areas.flatMap(a => [a.nodeId, a.nodeId2]).filter(Boolean));
    for (const s of starts) {
        const r = bisEnde(s);
        if (r.weg.length && (!ergebnisMax || r.sekunden > ergebnisMax.sekunden)) ergebnisMax = { ...r, von: s };
    }
    if (!ergebnisMax) return null;
    return {
        minuten: ergebnisMax.sekunden / 60,
        von: ergebnisMax.von,
        nach: ergebnisMax.ende,
        haltungen: ergebnisMax.weg,
    };
}
