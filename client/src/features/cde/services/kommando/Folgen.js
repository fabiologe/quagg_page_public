/**
 * HÖHEN FOLGEN (Teil XXVII, B5 — Fabios E25): ein Bauteil, das AUF einem anderen
 * steht (`parameter.hoeheVon: { bauteil, mass, versatz }`), folgt dessen Ober-
 * oder Unterkante — die Wand der Bodenplatte, die Decke den Wänden.
 *
 * Der Verweis wirkt beim SCHREIBEN, nicht beim Lesen: ändert ein Kommando ein
 * Bauteil, rechnet diese Funktion die Höhen der Teile nach, die darauf stehen
 * (und deren Teile, bis 16 Stufen tief), und der Kommandoweg schreibt sie im
 * SELBEN Vorgang mit. Im Journal stehen weiter absolute, stimmige Höhen — jeder
 * Leser (Raum, Griffe, Ableitungen, Paket, ein älterer Client) sieht dasselbe,
 * ohne aufzulösen; ein Rückgängig nimmt beides zurück.
 *
 * Ändert ein Kommando die Höhe eines abhängigen Teils SELBST (Stützpunkt gezogen),
 * fällt sein Verweis weg — wie ein gezogener Randpunkt seinen Geländeverweis
 * verliert (Teil XXIII, A7d): absolut ist, was jemand ausdrücklich gesetzt hat.
 *
 * Rein: kein Store, keine Engine.
 */

const TOLERANZ_M = 0.0005;

/** Die Höhe, auf die ein Verweis zeigt — oder null (Bezug fehlt, kein Körper). */
export function hoeheAus(hv, erzeugt, rezeptNach) {
    const ref = hv?.bauteil ? erzeugt.get(hv.bauteil) : null;
    if (!ref) return null;
    const r = rezeptNach(ref.rezept);
    const unten = hv.mass === 'unterkante';
    // Exakt aus dem Bauplan, wo das Rezept seine Kanten kennt; sonst aus dem Körper.
    let h = r?.stand ? (unten ? r.stand.lies(ref.parameter ?? {}) : r.stand.oberkante?.(ref.parameter ?? {})) : null;
    if (!Number.isFinite(h)) h = r?.formAus?.(ref.parameter ?? {}, 'umriss')?.[unten ? 'unterkante' : 'oberkante'];
    return Number.isFinite(h) ? h + (Number(hv.versatz) || 0) : null;
}

/**
 * @param schritte  was das Kommando schreibt (wird nicht verändert)
 * @returns {{ schritte, folgen }}  die Schritte des Kommandos (ein gebrochener
 *          Verweis ist entfernt) und die Folgeschritte der abhängigen Teile
 */
export function mitFolgen(schritte, { wirksamerStand, rezeptNach }) {
    const erzeugt = new Map(typeof wirksamerStand === 'function' ? wirksamerStand('erzeugt') : []);
    const eigene = new Set();
    const aus = schritte.map((s) => {
        if (s?.art !== 'erzeugt') return s;
        eigene.add(s.globalId);
        if (!s.nachher) { erzeugt.delete(s.globalId); return s; }
        erzeugt.set(s.globalId, s.nachher);
        return s;
    });
    // GEBROCHENE VERWEISE: das Kommando setzt die Höhe eines abhängigen Teils
    // anders, als sein Bezug sie sagt — dann gilt die gesetzte.
    for (let i = 0; i < aus.length; i++) {
        const s = aus[i];
        const hv = s?.art === 'erzeugt' ? s.nachher?.parameter?.hoeheVon : null;
        if (!hv || eigene.has(hv.bauteil)) continue;
        const soll = hoeheAus(hv, erzeugt, rezeptNach);
        const ist = rezeptNach(s.nachher.rezept)?.stand?.lies(s.nachher.parameter);
        if (soll === null || ist === null || Math.abs(soll - ist) <= TOLERANZ_M) continue;
        const { hoeheVon: _weg, ...rest } = s.nachher.parameter;
        aus[i] = { ...s, nachher: { ...s.nachher, parameter: rest } };
        erzeugt.set(s.globalId, aus[i].nachher);
    }
    const folgen = [];
    let welle = [...eigene];
    for (let tiefe = 0; welle.length && tiefe < 16; tiefe++) {
        const naechste = [];
        for (const [gid, plan] of erzeugt) {
            const hv = plan?.parameter?.hoeheVon;
            if (!hv || !welle.includes(hv.bauteil) || eigene.has(gid)) continue;
            const stand = rezeptNach(plan.rezept)?.stand;
            const soll = hoeheAus(hv, erzeugt, rezeptNach);
            if (!stand || soll === null) continue;
            const ist = stand.lies(plan.parameter);
            if (ist !== null && Math.abs(soll - ist) <= TOLERANZ_M) continue;
            const nachher = { ...plan, parameter: stand.stelle(plan.parameter, soll) };
            erzeugt.set(gid, nachher);
            const schritt = { art: 'erzeugt', globalId: gid, modell: 'cde', nachher };
            const k = folgen.findIndex(f => f.globalId === gid);
            if (k >= 0) folgen[k] = schritt; else folgen.push(schritt);
            naechste.push(gid);
        }
        welle = naechste;
    }
    return { schritte: aus, folgen };
}
