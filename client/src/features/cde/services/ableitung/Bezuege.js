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

/**
 * Das UR-GELÄNDE hinter einer Quelle (Stufe 1, Aushub-Fachmodell).
 *
 * Eine Quelle ist entweder ein GELIEFERTES Gelände — dann ist sie selbst das
 * Ur-Gelände — oder eine ANZEIGEFORM der CDE (Rolle `anzeige`, oder aus der
 * Zeit vor Stufe 1 der `dgm`-Teil einer Ableitung). Dann geht es an deren
 * Quelle weiter, bis ein geliefertes Gelände erreicht ist. Deckel 16: Zyklen
 * schliesst das Journal aus (`pruefeBezuege`), aber ein Deckel kostet nichts.
 *
 * Der Grund, warum es diese Funktion gibt: jeder Erdbau-Vorgang fusst auf dem
 * gelieferten Gelände, nie auf einer Anzeigeform. Alt-Journale ketten sich
 * dagegen von DGM zu DGM — sie werden über diese Rückverfolgung in denselben
 * Stapel eingeordnet, ohne dass jemand sie umschreiben muss.
 *
 * @param {Map} stand        erzeugt-Stand (globalId → Bauplan)
 * @param {string} gid
 * @param {{rezeptNach: Function}} opts  — ob ein `dgm`-Teil zu einer Ableitung gehört, sagt das Rezept
 * @returns {string} die Kennung des Ur-Geländes (im Zweifel die übergebene)
 */
export function urGelaendeVon(stand, gid, { rezeptNach = null } = {}) {
    return _kette(stand, gid, rezeptNach).ur;
}

/**
 * Wie viele Anzeigeformen zwischen einer Quelle und ihrem Ur-Gelände liegen —
 * die KETTENTIEFE. Für Alt-Journale ist sie die Reihenfolge: ein Vorgang auf
 * dem DGM eines anderen kam NACH ihm, egal, wo er im Stand steht.
 */
export function kettentiefe(stand, gid, { rezeptNach = null } = {}) {
    return _kette(stand, gid, rezeptNach).tiefe;
}

function _kette(stand, gid, rezeptNach) {
    let g = gid;
    let tiefe = 0;
    for (; g && tiefe < 16; tiefe++) {
        const plan = stand?.get?.(g);
        if (!plan) break;
        const istAnzeige = plan.rolle === 'anzeige'
            || (plan.rolle === 'dgm' && typeof rezeptNach?.(plan.rezept)?.leite === 'function')
            || plan.rezept === 'gelaende';                 // Altbestand vor Teil XIV: `{quelle, operationen}`
        if (!istAnzeige) break;
        const weiter = plan.parameter?.quellen?.gelaende ?? plan.parameter?.quelle ?? null;
        if (!weiter) break;
        g = weiter;
    }
    return { ur: g, tiefe };
}

/**
 * Der Titel eines Erdbau-Vorgangs — aus dem Namen seines ersten Teils, ohne
 * den Rollen-Anhang, plus Rezepttitel: „Urgelände · Gelände formen",
 * „H-001 · Strang · Kanalgraben". Er wird EINMAL beim Anlegen in die
 * `vorgaenge`-Liste der Anzeige geschrieben (eine Entscheidung); für
 * Alt-Journale ohne Anzeige rechnet ihn diese Funktion nach.
 */
export function vorgangstitel(plan, rezept = null) {
    const basis = String(plan?.name ?? '')
        .replace(/ · (Aushub|Auftrag|Graben|Verfüllung|Baugrube)$/, '')
        .replace(/ \((geformt|mit Graben|mit Baugrube|Anzeige)\)$/, '');
    const art = rezept?.titel ?? String(plan?.rezept ?? 'Vorgang');
    return basis ? `${basis} · ${art}` : art;
}

/**
 * DER ERDBAU-STAPEL eines Ur-Geländes — die EINE Ordnungsregel (Stufe 1).
 *
 * Der Ableitungslauf faltet danach, die Bearbeitung hängt danach an, der
 * Mengenreiter zählt danach. Zwei Stellen mit je eigener Reihenfolge hätten
 * irgendwann zwei verschiedene Gesamtmassen geliefert.
 *
 * Regel: zuerst, was die Anzeige-Ableitung in `vorgaenge` geordnet hat (die
 * Entscheidung des Planers), dann der Rest nach KETTENTIEFE (ein Vorgang auf
 * dem DGM eines anderen kam nach ihm) und bei gleicher Tiefe in Stand-
 * Reihenfolge (= Reihenfolge des Anlegens). Alt-Journale, deren Vorgänge sich
 * von DGM zu DGM ketten, landen über `urGelaendeVon` im selben Stapel; ihre
 * `dgm`-Teile stehen in `altDgm`, damit die Bearbeitung sie beim ersten
 * Anfassen verbergen kann — die Anzeige übernimmt dann.
 *
 * @returns {{anzeige: {globalId, bauplan}|null,
 *            vorgaenge: Array<{ableitung, art, titel, bauplan}>,
 *            altDgm: string[]}}
 */
export function erdbauStapelVon(stand, urGid, { rezeptNach = null } = {}) {
    const out = { anzeige: null, vorgaenge: [], altDgm: [] };
    if (!urGid || !stand?.[Symbol.iterator]) return out;
    const gefunden = new Map();                                   // ableitung → Vorgang
    for (const [gid, plan] of stand) {
        if (!plan?.ableitung) continue;
        const rz = rezeptNach?.(plan.rezept) ?? null;
        const q = plan.parameter?.quellen?.gelaende ?? plan.parameter?.quelle ?? null;
        if (rz?.id === 'anzeige') {
            if (q === urGid && !out.anzeige) out.anzeige = { globalId: gid, bauplan: plan };
            continue;
        }
        if (!rz?.erdbau || !q) continue;
        const { ur, tiefe } = _kette(stand, q, rezeptNach);
        if (ur !== urGid) continue;
        if (plan.rolle === 'dgm') out.altDgm.push(gid);
        if (!gefunden.has(plan.ableitung)) {
            gefunden.set(plan.ableitung, { ableitung: plan.ableitung, art: plan.rezept, titel: vorgangstitel(plan, rz), bauplan: plan, tiefe, reihe: gefunden.size });
        }
    }
    const drin = (id) => out.vorgaenge.some(v => v.ableitung === id);
    for (const v of out.anzeige?.bauplan?.parameter?.vorgaenge ?? []) {
        const id = typeof v === 'string' ? v : v?.ableitung;
        const g = id ? gefunden.get(id) : null;
        if (g && !drin(id)) out.vorgaenge.push(v?.titel ? { ...g, titel: v.titel } : g);
    }
    const rest = [...gefunden.values()].filter(g => !drin(g.ableitung))
        .sort((a, b) => (a.tiefe - b.tiefe) || (a.reihe - b.reihe));
    for (const { tiefe, reihe, ...g } of rest) out.vorgaenge.push(g);
    return out;
}
