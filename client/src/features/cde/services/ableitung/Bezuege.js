/**
 * Bezüge zwischen Bauplänen (Teil XIV, G2/G4) — rein.
 *
 * Eine Ableitung nennt ihre Quellen im Bauplan (`parameter.quellen`). Daraus
 * folgt alles, was hier steht, OHNE gespeicherten Graphen (Gesetz 5):
 *   - `pruefeBezuege`: die eine Zeile beim Eintragen, die Zyklen und
 *     Ebenenfehler verhindert, bevor sie im Journal stehen.
 *   - `abhaengige`: der Rückwärtsindex „wer hängt an A?" — für Verlauf,
 *     Löschen-Sperre und die Meldung beim Nachspielen. Abgeleitet je Aufruf.
 */

/** Quellen eines Bauplans — liest auch die Altform `{quelle}` des gelaende-Rezepts. */
export function quellenVon(parameter) {
    if (parameter?.quellen && typeof parameter.quellen === 'object') return { ...parameter.quellen };
    if (typeof parameter?.quelle === 'string') return { gelaende: parameter.quelle };
    return {};
}

/**
 * Alle Quell-GlobalIds FLACH — ein Schlitz darf seit B3 eine LISTE tragen
 * (Strang-Kanalgraben: `rohre: [...]`, `schaechte: [...]`). Wer über die
 * Quellen läuft, läuft hierüber; sonst verlöre der Rückwärtsindex den
 * zweiten Schacht.
 */
export function quellenFlach(parameter) {
    const out = [];
    for (const q of Object.values(quellenVon(parameter))) {
        for (const gid of (Array.isArray(q) ? q : [q])) if (gid) out.push(gid);
    }
    return out;
}

/**
 * Hängt `von` (transitiv) an `ziel`?  — DFS über den Stand.
 * @param {Map<string, object>} stand  globalId → Bauplan
 */
export function haengtAn(stand, von, ziel, gesehen = new Set()) {
    if (von === ziel) return true;
    if (gesehen.has(von)) return false;
    gesehen.add(von);
    const plan = stand.get(von);
    if (!plan) return false;
    return quellenFlach(plan.parameter).some(q => haengtAn(stand, q, ziel, gesehen));
}

const EBENEN_RANG = { auftrag: 0, stand: 1 };

/**
 * @param {object} opts
 * @param {Record<string, string>} opts.quellen   Schlitz → GlobalId der Quelle
 * @param {string} opts.globalId                  das Bauteil, das entsteht (oder erneuert wird)
 * @param {Map<string, object>} opts.stand        wirksamer erzeugt-Stand
 * @param {(gid: string) => string|null} [opts.ebeneVon]  'auftrag'|'stand' der Quelle (CDE-Objekte)
 * @param {string} [opts.zielEbene]               Ebene, in die geschrieben wird
 * @returns {string[]} leer = in Ordnung
 */
export function pruefeBezuege({ quellen = {}, globalId, stand = new Map(), ebeneVon = null, zielEbene = 'stand' } = {}) {
    const fehler = [];
    const paare = [];
    for (const [schlitz, q] of Object.entries(quellen)) {
        if (Array.isArray(q)) {
            if (!q.length) { fehler.push(`Quelle „${schlitz}" fehlt`); continue; }
            for (const gid of q) paare.push([schlitz, gid]);
        } else paare.push([schlitz, q]);
    }
    for (const [schlitz, gid] of paare) {
        if (!gid) { fehler.push(`Quelle „${schlitz}" fehlt`); continue; }
        if (gid === globalId) { fehler.push(`„${schlitz}" zeigt auf das Bauteil selbst`); continue; }
        if (!stand.has(gid)) continue;                 // geliefert — die Existenz prüft das Nachspielen
        if (haengtAn(stand, gid, globalId)) {
            fehler.push(`Zyklus: „${schlitz}" (${gid}) hängt bereits an ${globalId}`);
        }
        const e = ebeneVon?.(gid) ?? null;
        if (e && (EBENEN_RANG[e] ?? 0) > (EBENEN_RANG[zielEbene] ?? 0)) {
            fehler.push(`„${schlitz}" liegt im Modellsatz — eine Auftragskorrektur darf nicht darauf zeigen`);
        }
    }
    return fehler;
}

/** Rückwärtsindex: Quelle → Menge der Bauteile, die daran hängen (direkt). */
export function abhaengige(stand = new Map()) {
    const karte = new Map();
    for (const [gid, plan] of stand) {
        for (const q of quellenFlach(plan?.parameter)) {
            if (!karte.has(q)) karte.set(q, new Set());
            karte.get(q).add(gid);
        }
    }
    return karte;
}
