/**
 * Das Journal von einer Revision auf die nächste UMHÄNGEN — der reine Plan
 * (Stufe 5 des Aushub-Fachmodells, 2026-09-10). Muster `JournalVersatz`:
 * hier wird nichts geändert, nur beschrieben, was zu schreiben ist.
 *
 * JE WIRKSAMEM EINTRAG auf einer alten Kennung zwei Schritte: derselbe Wert
 * auf der NEUEN (bei `lage` mit der Basis, die das Bauteil in der neuen
 * Revision hat — dann bleibt der Drei-Wege-Vergleich ehrlich) und der
 * Gegeneintrag `nachher: null` auf der alten. Kein Eintrag wird umgeschrieben
 * (Journal-Gesetz): das Umhängen ist ein Vorgang wie jeder andere und mit
 * einem Klick revertierbar.
 *
 * EIGENE BAUTEILE (`erzeugt`) behalten ihre CDE-Kennung — der Aushub bleibt
 * derselbe Aushub, seine Export-GUID eine Revision, kein Fremdling. Nur ihre
 * QUELLEN wandern (`parameter.quellen`, samt Prüfmass in `quellBasis`), und
 * zwar in JEDEM Teil einer Klammer gleich — eine Klammer, ein Parametersatz.
 *
 * Wiederholbar: nach dem Umhängen nennt nichts mehr die alte Kennung, ein
 * zweiter Plan hat null Schritte.
 */

/**
 * @param {object} o
 * @param {Object<string, Map>} o.staende  je Art der wirksame Stand EINER Ebene (globalId → Wert)
 * @param {Map<string, string>} o.abbildung  alt → neu, BESTÄTIGT
 * @param {Map<string, object>} [o.basisIst]  neu → Lieferstand in der neuen Revision (für `lage`)
 * @param {Map<string, object>} [o.quellmasse] neu → Prüfmass der neuen Quelle
 * @param {Map<string, {alt: string, neu: string}>} [o.namen]  neu → der Name der alten und der
 *        neuen Quelle (Teil XXIII, A7): ein Vorgang, der nach seiner Quelle heisst
 *        („Urgelände R01 · Ausheben"), heisst danach nach der neuen
 * @returns {{schritte: Array, unaufgeloest: Array}}
 */
export function planeRebase({ staende = {}, abbildung, basisIst = new Map(), quellmasse = new Map(), namen = new Map() } = {}) {
    const abb = abbildung instanceof Map ? abbildung : new Map(Object.entries(abbildung ?? {}));
    const schritte = [];
    const unaufgeloest = [];
    if (!abb.size) return { schritte, unaufgeloest };
    for (const [art, stand] of Object.entries(staende ?? {})) {
        if (!(stand instanceof Map)) continue;
        if (art === 'erzeugt') {
            for (const [gid, plan] of stand) {
                const neu = _umgehaengt(plan, abb, quellmasse, namen);
                if (neu) schritte.push({ art, globalId: gid, nachher: neu, modell: 'cde' });
            }
            continue;
        }
        for (const [alt, wert] of stand) {
            const neu = abb.get(alt);
            if (!neu || neu === alt) continue;
            // Trägt die NEUE Kennung schon einen eigenen Wert dieser Art, wird
            // er nicht überschrieben — das ist eine Frage an den Planer.
            if (stand.has(neu)) { unaufgeloest.push({ art, alt, neu, grund: 'ziel_hat_eigenen_wert' }); continue; }
            schritte.push({ art, globalId: neu, nachher: wert, ...(basisIst.has(neu) ? { basis: basisIst.get(neu) } : {}) });
            schritte.push({ art, globalId: alt, nachher: null });
        }
    }
    return { schritte, unaufgeloest };
}

/**
 * Einen Namen umschreiben, der mit dem Namen der alten Quelle BEGINNT — nur
 * dann: ein eigener Name des Planers („Grube Ost") bleibt, wie er ist.
 */
function _umbenannt(name, umbenennen) {
    if (typeof name !== 'string') return name;
    for (const { alt, neu } of umbenennen) {
        if (alt && neu && alt !== neu && (name === alt || name.startsWith(`${alt} `))) return neu + name.slice(alt.length);
    }
    return name;
}

/** Ein Bauplan mit umgehängten Quellen — oder null, wenn er keine alte Kennung nennt. */
function _umgehaengt(plan, abb, quellmasse, namen = new Map()) {
    const p = plan?.parameter;
    if (!p || typeof p !== 'object') return null;
    let geaendert = false;
    const quellen = { ...(p.quellen ?? {}) };
    const quellBasis = { ...(p.quellBasis ?? {}) };
    for (const [schlitz, roh] of Object.entries(quellen)) {
        if (Array.isArray(roh)) {
            const liste = roh.map(g => abb.get(g) ?? g);
            if (!liste.some((g, i) => g !== roh[i])) continue;
            geaendert = true;
            quellen[schlitz] = liste;
            if (Array.isArray(quellBasis[schlitz])) {
                quellBasis[schlitz] = quellBasis[schlitz].map((m, i) => (liste[i] !== roh[i] ? (quellmasse.get(liste[i]) ?? m) : m));
            }
        } else if (typeof roh === 'string' && abb.has(roh)) {
            geaendert = true;
            quellen[schlitz] = abb.get(roh);
            quellBasis[schlitz] = quellmasse.get(abb.get(roh)) ?? quellBasis[schlitz] ?? null;
        }
    }
    const quelle = typeof p.quelle === 'string' && abb.has(p.quelle) ? abb.get(p.quelle) : p.quelle;
    if (quelle !== p.quelle) geaendert = true;              // Altbestand `gelaende`: `{quelle, operationen}`
    if (!geaendert) return null;
    // DER NAME ZIEHT MIT (Teil XXIII, A7): ein Vorgang, der nach seiner Quelle
    // heisst, heisst nach dem Umhängen nach der NEUEN — auch die Titel der
    // Vorgänge, die die Anzeige führt.
    const neueKennungen = [...Object.values(quellen).flat(), quelle].filter(g => typeof g === 'string');
    const umbenennen = neueKennungen.map(g => namen.get(g)).filter(Boolean);
    const vorgaenge = Array.isArray(p.vorgaenge) && umbenennen.length
        ? p.vorgaenge.map(v => ({ ...v, titel: _umbenannt(v?.titel, umbenennen) })) : p.vorgaenge;
    return {
        ...plan,
        ...(umbenennen.length ? { name: _umbenannt(plan.name, umbenennen) } : {}),
        parameter: {
            ...p,
            ...(p.quellen ? { quellen } : {}),
            ...(p.quellBasis ? { quellBasis } : {}),
            ...(p.quelle !== undefined ? { quelle } : {}),
            ...(p.vorgaenge !== undefined ? { vorgaenge } : {}),
        },
    };
}
