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

/**
 * Meinen zwei Registerdokumente DASSELBE Fachmodell? — Spiegel von
 * `cde._gleiche_linie` auf dem Server, paarweise: die IFCPROJECT-GlobalId
 * entscheidet, wenn BEIDE eine tragen; sonst Stamm und Art (den Stamm rechnet
 * der Server seit Stufe 4 aus dem Dateinamen und liefert ihn so aus).
 *
 * Bis 2026-09-10 ein Schlüssel „GlobalId, sonst Stamm|Art" — damit bekamen R01
 * (vor Stufe 4 registriert, ohne GlobalId) und R02 (mit) verschiedene Linien,
 * und kein Revisionswechsel wurde erkannt.
 */
export function gleicheLinie(a, b) {
    const ga = a?.projectGlobalId || a?.projekt_global_id;
    const gb = b?.projectGlobalId || b?.projekt_global_id;
    if (ga && gb) return ga === gb;
    return (a?.basisname ?? '') === (b?.basisname ?? '') && (a?.art ?? '') === (b?.art ?? '');
}

/**
 * Welche Quellen eines ERZEUGTEN Dokuments haben inzwischen eine neuere
 * Revision im Register? (Stufe 4.) Ein Erdbau aus Gelände R01, während R02 da
 * ist, zeigt den Aushub am alten Gelände — „neu erzeugen" ist dann der Rat.
 * Erzeugte Dokumente zählen als „neuer" nicht mit: nur Lieferungen.
 *
 * @returns {Array<{quelle: string, neu: string, revision: number}>}
 */
/**
 * Ein ABGABE-CONTAINER (E1, Fahrplan Erdbau-Container): der Verbund — Prüfbericht
 * und Herkunft, aus den Quellen jederzeit neu baubar. Er gehört in keinen Satz
 * (Server: `cde._satz_pruefen`). Ein Erdbau-Dokument IST ein Fachmodell.
 */
export function istAbgabeContainer(dok) {
    return dok?.herkunft?.art === 'verbund';
}

/**
 * Das Register in zwei Abschnitten (T3): was geliefert wurde, und was die CDE
 * erzeugt hat. Bis 2026-09-11 stand ein Verbund zwischen den Lieferungen wie
 * eine von ihnen — nur der Chip unterschied ihn. Die Reihenfolge bleibt.
 *
 * @returns {{lieferungen: object[], erzeugte: object[]}}
 */
export function teileRegister(dokumente) {
    const lieferungen = [];
    const erzeugte = [];
    for (const d of dokumente ?? []) (d?.herkunft?.art ? erzeugte : lieferungen).push(d);
    return { lieferungen, erzeugte };
}

/**
 * Steht vor dieser Revision KEINE frühere derselben Linie im Register? (T4) Der
 * Server zählt die Revision über die Geschwister beim Hochladen; wird R01 danach
 * gelöscht, steht R02 allein da — im Projekt 1337 TEST-ERDKOERPER_R02. Das
 * gehört gesagt, nicht erraten.
 */
export function fruehereRevisionFehlt(dok, alle) {
    const rev = Number(dok?.revision ?? 1);
    if (!(rev > 1)) return false;
    return !(alle ?? []).some(x => x?.sha256 !== dok.sha256 && gleicheLinie(x, dok) && Number(x.revision ?? 0) < rev);
}

/**
 * Lässt sich dieses Erdbau-Dokument JETZT neu erzeugen? (Fahrplan Erdbau-Container,
 * Stufe 6, G5) — und wenn nicht, welcher Schritt vorher fehlt. Die Reihenfolge ist
 * die, in der der Server scheitern würde (`verbund_lauf._auftrag_erdbau`): der
 * Satz des Auftrags, die geladene Revision seiner Quellen, ein Journal, das an
 * Kennungen der alten Revision hängt.
 *
 * @param {object}   o
 * @param {object}   o.dok            Registerzeile des Erdbau-Dokuments
 * @param {object[]} o.alle           das Register
 * @param {string}   o.aktiverSatzId
 * @param {string[]} o.geladen        sha256 der geladenen Dateien
 * @param {string[]} o.fehlend        GlobalIds, die das Journal nennt und kein geladenes Modell führt
 * @returns {{ok: boolean, grund: string, handlung: 'satz'|'laden'|'rebase'|null, ziel?: string}}
 */
export function regenerierbar({ dok, alle = [], aktiverSatzId = null, geladen = [], fehlend = [] } = {}) {
    const h = dok?.herkunft;
    if (h?.art !== 'erdbau') return { ok: false, grund: 'kein Erdbau-Dokument', handlung: null };
    if (h.satz_id && h.satz_id !== aktiverSatzId) {
        return { ok: false, handlung: 'satz', ziel: h.satz_id,
                 grund: `erst den Satz „${h.satz_name ?? h.satz_id}“ aktivieren — aus ihm entstand das Dokument` };
    }
    const veraltet = quellenVeraltet(dok, alle);
    const geladenSet = new Set(geladen ?? []);
    for (const v of veraltet) {
        const neuer = (alle ?? []).find(x => (x.name ?? x.datei) === v.neu);
        if (neuer && !geladenSet.has(neuer.sha256)) {
            return { ok: false, handlung: 'laden', ziel: neuer.sha256,
                     grund: `${v.neu} zuerst laden — daraus entsteht die neue Revision` };
        }
    }
    const wirte = new Set((h.quellen ?? []).flatMap(q => q?.globalIds ?? []));
    const haengt = (fehlend ?? []).filter(g => wirte.has(g));
    if (haengt.length) {
        return { ok: false, handlung: 'rebase',
                 grund: `das Journal hängt an ${haengt.length} Kennung${haengt.length === 1 ? '' : 'en'} der alten Revision — erst im Reiter Änderungen umhängen` };
    }
    return { ok: true, handlung: null,
             grund: veraltet.length ? `neu erzeugen aus ${veraltet.map(v => v.neu).join(', ')}`
                                    : 'neu erzeugen — derselbe Satz, der heutige Journalstand' };
}

export function quellenVeraltet(dok, alle) {
    const quellen = dok?.herkunft?.quellen ?? [];
    if (!quellen.length) return [];
    const liste = alle ?? [];
    const aus = [];
    for (const q of quellen) {
        const quell = liste.find(x => x.sha256 === q.sha256);
        if (!quell) continue;                                   // nicht mehr im Register — nichts zu vergleichen
        const rev = Number(quell.revision ?? q.revision ?? 0);
        const neuer = liste
            .filter(x => x.sha256 !== quell.sha256 && !x.herkunft?.art && gleicheLinie(x, quell) && Number(x.revision ?? 0) > rev)
            .sort((a, b) => Number(b.revision ?? 0) - Number(a.revision ?? 0))[0];
        if (neuer) aus.push({ quelle: quell.name ?? quell.datei, neu: neuer.name ?? neuer.datei, revision: Number(neuer.revision) });
    }
    return aus;
}
