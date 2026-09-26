/**
 * Automatische Wahl des Überstauverfahrens (SWMM SURCHARGE_METHOD SLOT | EXTRAN).
 *
 * Keines der beiden Verfahren gewinnt überall (gemessen, doc/04 Abschn. 5):
 * am Übungsnetz hielt EXTRAN die Bilanz, drückte aber Wasserspiegel 8,6 m über den
 * höchsten Deckel des Netzes; an test.xml hatte SLOT 14,3 % Bilanzfehler. Deshalb
 * rechnet die Automatik beide und nimmt das plausiblere Ergebnis.
 *
 * Prüfungen je Lauf:
 *  1. kein SWMM-Abbruch;
 *  2. |Kontinuitätsfehler Abflusstransport| ≤ 5 % — Rossman (2017), SWMM Reference
 *     Manual Vol. II, Abschn. 3.4: 5–10 % deuten auf numerische Instabilität;
 *  3. kein Wasserspiegel über dem höchsten Deckel des Netzes: Regenabfluss fließt
 *     unter Schwerkraft, er kann Wasser nicht über den höchsten Geländepunkt heben.
 *     Unterhalb einer Pumpe kommt deren Nullförderhöhe hinzu.
 * Wahl: unter den plausiblen Läufen der mit dem kleineren |Bilanzfehler|; ist keiner
 * plausibel, trotzdem der kleinere — gekennzeichnet.
 */

export const BILANZ_GRENZE_PCT = 5;
export const VERFAHREN = ['SLOT', 'EXTRAN'];

const zahl = (v, stellen = 1) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });

/** Deckelhöhe eines Knotens: coverZ, sonst Sohle + Tiefe (wie die Überstau-Kennzeichnung). */
export function deckelhoehe(knoten) {
    if (knoten?.coverZ !== undefined && knoten?.coverZ !== null && Number.isFinite(Number(knoten.coverZ))) {
        return Number(knoten.coverZ);
    }
    return Number(knoten?.z) + Number(knoten?.depth || 3);
}

/** Obergrenze des Wasserspiegels je Knoten: höchster Deckel + Nullförderhöhe vorgeschalteter Pumpen. */
function schranken(inputNodes, edges = [], pumpen = []) {
    const hoechster = Math.max(...Object.values(inputNodes).map(deckelhoehe).filter(Number.isFinite));
    const ab = new Map();
    for (const e of edges) {
        if (!ab.has(e.fromNodeId)) ab.set(e.fromNodeId, []);
        ab.get(e.fromNodeId).push(e.toNodeId);
    }
    const zuschlag = new Map();
    for (const { ziel, nullfoerderhoehe } of pumpen) {
        const q = [ziel];
        const gesehen = new Set(q);
        while (q.length) {
            const n = q.shift();
            zuschlag.set(n, Math.max(zuschlag.get(n) || 0, Number(nullfoerderhoehe) || 0));
            for (const m of ab.get(n) || []) if (!gesehen.has(m)) { gesehen.add(m); q.push(m); }
        }
    }
    return { hoechster, grenze: (id) => hoechster + (zuschlag.get(id) || 0) };
}

/**
 * @param {{verfahren:string, abbruch?:string, flowError?:number, nichtKonv?:number, nodes?:Object}} lauf
 *   nodes: RptParser-Knoten mit maxHGL
 * @param {{inputNodes:Object, edges?:Array, pumpen?:Array<{ziel:string, nullfoerderhoehe:number}>}} netz
 */
export function bewerteLauf(lauf, netz) {
    const bewertung = {
        verfahren: lauf.verfahren,
        bilanz: Number.isFinite(lauf.flowError) ? lauf.flowError : null,
        nichtKonv: Number.isFinite(lauf.nichtKonv) ? lauf.nichtKonv : null,
        maxUeberHoechstemDeckel: null,
        plausibel: false,
        gruende: []
    };
    if (lauf.abbruch) {
        bewertung.abbruch = lauf.abbruch;
        bewertung.gruende.push(`SWMM-Abbruch: ${lauf.abbruch}`);
        return bewertung;
    }
    if (bewertung.bilanz === null || Math.abs(bewertung.bilanz) > BILANZ_GRENZE_PCT) {
        bewertung.gruende.push(bewertung.bilanz === null
            ? 'Bilanzfehler nicht lesbar'
            : `Bilanzfehler ${zahl(bewertung.bilanz)} % > ${BILANZ_GRENZE_PCT} %`);
    }
    const { hoechster, grenze } = schranken(netz.inputNodes, netz.edges, netz.pumpen);
    let schlimmster = null;
    for (const [id, k] of Object.entries(lauf.nodes || {})) {
        const hgl = Number(k?.maxHGL);
        if (!Number.isFinite(hgl)) continue;
        const ueber = hgl - hoechster;
        if (!schlimmster || ueber > schlimmster.m) schlimmster = { id, m: ueber };
        if (hgl > grenze(id) + 0.01 && !bewertung.gruende.some(g => g.startsWith('Wasserspiegel'))) {
            bewertung.gruende.push(`Wasserspiegel an ${id} ${zahl(hgl - grenze(id))} m über dem höchsten Deckel des Netzes`);
        }
    }
    bewertung.maxUeberHoechstemDeckel = schlimmster;
    bewertung.plausibel = bewertung.gruende.length === 0;
    return bewertung;
}

/** @param {Array} bewertungen Ergebnis von bewerteLauf je Verfahren */
export function waehleVerfahren(bewertungen) {
    const betrag = (b) => (b.bilanz === null ? Infinity : Math.abs(b.bilanz));
    const kleinster = (liste) => [...liste].sort((a, b) => betrag(a) - betrag(b))[0];
    const plausibel = bewertungen.filter(b => b.plausibel);
    const brauchbar = bewertungen.filter(b => !b.abbruch);
    const sieger = plausibel.length ? kleinster(plausibel) : kleinster(brauchbar.length ? brauchbar : bewertungen);
    const andere = bewertungen.filter(b => b !== sieger);

    let grund;
    if (plausibel.length === bewertungen.length) {
        grund = `beide plausibel; kleinerer Bilanzfehler: ${sieger.verfahren} ${zahl(sieger.bilanz, 2)} % gegenüber `
            + andere.map(b => `${b.verfahren} ${zahl(b.bilanz, 2)} %`).join(', ');
    } else if (plausibel.length) {
        grund = andere.map(b => `${b.verfahren} verworfen: ${b.gruende.join('; ')}`).join(' · ');
    } else {
        grund = `kein Verfahren plausibel — ${bewertungen.map(b => `${b.verfahren}: ${b.gruende.join('; ')}`).join(' · ')}`;
    }
    return {
        gewaehlt: sieger?.verfahren ?? null,
        grund,
        keinerPlausibel: plausibel.length === 0,
        laeufe: bewertungen
    };
}
